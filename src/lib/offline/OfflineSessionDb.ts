/**
 * OfflineSessionDb.ts
 * IndexedDB Database for Offline Scene Mode (PhoneSimOfflineSessionDB_v1)
 * Stores: sessions, sessionMessages, sceneTemplates
 */

export interface OfflineMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  action?: string; // e.g. （偏过脸去，耳根泛红）
  timestamp: number;
  state?: any; // Snapshot of character state after this message
}

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  location: string;
  atmosphere: string;
  background: string;
  defaultOpening?: string;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface OfflineSession {
  id: string;
  characterId: string;
  characterName?: string;
  characterAvatar?: string;
  sceneTemplateId?: string;
  sceneSnapshot: {
    name: string;
    location: string;
    atmosphere: string;
    background: string;
    defaultOpening?: string;
  };
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'ended_pending_decision' | 'saved' | 'deleted';
  stateHistory: { timestamp: number; state: any }[];
  eventSummary?: string;
  relationshipChanges?: string[];
  importantEvents?: string[];
  aiReflection?: string;
  candidateMemories?: string[];
  finalMemoryId?: string;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'PhoneSimOfflineSessionDB_v1';
const DB_VERSION = 1;

const STORE_SESSIONS = 'sessions';
const STORE_MESSAGES = 'sessionMessages';
const STORE_TEMPLATES = 'sceneTemplates';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('by_character', 'characterId', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_updated', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        store.createIndex('by_session', 'sessionId', { unique: false });
        store.createIndex('by_session_time', ['sessionId', 'timestamp'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        const store = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id' });
        store.createIndex('by_updated', 'updatedAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

// =========================================================================
// Sessions DB Methods
// =========================================================================

export async function saveOfflineSession(session: OfflineSession): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    session.updatedAt = Date.now();
    const req = store.put(session);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineSession(sessionId: string): Promise<OfflineSession | null> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function getSavedSessionsForCharacter(characterId: string): Promise<OfflineSession[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_character');
    const req = index.getAll(characterId);
    req.onsuccess = () => {
      const all: OfflineSession[] = req.result || [];
      const saved = all.filter((s) => s.status === 'saved');
      saved.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(saved);
    };
    req.onerror = () => resolve([]);
  });
}

export async function getAllSavedSessions(): Promise<OfflineSession[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_status');
    const req = index.getAll('saved');
    req.onsuccess = () => {
      const saved: OfflineSession[] = req.result || [];
      saved.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(saved);
    };
    req.onerror = () => resolve([]);
  });
}

export async function getActiveSessionForCharacter(characterId: string): Promise<OfflineSession | null> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_character');
    const req = index.getAll(characterId);
    req.onsuccess = () => {
      const all: OfflineSession[] = req.result || [];
      const active = all.find((s) => s.status === 'active' || s.status === 'ended_pending_decision');
      resolve(active || null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function getAnyActiveSession(): Promise<OfflineSession | null> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_status');
    const req = index.getAll('active');
    req.onsuccess = () => {
      const list: OfflineSession[] = req.result || [];
      if (list.length > 0) {
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list[0]);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

export async function deleteOfflineSession(sessionId: string): Promise<void> {
  const db = await getOfflineDb();
  // 1. Delete session
  const tx1 = db.transaction([STORE_SESSIONS], 'readwrite');
  tx1.objectStore(STORE_SESSIONS).delete(sessionId);
  await new Promise<void>((res) => { tx1.oncomplete = () => res(); });

  // 2. Delete all messages for session
  const messages = await getAllSessionMessages(sessionId);
  if (messages.length > 0) {
    const tx2 = db.transaction([STORE_MESSAGES], 'readwrite');
    const store2 = tx2.objectStore(STORE_MESSAGES);
    for (const m of messages) {
      store2.delete(m.id);
    }
    await new Promise<void>((res) => { tx2.oncomplete = () => res(); });
  }
}

// =========================================================================
// Session Messages DB Methods (Paginated)
// =========================================================================

export async function saveOfflineMessage(msg: OfflineMessage): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.put(msg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSessionMessages(sessionId: string): Promise<OfflineMessage[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_session_time');
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Date.now() + 86400000000]);
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function getPaginatedSessionMessages(
  sessionId: string,
  offset: number = 0,
  limit: number = 40
): Promise<{ messages: OfflineMessage[]; totalCount: number }> {
  const all = await getAllSessionMessages(sessionId);
  const totalCount = all.length;

  // Chronological list
  all.sort((a, b) => a.timestamp - b.timestamp);

  // Return slice from end (recent window for chat UI)
  let sliced: OfflineMessage[];
  if (offset === 0) {
    sliced = all.slice(Math.max(0, totalCount - limit));
  } else {
    const end = Math.max(0, totalCount - offset);
    const start = Math.max(0, end - limit);
    sliced = all.slice(start, end);
  }

  return { messages: sliced, totalCount };
}

// =========================================================================
// Scene Templates DB Methods
// =========================================================================

export async function saveDbSceneTemplate(template: SceneTemplate): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TEMPLATES], 'readwrite');
    const store = tx.objectStore(STORE_TEMPLATES);
    template.updatedAt = Date.now();
    const req = store.put(template);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDbSceneTemplates(): Promise<SceneTemplate[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_TEMPLATES], 'readonly');
    const store = tx.objectStore(STORE_TEMPLATES);
    const index = store.index('by_updated');
    const req = index.getAll();
    req.onsuccess = () => {
      const list: SceneTemplate[] = req.result || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });
}

export async function deleteDbSceneTemplate(id: string): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TEMPLATES], 'readwrite');
    const store = tx.objectStore(STORE_TEMPLATES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
