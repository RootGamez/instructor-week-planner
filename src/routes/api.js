const express = require("express");
const db = require("../db/connection");
const { login, requireAdmin, logoutToken, changePassword } = require("../auth");
const { notifyScheduleChanged } = require("../realtime/hub");

const router = express.Router();

function getCurrentWeekLabel() {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'current_week_label'")
    .get();
  return row ? row.value : "";
}

function normalizeWeekLabel(rawValue) {
  if (typeof rawValue !== "string") return "";
  const value = rawValue.trim();
  return value;
}

function getRequestedWeekLabel(req) {
  const fromQuery = normalizeWeekLabel(req.query.weekLabel);
  if (fromQuery) return fromQuery;

  const fromBody = normalizeWeekLabel(req.body && req.body.weekLabel);
  if (fromBody) return fromBody;

  return getCurrentWeekLabel();
}

function getLockedState() {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'is_schedule_locked'")
    .get();
  return row ? row.value === "1" : false;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function getCatalog() {
  const teachers = db.prepare("SELECT id, name FROM teachers ORDER BY name").all();
  const areas = db.prepare("SELECT id, name FROM areas ORDER BY name").all();
  const grades = db.prepare("SELECT id, name FROM grades ORDER BY name").all();
  const slots = db
    .prepare(
      `SELECT id, day_code AS dayCode, day_label AS dayLabel, time_range AS timeRange,
              row_order AS rowOrder, col_order AS colOrder, is_permanent_blocked AS isPermanentBlocked
       FROM slots
       ORDER BY row_order, col_order`
    )
    .all()
    .map((row) => ({ ...row, isPermanentBlocked: Boolean(row.isPermanentBlocked) }));

  return { teachers, areas, grades, slots };
}

function getSchedule(weekLabel) {
  return db
    .prepare(
      `SELECT e.slot_id AS slotId,
              t.id AS teacherId,
              t.name AS teacherName,
              a.id AS areaId,
              a.name AS areaName,
              g.id AS gradeId,
              g.name AS gradeName
       FROM schedule_entries e
       JOIN teachers t ON t.id = e.teacher_id
       JOIN areas a ON a.id = e.area_id
       JOIN grades g ON g.id = e.grade_id
       WHERE e.week_label = ?`
    )
    .all(weekLabel);
}

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    !username.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    return res.status(400).json({ error: "Debes enviar usuario y clave" });
  }

  const token = login(username, password);

  if (!token) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  res.json({ token });
});

router.post("/auth/logout", requireAdmin, (req, res) => {
  logoutToken(req.authToken);
  res.json({ ok: true });
});

router.patch("/auth/password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (
    typeof currentPassword !== "string" ||
    !currentPassword.trim() ||
    typeof newPassword !== "string" ||
    newPassword.trim().length < 6
  ) {
    return res.status(400).json({
      error: "Debes enviar clave actual y nueva clave (minimo 6 caracteres)"
    });
  }

  const result = changePassword(req.admin.userId, currentPassword.trim(), newPassword.trim());

  if (!result.ok && result.code === "INVALID_CURRENT_PASSWORD") {
    return res.status(400).json({ error: "La clave actual es incorrecta" });
  }

  if (!result.ok) {
    return res.status(404).json({ error: "No se encontro usuario admin" });
  }

  res.json({ ok: true });
});

router.get("/bootstrap", (req, res) => {
  const weekLabel = getRequestedWeekLabel(req);
  const isLocked = getLockedState();
  const catalog = getCatalog();
  const entries = getSchedule(weekLabel);

  res.json({
    weekLabel,
    isLocked,
    ...catalog,
    entries
  });
});

