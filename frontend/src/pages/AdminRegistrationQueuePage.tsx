import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, MapPin } from "lucide-react";
import { api } from "../api/client";
import { AdminConfirmDialog } from "../components/admin/AdminConfirmDialog";
import { AdminSettingsBackButton } from "../components/admin/AdminRegistrationNav";
import {
  AdminBtn,
  AdminField,
  AdminInput,
  AdminSection,
  AdminSelect,
} from "../components/admin/adminUi";
import type {
  RegistrationApplicantGeo,
  RegistrationCountryVerification,
  RegistrationRequestSummary,
} from "../types/api";
import {
  formatRegistrationStatus,
  registrationStatusBadgeClass,
} from "../utils/registrationStatus";

const STATUS_OPTIONS = ["", "pending", "approved", "denied", "activated"] as const;

function formatRequestTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatGeo(geo: RegistrationApplicantGeo): string {
  const line = [geo.city, geo.regionName, geo.country].filter(Boolean).join(", ");
  const location = geo.zip ? `${line}${line ? " " : ""}${geo.zip}` : line;
  return geo.countryCode ? `${location} · ${geo.countryCode}` : location;
}

function CountryVerificationNote({ check }: { check: RegistrationCountryVerification }) {
  if (!check.geoCode) return null;

  const selected = check.selectedCode
    ? `${check.selectedName || check.selectedCode} (${check.selectedCode})`
    : "Not provided";
  const geo = `${check.geoName || check.geoCode} (${check.geoCode})`;

  if (check.matches === true) {
    return (
      <p className="text-xs rounded-md border border-green-800/60 bg-green-950/30 px-2.5 py-2 text-green-200">
        Country match — selected {check.selectedCode}, IP geo {check.geoCode}
      </p>
    );
  }

  if (check.matches === false) {
    return (
      <p className="text-xs rounded-md border border-amber-700/60 bg-amber-950/30 px-2.5 py-2 text-amber-100">
        <span className="font-medium text-amber-200">Country mismatch</span>
        {" — "}
        selected {selected}, IP geo suggests {geo}
      </p>
    );
  }

  return (
    <p className="text-xs rounded-md border border-gray-700 bg-gray-900/50 px-2.5 py-2 text-gray-400">
      IP geo suggests {geo}
    </p>
  );
}

function maskRegistrationToken(token: string): string {
  return token
    .split("-")
    .map((part, index) => (index === 0 ? part : "•".repeat(part.length)))
    .join("-");
}

function RegistrationTokenBlock({
  token,
  canRegenerate,
  onRegenerate,
  busy = false,
}: {
  token: string | null | undefined;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [token]);

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-radio-accent/25 bg-gray-900/50 p-3.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Registration token
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Share with the applicant only if they lost their copy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {token ? (
            <>
              <button
                type="button"
                onClick={() => setRevealed((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                aria-pressed={revealed}
              >
                {revealed ? (
                  <EyeOff className="w-3.5 h-3.5" aria-hidden />
                ) : (
                  <Eye className="w-3.5 h-3.5" aria-hidden />
                )}
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                type="button"
                onClick={() => void copyToken()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </button>
            </>
          ) : null}
          {canRegenerate && onRegenerate ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerate}
              className="inline-flex items-center rounded-lg border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-50"
            >
              Issue new token
            </button>
          ) : null}
        </div>
      </div>
      {token ? (
        <p
          className={`font-mono text-sm break-all leading-relaxed tracking-wide ${
            revealed ? "text-radio-accent" : "text-gray-500"
          }`}
        >
          {revealed ? token : maskRegistrationToken(token)}
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          Not available for this request. Issue a new token to give the applicant a fresh code.
        </p>
      )}
    </div>
  );
}

function RequestTimeline({ request }: { request: RegistrationRequestSummary }) {
  const items = [
    { label: "Submitted", at: request.submittedAt },
    request.reviewedAt ? { label: "Reviewed", at: request.reviewedAt } : null,
    request.activatedAt ? { label: "Activated", at: request.activatedAt } : null,
  ].filter(Boolean) as { label: string; at: string }[];

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="inline text-gray-500">{item.label}: </dt>
          <dd className="inline text-gray-400">{formatRequestTimestamp(item.at)}</dd>
        </div>
      ))}
    </dl>
  );
}

