const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const { port } = require("./config");
const apiRouter = require("./routes/api");
const { setupSlotLocks } = require("./realtime/slotLocks");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/api", apiRouter);
app.use("/vendor", express.static(path.join(process.cwd(), "node_modules")));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
setupSlotLocks(server);

server.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
