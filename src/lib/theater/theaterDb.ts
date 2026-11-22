import { TheaterSession, TheaterPreset } from '../../types';

const DB_NAME = 'TheaterDB_v1';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const CUSTOM_PRESETS_STORE = 'customPresets';
const RECENT_DRAWS_STORE = 'recentDraws';

let dbInstance: IDBDatabase | null = null;

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.indexedDB);
  } catch {
    return false;
  }
}

export async function openTheaterDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB is not available');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CUSTOM_PRESETS_STORE)) {
        db.createObjectStore(CUSTOM_PRESETS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECENT_DRAWS_STORE)) {
        db.createObjectStore(RECENT_DRAWS_STORE, { keyPath: 'id' });
      }
    };
  });
}

// Sessions
export async function saveTheaterSessionToDb(session: TheaterSession): Promise<void> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.put({ ...session, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to save theater session to IndexedDB, fallback to localStorage', e);
    const list = loadTheaterSessionsFromLocalStorage();
    const idx = list.findIndex(s => s.id === session.id);
    if (idx >= 0) list[idx] = session;
    else list.unshift(session);
    localStorage.setItem('theater_sessions_fallback', JSON.stringify(list));
  }
}

export async function loadTheaterSessionsFromDb(): Promise<TheaterSession[]> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const res = (req.result || []) as TheaterSession[];
        res.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to load theater sessions from IndexedDB, fallback to localStorage', e);
    return loadTheaterSessionsFromLocalStorage();
  }
}

function loadTheaterSessionsFromLocalStorage(): TheaterSession[] {
  try {
    const raw = localStorage.getItem('theater_sessions_fallback');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function deleteTheaterSessionFromDb(sessionId: string): Promise<void> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to delete session', e);
  }
}

// Custom Presets
export async function saveCustomPresetToDb(preset: TheaterPreset): Promise<void> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_PRESETS_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_PRESETS_STORE);
      const req = store.put({ ...preset, isCustom: true });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to save custom preset', e);
  }
}

export async function loadCustomPresetsFromDb(): Promise<TheaterPreset[]> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_PRESETS_STORE, 'readonly');
      const store = tx.objectStore(CUSTOM_PRESETS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as TheaterPreset[]);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function deleteCustomPresetFromDb(presetId: string): Promise<void> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_PRESETS_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_PRESETS_STORE);
      const req = store.delete(presetId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Failed to delete custom preset', e);
  }
}

// Recent Draws (Max 20 deduplicated)
export async function getRecentDrawIdsFromDb(): Promise<string[]> {
  try {
    const db = await openTheaterDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECENT_DRAWS_STORE, 'readonly');
      const store = tx.objectStore(RECENT_DRAWS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as { id: string; timestamp: number }[];
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items.map(i => i.id));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function addRecentDrawIdToDb(presetId: string): Promise<void> {
  try {
    const db = await openTheaterDb();
    const recent = await getRecentDrawIdsFromDb();
    const updated = [presetId, ...recent.filter(id => id !== presetId)].slice(0, 20);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECENT_DRAWS_STORE, 'readwrite');
      const store = tx.objectStore(RECENT_DRAWS_STORE);
      // clear and rewrite
      store.clear();
      updated.forEach(id => {
        store.put({ id, timestamp: Date.now() });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Failed to update recent draws', e);
  }
}
