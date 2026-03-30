import { state } from "./state.js";
import { api } from "./api.js";
import { ensureAdmin } from "./auth.js";
import { showGlobalMessage } from "./dom.js";

export async function handleNewWeekClick(loadBootstrap) {
  if (!ensureAdmin()) return;

  const confirmed = window.confirm("Se limpiara la agenda de la semana actual. Continuar?");
  if (!confirmed) return;

  try {
    await api("/week", {
      method: "PATCH",
      body: JSON.stringify({ clearSchedule: true })
    });
    await loadBootstrap(state.activeWeekLabel);
    showGlobalMessage("Nueva semana iniciada y agenda limpiada.", "success");
  } catch (error) {
    showGlobalMessage(error.message, "error");
  }
}

export async function handleLockClick(loadBootstrap) {
  if (!ensureAdmin()) return;

  try {
    await api("/lock", {
      method: "PATCH",
      body: JSON.stringify({ isLocked: !state.isLocked })
    });
    await loadBootstrap(state.activeWeekLabel);
    showGlobalMessage(state.isLocked ? "Horario bloqueado." : "Horario desbloqueado.", "success");
  } catch (error) {
    showGlobalMessage(error.message, "error");
  }
}
