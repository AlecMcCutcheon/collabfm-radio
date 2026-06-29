import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { api } from "../../api/client";
import { FMA_CC_SEARCH_URL } from "../../constants/fma";
import { JAMENDO_EXPLORE_URL } from "../../constants/jamendo";
import type {
  ContentPolicy,
  ContentPolicyAction,
  ContentPolicyMatch,
  ContentPolicyRule,
} from "../../types/api";
import {
  AdminBtn,
  AdminCheckbox,
  AdminField,
  AdminSection,
  AdminSelect,
  adminInlineRowClass,
  adminFormControlClass,
  adminListItemClass,
  adminTextareaClass,
} from "./adminUi";

const ACTION_OPTIONS: Array<{ value: ContentPolicyAction; label: string }> = [
  { value: "allow", label: "Allow" },
  { value: "warn", label: "Warn" },
  { value: "deny", label: "Deny" },
];

const SAFEGUARDS_CONFIRMATION_PHRASE =
  "I solemnly swear to only broadcast content I have the right to share";

function ContentPolicySafeguardsUnlockModal({
  open,
  onClose,
  onUnlock,
}: {
  open: boolean;
  onClose: () => void;
  onUnlock: () => void;
}) {
  const [typedConfirmation, setTypedConfirmation] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedConfirmation("");
    }
  }, [open]);

  if (!open) return null;

  const phraseMatches = typedConfirmation.trim() === SAFEGUARDS_CONFIRMATION_PHRASE;
  const canUnlock = phraseMatches;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-gray-900 p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="content-policy-unlock-title"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2 min-w-0">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden />
            <div>
              <h3 id="content-policy-unlock-title" className="text-lg font-semibold text-white">
                Unlock safety rails?
              </h3>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                These global controls apply conservative default policy behavior. Unlocking them
                allows enforcement to be relaxed or disabled, including deny-by-default fallback
                rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed mb-4">
          The content policy is a filtering tool, not a copyright detector. CollabFM does not
          verify copyright ownership, licensing status, or legal compliance. You are responsible
          for this instance&apos;s configuration and for ensuring broadcasts comply with applicable
          copyright and licensing requirements.
        </p>

        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-white">Confirmation</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Type the phrase below exactly to unlock safety rails.
            </p>
          </div>

          <div className="rounded-lg border border-gray-600/70 bg-gray-900/70 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              Phrase to type
              <span className="normal-case tracking-normal text-gray-600"> · not a legal oath</span>
            </p>
            <p className="text-sm text-gray-300 font-mono leading-relaxed">
              {SAFEGUARDS_CONFIRMATION_PHRASE}
            </p>
          </div>

          <textarea
            className={`${adminTextareaClass} min-h-[72px] font-mono text-sm !mt-0`}
            value={typedConfirmation}
            onChange={(e) => setTypedConfirmation(e.target.value)}
            placeholder="Type here…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Confirmation phrase"
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <AdminBtn disabled={!canUnlock} onClick={onUnlock}>
            Unlock safety rails
          </AdminBtn>
          <AdminBtn variant="secondary" onClick={onClose}>
            Cancel
          </AdminBtn>
        </div>
      </div>
    </div>
  );
}

function actionBadgeClass(action: ContentPolicyAction): string {
  if (action === "allow") return "border-green-800/60 bg-green-950/40 text-green-300";
  if (action === "warn") return "border-amber-700/60 bg-amber-950/40 text-amber-300";
  return "border-red-800/60 bg-red-950/40 text-red-300";
}

