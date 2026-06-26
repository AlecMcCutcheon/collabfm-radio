ALTER TABLE users ADD COLUMN experience_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN block_guest_action_xp INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  amount INTEGER NOT NULL,
  actor_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_id ON xp_events(user_id);

CREATE TABLE IF NOT EXISTS track_hearts (
  broadcaster_user_id INTEGER NOT NULL,
  track_session_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (broadcaster_user_id, track_session_id, actor_id),
  FOREIGN KEY (broadcaster_user_id) REFERENCES users(id) ON DELETE CASCADE
);
