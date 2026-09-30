CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
