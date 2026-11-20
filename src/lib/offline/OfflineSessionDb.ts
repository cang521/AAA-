/**
 * OfflineSessionDb.ts
 * IndexedDB Database for Offline Scene Mode (PhoneSimOfflineSessionDB_v1)
 * Stores: sessions, sessionMessages, sceneTemplates
 *
 * Non-destructive migration (v1 -> v2):
 * - NEVER deletes, drops, or recreates existing stores or user records.
 * - Adds optional indexes ('by_event_id', 'by_client_msg_id') incrementally.
 * - Normalizes legacy v1 records seamlessly on read.
 */

import { OfflineAwarenessMode } from './offlineAwareness';
import { OfflineMessageSegment } from './offlineSegments';
import { getDeviceTimeZone } from './offlineTimeFormat';

export type OfflineMessageStatus = 'sending' | 'sent' | 'failed';
export type OfflineSummaryStatus = 'idle' | 'ready' | 'summary_pending';

export interface OfflineMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  action?: string; // Legacy field retained for backward compatibility
  segments?: OfflineMessageSegment[]; // Structured action/dialogue segments
  clientMessageId?: string; // Stable client ID for idempotent send & retry
  requestId?: string; // Request correlation ID
  status?: OfflineMessageStatus; // 'sending' | 'sent' | 'failed'
  timestamp: number;
  createdAt?: number;
  updatedAt?: number;
  state?: any; // Snapshot of CharacterState after this message
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
  eventId?: string; // Unified timeline event ID (OFFLINE_SESSION_STARTED / ENDED)
  characterId: string;
  characterName?: string;
  characterAvatar?: string;
  sceneTemplateId?: string;
  sceneName?: string;
  sceneSnapshot: {
    name: string;
    location: string;
    atmosphere: string;
    background: string;
    defaultOpening?: string;
  };
  startedAt: number;
  endedAt?: number;
  durationMinutes?: number;
  timezone?: string;
  awarenessMode?: OfflineAwarenessMode;
  awarenessSource?: 'persona';
  awarenessLocked?: boolean;
  contextSummary?: string; // Rolling in-session summary for messages older than 30..60 window
  interactionMode?: 'FACE_TO_FACE';
  status: 'active' | 'ended_pending_decision' | 'saved' | 'deleted';
  summaryStatus?: OfflineSummaryStatus;
  summaryError?: string;
  stateHistory: { timestamp: number; state: any }[];
  eventTitle?: string;
  eventSummary?: string;
  relationshipChanges?: string[];
  emotionChanges?: string[];
  importantEvents?: string[];
  keyExpressions?: string[];
  unfinishedTopics?: string[];
  followUpWorthyTopics?: string[];
  aiReflection?: string;
  candidateMemories?: string[];
  finalMemoryId?: string;
  wechatEventMessageId?: string; // Idempotent link to WeChat timeline card
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'PhoneSimOfflineSessionDB_v1';
const DB_VERSION = 2;

const STORE_SESSIONS = 'sessions';
const STORE_MESSAGES = 'sessionMessages';
const STORE_TEMPLATES = 'sceneTemplates';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Forward-compatible hydrator for legacy v1 OfflineSession records
 */
export function normalizeOfflineSession(raw: OfflineSession): OfflineSession {
  if (!raw) return raw;
  const startedAt = raw.startedAt || raw.createdAt || Date.now();
  const endedAt = raw.endedAt;
  const durationMinutes =
    typeof raw.durationMinutes === 'number'
      ? raw.durationMinutes
      : endedAt && endedAt >= startedAt
      ? Math.max(1, Math.round((endedAt - startedAt) / 60000))
      : undefined;

  return {
    ...raw,
    eventId: raw.eventId || `offline_evt_${raw.id}`,
    sceneName: raw.sceneName || raw.sceneSnapshot?.name || '线下场景',
    timezone: raw.timezone || getDeviceTimeZone(),
    interactionMode: raw.interactionMode || 'FACE_TO_FACE',
    awarenessMode: raw.awarenessMode || 'immersive_character',
    awarenessSource: raw.awarenessSource || 'persona',
    awarenessLocked: raw.awarenessLocked ?? true,
    durationMinutes,
    summaryStatus:
      raw.summaryStatus ||
      (raw.eventSummary && raw.eventSummary.trim().length > 0 ? 'ready' : 'idle'),
    stateHistory: Array.isArray(raw.stateHistory) ? raw.stateHistory : [],
  };
}

/**
 * Forward-compatible hydrator for legacy v1 OfflineMessage records
 */
export function normalizeOfflineMessage(raw: OfflineMessage): OfflineMessage {
  if (!raw) return raw;
  const ts = raw.timestamp || raw.createdAt || Date.now();
  return {
    ...raw,
    timestamp: ts,
    createdAt: raw.createdAt || ts,
    updatedAt: raw.updatedAt || ts,
    status: raw.status || 'sent',
    clientMessageId: raw.clientMessageId || raw.id,
  };
}

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
      const tx = req.transaction;

      let sessionsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        sessionsStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('by_character', 'characterId', { unique: false });
        sessionsStore.createIndex('by_status', 'status', { unique: false });
        sessionsStore.createIndex('by_updated', 'updatedAt', { unique: false });
      } else {
        sessionsStore = tx!.objectStore(STORE_SESSIONS);
      }
      if (!sessionsStore.indexNames.contains('by_event_id')) {
        sessionsStore.createIndex('by_event_id', 'eventId', { unique: false });
      }

      let messagesStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        messagesStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        messagesStore.createIndex('by_session', 'sessionId', { unique: false });
        messagesStore.createIndex('by_session_time', ['sessionId', 'timestamp'], { unique: false });
      } else {
        messagesStore = tx!.objectStore(STORE_MESSAGES);
      }
      if (!messagesStore.indexNames.contains('by_client_msg_id')) {
        messagesStore.createIndex('by_client_msg_id', 'clientMessageId', { unique: false });
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
  const normalized = normalizeOfflineSession(session);
  normalized.updatedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const req = store.put(normalized);
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
    req.onsuccess = () => resolve(req.result ? normalizeOfflineSession(req.result) : null);
    req.onerror = () => resolve(null);
  });
}

