const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const dbPath = process.env.DB_PATH || "./data/app.db";
const adminPassword = process.env.ADMIN_PASSWORD || "admin_password";
const seedPath = path.join(process.cwd(), "data", "seed-data.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

const absoluteDbPath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

const db = new DatabaseSync(absoluteDbPath);

db.exec(`
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
  UNIQUE(day_code, time_range)
);

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
`);

const upsertSetting = db.prepare(`
  INSERT INTO app_settings(key, value) VALUES(?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

upsertSetting.run("current_week_label", seed.defaultWeekLabel);
upsertSetting.run("is_schedule_locked", "0");

const upsertAdmin = db.prepare(`
  INSERT INTO admin_users(username, password) VALUES(?, ?)
  ON CONFLICT(username) DO UPDATE SET password = excluded.password
`);
upsertAdmin.run("admin", adminPassword);

const insertTeacher = db.prepare("INSERT OR IGNORE INTO teachers(name) VALUES(?)");
const insertArea = db.prepare("INSERT OR IGNORE INTO areas(name) VALUES(?)");
const insertGrade = db.prepare("INSERT OR IGNORE INTO grades(name) VALUES(?)");

for (const teacher of seed.teachers.slice().sort((a, b) => a.localeCompare(b, "es"))) {
  insertTeacher.run(teacher);
}
for (const area of seed.areas.slice().sort((a, b) => a.localeCompare(b, "es"))) {
  insertArea.run(area);
}
for (const grade of seed.grades.slice().sort((a, b) => a.localeCompare(b, "es"))) {
  insertGrade.run(grade);
}

const blockedSet = new Set(
  seed.permanentBlocked.map((item) => `${item.dayCode}|${item.timeRange}`)
);

const insertSlot = db.prepare(`
  INSERT OR IGNORE INTO slots(day_code, day_label, time_range, row_order, col_order, is_permanent_blocked)
  VALUES(@dayCode, @dayLabel, @timeRange, @rowOrder, @colOrder, @isPermanentBlocked)
`);

seed.timeRanges.forEach((timeRange, rowIndex) => {
  seed.days.forEach((day, colIndex) => {
    insertSlot.run({
      dayCode: day.code,
      dayLabel: day.label,
      timeRange,
      rowOrder: rowIndex,
      colOrder: colIndex,
      isPermanentBlocked: blockedSet.has(`${day.code}|${timeRange}`) ? 1 : 0
    });
  });
});

console.log(`Base inicializada en: ${absoluteDbPath}`);
console.log("Usuario admin: admin");
console.log("Clave admin tomada de ADMIN_PASSWORD (.env)");

db.close();
