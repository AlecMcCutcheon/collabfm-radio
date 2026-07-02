CREATE TABLE IF NOT EXISTS registration_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'activated')),
  token_hash TEXT NOT NULL UNIQUE,
  answers_json TEXT NOT NULL DEFAULT '{}',
  deny_reason TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  activated_at TEXT,
  activated_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_email ON registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);

ALTER TABLE users ADD COLUMN registration_request_id INTEGER REFERENCES registration_requests(id);
