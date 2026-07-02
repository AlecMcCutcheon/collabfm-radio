import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AccountSecurityStatus } from "../types/api";
import { AdminBtn, AdminInput, adminPrimaryBtnClass } from "./admin/adminUi";
import { TotpBackupCodesList } from "./TotpBackupCodesList";
import {
  firstBackupCodeFromPaste,
  normalizeBackupCodeInput,
  pastedMultipleBackupCodes,
} from "../utils/totpBackupCode";

interface AccountSecurityPanelProps {
  onMessage?: (msg: string) => void;
  onError?: (msg: string) => void;
  onAuthRefresh?: () => void;
  onProfileRefresh?: () => void;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    /* plain text */
  }
  return err.message || fallback;
}

export function AccountSecurityPanel({
  onMessage,
  onError,
  onAuthRefresh,
  onProfileRefresh,
}: AccountSecurityPanelProps) {
  const [security, setSecurity] = useState<AccountSecurityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [totpModal, setTotpModal] = useState<"enable" | "disable" | "regenerate" | null>(null);
  const [mode, setMode] = useState<"set" | "reset">("set");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupForDisable, setUseBackupForDisable] = useState(false);
  const [backupPasteHint, setBackupPasteHint] = useState(false);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const loadSecurity = useCallback(async () => {
    try {
      const res = await api.accountSecurity();
      setSecurity(res);
    } catch {
      setSecurity(null);
    }
  }, []);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("hybrid") === "ready") {
      void loadSecurity();
      params.delete("hybrid");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [loadSecurity]);

  const showHybrid = security?.hybridEnabled && security.authSource === "oidc";
  const showLocalPassword =
    security?.authSource === "local" && security.canResetPassword === true;
  const showTotp = security?.canManageTotp === true;

  if (!security || (!showHybrid && !showLocalPassword && !showTotp)) {
    return null;
  }

  const openSet = () => {
    setMode("set");
    setPassword("");
    setConfirmPassword("");
    setPasswordModalOpen(true);
  };

  const openReset = () => {
    setMode("reset");
    setPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setPasswordModalOpen(true);
  };

  const submitPassword = async () => {
    if (password.length < 8) {
      onError?.("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      onError?.("Passwords must match");
      return;
    }
    if (mode === "reset" && security?.passwordResetRequiresCurrent && !currentPassword.trim()) {
      onError?.("Enter your current password");
      return;
    }
    setLoading(true);
    try {
      if (mode === "set") {
        const res = await api.setAccountPassword({ password, confirmPassword });
        setSecurity(res.security);
        onMessage?.(
          res.username
            ? `Password set. You can also sign in locally with ${res.username}.`
            : "Password set.",
        );
      } else {
        const res = await api.resetAccountPassword({
          password,
          confirmPassword,
          ...(security?.passwordResetRequiresCurrent
            ? { currentPassword }
            : {}),
        });
        setSecurity(res.security);
        onMessage?.("Password updated.");
      }
      setPasswordModalOpen(false);
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      onAuthRefresh?.();
      onProfileRefresh?.();
    } catch (e) {
      onError?.(apiErrorMessage(e, "Password update failed"));
    } finally {
      setLoading(false);
    }
  };

  const openEnableTotp = async () => {
    setTotpCode("");
    setBackupCodes(null);
    setSetupQr(null);
    setSetupSecret(null);
    setTotpModal("enable");
    setLoading(true);
    try {
      const setup = await api.beginAccountTotpSetup();
      setSetupQr(setup.qrDataUrl);
      setSetupSecret(setup.secret);
    } catch (e) {
      onError?.(apiErrorMessage(e, "Could not start 2FA setup"));
      setTotpModal(null);
    } finally {
      setLoading(false);
    }
  };

  const confirmEnableTotp = async () => {
    if (!/^\d{6}$/.test(totpCode)) {
      onError?.("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const res = await api.confirmAccountTotp(totpCode);
      setSecurity(res.security);
      setBackupCodes(res.backupCodes);
      onMessage?.("Two-factor authentication enabled.");
      onAuthRefresh?.();
    } catch (e) {
      onError?.(apiErrorMessage(e, "Invalid authentication code"));
    } finally {
      setLoading(false);
    }
  };

  const submitEnableTotp = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !/^\d{6}$/.test(totpCode) || !setupQr) return;
    void confirmEnableTotp();
  };

  const submitDisableTotp = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    void disableTotp();
  };

  const submitRegenerateBackupCodes = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || !/^\d{6}$/.test(totpCode)) return;
    void regenerateBackupCodes();
  };

  const closeTotpModal = () => {
    setTotpModal(null);
    setTotpCode("");
    setBackupCode("");
    setUseBackupForDisable(false);
    setBackupPasteHint(false);
    setSetupQr(null);
    setSetupSecret(null);
    setBackupCodes(null);
  };

  const disableTotp = async () => {
    setLoading(true);
    try {
      const res = await api.disableAccountTotp(
        useBackupForDisable ? { backupCode } : { code: totpCode },
      );
      setSecurity(res.security);
      onMessage?.("Two-factor authentication disabled.");
      closeTotpModal();
      onAuthRefresh?.();
    } catch (e) {
      onError?.(apiErrorMessage(e, "Could not disable 2FA"));
    } finally {
      setLoading(false);
    }
  };

  const regenerateBackupCodes = async () => {
    if (!/^\d{6}$/.test(totpCode)) {
      onError?.("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const res = await api.regenerateAccountTotpBackupCodes(totpCode);
      setBackupCodes(res.backupCodes);
      onMessage?.("New backup codes generated.");
      setTotpCode("");
    } catch (e) {
      onError?.(apiErrorMessage(e, "Could not regenerate backup codes"));
    } finally {
      setLoading(false);
    }
  };

  const verifyLabel = security.ssoNickname
    ? `Verify with ${security.ssoNickname}`
    : "Verify with SSO";

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900/70 p-6 mb-6">
      <h2 className="text-lg font-semibold text-white mb-1">Account security</h2>

      {showHybrid && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            Optionally add a local password to your SSO-linked account. Sign in locally with your SSO
            email address; your internal username stays unchanged.
          </p>

          {security.needsOidcVerification && security.canSetPassword && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 text-sm text-amber-100">
              We need to refresh your SSO profile to read your email before setting a password.
              <div className="mt-3">
                <a
                  href={security.oidcVerifyUrl || "/auth/oidc/login?intent=hybrid_verify"}
                  className={`${adminPrimaryBtnClass} inline-flex`}
                >
                  {verifyLabel}
                </a>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-6">
            {security.canSetPassword && !security.needsOidcVerification && (
              <AdminBtn onClick={openSet}>Set password</AdminBtn>
            )}
            {security.canResetPassword && (
              <AdminBtn variant="secondary" onClick={openReset}>
                Reset password
              </AdminBtn>
            )}
            {security.hasPassword && (
              <span className="text-xs text-gray-500 self-center">
                Hybrid account — SSO and local login
              </span>
            )}
          </div>
        </>
      )}

      {showLocalPassword && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            Change your username/password sign-in credentials. Your current password is required.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            <AdminBtn variant="secondary" onClick={openReset}>
              Reset password
            </AdminBtn>
          </div>
        </>
      )}

      {showTotp && (
        <>
          {(showHybrid || showLocalPassword) && <hr className="border-gray-700 mb-6" />}
          <h3 className="text-base font-medium text-white mb-1">Two-factor authentication</h3>
          <p className="text-sm text-gray-400 mb-4">
            Protect local sign-in with an authenticator app. SSO sign-in is not affected.
          </p>

          {security.localLogin2faRequired && !security.totpEnabled && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 text-sm">
              <p className="font-medium text-amber-50">Local sign-in requires 2FA</p>
              <p className="mt-1 text-xs text-amber-100/80 leading-relaxed">
                {security.totpExempt
                  ? "You can skip setup when signing in as an admin. Enabling it here is still recommended."
                  : "Set up an authenticator below before your next local sign-in."}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            {security.totpEnabled ? (
              <>
                <span className="text-xs text-green-400/90">2FA enabled</span>
                {security.canDisableTotp && (
                  <AdminBtn
                    variant="secondary"
                    onClick={() => {
                      setTotpCode("");
                      setBackupCode("");
                      setUseBackupForDisable(false);
                      setTotpModal("disable");
                    }}
                  >
                    Disable 2FA
                  </AdminBtn>
                )}
                <AdminBtn
                  variant="secondary"
                  onClick={() => {
                    setTotpCode("");
                    setBackupCodes(null);
                    setTotpModal("regenerate");
                  }}
                >
                  New backup codes
                </AdminBtn>
              </>
            ) : (
              <AdminBtn onClick={() => void openEnableTotp()}>Enable 2FA</AdminBtn>
            )}
          </div>
        </>
      )}

      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-password-title"
          >
            <h3 id="account-password-title" className="text-lg font-semibold text-white mb-1">
              {mode === "set" ? "Set local password" : "Reset local password"}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {mode === "set"
                ? "Choose a password for local sign-in. Your SSO login will still work."
                : security?.passwordResetRequiresCurrent
                  ? "Enter your current password, then choose a new one."
                  : "Enter a new password for local sign-in."}
            </p>
            <div className="space-y-3">
              {mode === "reset" && security?.passwordResetRequiresCurrent && (
                <AdminInput
                  className="mt-0"
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}
              <AdminInput
                className="mt-0"
                type="password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <AdminInput
                className="mt-0"
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <AdminBtn
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  setPasswordModalOpen(false);
                  setPassword("");
                  setConfirmPassword("");
                  setCurrentPassword("");
                }}
              >
                Cancel
              </AdminBtn>
              <AdminBtn
                disabled={
                  loading ||
                  password.length < 8 ||
                  password !== confirmPassword ||
                  (mode === "reset" &&
                    security?.passwordResetRequiresCurrent &&
                    !currentPassword.trim())
                }
                onClick={() => void submitPassword()}
              >
                {mode === "set" ? "Set password" : "Save password"}
              </AdminBtn>
            </div>
          </div>
        </div>
      )}

      {totpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            {totpModal === "enable" && !backupCodes && (
              <form onSubmit={submitEnableTotp}>
                <h3 className="text-lg font-semibold text-white mb-1">Enable 2FA</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Scan this QR code with your authenticator app, then enter the 6-digit code.
                </p>
                {setupQr ? (
                  <div className="flex flex-col items-center gap-3 mb-4">
                    <img
                      src={setupQr}
                      alt="2FA QR code"
                      className="rounded-lg border border-gray-600 bg-white p-2"
                    />
                    {setupSecret && (
                      <p className="text-xs text-gray-500 font-mono break-all text-center">
                        Manual key: {setupSecret}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-4">Loading QR code…</p>
                )}
                <AdminInput
                  className="mt-0 font-mono tracking-widest"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
                <div className="mt-5 flex flex-wrap gap-2 justify-end">
                  <AdminBtn variant="secondary" disabled={loading} onClick={closeTotpModal}>
                    Cancel
                  </AdminBtn>
                  <AdminBtn
                    type="submit"
                    disabled={loading || !/^\d{6}$/.test(totpCode) || !setupQr}
                  >
                    Confirm
                  </AdminBtn>
                </div>
              </form>
            )}

            {totpModal === "enable" && backupCodes && (
              <>
                <h3 className="text-lg font-semibold text-white mb-1">Backup codes</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Save these codes somewhere safe. Each works once if you lose your device.
                </p>
                <TotpBackupCodesList
                  codes={backupCodes}
                  onCopied={() => onMessage?.("Backup codes copied to clipboard")}
                />
                <AdminBtn onClick={closeTotpModal}>Done</AdminBtn>
              </>
            )}

            {totpModal === "disable" && (
              <form onSubmit={submitDisableTotp}>
                <h3 className="text-lg font-semibold text-white mb-1">Disable 2FA</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Confirm with your authenticator or a backup code to turn off 2FA.
                </p>
                {!useBackupForDisable ? (
                  <AdminInput
                    className="mt-0 font-mono tracking-widest"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                ) : (
                  <>
                    <AdminInput
                      className="mt-0 font-mono uppercase"
                      value={backupCode}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBackupCode(normalizeBackupCodeInput(value));
                        setBackupPasteHint(pastedMultipleBackupCodes(value));
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        if (!pastedMultipleBackupCodes(text)) return;
                        e.preventDefault();
                        setBackupCode(firstBackupCodeFromPaste(text));
                        setBackupPasteHint(true);
                      }}
                      placeholder="One backup code"
                      autoFocus
                    />
                    {backupPasteHint && (
                      <p className="text-xs text-gray-500 mt-1">
                        Using the first code from your paste — only one is needed.
                      </p>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="text-xs text-radio-accent hover:underline mt-2"
                  onClick={() => {
                    setUseBackupForDisable((v) => !v);
                    setTotpCode("");
                    setBackupCode("");
                    setBackupPasteHint(false);
                  }}
                >
                  {useBackupForDisable ? "Use authenticator code" : "Use backup code"}
                </button>
                <div className="mt-5 flex flex-wrap gap-2 justify-end">
                  <AdminBtn variant="secondary" disabled={loading} onClick={closeTotpModal}>
                    Cancel
                  </AdminBtn>
                  <AdminBtn type="submit" variant="danger" disabled={loading}>
                    Disable 2FA
                  </AdminBtn>
                </div>
              </form>
            )}

            {totpModal === "regenerate" && (
              <>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {backupCodes ? "New backup codes" : "Regenerate backup codes"}
                </h3>
                {!backupCodes ? (
                  <form onSubmit={submitRegenerateBackupCodes}>
                    <p className="text-sm text-gray-400 mb-4">
                      Enter your current authenticator code. This replaces all unused backup codes.
                    </p>
                    <AdminInput
                      className="mt-0 font-mono tracking-widest"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                    />
                    <div className="mt-5 flex flex-wrap gap-2 justify-end">
                      <AdminBtn variant="secondary" disabled={loading} onClick={closeTotpModal}>
                        Cancel
                      </AdminBtn>
                      <AdminBtn type="submit" disabled={loading || !/^\d{6}$/.test(totpCode)}>
                        Generate
                      </AdminBtn>
                    </div>
                  </form>
                ) : (
                  <>
                    <TotpBackupCodesList
                      codes={backupCodes}
                      onCopied={() => onMessage?.("Backup codes copied to clipboard")}
                    />
                    <AdminBtn onClick={closeTotpModal}>Done</AdminBtn>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
