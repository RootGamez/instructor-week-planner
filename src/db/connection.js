const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { dbPath } = require("../config");

const absoluteDbPath = path.resolve(process.cwd(), dbPath);
const db = new DatabaseSync(absoluteDbPath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

module.exports = db;
