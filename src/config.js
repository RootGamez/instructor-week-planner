const path = require("path");
const fs = require("fs");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

function parseCsv(rawValue) {
  if (typeof rawValue !== "string") return [];
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || "./data/app.db",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
  corsOrigins: parseCsv(process.env.CORS_ORIGIN || "http://localhost:3000")
};
