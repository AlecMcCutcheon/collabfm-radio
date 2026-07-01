const BACKUP_CODE_LEN = 10;

/** Login fields accept one backup code — take the first from a paste. */
export function firstBackupCodeFromPaste(value: string): string {
  const lines = value
    .split(/[\r\n]+/)
    .map((line) => line.trim().replace(/\s+/g, "").toUpperCase())
    .filter((line) => line.length >= 8);

  if (lines.length >= 1) {
    const line = lines[0];
    if (line.length > BACKUP_CODE_LEN && /^[A-F0-9]+$/.test(line)) {
      return line.slice(0, BACKUP_CODE_LEN);
    }
    return line;
  }

  const collapsed = value.trim().replace(/\s+/g, "").toUpperCase();
  if (collapsed.length > BACKUP_CODE_LEN && /^[A-F0-9]+$/.test(collapsed)) {
    return collapsed.slice(0, BACKUP_CODE_LEN);
  }
  return collapsed;
}

export function normalizeBackupCodeInput(value: string): string {
  return firstBackupCodeFromPaste(value);
}

export function pastedMultipleBackupCodes(value: string): boolean {
  const lines = value
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return true;
  return value.trim().replace(/\s+/g, "").length > BACKUP_CODE_LEN + 2;
}

export function looksLikeBackupCode(value: string): boolean {
  const normalized = firstBackupCodeFromPaste(value);
  return normalized.length >= 8 && /[A-F]/.test(normalized);
}
