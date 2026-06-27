import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

export const adminControlHeight = "h-10 min-h-10 shrink-0";

export const adminFormControlClass = `${adminControlHeight} w-full rounded-lg border border-gray-600 bg-gray-800 px-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-radio-accent/30 box-border`;

export const adminTextareaClass =
  "w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-radio-accent/30 box-border min-h-[88px] resize-y";

export const adminInputClass = `mt-1.5 ${adminFormControlClass}`;

export const adminSelectClass = adminInputClass;

export const adminInlineRowClass = "flex flex-col sm:flex-row gap-3 sm:items-center";

export const adminListItemClass =
  "rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-3";

export const adminPrimaryBtnClass =
  `${adminControlHeight} inline-flex items-center justify-center rounded-lg bg-radio-accent px-4 text-sm font-medium text-gray-900 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed`;

export function AdminCheckbox({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`inline-flex items-start gap-3 cursor-pointer select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-600 bg-gray-900 text-transparent transition-colors peer-checked:border-radio-accent peer-checked:bg-radio-accent/15 peer-checked:text-radio-accent peer-focus-visible:ring-2 peer-focus-visible:ring-radio-accent/40">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{hint}</span>}
      </span>
    </label>
  );
}

export function AdminSection({ title, description, children, badge }: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6 space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
          {description && <p className="text-sm text-gray-400">{description}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function AdminField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="block text-xs uppercase tracking-wide text-gray-500">{label}</span>
      {hint && <span className="block text-xs text-gray-500 mt-0.5 normal-case tracking-normal">{hint}</span>}
      {children}
    </div>
  );
}

export function AdminInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${adminInputClass} ${props.className ?? ""}`} />;
}

export function AdminSecretInput({
  className = "",
  revealLabel = "Show value",
  hideLabel = "Hide value",
  disabled,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  revealLabel?: string;
  hideLabel?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative mt-1.5">
      <input
        {...props}
        disabled={disabled}
        type={revealed ? "text" : "password"}
        className={`${adminFormControlClass} pr-10 ${className}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setRevealed((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-700/70 hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-radio-accent/40 disabled:pointer-events-none disabled:opacity-40"
        aria-label={revealed ? hideLabel : revealLabel}
        aria-pressed={revealed}
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

export function AdminSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${adminSelectClass} ${props.className ?? ""}`} />;
}

export function AdminTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${adminTextareaClass} ${props.className ?? ""}`}
    />
  );
}

export function AdminBtn({
  variant = "primary",
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "success";
}) {
  const styles = {
    primary: "bg-radio-accent text-gray-900 hover:brightness-110",
    secondary: "border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700/80",
    danger: "border border-red-800/80 bg-red-950/50 text-red-200 hover:bg-red-900/50",
    success: "border border-green-800/80 bg-green-950/50 text-green-200 hover:bg-green-900/50",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`${adminControlHeight} inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function RoleBadge({ roleId }: { roleId: string }) {
  const role = RADIO_ROLES.find((r) => r.id === roleId);
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-radio-accent/15 text-radio-accent border border-radio-accent/30 whitespace-nowrap">
      {role?.label ?? roleId}
    </span>
  );
}

export function RolePicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (roleId: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 ${className}`} role="radiogroup">
      {RADIO_ROLES.map((role) => {
        const selected = value === role.id;
        return (
          <button
            key={role.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(role.id)}
            className={`text-left rounded-lg border px-3 py-3 transition-colors ${
              selected
                ? "border-radio-accent bg-radio-accent/15 ring-1 ring-radio-accent/40"
                : "border-gray-700 bg-gray-800/70 hover:border-gray-600 hover:bg-gray-800"
            }`}
          >
            <p className={`text-sm font-medium ${selected ? "text-radio-accent" : "text-gray-200"}`}>
              {role.label}
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-snug">{role.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function AdminTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-6 overflow-x-auto">
      <div
        className="inline-flex min-w-full sm:flex sm:flex-wrap gap-1 p-1 rounded-2xl border border-gray-700 bg-gray-900/70 sm:min-w-0"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onChange(t.id)}
            className={`shrink-0 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              active === t.id
                ? "bg-radio-accent text-gray-900"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const RADIO_ROLES = [
  { id: "listener", label: "Listener", description: "Listen to the stream and use chat" },
  { id: "broadcaster", label: "Broadcaster", description: "Can broadcast audio and manage the stage when live" },
  { id: "admin", label: "Admin", description: "Full access including this admin panel" },
] as const;

export const OIDC_FIELDS = [
  {
    key: "issuer" as const,
    label: "Issuer URL",
    hint: "Your OIDC provider issuer (Authentik application issuer URL).",
    placeholder: "https://auth.example.com/application/o/radio/",
  },
  {
    key: "clientId" as const,
    label: "Client ID",
    hint: "OAuth client ID from your OIDC application.",
    placeholder: "",
  },
  {
    key: "clientSecret" as const,
    label: "Client Secret",
    hint: "Leave blank when saving to keep the existing secret.",
    placeholder: "********",
    secret: true,
  },
  {
    key: "redirectUri" as const,
    label: "Redirect URI (optional)",
    hint: "Usually auto-detected. Must match your OIDC app callback URL.",
    placeholder: "",
  },
  {
    key: "scopes" as const,
    label: "Scopes",
    hint: "Space-separated OAuth scopes. Include openid and whatever scope exposes groups.",
    placeholder: "openid profile email groups",
  },
  {
    key: "groupClaim" as const,
    label: "Groups claim name",
    hint: "JWT field that contains the user's groups (array of strings). Common: groups",
    placeholder: "groups",
  },
  {
    key: "logoutUrl" as const,
    label: "Logout URL",
    hint: "OIDC end-session URL. SSO users are sent here after logout so the IdP session ends too.",
    placeholder: "https://auth.example.com/application/o/radio/end-session/",
  },
];
