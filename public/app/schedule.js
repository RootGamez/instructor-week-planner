import { state, ui } from "./state.js";
import { api } from "./api.js";
import {
  openModal,
  setSelectOptions,
  showGlobalMessage,
  showMessage,
  withWeekQuery
} from "./dom.js";
import { ensureAdmin } from "./auth.js";
import { requestSlotLock, releaseCurrentEditingLock } from "./realtime.js";
import { resolveWeekDateFromLabel } from "./weekPicker.js";

export function syncLockButtonIcon() {
  const lockIcon = document.querySelector("#lockButton i");
  if (!lockIcon) return;

  lockIcon.classList.toggle("fa-lock", state.isLocked);
  lockIcon.classList.toggle("fa-lock-open", !state.isLocked);

  if (ui.lockButton) {
    ui.lockButton.innerHTML = state.isLocked
      ? '<i class="fas fa-lock"></i> Desbloquear Agenda'
      : '<i class="fas fa-lock-open"></i> Bloquear Agenda';
  }
}

export function renderTable() {
  const uniqueDays = [];
  const seen = new Set();
  for (const slot of state.slots) {
    if (!seen.has(slot.dayCode)) {
      seen.add(slot.dayCode);
      uniqueDays.push({ dayCode: slot.dayCode, dayLabel: slot.dayLabel, colOrder: slot.colOrder });
    }
  }
  uniqueDays.sort((a, b) => a.colOrder - b.colOrder);

  ui.tableHeadRow.innerHTML = "";
  const hourTh = document.createElement("th");
  hourTh.textContent = "HORA";
  ui.tableHeadRow.appendChild(hourTh);

  const mondayDate = state.activeWeekDate instanceof Date && !Number.isNaN(state.activeWeekDate.getTime())
    ? new Date(state.activeWeekDate)
    : new Date();
  mondayDate.setHours(12, 0, 0, 0);

  for (const day of uniqueDays) {
    const th = document.createElement("th");
    const dayDate = new Date(mondayDate);
    dayDate.setDate(mondayDate.getDate() + day.colOrder);
    const dateLabel = String(dayDate.getDate()).padStart(2, "0");
    th.textContent = `${day.dayLabel} ${dateLabel}`;
    ui.tableHeadRow.appendChild(th);
  }

  const rowOrders = [...new Set(state.slots.map((slot) => slot.rowOrder))].sort((a, b) => a - b);
  ui.scheduleTableBody.innerHTML = "";

  for (const rowOrder of rowOrders) {
    const tr = document.createElement("tr");
    const rowSlots = state.slots
      .filter((slot) => slot.rowOrder === rowOrder)
      .sort((a, b) => a.colOrder - b.colOrder);

    const timeCell = document.createElement("td");
    timeCell.className = "time-cell";
    timeCell.textContent = rowSlots[0].timeRange;
    tr.appendChild(timeCell);

    for (const slot of rowSlots) {
      const td = document.createElement("td");
      td.dataset.slotId = String(slot.id);

      if (state.weekBlockedSlotIds.has(slot.id)) {
        td.classList.add("admin-block-cell");
      } else if (
        state.realtimeLockedSlotIds.has(slot.id) &&
        state.ownedEditingSlotId !== slot.id
      ) {
        td.classList.add("editing-lock-cell");
      } else if (state.isLocked) {
        td.classList.add("locked-cell");
      } else {
        td.classList.add("clickable-cell");
      }

      const entry = state.entriesBySlotId[slot.id];
      td.textContent = entry ? `${entry.teacherName}, ${entry.areaName}, ${entry.gradeName}` : "";

      td.addEventListener("click", () => handleCellClick(slot.id));
      tr.appendChild(td);
    }

    ui.scheduleTableBody.appendChild(tr);
  }

  ui.subtitle.textContent = `SEMANA DEL ${state.weekLabel}`;
  syncLockButtonIcon();
}

