const crypto = require("crypto");
const db = require("./db/connection");

const activeTokens = new Map();

function login(username, password) {
  const admin = db
    .prepare("SELECT id, username, password FROM admin_users WHERE username = ?")
    .get(username);

  if (!admin || admin.password !== password) {
    return null;
  }

  const token = crypto.randomUUID();
  activeTokens.set(token, { userId: admin.id, username: admin.username, createdAt: Date.now() });
  return token;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  req.admin = activeTokens.get(token);
  next();
}

function changePassword(userId, currentPassword, newPassword) {
  const admin = db
    .prepare("SELECT id, password FROM admin_users WHERE id = ?")
    .get(userId);

  if (!admin) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (admin.password !== currentPassword) {
    return { ok: false, code: "INVALID_CURRENT_PASSWORD" };
  }

  db.prepare("UPDATE admin_users SET password = ? WHERE id = ?").run(newPassword, userId);
  return { ok: true };
}

module.exports = {
  login,
  requireAdmin,
  changePassword
};
