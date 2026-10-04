/**
 * chatSearchEngine.ts
 * Lightweight, Paginated, Debounced Chat Search Engine with Cursor Iteration
 * Solves Memory Bloat and OOM Crashes on Android WebView when searching large history.
 */

import { getDb } from './chatDb';
import { ChatMessage } from '../types';

export interface LightSearchResult {
  id: string;
  characterId: string;
  sender: 'user' | 'ai' | string;
  text: string;
  timestamp: number;
}

export interface PaginatedSearchResponse {
  results: LightSearchResult[];
  totalMatchCount: number;
  hasMore: boolean;
  taskId: string;
}

const STORE_MESSAGES = 'messages';

let currentActiveTaskId = '';

/**
 * Cancel any ongoing search task
 */
export function cancelActiveSearchTask() {
  currentActiveTaskId = 'cancelled_' + Date.now();
}

/**
 * Paginated Cursor-based Chat History Substring Search (Zero Memory Spike)
 */
export async function searchCharacterMessagesPaginated(
  characterId: string,
  query: string,
  offset = 0,
  limit = 20,
  taskId?: string
): Promise<PaginatedSearchResponse> {
  const activeTask = taskId || 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  if (!taskId) {
    currentActiveTaskId = activeTask;
  }

  if (!query || !query.trim()) {
    return { results: [], totalMatchCount: 0, hasMore: false, taskId: activeTask };
  }

  const db = await getDb();
  const lowerQuery = query.toLowerCase().trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);

    const results: LightSearchResult[] = [];
    let matchCounter = 0;
    let skippedCounter = 0;

    const cursorReq = index.openCursor(keyRange, 'prev');

    cursorReq.onsuccess = (e) => {
      // Task cancellation check
      if (currentActiveTaskId !== activeTask) {
        resolve({ results: [], totalMatchCount: 0, hasMore: false, taskId: activeTask });
        return;
      }

      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const msg = cursor.value;
        const msgText = msg.text || '';

        if (msgText && msgText.toLowerCase().includes(lowerQuery)) {
          matchCounter++;

          if (skippedCounter < offset) {
            skippedCounter++;
          } else if (results.length < limit) {
            // Push ONLY light fields (Strip heavy image data URLs completely!)
            results.push({
              id: msg.id,
              characterId: msg.characterId,
              sender: msg.sender,
              text: msgText,
              timestamp: msg.timestamp,
            });
          }
        }

        // Keep cursor scanning up to a reasonable match limit or end of cursor
        if (results.length < limit || matchCounter < offset + limit + 100) {
          cursor.continue();
        } else {
          resolve({
            results,
            totalMatchCount: matchCounter,
            hasMore: true,
            taskId: activeTask,
          });
        }
      } else {
        resolve({
          results,
          totalMatchCount: matchCounter,
          hasMore: false,
          taskId: activeTask,
        });
      }
    };

    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Get a specific target message and surrounding context (e.g. 25 messages before and 25 after)
 * Used when jumping to a search result position in chat view.
 */
export async function getMessageWithSurroundingContext(
  characterId: string,
  targetMsgId: string,
  contextSize = 25
): Promise<{ messages: ChatMessage[]; targetMsgIndex: number }> {
  const db = await getDb();

  // 1. Fetch target message
  const targetMsg: ChatMessage | null = await new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const req = store.get(targetMsgId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });

  if (!targetMsg) {
    return { messages: [], targetMsgIndex: -1 };
  }

  const targetTs = targetMsg.timestamp;

  // 2. Fetch older messages before targetTs
  const olderMessages: ChatMessage[] = await new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const range = IDBKeyRange.bound([characterId, 0], [characterId, Math.max(0, targetTs - 1)]);

    const items: ChatMessage[] = [];
    const cursorReq = index.openCursor(range, 'prev');

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && items.length < contextSize) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        items.reverse(); // Chronological ascending
        resolve(items);
      }
    };
    cursorReq.onerror = () => resolve([]);
  });

  // 3. Fetch newer messages after targetTs
  const newerMessages: ChatMessage[] = await new Promise((resolve) => {
    const tx = db.transaction([STORE_MESSAGES], 'readonly');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index('by_character_time');
    const range = IDBKeyRange.bound([characterId, targetTs + 1], [characterId, Number.MAX_SAFE_INTEGER]);

    const items: ChatMessage[] = [];
    const cursorReq = index.openCursor(range, 'next');

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && items.length < contextSize) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorReq.onerror = () => resolve([]);
  });

  const combinedMessages = [...olderMessages, targetMsg, ...newerMessages];
  const targetMsgIndex = olderMessages.length;

  return { messages: combinedMessages, targetMsgIndex };
}
