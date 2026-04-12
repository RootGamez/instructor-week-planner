const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const { ensureSchema } = require("../src/db/schema");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const dbPath = process.env.DB_PATH || "./data/app.db";
const adminPassword = process.env.ADMIN_PASSWORD || "admin_password";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 12);
const seedPath = path.join(process.cwd(), "data", "seed-data.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

const absoluteDbPath = path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

const db = new DatabaseSync(absoluteDbPath);

ensureSchema(db);

const upsertSetting = db.prepare(`
  INSERT INTO app_settings(key, value) VALUES(?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

upsertSetting.run("current_week_label", seed.defaultWeekLabel);
upsertSetting.run("is_schedule_locked", "0");

const insertAdminIfMissing = db.prepare(
  "INSERT OR IGNORE INTO admin_users(username, password) VALUES(?, ?)"
);
insertAdminIfMissing.run("admin", adminPasswordHash);

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
      isPermanentBlocked: 0
    });
  });
});

console.log(`Base inicializada en: ${absoluteDbPath}`);
console.log("Usuario admin: admin");
console.log("Clave admin tomada de ADMIN_PASSWORD (.env)");

db.close();
