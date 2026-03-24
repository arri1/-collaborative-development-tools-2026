import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, PERM_ROOMS_FILE, SESSION_ROOMS_FILE, INSTANCE_ID } from "./config.js";
import { permanentRooms, sessionRooms } from "./state.js";
import { nowIso } from "./utils.js";

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function logEvent(type, data = {}) {
  await ensureDataDir();
  const line = JSON.stringify({ ts: nowIso(), type, instanceId: INSTANCE_ID, ...data }) + "\n";
  void fs.appendFile(path.join(DATA_DIR, "events.log"), line, "utf8");
}

export async function loadPermanentRoomsFromDisk() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PERM_ROOMS_FILE, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const r of list) {
        if (r && r.id) permanentRooms.set(r.id, r);
      }
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to load permanent rooms:", err);
    }
  }
}

export async function savePermanentRoomsToDisk() {
  await ensureDataDir();
  const list = Array.from(permanentRooms.values());
  await fs.writeFile(PERM_ROOMS_FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function loadSessionRoomsFromDisk() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(SESSION_ROOMS_FILE, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const r of list) {
        if (r && r.id) sessionRooms.set(r.id, r);
      }
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to load session rooms:", err);
    }
  }
}

export async function saveSessionRoomsToDisk() {
  await ensureDataDir();
  const list = Array.from(sessionRooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    joinToken: r.joinToken
  }));
  await fs.writeFile(SESSION_ROOMS_FILE, JSON.stringify(list, null, 2), "utf8");
}