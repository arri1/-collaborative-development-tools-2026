const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // разрешаем доступ с клиента
});

let worker;
let router;
let rooms = {}; // хранение всех комнат

async function startMediasoup() {
  worker = await mediasoup.createWorker();

  worker.on("died", () => {
    console.error("mediasoup worker died, exiting...");
    process.exit(1);
  });

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000
      }
    ]
  });

  console.log("Mediasoup worker and router created");
}

class Room {
  constructor(id) {
    this.id = id;
    this.peers = {};
    this.transports = {};
    this.producers = {};
  }
}

io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  socket.on("joinRoom", ({ roomId }) => {
    if (!rooms[roomId]) rooms[roomId] = new Room(roomId);
    rooms[roomId].peers[socket.id] = socket;
    socket.join(roomId);
    console.log(`Peer ${socket.id} joined room ${roomId}`);
  });

  socket.on("createWebRtcTransport", async ({ roomId }, callback) => {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    });

    rooms[roomId].transports[socket.id] = transport;

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });
  });

  socket.on("connectTransport", async ({ roomId, dtlsParameters }, callback) => {
    const transport = rooms[roomId].transports[socket.id];
    await transport.connect({ dtlsParameters });
    callback({ connected: true });
  });

  socket.on("produce", async ({ roomId, kind, rtpParameters }, callback) => {
    const transport = rooms[roomId].transports[socket.id];
    const producer = await transport.produce({ kind, rtpParameters });
    rooms[roomId].producers[socket.id] = producer;

    // уведомляем всех в комнате
    socket.to(roomId).emit("newProducer", { producerId: producer.id, peerId: socket.id });

    callback({ id: producer.id });
  });

  socket.on("consume", async ({ roomId, producerId }, callback) => {
    const transport = rooms[roomId].transports[socket.id];
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities: router.rtpCapabilities,
      paused: false
    });

    callback({
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // удалить из комнат
    Object.values(rooms).forEach(room => {
      delete room.peers[socket.id];
      if (room.transports[socket.id]) {
        room.transports[socket.id].close();
        delete room.transports[socket.id];
      }
      if (room.producers[socket.id]) {
        room.producers[socket.id].close();
        delete room.producers[socket.id];
      }
    });
  });
});

server.listen(4000, async () => {
  await startMediasoup();
  console.log("SFU server running on port 4000");
});