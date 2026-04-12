const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { port, corsOrigins, nodeEnv } = require("./config");
const apiRouter = require("./routes/api");
const { setupSlotLocks } = require("./realtime/slotLocks");

const app = express();
const publicDir = path.join(process.cwd(), "public");
const indexPath = path.join(publicDir, "index.html");
const assetVersion = process.env.ASSET_VERSION || String(Date.now());
const indexTemplate = fs.readFileSync(indexPath, "utf8");

function renderIndex() {
  return indexTemplate.replaceAll("__ASSET_VERSION__", assetVersion);
}

const allowAnyCors = corsOrigins.includes("*");

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowAnyCors || corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origen no permitido por CORS"));
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

if (nodeEnv === "production") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth/login", loginLimiter);
app.use("/api", apiLimiter, apiRouter);

app.get(["/", "/index.html"], (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.type("html").send(renderIndex());
});

app.use(
  express.static(publicDir, {
    index: false,
    maxAge: "1y",
    immutable: true
  })
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
setupSlotLocks(server);

server.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
