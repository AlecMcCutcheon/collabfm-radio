import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const checkboxBoxClass =
  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-600 bg-gray-900 text-transparent transition-colors group-has-[:checked]:border-radio-accent group-has-[:checked]:bg-radio-accent/15 group-has-[:checked]:text-radio-accent group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-radio-accent/40";

const radioRingClass =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-600 bg-gray-900 transition-colors group-has-[:checked]:border-radio-accent group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-radio-accent/40";

export function FormCheckbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`group flex w-full items-start gap-3 cursor-pointer select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={checkboxBoxClass}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
      <span className="min-w-0 text-sm text-gray-200">{label}</span>
    </label>
  );
}

export function FormRadio({
  name,
  value,
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`group flex w-full items-center gap-3 cursor-pointer select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={radioRingClass}>
        <span className="h-2 w-2 rounded-full bg-radio-accent scale-0 transition-transform group-has-[:checked]:scale-100" />
      </span>
      <span className="text-sm text-gray-200">{label}</span>
    </label>
  );
}

export const registrationFieldClass =
  "mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none focus:ring-2 focus:ring-radio-accent/30";

export const registrationSelectTriggerClass =
  "mt-1 w-full rounded-xl border border-gray-600 bg-gray-900/90 px-3 py-2.5 pr-12 text-left text-sm shadow-sm transition-colors hover:border-gray-500 focus:border-radio-accent/60 focus:outline-none focus:ring-2 focus:ring-radio-accent/30 disabled:opacity-50 disabled:cursor-not-allowed";

export interface FormSelectOption {
  value: string;
  label: string;
}

export function FormSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  searchable = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? null;
  const showSearch = searchable && options.length > 15;

  const closeDropdown = (clearSearch = false) => {
    if (clearSearch) setQuery("");
    setOpen(false);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && containerRef.current?.contains(active)) {
        active.blur();
      }
    });
  };

  const selectOption = (optionValue: string) => {
    onChange(optionValue);
    closeDropdown(true);
  };

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(trimmed) ||
        option.value.toLowerCase().includes(trimmed),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) {
      searchRef.current?.focus({ preventScroll: true });
    }
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open, showSearch]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${registrationSelectTriggerClass} relative`}
      >
        <span className={`block truncate pr-1 ${selectedLabel ? "text-white" : "text-gray-500"}`}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown
          className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-600 bg-gray-900 shadow-2xl">
          {showSearch && (
            <div className="border-b border-gray-700/80 p-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none focus:ring-2 focus:ring-radio-accent/30"
              />
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain scrollbar-party py-1"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            ) : (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectOption(option.value)}
                      className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-radio-accent/15 text-radio-accent"
                          : "text-gray-200 hover:bg-gray-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