function ActionBadge({ action }: { action: ContentPolicyAction }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${actionBadgeClass(action)}`}
    >
      {action}
    </span>
  );
}

function parseParentheticalArtistName(value: string): { name: string; altNames: string[] } | null {
  const match = value.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;
  const name = match[1].trim();
  const altNames = match[2]
    .split(/[,&]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!name || altNames.length === 0) return null;
  return { name, altNames };
}

function withoutLegacyRules(policy: ContentPolicy): ContentPolicy {
  return {
    ...policy,
    licenseMissing: policy.licenseMissing ?? "allow",
    licenseNoMatch: policy.licenseNoMatch ?? "allow",
    allowedLicenses: policy.allowedLicenses ?? [],
    rules: policy.rules
      .filter((rule) => rule.match !== "metadata_missing")
      .map((rule) => {
        if (rule.match !== "artist" || rule.altNames?.length) return rule;
        const parsed = parseParentheticalArtistName(rule.value);
        if (!parsed) return rule;
        return { ...rule, value: parsed.name, altNames: parsed.altNames };
      }),
  };
}

function altNamesToText(altNames?: string[]): string {
  return (altNames ?? []).join("\n");
}

function parseAltNamesText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function licensesToText(licenses?: string[]): string {
  return (licenses ?? []).join("\n");
}

function parseLicensesText(text: string): string[] {
  return parseAltNamesText(text);
}

function RuleList({
  rules,
  onRemove,
  onUpdate,
  emptyMessage,
  valuePlaceholder,
  showAltNames = false,
}: {
  rules: ContentPolicyRule[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, value: string, action: ContentPolicyAction, altNames?: string[]) => void;
  emptyMessage: string;
  valuePlaceholder: string;
  showAltNames?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    value: "",
    action: "allow" as ContentPolicyAction,
    altNamesText: "",
  });

  const startEdit = (rule: ContentPolicyRule) => {
    setEditingId(rule.id);
    setDraft({
      value: rule.value,
      action: rule.action,
      altNamesText: altNamesToText(rule.altNames),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft.value.trim()) return;
    const altNames = showAltNames ? parseAltNamesText(draft.altNamesText) : undefined;
    onUpdate(editingId, draft.value.trim(), draft.action, altNames);
    setEditingId(null);
  };

  if (rules.length === 0) {
    return <p className="text-sm text-gray-500 mb-3 mt-1.5">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2 mb-3 mt-1.5">
      {rules.map((rule) => (
        <li key={rule.id} className={adminListItemClass}>
          {editingId === rule.id ? (
            <div className="space-y-3">
              <div className={`${adminInlineRowClass} sm:items-end`}>
                <input
                  type="text"
                  className={`${adminFormControlClass} w-full sm:flex-1 sm:min-w-0`}
                  placeholder={valuePlaceholder}
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                />
                <select
                  className={`${adminFormControlClass} w-full sm:w-28`}
                  value={draft.action}
                  onChange={(e) =>
                    setDraft({ ...draft, action: e.target.value as ContentPolicyAction })
                  }
                >
                  {ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {showAltNames ? (
                <div className="block">
                  <span className="block text-xs text-gray-500 mb-1">Alternate names</span>
                  <span className="block text-xs text-gray-600 mb-1.5 normal-case tracking-normal">
                    One per line — other artist strings that should match this rule.
                  </span>
                  <textarea
                    className={`${adminTextareaClass} min-h-[72px]`}
                    placeholder={"Alternate name\nAnother alias"}
                    value={draft.altNamesText}
                    onChange={(e) => setDraft({ ...draft, altNamesText: e.target.value })}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <AdminBtn
                  className="!h-8 !min-h-8 !px-3 text-xs"
                  onClick={saveEdit}
                  disabled={!draft.value.trim()}
                >
                  Save
                </AdminBtn>
                <AdminBtn variant="secondary" className="!h-8 !min-h-8 !px-3 text-xs" onClick={cancelEdit}>
                  Cancel
                </AdminBtn>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-200 break-words font-mono">{rule.value}</span>
                  <ActionBadge action={rule.action} />
                </div>
                {showAltNames && rule.altNames && rule.altNames.length > 0 ? (
                  <p className="text-xs text-gray-500">
                    Also matches:{" "}
                    <span className="text-gray-400">{rule.altNames.join(", ")}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <AdminBtn
                  variant="secondary"
                  className="w-full !h-8 !min-h-8 !px-3 text-xs sm:w-auto"
                  onClick={() => startEdit(rule)}
                >
                  Edit
                </AdminBtn>
                <AdminBtn
                  variant="danger"
                  className="w-full !h-8 !min-h-8 !px-3 text-xs sm:w-auto"
                  onClick={() => onRemove(rule.id)}
                >
                  Remove
                </AdminBtn>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ContentPolicyAdminSectionProps {
  flash: (msg: string) => void;
  onError: (msg: string) => void;
}

export function ContentPolicyAdminSection({ flash, onError }: ContentPolicyAdminSectionProps) {
  const [policy, setPolicy] = useState<ContentPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [safeguardsUnlocked, setSafeguardsUnlocked] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [newSource, setNewSource] = useState({ value: "", action: "allow" as ContentPolicyAction });
  const [newArtist, setNewArtist] = useState({ value: "", action: "allow" as ContentPolicyAction });

  const reload = async () => {
    const res = await api.adminContentPolicy();
    setPolicy(withoutLegacyRules(res.policy));
  };

  useEffect(() => {
    void reload().catch((err) =>
      onError(err instanceof Error ? err.message : "Failed to load content policy"),
    );
  }, [onError]);

  const save = async (next: ContentPolicy) => {
    setBusy(true);
    onError("");
    try {
      const cleaned = withoutLegacyRules(next);
      const res = await api.saveAdminContentPolicy(cleaned);
      setPolicy(withoutLegacyRules(res.policy));
      flash("Content policy saved");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = async () => {
    setBusy(true);
    onError("");
    try {
      const res = await api.resetAdminContentPolicy();
      setPolicy(withoutLegacyRules(res.policy));
      flash("Content policy reset to defaults");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const addRule = (match: ContentPolicyMatch, value: string, action: ContentPolicyAction) => {
    if (!policy) return;
    if (!value.trim()) {
      onError("Rule value is required");
      return;
    }
    const rule: ContentPolicyRule = {
      id: crypto.randomUUID(),
      match,
      value: value.trim(),
      action,
    };
    void save({ ...policy, rules: [...policy.rules, rule] });
  };

  const removeRule = (id: string) => {
    if (!policy) return;
    void save({ ...policy, rules: policy.rules.filter((r) => r.id !== id) });
  };

  const updateRule = (
    id: string,
    value: string,
    action: ContentPolicyAction,
    altNames?: string[],
  ) => {
    if (!policy) return;
    setPolicy({
      ...policy,
      rules: policy.rules.map((r) => {
        if (r.id !== id) return r;
        const next: ContentPolicyRule = { ...r, value, action };
        if (r.match === "artist") {
          if (altNames && altNames.length > 0) {
            next.altNames = altNames;
          } else {
            delete next.altNames;
          }
        }
        return next;
      }),
    });
  };

  if (!policy) {
    return (
      <AdminSection title="Content policy" description="Loading…">
        <p className="text-sm text-gray-400">Loading content policy…</p>
      </AdminSection>
    );
  }

  const sourceRules = policy.rules.filter((rule) => rule.match === "source");
  const artistRules = policy.rules.filter((rule) => rule.match === "artist");

  return (
    <AdminSection
      title="Content policy"
      description="CollabFM does not host or provide audio content—it relays broadcaster-supplied streams. CollabFM provides a configurable content policy to help server operators and broadcasters manage what audio may be relayed through their station. New installations ship with conservative default rules intended to mitigate accidental misuse and encourage responsible streaming practices."
    >
      <p className="text-sm text-gray-400 leading-relaxed">
        The policy engine evaluates metadata provided by the browser extension or submitted through
        the CollabFM API. Source and artist rules are checked in order, and the first matching rule
        determines the outcome. Configurable fallback actions apply when metadata is missing or no
        rule matches. When a source or artist rule allows a track, license metadata may be required
        depending on your safety rail settings. Filtering is best-effort—it does not analyze or
        fingerprint audio.
      </p>

      <p className="text-sm text-gray-300 leading-relaxed">
        The policy engine is a <strong className="font-medium text-gray-200">filtering tool</strong>
        , not a copyright detector. It attempts best-effort filtering using your configured
        allowlists and fallbacks on reported source, track, and license metadata. It does not analyze
        audio, fingerprint tracks, verify licenses, or determine whether content is legally cleared
        to stream. Default policy targets Free Music Archive (
        <a
          href={FMA_CC_SEARCH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-radio-accent hover:underline"
        >
          CC search
        </a>
        ) and{" "}
        <a
          href={JAMENDO_EXPLORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-radio-accent hover:underline"
        >
          Jamendo (explore)
        </a>
        — default sources where the extension reports machine-readable license metadata per track. Inclusion does not mean those catalogs are guaranteed legally safe to broadcast; admins must verify compliance (attribution, share-alike, platform terms, and metadata accuracy).
      </p>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-gray-300 leading-relaxed">
        <p>
          CollabFM does not host, store, or provide any audio content. It does not verify copyright
          ownership, licensing status, or legal compliance.
        </p>
        <p className="mt-2">
          Server administrators and individual broadcasters are solely responsible for ensuring they
          have the necessary rights, licenses, or permissions to stream any audio through their
          CollabFM instance.
        </p>
        <p className="mt-2 text-gray-400">
          These controls are intended to promote responsible use and help reduce accidental policy
          violations. They are not a substitute for understanding and complying with applicable
          copyright, licensing, or other legal requirements. CollabFM does not condone intentional
          misuse or deliberate circumvention of this policy.
        </p>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Lock
              className={`w-4 h-4 shrink-0 ${safeguardsUnlocked ? "text-gray-500" : "text-amber-400"}`}
              aria-hidden
            />
            <span className={safeguardsUnlocked ? "text-gray-400" : "text-amber-200 font-medium"}>
              {safeguardsUnlocked ? "Safety rails unlocked" : "Safety rails locked"}
            </span>
          </div>
          {safeguardsUnlocked ? (
            <AdminBtn
              variant="secondary"
              className="!h-8 !min-h-8 !px-3 text-xs"
              onClick={() => setSafeguardsUnlocked(false)}
            >
              Lock again
            </AdminBtn>
          ) : (
            <AdminBtn
              variant="secondary"
              className="!h-8 !min-h-8 !px-3 text-xs"
              onClick={() => setUnlockModalOpen(true)}
            >
              Unlock safety rails
            </AdminBtn>
          )}
        </div>

        <div
          className={`space-y-4 ${safeguardsUnlocked ? "" : "pointer-events-none opacity-60"}`}
          aria-disabled={!safeguardsUnlocked}
        >
          <AdminCheckbox
            checked={policy.enabled}
            disabled={!safeguardsUnlocked}
            onChange={(enabled) => setPolicy({ ...policy, enabled })}
            label="Enable content policy enforcement"
            hint="When off, all broadcasts are allowed (decisions are not logged as denials)."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="When metadata is missing" hint="No usable artist/title from the tab.">
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.metadataMissing}
                onChange={(e) =>
                  setPolicy({ ...policy, metadataMissing: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField
              label="When artist does not match"
              hint="Track metadata present but artist is not on the allowlist."
            >
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.artistNoMatch}
                onChange={(e) =>
                  setPolicy({ ...policy, artistNoMatch: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField
              label="When source does not match"
              hint="Reserved for future source-only checks; defaults to deny."
            >
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.sourceNoMatch}
                onChange={(e) =>
                  setPolicy({ ...policy, sourceNoMatch: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Default action" hint="Last resort when no rule matches.">
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.defaultAction}
                onChange={(e) =>
                  setPolicy({ ...policy, defaultAction: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField
              label="When license is missing"
              hint="No license type or URL reported for an otherwise allowed track."
            >
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.licenseMissing}
                onChange={(e) =>
                  setPolicy({ ...policy, licenseMissing: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField
              label="When license is not allowed"
              hint="License metadata present but not matching the allowlist below."
            >
              <AdminSelect
                disabled={!safeguardsUnlocked}
                value={policy.licenseNoMatch}
                onChange={(e) =>
                  setPolicy({ ...policy, licenseNoMatch: e.target.value as ContentPolicyAction })
                }
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>

          <AdminField
            label="Allowed licenses"
            hint="One license per line. Creative Commons names accept flexible spelling (CC BY SA, CC-BY-SA, and creativecommons.org license URLs all match the same kind). Custom text uses substring matching."
          >
            <textarea
              className={`${adminTextareaClass} min-h-[96px] font-mono text-sm`}
              disabled={!safeguardsUnlocked}
              value={licensesToText(policy.allowedLicenses)}
              onChange={(e) =>
                setPolicy({ ...policy, allowedLicenses: parseLicensesText(e.target.value) })
              }
              placeholder={"CC BY\nCC BY-SA\nCC BY-NC\nCC BY-NC-SA\nCC BY-ND\nCC BY-NC-ND\nCC0"}
              spellCheck={false}
            />
          </AdminField>
        </div>

        {!safeguardsUnlocked ? (
          <p className="text-xs text-gray-500">
            Source and artist allowlists remain editable below. Unlock to change enforcement and
            global fallbacks.
          </p>
        ) : null}
      </div>

      <AdminField
        label="Allowed sources"
        hint="Hostname rules checked in list order. First match wins."
      >
        <RuleList
          rules={sourceRules}
          onRemove={removeRule}
          onUpdate={updateRule}
          emptyMessage="No source rules yet."
          valuePlaceholder="freemusicarchive.org"
        />
        <div className={`${adminInlineRowClass} mt-1.5 sm:items-end`}>
          <input
            type="text"
            className={`${adminFormControlClass} w-full sm:flex-1 sm:min-w-0`}
            placeholder="freemusicarchive.org"
            value={newSource.value}
            onChange={(e) => setNewSource({ ...newSource, value: e.target.value })}
          />
          <select
            className={`${adminFormControlClass} w-full sm:w-28`}
            value={newSource.action}
            onChange={(e) =>
              setNewSource({ ...newSource, action: e.target.value as ContentPolicyAction })
            }
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <AdminBtn
            variant="secondary"
            className="w-full sm:w-auto shrink-0"
            onClick={() => {
              addRule("source", newSource.value, newSource.action);
              setNewSource({ value: "", action: "allow" });
            }}
          >
            Add source
          </AdminBtn>
        </div>
      </AdminField>

      <AdminField
        label="Allowed artists"
        hint="Artist rules checked after source rules. First match wins."
      >
        <RuleList
          rules={artistRules}
          onRemove={removeRule}
          onUpdate={updateRule}
          emptyMessage="No artist rules yet."
          valuePlaceholder="Artist name"
          showAltNames
        />
        <div className={`${adminInlineRowClass} mt-1.5 sm:items-end`}>
          <input
            type="text"
            className={`${adminFormControlClass} w-full sm:flex-1 sm:min-w-0`}
            placeholder="Artist name"
            value={newArtist.value}
            onChange={(e) => setNewArtist({ ...newArtist, value: e.target.value })}
          />
          <select
            className={`${adminFormControlClass} w-full sm:w-28`}
            value={newArtist.action}
            onChange={(e) =>
              setNewArtist({ ...newArtist, action: e.target.value as ContentPolicyAction })
            }
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <AdminBtn
            variant="secondary"
            className="w-full sm:w-auto shrink-0"
            onClick={() => {
              addRule("artist", newArtist.value, newArtist.action);
              setNewArtist({ value: "", action: "allow" });
            }}
          >
            Add artist
          </AdminBtn>
        </div>
      </AdminField>

      <div className="flex flex-wrap gap-2">
        <AdminBtn disabled={busy} onClick={() => void save(policy)}>
          Save content policy
        </AdminBtn>
        <AdminBtn variant="secondary" disabled={busy || !safeguardsUnlocked} onClick={() => void resetDefaults()}>
          Reset to defaults
        </AdminBtn>
      </div>

      <ContentPolicySafeguardsUnlockModal
        open={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        onUnlock={() => {
          setSafeguardsUnlocked(true);
          setUnlockModalOpen(false);
          flash("Safety rails unlocked — global policy controls are editable");
        }}
      />
    </AdminSection>
  );
}
