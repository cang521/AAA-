import { ChatMessage } from '../types';
import { getDb } from './chatDb';

export interface AiArchiveConfig {
  characterId: string;
  autoArchiveFrequency: 'off' | 'daily' | 'weekly' | 'monthly';
  searchMode: 'off' | 'auto' | 'deep';
  lastArchivedMessageId?: string;
  lastArchivedTimestamp?: number;
  lastArchivedAt?: number;
  archiveStatus: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  archiveVersion: number;
  lastFailedError?: string;
  pendingCount: number;
  archivedTotalCount: number;
}

export interface ChatHistoryIndexEntry {
  id: string;
  characterId: string;
  startMessageId: string;
  endMessageId: string;
  startTimestamp: number;
  endTimestamp: number;
  topic: string;
  keywords: string[];
  summary: string;
  messageCount: number;
  createdTimestamp: number;
}

const DB_NAME = 'PhoneSimArchiveDB_v1';
const DB_VERSION = 1;
const STORE_CONFIGS = 'ai_archive_configs';
const STORE_ARCHIVES = 'ai_archived_messages';
const STORE_INDEXES = 'ai_history_indexes';

let dbPromise: Promise<IDBDatabase> | null = null;
const configListeners = new Set<() => void>();

export function subscribeArchiveDb(callback: () => void) {
  configListeners.add(callback);
  return () => {
    configListeners.delete(callback);
  };
}

function notifyArchiveChange() {
  configListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('ArchiveDb listener error:', e);
    }
  });
}

function getArchiveDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
        db.createObjectStore(STORE_CONFIGS, { keyPath: 'characterId' });
      }

      if (!db.objectStoreNames.contains(STORE_ARCHIVES)) {
        const store = db.createObjectStore(STORE_ARCHIVES, { keyPath: 'id' });
        store.createIndex('by_character', 'characterId', { unique: false });
        store.createIndex('by_character_time', ['characterId', 'timestamp'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_INDEXES)) {
        const store = db.createObjectStore(STORE_INDEXES, { keyPath: 'id' });
        store.createIndex('by_character', 'characterId', { unique: false });
        store.createIndex('by_character_time', ['characterId', 'startTimestamp'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('Archive IndexedDB open error:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
  Fetch archive configuration and status for a specific AI Character
 */
export async function getAiArchiveConfig(characterId: string): Promise<AiArchiveConfig> {
  const db = await getArchiveDb();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_CONFIGS], 'readonly');
    const store = tx.objectStore(STORE_CONFIGS);
    const req = store.get(characterId);

    req.onsuccess = () => {
      const existing = req.result as AiArchiveConfig | undefined;
      if (existing) {
        resolve({
          autoArchiveFrequency: 'weekly',
          searchMode: 'auto',
          archiveStatus: 'idle',
          archiveVersion: 1,
          pendingCount: 0,
          archivedTotalCount: 0,
          ...existing,
        });
      } else {
        const defaultConfig: AiArchiveConfig = {
          characterId,
          autoArchiveFrequency: 'weekly',
          searchMode: 'auto',
          archiveStatus: 'idle',
          archiveVersion: 1,
          pendingCount: 0,
          archivedTotalCount: 0,
        };
        resolve(defaultConfig);
      }
    };

    req.onerror = () => {
      resolve({
        characterId,
        autoArchiveFrequency: 'weekly',
        searchMode: 'auto',
        archiveStatus: 'idle',
        archiveVersion: 1,
        pendingCount: 0,
        archivedTotalCount: 0,
      });
    };
  });
}

/**
 * Save / update archive configuration for an AI character
 */
export async function saveAiArchiveConfig(config: AiArchiveConfig): Promise<void> {
  const db = await getArchiveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CONFIGS], 'readwrite');
    const store = tx.objectStore(STORE_CONFIGS);
    const req = store.put(config);

    req.onsuccess = () => {
      notifyArchiveChange();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Count unarchived pending messages for an AI character from primary chat DB
 */
export async function getPendingMessageCount(
  characterId: string,
  lastArchivedTimestamp = 0
): Promise<number> {
  try {
    const primaryDb = await getDb();
    return new Promise((resolve) => {
      const tx = primaryDb.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('by_character_time');

      const keyRange = IDBKeyRange.bound(
        [characterId, lastArchivedTimestamp + 1],
        [characterId, Number.MAX_SAFE_INTEGER]
      );

      const req = index.count(keyRange);
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    console.warn('Error counting pending messages:', e);
    return 0;
  }
}

/**
 * Extract keywords and topic summary for a chunk of messages
 */
function generateChunkIndex(
  characterId: string,
  chunkMsgs: ChatMessage[]
): ChatHistoryIndexEntry {
  const first = chunkMsgs[0];
  const last = chunkMsgs[chunkMsgs.length - 1];

  const allText = chunkMsgs.map((m) => m.text).join(' ');
  const cleanText = allText.toLowerCase().replace(/[，。！？、~～…\n\r\t\(\)\[\]\{\}":;]/g, ' ');

  // Extract bi-grams and distinct terms
  const terms = cleanText.split(/\s+/).filter((t) => t.length >= 2);
  const chinese = cleanText.replace(/[^\u4e00-\u9fa5]/g, '');
  if (chinese.length >= 2) {
    for (let i = 0; i < chinese.length - 1; i++) {
      terms.push(chinese.slice(i, i + 2));
    }
  }

  const stopWords = new Set(['这个', '那个', '什么', '怎么', '我们', '你们', '他们', '可以', '一下', '就是', '还有', '如果', '因为']);
  const uniqueKeywords = Array.from(new Set(terms.filter((t) => t.length >= 2 && !stopWords.has(t)))).slice(0, 20);

  const firstUserMsg = chunkMsgs.find((m) => m.sender === 'user');
  const topic = firstUserMsg
    ? firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '')
    : `对话记录 (${new Date(first.timestamp).toLocaleDateString()})`;

  const snippet = chunkMsgs
    .slice(0, 4)
    .map((m) => `${m.sender === 'user' ? '用户' : 'AI'}: ${m.text.slice(0, 40)}`)
    .join(' | ');

  return {
    id: `idx_${characterId}_${first.timestamp}_${last.timestamp}`,
    characterId,
    startMessageId: first.id,
    endMessageId: last.id,
    startTimestamp: first.timestamp,
    endTimestamp: last.timestamp,
    topic,
    keywords: uniqueKeywords,
    summary: snippet,
    messageCount: chunkMsgs.length,
    createdTimestamp: Date.now(),
  };
}

/**
 * Perform incremental archiving for an AI character
 * Safety Guarantee: Raw messages in primary STORE_MESSAGES are NOT deleted!
 */
export async function performIncrementalArchive(
  characterId: string,
  isManual = false
): Promise<{ archivedCount: number; status: string; error?: string }> {
  const currentConfig = await getAiArchiveConfig(characterId);

  if (currentConfig.archiveStatus === 'running' && !isManual) {
    return { archivedCount: 0, status: 'running' };
  }

  // Update status to running
  await saveAiArchiveConfig({
    ...currentConfig,
    archiveStatus: 'running',
    lastFailedError: undefined,
  });

  try {
    const primaryDb = await getDb();
    const lastTime = currentConfig.lastArchivedTimestamp || 0;

    // Fetch unarchived messages from primary chat store
    const newMessages: ChatMessage[] = await new Promise((resolve, reject) => {
      const tx = primaryDb.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('by_character_time');

      const keyRange = IDBKeyRange.bound(
        [characterId, lastTime + 1],
        [characterId, Number.MAX_SAFE_INTEGER]
      );

      const req = index.getAll(keyRange);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (newMessages.length === 0) {
      await saveAiArchiveConfig({
        ...currentConfig,
        archiveStatus: 'completed',
        pendingCount: 0,
        lastArchivedAt: Date.now(),
      });
      return { archivedCount: 0, status: 'completed' };
    }

    // Sort chronologically ascending
    newMessages.sort((a, b) => a.timestamp - b.timestamp);

    const archiveDb = await getArchiveDb();

    // 1. Write messages incrementally to STORE_ARCHIVES
    const archiveTx = archiveDb.transaction([STORE_ARCHIVES], 'readwrite');
    const archiveStore = archiveTx.objectStore(STORE_ARCHIVES);

    for (const msg of newMessages) {
      archiveStore.put(msg);
    }

    await new Promise<void>((res, rej) => {
      archiveTx.oncomplete = () => res();
      archiveTx.onerror = () => rej(archiveTx.error);
    });

    // 2. Build lightweight index entries incrementally for new messages (chunks of 40)
    const CHUNK_SIZE = 40;
    const newIndexes: ChatHistoryIndexEntry[] = [];

    for (let i = 0; i < newMessages.length; i += CHUNK_SIZE) {
      const chunk = newMessages.slice(i, i + CHUNK_SIZE);
      if (chunk.length > 0) {
        newIndexes.push(generateChunkIndex(characterId, chunk));
      }
    }

    if (newIndexes.length > 0) {
      const indexTx = archiveDb.transaction([STORE_INDEXES], 'readwrite');
      const indexStore = indexTx.objectStore(STORE_INDEXES);

      for (const idx of newIndexes) {
        indexStore.put(idx);
      }

      await new Promise<void>((res, rej) => {
        indexTx.oncomplete = () => res();
        indexTx.onerror = () => rej(indexTx.error);
      });
    }

    // 3. Update archive cursor & state safely
    const lastMsg = newMessages[newMessages.length - 1];
    const updatedConfig: AiArchiveConfig = {
      ...currentConfig,
      lastArchivedMessageId: lastMsg.id,
      lastArchivedTimestamp: lastMsg.timestamp,
      lastArchivedAt: Date.now(),
      archiveStatus: 'completed',
      pendingCount: 0,
      archivedTotalCount: (currentConfig.archivedTotalCount || 0) + newMessages.length,
      lastFailedError: undefined,
    };

    await saveAiArchiveConfig(updatedConfig);
    return { archivedCount: newMessages.length, status: 'completed' };
  } catch (err: any) {
    console.error(`[ChatArchive] Incremental archive failed for ${characterId}:`, err);
    const errorMsg = err?.message || '文件或数据库写入失败';

    await saveAiArchiveConfig({
      ...currentConfig,
      archiveStatus: 'failed',
      lastFailedError: errorMsg,
    });

    return { archivedCount: 0, status: 'failed', error: errorMsg };
  }
}

/**
 * Check auto-archive schedules across all characters and run matured tasks
 */
export async function checkAndRunScheduledArchives(characterIds: string[]): Promise<void> {
  if (!characterIds || characterIds.length === 0) return;

  const now = Date.now();
  const DAY_MS = 24 * 3600 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  const MONTH_MS = 30 * DAY_MS;

  for (const charId of characterIds) {
    try {
      const config = await getAiArchiveConfig(charId);
      if (config.autoArchiveFrequency === 'off') continue;

      const lastAt = config.lastArchivedAt || 0;
      let isDue = false;

      if (config.autoArchiveFrequency === 'daily' && now - lastAt >= DAY_MS) {
        isDue = true;
      } else if (config.autoArchiveFrequency === 'weekly' && now - lastAt >= WEEK_MS) {
        isDue = true;
      } else if (config.autoArchiveFrequency === 'monthly' && now - lastAt >= MONTH_MS) {
        isDue = true;
      }

      if (isDue) {
        console.log(`[ChatArchive] Auto-archive triggered for character: ${charId}`);
        await performIncrementalArchive(charId, false);
      }
    } catch (e) {
      console.warn(`[ChatArchive] Scheduled archive check failed for ${charId}:`, e);
    }
  }
}

/**
 * Query lightweight index and retrieve relevant archived chat segments (<5ms response)
 */
export async function recallArchivedHistory(
  characterId: string,
  userQuery: string,
  mode: 'off' | 'auto' | 'deep' = 'auto'
): Promise<{ recalledText: string; matchedCount: number; durationMs: number }> {
  const startTime = Date.now();

  if (mode === 'off' || !userQuery || userQuery.trim().length < 2) {
    return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
  }

  try {
    const archiveDb = await getArchiveDb();

    // Load lightweight indexes for this character
    const indexes: ChatHistoryIndexEntry[] = await new Promise((resolve) => {
      const tx = archiveDb.transaction([STORE_INDEXES], 'readonly');
      const store = tx.objectStore(STORE_INDEXES);
      const index = store.index('by_character');
      const req = index.getAll(characterId);

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (indexes.length === 0) {
      return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
    }

    // Clean query & extract search terms
    const cleanQuery = userQuery.toLowerCase();
    const terms = cleanQuery.replace(/[，。！？、~～…\n\r\t\(\)\[\]\{\}":;]/g, ' ').split(/\s+/).filter((t) => t.length >= 2);
    const chinese = cleanQuery.replace(/[^\u4e00-\u9fa5]/g, '');
    if (chinese.length >= 2) {
      for (let i = 0; i < chinese.length - 1; i++) {
        terms.push(chinese.slice(i, i + 2));
      }
    }

    const searchTerms = Array.from(new Set(terms)).filter((t) => t.length >= 2);
    if (searchTerms.length === 0) {
      return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
    }

    // Match query keywords against lightweight index entries
    const scoredIndexes: Array<{ idx: ChatHistoryIndexEntry; score: number }> = [];

    for (const idxEntry of indexes) {
      let score = 0;

      for (const term of searchTerms) {
        if (idxEntry.keywords.some((k) => k.includes(term))) {
          score += 3;
        }
        if (idxEntry.topic.toLowerCase().includes(term)) {
          score += 5;
        }
        if (idxEntry.summary.toLowerCase().includes(term)) {
          score += 2;
        }
      }

      if (score > 0) {
        scoredIndexes.push({ idx: idxEntry, score });
      }
    }

    if (scoredIndexes.length === 0) {
      return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
    }

    // Sort by match score descending
    scoredIndexes.sort((a, b) => b.score - a.score);

    // Limit top chunks: 2 chunks for auto mode, 5 chunks for deep mode
    const topChunks = scoredIndexes.slice(0, mode === 'deep' ? 5 : 2);

    // Fetch raw archived messages corresponding to these top matched index chunks ONLY
    const matchedMessages: ChatMessage[] = [];

    for (const chunkItem of topChunks) {
      const chunkMsgs: ChatMessage[] = await new Promise((resolve) => {
        const tx = archiveDb.transaction([STORE_ARCHIVES], 'readonly');
        const store = tx.objectStore(STORE_ARCHIVES);
        const index = store.index('by_character_time');

        const keyRange = IDBKeyRange.bound(
          [characterId, chunkItem.idx.startTimestamp],
          [characterId, chunkItem.idx.endTimestamp]
        );

        const req = index.getAll(keyRange);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      matchedMessages.push(...chunkMsgs);
    }

    if (matchedMessages.length === 0) {
      return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
    }

    // Format concise historical context text
    const formattedSnippet = matchedMessages
      .slice(0, mode === 'deep' ? 12 : 6)
      .map((m) => `[${new Date(m.timestamp).toLocaleDateString()} ${m.sender === 'user' ? '用户' : 'AI'}]: ${m.text}`)
      .join('\n');

    const recalledText = `【历史归档记忆参考】\n${formattedSnippet}`;

    return {
      recalledText,
      matchedCount: matchedMessages.length,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    console.warn('[ChatArchive] Memory recall error:', e);
    return { recalledText: '', matchedCount: 0, durationMs: Date.now() - startTime };
  }
}
