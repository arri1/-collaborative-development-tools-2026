import * as mediasoup from 'mediasoup';

let workers = [];
let nextWorkerIndex = 0;

export async function initMediasoupWorkers() {
  const numWorkers = 1;
  
  console.log('Initializing mediasoup workers...');
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    
    worker.on('died', () => {
      console.error('Mediasoup worker died, exiting...');
      process.exit(1);
    });
    
    workers.push(worker);
    console.log(`Worker ${i} created`);
  }
  
  return workers;
}

export function getNextWorker() {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}