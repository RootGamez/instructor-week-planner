import { state } from "./state.js";
import { api } from "./api.js";
import { ensureAdmin } from "./auth.js";
import { escapeHtml, openModal, showMessage } from "./dom.js";

const CATALOGS = {
  teachers: {
    title: "Profesores",
    label: "profesor",
    placeholder: "Nombre del profesor"
  },
  areas: {
    title: "Aulas",
    label: "aula",
    placeholder: "Nombre del aula"
  },
  grades: {
    title: "Grados",
    label: "grado",
    placeholder: "Nombre del grado"
  },
  slots: {
    title: "Bloqueos de horario",
    label: "slot"
  }
};

let activeResource = "teachers";
let selectedItemId = null;
let reloadBootstrap = async () => {};

function getModalElements() {
  return {
    title: document.getElementById("catalogManagerTitle"),
    tabs: document.querySelectorAll("[data-catalog-resource]"),
    list: document.getElementById("catalogManagerList"),
    form: document.getElementById("catalogManagerForm"),
    input: document.getElementById("catalogManagerNameInput"),
    saveButton: document.getElementById("catalogManagerSaveButton"),
    deleteButton: document.getElementById("catalogManagerDeleteButton"),
    cancelButton: document.getElementById("catalogManagerCancelButton"),
    hint: document.getElementById("catalogManagerHint")
  };
}

function getResourceItems(resource) {
  if (resource === "teachers") return state.teachers;
  if (resource === "areas") return state.areas;
  if (resource === "grades") return state.grades;
  if (resource === "slots") return state.slots;
  return [];
}

function getResourceMeta(resource) {
  return CATALOGS[resource] || CATALOGS.teachers;
}

function renderCatalogManager() {
  const elements = getModalElements();
  const meta = getResourceMeta(activeResource);

  if (elements.title) {
    elements.title.textContent = meta.title;
  }

  elements.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.catalogResource === activeResource);
  });

  if (activeResource === "slots") {
    if (elements.form) elements.form.classList.add("hidden");
    if (elements.hint) {
      elements.hint.textContent = "Los bloqueos se guardan por semana activa. Al cambiar de semana, no se arrastran.";
    }
    if (elements.list) {
      elements.list.innerHTML = getResourceItems("slots")
        .map((slot) => {
          const blocked = state.weekBlockedSlotIds.has(slot.id);
          const status = blocked ? "Bloqueado en esta semana" : "Disponible";
          const actionLabel = blocked ? "Desbloquear" : "Bloquear";

          return `
            <div class="catalog-row ${blocked ? "blocked" : ""}">
              <div class="catalog-row-main">
                <strong>${escapeHtml(slot.dayLabel)} - ${escapeHtml(slot.timeRange)}</strong>
                <span>${escapeHtml(status)}</span>
              </div>
              <button class="catalog-row-action" data-slot-toggle="${slot.id}" data-slot-blocked="${blocked ? "1" : "0"}">${actionLabel}</button>
            </div>
          `;
        })
        .join("");
    }
    return;
  }

  if (elements.form) elements.form.classList.remove("hidden");
  if (elements.hint) {
    elements.hint.textContent = `Selecciona un ${meta.label}, edita su nombre y guarda los cambios.`;
  }

  if (elements.input) {
    elements.input.placeholder = meta.placeholder;
    elements.input.value = selectedItemId
      ? (getResourceItems(activeResource).find((item) => item.id === selectedItemId)?.name || "")
      : "";
  }

  if (elements.saveButton) {
    elements.saveButton.textContent = selectedItemId ? "Guardar cambios" : `Crear ${meta.label}`;
  }

  if (elements.deleteButton) {
    elements.deleteButton.classList.toggle("hidden", !selectedItemId);
  }

  if (elements.list) {
    elements.list.innerHTML = getResourceItems(activeResource)
      .map((item) => {
        const isSelected = item.id === selectedItemId;
        return `
          <button class="catalog-row ${isSelected ? "selected" : ""}" data-catalog-id="${item.id}">
            <span class="catalog-row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <span>Id ${item.id}</span>
            </span>
          </button>
        `;
      })
      .join("");
  }
}

async function refreshData() {
  await reloadBootstrap(state.activeWeekLabel || undefined);
  renderCatalogManager();
}

export function wireCatalogManager() {
  const elements = getModalElements();

  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      activeResource = button.dataset.catalogResource || "teachers";
      selectedItemId = null;
      renderCatalogManager();
    });
  });

  elements.list?.addEventListener("click", async (event) => {
    const catalogButton = event.target.closest("[data-catalog-id]");
    const toggleButton = event.target.closest("[data-slot-toggle]");

    if (catalogButton) {
      selectedItemId = Number(catalogButton.dataset.catalogId);
      renderCatalogManager();
      return;
    }

    if (toggleButton) {
      if (!ensureAdmin()) return;
      const slotId = Number(toggleButton.dataset.slotToggle);
      const isBlocked = toggleButton.dataset.slotBlocked === "1";

      try {
        await api(`/slots/${slotId}/block`, {
          method: "PATCH",
          body: JSON.stringify({ isBlocked: !isBlocked, weekLabel: state.activeWeekLabel })
        });
        await refreshData();
        showMessage("catalogManagerMessageBox", isBlocked ? "Slot desbloqueado en esta semana." : "Slot bloqueado en esta semana.", "success");
      } catch (error) {
        showMessage("catalogManagerMessageBox", error.message, "error");
      }
    }
  });

  elements.saveButton?.addEventListener("click", async () => {
    if (activeResource === "slots") return;
    if (!ensureAdmin()) return;

    const name = elements.input ? elements.input.value.trim() : "";
    if (!name) {
      showMessage("catalogManagerMessageBox", "Escribe un nombre.", "error");
      return;
    }

    try {
      const path = selectedItemId
        ? `/catalogs/${activeResource}/${selectedItemId}`
        : `/catalogs/${activeResource}`;
      const method = selectedItemId ? "PATCH" : "POST";

      await api(path, {
        method,
        body: JSON.stringify({ name })
      });

      selectedItemId = null;
      await refreshData();
      showMessage("catalogManagerMessageBox", "Registro guardado.", "success");
    } catch (error) {
      showMessage("catalogManagerMessageBox", error.message, "error");
    }
  });

  elements.deleteButton?.addEventListener("click", async () => {
    if (activeResource === "slots" || !selectedItemId) return;
    if (!ensureAdmin()) return;

    const meta = getResourceMeta(activeResource);
    const confirmed = window.confirm(`Eliminar ${meta.label} seleccionado?`);
    if (!confirmed) return;

    try {
      await api(`/catalogs/${activeResource}/${selectedItemId}`, { method: "DELETE" });
      selectedItemId = null;
      await refreshData();
      showMessage("catalogManagerMessageBox", "Registro eliminado.", "success");
    } catch (error) {
      showMessage("catalogManagerMessageBox", error.message, "error");
    }
  });

  elements.cancelButton?.addEventListener("click", () => {
    selectedItemId = null;
    renderCatalogManager();
  });
}

export function openCatalogManager(loadBootstrap) {
  if (!ensureAdmin()) return;

  reloadBootstrap = loadBootstrap;
  activeResource = "teachers";
  selectedItemId = null;
  renderCatalogManager();
  openModal("catalogManagerModal");
}