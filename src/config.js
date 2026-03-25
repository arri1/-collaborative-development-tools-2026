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
export const INSTANCE_ID = randomUUID();

export const MEDIASOUP_LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0";
export const MEDIASOUP_ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || "64.188.115.147";
export const MEDIASOUP_RTC_MIN_PORT = process.env.MEDIASOUP_RTC_MIN_PORT
  ? Number(process.env.MEDIASOUP_RTC_MIN_PORT)
  : 0;
export const MEDIASOUP_RTC_MAX_PORT = process.env.MEDIASOUP_RTC_MAX_PORT
  ? Number(process.env.MEDIASOUP_RTC_MAX_PORT)
  : 0;
export const MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE = process.env.MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE
  ? Number(process.env.MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE)
  : 1000000;
export const MEDIASOUP_MAX_INCOMING_BITRATE = process.env.MEDIASOUP_MAX_INCOMING_BITRATE
  ? Number(process.env.MEDIASOUP_MAX_INCOMING_BITRATE)
  : 0;
export const MEDIASOUP_WORKER_LOG_LEVEL = process.env.MEDIASOUP_WORKER_LOG_LEVEL || "warn";
export const MEDIASOUP_WORKER_LOG_TAGS = (process.env.MEDIASOUP_WORKER_LOG_TAGS || "")
  .split(",")
  .map(t => t.trim())
  .filter(Boolean);

export const MEDIASOUP_MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000
    }
  }
];

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

const parsedIce = parseIceServers();
export const ICE_SERVERS = parsedIce.length > 0
  ? parsedIce
  : [{ urls: "stun:stun.l.google.com:19302" }];
