import { ui } from "./state.js";

export function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = message;
  element.className = `message-box ${type}`;
  element.style.display = "block";
  setTimeout(() => {
    element.style.display = "none";
  }, 3500);
}

export function showGlobalMessage(message, type) {
  const box = ui.globalMessageBox;
  if (!box) return;

  box.textContent = message;
  box.className = `message-box ${type}`;
  box.classList.remove("hidden");
  box.style.display = "block";
  setTimeout(() => {
    box.classList.add("hidden");
    box.style.display = "none";
  }, 3500);
}

export function openModal(modalId) {
  const element = document.getElementById(modalId);
  if (element) {
    element.classList.remove("hidden");
  }
}

export function closeModal(modalId) {
  const element = document.getElementById(modalId);
  if (element) {
    element.classList.add("hidden");
  }
}

export function withWeekQuery(path, weekLabel) {
  const normalized = (weekLabel || "").trim();
  if (!normalized) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}weekLabel=${encodeURIComponent(normalized)}`;
}

export function setSelectOptions(selectElement, options) {
  if (!selectElement) return;

  selectElement.innerHTML = "";
  for (const item of options) {
    const option = document.createElement("option");
    option.value = String(item.id);
    option.textContent = item.name;
    selectElement.appendChild(option);
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

let confirmResolver = null;

export function openConfirmModal({ title, message, confirmText = "Aceptar", cancelText = "Cancelar" }) {
  const modal = document.getElementById("confirmModal");
  const titleElement = document.getElementById("confirmModalTitle");
  const messageElement = document.getElementById("confirmModalMessage");
  const confirmButton = document.getElementById("confirmModalAcceptButton");
  const cancelButton = document.getElementById("confirmModalCancelButton");

  if (!modal || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    return Promise.resolve(window.confirm(message));
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  modal.classList.remove("hidden");

  const cleanup = () => {
    modal.classList.add("hidden");
    confirmButton.onclick = null;
    cancelButton.onclick = null;
    if (confirmResolver) {
      confirmResolver = null;
    }
  };

  return new Promise((resolve) => {
    confirmResolver = resolve;

    confirmButton.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelButton.onclick = () => {
      cleanup();
      resolve(false);
    };

    modal.onclick = (event) => {
      if (event.target === modal) {
        cleanup();
        resolve(false);
      }
    };
  });
}
