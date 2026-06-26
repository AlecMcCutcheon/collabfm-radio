import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;
let storageDir = null;

export function initDatabase(dir) {
  storageDir = dir;
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "radio.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  console.log(`[Database] SQLite at ${dbPath}`);
  runMigrations();
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function getStorageDir() {
  return storageDir;
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name)
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
  }
}

export function getSetting(key, defaultValue = null) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch {
    return defaultValue;
  }
}

export function setSetting(key, value) {
  const json = JSON.stringify(value);
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, json);
}

export function isSetupComplete() {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get();
  return row.c > 0;
}

export function countUsers() {
  return getDb().prepare("SELECT COUNT(*) AS c FROM users").get().c;
}

export function getUserById(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) ?? null;
}

export function getUserByUsername(username) {
  return getDb()
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username) ?? null;
}

export function getUserByOidcSubject(subject) {
  return getDb().prepare("SELECT * FROM users WHERE oidc_subject = ?").get(subject) ?? null;
}

export function listUsers() {
  return getDb()
    .prepare(
      `SELECT id, username, auth_source, role, enabled, created_at, last_login, last_login_ip,
              experience_points, block_guest_action_xp,
              display_name, avatar_filename, bio, genres
       FROM users ORDER BY username`
    )
    .all();
}

/** SSO-only accounts that cannot sign in with a local password. */
export function countOidcOnlyUsers() {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE auth_source = 'oidc' AND enabled = 1
         AND (password_hash IS NULL OR password_hash = '')`
    )
    .get();
  return Number(row?.count ?? 0);
}

export function createLocalUser({ username, passwordHash, role = "listener" }) {
  const result = getDb()
    .prepare(
      `INSERT INTO users (username, auth_source, password_hash, role, enabled)
       VALUES (?, 'local', ?, ?, 1)`
    )
    .run(username, passwordHash, role);
  return getUserById(result.lastInsertRowid);
}

export function updateUser(id, fields) {
  const allowed = [
    "username",
    "password_hash",
    "role",
    "enabled",
    "last_login",
    "last_login_ip",
    "oidc_subject",
    "block_guest_action_xp",
    "experience_points",
  ];
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = ?`);
    values.push(v);
  }
  if (!sets.length) return getUserById(id);
  values.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getUserById(id);
}

export function deleteUser(id) {
  deleteUserSessions(id);
  const db = getDb();
  db.prepare("DELETE FROM broadcast_devices WHERE user_id = ?").run(id);
  db.prepare(
    `UPDATE extension_pair_requests
     SET paired_user_id = NULL, paired_token = NULL, consumed = 0
     WHERE paired_user_id = ?`
  ).run(id);
  db.prepare("DELETE FROM ws_tokens WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function createSession(token, userId, expiresAt) {
  getDb().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );
}

export function getSession(token) {
  const row = getDb()
    .prepare(
      `SELECT s.token, s.user_id, s.expires_at, u.username, u.role, u.enabled, u.auth_source
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  if (!row.enabled) return null;
  return row;
}

export function deleteSession(token) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteUserSessions(userId) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function listWhitelist() {
  return getDb()
    .prepare("SELECT guild_id, label, enabled, created_at FROM discord_server_whitelist ORDER BY guild_id")
    .all();
}

export function upsertWhitelistEntry(guildId, label, enabled = 1) {
  getDb()
    .prepare(
      `INSERT INTO discord_server_whitelist (guild_id, label, enabled)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET label = excluded.label, enabled = excluded.enabled`
    )
    .run(guildId, label ?? null, enabled ? 1 : 0);
}

export function removeWhitelistEntry(guildId) {
  getDb().prepare("DELETE FROM discord_server_whitelist WHERE guild_id = ?").run(guildId);
}

export function isGuildWhitelisted(guildId) {
  const row = getDb()
    .prepare("SELECT 1 FROM discord_server_whitelist WHERE guild_id = ? AND enabled = 1")
    .get(String(guildId));
  return !!row;
}

export function listOidcGroupMappings() {
  return getDb().prepare("SELECT oidc_group, role FROM oidc_group_mappings").all();
}

export function setOidcGroupMapping(oidcGroup, role) {
  getDb()
    .prepare(
      `INSERT INTO oidc_group_mappings (oidc_group, role) VALUES (?, ?)
       ON CONFLICT(oidc_group) DO UPDATE SET role = excluded.role`
    )
    .run(oidcGroup, role);
}

export function removeOidcGroupMapping(oidcGroup) {
  getDb().prepare("DELETE FROM oidc_group_mappings WHERE oidc_group = ?").run(oidcGroup);
}

export function replaceOidcGroupMappings(mappings) {
  const db = getDb();
  db.prepare("DELETE FROM oidc_group_mappings").run();
  const stmt = db.prepare("INSERT INTO oidc_group_mappings (oidc_group, role) VALUES (?, ?)");
  for (const m of mappings || []) {
    const group = String(m.oidc_group || "").trim();
    const role = m.role;
    if (group && ["admin", "broadcaster", "listener"].includes(role)) {
      stmt.run(group, role);
    }
  }
}

export function persistWsToken(jti, userId, exp) {
  getDb().prepare("INSERT OR REPLACE INTO ws_tokens (jti, user_id, exp) VALUES (?, ?, ?)").run(jti, userId, exp);
}

export function hasWsToken(jti) {
  const row = getDb().prepare("SELECT exp FROM ws_tokens WHERE jti = ?").get(jti);
  if (!row) return false;
  if (row.exp < Date.now()) {
    getDb().prepare("DELETE FROM ws_tokens WHERE jti = ?").run(jti);
    return false;
  }
  return true;
}

export function pruneExpiredSessions() {
  getDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  getDb().prepare("DELETE FROM ws_tokens WHERE exp < ?").run(Date.now());
}
