import { ChatMessage } from '../../types';
import { getDb, saveChatMessagesBulk } from '../chatDb';
import { deduplicateMessages } from '../dataManagement';

export interface RecentChatSyncResult {
  totalExtracted: number;
  syncedCount: number;
  latestMessageTime: number;
  windowStartTime: number;
  formattedRange?: string;
}

/**
 * Robust date parser for raw chat timestamps.
 * Supports:
 * - Millisecond timestamp (number or string)
 * - Second timestamp (10 digits)
 * - ISO-8601 with or without timezone / Z offset
 * - Standard "YYYY-MM-DD HH:mm:ss" or "YYYY/MM/DD HH:mm"
 * 
 * Rules:
 * - Never converts millisecond numbers to double timezones
 * - If string already has Z or explicit offset (+08:00), Date.parse preserves it
 * - If string has no timezone, interprets as local date string
 * - Returns null if unparseable; never hallucinates or falls back to Date.now()
 */
export function parseReliableTimestamp(raw: any): number | null {
  if (raw === null || raw === undefined) return null;

  // 1. Numeric timestamps
  if (typeof raw === 'number') {
    if (isNaN(raw) || raw <= 0) return null;
    // Check if second-based timestamp (e.g. 1700000000 is year 2023 in seconds)
    if (raw < 10000000000) {
      return Math.round(raw * 1000);
    }
    return Math.round(raw);
  }

  // 2. String timestamps
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Numeric in string form
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (trimmed.length === 10) return num * 1000;
      return num;
    }

    // Replace dots with dashes for date format YYYY.MM.DD
    const normalized = trimmed.replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/, '$1-$2-$3');

    // Check ISO or standard date string
    const parsed = Date.parse(normalized);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    // Try parsing "YYYY-MM-DD HH:mm:ss" with space
    const dateMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      const hour = parseInt(dateMatch[4], 10);
      const minute = parseInt(dateMatch[5], 10);
      const second = dateMatch[6] ? parseInt(dateMatch[6], 10) : 0;

      const d = new Date(year, month, day, hour, minute, second);
      const t = d.getTime();
      if (!isNaN(t) && t > 0) return t;
    }
  }

  return null;
}

/**
 * Extract genuine raw chat messages with reliable timestamps from memory file content.
 * Does NOT treat memory summaries, character personas, or chunked text as chat messages.
 */
export function extractRawChatMessagesFromFileContent(
  content: string,
  fileName: string,
  characterId: string
): ChatMessage[] {
  if (!content || !content.trim()) return [];

  const extracted: ChatMessage[] = [];
  const trimmed = content.trim();

  // 1. Try parsing JSON format
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      extractFromJsonStructure(parsed, characterId, extracted);
      if (extracted.length > 0) {
        return extracted;
      }
    } catch {
      // Not pure valid JSON, fall through
    }
  }

  // 2. Try JSONL / Line-by-line JSON
  const lines = trimmed.split('\n');
  let validJsonlCount = 0;
  const jsonlTemp: ChatMessage[] = [];

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('{') && l.endsWith('}')) {
      try {
        const obj = JSON.parse(l);
        const itemMsg = normalizeRawMessageItem(obj, characterId);
        if (itemMsg) {
          jsonlTemp.push(itemMsg);
          validJsonlCount++;
        }
      } catch {
        // ignore
      }
    }
  }

  if (validJsonlCount >= 2 && validJsonlCount >= lines.length * 0.4) {
    return jsonlTemp;
  }

  // 3. Try parsing Transcript Lines with timestamps
  // Format: [2026-09-20 12:00:00] Sender: message OR 2026-09-20 12:00:00 Sender: message
  const timestampLineRegex = /^(\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]\d{1,2}:\d{1,2}(?::\d{1,2})?)\]?\s*)(?:\[([^\]]+)\]|([^:：\n\r]{1,20}))[:：]\s*(.+)$/;

  let currentMsg: ChatMessage | null = null;
  let lineMsgIndex = 0;

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    const m = l.match(timestampLineRegex);
    if (m) {
      if (currentMsg) {
        extracted.push(currentMsg);
        currentMsg = null;
      }

      const rawTimeStr = m[2];
      const parsedTs = parseReliableTimestamp(rawTimeStr);
      // Strictly require a valid, reliable timestamp!
      if (parsedTs !== null) {
        const senderName = (m[3] || m[4] || '').trim();
        const text = (m[5] || '').trim();

        const isUser =
          senderName.includes('我') ||
          senderName.toLowerCase().includes('user') ||
          senderName.toLowerCase().includes('me') ||
          senderName.includes('用户');

        currentMsg = {
          id: `msg_sync_${parsedTs}_${lineMsgIndex++}`,
          characterId,
          sender: isUser ? 'user' : 'ai',
          text,
          timestamp: parsedTs,
        };
      }
    } else if (currentMsg) {
      // Continuation line of multi-line message
      currentMsg.text += '\n' + l;
    }
  }

  if (currentMsg) {
    extracted.push(currentMsg);
  }

  return extracted;
}

/**
 * Traverse JSON structure (ChatGPT exports, Discord logs, SillyTavern chat history, VirtualPhone backups)
 */
