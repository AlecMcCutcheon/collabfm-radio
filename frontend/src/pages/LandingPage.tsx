import { useCallback, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { AppNavLink } from "../context/AppNavigationContext";
import { api } from "../api/client";
import { apiUrl } from "../config";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { TotpBackupCodesList } from "../components/TotpBackupCodesList";
import {
  firstBackupCodeFromPaste,
  looksLikeBackupCode,
  normalizeBackupCodeInput,
  pastedMultipleBackupCodes,
} from "../utils/totpBackupCode";
import {
  imageFallbackHandler,
  proceduralStationLogo,
  resolveBrandingImageUrl,
} from "../utils/brandingImage";

type LoginStep = "login" | "verify" | "setup_prompt" | "setup";

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

export function LandingPage() {
  const [step, setStep] = useState<LoginStep>("login");
  const [setupOptional, setSetupOptional] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupPasteHint, setBackupPasteHint] = useState(false);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidc, setOidc] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [ssoNickname, setSsoNickname] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [radioTitle, setRadioTitle] = useState("CollabFM Radio");
  const [visualizerSrc, setVisualizerSrc] = useState<string | null>(null);
  const logoFallback = proceduralStationLogo(radioTitle, 96);

  const turnstileRequired = !!turnstileSiteKey;
  const canSubmitLocal =
    username.trim() && password && (!turnstileRequired || !!turnstileToken);
  const canSubmitVerify = useBackupCode ? backupCode.trim().length >= 8 : /^\d{6}$/.test(totpCode);
  const canSubmitSetupConfirm = /^\d{6}$/.test(totpCode);

  const resetLoginForm = useCallback(() => {
    setStep("login");
    setSetupOptional(false);
    setTotpCode("");
    setBackupCode("");
    setUseBackupCode(false);
    setBackupPasteHint(false);
    setSetupQr(null);
    setSetupSecret(null);
    setBackupCodes(null);
    setError(null);
  }, []);

  const abandonPendingLogin = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* cookie may already be gone */
    }
    resetLoginForm();
  }, [resetLoginForm]);

  useEffect(() => {
    void api.authMethods().then((m) => {
      setOidc(m.oidc);
      setRegistrationEnabled(m.registrationEnabled === true);
      setTurnstileSiteKey(m.turnstileSiteKey || null);
      setSsoNickname(m.ssoNickname || null);
    });
    void api.authStatus().then((s) => {
      if (s.pending2fa) {
        void abandonPendingLogin();
      }
    });
    void api
      .branding()
      .then((b) => {
        setRadioTitle(b.radioDisplayName);
        setVisualizerSrc(resolveBrandingImageUrl(b.visualizerImageUrl));
      })
      .catch(() => {
        setVisualizerSrc(null);
      });
  }, [abandonPendingLogin]);

  const loadSetupQr = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const setup = await api.beginLocal2faSetup();
      setSetupQr(setup.qrDataUrl);
      setSetupSecret(setup.secret);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not start 2FA setup"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === "setup" && !setupQr && !backupCodes) {
      void loadSetupQr();
    }
  }, [step, setupQr, backupCodes, loadSetupQr]);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileReset((n) => n + 1);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitLocal) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.localLogin(username, password, turnstileToken || undefined);
      if (result.requires2fa) {
        setStep("verify");
        setTotpCode("");
        setBackupCode("");
        setUseBackupCode(false);
        return;
      }
      if (result.requires2faSetup && result.optional2faSetup) {
        setSetupOptional(true);
        setStep("setup_prompt");
        setTotpCode("");
        setSetupQr(null);
        setSetupSecret(null);
        setBackupCodes(null);
        return;
      }
      if (result.requires2faSetup) {
        setSetupOptional(false);
        setStep("setup");
        setTotpCode("");
        setSetupQr(null);
        setSetupSecret(null);
        setBackupCodes(null);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      const message = apiErrorMessage(err, "");
      if (message.includes("Turnstile") || message.includes("Verification")) {
        setError("Human verification failed. Please try again.");
      } else {
        setError("Invalid username, email, or password");
      }
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitVerify) return;
    setError(null);
    setLoading(true);
    try {
      await api.verifyLocal2fa(
        useBackupCode ? { backupCode } : { code: totpCode },
      );
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid authentication code"));
    } finally {
      setLoading(false);
    }
  };

  const submitSetupConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitSetupConfirm) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.confirmLocal2faSetup(totpCode);
      if (result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid authentication code"));
    } finally {
      setLoading(false);
    }
  };

  const skipOptionalSetup = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.skipOptionalLocal2faSetup();
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Could not continue without 2FA setup"));
    } finally {
      setLoading(false);
    }
  };

  const beginOptionalSetup = () => {
    setStep("setup");
    setTotpCode("");
    setSetupQr(null);
    setSetupSecret(null);
    setBackupCodes(null);
  };

  const ssoLabel = ssoNickname ? `Login With ${ssoNickname}` : "Sign in with SSO";

  const heading =
    step === "verify"
      ? "Two-factor authentication"
      : step === "setup_prompt"
        ? "Two-factor authentication"
        : step === "setup"
          ? "Set up two-factor authentication"
          : "Login to your account";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl">
        <div className="text-center space-y-3 pb-6">
          <img
            src={visualizerSrc || logoFallback}
            alt=""
            onError={imageFallbackHandler(logoFallback)}
            className="w-24 h-24 rounded-2xl object-cover mx-auto border border-gray-600 shadow-lg"
          />
          <h1 className="text-2xl font-bold text-radio-accent">{radioTitle}</h1>
        </div>

        <h2 className="text-lg font-semibold text-white mb-4">{heading}</h2>

        {step === "login" && (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm text-gray-300">
              Username or email
              <input
                className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or email"
                autoComplete="username"
                required
              />
            </label>

            <label className="block text-sm text-gray-300">
              Password
              <input
                type="password"
                className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </label>

            {turnstileSiteKey && (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={turnstileReset}
                onToken={setTurnstileToken}
                onExpire={resetTurnstile}
                onError={resetTurnstile}
              />
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !canSubmitLocal}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            {registrationEnabled && (
              <AppNavLink
                to="/register"
                className="block w-full text-center text-sm text-gray-400 hover:text-radio-accent pt-1"
              >
                Request access or activate account
              </AppNavLink>
            )}
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={submitVerify} className="space-y-4">
            <p className="text-sm text-gray-400">
              {useBackupCode
                ? "Enter one backup code from the list you saved when you enabled 2FA. Each code works only once."
                : "Enter the 6-digit code from your authenticator app."}
            </p>

            {!useBackupCode ? (
              <label className="block text-sm text-gray-300">
                Authentication code
                <input
                  className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white font-mono tracking-widest focus:border-radio-accent/60 focus:outline-none"
                  value={totpCode}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (looksLikeBackupCode(value)) {
                      setUseBackupCode(true);
                      setBackupCode(firstBackupCodeFromPaste(value));
                      setBackupPasteHint(pastedMultipleBackupCodes(value));
                      setTotpCode("");
                      return;
                    }
                    setTotpCode(value.replace(/\D/g, "").slice(0, 6));
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            ) : (
              <label className="block text-sm text-gray-300">
                Backup code
                <input
                  className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white font-mono uppercase focus:border-radio-accent/60 focus:outline-none"
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
                  autoComplete="off"
                  required
                />
                {backupPasteHint && (
                  <span className="mt-1 block text-xs text-gray-500">
                    Using the first code from your paste — only one is needed per sign-in.
                  </span>
                )}
              </label>
            )}

            <button
              type="button"
              className="text-xs text-radio-accent hover:underline"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setTotpCode("");
                setBackupCode("");
                setBackupPasteHint(false);
                setError(null);
              }}
            >
              {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !canSubmitVerify}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Verifying…" : "Continue"}
            </button>

            <button
              type="button"
              className="w-full text-sm text-gray-400 hover:text-white"
              onClick={() => void abandonPendingLogin()}
            >
              Back to login
            </button>
          </form>
        )}

        {step === "setup_prompt" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              This station requires two-factor authentication for local sign-in. Set it up now, or
              skip for now and enable it later in Studio.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              disabled={loading}
              onClick={beginOptionalSetup}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Set up 2FA now
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void skipOptionalSetup()}
              className="w-full rounded-xl border border-gray-600 bg-gray-900/60 text-white font-medium py-2.5 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Continuing…" : "Skip for now"}
            </button>
            <button
              type="button"
              disabled={loading}
              className="w-full text-sm text-gray-400 hover:text-white"
              onClick={() => void abandonPendingLogin()}
            >
              Back to login
            </button>
          </div>
        )}

        {step === "setup" && !backupCodes && (
          <form onSubmit={submitSetupConfirm} className="space-y-4">
            <p className="text-sm text-gray-400">
              {setupOptional
                ? "Scan the QR code with your authenticator app, then enter the code to finish."
                : "This station requires two-factor authentication for local sign-in. Scan the QR code with your authenticator app, then enter the code to finish."}
            </p>

            {setupQr ? (
              <div className="flex flex-col items-center gap-3">
                <img src={setupQr} alt="2FA QR code" className="rounded-lg border border-gray-600 bg-white p-2" />
                {setupSecret && (
                  <p className="text-xs text-gray-500 font-mono break-all text-center">
                    Manual key: {setupSecret}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{loading ? "Loading QR code…" : "QR code unavailable"}</p>
            )}

            <label className="block text-sm text-gray-300">
              Authentication code
              <input
                className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white font-mono tracking-widest focus:border-radio-accent/60 focus:outline-none"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !canSubmitSetupConfirm || !setupQr}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Confirming…" : "Enable 2FA and sign in"}
            </button>

            {setupOptional && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void skipOptionalSetup()}
                className="w-full text-sm text-gray-400 hover:text-white"
              >
                Skip for now
              </button>
            )}

            {!setupOptional && (
              <button
                type="button"
                disabled={loading}
                className="w-full text-sm text-gray-400 hover:text-white"
                onClick={() => void abandonPendingLogin()}
              >
                Back to login
              </button>
            )}
          </form>
        )}

        {step === "setup" && backupCodes && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Save these backup codes somewhere safe. Each code works once if you lose your device.
            </p>
            <TotpBackupCodesList codes={backupCodes} />
            <button
              type="button"
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 transition"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Continue to station
            </button>
          </div>
        )}

        {step === "login" && oidc && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">or</span>
              <div className="h-px flex-1 bg-gray-600" />
            </div>

            <a
              href={apiUrl("/auth/oidc/login")}
              className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-500/50 bg-gradient-to-b from-gray-600/90 to-gray-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-gray-500 hover:to-gray-600 hover:border-radio-accent/30 hover:shadow-lg"
            >
              <LogIn className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              {ssoLabel}
            </a>

            {ssoNickname && (
              <p className="text-center text-xs text-gray-500">
                Use your {ssoNickname} account to sign in securely
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
