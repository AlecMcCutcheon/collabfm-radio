import { getSetting, setSetting } from "../db/index.js";
import {
  countryNameByCode,
  countrySelectOptions,
  isValidCountryCode,
} from "../data/countries.js";

export const REGISTRATION_MODULE_TYPES = [
  "select",
  "multiselect",
  "text",
  "textarea",
  "yesno",
  "country",
];

export const REGISTRATION_DISPLAY_NAME_MIN = 1;
export const REGISTRATION_DISPLAY_NAME_MAX = 80;

export function normalizeChoiceOptionValue(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function moduleIdFromLabel(label, fallback = "question") {
  const key = normalizeChoiceOptionValue(label).replace(/[^a-z0-9_]/g, "");
  return key || fallback;
}

function normalizeChoiceOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const label =
      typeof item === "string"
        ? item.trim()
        : String(item?.label ?? item?.value ?? "").trim();
    if (!label) continue;
    const value = normalizeChoiceOptionValue(label);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

const DEFAULT_CONSENT = {
  enabled: true,
  title: "Station rules & copyright",
  body:
    "This station expects members to respect copyright and applicable law. Do not use CollabFM to broadcast or request unauthorized copyrighted material.\n\n" +
    "Operators apply a best-effort metadata content policy; that is not a guarantee of compliance. By continuing, you agree to follow station rules and understand that access may be revoked for violations.",
  checkboxLabel: "I agree and understand",
};

function defaultFlowModules() {
  return [
    {
      id: "age_confirmation",
      type: "yesno",
      label: "I agree that I am 18 or older",
      required: true,
    },
    {
      id: "country",
      type: "country",
      label: "Country / region",
      required: true,
    },
    {
      id: "referral_source",
      type: "select",
      label: "Where did you hear about this station?",
      required: true,
      options: normalizeChoiceOptions([
        "Discord",
        "Reddit",
        "Slack",
        "Facebook",
        "Other",
      ]),
    },
    {
      id: "referral_other",
      type: "text",
      label: "Please specify where you heard about us",
      placeholder: "e.g. friend, podcast, forum…",
      required: true,
      showWhen: { moduleId: "referral_source", equals: "other" },
    },
    {
      id: "motivation",
      type: "textarea",
      label: "Why do you want to join, and how do you plan to use the station?",
      placeholder: "A few sentences is enough — tell us what you are hoping to do here.",
      required: true,
      minLength: 20,
      maxLength: 2000,
    },
  ];
}

function createModuleUid() {
  return `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeModule(raw, index) {
  const type = REGISTRATION_MODULE_TYPES.includes(raw?.type) ? raw.type : "text";
  const label = String(raw?.label ?? "").trim() || "Question";
  const uid = typeof raw?.uid === "string" && raw.uid.trim() ? raw.uid.trim() : createModuleUid();
  const id =
    typeof raw?.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : moduleIdFromLabel(label, `module_${index}`);
  const options = type === "select" || type === "multiselect" ? normalizeChoiceOptions(raw?.options) : [];
  const showWhen =
    raw?.showWhen &&
    typeof raw.showWhen.moduleId === "string" &&
    raw.showWhen.moduleId.trim()
      ? {
          moduleId: raw.showWhen.moduleId.trim(),
          equals: normalizeChoiceOptionValue(raw.showWhen.equals ?? ""),
        }
      : undefined;
  return {
    uid,
    id,
    type,
    label,
    placeholder: raw?.placeholder != null ? String(raw.placeholder) : "",
    required: raw?.required !== false,
    options,
    showWhen,
    minLength:
      raw?.minLength != null ? Math.max(0, Number(raw.minLength) || 0) : undefined,
    maxLength:
      raw?.maxLength != null ? Math.max(1, Number(raw.maxLength) || 2000) : undefined,
  };
}

export function normalizeRegistrationSettings(raw = {}) {
  const consentRaw = raw.consent && typeof raw.consent === "object" ? raw.consent : {};
  const modulesRaw = Array.isArray(raw.flowModules) ? raw.flowModules : defaultFlowModules();
  return {
    enabled: raw.enabled === true,
    saveApplicantIp: raw.saveApplicantIp !== false,
    hydrateApplicantGeo: raw.hydrateApplicantGeo === true && raw.saveApplicantIp !== false,
    defaultRole:
      raw.defaultRole === "broadcaster" || raw.defaultRole === "admin"
        ? raw.defaultRole
        : "listener",
    consent: {
      enabled: consentRaw.enabled !== false,
      title: String(consentRaw.title ?? DEFAULT_CONSENT.title).trim() || DEFAULT_CONSENT.title,
      body: String(consentRaw.body ?? DEFAULT_CONSENT.body).trim() || DEFAULT_CONSENT.body,
      checkboxLabel:
        String(consentRaw.checkboxLabel ?? DEFAULT_CONSENT.checkboxLabel).trim() ||
        DEFAULT_CONSENT.checkboxLabel,
    },
    flowModules: ensureUniqueModuleIds(
      modulesRaw.map((mod, index) => normalizeModule(mod, index)),
    ),
  };
}

function ensureUniqueModuleIds(modules) {
  const idMap = new Map();
  const seen = new Set();
  const next = modules.map((mod) => {
    let id = mod.id;
    let suffix = 2;
    while (seen.has(id)) {
      const nextId = `${mod.id}_${suffix}`;
      idMap.set(id, nextId);
      id = nextId;
      suffix += 1;
    }
    seen.add(id);
    if (id !== mod.id) idMap.set(mod.id, id);
    return id === mod.id ? mod : { ...mod, id };
  });
  return next.map((mod) => {
    if (!mod.showWhen) return mod;
    let mapped = mod.showWhen.moduleId;
    while (idMap.has(mapped)) {
      mapped = idMap.get(mapped);
    }
    return mapped === mod.showWhen.moduleId
      ? mod
      : { ...mod, showWhen: { ...mod.showWhen, moduleId: mapped } };
  });
}

export function getRegistrationSettings() {
  return normalizeRegistrationSettings(getSetting("registration", {}));
}

export function saveRegistrationSettings(incoming = {}) {
  const current = getRegistrationSettings();
  const next = normalizeRegistrationSettings({ ...current, ...incoming });
  if (incoming.consent) {
    next.consent = normalizeRegistrationSettings({ consent: incoming.consent }).consent;
  }
  if (incoming.flowModules) {
    next.flowModules = normalizeRegistrationSettings({ flowModules: incoming.flowModules })
      .flowModules;
  }
  setSetting("registration", next);
  return next;
}

export function registrationSettingsAdminPayload() {
  return getRegistrationSettings();
}

/** Reset form flow and consent to defaults; keeps enabled + IP capture toggles. */
export function resetRegistrationSettingsToDefaults() {
  const current = getRegistrationSettings();
  const defaults = normalizeRegistrationSettings({});
  return saveRegistrationSettings({
    enabled: current.enabled,
    saveApplicantIp: current.saveApplicantIp,
    hydrateApplicantGeo: current.hydrateApplicantGeo,
    consent: defaults.consent,
    flowModules: defaults.flowModules,
    defaultRole: defaults.defaultRole,
  });
}

export function publicRegistrationConfig() {
  const settings = getRegistrationSettings();
  if (!settings.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    consent: settings.consent,
    flowModules: settings.flowModules,
    countryOptions: countrySelectOptions(),
  };
}

export function ensureRegistrationSettings() {
  const current = getSetting("registration", null);
  if (!current || typeof current !== "object") {
    setSetting("registration", normalizeRegistrationSettings({}));
  }
}

export function isConditionSourceModule(mod) {
  return mod?.type === "select" || mod?.type === "multiselect" || mod?.type === "yesno";
}

export function conditionValuesForModule(mod) {
  if (mod?.type === "yesno") {
    return [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
  }
  return mod?.options || [];
}

export function moduleVisibleForAnswers(module, answers) {
  if (!module.showWhen) return true;
  const current = answers?.[module.showWhen.moduleId];
  if (Array.isArray(current)) {
    return current.map(String).includes(String(module.showWhen.equals));
  }
  return String(current ?? "") === String(module.showWhen.equals);
}

export function visibleFlowModules(settings, answers = {}) {
  return settings.flowModules.filter((mod) => moduleVisibleForAnswers(mod, answers));
}

export function validateRegistrationAnswers(settings, { email, displayName, consentAgreed, answers }) {
  const errors = [];
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.push("A valid email address is required");
  }
  const normalizedDisplayName = String(displayName || "")
    .trim()
    .replace(/\s+/g, " ");
  if (normalizedDisplayName.length < REGISTRATION_DISPLAY_NAME_MIN) {
    errors.push("A name or handle is required");
  } else if (normalizedDisplayName.length > REGISTRATION_DISPLAY_NAME_MAX) {
    errors.push(
      `Name or handle must be at most ${REGISTRATION_DISPLAY_NAME_MAX} characters`,
    );
  }
  if (settings.consent.enabled && consentAgreed !== true) {
    errors.push("You must agree to continue");
  }
  const cleanAnswers = {};
  for (const mod of settings.flowModules) {
    if (!moduleVisibleForAnswers(mod, answers)) continue;
    const raw = answers?.[mod.id];
    if (mod.type === "multiselect") {
      const values = Array.isArray(raw)
        ? raw.map((v) => String(v).trim()).filter(Boolean)
        : [];
      if (mod.required && !values.length) {
        errors.push(`${mod.label} is required`);
      } else {
        cleanAnswers[mod.id] = values;
      }
      continue;
    }
    if (mod.type === "yesno") {
      const value = raw == null ? "" : String(raw).trim().toLowerCase();
      if (mod.required && !value) {
        errors.push(`${mod.label} is required`);
        continue;
      }
      if (value && value !== "yes" && value !== "no") {
        errors.push(`${mod.label} has an invalid answer`);
        continue;
      }
      if (value) cleanAnswers[mod.id] = value;
      continue;
    }
    if (mod.type === "country") {
      const code = raw == null ? "" : String(raw).trim().toUpperCase();
      if (mod.required && !code) {
        errors.push(`${mod.label} is required`);
        continue;
      }
      if (code && !isValidCountryCode(code)) {
        errors.push(`${mod.label} has an invalid country`);
        continue;
      }
      if (code) cleanAnswers[mod.id] = code;
      continue;
    }
    const value = raw == null ? "" : String(raw).trim();
    if (mod.required && !value) {
      errors.push(`${mod.label} is required`);
      continue;
    }
    if (value && mod.type === "textarea") {
      const min = mod.minLength ?? 0;
      const max = mod.maxLength ?? 2000;
      if (value.length < min) {
        errors.push(`${mod.label} must be at least ${min} characters`);
      } else if (value.length > max) {
        errors.push(`${mod.label} must be at most ${max} characters`);
      }
    }
    if (value && mod.type === "select") {
      const allowed = new Set((mod.options || []).map((opt) => opt.value));
      if (!allowed.has(value)) {
        errors.push(`${mod.label} has an invalid selection`);
      }
    }
    if (value) cleanAnswers[mod.id] = value;
  }
  return {
    ok: errors.length === 0,
    errors,
    email: normalizedEmail,
    displayName: normalizedDisplayName,
    answers: cleanAnswers,
  };
}

export function summarizeRegistrationAnswers(settings, answers) {
  const lines = [];
  for (const mod of settings.flowModules) {
    if (!moduleVisibleForAnswers(mod, answers)) continue;
    const raw = answers?.[mod.id];
    if (raw == null || raw === "" || (Array.isArray(raw) && !raw.length)) continue;
    let display = raw;
    if (mod.type === "yesno") {
      display = raw === "yes" ? "Yes" : raw === "no" ? "No" : raw;
    } else if (mod.type === "country") {
      const code = String(raw).trim().toUpperCase();
      display = `${countryNameByCode(code)} (${code})`;
    } else if (mod.type === "select") {
      display = mod.options?.find((opt) => opt.value === raw)?.label || raw;
    } else if (mod.type === "multiselect") {
      display = (Array.isArray(raw) ? raw : [])
        .map((value) => mod.options?.find((opt) => opt.value === value)?.label || value)
        .join(", ");
    }
    lines.push({ id: mod.id, label: mod.label, value: display });
  }
  return lines;
}

export function buildCountryVerification(settings, answers, applicantGeo) {
  const countryMod = settings.flowModules.find(
    (mod) => mod.type === "country" && moduleVisibleForAnswers(mod, answers),
  );
  const selectedRaw = countryMod ? answers?.[countryMod.id] : null;
  const selectedCode =
    selectedRaw != null && String(selectedRaw).trim()
      ? String(selectedRaw).trim().toUpperCase()
      : null;
  const geoCode =
    applicantGeo?.countryCode != null && String(applicantGeo.countryCode).trim()
      ? String(applicantGeo.countryCode).trim().toUpperCase()
      : null;

  if (!selectedCode && !geoCode) return null;

  return {
    selectedCode,
    selectedName: selectedCode ? countryNameByCode(selectedCode) : null,
    geoCode,
    geoName: applicantGeo?.country || null,
    matches: selectedCode && geoCode ? selectedCode === geoCode : null,
  };
}
