import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { handleSession } from "./session";
import { log } from "./utils";
import { DEFAULT_SETTINGS } from "./types";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/defaults", (_req, res) => {
  res.json(DEFAULT_SETTINGS);
});

const httpServer = createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
});

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress ?? "unknown";
  log("info", `New WebSocket connection from ${ip}`);
  handleSession(ws);
});

wss.on("error", (err) => {
  log("error", "WebSocket server error", err);
});

httpServer.listen(PORT, () => {
  log("info", `TwinMind server running on port ${PORT}`);
  log("info", `WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

process.on("uncaughtException", (err) => {
  log("error", "Uncaught exception", err);
});

process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection", reason);
});
