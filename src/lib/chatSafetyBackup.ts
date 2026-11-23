import { Capacitor, registerPlugin } from '@capacitor/core';
import { ChatMessage } from '../types';

const SAFETY_DB_NAME = 'PhoneSimChatSafetyDB_v1';
const SAFETY_DB_VERSION = 2;
const SAFETY_STORE = 'message_mirror';
const TOMBSTONE_STORE = 'message_tombstones';

interface NativeChatSafetyPlugin {
  appendBatch(options: { recordsJson: string }): Promise<{ written: number }>;
  appendTombstones(options: { idsJson: string }): Promise<{ written: number }>;
  readBatch(options: { offset: number; limit: number }): Promise<{
    recordsJson: string;
    nextOffset: number;
    hasMore: boolean;
  }>;
}

const NativeChatSafety = registerPlugin<NativeChatSafetyPlugin>('NativeChatSafety');

let safetyDbPromise: Promise<IDBDatabase> | null = null;

function getSafetyDb(): Promise<IDBDatabase> {
  if (safetyDbPromise) return safetyDbPromise;
  safetyDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(SAFETY_DB_NAME, SAFETY_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAFETY_STORE)) {
        const store = db.createObjectStore(SAFETY_STORE, { keyPath: 'id' });
        store.createIndex('by_character_time', ['characterId', 'timestamp'], { unique: false });
      }
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      safetyDbPromise = null;
      reject(req.error || new Error('聊天安全副本数据库打开失败'));
    };
  });
  return safetyDbPromise;
}

function validMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => Boolean(m?.id && m?.characterId && Number.isFinite(m?.timestamp)));
}

async function mirrorToIndependentDb(messages: ChatMessage[]): Promise<void> {
  const db = await getSafetyDb();
  const tx = db.transaction([SAFETY_STORE, TOMBSTONE_STORE], 'readwrite');
  const store = tx.objectStore(SAFETY_STORE);
  const tombstones = tx.objectStore(TOMBSTONE_STORE);
  for (const message of messages) {
    store.put(message);
    tombstones.delete(message.id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('聊天安全副本写入失败'));
    tx.onabort = () => reject(tx.error || new Error('聊天安全副本写入被中止'));
  });
}

/**
 * Every committed chat message is mirrored into an independent IndexedDB and,
 * on Android, an append-only file in the app's native files directory. Neither
 * copy is removed when a chat message or character is deleted normally.
 */
export async function mirrorChatMessagesToSafety(messages: ChatMessage[]): Promise<void> {
  const safe = validMessages(messages);
  if (safe.length === 0) return;

  const failures: unknown[] = [];
  try {
    await mirrorToIndependentDb(safe);
  } catch (error) {
    failures.push(error);
    console.error('[ChatSafety] Independent DB mirror failed:', error);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      // Keep bridge payloads bounded for long imports and large image messages.
      for (let i = 0; i < safe.length; i += 100) {
        await NativeChatSafety.appendBatch({ recordsJson: JSON.stringify(safe.slice(i, i + 100)) });
      }
    } catch (error) {
      failures.push(error);
      console.error('[ChatSafety] Native append-only mirror failed:', error);
    }
  }

  if (failures.length >= (Capacitor.isNativePlatform() ? 2 : 1)) {
    throw new Error('聊天已写入主库，但所有安全副本均写入失败');
  }
}

export async function readIndependentSafetyMessages(): Promise<ChatMessage[]> {
  try {
    const db = await getSafetyDb();
    return await new Promise<ChatMessage[]>((resolve) => {
      const tx = db.transaction([SAFETY_STORE, TOMBSTONE_STORE], 'readonly');
      const messageReq = tx.objectStore(SAFETY_STORE).getAll();
      const tombstoneReq = tx.objectStore(TOMBSTONE_STORE).getAllKeys();
      tx.oncomplete = () => {
        const deleted = new Set((tombstoneReq.result || []).map(String));
        resolve(validMessages((messageReq.result || []) as ChatMessage[]).filter((m) => !deleted.has(m.id)));
      };
      tx.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function readNativeSafetyMessages(): Promise<ChatMessage[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const byId = new Map<string, ChatMessage>();
  try {
    let offset = 0;
    for (let page = 0; page < 10000; page += 1) {
      const result = await NativeChatSafety.readBatch({ offset, limit: 500 });
      const parsed = JSON.parse(result.recordsJson || '[]');
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.__deleted === true && typeof item.id === 'string') {
            byId.delete(item.id);
          } else {
            for (const message of validMessages([item] as ChatMessage[])) byId.set(message.id, message);
          }
        }
      }
      if (!result.hasMore || result.nextOffset <= offset) break;
      offset = result.nextOffset;
    }
  } catch (error) {
    console.warn('[ChatSafety] Native recovery read failed:', error);
  }
  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export async function seedSafetyMirror(messages: ChatMessage[]): Promise<void> {
  const safe = validMessages(messages);
  for (let i = 0; i < safe.length; i += 500) {
    await mirrorChatMessagesToSafety(safe.slice(i, i + 500));
  }
}

/** Record intentional deletions so automatic recovery never resurrects them. */
export async function markChatMessagesDeleted(ids: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return;
  const db = await getSafetyDb();
  const tx = db.transaction(TOMBSTONE_STORE, 'readwrite');
  const store = tx.objectStore(TOMBSTONE_STORE);
  for (const id of uniqueIds) store.put({ id, deletedAt: Date.now() });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('删除标记写入失败'));
  });
  if (Capacitor.isNativePlatform()) {
    await NativeChatSafety.appendTombstones({ idsJson: JSON.stringify(uniqueIds) });
  }
}
