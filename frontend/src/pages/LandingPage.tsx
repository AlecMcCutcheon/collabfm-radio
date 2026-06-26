import { useCallback, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { api } from "../api/client";
import { apiUrl } from "../config";
import { TurnstileWidget } from "../components/TurnstileWidget";
import {
  imageFallbackHandler,
  proceduralStationLogo,
  resolveBrandingImageUrl,
} from "../utils/brandingImage";

export function LandingPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidc, setOidc] = useState(false);
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

  useEffect(() => {
    void api.authMethods().then((m) => {
      setOidc(m.oidc);
      setTurnstileSiteKey(m.turnstileSiteKey || null);
      setSsoNickname(m.ssoNickname || null);
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
  }, []);

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
      await api.localLogin(username, password, turnstileToken || undefined);
      window.location.href = "/";
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Turnstile") || message.includes("Verification")) {
        setError("Human verification failed. Please try again.");
      } else {
        setError("Invalid username or password");
      }
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const ssoLabel = ssoNickname ? `Login With ${ssoNickname}` : "Sign in with SSO";

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

        <h2 className="text-lg font-semibold text-white mb-4">Login to your account</h2>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Username
            <input
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
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
        </form>

        {oidc && (
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
