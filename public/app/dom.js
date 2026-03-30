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
