import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'parking-store.json');
const TEMP_FILE = join(DATA_DIR, 'parking-store.tmp.json');

interface StoreMeta {
  version: number;
  restoreEpoch: number;
}

interface StoreState {
  data: Record<string, unknown> | null;
  meta: StoreMeta;
}

let cachedState: StoreState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 100;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[Storage] Created data directory: ${DATA_DIR}`);
  }
}

export function loadFromDisk(): StoreState {
  if (cachedState) return cachedState;

  ensureDir();

  if (!existsSync(DATA_FILE)) {
    console.log('[Storage] No data file found, starting fresh');
    cachedState = { data: null, meta: { version: 0, restoreEpoch: 0 } };
    return cachedState;
  }

  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoreState;
    cachedState = {
      data: parsed.data ?? null,
      meta: {
        version: parsed.meta?.version ?? 0,
        restoreEpoch: parsed.meta?.restoreEpoch ?? 0,
      },
    };
    const userCount = cachedState.data ? ((cachedState.data as any).users?.length ?? 0) : 0;
    const clientCount = cachedState.data ? ((cachedState.data as any).clients?.length ?? 0) : 0;
    console.log(`[Storage] Loaded from disk: v${cachedState.meta.version}, epoch=${cachedState.meta.restoreEpoch}, users=${userCount}, clients=${clientCount}`);
    return cachedState;
  } catch (e) {
    console.error('[Storage] Failed to read data file, starting fresh:', e);
    cachedState = { data: null, meta: { version: 0, restoreEpoch: 0 } };
    return cachedState;
  }
}

function writeToDiskSync(state: StoreState): void {
  ensureDir();
  try {
    const json = JSON.stringify(state);
    writeFileSync(TEMP_FILE, json, 'utf-8');
    renameSync(TEMP_FILE, DATA_FILE);
  } catch (e) {
    console.error('[Storage] CRITICAL: Failed to write data file:', e);
  }
}

export function getState(): StoreState {
  if (!cachedState) {
    return loadFromDisk();
  }
  return cachedState;
}

export function getData(): Record<string, unknown> | null {
  return getState().data;
}

export function getMeta(): StoreMeta {
  return getState().meta;
}

export function setData(data: Record<string, unknown>, meta?: Partial<StoreMeta>): StoreMeta {
  const state = getState();
  state.data = data;
  if (meta?.version !== undefined) state.meta.version = meta.version;
  else state.meta.version++;
  if (meta?.restoreEpoch !== undefined) state.meta.restoreEpoch = meta.restoreEpoch;
  cachedState = state;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeToDiskSync(state);
  }, DEBOUNCE_MS);

  return { ...state.meta };
}

export function incrementVersion(): number {
  const state = getState();
  state.meta.version++;
  cachedState = state;
  scheduleSave();
  return state.meta.version;
}

export function incrementRestoreEpoch(): number {
  const state = getState();
  state.meta.restoreEpoch++;
  cachedState = state;
  return state.meta.restoreEpoch;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (cachedState) writeToDiskSync(cachedState);
  }, DEBOUNCE_MS);
}

export function forceSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (cachedState) {
    writeToDiskSync(cachedState);
    console.log('[Storage] Force-saved to disk');
  }
}

loadFromDisk();