export async function loadBootstrap(weekLabel, weekDate) {
  const path = withWeekQuery("/bootstrap", weekLabel);
  const data = await api(path, { method: "GET" });

  state.weekLabel = data.weekLabel;
  state.activeWeekLabel = data.weekLabel;
  state.activeWeekDate = weekDate || resolveWeekDateFromLabel(data.weekLabel) || new Date();
  state.isLocked = data.isLocked;
  state.teachers = data.teachers;
  state.areas = data.areas;
  state.grades = data.grades;
  state.slots = data.slots;
  state.weekBlockedSlotIds = new Set(data.blockedSlotIds || []);
  state.entriesBySlotId = {};
  for (const entry of data.entries) {
    state.entriesBySlotId[entry.slotId] = entry;
  }

  setSelectOptions(ui.docenteSelect, state.teachers);
  setSelectOptions(ui.areaSelect, state.areas);
  setSelectOptions(ui.gradoSelect, state.grades);
  renderTable();
}

function openRegistration(slotId, current) {
  state.selectedSlotId = slotId;

  if (current) {
    ui.docenteSelect.value = String(current.teacherId);
    ui.areaSelect.value = String(current.areaId);
    ui.gradoSelect.value = String(current.gradeId);
  } else {
    ui.docenteSelect.selectedIndex = 0;
    ui.areaSelect.selectedIndex = 0;
    ui.gradoSelect.selectedIndex = 0;
  }

  openModal("registrationModal");
}

export async function handleCellClick(slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot || state.weekBlockedSlotIds.has(slotId)) return;

  if (state.realtimeLockedSlotIds.has(slotId) && state.ownedEditingSlotId !== slotId) {
    showGlobalMessage("Este horario esta siendo editado por otro usuario.", "error");
    return;
  }

  if (state.isLocked) {
    showGlobalMessage("El horario esta bloqueado.", "error");
    return;
  }

  const current = state.entriesBySlotId[slotId];
  if (current) {
    if (!state.adminToken) {
      showGlobalMessage("Solo el admin puede modificar un horario ya registrado.", "error");
      return;
    }

    const lockOk = await requestSlotLock(slotId);
    if (!lockOk) return;

    state.selectedSlotId = slotId;
    openModal("editModal");
    renderTable();
    return;
  }

  const lockOk = await requestSlotLock(slotId);
  if (!lockOk) return;

  openRegistration(slotId, null);
  renderTable();
}

export async function handleRegister() {
  if (!state.selectedSlotId) return;

  const payload = {
    teacherId: Number(ui.docenteSelect.value),
    areaId: Number(ui.areaSelect.value),
    gradeId: Number(ui.gradoSelect.value),
    weekLabel: state.activeWeekLabel
  };

  try {
    if (state.adminToken) {
      await api(`/entries/${state.selectedSlotId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showMessage("messageBox", "Horario guardado por admin.", "success");
    } else {
      await api(`/entries/${state.selectedSlotId}/reserve`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showMessage("messageBox", "Horario registrado.", "success");
    }

    await loadBootstrap(state.activeWeekLabel);
    setTimeout(() => {
      const modal = document.getElementById("registrationModal");
      if (modal) modal.classList.add("hidden");
      releaseCurrentEditingLock();
    }, 600);
  } catch (error) {
    showMessage("messageBox", error.message, "error");
  }
}

export async function handleEditContent() {
  if (!ensureAdmin()) return;

  const current = state.entriesBySlotId[state.selectedSlotId];
  if (!current) {
    showMessage("editMessageBox", "No hay contenido para editar.", "error");
    return;
  }

  const editModal = document.getElementById("editModal");
  if (editModal) editModal.classList.add("hidden");
  openRegistration(state.selectedSlotId, current);
}

export async function handleDeleteContent() {
  if (!ensureAdmin()) return;

  try {
    await api(withWeekQuery(`/entries/${state.selectedSlotId}`, state.activeWeekLabel), {
      method: "DELETE"
    });
    showMessage("editMessageBox", "Contenido eliminado.", "success");
    await loadBootstrap(state.activeWeekLabel);
    setTimeout(() => {
      const modal = document.getElementById("editModal");
      if (modal) modal.classList.add("hidden");
      releaseCurrentEditingLock();
    }, 500);
  } catch (error) {
    showMessage("editMessageBox", error.message, "error");
  }
}