function extractFromJsonStructure(data: any, characterId: string, out: ChatMessage[]): void {
  if (!data) return;

  // Case A: Top-level messages array { messages: [...] }
  if (Array.isArray(data.messages)) {
    for (const item of data.messages) {
      const msg = normalizeRawMessageItem(item, characterId);
      if (msg) out.push(msg);
    }
    return;
  }

  // Case B: Direct Array [ {...}, {...} ]
  if (Array.isArray(data)) {
    for (const item of data) {
      // Could be OpenAI batch of conversations
      if (item && item.mapping) {
        extractFromOpenAiMapping(item.mapping, characterId, out);
      } else {
        const msg = normalizeRawMessageItem(item, characterId);
        if (msg) out.push(msg);
      }
    }
    return;
  }

  // Case C: OpenAI Single conversation mapping
  if (data.mapping && typeof data.mapping === 'object') {
    extractFromOpenAiMapping(data.mapping, characterId, out);
    return;
  }

  // Case D: Tavern chat log array { chat: [...] }
  if (Array.isArray(data.chat)) {
    for (const item of data.chat) {
      const msg = normalizeRawMessageItem(item, characterId);
      if (msg) out.push(msg);
    }
  }
}

function extractFromOpenAiMapping(mapping: Record<string, any>, characterId: string, out: ChatMessage[]): void {
  for (const [, node] of Object.entries(mapping)) {
    const msg = (node as any)?.message;
    if (!msg || !msg.content?.parts) continue;
    const role = msg.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n').trim();
    if (!text) continue;

    const ts = parseReliableTimestamp(msg.create_time);
    if (ts !== null) {
      out.push({
        id: `msg_sync_gpt_${msg.id || ts}`,
        characterId,
        sender: role === 'user' ? 'user' : 'ai',
        text,
        timestamp: ts,
      });
    }
  }
}

function normalizeRawMessageItem(item: any, characterId: string): ChatMessage | null {
  if (!item || typeof item !== 'object') return null;

  // Text extraction
  const text = item.text || item.content || item.mes || item.message || '';
  if (!text || typeof text !== 'string' || !text.trim()) return null;

  // Timestamp extraction (MUST be valid & reliable)
  const rawTs = item.timestamp ?? item.create_time ?? item.send_time ?? item.time ?? item.createdAt;
  const reliableTs = parseReliableTimestamp(rawTs);
  if (reliableTs === null) {
    // If no reliable timestamp, skip; do not fabricate timestamps!
    return null;
  }

  // Sender classification
  const senderVal = (item.sender || item.role || (item.is_user ? 'user' : '') || (item.isAi ? 'ai' : '')).toLowerCase();
  const isAi =
    senderVal === 'ai' ||
    senderVal === 'assistant' ||
    senderVal === 'bot' ||
    item.is_user === false ||
    item.isAi === true;

  const sender: 'user' | 'ai' = isAi ? 'ai' : 'user';

  return {
    id: item.id || `msg_sync_${characterId}_${reliableTs}_${Math.random().toString(36).slice(2, 6)}`,
    characterId,
    sender,
    text: text.trim(),
    timestamp: reliableTs,
    thinkingProcess: item.thinkingProcess || item.reasoning,
    quoteMessageId: item.quoteMessageId,
  };
}

/**
 * Filter valid messages by 7-day rolling window:
 * [latestMessageTime - 7 * 24 * 60 * 60 * 1000, latestMessageTime]
 */
export function filterLast7DaysChatMessages(messages: ChatMessage[]): {
  filtered: ChatMessage[];
  latestMessageTime: number;
  windowStartTime: number;
} {
  if (!messages || messages.length === 0) {
    return { filtered: [], latestMessageTime: 0, windowStartTime: 0 };
  }

  // 1. Find max timestamp among valid messages
  let latestMessageTime = 0;
  for (const m of messages) {
    if (m.timestamp && m.timestamp > latestMessageTime) {
      latestMessageTime = m.timestamp;
    }
  }

  if (latestMessageTime <= 0) {
    return { filtered: [], latestMessageTime: 0, windowStartTime: 0 };
  }

  // 2. Compute 7-day window
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const windowStartTime = latestMessageTime - SEVEN_DAYS_MS;

  // 3. Filter messages within [windowStartTime, latestMessageTime]
  const filtered = messages
    .filter((m) => m.timestamp >= windowStartTime && m.timestamp <= latestMessageTime)
    .sort((a, b) => a.timestamp - b.timestamp);

  return { filtered, latestMessageTime, windowStartTime };
}

/**
 * Synchronize the extracted 7-day chat messages directly into ChatDB IndexedDB.
 * Deduplicates with existing messages and triggers UI notifications.
 */
export async function syncRecentChatMessagesToChatDb(
  characterId: string,
  rawMessages: ChatMessage[]
): Promise<RecentChatSyncResult> {
  if (!rawMessages || rawMessages.length === 0) {
    return { totalExtracted: 0, syncedCount: 0, latestMessageTime: 0, windowStartTime: 0 };
  }

  const { filtered, latestMessageTime, windowStartTime } = filterLast7DaysChatMessages(rawMessages);

  if (filtered.length === 0) {
    return {
      totalExtracted: rawMessages.length,
      syncedCount: 0,
      latestMessageTime,
      windowStartTime,
    };
  }

  // Query existing messages for this character to ensure idempotence
  const db = await getDb();
  const existingForChar: ChatMessage[] = await new Promise((resolve) => {
    const tx = db.transaction(['messages'], 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('by_character_time');
    const keyRange = IDBKeyRange.bound([characterId, 0], [characterId, Number.MAX_SAFE_INTEGER]);
    const items: ChatMessage[] = [];
    const req = index.openCursor(keyRange);
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    req.onerror = () => resolve([]);
  });

  // Deduplicate against existing ChatDB messages
  const toInsert = deduplicateMessages(existingForChar, filtered);

  if (toInsert.length > 0) {
    await saveChatMessagesBulk(toInsert, { isImported: true });
  }

  const startStr = new Date(windowStartTime).toLocaleDateString();
  const endStr = new Date(latestMessageTime).toLocaleDateString();

  return {
    totalExtracted: rawMessages.length,
    syncedCount: toInsert.length,
    latestMessageTime,
    windowStartTime,
    formattedRange: `${startStr} ~ ${endStr}`,
  };
}
