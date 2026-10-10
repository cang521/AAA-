import { ChatMessage } from '../../types';
import { getDb, saveChatMessagesBulk } from '../chatDb';
import { deduplicateMessages } from '../dataManagement';
import {
  parseAdaptiveJsonStructure,
  repairAndExtractCorruptedJson,
  normalizeAdaptiveItem,
  FieldMappingRule,
} from './AdaptiveFileParser';

export interface RecentChatSyncResult {
  hasChatMessages: boolean; // Whether the files contain any valid raw chat messages
  totalExtracted: number; // Total valid raw messages extracted across all files (真实提取成功)
  windowTotalCount: number; // Number of valid messages falling inside the 7-day window (处于最后七天窗口内)
  syncedCount: number; // Newly added messages to ChatDB (实际新增恢复)
  skippedCount: number; // Already existed messages skipped (已存在而跳过)
  unrecognizedCount: number; // Messages/lines that failed parsing or had invalid timestamps (无法识别)
  latestMessageTime: number; // conversationEndTime (timestamp of latest valid message in conversation)
  windowStartTime: number; // windowStart (latestMessageTime - 7 * 86400000)
  formattedRange?: string; // Human readable start ~ end date string
  formattedEndTime?: string; // Formatted conversationEndTime
  formattedStartTime?: string; // Formatted windowStartTime
  explanation?: string; // Detailed reason / audit trail
}

/**
 * Robust date parser for raw chat timestamps.
 * Supports:
 * - Millisecond timestamp (number or string, 13 digits)
 * - Second timestamp (10 digits, e.g. 1700000000 -> * 1000)
 * - Microsecond timestamp (16 digits -> / 1000)
 * - Nanosecond timestamp (19 digits -> / 1e6)
 * - ISO-8601 with or without timezone / Z offset
 * - Standard "YYYY-MM-DD HH:mm:ss", "YYYY/MM/DD HH:mm", "YYYY.MM.DD HH:mm:ss"
 * - Chinese date formats "YYYY年MM月DD日 HH:mm:ss", "YYYY年MM月DD日 上午/下午 HH:mm:ss"
 * 
 * Rules:
 * - Never converts millisecond numbers to double timezones
 * - If string already has Z or explicit offset (+08:00), Date.parse preserves it
 * - If string has no timezone, interprets as local date string
 * - Returns null if unparseable; NEVER hallucinates or falls back to Date.now()
 */
export function parseReliableTimestamp(raw: any): number | null {
  if (raw === null || raw === undefined) return null;

  // 1. Numeric timestamps
  if (typeof raw === 'number') {
    if (isNaN(raw) || raw <= 0) return null;
    let ts = raw;
    // Nanoseconds (19 digits e.g. 1759924661288000000)
    if (ts > 1e17) {
      ts = Math.round(ts / 1e6);
    } else if (ts > 1e14) {
      // Microseconds (16 digits)
      ts = Math.round(ts / 1e3);
    } else if (ts < 1e10) {
      // Second-based timestamp (10 digits, e.g. 1700000000)
      ts = Math.round(ts * 1000);
    } else {
      ts = Math.round(ts);
    }

    // Sanity check: must be between year 2000 and 2100
    if (ts >= 946684800000 && ts <= 4102444800000) {
      return ts;
    }
    return null;
  }

  // 2. String timestamps
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Pure numeric timestamp encoded in string
    if (/^\d{10,19}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (trimmed.length === 10) return num * 1000;
      if (trimmed.length >= 17) return Math.round(num / 1e6);
      if (trimmed.length >= 15) return Math.round(num / 1e3);
      if (num >= 946684800000 && num <= 4102444800000) {
        return num;
      }
      return null;
    }

    // Chinese date formatting: e.g. 2026年09月07日 14:22:30 or 2026年9月7日 14:22
    let normalized = trimmed
      .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日?/, '$1-$2-$3')
      .replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/, '$1-$2-$3')
      .replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3');

    // Handle "上午" / "下午"
    let isPM = false;
    let hasAMPM = false;
    if (normalized.includes('下午') || normalized.includes('PM') || normalized.includes('pm')) {
      isPM = true;
      hasAMPM = true;
      normalized = normalized.replace(/下午|PM|pm/g, '').trim();
    } else if (normalized.includes('上午') || normalized.includes('AM') || normalized.includes('am')) {
      hasAMPM = true;
      normalized = normalized.replace(/上午|AM|am/g, '').trim();
    }

    // Try standard Date.parse ONLY if no custom AM/PM was stripped
    if (!hasAMPM) {
      const parsed = Date.parse(normalized);
      if (!isNaN(parsed) && parsed >= 946684800000 && parsed <= 4102444800000) {
        return parsed;
      }
    }

    // Explicit regex fallback: "YYYY-MM-DD HH:mm:ss" with optional milliseconds
    const dateMatch = normalized.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?/
    );
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      let hour = parseInt(dateMatch[4], 10);
      if (isPM && hour < 12) hour += 12;
      const minute = parseInt(dateMatch[5], 10);
      const second = dateMatch[6] ? parseInt(dateMatch[6], 10) : 0;
      const ms = dateMatch[7] ? parseInt(dateMatch[7].padEnd(3, '0'), 10) : 0;

      const d = new Date(year, month, day, hour, minute, second, ms);
      const t = d.getTime();
      if (!isNaN(t) && t >= 946684800000 && t <= 4102444800000) {
        return t;
      }
    }
  }

  return null;
}

