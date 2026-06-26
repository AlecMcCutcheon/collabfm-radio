function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isDisplayCaptureAvailable(): boolean {
  return !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

/** Why tab/screen capture cannot run in this browser, or null if it should work. */
export function getDisplayCaptureUnsupportedMessage(): string | null {
  if (typeof window === "undefined") return "Not in a browser.";
  if (!window.isSecureContext) {
    return "Tab capture requires HTTPS. Open the site over a secure connection.";
  }
  if (!navigator.mediaDevices) {
    return "Media capture is not available in this browser.";
  }
  if (!isDisplayCaptureAvailable()) {
    if (isMobileUserAgent()) {
      return "This phone browser does not expose tab/screen capture. Android Chrome sometimes supports screen share with audio; iPhone/iPad browsers generally do not. Use a computer or the browser extension to broadcast.";
    }
    return "Tab/screen capture is not supported in this browser. Try Chrome or Edge on desktop.";
  }
  return null;
}

type DisplayCaptureAudioConstraints = MediaTrackConstraints & {
  /** Chrome: mute captured tab audio locally while broadcasting */
  suppressLocalAudioPlayback?: boolean;
};

type DisplayMediaOptions = Omit<DisplayMediaStreamOptions, "audio" | "video"> & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
  video?: boolean | (MediaTrackConstraints & { displaySurface?: string });
  audio?: boolean | DisplayCaptureAudioConstraints;
};

/**
 * Chrome display-media options for tab music capture.
 * Do not pass sampleRate/channelCount/min/exact — those can force a degraded fallback.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
 */
function buildDisplayMediaOptions(): DisplayMediaOptions[] {
  return [
    {
      video: { displaySurface: "browser" },
      audio: { suppressLocalAudioPlayback: true },
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    },
    {
      video: true,
      audio: { suppressLocalAudioPlayback: true },
    },
    {
      video: true,
      audio: true,
    },
  ];
}

export async function requestDisplayAudioStream(): Promise<MediaStream> {
  const unsupported = getDisplayCaptureUnsupportedMessage();
  if (unsupported) {
    throw new Error(unsupported);
  }

  let lastError: unknown;
  for (const constraints of buildDisplayMediaOptions()) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Tab capture was cancelled or failed.");
}
