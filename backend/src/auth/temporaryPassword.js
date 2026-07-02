import { hashPassword } from "./session.js";
import { decryptTotpSecret, encryptTotpSecret } from "./totp.js";
import { generateCompliantPassword, validatePasswordPolicy } from "./passwordPolicy.js";

export async function temporaryPasswordFields(password = generateCompliantPassword()) {
  const plain = String(password || "");
  const policy = validatePasswordPolicy(plain);
  if (!policy.ok) {
    return { error: policy.error, errors: policy.errors, status: 400 };
  }
  return {
    password: plain,
    fields: {
      password_hash: await hashPassword(plain),
      must_change_password: 1,
      temp_password_encrypted: encryptTotpSecret(plain),
    },
  };
}

export function revealTemporaryPassword(user) {
  if (!user?.temp_password_encrypted) return null;
  return decryptTotpSecret(user.temp_password_encrypted);
}
