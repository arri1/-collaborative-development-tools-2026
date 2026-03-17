import { randomUUID } from "crypto";
import { DEFAULT_SESSION_TTL_MIN, ICE_SERVERS } from "./config.js";
import { permanentRooms, sessionRooms } from "./state.js";
import { metrics, renderMetrics } from "./metrics.js";
import { requireAdmin } from "./auth.js";
import { nowIso } from "./utils.js";
import { closeRoomClients } from "./rooms.js";
import {
  logEvent,
  savePermanentRoomsToDisk,
  saveSessionRoomsToDisk
} from "./storage.js";
import {
  publishRoomEvent,
  publishPermanentRoomEvent,
  publishSignal,
  redisSetPermanent,
  redisDelPermanent,
  redisSetSession,
  redisDelSession
} from "./redis_bus.js";

export function registerRoutes(app, deps) {
  const {
    scheduleSessionExpiry,
    cleanupSessionRoom
  } = deps;

  app.use((req, res, next) => {
    const start = Date.now();
    metrics.http_requests_total += 1;
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      if (res.statusCode >= 400) metrics.http_errors_total += 1;
      void logEvent("http", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        ip: req.ip
      });
    });
    next();
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, time: nowIso() });
  });

  app.get("/ice", (req, res) => {
    res.json({ iceServers: ICE_SERVERS });
  });

  app.get("/metrics", requireAdmin, (req, res) => {
    res.set("Content-Type", "text/plain");
    res.send(renderMetrics(permanentRooms.size, sessionRooms.size));
  });

  app.get("/rooms/permanent", requireAdmin, (req, res) => {
    res.json({ rooms: Array.from(permanentRooms.values()) });
  });

  app.post("/rooms/permanent", requireAdmin, async (req, res) => {
    const { id, name, allowedTokens } = req.body || {};
    const roomId = id || randomUUID();
    if (permanentRooms.has(roomId)) {
      return res.status(409).json({ error: "room already exists" });
    }
    const room = {
      id: roomId,
      name: name || roomId,
      createdAt: nowIso(),
      allowedTokens: Array.isArray(allowedTokens) ? allowedTokens : []
    };
    permanentRooms.set(roomId, room);
    await savePermanentRoomsToDisk();
    await redisSetPermanent(room);
    await publishPermanentRoomEvent("created", { room });
    await logEvent("permanent-room-created", { roomId });
    res.status(201).json(room);
  });

  app.post("/rooms/permanent/:id/tokens", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { tokens } = req.body || {};
    const room = permanentRooms.get(id);
    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }
    room.allowedTokens = Array.isArray(tokens) ? tokens : [];
    permanentRooms.set(id, room);
    await savePermanentRoomsToDisk();
    await redisSetPermanent(room);
    await publishPermanentRoomEvent("updated", { room });
    await logEvent("permanent-room-tokens-updated", { roomId: id });
    res.json(room);
  });

  app.delete("/rooms/permanent/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!permanentRooms.has(id)) {
      return res.status(404).json({ error: "room not found" });
    }
    permanentRooms.delete(id);
    await savePermanentRoomsToDisk();
    await redisDelPermanent(id);
    await publishPermanentRoomEvent("deleted", { roomId: id });
    closeRoomClients(id, "permanent room deleted");
    await logEvent("permanent-room-deleted", { roomId: id });
    res.json({ ok: true });
  });

  app.get("/rooms/session", requireAdmin, (req, res) => {
    const rooms = Array.from(sessionRooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      joinToken: r.joinToken
    }));
    res.json({ rooms });
  });

  app.post("/rooms/session", requireAdmin, async (req, res) => {
    const { name, ttlMinutes } = req.body || {};
    const roomId = randomUUID();
    const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0
      ? Number(ttlMinutes)
      : DEFAULT_SESSION_TTL_MIN;
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
    const joinToken = randomUUID();
    const room = { id: roomId, name: name || roomId, createdAt, expiresAt, joinToken, timeout: null };
    sessionRooms.set(roomId, room);
    scheduleSessionExpiry(roomId);
    await saveSessionRoomsToDisk();
    await redisSetSession(room);
    await publishRoomEvent("created", { room });
    await logEvent("session-room-created", { roomId });
    res.status(201).json({ id: roomId, name: room.name, createdAt, expiresAt, joinToken });
  });

  app.post("/rooms/session/:id/token/rotate", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const room = sessionRooms.get(id);
    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }
    room.joinToken = randomUUID();
    sessionRooms.set(id, room);
    await saveSessionRoomsToDisk();
    await redisSetSession(room);
    await publishRoomEvent("updated", { room });
    await logEvent("session-room-token-rotated", { roomId: id });
    res.json({ id, joinToken: room.joinToken });
  });

  app.post("/rooms/session/:id/close", requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!sessionRooms.has(id)) {
      return res.status(404).json({ error: "room not found" });
    }
    await cleanupSessionRoom(id, "manual-close");
    res.json({ ok: true });
  });

  // Optional: internal route to force room close (not exposed in README)
  app.post("/rooms/session/:id/_close_internal", requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!sessionRooms.has(id)) {
      return res.status(404).json({ error: "room not found" });
    }
    await cleanupSessionRoom(id, "internal-close");
    res.json({ ok: true });
  });

  // Expose signal publish for HTTP admin usage if needed later
  app.post("/signals/broadcast", requireAdmin, async (req, res) => {
    const { roomId, message } = req.body || {};
    if (!roomId || !message) {
      return res.status(400).json({ error: "roomId and message required" });
    }
    await publishSignal(roomId, message, null);
    res.json({ ok: true });
  });
}