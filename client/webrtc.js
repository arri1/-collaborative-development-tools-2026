const socket = io("http://localhost:4000"); // SFU сервер
let device;
let sendTransport;
let recvTransport;
let producers = {};
let consumers = {};
let localStream;
let roomId = "workflow1";

// аудио обязательно, видео по желанию
async function getLocalStream() {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
        const video = await navigator.mediaDevices.getUserMedia({ video: true });
        video.getVideoTracks().forEach(track => audio.addTrack(track));
    } catch {
        console.log("Видео недоступно, включаем только аудио");
    }
    localStream = audio;
    document.getElementById("localVideo").srcObject = localStream;
}

// инициализация mediasoup-client устройства
async function initDevice(rtpCapabilities) {
    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
}

// создание WebRTC транспорта
async function createSendTransport() {
    return new Promise(resolve => {
        socket.emit("createWebRtcTransport", { roomId }, async info => {
            sendTransport = device.createSendTransport(info);

            sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
                socket.emit("connectTransport", { roomId, dtlsParameters }, callback);
            });

            sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
                socket.emit("produce", { roomId, kind, rtpParameters }, ({ id }) => callback({ id }));
            });

            resolve(sendTransport);
        });
    });
}

// отправка локальных треков
async function produceTracks() {
    for (const track of localStream.getTracks()) {
        const kind = track.kind;
        const producer = await sendTransport.produce({ track });
        producers[track.id] = producer;
    }
}

// создание потребителей для чужих треков
socket.on("newProducer", async ({ producerId, peerId }) => {
    const consumer = await recvTransport.consume({
        producerId,
        rtpCapabilities: device.rtpCapabilities,
        paused: false
    });
    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    const videoEl = document.createElement("video");
    videoEl.srcObject = stream;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    document.getElementById("videos").appendChild(videoEl);

    consumers[producerId] = consumer;
});

// подключение к комнате
async function joinRoom() {
    await getLocalStream();

    socket.emit("joinRoom", { roomId });

    socket.on("connectTransport", async ({ rtpCapabilities }) => {
        await initDevice(rtpCapabilities);
        await createSendTransport();
        await produceTracks();
    });

    // получаем rtpCapabilities и создаём recvTransport
    socket.emit("getRouterRtpCapabilities", { roomId }, async data => {
        if (!device) await initDevice(data.rtpCapabilities);

        socket.emit("createWebRtcTransport", { roomId }, info => {
            recvTransport = device.createRecvTransport(info);
            recvTransport.on("connect", ({ dtlsParameters }, callback) => {
                socket.emit("connectTransport", { roomId, dtlsParameters }, callback);
            });
        });
    });
}

// screen sharing
async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = screenStream.getVideoTracks()[0];
        const producer = await sendTransport.produce({ track });
        producers[track.id] = producer;

        track.onended = () => producer.close();
    } catch (e) {
        console.log("Screen sharing canceled");
    }
}

// кнопки управления
document.getElementById("joinBtn").onclick = joinRoom;
document.getElementById("shareScreenBtn").onclick = shareScreen;