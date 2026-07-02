import { useEffect, useState } from "react";
import { api } from "../api/client";

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

export function TempPasswordRecoveryPage() {
  const [loginEmail, setLoginEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .tempPasswordStatus()
      .then((res) => {
        setLoginEmail(res.user.loginEmail || res.user.username);
        setDisplayName(res.user.displayName || res.user.username);
        setNotice(res.notice || "");
      })
      .catch(() => {
        window.location.href = "/";
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.verifyTempPassword(password);
      window.location.href = "/";
    } catch (err) {
      setError(apiErrorMessage(err, "Temporary password is incorrect"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-white">Temporary password required</h1>
        <p className="mt-2 text-sm text-gray-400">
          {notice || "SSO verified your identity. Enter the temporary password from your administrator to continue."}
        </p>

        <div className="mt-5 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Account</p>
          <p className="mt-1 text-sm text-white">{displayName}</p>
          <p className="text-xs text-gray-400 font-mono break-all">{loginEmail}</p>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm text-gray-300">
            Temporary password
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-radio-accent/60 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Temporary password"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2.5 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