export async function getOfflineSessionByEventId(eventId: string): Promise<OfflineSession | null> {
  if (!eventId) return null;
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    if (!store.indexNames.contains('by_event_id')) {
      resolve(null);
      return;
    }
    const index = store.index('by_event_id');
    const req = index.get(eventId);
    req.onsuccess = () => resolve(req.result ? normalizeOfflineSession(req.result) : null);
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
      const all: OfflineSession[] = (req.result || []).map(normalizeOfflineSession);
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
      const saved: OfflineSession[] = (req.result || []).map(normalizeOfflineSession);
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
      const all: OfflineSession[] = (req.result || []).map(normalizeOfflineSession);
      const active = all.find((s) => s.status === 'active' || s.status === 'ended_pending_decision');
      resolve(active || null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function getAllActiveSessions(): Promise<OfflineSession[]> {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_status');
    const req = index.getAll('active');
    req.onsuccess = () => {
      const list: OfflineSession[] = (req.result || []).map(normalizeOfflineSession);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });
}

export async function getAnyActiveSession(): Promise<OfflineSession | null> {
  const list = await getAllActiveSessions();
  return list.length > 0 ? list[0] : null;
}

export async function deleteOfflineSession(sessionId: string): Promise<void> {
  const db = await getOfflineDb();
  const tx1 = db.transaction([STORE_SESSIONS], 'readwrite');
  tx1.objectStore(STORE_SESSIONS).delete(sessionId);
  await new Promise<void>((res) => {
    tx1.oncomplete = () => res();
  });

  const messages = await getAllSessionMessages(sessionId);
  if (messages.length > 0) {
    const tx2 = db.transaction([STORE_MESSAGES], 'readwrite');
    const store2 = tx2.objectStore(STORE_MESSAGES);
    for (const m of messages) {
      store2.delete(m.id);
    }
    await new Promise<void>((res) => {
      tx2.oncomplete = () => res();
    });
  }
}

// =========================================================================
// Session Messages DB Methods (Idempotent Upsert & Paginated Read)
// =========================================================================

/**
 * Idempotent upsert by `id` or matching `clientMessageId` in the same session.
 * Prevents duplicate user/AI messages during retries or rapid re-submissions.
 */
export async function saveOfflineMessage(msg: OfflineMessage): Promise<OfflineMessage> {
  const db = await getOfflineDb();
  const now = Date.now();
  const normalized: OfflineMessage = {
    ...msg,
    clientMessageId: msg.clientMessageId || msg.id,
    status: msg.status || 'sent',
    createdAt: msg.createdAt || msg.timestamp || now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);

    const doPut = (finalMsg: OfflineMessage) => {
      const req = store.put(finalMsg);
      req.onsuccess = () => resolve(finalMsg);
      req.onerror = () => reject(req.error);
    };

    // If clientMessageId exists on index, check whether an existing record with a different key shares it
    if (normalized.clientMessageId && store.indexNames.contains('by_client_msg_id')) {
      const idx = store.index('by_client_msg_id');
      const lookupReq = idx.getAll(normalized.clientMessageId);
      lookupReq.onsuccess = () => {
        const matches: OfflineMessage[] = (lookupReq.result || []).filter(
          (m: OfflineMessage) => m.sessionId === normalized.sessionId
        );
        if (matches.length > 0) {
          const primary = matches[0];
          // Remove any stray duplicates with same clientMessageId
          for (let i = 1; i < matches.length; i++) {
            if (matches[i].id !== primary.id) {
              store.delete(matches[i].id);
            }
          }
          const merged: OfflineMessage = {
            ...primary,
            ...normalized,
            id: primary.id,
            createdAt: primary.createdAt || normalized.createdAt,
            updatedAt: now,
          };
          doPut(merged);
        } else {
          doPut(normalized);
        }
      };
      lookupReq.onerror = () => doPut(normalized);
    } else {
      doPut(normalized);
    }
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
    req.onsuccess = () => {
      const rawList: OfflineMessage[] = (req.result || []).map(normalizeOfflineMessage);
      // Defensive dedup by id / clientMessageId preserving latest update
      const dedupMap = new Map<string, OfflineMessage>();
      for (const m of rawList) {
        const key = m.clientMessageId || m.id;
        const prev = dedupMap.get(key);
        if (!prev || (m.updatedAt || 0) >= (prev.updatedAt || 0)) {
          dedupMap.set(key, m);
        }
      }
      const list = Array.from(dedupMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });
}

export async function getPaginatedSessionMessages(
  sessionId: string,
  offset: number = 0,
  limit: number = 60
): Promise<{ messages: OfflineMessage[]; totalCount: number }> {
  const all = await getAllSessionMessages(sessionId);
  const totalCount = all.length;

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
