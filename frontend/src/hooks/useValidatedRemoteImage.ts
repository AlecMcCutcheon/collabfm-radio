import { useEffect, useState } from "react";
import {
  cacheBustImageUrl,
  probeRemoteImage,
  REMOTE_IMAGE_RETRY_DELAY_MS,
} from "../utils/brandingImage";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export interface ValidatedRemoteImageState {
  /** Procedural (or other) placeholder — always shown as the base layer. */
  placeholderSrc: string;
  /** Remote cover URL once validated; null while probing or if unavailable. */
  remoteSrc: string | null;
}

/**
 * Keeps procedural placeholder visible while probing a remote cover off-screen.
 * Updates remoteSrc when the first or delayed retry succeeds.
 */
export function useValidatedRemoteImage(
  remoteUrl: string | null | undefined,
  fallbackSrc: string,
): ValidatedRemoteImageState {
  const [remoteSrc, setRemoteSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = remoteUrl?.trim();
    setRemoteSrc(null);

    if (!url || url.startsWith("data:")) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (await probeRemoteImage(url)) {
        if (!cancelled) setRemoteSrc(url);
        return;
      }

      await sleep(REMOTE_IMAGE_RETRY_DELAY_MS);
      if (cancelled) return;

      const retryUrl = cacheBustImageUrl(url);
      if (await probeRemoteImage(retryUrl)) {
        if (!cancelled) setRemoteSrc(retryUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [remoteUrl, fallbackSrc]);

  return { placeholderSrc: fallbackSrc, remoteSrc };
}
