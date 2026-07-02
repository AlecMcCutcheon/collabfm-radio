import { apiUrl } from "../../config";
import type { AdminUser } from "../../types/api";
import { avatarSrc } from "../../utils/avatar";
import { avatarImageFallbackHandler } from "../../utils/brandingImage";
import { LevelProgressBar } from "../LevelProgressBar";
import {
  AdminBtn,
  AdminCheckbox,
  AdminInput,
  AdminSelect,
  RoleBadge,
} from "./adminUi";

interface AdminUserRowProps {
  user: AdminUser;
  hybridUsersEnabled?: boolean;
  guestActionsGrantXp?: boolean;
  isSelf: boolean;
  lockSelfAdmin: boolean;
  editingPassword: boolean;
  passwordDraft: string;
  onPasswordDraftChange: (value: string) => void;
  onTogglePasswordEdit: () => void;
  onSavePassword: () => void;
  onRoleChange: (role: string) => void;
  onDelete: () => void;
  onToggleBlockGuestXp: (checked: boolean) => void;
  onResetXp: () => void;
  onResetTotp: () => void;
  onReconcileOidcUsername?: () => void;
  reconcileBusy?: boolean;
}

function looksLikeEmailUsername(username: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim());
}

function formatAccountUsername(username: string): string {
  return looksLikeEmailUsername(username) ? username.trim() : `@${username}`;
}

function truncateInternalUsername(username: string, max = 28): string {
  if (username.length <= max) return username;
  return `${username.slice(0, max - 1)}…`;
}