/**
 * Distinguish raw chat logs from memory dossiers/summaries.
 * Returns true if text is purely persona/settings/summary without dialog records.
 */
function isPureMemoryOrDossier(content: string): boolean {
  const dossierHeaders = ['【角色设定】', '【人设】', '【长期记忆】', '【背景故事】', '【世界书】', '【记忆摘要】'];
  const hasDossierHeader = dossierHeaders.some((h) => content.includes(h));
  // If it has header and NO timestamped lines at all
  const hasTimestamp = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(content) || /\d{10,13}/.test(content);
  return hasDossierHeader && !hasTimestamp;
}

export interface ExtractionResult {
  messages: ChatMessage[];
  unrecognizedCount: number;
}

/**
 * Extract genuine raw chat messages with reliable timestamps from memory file content.
 * Strictly separates:
 * 1. Raw chat transcript / JSON conversations -> Allowed
 * 2. Character persona, world book, summaries, extracted memory chunks -> Skipped
 */
export function extractRawChatMessagesFromFileContent(
  content: string,
  fileName: string,
  characterId: string,
  characterName?: string,
  customRules?: FieldMappingRule
): ExtractionResult {
  if (!content || !content.trim()) return { messages: [], unrecognizedCount: 0 };
  if (isPureMemoryOrDossier(content)) return { messages: [], unrecognizedCount: 0 };

  const extracted: ChatMessage[] = [];
  let unrecognizedCount = 0;
  const trimmed = content.trim();

  // 1. Try parsing JSON format (Level 1: Standard & Level 2: Adaptive Field & Level 3: Corrupted Recovery)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      // Run adaptive parser which handles top-level history, messages, chat, mapping, deep structures
      const adaptiveMsgs = parseAdaptiveJsonStructure(parsed, characterId, characterName, customRules);
      if (adaptiveMsgs && adaptiveMsgs.length > 0) {
        return { messages: adaptiveMsgs, unrecognizedCount };
      }

      extractFromJsonStructure(parsed, characterId, extracted);
      if (extracted.length > 0) {
        return { messages: extracted, unrecognizedCount };
      }
    } catch {
      // Level 3: Local fault-tolerant repair for corrupted / partial JSON
      const repaired = repairAndExtractCorruptedJson(trimmed, characterId, characterName, customRules);
      if (repaired.messages && repaired.messages.length > 0) {
        return { messages: repaired.messages, unrecognizedCount: repaired.repairedCount > 0 ? 0 : 1 };
      }
    }
  }

  // 2. Try JSONL / Line-by-line JSON
  const lines = trimmed.split('\n');
  const jsonlTemp: ChatMessage[] = [];

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('{') && l.endsWith('}')) {
      try {
        const obj = JSON.parse(l);
        const itemMsg =
          normalizeAdaptiveItem(obj, characterId, characterName, customRules) ||
          normalizeRawMessageItem(obj, characterId);
        if (itemMsg) {
          jsonlTemp.push(itemMsg);
        } else {
          unrecognizedCount++;
        }
      } catch {
        unrecognizedCount++;
      }
    }
  }

  if (jsonlTemp.length > 0) {
    return { messages: jsonlTemp, unrecognizedCount };
  }

  // 3. Try parsing Transcript Lines with timestamps
  // Pattern A: [2026-09-20 12:00:00] Sender: message OR 2026-09-20 12:00:00 Sender: message
  const timestampLineRegexA = /^(\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]\d{1,2}:\d{1,2}(?::\d{1,2})?)\]?\s*)(?:\[([^\]]+)\]|([^:：\n\r]{1,20}))[:：]\s*(.+)$/;
  // Pattern B: Sender [2026-09-20 12:00:00]: message OR Sender 2026-09-20 12:00:00: message
  const timestampLineRegexB = /^([^:：\n\r\(\[]+?)[\s\(\[]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]\d{1,2}:\d{1,2}(?::\d{1,2})?)[\)\]]?[:：\s]\s*(.+)$/;

  let currentMsg: ChatMessage | null = null;
  let lineMsgIndex = 0;

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    const mA = l.match(timestampLineRegexA);
    const mB = !mA ? l.match(timestampLineRegexB) : null;

    if (mA || mB) {
      if (currentMsg) {
        extracted.push(currentMsg);
        currentMsg = null;
      }

      const rawTimeStr = mA ? mA[2] : mB![2];
      const parsedTs = parseReliableTimestamp(rawTimeStr);

      if (parsedTs !== null) {
        const rawSender = (mA ? mA[3] || mA[4] : mB![1]).trim();
        const text = (mA ? mA[5] : mB![3]).trim();

        const isUser =
          rawSender.includes('我') ||
          rawSender.toLowerCase().includes('user') ||
          rawSender.toLowerCase().includes('me') ||
          rawSender.includes('用户');

        currentMsg = {
          id: `msg_sync_${parsedTs}_${lineMsgIndex++}`,
          characterId,
          sender: isUser ? 'user' : 'ai',
          text,
          timestamp: parsedTs,
        };
      } else {
        unrecognizedCount++;
      }
    } else if (currentMsg) {
      // Multi-line continuation of preceding chat message
      currentMsg.text += '\n' + l;
    }
  }

  if (currentMsg) {
    extracted.push(currentMsg);
  }

  return { messages: extracted, unrecognizedCount };
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
 * conversationEndTime = 所有有效原始消息中的真实最大 timestamp (绝不使用当前时间或导入时间！)
 * windowStart = conversationEndTime - 7 * 24 * 60 * 60 * 1000
 * windowStart <= message.timestamp <= conversationEndTime
 */
