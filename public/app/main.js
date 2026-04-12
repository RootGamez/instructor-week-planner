import { state } from "./state.js";
import { closeModal, openModal, showGlobalMessage } from "./dom.js";
import {
  handleAdminLogin,
  handleAdminLogout,
  handleChangePassword,
  openChangePasswordModal,
  syncAdminUi
} from "./auth.js";
import {
  handleDeleteContent,
  handleEditContent,
  handleBlockCurrentSlot,
  handleRegister,
  loadBootstrap,
  renderTable
} from "./schedule.js";
import { connectWebSocket, configureRealtime, releaseCurrentEditingLock } from "./realtime.js";
import {
  handleCurrentWeek,
  handleNextWeek,
  handlePreviousWeek,
  handleUpdateClick,
  handleUpdateSubtitle,
  initWeekPicker
} from "./weekPicker.js";
import { handleLockClick, handleNewWeekClick } from "./adminActions.js";
import { openCatalogManager, wireCatalogManager } from "./catalogAdmin.js";

function wireEvents() {
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const modalId = button.dataset.close;
      closeModal(modalId);
      if (modalId === "registrationModal" || modalId === "editModal") {
        releaseCurrentEditingLock();
      }
    });
  });

  document.getElementById("registerButton")?.addEventListener("click", handleRegister);
  document.getElementById("blockSlotButton")?.addEventListener("click", handleBlockCurrentSlot);
  document.getElementById("editBlockSlotButton")?.addEventListener("click", handleBlockCurrentSlot);
  document.getElementById("editButton")?.addEventListener("click", handleEditContent);
  document.getElementById("deleteButton")?.addEventListener("click", handleDeleteContent);
  document.getElementById("loginButton")?.addEventListener("click", handleAdminLogin);
  document.getElementById("adminAccessButton")?.addEventListener("click", () => openModal("adminLoginModal"));
  document.getElementById("adminPasswordButton")?.addEventListener("click", openChangePasswordModal);
  document.getElementById("logoutButton")?.addEventListener("click", handleAdminLogout);
  document.getElementById("changePasswordConfirmButton")?.addEventListener("click", handleChangePassword);
  document.getElementById("updateButton")?.addEventListener("click", handleUpdateClick);
  document.getElementById("currentWeekButton")?.addEventListener("click", () => handleCurrentWeek(loadBootstrap));
  document.getElementById("updateSubtitleButton")?.addEventListener("click", () => handleUpdateSubtitle(loadBootstrap));
  document.getElementById("newWeekButton")?.addEventListener("click", () => handleNewWeekClick(loadBootstrap));
  document.getElementById("lockButton")?.addEventListener("click", () => handleLockClick(loadBootstrap));
  document.getElementById("manageDataButton")?.addEventListener("click", () => openCatalogManager(loadBootstrap));
  document.getElementById("previousWeekButton")?.addEventListener("click", () => handlePreviousWeek(loadBootstrap));
  document.getElementById("nextWeekButton")?.addEventListener("click", () => handleNextWeek(loadBootstrap));
}

(async function init() {
  configureRealtime({ renderTable, loadBootstrap });
  connectWebSocket();
  wireEvents();
  wireCatalogManager();
  initWeekPicker();
  syncAdminUi();

  window.addEventListener("beforeunload", () => {
    releaseCurrentEditingLock();
  });

  try {
    await handleCurrentWeek(loadBootstrap);
  } catch (error) {
    showGlobalMessage(`No se pudo cargar la app: ${error.message}`, "error");
  }
})();
