import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { AdminSettingsBackButton } from "../components/admin/AdminRegistrationNav";
import { AdminConfirmDialog } from "../components/admin/AdminConfirmDialog";
import {
  AdminBtn,
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminSection,
  AdminSelect,
  AdminTextarea,
  adminListItemClass,
} from "../components/admin/adminUi";
import type {
  RegistrationFlowModule,
  RegistrationModuleOption,
  RegistrationModuleType,
  RegistrationSettings,
} from "../types/api";
import {
  choiceOptionFromLabel,
  createModuleUid,
  moduleEditorKey,
  normalizeChoiceOptions,
  syncAllModuleIdsFromLabels,
  syncModuleIdFromLabel,
} from "../utils/registrationOptions";

const ADD_MODULE_OPTIONS: { value: RegistrationModuleType; label: string }[] = [
  { value: "yesno", label: "Yes / No" },
  { value: "country", label: "Country / region" },
  { value: "select", label: "Multiple choice" },
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
];

function isChoiceModule(mod: RegistrationFlowModule): boolean {
  return mod.type === "select" || mod.type === "multiselect";
}

function isConditionSourceModule(mod: RegistrationFlowModule): boolean {
  return isChoiceModule(mod) || mod.type === "yesno";
}

function conditionOptionsForModule(mod: RegistrationFlowModule): RegistrationModuleOption[] {
  if (mod.type === "yesno") {
    return [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
  }
  return mod.options || [];
}

function moduleTypeLabel(mod: RegistrationFlowModule): string {
  if (mod.type === "yesno") return "Yes / No";
  if (mod.type === "country") return "Country / region";
  if (isChoiceModule(mod)) return "Multiple choice";
  if (mod.type === "text") return "Short text";
  return "Long text";
}

function newModule(type: RegistrationModuleType): RegistrationFlowModule {
  const uid = createModuleUid();
  const label =
    type === "yesno"
      ? "I agree that I am 18 or older"
      : type === "country"
        ? "Country / region"
        : "New question";
  const id = uid;
  if (type === "select" || type === "multiselect") {
    return {
      uid,
      id,
      type: "select",
      label: "New question",
      required: true,
      options: normalizeChoiceOptions(["Option A", "Option B"]),
    };
  }
  if (type === "yesno" || type === "country") {
    return {
      uid,
      id,
      type,
      label,
      required: true,
    };
  }
  return {
    uid,
    id,
    type,
    label,
    placeholder: "",
    required: true,
  };
}

function ShowWhenEditor({
  moduleIndex,
  module,
  allModules,
  onChange,
}: {
  moduleIndex: number;
  module: RegistrationFlowModule;
  allModules: RegistrationFlowModule[];
  onChange: (showWhen: RegistrationFlowModule["showWhen"]) => void;
}) {
  const priorSourceModules = allModules.slice(0, moduleIndex).filter(isConditionSourceModule);
  const enabled = !!module.showWhen;
  const sourceId = module.showWhen?.moduleId ?? "";
  const sourceModule =
    priorSourceModules.find((m) => m.id === sourceId) ?? priorSourceModules[0] ?? null;
  const sourceOptions = sourceModule ? conditionOptionsForModule(sourceModule) : [];
  const optionValue = module.showWhen?.equals ?? sourceOptions[0]?.value ?? "";

  if (priorSourceModules.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700/80 bg-gray-900/40 p-3">
      <AdminCheckbox
        checked={enabled}
        onChange={(checked) => {
          if (!checked) {
            onChange(undefined);
            return;
          }
          const first = priorSourceModules[0];
          const opts = conditionOptionsForModule(first);
          onChange({
            moduleId: first.id,
            equals: opts[0]?.value ?? "",
          });
        }}
        label="Only show when a previous answer matches"
        hint="Only Yes/No or multiple choice questions above this one can control visibility."
      />
      {enabled && sourceModule && (
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="When this question">
            <AdminSelect
              className="mt-0"
              value={sourceModule.id}
              onChange={(e) => {
                const nextSource = priorSourceModules.find((m) => m.id === e.target.value);
                if (!nextSource) return;
                const opts = conditionOptionsForModule(nextSource);
                const nextEquals = opts.some((o) => o.value === optionValue)
                  ? optionValue
                  : opts[0]?.value ?? "";
                onChange({ moduleId: nextSource.id, equals: nextEquals });
              }}
            >
              {priorSourceModules.map((m) => (
                <option key={moduleEditorKey(m)} value={m.id}>
                  {m.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Has this answer">
            <AdminSelect
              className="mt-0"
              value={optionValue}
              onChange={(e) =>
                onChange({ moduleId: sourceModule.id, equals: e.target.value })
              }
            >
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </div>
      )}
    </div>
  );
}

function ChoiceOptionsEditor({
  options,
  onChange,
}: {
  options: RegistrationModuleOption[];
  onChange: (options: RegistrationModuleOption[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const addOption = () => {
    const opt = choiceOptionFromLabel(draft);
    if (!opt) return;
    if (options.some((o) => o.value === opt.value)) {
      setDraftError("That option is already in the list");
      return;
    }
    onChange([...options, opt]);
    setDraft("");
    setDraftError(null);
  };

  return (
    <AdminField
      label="Options"
      hint="Type an option and press Enter or Add. Matching rules use lowercase keys (e.g. “Other” → other)."
    >
      <div className={`${adminListItemClass} space-y-2`}>
        <div className="flex gap-2">
          <AdminInput
            className="mt-0 flex-1"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption();
              }
            }}
            placeholder="e.g. Discord"
          />
          <AdminBtn type="button" className="shrink-0" onClick={addOption}>
            Add
          </AdminBtn>
        </div>
        {draftError && <p className="text-xs text-red-400">{draftError}</p>}
        {options.length > 0 ? (
          <ul className="space-y-1.5">
            {options.map((opt) => (
              <li
                key={opt.value}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2"
              >
                <span className="text-sm text-white">{opt.label}</span>
                <button
                  type="button"
                  className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition"
                  aria-label={`Remove ${opt.label}`}
                  onClick={() => onChange(options.filter((o) => o.value !== opt.value))}
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">No options yet.</p>
        )}
      </div>
    </AdminField>
  );
}

function FixedFieldPreview({ label, hint, placeholder }: { label: string; hint?: string; placeholder?: string }) {
  return (
    <div className="rounded-lg border border-gray-700/80 bg-gray-900/50 px-3.5 py-3 space-y-1.5">
      <p className="text-sm text-gray-200">{label}</p>
      {placeholder ? (
        <p className="text-sm text-gray-500 italic">{placeholder}</p>
      ) : (
        <div className="h-9 rounded-lg border border-gray-700 bg-gray-900/80" aria-hidden />
      )}
      {hint ? <p className="text-xs text-gray-500 leading-relaxed">{hint}</p> : null}
    </div>
  );
}

export function AdminRegistrationFormPage() {
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addType, setAddType] = useState<RegistrationModuleType>("select");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await api.adminRegistration();
    setSettings({
      ...data.settings,
      flowModules: data.settings.flowModules.map((mod) =>
        mod.uid ? mod : { ...mod, uid: createModuleUid() },
      ),
    });
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [load]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const flowModules = syncAllModuleIdsFromLabels(settings.flowModules);
      const result = await api.saveAdminRegistration({ ...settings, flowModules });
      setSettings(result.settings);
      flash("Registration settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetToDefaults = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.resetAdminRegistrationDefaults();
      setSettings({
        ...result.settings,
        flowModules: result.settings.flowModules.map((mod) =>
          mod.uid ? mod : { ...mod, uid: createModuleUid() },
        ),
      });
      setResetConfirmOpen(false);
      flash("Registration form reset to defaults");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const moveModule = (index: number, direction: -1 | 1) => {
    if (!settings) return;
    const next = [...settings.flowModules];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings({ ...settings, flowModules: next });
  };

  const updateModule = (index: number, patch: Partial<RegistrationFlowModule>) => {
    if (!settings) return;
    const next = settings.flowModules.map((mod, i) => (i === index ? { ...mod, ...patch } : mod));
    setSettings({ ...settings, flowModules: next });
  };

  const syncModuleIdOnBlur = (index: number) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        flowModules: syncModuleIdFromLabel(prev.flowModules, index),
      };
    });
  };

  const removeModule = (index: number) => {
    if (!settings) return;
    const removedId = settings.flowModules[index]?.id;
    setSettings({
      ...settings,
      flowModules: settings.flowModules
        .filter((_, i) => i !== index)
        .map((m) =>
          removedId && m.showWhen?.moduleId === removedId ? { ...m, showWhen: undefined } : m,
        ),
    });
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="fixed top-4 left-4 z-50">
        <AdminSettingsBackButton />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-white mb-2">Registration form</h1>
        <p className="text-sm text-gray-400 mb-6">
          Configure the public application flow. Built-in identity fields are always collected first; add or
          reorder custom questions below.
        </p>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        {saved && <p className="text-sm text-green-400 mb-4">{saved}</p>}

        <AdminSection
          title="Applicant IP & geolocation"
          description="Optional metadata captured when someone submits a registration request."
        >
          <AdminCheckbox
            checked={settings.saveApplicantIp !== false}
            onChange={(checked) =>
              setSettings({
                ...settings,
                saveApplicantIp: checked,
                hydrateApplicantGeo: checked ? settings.hydrateApplicantGeo : false,
              })
            }
            label="Save applicant public IP address"
            hint="On by default. Stored with each request so admins can compare against the country they selected."
          />
          <div className="ml-6">
            <AdminCheckbox
              checked={settings.hydrateApplicantGeo === true}
              disabled={settings.saveApplicantIp === false}
              onChange={(checked) => setSettings({ ...settings, hydrateApplicantGeo: checked })}
              label="Hydrate geolocation from IP"
              hint="Off by default. Looks up the IP via ip-api.com on submission and stores approximate city, region, and zip alongside the country."
            />
          </div>
        </AdminSection>

        <AdminSection
          title="Identity & contact"
          description="Always the first wizard step. Name or handle and email are collected together and cannot be removed or reordered."
        >
          <div className="space-y-3">
            <FixedFieldPreview
              label="Name or handle"
              placeholder="Whatever you'd like us to call you"
              hint="Required — real name, nickname, or handle. Shown to admins and used in status messages."
            />
            <FixedFieldPreview
              label="Email address"
              hint="Required — used for local sign-in after account activation (alongside their chosen username)."
            />
          </div>
        </AdminSection>

        <AdminSection
          title="Agreement & policy"
          description="Shown on its own step after identity & contact. You are responsible for the text applicants agree to."
        >
          <AdminCheckbox
            checked={settings.consent.enabled}
            onChange={(checked) =>
              setSettings({ ...settings, consent: { ...settings.consent, enabled: checked } })
            }
            label="Require agreement step"
          />
          <AdminField label="Title">
            <AdminInput
              value={settings.consent.title}
              onChange={(e) =>
                setSettings({ ...settings, consent: { ...settings.consent, title: e.target.value } })
              }
            />
          </AdminField>
          <AdminField label="Body">
            <AdminTextarea
              value={settings.consent.body}
              onChange={(e) =>
                setSettings({ ...settings, consent: { ...settings.consent, body: e.target.value } })
              }
            />
          </AdminField>
          <AdminField label="Checkbox label">
            <AdminInput
              value={settings.consent.checkboxLabel}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  consent: { ...settings.consent, checkboxLabel: e.target.value },
                })
              }
            />
          </AdminField>
        </AdminSection>

        <AdminSection title="Application questions" description="Each module is one wizard step. Reorder with the arrows.">
          <ul className="space-y-3">
            {settings.flowModules.map((mod, index) => (
              <li key={moduleEditorKey(mod)} className="rounded-xl border border-gray-700 bg-gray-800/70 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 text-gray-500 mt-2 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-gray-500">
                        {moduleTypeLabel(mod)}
                      </span>
                      <AdminCheckbox
                        checked={mod.required !== false}
                        onChange={(checked) => updateModule(index, { required: checked })}
                        label="Required"
                        className="ml-auto"
                      />
                    </div>
                    <AdminField label="Question label">
                      <AdminInput
                        value={mod.label}
                        onChange={(e) => updateModule(index, { label: e.target.value })}
                        onBlur={() => syncModuleIdOnBlur(index)}
                      />
                    </AdminField>
                    {(mod.type === "text" || mod.type === "textarea") && (
                      <AdminField label="Placeholder">
                        <AdminInput
                          value={mod.placeholder || ""}
                          onChange={(e) => updateModule(index, { placeholder: e.target.value })}
                        />
                      </AdminField>
                    )}
                    {(mod.type === "yesno" || mod.type === "country") && (
                      <p className="text-xs text-gray-500">
                        {mod.type === "yesno"
                          ? "Applicants choose Yes or No."
                          : "Uses a curated ISO country list. Country codes are stored internally."}
                      </p>
                    )}
                    {isChoiceModule(mod) && (
                      <>
                        <AdminCheckbox
                          checked={mod.type === "multiselect"}
                          onChange={(checked) =>
                            updateModule(index, { type: checked ? "multiselect" : "select" })
                          }
                          label="Allow multiple selections"
                          hint="Off: applicants pick one option. On: they can pick several."
                        />
                        <ChoiceOptionsEditor
                          options={mod.options || []}
                          onChange={(options) => updateModule(index, { options })}
                        />
                      </>
                    )}
                    <ShowWhenEditor
                      moduleIndex={index}
                      module={mod}
                      allModules={settings.flowModules}
                      onChange={(showWhen) => updateModule(index, { showWhen })}
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      className="p-1.5 rounded border border-gray-600 text-gray-400 hover:text-white"
                      onClick={() => moveModule(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded border border-gray-600 text-gray-400 hover:text-white"
                      onClick={() => moveModule(index, 1)}
                      disabled={index === settings.flowModules.length - 1}
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded border border-red-900/50 text-red-400 hover:bg-red-950/30"
                      onClick={() => removeModule(index)}
                      aria-label="Delete module"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="flex-1 min-w-[180px]">
              <AdminField label="Add module">
              <AdminSelect
                value={addType}
                onChange={(e) => setAddType(e.target.value as RegistrationModuleType)}
              >
                {ADD_MODULE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            </div>
            <AdminBtn
              onClick={() =>
                setSettings({
                  ...settings,
                  flowModules: [...settings.flowModules, newModule(addType)],
                })
              }
            >
              <Plus className="w-4 h-4 mr-1 inline" />
              Add
            </AdminBtn>
          </div>
        </AdminSection>

        <AdminSection title="New accounts" description="Role assigned when an approved applicant activates their account.">
          <AdminField label="Default role">
            <AdminSelect
              value={settings.defaultRole}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultRole: e.target.value as RegistrationSettings["defaultRole"],
                })
              }
            >
              <option value="listener">Listener</option>
              <option value="broadcaster">Broadcaster</option>
            </AdminSelect>
          </AdminField>
        </AdminSection>

        <div className="flex flex-wrap gap-3">
          <AdminBtn className="w-full sm:w-auto" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save registration settings"}
          </AdminBtn>
          <AdminBtn
            className="w-full sm:w-auto !bg-gray-700 !text-white hover:!brightness-110"
            disabled={busy}
            onClick={() => setResetConfirmOpen(true)}
          >
            Reset to default
          </AdminBtn>
        </div>

        <AdminConfirmDialog
          open={resetConfirmOpen}
          onClose={() => setResetConfirmOpen(false)}
          onConfirm={() => void resetToDefaults()}
          title="Reset registration form?"
          confirmLabel={busy ? "Resetting…" : "Reset to default"}
          busy={busy}
        >
          <p>
            This replaces all application questions, agreement text, and the default role with the
            built-in default flow.
          </p>
          <p>Your enabled/disabled state and IP capture settings are kept.</p>
          <p className="text-amber-200/90">This cannot be undone.</p>
        </AdminConfirmDialog>
      </div>
    </div>
  );
}
