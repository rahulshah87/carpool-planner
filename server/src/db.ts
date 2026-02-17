import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'carpool.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    home_address TEXT,
    home_lat REAL,
    home_lng REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commute_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('TO_WORK', 'FROM_WORK')),
    earliest_time TEXT NOT NULL,
    latest_time TEXT NOT NULL,
    days_of_week TEXT NOT NULL DEFAULT '[]',
    role TEXT NOT NULL CHECK (role IN ('DRIVER', 'RIDER', 'EITHER')),
    UNIQUE(user_id, direction)
  );

  CREATE TABLE IF NOT EXISTS match_results (
    id TEXT PRIMARY KEY,
    user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    detour_minutes REAL,
    time_overlap_minutes REAL,
    rank_score REAL,
    computed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_match_user_a ON match_results(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_match_user_b ON match_results(user_b_id);
  CREATE INDEX IF NOT EXISTS idx_prefs_user ON commute_preferences(user_id);
`);

export default db;
