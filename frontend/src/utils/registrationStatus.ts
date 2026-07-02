/** Registration status colors aligned with song request badges (requested/approved/denied). */

export function registrationStatusCardClass(status: string): string {
  if (status === "pending") return "border-blue-500/40 bg-blue-500/10";
  if (status === "approved") return "border-green-500/40 bg-green-500/10";
  if (status === "denied") return "border-red-500/40 bg-red-500/10";
  if (status === "activated") return "border-radio-accent/45 bg-radio-accent/10";
  return "border-gray-700 bg-gray-900/50";
}

export function registrationStatusBadgeClass(status: string): string {
  if (status === "pending") return "border border-blue-500/40 bg-blue-500/20 text-blue-300";
  if (status === "approved") return "border border-green-500/40 bg-green-500/20 text-green-300";
  if (status === "denied") return "border border-red-500/40 bg-red-500/20 text-red-300";
  if (status === "activated") return "border border-radio-accent/45 bg-radio-accent/15 text-sky-100";
  return "border border-gray-600 bg-gray-700/80 text-gray-300";
}

export function registrationPendingCountBadgeClass(): string {
  return "border border-blue-500/40 bg-blue-500/20 text-blue-300";
}

export function formatRegistrationStatus(status: string): string {
  return status.replace(/_/g, " ");
}
