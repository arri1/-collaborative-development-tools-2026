import { randomUUID } from "crypto";

import { metrics } from "./metrics.js";
import { canJoinRoom } from "./auth.js";
import { logEvent } from "./storage.js";
import { addClient, removeClient, broadcastLocal, getRoomType } from "./rooms.js";
import { roomClientIndex } from "./state.js";
import { isRedisEnabled, publishSignal } from "./redis_bus.js";

export function registerWebSocket(wss) {
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get("roomId");
    const token = url.searchParams.get("token") || "";
    if (!roomId) {
      ws.close(1008, "roomId required");
      return;
    }
    const roomType = getRoomType(roomId);
    if (!roomType) {
      ws.close(1008, "room not found");
      return;
    }

    const auth = canJoinRoom(roomId, token);
    if (!auth.ok) {
      metrics.auth_failures_total += 1;
      ws.close(1008, "unauthorized");
      return;
    }

    const clientId = randomUUID();
    ws.__clientId = clientId;
    ws.__roomId = roomId;

    addClient(roomId, ws, clientId);
    metrics.ws_connections_total += 1;
    metrics.ws_connections_active += 1;

    ws.send(JSON.stringify({
      type: "welcome",
      clientId,
      roomId,
      roomType
    }));

    broadcastLocal(roomId, { type: "peer-joined", clientId }, ws);
    void publishSignal(roomId, { type: "peer-joined", clientId }, null);
    void logEvent("peer-joined", { roomId, clientId });

    ws.on("message", async data => {
      metrics.ws_messages_total += 1;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
        return;
      }

      if (!msg || typeof msg.type !== "string") {
        ws.send(JSON.stringify({ type: "error", error: "missing type" }));
        return;
      }

      // Optional direct send: { type, to, payload }
      if (msg.to) {
        metrics.ws_messages_direct_total += 1;
        const index = roomClientIndex.get(roomId);
        const target = index ? index.get(msg.to) : null;
        const payload = {
          type: msg.type,
          from: clientId,
          payload: msg.payload ?? null
        };

        if (target && target.readyState === target.OPEN) {
          target.send(JSON.stringify(payload));
        } else if (isRedisEnabled()) {
          await publishSignal(roomId, payload, msg.to);
        } else {
          ws.send(JSON.stringify({ type: "error", error: "target not found" }));
        }
        return;
      }

      metrics.ws_messages_broadcast_total += 1;
      const broadcastMsg = {
        type: msg.type,
        from: clientId,
        payload: msg.payload ?? null
      };
      broadcastLocal(roomId, broadcastMsg, ws);
      await publishSignal(roomId, broadcastMsg, null);
    });

    ws.on("close", () => {
      metrics.ws_connections_active -= 1;
      removeClient(roomId, ws, clientId);
      broadcastLocal(roomId, { type: "peer-left", clientId });
      void publishSignal(roomId, { type: "peer-left", clientId }, null);
      void logEvent("peer-left", { roomId, clientId });
    });
  });
}