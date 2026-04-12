const BASE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id
  ON admin_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_code TEXT NOT NULL,
  day_label TEXT NOT NULL,
  time_range TEXT NOT NULL,
  row_order INTEGER NOT NULL,
  col_order INTEGER NOT NULL,
  is_permanent_blocked INTEGER NOT NULL DEFAULT 0,
  is_admin_blocked INTEGER NOT NULL DEFAULT 0,
  UNIQUE(day_code, time_range)
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_label TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(week_label, slot_id),
  FOREIGN KEY(slot_id) REFERENCES slots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_week_label
  ON schedule_blocks(week_label);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_slot_id
  ON schedule_blocks(slot_id);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_label TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  area_id INTEGER NOT NULL,
  grade_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(week_label, slot_id),
  FOREIGN KEY(slot_id) REFERENCES slots(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id),
  FOREIGN KEY(area_id) REFERENCES areas(id),
  FOREIGN KEY(grade_id) REFERENCES grades(id)
);
`;

function columnExists(db, tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function ensureSchema(db) {
  db.exec(BASE_SCHEMA);

  if (!columnExists(db, "slots", "is_admin_blocked")) {
    db.exec("ALTER TABLE slots ADD COLUMN is_admin_blocked INTEGER NOT NULL DEFAULT 0");
  }

  db.exec("UPDATE slots SET is_permanent_blocked = 0 WHERE is_permanent_blocked <> 0");
  db.exec("UPDATE slots SET is_admin_blocked = 0 WHERE is_admin_blocked <> 0");
}

module.exports = { ensureSchema };