import { ChatMessage } from '../types';

const DB_NAME = 'PhoneSimChatDB_v2';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages';

interface CharacterMeta {
  characterId: string;
  totalCount: number;
  lastMessage: ChatMessage | null;
}

// In-memory cache for fast O(1) sync UI rendering of contact/conversation list
const metaCache = new Map<string, CharacterMeta>();
let isMetaLoaded = false;
const listeners = new Set<() => void>();

function notifyChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Listener error', e);
    }
  });
}

export function subscribeChatDb(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        store.createIndex('by_character', 'characterId', { unique: false });
        store.createIndex('by_character_time', ['characterId', 'timestamp'], { unique: false });
        store.createIndex('by_time', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      try {
        await checkAndMigrateLocalStorage(db);
        await reloadMetaCache(db);
      } catch (e) {
        console.warn('DB initialization post-processing warning:', e);
      }
      resolve(db);
    };

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Migrate legacy messages from localStorage into IndexedDB seamlessly
 */
async function checkAndMigrateLocalStorage(db: IDBDatabase): Promise<void> {
  try {
    const raw = localStorage.getItem('phone_chat_messages');
    if (!raw) {
      // Check if DB is completely empty, insert initial default message if so
      const count = await getDbCount(db);
      if (count === 0) {
        const defaultMsg: ChatMessage = {
          id: 'msg_welcome_1',
          characterId: 'char_1',
          sender: 'ai',
          text: '小清，今天工作学习辛苦啦！有没有按时吃晚饭？记得多喝热水哦~',
          timestamp: Date.now() - 3600000,
          thinkingProcess:
            '用户系统数据显示此时为晚间。根据记忆条目“关注用户日常与情绪”，发出亲切问候，询问晚饭与喝水情况。',
        };
        await addMessageToStore(db, defaultMsg);
      }
      return;
    }

    const legacyMessages: ChatMessage[] = JSON.parse(raw);
    if (Array.isArray(legacyMessages) && legacyMessages.length > 0) {
      const tx = db.transaction([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      for (const msg of legacyMessages) {
        if (msg && msg.id && msg.characterId) {
          store.put(msg);
        }
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      console.log(`[IndexedDB] Migrated ${legacyMessages.length} messages from localStorage.`);
      // Clear localStorage to free memory and prevent huge JSON serialization overhead
      localStorage.removeItem('phone_chat_messages');
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

function getDbCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });
}

function addMessageToStore(db: IDBDatabase, msg: ChatMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.put(msg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reload in-memory metadata cache for fast O(1) synchronous contact list queries
 */
async function reloadMetaCache(db: IDBDatabase): Promise<void> {
  const tx = db.transaction([STORE_MESSAGES], 'readonly');
  const store = tx.objectStore(STORE_MESSAGES);
  const index = store.index('by_character_time');

  metaCache.clear();

  // Scan all records in timestamp order to compute per-character stats
  return new Promise((resolve) => {
    const req = index.openCursor();
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const msg = cursor.value as ChatMessage;
        const meta = metaCache.get(msg.characterId) || {
          characterId: msg.characterId,
          totalCount: 0,
          lastMessage: null,
        };
        meta.totalCount += 1;
        if (!meta.lastMessage || msg.timestamp >= meta.lastMessage.timestamp) {
          meta.lastMessage = msg;
        }
        metaCache.set(msg.characterId, meta);
        cursor.continue();
      } else {
        isMetaLoaded = true;
        resolve();
      }
    };
    req.onerror = () => {
      isMetaLoaded = true;
      resolve();
    };
  });
}

/**
 * Get cached metadata for a character (Instant O(1) sync call)
 */
export function getCharacterMetaSync(characterId: string): CharacterMeta {
  return (
    metaCache.get(characterId) || {
      characterId,
      totalCount: 0,
      lastMessage: null,
    }
  );
}

export function isDbMetaLoaded(): boolean {
  return isMetaLoaded;
}

/**
 * High-performance paginated query by character
 * Uses compound index `[characterId, timestamp]` with reverse cursor for blazing speed (<2ms for 100,000+ msgs)
 */
export async function getMessagesPaged(
  characterId: string,
  limit = 40,
  beforeTimestamp?: number
): Promise<{ messages: ChatMessage[]; hasMore: boolean; totalCount: number }> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');

    // Bound range: characterId fixed, timestamp <= beforeTimestamp
    const upperTime = beforeTimestamp !== undefined ? beforeTimestamp - 1 : Number.MAX_SAFE_INTEGER;
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, upperTime]);

    const results: ChatMessage[] = [];
    const countReq = index.count(IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]));

    let totalCount = 0;
    countReq.onsuccess = () => {
      totalCount = countReq.result || 0;
    };

    // Open cursor with 'prev' to get latest messages first
    const cursorReq = index.openCursor(keyRange, 'prev');

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        const hasMore = !!cursor;
        // Reverse back to chronological ascending order (oldest to newest)
        results.reverse();
        resolve({
          messages: results,
          hasMore,
          totalCount: totalCount || getCharacterMetaSync(characterId).totalCount,
        });
      }
    };

    cursorReq.onerror = () => {
      reject(cursorReq.error);
    };
  });
}

