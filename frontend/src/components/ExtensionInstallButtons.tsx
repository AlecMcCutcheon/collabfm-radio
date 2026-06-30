import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { api } from "../api/client";
import type { ExtensionInstallInfo } from "../types/api";

interface ExtensionInstallButtonsProps {
  open?: boolean;
  publicExtensionDownload?: boolean;
  onZipDownloaded?: () => void;
}

function versionLabel(version: string | null | undefined) {
  const value = String(version || "").trim();
  return value ? `v${value}` : null;
}

function versionComparisonHint(info: ExtensionInstallInfo | null) {
  if (!info) return null;
  const zip = versionLabel(info.bundledVersion);
  const store = versionLabel(info.webStoreVersion);
  switch (info.versionComparison) {
    case "bundled_newer":
      return zip && store ? `Server ZIP (${zip}) is newer than the Web Store (${store}).` : "Server ZIP is newer than the Web Store.";
    case "store_newer":
      return zip && store ? `Web Store (${store}) is newer than the server ZIP (${zip}).` : "Web Store is newer than the server ZIP.";
    case "match":
      return zip ? `Versions match (${zip}).` : "Versions match.";
    default:
      return null;
  }
}

export function ExtensionInstallButtons({
  open = true,
  publicExtensionDownload = false,
  onZipDownloaded,
}: ExtensionInstallButtonsProps) {
  const [info, setInfo] = useState<ExtensionInstallInfo | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInfo(null);
    void api
      .getExtensionInstallInfo({ refresh: true })
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
