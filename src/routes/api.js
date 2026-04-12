const express = require("express");
const db = require("../db/connection");
const { login, requireAdmin, logoutToken, changePassword } = require("../auth");
const { notifyScheduleChanged } = require("../realtime/hub");

const router = express.Router();

const CATALOGS = {
  teachers: { table: "teachers", label: "Profesor" },
  areas: { table: "areas", label: "Aula" },
  grades: { table: "grades", label: "Grado" }
};

function getCatalogResource(resource) {
  return CATALOGS[resource] || null;
}

function normalizeName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function listCatalog(resource) {
  const catalog = getCatalogResource(resource);
  if (!catalog) return null;

  return db.prepare(`SELECT id, name FROM ${catalog.table} ORDER BY name`).all();
}

function getCatalogItem(resource, id) {
  const catalog = getCatalogResource(resource);
  if (!catalog) return null;

  return db
    .prepare(`SELECT id, name FROM ${catalog.table} WHERE id = ?`)
    .get(id);
}

function createCatalogItem(resource, name) {
  const catalog = getCatalogResource(resource);
  if (!catalog) return null;

  const result = db.prepare(`INSERT INTO ${catalog.table}(name) VALUES(?)`).run(name);
  return getCatalogItem(resource, result.lastInsertRowid);
}

function updateCatalogItem(resource, id, name) {
  const catalog = getCatalogResource(resource);
  if (!catalog) return null;

  db.prepare(`UPDATE ${catalog.table} SET name = ? WHERE id = ?`).run(name, id);
  return getCatalogItem(resource, id);
}

function deleteCatalogItem(resource, id) {
  const catalog = getCatalogResource(resource);
  if (!catalog) return false;

  const result = db.prepare(`DELETE FROM ${catalog.table} WHERE id = ?`).run(id);
  return result.changes > 0;
}

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

function getBlockedSlotIds(weekLabel) {
  return db
    .prepare("SELECT slot_id AS slotId FROM schedule_blocks WHERE week_label = ?")
    .all(weekLabel)
    .map((row) => row.slotId);
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
                row_order AS rowOrder, col_order AS colOrder
       FROM slots
       ORDER BY row_order, col_order`
    )
    .all();

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
       JOIN slots s ON s.id = e.slot_id
       JOIN teachers t ON t.id = e.teacher_id
       JOIN areas a ON a.id = e.area_id
       JOIN grades g ON g.id = e.grade_id
       LEFT JOIN schedule_blocks b ON b.week_label = e.week_label AND b.slot_id = e.slot_id
       WHERE e.week_label = ?
         AND b.id IS NULL`
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
  const blockedSlotIds = getBlockedSlotIds(weekLabel);

  res.json({
    weekLabel,
    isLocked,
    blockedSlotIds,
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
  const weekLabel = getRequestedWeekLabel(req);

  if (!slotId || !teacherId || !areaId || !gradeId) {
    return res.status(400).json({ error: "Faltan datos para registrar" });
  }

  const slot = db.prepare("SELECT id FROM slots WHERE id = ?").get(slotId);
  if (!slot) {
    return res.status(404).json({ error: "Slot no encontrado" });
  }
  const blockedSlotIds = getBlockedSlotIds(weekLabel);
  if (blockedSlotIds.includes(slotId)) {
    return res.status(409).json({ error: "Este slot fue bloqueado por admin" });
  }
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
  const weekLabel = getRequestedWeekLabel(req);

  if (!slotId || !teacherId || !areaId || !gradeId) {
    return res.status(400).json({ error: "Faltan datos para guardar" });
  }

  const slot = db.prepare("SELECT id FROM slots WHERE id = ?").get(slotId);
  if (!slot) {
    return res.status(404).json({ error: "Slot no encontrado" });
  }
  const blockedSlotIds = getBlockedSlotIds(weekLabel);
  if (blockedSlotIds.includes(slotId)) {
    return res.status(409).json({ error: "Este slot fue bloqueado por admin" });
  }
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

router.get("/catalogs/:resource", requireAdmin, (req, res) => {
  const catalog = getCatalogResource(req.params.resource);
  if (!catalog) {
    return res.status(404).json({ error: "Catalogo no encontrado" });
  }

  res.json({ items: listCatalog(req.params.resource) });
});

router.post("/catalogs/:resource", requireAdmin, (req, res) => {
  const catalog = getCatalogResource(req.params.resource);
  if (!catalog) {
    return res.status(404).json({ error: "Catalogo no encontrado" });
  }

  const name = normalizeName(req.body && req.body.name);
  if (!name) {
    return res.status(400).json({ error: `Debes enviar un ${catalog.label.toLowerCase()}` });
  }

  try {
    const item = createCatalogItem(req.params.resource, name);
    res.status(201).json({ ok: true, item });
  } catch (error) {
    if (String(error.code) === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: `${catalog.label} duplicado` });
    }
    res.status(500).json({ error: "No se pudo crear el registro" });
  }
});

router.patch("/catalogs/:resource/:id", requireAdmin, (req, res) => {
  const catalog = getCatalogResource(req.params.resource);
  if (!catalog) {
    return res.status(404).json({ error: "Catalogo no encontrado" });
  }

  const id = Number(req.params.id);
  const name = normalizeName(req.body && req.body.name);

  if (!id) {
    return res.status(400).json({ error: "Id invalido" });
  }

  if (!name) {
    return res.status(400).json({ error: `Debes enviar un ${catalog.label.toLowerCase()}` });
  }

  const existing = getCatalogItem(req.params.resource, id);
  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado" });
  }

  try {
    const item = updateCatalogItem(req.params.resource, id, name);
    res.json({ ok: true, item });
  } catch (error) {
    if (String(error.code) === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: `${catalog.label} duplicado` });
    }
    res.status(500).json({ error: "No se pudo actualizar el registro" });
  }
});

