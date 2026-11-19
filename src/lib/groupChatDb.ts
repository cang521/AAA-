import { GroupChat } from '../types';

const DB_NAME = 'PhoneSimGroupChatDB_v1';
const DB_VERSION = 1;
const STORE_GROUP_CHATS = 'group_chats';
export const LEGACY_GROUP_CHATS_STORAGE_KEY = 'phone_group_chats';
const PRESET_DEMO_GROUP_IDS = new Set(['group_default_1']);

type StoredGroupChatRecord = GroupChat & { _orderIndex?: number };
type GroupChatDbListener = (groups: GroupChat[]) => void;

let dbPromise: Promise<IDBDatabase> | null = null;
let groupChatsCache: GroupChat[] | null = null;
let hydrationPromise: Promise<GroupChat[]> | null = null;
let hasLocalMutation = false;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<GroupChatDbListener>();

const DEFAULT_AVATAR_PLACEHOLDERS = new Set([
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="64" fill="%23E0F2FE"/><circle cx="64" cy="64" r="54" fill="%23BAE6FD"/><path d="M64 34C65.5 48 76 58.5 90 60C76 61.5 65.5 72 64 86C62.5 72 52 61.5 38 60C52 58.5 62.5 48 64 34Z" fill="%230284C7"/><circle cx="86" cy="40" r="4" fill="%2338BDF8"/><circle cx="42" cy="80" r="3" fill="%2338BDF8"/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="64" fill="%23E0F2FE"/><circle cx="64" cy="64" r="54" fill="%23BAE6FD"/><circle cx="64" cy="48" r="20" fill="%230284C7"/><path d="M36 96C36 80.536 48.536 68 64 68C79.464 68 92 80.536 92 96V98H36V96Z" fill="%230284C7"/></svg>`,
]);

export function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function normalizeGroupChatList(groups: unknown): GroupChat[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((g): g is GroupChat => Boolean(g && typeof g === 'object' && (g as GroupChat).id && !PRESET_DEMO_GROUP_IDS.has((g as GroupChat).id)))
    .map((g) => {
      const clean: GroupChat = { ...g };
      delete (clean as StoredGroupChatRecord)._orderIndex;

      if (clean.avatarMode === 'auto' || clean.avatarMode === 'custom') {
        return clean;
      }
      const rawAvatar = typeof clean.avatar === 'string' ? clean.avatar.trim() : '';
      const isDefaultPlaceholder = !rawAvatar || DEFAULT_AVATAR_PLACEHOLDERS.has(rawAvatar);
      if (isDefaultPlaceholder) {
        return { ...clean, avatarMode: 'auto' as const };
      }
      return {
        ...clean,
        avatarMode: 'custom' as const,
        customAvatar: clean.customAvatar || rawAvatar,
      };
    });
}

function getGroupChatDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_GROUP_CHATS)) {
        db.createObjectStore(STORE_GROUP_CHATS, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });

  return dbPromise;
}

function notifyListeners(groups: GroupChat[]): void {
  listeners.forEach((fn) => {
    try {
      fn(groups);
    } catch (e) {
      console.warn('[GroupChatDB] Listener error:', e);
    }
  });
}

export function subscribeGroupChatDb(listener: GroupChatDbListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedGroupChats(): GroupChat[] | null {
  return groupChatsCache;
}

export function setCachedGroupChats(groups: GroupChat[]): void {
  groupChatsCache = normalizeGroupChatList(groups);
}

export function readLegacyGroupChatsFromLocalStorage(): GroupChat[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LEGACY_GROUP_CHATS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeGroupChatList(JSON.parse(raw));
  } catch (e) {
    console.warn('[GroupChatDB] Failed to read legacy localStorage group chats:', e);
    return [];
  }
}

async function readAllFromDb(db: IDBDatabase): Promise<GroupChat[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_GROUP_CHATS], 'readonly');
    const store = tx.objectStore(STORE_GROUP_CHATS);
    const req = store.getAll();
    req.onsuccess = () => {
      const rawRecords = (req.result || []) as StoredGroupChatRecord[];
      rawRecords.sort((a, b) => {
        const oa = typeof a._orderIndex === 'number' ? a._orderIndex : Number.MAX_SAFE_INTEGER;
        const ob = typeof b._orderIndex === 'number' ? b._orderIndex : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
      resolve(normalizeGroupChatList(rawRecords));
    };
    req.onerror = () => reject(req.error);
  });
}

async function writeAllToDb(db: IDBDatabase, groups: GroupChat[]): Promise<void> {
  const normalized = normalizeGroupChatList(groups);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_GROUP_CHATS], 'readwrite');
    const store = tx.objectStore(STORE_GROUP_CHATS);
    store.clear();
    normalized.forEach((group, index) => {
      const record: StoredGroupChatRecord = {
        ...group,
        _orderIndex: index,
      };
      store.put(record);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
  });
}

function mergeGroupLists(primary: GroupChat[], secondary: GroupChat[]): GroupChat[] {
  const map = new Map<string, GroupChat>();
  for (const g of primary) {
    map.set(g.id, g);
  }
  for (const g of secondary) {
    const existing = map.get(g.id);
    if (!existing) {
      map.set(g.id, g);
      continue;
    }
    const existingMsgCount = existing.messages?.length || 0;
    const incomingMsgCount = g.messages?.length || 0;
    const existingUpdated = existing.updatedAt || existing.createdAt || 0;
    const incomingUpdated = g.updatedAt || g.createdAt || 0;
    if (incomingMsgCount > existingMsgCount || incomingUpdated > existingUpdated) {
      // Merge messages non-destructively so neither copy loses messages
      const msgMap = new Map<string, GroupChat['messages'][number]>();
      for (const m of existing.messages || []) {
        msgMap.set(m.id, m);
      }
      for (const m of g.messages || []) {
        msgMap.set(m.id, m);
      }
      const mergedMessages = Array.from(msgMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      map.set(g.id, {
        ...existing,
        ...g,
        messages: mergedMessages,
        updatedAt: Math.max(existingUpdated, incomingUpdated),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Hydrate group chats from IndexedDB and migrate any legacy `phone_group_chats`
 * out of localStorage cleanly so localStorage quota is freed permanently.
 */
export function hydrateGroupChatsFromDb(): Promise<GroupChat[]> {
  if (!isIndexedDbAvailable()) {
    const fallback = groupChatsCache ?? readLegacyGroupChatsFromLocalStorage();
    groupChatsCache = fallback;
    return Promise.resolve(fallback);
  }

  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const db = await getGroupChatDb();
      const dbGroups = await readAllFromDb(db);
      const legacyGroups = readLegacyGroupChatsFromLocalStorage();

      let finalGroups = dbGroups;

      if (hasLocalMutation && groupChatsCache) {
        // User/code already mutated groupChatsCache before async hydration completed;
        // do not overwrite groupChatsCache or notify with older DB snapshot.
        if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_GROUP_CHATS_STORAGE_KEY) !== null) {
          try {
            localStorage.removeItem(LEGACY_GROUP_CHATS_STORAGE_KEY);
          } catch (e) {
            console.warn('[GroupChatDB] Failed to remove legacy localStorage key:', e);
          }
        }
        return groupChatsCache;
      }

      if (legacyGroups.length > 0) {
        finalGroups = mergeGroupLists(dbGroups, legacyGroups);
        await writeAllToDb(db, finalGroups);
      }

      // Only remove legacy localStorage key AFTER IndexedDB write/read succeeds
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_GROUP_CHATS_STORAGE_KEY) !== null) {
        try {
          localStorage.removeItem(LEGACY_GROUP_CHATS_STORAGE_KEY);
        } catch (e) {
          console.warn('[GroupChatDB] Failed to remove legacy localStorage key:', e);
        }
      }

      groupChatsCache = finalGroups;
      notifyListeners(finalGroups);
      return finalGroups;
    } catch (e) {
      console.warn('[GroupChatDB] Hydration fallback to localStorage:', e);
      const fallback = groupChatsCache ?? readLegacyGroupChatsFromLocalStorage();
      groupChatsCache = fallback;
      return fallback;
    }
  })();

  return hydrationPromise;
}

/**
 * Persist group chats to IndexedDB sequentially (serialized queue prevents lost concurrent updates).
 */
let lastWriteSucceeded = true;

export function saveGroupChatsToDb(groups: GroupChat[]): Promise<void> {
  const normalized = normalizeGroupChatList(groups);
  hasLocalMutation = true;
  groupChatsCache = normalized;
  notifyListeners(normalized);

  if (!isIndexedDbAvailable()) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LEGACY_GROUP_CHATS_STORAGE_KEY, JSON.stringify(normalized));
        lastWriteSucceeded = true;
      } catch (e) {
        console.warn('[GroupChatDB] localStorage fallback write failed:', e);
        lastWriteSucceeded = false;
      }
    } else {
      lastWriteSucceeded = true;
    }
    return Promise.resolve();
  }

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      try {
        if (hydrationPromise) {
          await hydrationPromise.catch(() => {});
        }
        const db = await getGroupChatDb();
        await writeAllToDb(db, normalized);
        lastWriteSucceeded = true;

        // Clean up legacy localStorage key once safely stored in IndexedDB
        if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_GROUP_CHATS_STORAGE_KEY) !== null) {
          try {
            localStorage.removeItem(LEGACY_GROUP_CHATS_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
      } catch (e) {
        lastWriteSucceeded = false;
        console.error('[GroupChatDB] Failed to save group chats to IndexedDB:', e);
      }
    });

  return writeQueue;
}

export async function waitForGroupChatSave(): Promise<boolean> {
  await writeQueue.catch(() => {});
  return lastWriteSucceeded;
}

export function clearGroupChatsInDb(): Promise<void> {
  hasLocalMutation = true;
  groupChatsCache = [];
  notifyListeners([]);

  if (!isIndexedDbAvailable()) {
    return Promise.resolve();
  }

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      try {
        const db = await getGroupChatDb();
        await writeAllToDb(db, []);
      } catch (e) {
        console.warn('[GroupChatDB] Failed to clear IndexedDB group chats:', e);
      }
    });

  return writeQueue;
}
