import { useEffect, useState } from "react";
import { api } from "../api/client";

interface SetupPageProps {
  onComplete: () => void;
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const [step, setStep] = useState<"unlock" | "create">("unlock");
  const [bootstrapUsername, setBootstrapUsername] = useState("admin");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState(window.location.origin);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    void api
      .setupStatus()
      .then((s) => {
        setBootstrapUsername(s.bootstrapUsername ?? "admin");
        if (s.unlocked) setStep("create");
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.setupUnlock({
        username: bootstrapUsername,
        bootstrapToken,
      });
      setStep("create");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid setup credentials");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.completeSetup({
        username,
        password,
        publicBaseUrl,
        allowedOrigins: [window.location.origin],
      });
      onComplete();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      {step === "unlock" ? (
        <form
          onSubmit={unlock}
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl space-y-4"
        >
          <h1 className="text-2xl font-bold text-white">CollabFM Radio Setup</h1>
          <p className="text-sm text-gray-400">
            Check the server console for the setup token. Unlock with the temporary{" "}
            <span className="text-gray-300">admin</span> credentials shown there — then create
            your real admin account.
          </p>

          <label className="block text-sm text-gray-300">
            Setup username
            <input
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white"
              value={bootstrapUsername}
              readOnly
            />
          </label>

          <label className="block text-sm text-gray-300">
            Setup token
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white font-mono text-sm"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2 hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Unlocking…" : "Unlock setup"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={submit}
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl space-y-4"
        >
          <h1 className="text-2xl font-bold text-white">Create admin account</h1>
          <p className="text-sm text-gray-400">
            Choose the username and password you will use to sign in after setup. Do not use{" "}
            <span className="text-gray-300">admin</span> — that name is only for the one-time
            setup token.
          </p>

          <label className="block text-sm text-gray-300">
            Admin username
            <input
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              required
            />
          </label>

          <label className="block text-sm text-gray-300">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          <label className="block text-sm text-gray-300">
            Confirm password
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </label>

          <label className="block text-sm text-gray-300">
            Public base URL
            <input
              className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-radio-accent text-gray-900 font-semibold py-2 hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Complete setup"}
          </button>
        </form>
      )}
    </div>
  );
}
