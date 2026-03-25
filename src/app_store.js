import { loadAppState, saveAppState } from "./db.js";

const defaultState = {
  users: [],
  servers: [],
  sessions: {}
};

let state = { ...defaultState };
let loaded = false;
let writeQueue = Promise.resolve();

export async function loadAppStore() {
  if (loaded) return;
  try {
    const parsed = await loadAppState(defaultState);
    state = { ...defaultState, ...(parsed || {}) };
  } catch (err) {
    console.error("Failed to load app store:", err);
  }
  loaded = true;
}

export function getAppState() {
  return state;
}

export function updateAppState(fn) {
  fn(state);
  queueWrite();
}

function queueWrite() {
  writeQueue = writeQueue.then(async () => {
    try {
      await saveAppState(state);
    } catch (err) {
      console.error("Failed to save app store:", err);
    }
  });
}
