import crypto from "crypto";
import { decryptTotpSecret, encryptTotpSecret } from "../auth/totp.js";
import { getDb } from "./index.js";

const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function encryptRegistrationToken(token) {
  return encryptTotpSecret(String(token).trim().toUpperCase());
}

export function decryptRegistrationToken(payload) {
  const value = decryptTotpSecret(payload);
  return value ? String(value).trim().toUpperCase() : null;
}

export function hashRegistrationToken(token) {
  return crypto.createHash("sha256").update(String(token).trim().toUpperCase()).digest("hex");
}

export function generateRegistrationToken() {
  const part = () =>
    Array.from({ length: 4 }, () => TOKEN_CHARS[crypto.randomInt(TOKEN_CHARS.length)]).join("");
  return `REG-${part()}-${part()}-${part()}-${part()}`;
}

export function normalizeRegistrationEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeRegistrationDisplayName(displayName) {
  return String(displayName || "").trim().replace(/\s+/g, " ");
}

function rowToRequest(row) {
  if (!row) return null;
  let answers = {};
  try {
    answers = JSON.parse(row.answers_json || "{}");
  } catch {
    answers = {};
  }
  let applicantGeo = null;
  if (row.applicant_geo_json) {
    try {
      applicantGeo = JSON.parse(row.applicant_geo_json);
    } catch {
      applicantGeo = null;
    }
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || null,
    status: row.status,
    tokenHash: row.token_hash,
    tokenEncrypted: row.token_encrypted || null,
    answers,
    denyReason: row.deny_reason || null,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by ?? null,
    activatedAt: row.activated_at || null,
    activatedUserId: row.activated_user_id ?? null,
    applicantIp: row.applicant_ip || null,
    applicantGeo,
    consentTitle: row.consent_title || null,
  };
}

export function getRegistrationRequestById(id) {
  const row = getDb()
    .prepare("SELECT * FROM registration_requests WHERE id = ?")
    .get(id);
  return rowToRequest(row);
}

export function getRegistrationRequestByTokenHash(tokenHash) {
  const row = getDb()
    .prepare("SELECT * FROM registration_requests WHERE token_hash = ?")
    .get(tokenHash);
  return rowToRequest(row);
}

export function findActiveRegistrationRequestByEmail(email) {
  const normalized = normalizeRegistrationEmail(email);
  const row = getDb()
    .prepare(
      `SELECT * FROM registration_requests
       WHERE email = ? AND status IN ('pending', 'approved')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(normalized);
  return rowToRequest(row);
}

export function createRegistrationRequest({
  email,
  displayName = null,
  tokenHash,
  tokenEncrypted = null,
  answers = {},
  applicantIp = null,
  applicantGeo = null,
  consentTitle = null,
}) {
  const normalized = normalizeRegistrationEmail(email);
  const normalizedDisplayName = displayName
    ? normalizeRegistrationDisplayName(displayName)
    : null;
  const result = getDb()
    .prepare(
      `INSERT INTO registration_requests (email, display_name, token_hash, token_encrypted, answers_json, status, applicant_ip, applicant_geo_json, consent_title)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .run(
      normalized,
      normalizedDisplayName || null,
      tokenHash,
      tokenEncrypted || null,
      JSON.stringify(answers || {}),
      applicantIp || null,
      applicantGeo ? JSON.stringify(applicantGeo) : null,
      consentTitle || null,
    );
  return getRegistrationRequestById(result.lastInsertRowid);
}

export function listRegistrationRequests({ status } = {}) {
  let rows;
  if (status) {
    rows = getDb()
      .prepare(
        `SELECT * FROM registration_requests WHERE status = ?
         ORDER BY submitted_at DESC`,
      )
      .all(status);
  } else {
    rows = getDb()
      .prepare("SELECT * FROM registration_requests ORDER BY submitted_at DESC")
      .all();
  }
  return rows.map(rowToRequest);
}

export function updateRegistrationRequest(id, fields) {
  const allowed = {
    status: "status",
    deny_reason: "denyReason",
    reviewed_at: "reviewedAt",
    reviewed_by: "reviewedBy",
    activated_at: "activatedAt",
    activated_user_id: "activatedUserId",
    token_hash: "tokenHash",
    token_encrypted: "tokenEncrypted",
  };
  const sets = [];
  const values = [];
  for (const [col, key] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      sets.push(`${col} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getRegistrationRequestById(id);
  values.push(id);
  getDb()
    .prepare(`UPDATE registration_requests SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
  return getRegistrationRequestById(id);
}

export function approveRegistrationRequest(id, reviewedBy) {
  return updateRegistrationRequest(id, {
    status: "approved",
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    denyReason: null,
  });
}

export function denyRegistrationRequest(id, reviewedBy, denyReason = null) {
  return updateRegistrationRequest(id, {
    status: "denied",
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    denyReason: denyReason ? String(denyReason).trim() : null,
  });
}

export function markRegistrationRequestActivated(id, userId) {
  return updateRegistrationRequest(id, {
    status: "activated",
    activatedAt: new Date().toISOString(),
    activatedUserId: userId,
  });
}

export function deleteRegistrationRequest(id) {
  getDb().prepare("DELETE FROM registration_requests WHERE id = ?").run(id);
}

export function regenerateRegistrationRequestToken(id) {
  const existing = getRegistrationRequestById(id);
  if (!existing) return null;
  if (existing.status !== "pending" && existing.status !== "approved") {
    return null;
  }
  const token = generateRegistrationToken();
  return updateRegistrationRequest(id, {
    tokenHash: hashRegistrationToken(token),
    tokenEncrypted: encryptRegistrationToken(token),
  });
}
