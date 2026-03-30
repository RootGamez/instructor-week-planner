import { state, ui } from "./state.js";
import { showMessage } from "./dom.js";

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
      state.pendingWeekLabel = formatWeekLabelFromDate(selectedDate);
      if (ui.selectedWeekPreview) {
        ui.selectedWeekPreview.textContent = state.pendingWeekLabel;
      }
    }
  });

  state.weekPicker.setDate(new Date(), true);
}

export function handleUpdateClick() {
  if (state.weekPicker) {
    state.weekPicker.setDate(new Date(), true);
  }
  const modal = document.getElementById("updateSubtitleModal");
  if (modal) modal.classList.remove("hidden");
}

export async function handleUpdateSubtitle(loadBootstrap) {
  const weekLabel = (state.pendingWeekLabel || "").trim();

  if (!weekLabel) {
    showMessage("updateSubtitleMessageBox", "Selecciona una semana en el calendario.", "error");
    return;
  }

  const confirmed = window.confirm(`Estas de acuerdo en actualizar a la semana "${weekLabel}"?`);
  if (!confirmed) return;

  try {
    await loadBootstrap(weekLabel);
    showMessage("updateSubtitleMessageBox", "Semana seleccionada correctamente.", "success");
    setTimeout(() => {
      const modal = document.getElementById("updateSubtitleModal");
      if (modal) modal.classList.add("hidden");
    }, 500);
  } catch (error) {
    showMessage("updateSubtitleMessageBox", error.message, "error");
  }
}
