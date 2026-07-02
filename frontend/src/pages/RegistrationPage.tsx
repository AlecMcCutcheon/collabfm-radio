import { useCallback, useEffect, useMemo, useState } from "react";
import { AppNavLink } from "../context/AppNavigationContext";
import { api } from "../api/client";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { TotpBackupCodesList } from "../components/TotpBackupCodesList";
import { FormCheckbox, FormRadio, FormSelect, registrationFieldClass } from "../components/FormControls";
import type { LocalLoginResult, RegistrationPublicConfig } from "../types/api";
import {
  buildRegistrationWizardSteps,
  moduleVisible,
  normalizeRegistrationTokenInput,
} from "../utils/registrationFlow";
import {
  formatRegistrationStatus,
  registrationStatusCardClass,
} from "../utils/registrationStatus";

type HubMode = "hub" | "apply" | "check";
type CheckPhase = "lookup" | "account" | "setup_prompt" | "setup" | "done";

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

export function RegistrationPage() {
  const [mode, setMode] = useState<HubMode>("hub");
  const [config, setConfig] = useState<RegistrationPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const [applyStep, setApplyStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const [registrationToken, setRegistrationToken] = useState("");
  const [statusResult, setStatusResult] = useState<{
    status: string;
    message: string;
    email?: string;
    displayName?: string | null;
  } | null>(null);
  const [checkPhase, setCheckPhase] = useState<CheckPhase>("lookup");
  const [activateEmail, setActivateEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const turnstileRequired = !!turnstileSiteKey;

  useEffect(() => {
    void Promise.all([api.registrationConfig(), api.authMethods()])
      .then(([cfg, methods]) => {
        setConfig(cfg);
        setTurnstileSiteKey(methods.turnstileSiteKey || null);
      })
      .catch(() => setError("Could not load registration settings"))
      .finally(() => setLoading(false));
  }, []);

  const applySteps = useMemo(
    () => (config?.enabled ? buildRegistrationWizardSteps(config, answers) : []),
    [config, answers],
  );
  const currentApplyStep = applySteps[applyStep];

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileReset((n) => n + 1);
  }, []);

  const goHub = useCallback(() => {
    setMode("hub");
    setError(null);
    setApplyStep(0);
    setDisplayName("");
    setEmail("");
    setConsentAgreed(false);
    setAnswers({});
    setIssuedToken(null);
    setRegistrationToken("");
    setStatusResult(null);
    setCheckPhase("lookup");
    setActivateEmail("");
    setUsername("");
    setPassword("");
    setTotpCode("");
    setSetupQr(null);
    setSetupSecret(null);
    setBackupCodes(null);
    resetTurnstile();
  }, [resetTurnstile]);

  const submitApply = async () => {
    if (!config?.enabled) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.registrationApply({
        email,
        displayName,
        consentAgreed: config.consent?.enabled ? consentAgreed : undefined,
        answers,
        turnstileToken: turnstileToken || undefined,
      });
      setIssuedToken(result.token);
      setApplyStep(applySteps.length);
      resetTurnstile();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not submit request"));
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  };

  const checkRegistration = async () => {
    setBusy(true);
    setError(null);
    setStatusResult(null);
    setCheckPhase("lookup");
    try {
      const token = normalizeRegistrationTokenInput(registrationToken);
      const result = await api.registrationStatus(token);
      setStatusResult({
        status: result.status,
        message: result.message,
        email: result.request?.email,
        displayName: result.request?.displayName,
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not check registration"));
    } finally {
      setBusy(false);
    }
  };

  const beginActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = normalizeRegistrationTokenInput(registrationToken);
      const result = await api.registrationActivateBegin(token);
      setActivateEmail(result.email);
      setCheckPhase("account");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not verify token"));
    } finally {
      setBusy(false);
    }
  };

  const handleActivateLoginResult = (result: LocalLoginResult) => {
    if (result.backupCodes?.length) {
      setBackupCodes(result.backupCodes);
      setCheckPhase("done");
      return;
    }
    if (result.requires2faSetup) {
      setCheckPhase(result.optional2faSetup ? "setup_prompt" : "setup");
      return;
    }
    window.location.href = "/";
  };

  const completeActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.registrationActivateComplete({
        token: normalizeRegistrationTokenInput(registrationToken),
        username: username.trim(),
        password,
        turnstileToken: turnstileToken || undefined,
      });
      handleActivateLoginResult(result);
      resetTurnstile();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create account"));
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  };

  const loadSetupQr = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const setup = await api.beginLocal2faSetup();
      setSetupQr(setup.qrDataUrl);
      setSetupSecret(setup.secret);
      setCheckPhase("setup");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not start 2FA setup"));
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.confirmLocal2faSetup(totpCode);
      if (result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
        setCheckPhase("done");
        return;
      }
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid code"));
    } finally {
      setBusy(false);
    }
  };

  const skipOptionalSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.skipOptionalLocal2faSetup();
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Could not continue"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-gray-300">Registration is not open on this station.</p>
          <AppNavLink to="/" className="text-radio-accent hover:underline text-sm">
            Back to sign in
          </AppNavLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-800/80 p-6 shadow-xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Station registration</h1>
          <p className="text-sm text-gray-400 mt-1">
            Request access or enter your registration token to check status and activate.
          </p>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {mode === "hub" && (
          <div className="space-y-3">
            <button
              type="button"
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 transition"
              onClick={() => {
                goHub();
                setMode("apply");
              }}
            >
              Request access
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-gray-600 bg-gray-900/60 text-white font-medium py-2.5 hover:bg-gray-800 transition"
              onClick={() => {
                goHub();
                setMode("check");
              }}
            >
              Check status & activate
            </button>
            <AppNavLink to="/" className="block text-center text-sm text-gray-400 hover:text-white pt-2">
              Back to sign in
            </AppNavLink>
          </div>
        )}

        {mode === "apply" && !issuedToken && currentApplyStep && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Step {applyStep + 1} of {applySteps.length}
            </p>

            {currentApplyStep.kind === "email" && (
              <>
                <label className="block text-sm text-gray-300">
                  Name or handle
                  <input
                    type="text"
                    className={registrationFieldClass}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoFocus
                    maxLength={80}
                    placeholder="Whatever you'd like us to call you"
                    required
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Your real name, a nickname, or a handle — whatever you&apos;re comfortable sharing.
                </p>
                <label className="block text-sm text-gray-300">
                  Email address
                  <input
                    type="email"
                    className={registrationFieldClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <p className="text-xs text-gray-500">Required — used when your account is created after approval.</p>
              </>
            )}

            {currentApplyStep.kind === "consent" && config.consent && (
              <>
                <h2 className="text-sm font-semibold text-white">{config.consent.title}</h2>
                <div className="text-sm text-gray-300 whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-900/50 p-3 max-h-48 overflow-y-auto">
                  {config.consent.body}
                </div>
                <FormCheckbox
                  checked={consentAgreed}
                  onChange={setConsentAgreed}
                  label={config.consent.checkboxLabel}
                />
              </>
            )}

            {currentApplyStep.kind === "module" && (
              <ModuleField
                module={currentApplyStep.module}
                value={answers[currentApplyStep.module.id]}
                countryOptions={config.countryOptions}
                onChange={(value) =>
                  setAnswers((prev) => ({ ...prev, [currentApplyStep.module.id]: value }))
                }
              />
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-gray-600 py-2.5 text-sm text-gray-300 hover:bg-gray-800"
                onClick={() => {
                  if (applyStep === 0) goHub();
                  else setApplyStep((s) => s - 1);
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !canAdvanceApplyStep(currentApplyStep, { displayName, email, consentAgreed, answers, config })}
                className="flex-1 rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 disabled:opacity-50"
                onClick={() => {
                  if (applyStep >= applySteps.length - 1) void submitApply();
                  else setApplyStep((s) => s + 1);
                }}
              >
                {applyStep >= applySteps.length - 1 ? (busy ? "Submitting…" : "Submit request") : "Continue"}
              </button>
            </div>

            {applyStep >= applySteps.length - 1 && turnstileRequired && (
              <TurnstileWidget
                siteKey={turnstileSiteKey!}
                resetKey={turnstileReset}
                onToken={setTurnstileToken}
              />
            )}
          </div>
        )}

        {mode === "apply" && issuedToken && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Your request has been submitted.</p>
            <p className="text-sm text-gray-400">
              Save this token somewhere safe. You will need it to check status and activate your account
              after approval.
            </p>
            <div className="rounded-lg border border-radio-accent/30 bg-gray-900 p-3 font-mono text-sm text-radio-accent break-all">
              {issuedToken}
            </div>
            <button
              type="button"
              className="w-full rounded-xl border border-gray-600 py-2.5 text-sm text-white hover:bg-gray-800"
              onClick={() => void navigator.clipboard.writeText(issuedToken)}
            >
              Copy token
            </button>
            <button type="button" className="w-full text-sm text-gray-400 hover:text-white" onClick={goHub}>
              Done
            </button>
          </div>
        )}

        {mode === "check" && checkPhase === "lookup" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Enter the registration token you received when you applied. We&apos;ll show your current
              status and let you activate if approved.
            </p>
            <label className="block text-sm text-gray-300">
              Registration token
              <input
                className={`${registrationFieldClass} font-mono uppercase`}
                value={registrationToken}
                onChange={(e) => {
                  setRegistrationToken(e.target.value);
                  setStatusResult(null);
                  setError(null);
                }}
                placeholder="REG-XXXX-XXXX-XXXX-XXXX"
              />
            </label>
            <button
              type="button"
              disabled={busy || !registrationToken.trim()}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 disabled:opacity-50"
              onClick={() => void checkRegistration()}
            >
              {busy ? "Checking…" : "Check registration"}
            </button>
            {statusResult && (
              <div
                className={`rounded-lg border p-3 text-sm space-y-2 ${registrationStatusCardClass(statusResult.status)}`}
              >
                <p className="text-white font-medium capitalize">
                  {formatRegistrationStatus(statusResult.status)}
                </p>
                {statusResult.displayName ? (
                  <p className="text-base font-semibold text-white">{statusResult.displayName}</p>
                ) : null}
                {statusResult.email && (
                  <p className={statusResult.displayName ? "text-xs text-gray-500" : "text-gray-400"}>
                    {statusResult.email}
                  </p>
                )}
                <p className="text-gray-300">{statusResult.message}</p>
                {statusResult.status === "approved" && (
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 mt-1 disabled:opacity-50"
                    onClick={() => void beginActivate()}
                  >
                    {busy ? "Loading…" : "Activate account"}
                  </button>
                )}
                {statusResult.status === "activated" && (
                  <AppNavLink
                    to="/"
                    className="block w-full rounded-xl border border-gray-600 py-2.5 text-center text-sm text-white hover:bg-gray-800"
                  >
                    Go to sign in
                  </AppNavLink>
                )}
              </div>
            )}
            <button type="button" className="w-full text-sm text-gray-400 hover:text-white" onClick={goHub}>
              Back
            </button>
          </div>
        )}

        {mode === "check" && checkPhase === "account" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Creating account for <span className="text-white">{activateEmail}</span>
            </p>
            <label className="block text-sm text-gray-300">
              Username
              <input
                className={registrationFieldClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                required
              />
            </label>
            <p className="text-xs text-gray-500">
              You can sign in with this username or your email after activation.
            </p>
            <label className="block text-sm text-gray-300">
              Password
              <input
                type="password"
                className={registrationFieldClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {turnstileRequired && (
              <TurnstileWidget
                siteKey={turnstileSiteKey!}
                resetKey={turnstileReset}
                onToken={setTurnstileToken}
              />
            )}
            <button
              type="button"
              disabled={
                busy ||
                username.trim().length < 3 ||
                password.length < 8 ||
                (turnstileRequired && !turnstileToken)
              }
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 disabled:opacity-50"
              onClick={() => void completeActivate()}
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
            <button
              type="button"
              className="w-full text-sm text-gray-400 hover:text-white"
              onClick={() => setCheckPhase("lookup")}
            >
              Back
            </button>
          </div>
        )}

        {mode === "check" && checkPhase === "setup_prompt" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              This station supports two-factor authentication. Set it up now, or skip and enable it later
              in Studio.
            </p>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5"
              onClick={() => void loadSetupQr()}
            >
              Set up 2FA now
            </button>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-xl border border-gray-600 py-2.5 text-white hover:bg-gray-800"
              onClick={() => void skipOptionalSetup()}
            >
              Skip for now
            </button>
          </div>
        )}

        {mode === "check" && checkPhase === "setup" && !backupCodes && (
          <form onSubmit={confirmSetup} className="space-y-4">
            {setupQr ? (
              <img src={setupQr} alt="2FA QR code" className="mx-auto rounded-lg border border-gray-600 bg-white p-2" />
            ) : (
              <p className="text-sm text-gray-500">{busy ? "Loading QR code…" : "QR unavailable"}</p>
            )}
            {setupSecret && (
              <p className="text-xs text-gray-500 font-mono text-center break-all">Manual key: {setupSecret}</p>
            )}
            <input
              className={`${registrationFieldClass} font-mono tracking-widest`}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              required
            />
            <button
              type="submit"
              disabled={busy || totpCode.length !== 6}
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 disabled:opacity-50"
            >
              Enable 2FA and continue
            </button>
          </form>
        )}

        {mode === "check" && checkPhase === "done" && backupCodes && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Account created. Save these backup codes.</p>
            <TotpBackupCodesList codes={backupCodes} />
            <button
              type="button"
              className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Continue to station
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleField({
  module,
  value,
  countryOptions = [],
  onChange,
}: {
  module: RegistrationPublicConfig["flowModules"] extends (infer M)[] | undefined ? M : never;
  value: string | string[] | undefined;
  countryOptions?: RegistrationPublicConfig["countryOptions"];
  onChange: (value: string | string[]) => void;
}) {
  if (module.type === "yesno") {
    const selected = typeof value === "string" ? value : "";
    return (
      <fieldset className="border-0 p-0 m-0 min-w-0">
        <legend className="block w-full text-sm text-gray-300 mb-3">{module.label}</legend>
        <div className="flex flex-col gap-3">
          {(["yes", "no"] as const).map((opt) => (
            <FormRadio
              key={opt}
              name={module.id}
              value={opt}
              checked={selected === opt}
              onChange={() => onChange(opt)}
              label={opt === "yes" ? "Yes" : "No"}
            />
          ))}
        </div>
      </fieldset>
    );
  }
  if (module.type === "country") {
    const selected = typeof value === "string" ? value : "";
    return (
      <label className="block text-sm text-gray-300">
        {module.label}
        <FormSelect
          value={selected}
          onChange={onChange}
          options={countryOptions || []}
          placeholder="Select country / region…"
          searchable
        />
      </label>
    );
  }
  if (module.type === "textarea") {
    return (
      <label className="block text-sm text-gray-300">
        {module.label}
        <textarea
          className={`${registrationFieldClass} min-h-[120px] resize-y`}
          value={typeof value === "string" ? value : ""}
          placeholder={module.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  if (module.type === "select") {
    const selected = typeof value === "string" ? value : "";
    return (
      <fieldset className="border-0 p-0 m-0 min-w-0">
        <legend className="block w-full text-sm text-gray-300 mb-1">{module.label}</legend>
        <p className="text-xs text-gray-500 mb-3">Choose one</p>
        <div className="flex flex-col gap-3">
          {(module.options || []).map((opt) => (
            <FormRadio
              key={opt.value}
              name={module.id}
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => onChange(opt.value)}
              label={opt.label}
            />
          ))}
        </div>
      </fieldset>
    );
  }
  if (module.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="border-0 p-0 m-0 min-w-0">
        <legend className="block w-full text-sm text-gray-300 mb-1">{module.label}</legend>
        <p className="text-xs text-gray-500 mb-3">Choose all that apply</p>
        <div className="flex flex-col gap-3">
          {(module.options || []).map((opt) => (
            <FormCheckbox
              key={opt.value}
              checked={selected.includes(opt.value)}
              onChange={(checked) => {
                if (checked) onChange([...selected, opt.value]);
                else onChange(selected.filter((v) => v !== opt.value));
              }}
              label={opt.label}
            />
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="block text-sm text-gray-300">
      {module.label}
      <input
        className={registrationFieldClass}
        value={typeof value === "string" ? value : ""}
        placeholder={module.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const REGISTRATION_DISPLAY_NAME_MAX = 80;

function canAdvanceApplyStep(
  step: ReturnType<typeof buildRegistrationWizardSteps>[number] | undefined,
  ctx: {
    displayName: string;
    email: string;
    consentAgreed: boolean;
    answers: Record<string, string | string[]>;
    config: RegistrationPublicConfig;
  },
): boolean {
  if (!step) return false;
  if (step.kind === "email") {
    const name = ctx.displayName.trim().replace(/\s+/g, " ");
    return (
      name.length >= 1 &&
      name.length <= REGISTRATION_DISPLAY_NAME_MAX &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.email.trim())
    );
  }
  if (step.kind === "consent") return ctx.consentAgreed;
  if (step.kind === "module") {
    const mod = step.module;
    if (!moduleVisible(mod, ctx.answers)) return true;
    const raw = ctx.answers[mod.id];
    if (mod.type === "multiselect") {
      return !mod.required || (Array.isArray(raw) && raw.length > 0);
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (mod.required && !value) return false;
    if (mod.type === "textarea" && value) {
      const min = mod.minLength ?? 0;
      if (value.length < min) return false;
    }
    return true;
  }
  return true;
}
