import { permanentRooms, sessionRooms } from "./state.js";

export function getRoomType(roomId) {
  if (permanentRooms.has(roomId)) return "permanent";
  if (sessionRooms.has(roomId)) return "session";
  return null;
}