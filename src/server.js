import express from "express";
import https from "https";
import path from "path";
import { WebSocketServer } from "ws";
import fs from "fs";

import {
  PORT,
  ADMIN_TOKEN,
  MEDIASOUP_LISTEN_IP,
  MEDIASOUP_ANNOUNCED_IP,
  MEDIASOUP_RTC_MIN_PORT,
  MEDIASOUP_RTC_MAX_PORT
} from "./config.js";
import { permanentRooms, sessionRooms } from "./state.js";
import { closeRoom, initMediasoup } from "./mediasoup_manager.js";
import {
  ensureDataDir,
  loadPermanentRoomsFromDisk,
  loadSessionRoomsFromDisk,
  saveSessionRoomsToDisk,
  logEvent
} from "./storage.js";
import { loadAppStore } from "./app_store.js";
import { registerAppRoutes } from "./app_routes.js";
import { registerRoutes } from "./routes.js";
import { registerWebSocket } from "./ws.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));
registerAppRoutes(app);

function scheduleSessionExpiry(roomId) {
  const room = sessionRooms.get(roomId);
  if (!room) return;
  if (room.timeout) clearTimeout(room.timeout);
  const ms = Math.max(0, new Date(room.expiresAt).getTime() - Date.now());
  room.timeout = setTimeout(() => {
    void cleanupSessionRoom(roomId, "ttl-expired");
  }, ms);
}

async function cleanupSessionRoom(roomId, reason = "session room closed") {
  const room = sessionRooms.get(roomId);
  if (!room) return;
  if (room.timeout) clearTimeout(room.timeout);
  sessionRooms.delete(roomId);
  closeRoom(roomId);
  await saveSessionRoomsToDisk();
  await logEvent("session-room-closed", { roomId, reason });
}

registerRoutes(app, { scheduleSessionExpiry, cleanupSessionRoom });

const server = https.createServer(
  {
    key: fs.readFileSync("/home/qennu/Playground/server.key"),
    cert: fs.readFileSync("/home/qennu/Playground/server.cert"),
  },
  app
);
const wss = new WebSocketServer({ server, path: "/ws" });
registerWebSocket(wss);

await ensureDataDir();
await loadAppStore();
await initMediasoup();
await loadPermanentRoomsFromDisk();
await loadSessionRoomsFromDisk();

for (const room of sessionRooms.values()) {
  if (new Date(room.expiresAt).getTime() <= Date.now()) {
    void cleanupSessionRoom(room.id, "expired-on-startup");
  } else {
    scheduleSessionExpiry(room.id);
  }
}

setInterval(() => {
  for (const room of sessionRooms.values()) {
    if (new Date(room.expiresAt).getTime() <= Date.now()) {
      void cleanupSessionRoom(room.id, "ttl-expired");
    }
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Mediasoup server listening on :${PORT}`);
  console.log(`mediasoup listen IP: ${MEDIASOUP_LISTEN_IP} announced IP: ${MEDIASOUP_ANNOUNCED_IP || "none"}`);
  if (MEDIASOUP_RTC_MIN_PORT && MEDIASOUP_RTC_MAX_PORT) {
    console.log(`mediasoup rtc port range: ${MEDIASOUP_RTC_MIN_PORT}-${MEDIASOUP_RTC_MAX_PORT}`);
  }
  if (MEDIASOUP_LISTEN_IP === "0.0.0.0" && !MEDIASOUP_ANNOUNCED_IP) {
    console.warn("MEDIASOUP_LISTEN_IP=0.0.0.0 without MEDIASOUP_ANNOUNCED_IP may break ICE candidates.");
  }
  if (!ADMIN_TOKEN) {
    console.warn("ADMIN_TOKEN is not set. Admin endpoints are open.");
  }
});
