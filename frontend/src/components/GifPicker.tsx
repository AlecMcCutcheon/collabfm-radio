import { Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { GifResult } from "../types/api";

interface GifPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
  shareToken?: string;
}

export function GifPicker({ open, onClose, onSelect, shareToken }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
    setLoading(true);
    void api
      .giphyTrending(0, shareToken)
      .then((data) => setResults(data.results ?? []))
      .catch((err) => {
        setResults([]);
        setError(err instanceof Error ? err.message : "GIF search unavailable");
      })
      .finally(() => setLoading(false));
  }, [open, shareToken]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.giphySearch(q, 0, shareToken);
      setResults(data.results ?? []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-20">
      <div className="rounded-xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-2 border-b border-gray-700">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            placeholder="Search GIFs…"
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-radio-accent"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={loading || !query.trim()}
            className={chatIconBtn}
            title="Search GIFs"
          >
            <Search className="w-4 h-4" />
          </button>
          <button type="button" onClick={onClose} className={chatIconBtn} title="Close GIF picker">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <p className="px-3 py-2 text-xs text-red-400 border-b border-gray-800">{error}</p>
        )}

        <div className="max-h-52 overflow-y-auto p-2 grid grid-cols-3 gap-1.5 scrollbar-thin scrollbar-thumb-gray-600">
          {loading && (
            <div className="col-span-3 py-8 flex justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {!loading &&
            results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                title={gif.title || "GIF"}
                onClick={() => {
                  onSelect(gif);
                  onClose();
                }}
                className="aspect-square rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-radio-accent transition-all"
              >
                <img
                  src={gif.previewUrl || gif.url}
                  alt={gif.title || "GIF"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          {!loading && !error && results.length === 0 && (
            <p className="col-span-3 text-center text-xs text-gray-500 py-6">No GIFs found</p>
          )}
        </div>

        <p className="px-2 py-1.5 text-[10px] text-gray-500 text-center border-t border-gray-800">
          Powered by GIPHY
        </p>
      </div>
    </div>
  );
}

const chatIconBtn =
  "inline-flex items-center justify-center shrink-0 p-1 text-gray-400 hover:text-radio-accent transition-colors";
