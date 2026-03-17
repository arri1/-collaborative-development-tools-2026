import { permanentRooms, sessionRooms, roomClients, roomClientIndex } from "./state.js";

export function getRoomType(roomId) {
  if (permanentRooms.has(roomId)) return "permanent";
  if (sessionRooms.has(roomId)) return "session";
  return null;
}

export function getRoomClients(roomId) {
  if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
  return roomClients.get(roomId);
}

export function getRoomClientIndex(roomId) {
  if (!roomClientIndex.has(roomId)) roomClientIndex.set(roomId, new Map());
  return roomClientIndex.get(roomId);
}

export function addClient(roomId, ws, clientId) {
  const clients = getRoomClients(roomId);
  const index = getRoomClientIndex(roomId);
  clients.add(ws);
  index.set(clientId, ws);
}

export function removeClient(roomId, ws, clientId) {
  const clients = roomClients.get(roomId);
  const index = roomClientIndex.get(roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) roomClients.delete(roomId);
  }
  if (index) {
    index.delete(clientId);
    if (index.size === 0) roomClientIndex.delete(roomId);
  }
}

export function broadcastLocal(roomId, message, exceptWs = null) {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws !== exceptWs && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

export function closeRoomClients(roomId, reason = "room closed") {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  for (const ws of clients) {
    try {
      ws.close(4000, reason);
    } catch {
      // ignore
    }
  }
  roomClients.delete(roomId);
  roomClientIndex.delete(roomId);
}