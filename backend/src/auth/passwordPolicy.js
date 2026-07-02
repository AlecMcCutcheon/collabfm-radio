import crypto from "crypto";

const MIN_PASSWORD_LENGTH = 12;
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*()-_=+[]{};:,.?";
const ALL_CHARS = `${UPPER}${LOWER}${DIGITS}${SPECIAL}`;

export const PASSWORD_POLICY = {
  minLength: MIN_PASSWORD_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export function passwordPolicyErrors(password) {
  const value = String(password || "");
  const errors = [];
  if (value.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(value)) errors.push("Password must include an uppercase letter");
  if (!/[a-z]/.test(value)) errors.push("Password must include a lowercase letter");
  if (!/\d/.test(value)) errors.push("Password must include a number");
  if (!/[^A-Za-z0-9]/.test(value)) errors.push("Password must include a special character");
  return errors;
}

export function validatePasswordPolicy(password) {
  const errors = passwordPolicyErrors(password);
  return {
    ok: errors.length === 0,
    errors,
    error: errors[0] || null,
    policy: PASSWORD_POLICY,
  };
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function shuffle(chars) {
  const out = [...chars];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

export function generateCompliantPassword(length = 16) {
  const size = Math.max(Number(length) || 16, MIN_PASSWORD_LENGTH);
  const chars = [
    randomChar(UPPER),
    randomChar(LOWER),
    randomChar(DIGITS),
    randomChar(SPECIAL),
  ];
  while (chars.length < size) {
    chars.push(randomChar(ALL_CHARS));
  }
  return shuffle(chars);
}
