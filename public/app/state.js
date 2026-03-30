export const state = {
  weekLabel: "",
  activeWeekLabel: "",
  isLocked: false,
  teachers: [],
  areas: [],
  grades: [],
  slots: [],
  entriesBySlotId: {},
  selectedSlotId: null,
  adminToken: localStorage.getItem("adminToken") || null,
  ws: null,
  realtimeLockedSlotIds: new Set(),
  ownedEditingSlotId: null,
  lockRequests: new Map(),
  refreshInFlight: false,
  pendingRefresh: false,
  weekPicker: null,
  pendingWeekLabel: ""
};

export const ui = {
  subtitle: document.getElementById("subtitle"),
  scheduleTableBody: document.getElementById("scheduleTableBody"),
  tableHeadRow: document.getElementById("tableHeadRow"),
  globalMessageBox: document.getElementById("globalMessageBox"),
  adminAccessButton: document.getElementById("adminAccessButton"),
  adminPasswordButton: document.getElementById("adminPasswordButton"),
  logoutButton: document.getElementById("logoutButton"),
  lockButton: document.getElementById("lockButton"),
  docenteSelect: document.getElementById("docenteSelect"),
  areaSelect: document.getElementById("areaSelect"),
  gradoSelect: document.getElementById("gradoSelect"),
  weekPickerInput: document.getElementById("weekPickerInput"),
  selectedWeekPreview: document.getElementById("selectedWeekPreview"),
  currentPasswordInput: document.getElementById("currentPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  confirmPasswordInput: document.getElementById("confirmPasswordInput")
};
