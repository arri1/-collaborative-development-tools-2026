import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./config.js";

const APP_STORE_FILE = path.join(DATA_DIR, "app_state.json");

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
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(APP_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state = { ...defaultState, ...parsed };
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to load app store:", err);
    }
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
      await fs.writeFile(APP_STORE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to save app store:", err);
    }
  });
}