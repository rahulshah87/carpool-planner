import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || '';
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const isCloudSql = dbUrl.includes('/cloudsql/');

const pool = new Pool({
  connectionString: dbUrl,
  // Cloud SQL uses Unix sockets (no SSL needed); localhost doesn't need SSL either
  ssl: isLocal || isCloudSql ? false : { rejectUnauthorized: false },
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      home_address TEXT,
      home_lat DOUBLE PRECISION,
      home_lng DOUBLE PRECISION,
      home_neighborhood TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS commute_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('TO_WORK', 'FROM_WORK')),
      earliest_time TEXT NOT NULL,
      latest_time TEXT NOT NULL,
      days_of_week JSONB NOT NULL DEFAULT '[]',
      role TEXT NOT NULL CHECK (role IN ('DRIVER', 'RIDER', 'EITHER')),
      UNIQUE(user_id, direction)
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      detour_minutes DOUBLE PRECISION,
      time_overlap_minutes DOUBLE PRECISION,
      rank_score DOUBLE PRECISION,
      computed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_match_user_a ON match_results(user_a_id);
    CREATE INDEX IF NOT EXISTS idx_match_user_b ON match_results(user_b_id);
    CREATE INDEX IF NOT EXISTS idx_prefs_user ON commute_preferences(user_id);
  `);
}

export default pool;
