export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*()-_=+[]{};:,.?";
const ALL_CHARS = `${UPPER}${LOWER}${DIGITS}${SPECIAL}`;

export function passwordPolicyErrors(password: string): string[] {
  const value = String(password || "");
  const errors: string[] = [];
  if (value.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (!/[A-Z]/.test(value)) errors.push("Password must include an uppercase letter");
  if (!/[a-z]/.test(value)) errors.push("Password must include a lowercase letter");
  if (!/\d/.test(value)) errors.push("Password must include a number");
  if (!/[^A-Za-z0-9]/.test(value)) errors.push("Password must include a special character");
  return errors;
}

export function validatePasswordPolicy(password: string): { ok: boolean; errors: string[] } {
  const errors = passwordPolicyErrors(password);
  return { ok: errors.length === 0, errors };
}

function randomIndex(max: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function randomChar(chars: string): string {
  return chars[randomIndex(chars.length)];
}

function shuffle(chars: string[]): string[] {
  const out = [...chars];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateCompliantPassword(length = 16): string {
  const size = Math.max(length, PASSWORD_POLICY.minLength);
  const chars = [
    randomChar(UPPER),
    randomChar(LOWER),
    randomChar(DIGITS),
    randomChar(SPECIAL),
  ];
  while (chars.length < size) {
    chars.push(randomChar(ALL_CHARS));
  }
  return shuffle(chars).join("");
}
