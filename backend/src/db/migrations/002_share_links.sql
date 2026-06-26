CREATE TABLE IF NOT EXISTS stream_share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  link_kind TEXT NOT NULL CHECK (link_kind IN ('ui', 'stream')),
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON stream_share_links(token);
