const { WebSocket, WebSocketServer } = require("ws");
const crypto = require("crypto");
const { setWebSocketServer, broadcast } = require("./hub");

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function setupSlotLocks(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  setWebSocketServer(wss);
  const slotLocks = new Map();
  const clientLocks = new Map();

  function broadcastLock(payload, exceptClientId = null) {
    for (const client of wss.clients) {
      if (exceptClientId && client.clientId === exceptClientId) continue;
      safeSend(client, payload);
    }
  }

  function releaseAllForClient(clientId) {
    const locks = clientLocks.get(clientId);
    if (!locks || locks.size === 0) return;

    for (const slotId of locks) {
      const owner = slotLocks.get(slotId);
      if (owner === clientId) {
        slotLocks.delete(slotId);
        broadcast({ type: "lock:changed", slotId, isLocked: false });
      }
    }

    clientLocks.delete(clientId);
  }

  function tryAcquire(clientId, slotId) {
    const currentOwner = slotLocks.get(slotId);
    if (currentOwner && currentOwner !== clientId) {
      return { ok: false };
    }

    slotLocks.set(slotId, clientId);
    if (!clientLocks.has(clientId)) {
      clientLocks.set(clientId, new Set());
    }
    clientLocks.get(clientId).add(slotId);

    return { ok: true };
  }

  function tryRelease(clientId, slotId) {
    const owner = slotLocks.get(slotId);
    if (!owner || owner !== clientId) {
      return { ok: false };
    }

    slotLocks.delete(slotId);
    const locks = clientLocks.get(clientId);
    if (locks) {
      locks.delete(slotId);
      if (locks.size === 0) {
        clientLocks.delete(clientId);
      }
    }

    return { ok: true };
  }

  wss.on("connection", (ws) => {
    const clientId = crypto.randomUUID();
    ws.clientId = clientId;

    safeSend(ws, {
      type: "lock:init",
      lockedSlotIds: Array.from(slotLocks.keys())
    });

    ws.on("message", (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw));
      } catch (_) {
        safeSend(ws, { type: "lock:error", message: "Mensaje invalido" });
        return;
      }

      const slotId = Number(payload.slotId);
      if (!slotId) {
        safeSend(ws, { type: "lock:error", message: "slotId invalido" });
        return;
      }

      if (payload.type === "lock:acquire") {
        const result = tryAcquire(clientId, slotId);
        if (!result.ok) {
          safeSend(ws, {
            type: "lock:error",
            slotId,
            message: "Este horario ya esta siendo editado"
          });
          return;
        }

        safeSend(ws, { type: "lock:acquired", slotId });
        broadcastLock({ type: "lock:changed", slotId, isLocked: true }, clientId);
      }

      if (payload.type === "lock:release") {
        const result = tryRelease(clientId, slotId);
        if (!result.ok) return;

        safeSend(ws, { type: "lock:released", slotId });
        broadcastLock({ type: "lock:changed", slotId, isLocked: false }, clientId);
      }
    });

    ws.on("close", () => {
      releaseAllForClient(clientId);
    });
  });

  return {
    clearAllLocks() {
      slotLocks.clear();
      clientLocks.clear();
      broadcast({ type: "lock:all-cleared" });
    }
  };
}

module.exports = { setupSlotLocks };
