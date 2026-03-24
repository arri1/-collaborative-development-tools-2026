import mediasoup from "mediasoup";
import {
  MEDIASOUP_LISTEN_IP,
  MEDIASOUP_ANNOUNCED_IP,
  MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE,
  MEDIASOUP_MAX_INCOMING_BITRATE,
  MEDIASOUP_RTC_MIN_PORT,
  MEDIASOUP_RTC_MAX_PORT,
  MEDIASOUP_WORKER_LOG_LEVEL,
  MEDIASOUP_WORKER_LOG_TAGS,
  MEDIASOUP_MEDIA_CODECS
} from "./config.js";

let worker = null;
const rooms = new Map();

export async function initMediasoup() {
  const workerOpts = {
    logLevel: MEDIASOUP_WORKER_LOG_LEVEL,
    logTags: MEDIASOUP_WORKER_LOG_TAGS
  };
  if (MEDIASOUP_RTC_MIN_PORT > 0 && MEDIASOUP_RTC_MAX_PORT > 0) {
    workerOpts.rtcMinPort = MEDIASOUP_RTC_MIN_PORT;
    workerOpts.rtcMaxPort = MEDIASOUP_RTC_MAX_PORT;
  }

  worker = await mediasoup.createWorker(workerOpts);

  worker.on("died", () => {
    console.error("mediasoup worker died, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });
}

export async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const router = await worker.createRouter({ mediaCodecs: MEDIASOUP_MEDIA_CODECS });
    room = { id: roomId, router, peers: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

export function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const peer of room.peers.values()) {
    closePeer(peer);
  }
  room.router.close();
  rooms.delete(roomId);
}

export function createPeer(room, peerId, ws) {
  const peer = {
    id: peerId,
    ws,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map()
  };
  room.peers.set(peerId, peer);
  return peer;
}

export function getPeer(room, peerId) {
  return room.peers.get(peerId) || null;
}

export function removePeer(room, peerId) {
  const peer = room.peers.get(peerId);
  if (!peer) return;
  closePeer(peer);
  room.peers.delete(peerId);
}

export function listProducers(room) {
  const list = [];
  for (const peer of room.peers.values()) {
    for (const producer of peer.producers.values()) {
      list.push({
        producerId: producer.id,
        peerId: peer.id,
        kind: producer.kind
      });
    }
  }
  return list;
}

export async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: MEDIASOUP_LISTEN_IP, announcedIp: MEDIASOUP_ANNOUNCED_IP || undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: MEDIASOUP_INITIAL_AVAILABLE_OUTGOING_BITRATE
  });

  if (MEDIASOUP_MAX_INCOMING_BITRATE && MEDIASOUP_MAX_INCOMING_BITRATE > 0) {
    await transport.setMaxIncomingBitrate(MEDIASOUP_MAX_INCOMING_BITRATE);
  }

  return transport;
}

function closePeer(peer) {
  for (const consumer of peer.consumers.values()) {
    try { consumer.close(); } catch { /* ignore */ }
  }
  for (const producer of peer.producers.values()) {
    try { producer.close(); } catch { /* ignore */ }
  }
  for (const transport of peer.transports.values()) {
    try { transport.close(); } catch { /* ignore */ }
  }
}
