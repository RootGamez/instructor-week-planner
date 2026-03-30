const path = require("path");
const fs = require("fs");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || "./data/app.db"
};