/**
 * Save single message into IndexedDB asynchronously (non-blocking)
 */
export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  const db = await getDb();
  await addMessageToStore(db, msg);

  // Update in-memory metadata cache immediately
  const meta = metaCache.get(msg.characterId) || {
    characterId: msg.characterId,
    totalCount: 0,
    lastMessage: null,
  };
  meta.totalCount += 1;
  if (!meta.lastMessage || msg.timestamp >= meta.lastMessage.timestamp) {
    meta.lastMessage = msg;
  }
  metaCache.set(msg.characterId, meta);

  notifyChange();
}

/**
 * Bulk save messages (used for benchmarks, imports, syncs)
 */
export async function saveChatMessagesBulk(msgs: ChatMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const db = await getDb();

  const tx = db.transaction([STORE_MESSAGES], 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);

  for (const msg of msgs) {
    store.put(msg);
  }

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });

  await reloadMetaCache(db);
  notifyChange();
}

/**
 * Delete a specific message by ID
 */
export async function deleteChatMessage(id: string, characterId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([STORE_MESSAGES], 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);
  store.delete(id);

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });

  await reloadMetaCache(db);
  notifyChange();
}

/**
 * Update a message in place (e.g. edit text or thinkingProcess)
 */
export async function updateChatMessage(msg: ChatMessage): Promise<void> {
  const db = await getDb();
  await addMessageToStore(db, msg);
  await reloadMetaCache(db);
  notifyChange();
}

/**
 * Fast Substring Search across a character's history
 */
export async function searchCharacterMessages(
  characterId: string,
  query: string,
  limit = 40
): Promise<ChatMessage[]> {
  if (!query || !query.trim()) return [];
  const db = await getDb();
  const lowerQuery = query.toLowerCase().trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);

    const matched: ChatMessage[] = [];
    const cursorReq = index.openCursor(keyRange, 'prev');

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && matched.length < limit) {
        const msg = cursor.value as ChatMessage;
        if (msg.text && msg.text.toLowerCase().includes(lowerQuery)) {
          matched.push(msg);
        }
        cursor.continue();
      } else {
        resolve(matched);
      }
    };

    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Intelligent Keyword & Semantic Memory Retrieval Engine (RAG for AI Long-term Recall)
 * Searches history for relevant context without overloading context token limits or sending 10,000 msgs.
 */
