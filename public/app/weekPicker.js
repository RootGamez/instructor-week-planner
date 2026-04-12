import { state, ui } from "./state.js";
import { openConfirmModal, showMessage } from "./dom.js";

const MONTHS_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE"
];

function formatWeekLabelFromDate(date) {
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  const day = (baseDate.getDay() + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - day);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const mondayDay = String(monday.getDate()).padStart(2, "0");
  const fridayDay = String(friday.getDate()).padStart(2, "0");
  const mondayMonth = MONTHS_ES[monday.getMonth()];
  const fridayMonth = MONTHS_ES[friday.getMonth()];

  return `LUNES ${mondayDay} DE ${mondayMonth} AL VIERNES ${fridayDay} DE ${fridayMonth}`;
}

function parseMonthName(monthName) {
  const normalized = String(monthName || "").trim().toUpperCase();
  return MONTHS_ES.indexOf(normalized);
}

export function resolveWeekDateFromLabel(weekLabel) {
  if (typeof weekLabel !== "string") return null;

  const normalized = weekLabel.trim().toUpperCase();
  const fullMatch = normalized.match(
    /LUNES\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)\s+AL\s+VIERNES\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)(?:\s+DE\s+(\d{4}))?/
  );
  if (fullMatch) {
    const year = fullMatch[5] ? Number(fullMatch[5]) : new Date().getFullYear();
    const monthIndex = parseMonthName(fullMatch[2]);
    if (monthIndex >= 0) {
      const monday = new Date(year, monthIndex, Number(fullMatch[1]));
      monday.setHours(12, 0, 0, 0);
      return monday;
    }
  }

  const legacyMatch = normalized.match(
    /LUNES\s+(\d{1,2})\s+AL\s+VIERNES\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)(?:\s+DE\s+(\d{4}))?/
  );
  if (legacyMatch) {
    const year = legacyMatch[4] ? Number(legacyMatch[4]) : new Date().getFullYear();
    const monthIndex = parseMonthName(legacyMatch[3]);
    if (monthIndex >= 0) {
      const monday = new Date(year, monthIndex, Number(legacyMatch[1]));
      monday.setHours(12, 0, 0, 0);
      return monday;
    }
  }

  return null;
}

function shiftWeek(date, offsetWeeks) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offsetWeeks * 7);
  nextDate.setHours(12, 0, 0, 0);
  return nextDate;
}

function syncPickerSelection(date) {
  if (!state.weekPicker || !date) return;
  state.weekPicker.setDate(date, true);
}

export function initWeekPicker() {
  if (typeof flatpickr === "undefined" || !ui.weekPickerInput) {
    return;
  }

  const weekSelectPlugin =
    window.weekSelect && typeof window.weekSelect === "function"
      ? [new window.weekSelect({})]
      : [];

  state.weekPicker = flatpickr(ui.weekPickerInput, {
    locale: window.flatpickr && window.flatpickr.l10ns ? window.flatpickr.l10ns.es : "default",
    dateFormat: "Y-m-d",
    disableMobile: true,
    clickOpens: true,
    plugins: weekSelectPlugin,
    onChange: (selectedDates) => {
      if (!selectedDates || selectedDates.length === 0) return;
      const selectedDate = selectedDates[0];
      state.activeWeekDate = new Date(selectedDate);
      state.activeWeekDate.setHours(12, 0, 0, 0);
      state.pendingWeekLabel = formatWeekLabelFromDate(selectedDate);
      if (ui.selectedWeekPreview) {
        ui.selectedWeekPreview.textContent = state.pendingWeekLabel;
      }
    }
  });

  syncPickerSelection(state.activeWeekDate || new Date());
}

export function handleUpdateClick() {
  if (state.weekPicker) {
    syncPickerSelection(state.activeWeekDate || new Date());
  }
  const modal = document.getElementById("updateSubtitleModal");
  if (modal) modal.classList.remove("hidden");
}

export async function handlePreviousWeek(loadBootstrap) {
  const currentDate = state.activeWeekDate || resolveWeekDateFromLabel(state.activeWeekLabel) || new Date();
  const targetDate = shiftWeek(currentDate, -1);
  await loadBootstrap(formatWeekLabelFromDate(targetDate), targetDate);
}

export async function handleNextWeek(loadBootstrap) {
  const currentDate = state.activeWeekDate || resolveWeekDateFromLabel(state.activeWeekLabel) || new Date();
  const targetDate = shiftWeek(currentDate, 1);
  await loadBootstrap(formatWeekLabelFromDate(targetDate), targetDate);
}

export async function handleCurrentWeek(loadBootstrap) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  await loadBootstrap(formatWeekLabelFromDate(today), today);
}

export async function handleUpdateSubtitle(loadBootstrap) {
  const weekLabel = (state.pendingWeekLabel || "").trim();

  if (!weekLabel) {
    showMessage("updateSubtitleMessageBox", "Selecciona una semana en el calendario.", "error");
    return;
  }

  const confirmed = await openConfirmModal({
    title: "Confirmar semana",
    message: `Estas de acuerdo en actualizar a la semana "${weekLabel}"?`,
    confirmText: "Actualizar",
    cancelText: "Cancelar"
  });
  if (!confirmed) return;

  try {
    const selectedDate = state.weekPicker && state.weekPicker.selectedDates && state.weekPicker.selectedDates[0]
      ? new Date(state.weekPicker.selectedDates[0])
      : resolveWeekDateFromLabel(weekLabel) || state.activeWeekDate || new Date();

    await loadBootstrap(weekLabel, selectedDate);
    showMessage("updateSubtitleMessageBox", "Semana seleccionada correctamente.", "success");
    setTimeout(() => {
      const modal = document.getElementById("updateSubtitleModal");
      if (modal) modal.classList.add("hidden");
    }, 500);
  } catch (error) {
    showMessage("updateSubtitleMessageBox", error.message, "error");
  }
}