function formatLastLogin(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function signInMethodsSummary(user: AdminUser, isHybridOidc: boolean): string {
  if (user.auth_source === "local") {
    return user.loginEmail ? "Username+password · Email+password" : "Username+password";
  }
  if (isHybridOidc) {
    return user.loginEmail ? "SSO · Email+password" : "SSO · Password";
  }
  return "SSO only";
}

export function AdminUserRow({
  user,
  hybridUsersEnabled = false,
  guestActionsGrantXp = true,
  isSelf,
  lockSelfAdmin,
  editingPassword,
  passwordDraft,
  onPasswordDraftChange,
  onTogglePasswordEdit,
  onSavePassword,
  onRoleChange,
  onDelete,
  onToggleBlockGuestXp,
  onResetXp,
  onResetTotp,
  onReconcileOidcUsername,
  reconcileBusy = false,
}: AdminUserRowProps) {
  const isLocal = user.auth_source === "local";
  const isOidc = user.auth_source === "oidc";
  const isHybridOidc = isOidc && !!user.has_password;
  const isOidcOnly = isOidc && !user.has_password;
  const legacyIdentity = user.legacyOidcIdentity;
  const needsLegacyReconcile = !!legacyIdentity?.needsReconciliation;
  const canEditPassword = isLocal || (isOidc && hybridUsersEnabled);
  const canResetTotp = !!user.has_password && !!user.totp_enabled;
  const nickname = user.nickname?.trim() || "";
  const hasNickname = nickname.length > 0 && nickname.toLowerCase() !== user.username.toLowerCase();
  const primaryLabel = hasNickname ? nickname : isOidcOnly ? truncateInternalUsername(user.username) : user.username;
  const avatarFallback = avatarSrc(String(user.id), 128);
  const avatarImage = user.avatar ? apiUrl(user.avatar) : avatarFallback;
  const roleColor = user.roleColor ?? "#e5e7eb";
  const lastLoginLabel = formatLastLogin(user.last_login);
  const signInSummary = signInMethodsSummary(user, isHybridOidc);

  return (
    <li className="rounded-xl border border-gray-700/90 bg-gradient-to-br from-gray-800/80 to-gray-900/70 p-4 shadow-sm space-y-4">
      <div className="flex items-start gap-4">
        <div
          className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden ring-2 shadow-md"
          style={{ boxShadow: `0 0 0 2px ${roleColor}55` }}
        >
          <img
            src={avatarImage}
            alt={primaryLabel}
            className="w-full h-full object-cover"
            onError={avatarImageFallbackHandler(String(user.id), 128)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className="text-base font-semibold truncate"
                style={{ color: roleColor }}
                title={hasNickname ? nickname : user.username}
              >
                {primaryLabel}
              </p>
              {hasNickname && (
                <p className="text-sm text-gray-400 mt-0.5 truncate" title={user.username}>
                  {formatAccountUsername(user.username)}
                </p>
              )}
              {isLocal && user.loginEmail && (
                <p className="text-xs text-gray-500 mt-0.5 truncate" title={user.loginEmail}>
                  Email login: {user.loginEmail}
                </p>
              )}
              {isHybridOidc && user.loginEmail && (
                <p className="text-xs text-gray-500 mt-0.5 truncate" title={user.loginEmail}>
                  Local login: {user.loginEmail}
                </p>
              )}
              {isHybridOidc && (
                <p className="text-xs text-gray-500 mt-0.5 font-mono truncate" title={user.username}>
                  Username: {truncateInternalUsername(user.username, 36)}
                </p>
              )}
              {isOidcOnly && user.loginEmail && (
                <p className="text-xs text-gray-500 mt-0.5 truncate" title={user.loginEmail}>
                  SSO email: {user.loginEmail}
                </p>
              )}
              {isOidcOnly && (
                <p className="text-sm text-gray-500 mt-0.5 font-mono truncate" title={user.username}>
                  SSO only · {truncateInternalUsername(user.username, 36)}
                </p>
              )}
              {!hasNickname && isLocal && !user.loginEmail && (
                <p className="text-sm text-gray-400 mt-0.5 truncate" title={user.username}>
                  {formatAccountUsername(user.username)}
                </p>
              )}
              <p className="text-[11px] text-gray-600 mt-1 uppercase tracking-wide">
                Sign-in: {signInSummary}
              </p>
              {needsLegacyReconcile && (
                <div className="mt-2 rounded-lg border border-amber-700/50 bg-amber-950/25 px-3 py-2 space-y-2">
                  <p className="text-xs text-amber-100 leading-relaxed">
                    Legacy hybrid identity — internal username does not match the provider UUID
                    {legacyIdentity?.providerSub ? (
                      <>
                        {" "}
                        (<span className="font-mono text-amber-50">{legacyIdentity.providerSub}</span>
                        {legacyIdentity.providerSubSource ? ` from ${legacyIdentity.providerSubSource}` : ""})
                      </>
                    ) : (
                      ". No provider UUID on file yet."
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {legacyIdentity?.canReconcileFromStored && onReconcileOidcUsername ? (
                      <AdminBtn
                        variant="secondary"
                        className="text-xs"
                        disabled={reconcileBusy}
                        onClick={onReconcileOidcUsername}
                      >
                        {reconcileBusy ? "Reconciling…" : "Normalize to provider UUID"}
                      </AdminBtn>
                    ) : null}
                    <span className="text-[11px] text-amber-200/80 self-center">
                      Or have them sign in via SSO once to refresh from the identity provider.
                    </span>
                  </div>
                </div>
              )}
              {(lastLoginLabel || user.last_login_ip) && (
                <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                  {lastLoginLabel ? `Last seen ${lastLoginLabel}` : "Last seen unknown"}
                  {user.last_login_ip ? ` · ${user.last_login_ip}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <RoleBadge roleId={user.role} />
              {isLocal && (
                <span className="inline-flex items-center rounded-full border border-gray-600 bg-gray-900/80 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                  Local
                </span>
              )}
              {isOidcOnly && (
                <span className="inline-flex items-center rounded-full border border-gray-600 bg-gray-900/80 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                  SSO
                </span>
              )}
              {isHybridOidc && (
                <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-600/15 px-2.5 py-0.5 text-[10px] font-medium text-indigo-100">
                  Hybrid
                </span>
              )}
              {user.totp_enabled && (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-600/15 px-2.5 py-0.5 text-[10px] font-medium text-emerald-100">
                  2FA
                </span>
              )}
              {isSelf && (
                <span className="inline-flex items-center rounded-full border border-radio-accent/30 bg-radio-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-radio-accent">
                  You
                </span>
              )}
            </div>
          </div>

          {user.bio?.trim() ? (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed break-words">{user.bio.trim()}</p>
          ) : (
            <p className="text-xs text-gray-600 mt-2 italic">No status set</p>
          )}

          {user.genres && user.genres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.genres.map((genre) => (
                <span
                  key={genre}
                  className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-600/15 px-2 py-0.5 text-[10px] text-indigo-100"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          <LevelProgressBar level={user.level} compact showTotalXp />
        </div>
      </div>

      <div className="rounded-lg border border-gray-700/80 bg-gray-900/40 p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
          <AdminFieldInline label="Role">
            <AdminSelect
              className="mt-0 w-full sm:min-w-[10rem]"
              value={user.role}
              disabled={lockSelfAdmin}
              title={lockSelfAdmin ? "You cannot remove your own admin role" : undefined}
              onChange={(e) => onRoleChange(e.target.value)}
            >
              <option value="listener">Listener</option>
              <option value="broadcaster">Broadcaster</option>
              <option value="admin">Admin</option>
            </AdminSelect>
          </AdminFieldInline>

          <div className="flex flex-wrap gap-2 items-end">
            {canEditPassword && (
              <AdminBtn variant="secondary" className="w-full sm:w-auto" onClick={onTogglePasswordEdit}>
                {editingPassword ? "Cancel password" : user.has_password ? "Reset password" : "Set password"}
              </AdminBtn>
            )}

            {!isSelf && (
              <AdminBtn variant="danger" className="w-full sm:w-auto" onClick={onDelete}>
                Delete
              </AdminBtn>
            )}
          </div>
        </div>

        {editingPassword && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end pt-1 border-t border-gray-700/70">
            <AdminInput
              className="mt-0 sm:flex-1"
              type="password"
              placeholder="New password (min 8 characters)"
              value={passwordDraft}
              onChange={(e) => onPasswordDraftChange(e.target.value)}
              autoComplete="new-password"
            />
            <AdminBtn
              className="w-full sm:w-auto shrink-0"
              disabled={passwordDraft.length < 8}
              onClick={onSavePassword}
            >
              Save password
            </AdminBtn>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap pt-1 border-t border-gray-700/70">
          {guestActionsGrantXp && (
            <AdminCheckbox
              checked={!!user.block_guest_action_xp}
              onChange={onToggleBlockGuestXp}
              label="Block guest-action XP"
              hint="Hearts and request approvals from guest sessions won't grant XP to this account."
            />
          )}
          <AdminBtn variant="secondary" className="w-full sm:w-auto shrink-0" onClick={onResetXp}>
            Reset XP
          </AdminBtn>
          {canResetTotp && (
            <AdminBtn variant="secondary" className="w-full sm:w-auto shrink-0" onClick={onResetTotp}>
              Reset 2FA
            </AdminBtn>
          )}
        </div>
      </div>
    </li>
  );
}

function AdminFieldInline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block w-full sm:w-auto sm:min-w-[10rem]">
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