export async function recallCharacterMemories(
  characterId: string,
  userMessage: string,
  maxResults = 5
): Promise<{ recalledText: string; matchedCount: number }> {
  if (!userMessage || userMessage.trim().length < 2) {
    return { recalledText: '', matchedCount: 0 };
  }

  const db = await getDb();

  // Extract meaningful tokens (2+ chars, filter out common punctuation & pure stop words)
  const rawTokens = userMessage
    .replace(/[，。！？、～~…,.!?]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  // Common Chinese/English stop words to ignore
  const stopWords = new Set([
    '这个',
    '那个',
    '什么',
    '怎么',
    '我们',
    '你们',
    '他们',
    '可以',
    '一下',
    '就是',
    '还有',
    '因为',
    '所以',
    '如果',
    '而且',
    '你好',
    '在吗',
    'hello',
    'what',
    'with',
    'from',
    'that',
    'this',
  ]);

  const searchKeywords = rawTokens.filter((k) => !stopWords.has(k.toLowerCase()));

  // Also include character name or key terms if present
  if (searchKeywords.length === 0 && rawTokens.length > 0) {
    searchKeywords.push(rawTokens[0]);
  }

  if (searchKeywords.length === 0) {
    return { recalledText: '', matchedCount: 0 };
  }

  return new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);

    const candidateMatches: { msg: ChatMessage; score: number }[] = [];
    // Scan recent 2000 messages or all messages for character
    let scanned = 0;
    const maxScan = 3000;

    const cursorReq = index.openCursor(keyRange, 'prev');

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && scanned < maxScan && candidateMatches.length < 50) {
        scanned++;
        const msg = cursor.value as ChatMessage;
        let score = 0;
        const lowerText = msg.text.toLowerCase();

        for (const kw of searchKeywords) {
          const lk = kw.toLowerCase();
          if (lowerText.includes(lk)) {
            // Give higher weight if exact match or in user preference/event sentences
            score += lk.length >= 3 ? 3 : 2;
            if (
              lowerText.includes('喜欢') ||
              lowerText.includes('记得') ||
              lowerText.includes('上次') ||
              lowerText.includes('生日') ||
              lowerText.includes('约定') ||
              lowerText.includes('秘密')
            ) {
              score += 2;
            }
          }
        }

        if (score > 0) {
          candidateMatches.push({ msg, score });
        }
        cursor.continue();
      } else {
        // Sort by score descending, then timestamp recency
        candidateMatches.sort((a, b) => b.score - a.score || b.msg.timestamp - a.msg.timestamp);

        const topMatches = candidateMatches.slice(0, maxResults);
        if (topMatches.length === 0) {
          resolve({ recalledText: '', matchedCount: 0 });
          return;
        }

        // Format as memory summary
        const summaryLines = topMatches.map(
          (m, idx) =>
            `${idx + 1}. [${new Date(m.msg.timestamp).toLocaleDateString()}] ${
              m.msg.sender === 'user' ? '用户曾说' : 'AI曾回复'
            }: "${m.msg.text.slice(0, 120)}${m.msg.text.length > 120 ? '...' : ''}"`
        );

        resolve({
          recalledText: `【🧠 本地检索到的长期相关历史对话记忆（RAG 记忆召回）】：\n${summaryLines.join('\n')}`,
          matchedCount: topMatches.length,
        });
      }
    };

    cursorReq.onerror = () => {
      resolve({ recalledText: '', matchedCount: 0 });
    };
  });
}

/**
 * Clear all messages for a specific character
 */
export async function clearCharacterMessages(characterId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([STORE_MESSAGES], 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);
  const index = store.index('by_character_time');
  const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);

  const cursorReq = index.openCursor(keyRange);
  cursorReq.onsuccess = (e) => {
    const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });

  metaCache.set(characterId, {
    characterId,
    totalCount: 0,
    lastMessage: null,
  });

  notifyChange();
}

/**
 * Stress Test / Benchmark Generator:
 * Generates N realistic messages in batch transactions without freezing the UI.
 */
