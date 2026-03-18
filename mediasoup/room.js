import { getNextWorker } from './worker.js';

const rooms = new Map();

export async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  console.log(`Creating new room: ${roomId}`);
  const worker = getNextWorker();
  
  const mediaCodecs = [
    { 
      kind: 'audio', 
      mimeType: 'audio/opus', 
      clockRate: 48000, 
      channels: 2 
    },
    { 
      kind: 'video', 
      mimeType: 'video/VP8', 
      clockRate: 90000 
    },
    { 
      kind: 'video', 
      mimeType: 'video/H264', 
      clockRate: 90000, 
      parameters: { 
        'packetization-mode': 1, 
        'profile-level-id': '42e01f', 
        'level-asymmetry-allowed': 1 
      } 
    }
  ];
  
  const router = await worker.createRouter({ mediaCodecs });

  const roomData = {
    id: roomId,
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };
  
  rooms.set(roomId, roomData);
  return roomData;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}