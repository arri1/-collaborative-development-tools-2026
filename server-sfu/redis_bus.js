import { createClient } from "redis";
import { REDIS_URL, REDIS_PREFIX, INSTANCE_ID } from "./config.js";
import { permanentRooms, sessionRooms, roomClientIndex } from "./state.js";
import { broadcastLocal, closeRoomClients } from "./rooms.js";

let redis = null;
let redisSub = null;

export function isRedisEnabled() {
  return !!redis;
}

export async function initRedis({ scheduleSessionExpiry }) {
  if (!REDIS_URL) return;
  redis = createClient({ url: REDIS_URL });
  redisSub = redis.duplicate();
  await redis.connect();
  await redisSub.connect();

  await redisSub.subscribe(`${REDIS_PREFIX}:rooms:events`, async message => {
    try {
      const evt = JSON.parse(message);
      if (evt.origin === INSTANCE_ID) return;
      if (evt.type === "permanent-created" || evt.type === "permanent-updated") {
        permanentRooms.set(evt.room.id, evt.room);
      }
      if (evt.type === "permanent-deleted") {
        permanentRooms.delete(evt.roomId);
        closeRoomClients(evt.roomId, "permanent room deleted");
      }
      if (evt.type === "session-created" || evt.type === "session-updated") {
        sessionRooms.set(evt.room.id, evt.room);
        scheduleSessionExpiry(evt.room.id);
      }
      if (evt.type === "session-deleted") {
        const room = sessionRooms.get(evt.roomId);
        if (room && room.timeout) clearTimeout(room.timeout);
        sessionRooms.delete(evt.roomId);
        closeRoomClients(evt.roomId, "session room closed");
      }
    } catch {
      // ignore
    }
  });

  await redisSub.subscribe(`${REDIS_PREFIX}:rooms:signals`, message => {
    try {
      const evt = JSON.parse(message);
      if (evt.origin === INSTANCE_ID) return;
      if (!evt.roomId) return;
      if (evt.to) {
        const index = roomClientIndex.get(evt.roomId);
        const target = index ? index.get(evt.to) : null;
        if (target && target.readyState === target.OPEN) {
          target.send(JSON.stringify(evt.message));
        }
        return;
      }
      broadcastLocal(evt.roomId, evt.message, null);
    } catch {
      // ignore
    }
  });
}

export async function publishRoomEvent(type, payload) {
  if (!redis) return;
  const evt = { type: `session-${type}`, origin: INSTANCE_ID, ...payload };
  await redis.publish(`${REDIS_PREFIX}:rooms:events`, JSON.stringify(evt));
}

export async function publishPermanentRoomEvent(type, payload) {
  if (!redis) return;
  const evt = { type: `permanent-${type}`, origin: INSTANCE_ID, ...payload };
  await redis.publish(`${REDIS_PREFIX}:rooms:events`, JSON.stringify(evt));
}

export async function publishSignal(roomId, message, to = null) {
  if (!redis) return;
  const evt = { roomId, message, to, origin: INSTANCE_ID };
  await redis.publish(`${REDIS_PREFIX}:rooms:signals`, JSON.stringify(evt));
}

export async function loadRoomsFromRedis() {
  if (!redis) return { permCount: 0, sessCount: 0 };
  const perm = await redis.hGetAll(`${REDIS_PREFIX}:rooms:permanent`);
  const sess = await redis.hGetAll(`${REDIS_PREFIX}:rooms:session`);

  let permCount = 0;
  let sessCount = 0;
  if (perm && Object.keys(perm).length > 0) {
    permanentRooms.clear();
    for (const [id, raw] of Object.entries(perm)) {
      try {
        const room = JSON.parse(raw);
        permanentRooms.set(id, room);
        permCount += 1;
      } catch {
        // ignore
      }
    }
  }

  if (sess && Object.keys(sess).length > 0) {
    sessionRooms.clear();
    for (const [id, raw] of Object.entries(sess)) {
      try {
        const room = JSON.parse(raw);
        sessionRooms.set(id, room);
        sessCount += 1;
      } catch {
        // ignore
      }
    }
  }

  return { permCount, sessCount };
}

export async function syncPermanentToRedis() {
  if (!redis) return;
  const permEntries = Array.from(permanentRooms.entries());
  if (permEntries.length === 0) return;
  const args = [];
  for (const [id, room] of permEntries) {
    args.push(id, JSON.stringify(room));
  }
  await redis.hSet(`${REDIS_PREFIX}:rooms:permanent`, args);
}

export async function syncSessionToRedis() {
  if (!redis) return;
  const sessEntries = Array.from(sessionRooms.entries());
  if (sessEntries.length === 0) return;
  const args = [];
  for (const [id, room] of sessEntries) {
    args.push(id, JSON.stringify({
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      joinToken: room.joinToken
    }));
  }
  await redis.hSet(`${REDIS_PREFIX}:rooms:session`, args);
}

export async function redisSetPermanent(room) {
  if (!redis) return;
  await redis.hSet(`${REDIS_PREFIX}:rooms:permanent`, room.id, JSON.stringify(room));
}

export async function redisDelPermanent(roomId) {
  if (!redis) return;
  await redis.hDel(`${REDIS_PREFIX}:rooms:permanent`, roomId);
}

export async function redisSetSession(room) {
  if (!redis) return;
  const payload = JSON.stringify({
    id: room.id,
    name: room.name,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    joinToken: room.joinToken
  });
  await redis.hSet(`${REDIS_PREFIX}:rooms:session`, room.id, payload);
}

export async function redisDelSession(roomId) {
  if (!redis) return;
  await redis.hDel(`${REDIS_PREFIX}:rooms:session`, roomId);
}