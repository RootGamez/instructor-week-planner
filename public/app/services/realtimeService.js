import { state } from "../core/state.js";
import { showGlobalMessage } from "../ui/dom.js";

let renderTableFn = () => {};
let loadBootstrapFn = async () => {};

export function configureRealtime({ renderTable, loadBootstrap }) {
  renderTableFn = renderTable;
  loadBootstrapFn = loadBootstrap;
}

async function refreshBootstrapRealtime() {
  if (state.refreshInFlight) {
    state.pendingRefresh = true;
    return;
  }

  state.refreshInFlight = true;
  try {
    await loadBootstrapFn(state.activeWeekLabel || undefined);
  } finally {
    state.refreshInFlight = false;
    if (state.pendingRefresh) {
      state.pendingRefresh = false;
      refreshBootstrapRealtime();
    }
  }
}

export function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws`;
  const ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    state.ws = ws;
  });

  ws.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (payload.type === "lock:init") {
      state.realtimeLockedSlotIds = new Set(payload.lockedSlotIds || []);
      if (state.ownedEditingSlotId) {
        state.realtimeLockedSlotIds.delete(state.ownedEditingSlotId);
      }
      renderTableFn();
      return;
    }

    if (payload.type === "lock:changed") {
      if (payload.isLocked) {
        state.realtimeLockedSlotIds.add(payload.slotId);
      } else {
        state.realtimeLockedSlotIds.delete(payload.slotId);
      }
      renderTableFn();
      return;
    }

    if (payload.type === "lock:all-cleared") {
      state.realtimeLockedSlotIds.clear();
      if (state.ownedEditingSlotId) {
        state.realtimeLockedSlotIds.delete(state.ownedEditingSlotId);
      }
      renderTableFn();
      return;
    }

    if (payload.type === "lock:acquired") {
      const req = state.lockRequests.get(payload.slotId);
      if (req) {
        state.lockRequests.delete(payload.slotId);
        state.ownedEditingSlotId = payload.slotId;
        state.realtimeLockedSlotIds.delete(payload.slotId);
        req.resolve(true);
      }
      renderTableFn();
      return;
    }

    if (payload.type === "lock:error") {
      if (payload.slotId) {
        const req = state.lockRequests.get(payload.slotId);
        if (req) {
          state.lockRequests.delete(payload.slotId);
          req.resolve(false);
        }
      }
      if (payload.message) {
        showGlobalMessage(payload.message, "error");
      }
      return;
    }

    if (payload.type === "schedule:changed") {
      refreshBootstrapRealtime();
    }
  });

  ws.addEventListener("close", () => {
    state.ws = null;
    for (const [, req] of state.lockRequests) {
      req.resolve(false);
    }
    state.lockRequests.clear();
    setTimeout(connectWebSocket, 1200);
  });
}

export function requestSlotLock(slotId) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    showGlobalMessage("Conexion en tiempo real no disponible. Intenta de nuevo.", "error");
    return Promise.resolve(false);
  }

  if (state.ownedEditingSlotId === slotId) {
    return Promise.resolve(true);
  }

  if (state.ownedEditingSlotId && state.ownedEditingSlotId !== slotId) {
    releaseSlotLock(state.ownedEditingSlotId);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      state.lockRequests.delete(slotId);
      resolve(false);
    }, 3000);

    state.lockRequests.set(slotId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      }
    });

    state.ws.send(JSON.stringify({ type: "lock:acquire", slotId }));
  });
}

function releaseSlotLock(slotId) {
  if (!slotId || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({ type: "lock:release", slotId }));
  if (state.ownedEditingSlotId === slotId) {
    state.ownedEditingSlotId = null;
  }
}

export function releaseCurrentEditingLock() {
  if (!state.ownedEditingSlotId) return;
  const slotId = state.ownedEditingSlotId;
  releaseSlotLock(slotId);
  state.selectedSlotId = null;
  renderTableFn();
}
