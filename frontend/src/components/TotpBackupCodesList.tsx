import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface TotpBackupCodesListProps {
  codes: string[];
  onCopied?: () => void;
}

export function TotpBackupCodesList({ codes, onCopied }: TotpBackupCodesListProps) {
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    void navigator.clipboard.writeText(codes.join("\r\n")).then(
      () => {
        setCopied(true);
        onCopied?.();
        window.setTimeout(() => setCopied(false), 2500);
      },
      () => {},
    );
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-600 bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-700/80 px-3 py-2">
        <span className="text-xs font-medium text-gray-400">
          {codes.length} one-time {codes.length === 1 ? "code" : "codes"}
        </span>
        <button
          type="button"
          onClick={copyAll}
          aria-label={copied ? "Copied backup codes" : "Copy backup codes"}
          title={copied ? "Copied!" : "Copy all codes"}
          className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-400 hover:text-radio-accent hover:bg-gray-800 transition"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <ul className="p-4 grid grid-cols-2 gap-2 font-mono text-sm text-gray-200">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}
