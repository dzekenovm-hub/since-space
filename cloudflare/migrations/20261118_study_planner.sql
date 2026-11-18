ALTER TABLE wall_posts ADD COLUMN author_user_id TEXT;

CREATE TABLE IF NOT EXISTS planner_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  color TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  reminder_minutes INTEGER,
  is_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS planner_events_user_date ON planner_events(user_id, starts_at);
