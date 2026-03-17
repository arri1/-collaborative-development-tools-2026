import { ADMIN_TOKEN, ALLOW_ANON_PERMANENT, ALLOW_ANON_SESSION } from "./config.js";
import { permanentRooms, sessionRooms } from "./state.js";
import { metrics } from "./metrics.js";

export function getAuthTokenFromReq(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  const token = req.headers["x-auth-token"];
  if (Array.isArray(token)) return token[0];
  if (typeof token === "string") return token;
  return "";
}

export function isAdminToken(token) {
  if (!ADMIN_TOKEN) return false;
  return token === ADMIN_TOKEN;
}

export function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    next();
    return;
  }
  const token = getAuthTokenFromReq(req);
  if (!isAdminToken(token)) {
    metrics.auth_failures_total += 1;
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function canJoinRoom(roomId, token) {
  if (token && isAdminToken(token)) return { ok: true };

  const perm = permanentRooms.get(roomId);
  if (perm) {
    const allowed = Array.isArray(perm.allowedTokens) ? perm.allowedTokens : [];
    if (allowed.length > 0) {
      return { ok: allowed.includes(token) };
    }
    return { ok: ALLOW_ANON_PERMANENT };
  }

  const sess = sessionRooms.get(roomId);
  if (sess) {
    if (sess.joinToken) {
      return { ok: token === sess.joinToken };
    }
    return { ok: ALLOW_ANON_SESSION };
  }

  return { ok: false };
}