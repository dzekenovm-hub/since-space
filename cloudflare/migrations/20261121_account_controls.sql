CREATE TABLE IF NOT EXISTS registration_devices (
  device_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS registration_devices_user_id ON registration_devices(user_id);
