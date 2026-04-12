const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db/connection");
const { sessionTtlHours } = require("./config");

const HASH_ROUNDS = 12;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d\d\$/;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isHash(value) {
  return typeof value === "string" && BCRYPT_HASH_RE.test(value);
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(new Date().toISOString());
}

function createSession(userId) {
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlHours * 60 * 60 * 1000).toISOString();
  const tokenHash = hashToken(token);

  db.prepare(
    `INSERT INTO admin_sessions(token_hash, user_id, created_at, expires_at, revoked_at, last_seen_at)
     VALUES(?, ?, ?, ?, NULL, ?)`
  ).run(tokenHash, userId, now, expiresAt, now);

  return token;
}

function login(username, password) {
  cleanupExpiredSessions();

  const admin = db
    .prepare("SELECT id, username, password FROM admin_users WHERE username = ?")
    .get(username);

  if (!admin) {
    return null;
  }

  let isValid = false;
  let shouldUpgradeHash = false;

  if (isHash(admin.password)) {
    isValid = bcrypt.compareSync(password, admin.password);
  } else {
    isValid = admin.password === password;
    shouldUpgradeHash = isValid;
  }

  if (!isValid) {
    return null;
  }

  if (shouldUpgradeHash) {
    const upgradedHash = bcrypt.hashSync(password, HASH_ROUNDS);
    db.prepare("UPDATE admin_users SET password = ? WHERE id = ?").run(upgradedHash, admin.id);
  }

  return createSession(admin.id);
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No autorizado" });
  }

  cleanupExpiredSessions();

  const tokenHash = hashToken(token);
  const session = db
    .prepare(
      `SELECT s.id AS sessionId, s.user_id AS userId, u.username
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?`
    )
    .get(tokenHash, new Date().toISOString());

  if (!session) {
    return res.status(401).json({ error: "No autorizado" });
  }

  db.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    session.sessionId
  );

  req.admin = { userId: session.userId, username: session.username };
  req.authToken = token;
  next();
}

function logoutToken(token) {
  const tokenHash = hashToken(token);
  db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").run(
    new Date().toISOString(),
    tokenHash
  );
}

function changePassword(userId, currentPassword, newPassword) {
  const admin = db
    .prepare("SELECT id, password FROM admin_users WHERE id = ?")
    .get(userId);

  if (!admin) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const currentMatches = isHash(admin.password)
    ? bcrypt.compareSync(currentPassword, admin.password)
    : admin.password === currentPassword;

  if (!currentMatches) {
    return { ok: false, code: "INVALID_CURRENT_PASSWORD" };
  }

  const newHash = bcrypt.hashSync(newPassword, HASH_ROUNDS);
  db.prepare("UPDATE admin_users SET password = ? WHERE id = ?").run(newHash, userId);
  db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
    new Date().toISOString(),
    userId
  );

  return { ok: true };
}

module.exports = {
  login,
  requireAdmin,
  logoutToken,
  changePassword
};
