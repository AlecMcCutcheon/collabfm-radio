DROP TABLE IF EXISTS guest_display_names;

CREATE TABLE guest_display_names (
  share_link_id INTEGER NOT NULL,
  guest_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (share_link_id, guest_id)
);