export function filterLast7DaysChatMessages(messages: ChatMessage[]): {
  filtered: ChatMessage[];
  latestMessageTime: number;
  windowStartTime: number;
} {
  if (!messages || messages.length === 0) {
    return { filtered: [], latestMessageTime: 0, windowStartTime: 0 };
  }

  // 1. Find max timestamp among valid messages (conversationEndTime)
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
  // Sort by timestamp ascending (chronological order)
  const filtered = messages
    .filter((m) => m.timestamp >= windowStartTime && m.timestamp <= latestMessageTime)
    .sort((a, b) => a.timestamp - b.timestamp);

  return { filtered, latestMessageTime, windowStartTime };
}

/**
 * Synchronize the extracted 7-day chat messages directly into ChatDB IndexedDB.
 * Deduplicates with existing messages and triggers UI notifications.
 * Pure database operation, ZERO AI calls.
 */
export async function syncRecentChatMessagesToChatDb(
  characterId: string,
  rawMessages: ChatMessage[],
  unrecognizedCount = 0
): Promise<RecentChatSyncResult> {
  if (!rawMessages || rawMessages.length === 0) {
    return {
      hasChatMessages: false,
      totalExtracted: 0,
      windowTotalCount: 0,
      syncedCount: 0,
      skippedCount: 0,
      unrecognizedCount,
      latestMessageTime: 0,
      windowStartTime: 0,
      explanation: '该文件未包含可恢复的原始聊天记录，无法自动还原最近七天的真实对话。请导入包含原始消息的聊天记录文件。',
    };
  }

  const { filtered, latestMessageTime, windowStartTime } = filterLast7DaysChatMessages(rawMessages);

  const startFormatted = new Date(windowStartTime).toLocaleString();
  const endFormatted = new Date(latestMessageTime).toLocaleString();
  const formattedRange = `${new Date(windowStartTime).toLocaleDateString()} ~ ${new Date(latestMessageTime).toLocaleDateString()}`;

  if (filtered.length === 0) {
    return {
      hasChatMessages: true,
      totalExtracted: rawMessages.length,
      windowTotalCount: 0,
      syncedCount: 0,
      skippedCount: 0,
      unrecognizedCount,
      latestMessageTime,
      windowStartTime,
      formattedRange,
      formattedEndTime: endFormatted,
      formattedStartTime: startFormatted,
      explanation: `成功解析 ${rawMessages.length} 条原始记录，但时间均早于原始对话结束前 7 天窗口。`,
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
  const skippedCount = filtered.length - toInsert.length;

  if (toInsert.length > 0) {
    await saveChatMessagesBulk(toInsert, { isImported: true });
  }

  let explanation = '';
  if (toInsert.length === 0 && skippedCount > 0) {
    explanation = `结束前 7 天窗口内共有 ${filtered.length} 条消息，但此前均已存在于聊天记录中，已自动跳过重复添加。`;
  } else if (toInsert.length === 1) {
    if (filtered.length === 1 && rawMessages.length > 1) {
      explanation = `原始记录共提取出 ${rawMessages.length} 条对话，但仅有 1 条处于最后对话结束时间前 7 天窗口内（其余 ${rawMessages.length - 1} 条消息早于该窗口），因此仅恢复此 1 条。`;
    } else if (filtered.length > 1 && skippedCount > 0) {
      explanation = `结束前 7 天窗口内共有 ${filtered.length} 条消息，其中 ${skippedCount} 条已存在而跳过，实际新增恢复 1 条。`;
    } else {
      explanation = `文件中仅包含 1 条有效历史消息，已成功恢复至微信聊天。`;
    }
  } else {
    explanation = `成功恢复 ${toInsert.length} 条真实历史对话记录。可在微信聊天页面直接查看并继续对话。`;
  }

  return {
    hasChatMessages: true,
    totalExtracted: rawMessages.length,
    windowTotalCount: filtered.length,
    syncedCount: toInsert.length,
    skippedCount,
    unrecognizedCount,
    latestMessageTime,
    windowStartTime,
    formattedRange,
    formattedEndTime: endFormatted,
    formattedStartTime: startFormatted,
    explanation,
  };
}
