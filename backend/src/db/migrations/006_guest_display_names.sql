CREATE TABLE IF NOT EXISTS guest_display_names (
  guest_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
