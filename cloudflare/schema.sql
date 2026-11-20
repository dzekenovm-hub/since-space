CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  progress TEXT NOT NULL DEFAULT '{}',
  inventory TEXT NOT NULL DEFAULT '[]',
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
CREATE TABLE IF NOT EXISTS registration_devices (
  device_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS registration_devices_user_id ON registration_devices(user_id);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wall_posts (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  author_user_id TEXT,
  tag TEXT NOT NULL DEFAULT 'СТЕНА',
  created_at TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_content (
  content_key TEXT PRIMARY KEY,
  content_value TEXT NOT NULL
);

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
CREATE TABLE IF NOT EXISTS quest_challenges (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  element_num INTEGER NOT NULL,
  question_type TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