function RequestMetadata({ request }: { request: RegistrationRequestSummary }) {
  const hasIp = !!request.applicantIp;
  const hasGeo = !!request.applicantGeo && formatGeo(request.applicantGeo);

  if (!hasIp && !hasGeo) return null;

  return (
    <div className="rounded-lg border border-gray-700/80 bg-gray-900/35 p-3.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Network & location
      </p>
      {hasIp && (
        <p className="text-sm text-gray-300">
          <span className="text-gray-500">IP </span>
          <span
            className="font-mono text-gray-200"
            title={
              request.applicantIpIsLocal
                ? "Private or local address — not a public IP"
                : "Public IP at submission time"
            }
          >
            {request.applicantIp}
          </span>
          {request.applicantIpIsLocal ? (
            <span className="text-gray-500"> (local / private)</span>
          ) : null}
        </p>
      )}
      {request.applicantIpIsLocal ? (
        <p className="text-xs text-gray-500">Geolocation skipped — not a public IP address</p>
      ) : hasGeo ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-300 flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-500" aria-hidden />
            <span>{formatGeo(request.applicantGeo!)}</span>
          </p>
          {request.countryVerification && (
            <CountryVerificationNote check={request.countryVerification} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function ApplicationAnswers({
  summary,
  consentAgreement,
}: {
  summary: RegistrationRequestSummary["summary"];
  consentAgreement?: { title: string } | null;
}) {
  if (summary.length === 0 && !consentAgreement?.title) return null;

  return (
    <div className="space-y-2.5">
      {summary.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Application answers
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-gray-700/80 bg-gray-900/40 px-3.5 py-3 min-w-0"
              >
                <p className="text-xs font-medium text-gray-400 mb-1.5 leading-snug">{row.label}</p>
                <p className="text-sm text-gray-100 whitespace-pre-wrap break-words leading-relaxed">
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      {consentAgreement?.title && (
        <p className="text-xs rounded-lg border border-gray-700/80 bg-gray-900/35 px-3.5 py-2.5 text-gray-400">
          Applicant agreed to{" "}
          <span className="text-gray-200 font-medium">{consentAgreement.title}</span>
        </p>
      )}
    </div>
  );
}

function RegistrationRequestCard({
  request,
  busyId,
  denyId,
  denyReason,
  onApprove,
  onDenyClick,
  onDenyReasonChange,
  onConfirmDeny,
  onCancelDeny,
  onDeleteClick,
  onRegenerateClick,
}: {
  request: RegistrationRequestSummary;
  busyId: number | null;
  denyId: number | null;
  denyReason: string;
  onApprove: (id: number) => void;
  onDenyClick: (id: number) => void;
  onDenyReasonChange: (value: string) => void;
  onConfirmDeny: (id: number) => void;
  onCancelDeny: () => void;
  onDeleteClick: (id: number) => void;
  onRegenerateClick: (id: number) => void;
}) {
  const canRegenerate = request.status === "pending" || request.status === "approved";

  return (
    <li className="rounded-xl border border-gray-700/90 bg-gray-800/45 overflow-hidden shadow-sm">
      <div className="px-4 py-4 sm:px-5 border-b border-gray-700/70 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {request.displayName ? (
            <>
              <p className="text-lg font-semibold text-white break-words leading-snug">
                {request.displayName}
              </p>
              <p className="text-sm text-gray-400 break-all">{request.email}</p>
            </>
          ) : (
            <p className="text-base font-semibold text-white break-all">{request.email}</p>
          )}
          <RequestTimeline request={request} />
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full capitalize shrink-0 ${registrationStatusBadgeClass(request.status)}`}
        >
          {formatRegistrationStatus(request.status)}
        </span>
      </div>

      <div className="px-4 py-4 sm:px-5 space-y-4">
        <RegistrationTokenBlock
          token={request.registrationToken}
          canRegenerate={canRegenerate}
          busy={busyId === request.id}
          onRegenerate={() => onRegenerateClick(request.id)}
        />
        <RequestMetadata request={request} />
        <ApplicationAnswers
          summary={request.summary}
          consentAgreement={request.consentAgreement}
        />

        {request.denyReason && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-300/80 mb-1">
              Deny reason
            </p>
            <p className="text-sm text-red-100 whitespace-pre-wrap">{request.denyReason}</p>
          </div>
        )}

        {request.status === "pending" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <AdminBtn disabled={busyId === request.id} onClick={() => onApprove(request.id)}>
              Approve
            </AdminBtn>
            <AdminBtn
              className="!bg-gray-700 !text-white hover:!brightness-110"
              disabled={busyId === request.id}
              onClick={() => onDenyClick(request.id)}
            >
              Deny
            </AdminBtn>
          </div>
        )}

        {denyId === request.id && (
          <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/40 p-3.5">
            <AdminField label="Deny reason (optional)">
              <AdminInput
                value={denyReason}
                onChange={(e) => onDenyReasonChange(e.target.value)}
                placeholder="Optional message shown to the applicant"
              />
            </AdminField>
            <div className="flex flex-wrap gap-2">
              <AdminBtn disabled={busyId === request.id} onClick={() => onConfirmDeny(request.id)}>
                Confirm deny
              </AdminBtn>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-white px-3"
                onClick={onCancelDeny}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {request.status !== "activated" && (
          <div className="pt-1 border-t border-gray-700/60">
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-300 hover:underline"
              disabled={busyId === request.id}
              onClick={() => onDeleteClick(request.id)}
            >
              Delete request
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function AdminRegistrationQueuePage() {
  const [requests, setRequests] = useState<RegistrationRequestSummary[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [denyId, setDenyId] = useState<number | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [regenerateId, setRegenerateId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data = await api.adminRegistrationRequests(filter || undefined);
    setRequests(data.requests);
  }, [filter]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [load]);

  const approve = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api.approveRegistrationRequest(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api.denyRegistrationRequest(id, denyReason.trim() || undefined);
      setDenyId(null);
      setDenyReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api.deleteRegistrationRequest(id);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const regenerateToken = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api.regenerateRegistrationRequestToken(id);
      setRegenerateId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue new token");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="fixed top-4 left-4 z-50">
        <AdminSettingsBackButton />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-white mb-2">Registration queue</h1>
        <p className="text-sm text-gray-400 mb-6 max-w-2xl leading-relaxed">
          Review access requests, copy registration tokens when applicants need help, and approve
          or deny before they activate their account.
        </p>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <AdminSection title="Requests">
          <AdminField label="Filter by status">
            <AdminSelect value={filter} onChange={(e) => setFilter(e.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status || "all"} value={status}>
                  {status ? status.charAt(0).toUpperCase() + status.slice(1) : "All"}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          {requests.length === 0 ? (
            <p className="text-sm text-gray-500">No requests in this view.</p>
          ) : (
            <ul className="space-y-4">
              {requests.map((request) => (
                <RegistrationRequestCard
                  key={request.id}
                  request={request}
                  busyId={busyId}
                  denyId={denyId}
                  denyReason={denyReason}
                  onApprove={(id) => void approve(id)}
                  onDenyClick={(id) => {
                    setDenyId(id);
                    setDenyReason("");
                  }}
                  onDenyReasonChange={setDenyReason}
                  onConfirmDeny={(id) => void deny(id)}
                  onCancelDeny={() => setDenyId(null)}
                  onDeleteClick={setDeleteId}
                  onRegenerateClick={setRegenerateId}
                />
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      <AdminConfirmDialog
        open={regenerateId != null}
        onClose={() => setRegenerateId(null)}
        onConfirm={() => {
          if (regenerateId != null) void regenerateToken(regenerateId);
        }}
        title="Issue a new registration token?"
        confirmLabel={busyId === regenerateId ? "Issuing…" : "Issue new token"}
        busy={busyId === regenerateId}
      >
        <p>
          This replaces the applicant&apos;s current token. Any previous code they saved will stop
          working.
        </p>
        <p className="text-gray-400">Share the new token with them through a trusted channel.</p>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId != null) void remove(deleteId);
        }}
        title="Delete registration request?"
        confirmLabel={busyId === deleteId ? "Deleting…" : "Delete request"}
        busy={busyId === deleteId}
      >
        <p>This permanently removes the request and its stored answers.</p>
        <p className="text-amber-200/90">This cannot be undone.</p>
      </AdminConfirmDialog>
    </div>
  );
}
