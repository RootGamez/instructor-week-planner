import { state, ui } from "../../core/state.js";
import { api } from "../../services/apiClient.js";
import { openModal, showGlobalMessage, showMessage } from "../../ui/dom.js";

export function ensureAdmin() {
  if (state.adminToken) return true;
  openModal("adminLoginModal");
  return false;
}

export function syncAdminUi() {
  const isAdmin = Boolean(state.adminToken);
  const adminOnlyButtons = document.querySelectorAll(".admin-only");

  if (ui.adminAccessButton) {
    ui.adminAccessButton.classList.toggle("hidden", isAdmin);
  }

  if (ui.logoutButton) {
    ui.logoutButton.classList.toggle("hidden", !isAdmin);
  }

  if (ui.adminPasswordButton) {
    ui.adminPasswordButton.classList.toggle("hidden", !isAdmin);
  }

  adminOnlyButtons.forEach((button) => {
    button.classList.toggle("hidden", !isAdmin);
  });
}

export async function handleAdminLogin() {
  const username = document.getElementById("adminUserInput").value.trim();
  const password = document.getElementById("adminPassInput").value;

  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    state.adminToken = result.token;
    localStorage.setItem("adminToken", result.token);
    syncAdminUi();
    showMessage("adminMessageBox", "Sesion admin activa.", "success");
    setTimeout(() => {
      const modal = document.getElementById("adminLoginModal");
      if (modal) modal.classList.add("hidden");
    }, 600);
  } catch (error) {
    showMessage("adminMessageBox", error.message, "error");
  }
}

export function handleAdminLogout() {
  const tokenToLogout = state.adminToken;

  const clearLocalSession = () => {
    state.adminToken = null;
    localStorage.removeItem("adminToken");
    syncAdminUi();
    showGlobalMessage("Sesion admin cerrada.", "success");
  };

  if (!tokenToLogout) {
    clearLocalSession();
    return;
  }

  api("/auth/logout", { method: "POST" })
    .catch(() => {})
    .finally(clearLocalSession);
}

export function openChangePasswordModal() {
  if (!ensureAdmin()) return;
  if (ui.currentPasswordInput) ui.currentPasswordInput.value = "";
  if (ui.newPasswordInput) ui.newPasswordInput.value = "";
  if (ui.confirmPasswordInput) ui.confirmPasswordInput.value = "";
  const box = document.getElementById("changePasswordMessageBox");
  if (box) box.style.display = "none";
  openModal("changePasswordModal");
}

export async function handleChangePassword() {
  if (!ensureAdmin()) return;

  const currentPassword = (ui.currentPasswordInput && ui.currentPasswordInput.value) || "";
  const newPassword = (ui.newPasswordInput && ui.newPasswordInput.value) || "";
  const confirmPassword = (ui.confirmPasswordInput && ui.confirmPasswordInput.value) || "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    showMessage("changePasswordMessageBox", "Completa todos los campos.", "error");
    return;
  }

  if (newPassword.length < 6) {
    showMessage("changePasswordMessageBox", "La nueva clave debe tener minimo 6 caracteres.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("changePasswordMessageBox", "La confirmacion no coincide con la nueva clave.", "error");
    return;
  }

  try {
    await api("/auth/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    showMessage("changePasswordMessageBox", "Clave actualizada correctamente.", "success");
    setTimeout(() => {
      const modal = document.getElementById("changePasswordModal");
      if (modal) modal.classList.add("hidden");
    }, 700);
  } catch (error) {
    showMessage("changePasswordMessageBox", error.message, "error");
  }
}
