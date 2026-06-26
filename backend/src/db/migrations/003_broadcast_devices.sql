CREATE TABLE IF NOT EXISTS extension_pair_requests (
  device_id TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paired_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  paired_token TEXT,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS broadcast_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_broadcast_devices_user ON broadcast_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_pair_expires ON extension_pair_requests(expires_at);
