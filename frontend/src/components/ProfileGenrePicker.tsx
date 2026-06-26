import { useMemo, useState } from "react";
import { MUSIC_GENRES, MAX_PROFILE_GENRES, type MusicGenre } from "../config/musicGenres";

interface ProfileGenrePickerProps {
  selected: MusicGenre[];
  onChange: (genres: MusicGenre[]) => void;
  disabled?: boolean;
}

export function ProfileGenrePicker({ selected, onChange, disabled }: ProfileGenrePickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MUSIC_GENRES;
    return MUSIC_GENRES.filter((genre) => genre.toLowerCase().includes(q));
  }, [query]);

  const toggle = (genre: MusicGenre) => {
    if (disabled) return;
    if (selected.includes(genre)) {
      onChange(selected.filter((g) => g !== genre));
      return;
    }
    if (selected.length >= MAX_PROFILE_GENRES) return;
    onChange([...selected, genre]);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="block text-xs uppercase tracking-wide text-gray-500">
          Top genres
        </label>
        <span className="text-[11px] text-gray-500">
          {selected.length}/{MAX_PROFILE_GENRES}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selected.map((genre) => (
            <button
              key={genre}
              type="button"
              disabled={disabled}
              onClick={() => toggle(genre)}
              className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-600/20 px-2.5 py-1 text-xs text-indigo-100 hover:bg-indigo-600/30 disabled:opacity-50"
            >
              {genre} ×
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search genres…"
        disabled={disabled}
        className="w-full mb-2 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
      />

      <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-700/80 divide-y divide-gray-800/80 scrollbar-party">
        {filtered.map((genre) => {
          const isSelected = selected.includes(genre);
          const atLimit = !isSelected && selected.length >= MAX_PROFILE_GENRES;
          return (
            <button
              key={genre}
              type="button"
              disabled={disabled || atLimit}
              onClick={() => toggle(genre)}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 ${
                isSelected
                  ? "bg-indigo-600/25 text-indigo-100"
                  : "text-gray-100 hover:bg-indigo-600/10"
              }`}
            >
              {genre}
              {isSelected && <span className="text-indigo-300 text-xs">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
