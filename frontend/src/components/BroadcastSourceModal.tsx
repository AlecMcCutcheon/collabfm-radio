import { Download, Globe, Mic, X } from "lucide-react";
import { WebBroadcasterControls } from "./WebBroadcasterControls";
import { ExtensionInstallButtons } from "./ExtensionInstallButtons";

interface BroadcastSourceModalProps {
  open: boolean;
  onClose: () => void;
  isLive?: boolean;
  /** Guest broadcasters: use public zip endpoint (no login). */
  publicExtensionDownload?: boolean;
}

export function BroadcastSourceModal({
  open,
  onClose,
  isLive = false,
  publicExtensionDownload = false,
}: BroadcastSourceModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-md border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mic className={`w-5 h-5 ${isLive ? "text-radio-red" : "text-radio-accent"}`} />
            <h3 className="text-lg font-bold text-white">Go live</h3>
            {isLive && (
              <span className="text-[10px] uppercase tracking-wide text-radio-red font-semibold">
                On air
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close (broadcast keeps running)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl border border-gray-600 bg-gray-800/50 p-4 mb-4 space-y-4">
          <div className="flex items-start gap-3">
            <Globe className="w-6 h-6 text-radio-accent shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-white">Web broadcaster</p>
                <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-400/90 border border-amber-500/40 rounded px-1.5 py-0.5">
                  Not recommended
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Share a tab&apos;s audio — no pairing. Chrome mutes captured tab audio locally so you
                can listen on the site or Discord without echo. Lower quality than the extension.
                Close anytime; reopen from the mic to stop.
              </p>
            </div>
          </div>

          <WebBroadcasterControls compact />
        </div>

        <div className="rounded-xl border border-gray-600 bg-gray-800/80 p-4">
          <div className="flex items-start gap-3 mb-4">
            <Download className="w-6 h-6 text-radio-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Browser extension</p>
              <p className="text-sm text-gray-400 mt-1">
                {publicExtensionDownload
                  ? "Best audio — load the ZIP unpacked in Chrome, or install from the Web Store, then choose Guest link and paste your broadcaster share link."
                  : "Best audio and metadata — load the ZIP unpacked or install from the Web Store, then pair once from Studio."}
              </p>
            </div>
          </div>

          <ExtensionInstallButtons
            open={open}
            publicExtensionDownload={publicExtensionDownload}
            onZipDownloaded={onClose}
          />
        </div>
      </div>
    </div>
  );
}
