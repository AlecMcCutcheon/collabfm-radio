import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { api } from "../api/client";
import type { ExtensionInstallInfo } from "../types/api";

interface ExtensionInstallButtonsProps {
  publicExtensionDownload?: boolean;
  onZipDownloaded?: () => void;
}

function versionLabel(version: string | null | undefined) {
  const value = String(version || "").trim();
  return value ? `v${value}` : null;
}

function versionComparisonHint(info: ExtensionInstallInfo | null) {
  if (!info) return null;
  switch (info.versionComparison) {
    case "bundled_newer":
      return "This server's ZIP is newer than the Chrome Web Store — use the ZIP for the latest build.";
    case "store_newer":
      return "Chrome Web Store has a newer version — update from the store or pull a newer server image.";
    case "match":
      return "ZIP and Chrome Web Store versions match.";
    default:
      return null;
  }
}

export function ExtensionInstallButtons({
  publicExtensionDownload = false,
  onZipDownloaded,
}: ExtensionInstallButtonsProps) {
  const [info, setInfo] = useState<ExtensionInstallInfo | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .getExtensionInstallInfo()
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadZip = () => {
    if (zipBusy) return;
    setZipBusy(true);
    const download = publicExtensionDownload
      ? api.downloadExtensionZipPublic()
      : api.downloadExtensionZip();
    void download
      .then(() => onZipDownloaded?.())
      .catch(() => {
        window.alert("Extension download failed. Try again or ask the host for the ZIP.");
      })
      .finally(() => setZipBusy(false));
  };

  const hint = versionComparisonHint(info);
  const bundledLabel = versionLabel(info?.bundledVersion);
  const storeLabel = versionLabel(info?.webStoreVersion);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={downloadZip}
          disabled={zipBusy}
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-600 bg-gray-900/60 hover:border-radio-accent hover:bg-gray-900 transition-all px-3 py-3 disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-radio-accent" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Download ZIP</span>
          <span className="text-[11px] text-gray-500">
            {bundledLabel || "Server build"}
          </span>
        </button>

        <a
          href={info?.webStoreUrl || "https://chromewebstore.google.com/detail/collabfm-broadcaster/nnalcbfijmoobcgejgnbmdimnekedpba"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-600 bg-gray-900/60 hover:border-radio-accent hover:bg-gray-900 transition-all px-3 py-3 text-center"
        >
          <ExternalLink className="w-4 h-4 text-radio-accent" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Chrome Web Store</span>
          <span className="text-[11px] text-gray-500">
            {storeLabel || (info?.webStoreError ? "Version unavailable" : "Loading…")}
          </span>
        </a>
      </div>

      {hint ? (
        <p
          className={`text-[11px] leading-snug ${
            info?.versionComparison === "match" ? "text-gray-500" : "text-amber-400/90"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