router.post("/entries/:slotId/reserve", (req, res) => {
  if (getLockedState()) {
    return res.status(423).json({ error: "El horario esta bloqueado" });
  }

  const slotId = Number(req.params.slotId);
  const { teacherId, areaId, gradeId } = req.body || {};

  if (!slotId || !teacherId || !areaId || !gradeId) {
    return res.status(400).json({ error: "Faltan datos para registrar" });
  }

  const slot = db.prepare("SELECT id, is_permanent_blocked FROM slots WHERE id = ?").get(slotId);
  if (!slot) {
    return res.status(404).json({ error: "Slot no encontrado" });
  }
  if (slot.is_permanent_blocked) {
    return res.status(409).json({ error: "Este slot esta bloqueado permanentemente" });
  }

  const weekLabel = getRequestedWeekLabel(req);
  const now = new Date().toISOString();

  try {
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    const exists = db
      .prepare("SELECT id FROM schedule_entries WHERE week_label = ? AND slot_id = ?")
      .get(weekLabel, slotId);

    if (exists) {
      db.exec("ROLLBACK");
      return res.status(409).json({ error: "El slot ya fue reservado por otra persona" });
    }

    db.prepare(
      `INSERT INTO schedule_entries(week_label, slot_id, teacher_id, area_id, grade_id, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    ).run(weekLabel, slotId, teacherId, areaId, gradeId, now, now);

    db.exec("COMMIT");
    notifyScheduleChanged("reserve", slotId);
    res.status(201).json({ ok: true });
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    res.status(500).json({ error: "No se pudo reservar" });
  }
});

router.put("/entries/:slotId", requireAdmin, (req, res) => {
  const slotId = Number(req.params.slotId);
  const { teacherId, areaId, gradeId } = req.body || {};

  if (!slotId || !teacherId || !areaId || !gradeId) {
    return res.status(400).json({ error: "Faltan datos para guardar" });
  }

  const slot = db.prepare("SELECT id, is_permanent_blocked FROM slots WHERE id = ?").get(slotId);
  if (!slot) {
    return res.status(404).json({ error: "Slot no encontrado" });
  }
  if (slot.is_permanent_blocked) {
    return res.status(409).json({ error: "Este slot esta bloqueado permanentemente" });
  }

  const weekLabel = getRequestedWeekLabel(req);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO schedule_entries(week_label, slot_id, teacher_id, area_id, grade_id, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_label, slot_id)
     DO UPDATE SET
       teacher_id = excluded.teacher_id,
       area_id = excluded.area_id,
       grade_id = excluded.grade_id,
       updated_at = excluded.updated_at`
  ).run(weekLabel, slotId, teacherId, areaId, gradeId, now, now);

  notifyScheduleChanged("upsert", slotId);

  res.json({ ok: true });
});

router.delete("/entries/:slotId", requireAdmin, (req, res) => {
  const slotId = Number(req.params.slotId);
  const weekLabel = getRequestedWeekLabel(req);

  db.prepare("DELETE FROM schedule_entries WHERE week_label = ? AND slot_id = ?").run(
    weekLabel,
    slotId
  );

  notifyScheduleChanged("delete", slotId);

  res.json({ ok: true });
});

router.patch("/week", requireAdmin, (req, res) => {
  const { weekLabel, clearSchedule } = req.body || {};

  if (typeof weekLabel === "string" && weekLabel.trim()) {
    setSetting("current_week_label", weekLabel.trim());
  }

  if (clearSchedule === true) {
    const currentWeek = getCurrentWeekLabel();
    db.prepare("DELETE FROM schedule_entries WHERE week_label = ?").run(currentWeek);
    setSetting("is_schedule_locked", "0");
  }

  notifyScheduleChanged("week");

  res.json({ ok: true, weekLabel: getCurrentWeekLabel(), isLocked: getLockedState() });
});

router.patch("/lock", requireAdmin, (req, res) => {
  const { isLocked } = req.body || {};
  if (typeof isLocked !== "boolean") {
    return res.status(400).json({ error: "isLocked debe ser boolean" });
  }

  setSetting("is_schedule_locked", isLocked ? "1" : "0");
  notifyScheduleChanged("lock");
  res.json({ ok: true, isLocked: getLockedState() });
});

module.exports = router;
