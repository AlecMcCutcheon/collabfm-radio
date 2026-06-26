import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { MAIN_STATION_ID } from "../radio/pcmRelayProtocol.js";

export const VOICE_STATION_SELECT_PREFIX = "voice-station:";

export function voiceStationSelectCustomId(guildId, sessionId) {
  return `${VOICE_STATION_SELECT_PREFIX}${guildId}:${sessionId}`;
}

export function parseVoiceStationSelectCustomId(customId) {
  if (!customId?.startsWith(VOICE_STATION_SELECT_PREFIX)) return null;
  const rest = customId.slice(VOICE_STATION_SELECT_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const guildId = rest.slice(0, colon);
  const sessionId = rest.slice(colon + 1);
  if (!guildId || !sessionId) return null;
  return { guildId, sessionId };
}

function stationSelectOptions(stationsPayload) {
  const options = [
    {
      label: "Main station (live DJ)",
      value: MAIN_STATION_ID,
    },
  ];

  for (const station of stationsPayload?.stations || []) {
    const label = station.isLive
      ? `${station.displayName} (live now)`
      : String(station.displayName || "DJ");
    options.push({
      label: label.slice(0, 100),
      value: station.wsId,
    });
  }

  return options.slice(0, 25);
}

export function currentStationSelectValue(entry) {
  if (entry?.stationMode === "dj" && entry.stationRailId) {
    return entry.stationRailId;
  }
  return MAIN_STATION_ID;
}

export function voiceStationMenuKey(stationsPayload, entry) {
  const ids = (stationsPayload?.stations || []).map((station) => station.wsId).sort().join(",");
  return `${currentStationSelectValue(entry)}\0${ids}`;
}

export function buildVoiceStationSelectRow({ guildId, sessionId, stationsPayload, entry }) {
  const options = stationSelectOptions(stationsPayload);
  const selected = currentStationSelectValue(entry);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(voiceStationSelectCustomId(guildId, sessionId))
    .setPlaceholder("📻  Switch station")
    .addOptions(
      options.map((option) => ({
        label: option.label,
        value: option.value,
        default: option.value === selected,
      })),
    );

  return new ActionRowBuilder().addComponents(menu);
}
