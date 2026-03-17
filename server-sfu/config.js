import path from "path";
import { randomUUID } from "crypto";

export const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
export const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
export const PERM_ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
export const SESSION_ROOMS_FILE = path.join(DATA_DIR, "session_rooms.json");
export const DEFAULT_SESSION_TTL_MIN = process.env.SESSION_TTL_MIN
  ? Number(process.env.SESSION_TTL_MIN)
  : 120;
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
export const ALLOW_ANON_PERMANENT = (process.env.ALLOW_ANON_PERMANENT || "false") === "true";
export const ALLOW_ANON_SESSION = (process.env.ALLOW_ANON_SESSION || "false") === "true";
export const REDIS_URL = process.env.REDIS_URL || "";
export const REDIS_PREFIX = process.env.REDIS_PREFIX || "webrtc";
export const INSTANCE_ID = randomUUID();

function parseIceServers() {
  const raw = process.env.ICE_SERVERS_JSON || process.env.ICE_SERVERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

export const ICE_SERVERS = parseIceServers();