/** Tagged PCM relay wire format (main server → relay-bot). */

export const PCM_FRAME_BYTES = 3840;
export const PCM_RELAY_MSG_PCM = 0x01;
export const PCM_RELAY_MSG_LIVE_RAIL = 0x02;
export const MAIN_STATION_ID = "main";
export const MAX_RAIL_ID_LEN = 128;

export function encodePcmRelayFrame(railId, pcmFrame) {
  const id = String(railId || "");
  const idBuf = Buffer.from(id, "utf8");
  if (idBuf.length > MAX_RAIL_ID_LEN) {
    throw new Error(`railId too long (${idBuf.length})`);
  }
  if (!Buffer.isBuffer(pcmFrame) || pcmFrame.length !== PCM_FRAME_BYTES) {
    throw new Error("invalid PCM frame");
  }
  const header = Buffer.allocUnsafe(3 + idBuf.length);
  header[0] = PCM_RELAY_MSG_PCM;
  header.writeUInt16BE(idBuf.length, 1);
  idBuf.copy(header, 3);
  return Buffer.concat([header, pcmFrame]);
}

export function encodeLiveRailMessage(liveRailId) {
  const id = liveRailId ? String(liveRailId) : "";
  const idBuf = Buffer.from(id, "utf8");
  if (idBuf.length > MAX_RAIL_ID_LEN) {
    throw new Error(`liveRailId too long (${idBuf.length})`);
  }
  const header = Buffer.allocUnsafe(3 + idBuf.length);
  header[0] = PCM_RELAY_MSG_LIVE_RAIL;
  header.writeUInt16BE(idBuf.length, 1);
  if (idBuf.length) idBuf.copy(header, 3);
  return header;
}

export class PcmRelayDecoder {
  constructor(handlers = {}) {
    this.onPcmFrame = typeof handlers.onPcmFrame === "function" ? handlers.onPcmFrame : null;
    this.onLiveRail = typeof handlers.onLiveRail === "function" ? handlers.onLiveRail : null;
    this.remainder = Buffer.alloc(0);
  }

  ingest(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;

    this.remainder = this.remainder.length
      ? Buffer.concat([this.remainder, chunk])
      : chunk;

    let offset = 0;
    while (offset + 3 <= this.remainder.length) {
      const type = this.remainder[offset];
      const railIdLen = this.remainder.readUInt16BE(offset + 1);
      if (railIdLen > MAX_RAIL_ID_LEN) {
        offset += 1;
        continue;
      }

      const headerEnd = offset + 3 + railIdLen;

      if (type === PCM_RELAY_MSG_PCM) {
        const frameEnd = headerEnd + PCM_FRAME_BYTES;
        if (this.remainder.length < frameEnd) break;

        const railId = this.remainder.toString("utf8", offset + 3, headerEnd);
        const frame = this.remainder.subarray(headerEnd, frameEnd);
        try {
          this.onPcmFrame?.(railId, frame);
        } catch {}
        offset = frameEnd;
        continue;
      }

      if (type === PCM_RELAY_MSG_LIVE_RAIL) {
        if (this.remainder.length < headerEnd) break;

        const railId = railIdLen
          ? this.remainder.toString("utf8", offset + 3, headerEnd)
          : null;
        try {
          this.onLiveRail?.(railId);
        } catch {}
        offset = headerEnd;
        continue;
      }

      offset += 1;
    }

    this.remainder = offset ? this.remainder.subarray(offset) : this.remainder;
  }

  reset() {
    this.remainder = Buffer.alloc(0);
  }
}
