import type { RegistrationFlowModule, RegistrationModuleOption } from "../types/api";

/** Machine key for choice options and showWhen matching (lowercase, spaces → underscores). */
export function normalizeChoiceOptionValue(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Stable field key from a question label (used for conditional rules). */
export function moduleIdFromLabel(label: string, fallback = "question"): string {
  const key = normalizeChoiceOptionValue(label).replace(/[^a-z0-9_]/g, "");
  return key || fallback;
}

export function choiceOptionFromLabel(label: string): RegistrationModuleOption | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  return { label: trimmed, value: normalizeChoiceOptionValue(trimmed) };
}

export function normalizeChoiceOptions(
  raw: Array<string | RegistrationModuleOption> | undefined,
): RegistrationModuleOption[] {
  if (!Array.isArray(raw)) return [];
  const out: RegistrationModuleOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const opt =
      typeof item === "string" ? choiceOptionFromLabel(item) : choiceOptionFromLabel(item.label || item.value);
    if (!opt || seen.has(opt.value)) continue;
    seen.add(opt.value);
    out.push(opt);
  }
  return out;
}

export function createModuleUid(): string {
  return `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function moduleEditorKey(mod: RegistrationFlowModule): string {
  return mod.uid || mod.id;
}

/** Update one module's id and fix showWhen references to the old id. */
export function applyModuleIdChange(
  modules: RegistrationFlowModule[],
  index: number,
  newId: string,
): RegistrationFlowModule[] {
  const oldId = modules[index]?.id;
  if (!oldId || oldId === newId) return modules;
  return modules.map((m, i) => {
    let next = m;
    if (i === index) next = { ...next, id: newId };
    else if (m.showWhen?.moduleId === oldId) {
      next = { ...next, showWhen: { ...m.showWhen, moduleId: newId } };
    }
    return next;
  });
}

export function syncModuleIdFromLabel(
  modules: RegistrationFlowModule[],
  index: number,
): RegistrationFlowModule[] {
  const mod = modules[index];
  if (!mod) return modules;
  return applyModuleIdChange(modules, index, moduleIdFromLabel(mod.label, mod.id));
}

export function dedupeModuleIds(modules: RegistrationFlowModule[]): RegistrationFlowModule[] {
  const seen = new Set<string>();
  const idMap = new Map<string, string>();
  let next = modules.map((mod) => {
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
      mapped = idMap.get(mapped)!;
    }
    return mapped === mod.showWhen.moduleId
      ? mod
      : { ...mod, showWhen: { ...mod.showWhen, moduleId: mapped } };
  });
}

export function syncAllModuleIdsFromLabels(
  modules: RegistrationFlowModule[],
): RegistrationFlowModule[] {
  let next = [...modules];
  for (let i = 0; i < next.length; i++) {
    next = syncModuleIdFromLabel(next, i);
  }
  return dedupeModuleIds(next);
}
