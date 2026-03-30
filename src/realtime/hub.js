let websocketServer = null;

function setWebSocketServer(wss) {
  websocketServer = wss;
}

function broadcast(payload) {
  if (!websocketServer) return;

  for (const client of websocketServer.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  }
}

function notifyScheduleChanged(changeType, slotId = null) {
  broadcast({
    type: "schedule:changed",
    changeType,
    slotId,
    at: Date.now()
  });
}

module.exports = {
  setWebSocketServer,
  notifyScheduleChanged,
  broadcast
};
