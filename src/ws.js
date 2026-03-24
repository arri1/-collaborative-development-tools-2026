import { randomUUID } from "crypto";

import { metrics } from "./metrics.js";
import { canJoinRoom } from "./auth.js";
import { logEvent } from "./storage.js";
import { getRoomType } from "./rooms.js";
import {
  getOrCreateRoom,
  createPeer,
  removePeer,
  listProducers,
  createWebRtcTransport
} from "./mediasoup_manager.js";

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

function notifyRoom(room, message, excludePeerId = null) {
  for (const peer of room.peers.values()) {
    if (excludePeerId && peer.id === excludePeerId) continue;
    if (peer.ws && peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  }
}

export function registerWebSocket(wss) {
  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get("roomId");
    const token = url.searchParams.get("token") || "";
    const userId = url.searchParams.get("userId") || "";
    const username = url.searchParams.get("username") || "User";
    if (!roomId) {
      send(ws, { type: "error", error: "roomId required" });
      ws.close(1008, "roomId required");
      return;
    }
    const roomType = getRoomType(roomId);
    if (!roomType) {
      send(ws, { type: "error", error: "room not found" });
      ws.close(1008, "room not found");
      return;
    }

    const auth = canJoinRoom(roomId, token);
    if (!auth.ok) {
      metrics.auth_failures_total += 1;
      send(ws, { type: "error", error: "unauthorized" });
      ws.close(1008, "unauthorized");
      return;
    }

    const room = await getOrCreateRoom(roomId);
    const peerId = randomUUID();
    const peer = createPeer(room, peerId, ws);
    peer.userId = userId;
    peer.username = username;

    metrics.ws_connections_total += 1;
    metrics.ws_connections_active += 1;

    send(ws, { type: "welcome", peerId, roomId, roomType });
    notifyRoom(room, { notification: "peerJoined", data: { peerId, userId, username } }, peerId);
    void logEvent("peer-joined", { roomId, peerId });

    ws.on("message", async data => {
      metrics.ws_messages_total += 1;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(ws, { type: "error", error: "invalid json" });
        return;
      }

      const { id, action, data: payload } = msg || {};
      if (!action || id === undefined || id === null) {
        send(ws, { type: "error", error: "missing id/action" });
        return;
      }

      const reply = (ok, dataOrError) => {
        if (ok) send(ws, { id, ok: true, data: dataOrError });
        else send(ws, { id, ok: false, error: dataOrError });
      };

      try {
        if (action === "getRouterRtpCapabilities") {
          reply(true, room.router.rtpCapabilities);
          return;
        }

        if (action === "getProducers") {
          const producers = listProducers(room)
            .filter(p => p.peerId !== peerId)
            .map(p => {
              const peer = room.peers.get(p.peerId);
              return {
                ...p,
                userId: peer?.userId || "",
                username: peer?.username || "User"
              };
            });
          reply(true, producers);
          return;
        }

        if (action === "getPeers") {
          const peers = Array.from(room.peers.values()).map(p => ({
            peerId: p.id,
            userId: p.userId,
            username: p.username
          }));
          reply(true, peers);
          return;
        }

        if (action === "createWebRtcTransport") {
          const transport = await createWebRtcTransport(room.router);
          peer.transports.set(transport.id, transport);

          transport.on("dtlsstatechange", dtlsState => {
            if (dtlsState === "closed") {
              transport.close();
            }
          });

          transport.on("close", () => {
            peer.transports.delete(transport.id);
          });

          reply(true, {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters
          });
          void logEvent("transport-created", { roomId, peerId, transportId: transport.id });
          return;
        }

        if (action === "connectWebRtcTransport") {
          const { transportId, dtlsParameters } = payload || {};
          const transport = peer.transports.get(transportId);
          if (!transport) return reply(false, "transport not found");
          await transport.connect({ dtlsParameters });
          void logEvent("transport-connected", { roomId, peerId, transportId });
          reply(true, { ok: true });
          return;
        }

        if (action === "produce") {
          const { transportId, kind, rtpParameters, appData } = payload || {};
          const transport = peer.transports.get(transportId);
          if (!transport) return reply(false, "transport not found");

          const producer = await transport.produce({ kind, rtpParameters, appData });
          peer.producers.set(producer.id, producer);

          producer.on("transportclose", () => {
            peer.producers.delete(producer.id);
          });

          producer.on("close", () => {
            peer.producers.delete(producer.id);
          });

          notifyRoom(room, {
            notification: "newProducer",
            data: { producerId: producer.id, peerId, kind: producer.kind, userId: peer.userId, username: peer.username }
          }, peerId);

          void logEvent("producer-created", { roomId, peerId, producerId: producer.id, kind: producer.kind });
          reply(true, { producerId: producer.id });
          return;
        }

        if (action === "closeProducer") {
          const { producerId } = payload || {};
          const producer = peer.producers.get(producerId);
          if (!producer) return reply(false, "producer not found");
          producer.close();
          peer.producers.delete(producerId);
          reply(true, { ok: true });
          return;
        }

        if (action === "consume") {
          const { transportId, producerId, rtpCapabilities } = payload || {};
          const transport = peer.transports.get(transportId);
          if (!transport) return reply(false, "transport not found");
          if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            return reply(false, "cannot consume");
          }

          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true
          });

          peer.consumers.set(consumer.id, consumer);

          consumer.on("transportclose", () => {
            peer.consumers.delete(consumer.id);
          });

          consumer.on("producerclose", () => {
            peer.consumers.delete(consumer.id);
            send(ws, { notification: "producerClosed", data: { producerId } });
          });

          reply(true, {
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            paused: consumer.paused
          });
          void logEvent("consumer-created", { roomId, peerId, producerId, consumerId: consumer.id, kind: consumer.kind });
          return;
        }

        if (action === "resume") {
          const { consumerId } = payload || {};
          const consumer = peer.consumers.get(consumerId);
          if (!consumer) return reply(false, "consumer not found");
          await consumer.resume();
          void logEvent("consumer-resumed", { roomId, peerId, consumerId });
          reply(true, { ok: true });
          return;
        }

        reply(false, "unknown action");
      } catch (err) {
        reply(false, err?.message || "unexpected error");
      }
    });

    ws.on("close", () => {
      metrics.ws_connections_active -= 1;
      removePeer(room, peerId);
      notifyRoom(room, { notification: "peerLeft", data: { peerId, userId, username } }, peerId);
      void logEvent("peer-left", { roomId, peerId });
    });
  });
}