router.delete("/catalogs/:resource/:id", requireAdmin, (req, res) => {
  const catalog = getCatalogResource(req.params.resource);
  if (!catalog) {
    return res.status(404).json({ error: "Catalogo no encontrado" });
  }

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Id invalido" });
  }

  const existing = getCatalogItem(req.params.resource, id);
  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado" });
  }

  try {
    const deleted = deleteCatalogItem(req.params.resource, id);
    if (!deleted) {
      return res.status(500).json({ error: "No se pudo eliminar el registro" });
    }
  } catch (error) {
    if (String(error.code) === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return res.status(409).json({ error: "No puedes eliminar un registro que ya esta usado en el horario" });
    }
    return res.status(500).json({ error: "No se pudo eliminar el registro" });
  }

  res.json({ ok: true });
});

router.patch("/slots/:slotId/block", requireAdmin, (req, res) => {
  const slotId = Number(req.params.slotId);
  const { isBlocked } = req.body || {};
  const weekLabel = getRequestedWeekLabel(req);

  if (!slotId) {
    return res.status(400).json({ error: "Slot invalido" });
  }

  if (typeof isBlocked !== "boolean") {
    return res.status(400).json({ error: "isBlocked debe ser boolean" });
  }

  const slot = db
    .prepare(
      `SELECT id, is_admin_blocked AS isAdminBlocked
       FROM slots WHERE id = ?`
    )
    .get(slotId);

  if (!slot) {
    return res.status(404).json({ error: "Slot no encontrado" });
  }

  const now = new Date().toISOString();

  try {
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    if (isBlocked) {
      db.prepare(
        `INSERT INTO schedule_blocks(week_label, slot_id, created_at, updated_at)
         VALUES(?, ?, ?, ?)
         ON CONFLICT(week_label, slot_id)
         DO UPDATE SET updated_at = excluded.updated_at`
      ).run(weekLabel, slotId, now, now);

      db.prepare("DELETE FROM schedule_entries WHERE week_label = ? AND slot_id = ?").run(
        weekLabel,
        slotId
      );
    } else {
      db.prepare("DELETE FROM schedule_blocks WHERE week_label = ? AND slot_id = ?").run(
        weekLabel,
        slotId
      );
    }

    db.exec("COMMIT");
    notifyScheduleChanged("slot-block", slotId);
    res.json({ ok: true, isBlocked, weekLabel, updatedAt: now });
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    res.status(500).json({ error: "No se pudo actualizar el bloqueo" });
  }
});

module.exports = router;