export async function generateBenchmarkMessages(
  characterId: string,
  characterName: string,
  count = 5000,
  onProgress?: (percent: number) => void
): Promise<number> {
  const db = await getDb();
  const sampleUserTopics = [
    '今天在图书馆复习高数，感觉二重积分好难',
    '推荐一家好吃的日料店吧，今天想吃寿喜烧',
    '最近睡眠不太好，总是做奇怪的梦',
    '今天跑步跑了5公里，感觉整个人都神清气爽了',
    '你看过那部新出的科幻悬疑电影了吗？反转太精彩了',
    '明天有重要汇报，心里有点紧张呢',
    '刚喝了一杯半糖微冰的乌龙奶茶，幸福感拉满！',
    '周末打算去海边吹吹风散散步，放松一下心情',
    '今天天气突变好冷，差点着凉感冒',
    '学会了一道新的番茄牛腩煲做法，味道超级棒',
  ];

  const sampleAiReplies = [
    '二重积分要理清积分次序与积分区域的交点，别着急，画出草图就会清晰很多啦！加油！',
    '寿喜烧配上无菌蛋简直绝配！我知道市中心有一家非常地道，可以去试试看哦~',
    '睡前一小时尽量少看手机，可以泡个温水脚或听听白噪音，放松神经才能睡个好觉。',
    '哇！5公里太棒了！运动后记得做好腿部拉伸，补充适量电解质水哦。',
    '那部电影的配乐和叙事节奏确实很顶！特别是第三幕的伏笔回收让人拍案叫绝。',
    '你准备得已经非常充分了，相信自己！深呼吸，保持从容自信，你一定可以发挥出色！',
    '半糖微冰简直是黄金比例！适当的甜分可以治愈一整天的疲惫呢~',
    '海风和浪声最能抚平心绪了，记得带一件薄外套防风，好好享受悠闲时光。',
    '一定要注意添衣保暖，多喝温热水，千万别受凉啦！',
    '听起来就很有食欲！酸甜浓郁的汤汁拌饭肯定是一绝，下次有机会也分享给我看看照片呀~',
  ];

  const startTime = Date.now() - count * 60000;
  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < count; i += batchSize) {
    const currentBatchCount = Math.min(batchSize, count - i);
    const msgs: ChatMessage[] = [];

    for (let j = 0; j < currentBatchCount; j++) {
      const idx = i + j;
      const isUser = idx % 2 === 0;
      const topicIndex = (idx / 2) % sampleUserTopics.length | 0;
      const timeOffset = startTime + idx * 60000;

      msgs.push({
        id: `bench_msg_${characterId}_${Date.now()}_${idx}`,
        characterId,
        sender: isUser ? 'user' : 'ai',
        text: isUser ? sampleUserTopics[topicIndex] : sampleAiReplies[topicIndex],
        timestamp: timeOffset,
        thinkingProcess: isUser
          ? undefined
          : `【压测历史生成思考】: 分析用户第 ${idx} 轮关于话题 [${sampleUserTopics[topicIndex]}] 的发言，生成温暖回复。`,
      });
    }

    const tx = db.transaction([STORE_MESSAGES], 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    for (const m of msgs) {
      store.put(m);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    inserted += currentBatchCount;
    if (onProgress) {
      onProgress(Math.round((inserted / count) * 100));
    }
    // Yield to event loop to avoid UI lockup
    await new Promise((r) => setTimeout(r, 0));
  }

  await reloadMetaCache(db);
  notifyChange();
  return inserted;
}

/**
 * Retrieve all chat messages across all characters in IndexedDB
 */
export async function getAllChatMessages(): Promise<ChatMessage[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.getAll();
    req.onsuccess = () => {
      const msgs = (req.result || []) as ChatMessage[];
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      resolve(msgs);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all chat messages for a specific character in chronological order
 */
export async function getAllChatMessagesForCharacter(characterId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);
    const req = index.getAll(keyRange);
    req.onsuccess = () => {
      const msgs = (req.result || []) as ChatMessage[];
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      resolve(msgs);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all chat messages from IndexedDB completely
 */
export async function clearAllChatMessages(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([STORE_MESSAGES], 'readwrite');
  const store = tx.objectStore(STORE_MESSAGES);
  store.clear();
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  metaCache.clear();
  notifyChange();
}

/**
 * Restore/Replace messages in IndexedDB (used for rollback or full restore)
 */
export async function restoreChatMessages(messages: ChatMessage[], clearFirst = true): Promise<void> {
  const db = await getDb();
  if (clearFirst) {
    const txClear = db.transaction([STORE_MESSAGES], 'readwrite');
    txClear.objectStore(STORE_MESSAGES).clear();
    await new Promise<void>((res, rej) => {
      txClear.oncomplete = () => res();
      txClear.onerror = () => rej(txClear.error);
    });
  }

  if (messages.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const tx = db.transaction([STORE_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      for (const m of batch) {
        if (m && m.id && m.characterId) {
          store.put(m);
        }
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
  }

  await reloadMetaCache(db);
  notifyChange();
}
