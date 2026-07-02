import type { RegistrationFlowModule, RegistrationPublicConfig } from "../types/api";

export function moduleVisible(
  mod: RegistrationFlowModule,
  answers: Record<string, string | string[]>,
): boolean {
  if (!mod.showWhen) return true;
  const current = answers[mod.showWhen.moduleId];
  if (Array.isArray(current)) {
    return current.map(String).includes(String(mod.showWhen.equals));
  }
  return String(current ?? "") === String(mod.showWhen.equals);
}

export function visibleModules(
  config: RegistrationPublicConfig,
  answers: Record<string, string | string[]>,
): RegistrationFlowModule[] {
  return (config.flowModules || []).filter((mod) => moduleVisible(mod, answers));
}

export type RegistrationWizardStep =
  | { kind: "email" }
  | { kind: "consent" }
  | { kind: "module"; module: RegistrationFlowModule }
  | { kind: "done" };

export function buildRegistrationWizardSteps(
  config: RegistrationPublicConfig,
  answers: Record<string, string | string[]>,
): RegistrationWizardStep[] {
  const steps: RegistrationWizardStep[] = [{ kind: "email" }];
  if (config.consent?.enabled) steps.push({ kind: "consent" });
  for (const mod of visibleModules(config, answers)) {
    steps.push({ kind: "module", module: mod });
  }
  return steps;
}

export function normalizeRegistrationTokenInput(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
