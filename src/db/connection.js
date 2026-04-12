const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { dbPath } = require("../config");
const { ensureSchema } = require("./schema");

const absoluteDbPath = path.resolve(process.cwd(), dbPath);
const db = new DatabaseSync(absoluteDbPath);

ensureSchema(db);

module.exports = db;
