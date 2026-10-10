import { ChatMessage } from '../../types';
import { parseReliableTimestamp } from './RecentChatSyncManager';

export interface FieldMappingRule {
  roleField?: string;
  senderField?: string;
  contentField?: string;
  textField?: string;
  timestampField?: string;
  timeField?: string;
  idField?: string;
  userRoleValues?: string[];
  assistantRoleValues?: string[];
  formatDescription?: string;
}

export interface AdaptiveParseResult {
  messages: ChatMessage[];
  unrecognizedCount: number;
  formatDescription: string;
  usedAiAssistant?: boolean;
  structureNotes?: string;
}

/**
 * Clean & sanitize text content (remove Base64 data, strip excess headers, normalize encoding)
 * Distinguishes image data and normal chat text without rendering huge Base64 strings.
 */
export function sanitizeMessageContent(rawText: any): { text: string; hasAttachment: boolean; attachmentType?: string } {
  if (rawText === null || rawText === undefined) {
    return { text: '', hasAttachment: false };
  }

  let str = '';
  let hasAttachment = false;
  let attachmentType: string | undefined;

  // Handle array of parts (e.g., OpenAI / Claude / Gemini message parts)
  if (Array.isArray(rawText)) {
    const textParts: string[] = [];
    for (const part of rawText) {
      if (typeof part === 'string') {
        textParts.push(part);
      } else if (part && typeof part === 'object') {
        if (part.type === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
        } else if (part.type === 'image_url' || part.type === 'image' || part.image_url) {
          hasAttachment = true;
          attachmentType = 'image';
          textParts.push('[图片附件]');
        } else if (part.content && typeof part.content === 'string') {
          textParts.push(part.content);
        } else if (part.text && typeof part.text === 'string') {
          textParts.push(part.text);
        }
      }
    }
    str = textParts.join('\n');
  } else if (typeof rawText === 'object') {
    if (rawText.text && typeof rawText.text === 'string') {
      str = rawText.text;
    } else if (rawText.content && typeof rawText.content === 'string') {
      str = rawText.content;
    } else if (rawText.mes && typeof rawText.mes === 'string') {
      str = rawText.mes;
    } else if (rawText.message && typeof rawText.message === 'string') {
      str = rawText.message;
    } else {
      str = JSON.stringify(rawText);
    }
  } else {
    str = String(rawText);
  }

  // Check for inline large Base64 images: data:image/xxx;base64,.....
  if (str.includes('data:image/') || str.includes(';base64,')) {
    hasAttachment = true;
    attachmentType = 'image';
    // Replace huge base64 blocks (>80 chars) with clean placeholder
    str = str.replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{80,}/g, '[图片附件]');
  }

  // Also check standalone huge base64 strings
  if (/^[A-Za-z0-9+/=]{400,}$/.test(str.trim())) {
    hasAttachment = true;
    attachmentType = 'binary_data';
    str = '[图片附件/原始二进制数据]';
  }

  return { text: str.trim(), hasAttachment, attachmentType };
}

/**
 * Level 1 & Level 2: Multi-layer adaptive JSON / Object structure extractor.
 * Searches:
 * - Direct arrays
 * - Top-level keys: history, messages, chat, conversations, records, dialog, list, data...
 * - Deeply nested containers
 * - OpenAI conversation mappings
 * - Custom role & sender variations (role: user/assistant, sender: me/ai, is_user: true/false, etc.)
 */
export function parseAdaptiveJsonStructure(
  data: any,
  characterId: string,
  characterName?: string,
  customRules?: FieldMappingRule
): ChatMessage[] {
  if (!data) return [];

  const out: ChatMessage[] = [];

  // If data specifies a characterName (e.g. Caelum0907.json), use it to recognize AI messages
  const effectiveCharName = (typeof data.characterName === 'string' && data.characterName)
    ? data.characterName
    : (typeof data.character === 'string' && data.character)
      ? data.character
      : characterName;

  // A. If data itself is an array: [ {...}, {...} ]
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && item.mapping) {
        parseOpenAiMapping(item.mapping, characterId, out);
      } else {
        const msg = normalizeAdaptiveItem(item, characterId, effectiveCharName, customRules);
        if (msg) out.push(msg);
      }
    }
    if (out.length > 0) return out;
  }

  // B. Check known chat collection keys in object
  // Specifically supports Caelum0907.json's "history" array!
  const candidateKeys = [
    'history',
    'messages',
    'chat',
    'conversations',
    'dialog',
    'records',
    'chats',
    'items',
    'data',
    'log',
  ];

  for (const k of candidateKeys) {
    if (Array.isArray(data[k])) {
      for (const item of data[k]) {
        const msg = normalizeAdaptiveItem(item, characterId, effectiveCharName, customRules);
        if (msg) out.push(msg);
      }
      if (out.length > 0) return out;
    }
  }

  // C. OpenAI Mapping object { mapping: { ... } }
  if (data.mapping && typeof data.mapping === 'object') {
    parseOpenAiMapping(data.mapping, characterId, out);
    if (out.length > 0) return out;
  }

  // D. Search nested objects for any array of candidate chat messages (Deep Search)
  for (const [, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const ck of candidateKeys) {
        if (Array.isArray((val as any)[ck])) {
          for (const item of (val as any)[ck]) {
            const msg = normalizeAdaptiveItem(item, characterId, effectiveCharName, customRules);
            if (msg) out.push(msg);
          }
          if (out.length > 0) return out;
        }
      }
    }
  }

  return out;
}

/**
 * Normalizes an arbitrary message object into a pristine ChatMessage.
 * Distinguishes user, ai, and ignores system/memory/dossier events.
 */
export function normalizeAdaptiveItem(
  item: any,
  characterId: string,
  characterName?: string,
  customRules?: FieldMappingRule
): ChatMessage | null {
  if (!item || typeof item !== 'object') return null;

  // 1. Extract Role / Sender
  const rawRole = (
    (customRules?.roleField && item[customRules.roleField]) ||
    (customRules?.senderField && item[customRules.senderField]) ||
    item.role ||
    item.sender ||
    item.author ||
    item.speaker ||
    item.from ||
    item.type ||
    ''
  ).toString().toLowerCase().trim();

  // Explicitly ignore system messages, notices, memories, settings
  if (rawRole === 'system' || rawRole === 'notice' || rawRole === 'memory' || rawRole === 'setting' || rawRole === 'event') {
    return null;
  }

  const userRoleValues = customRules?.userRoleValues || ['user', 'human', 'me', '我', '用户', 'sender', 'client'];
  const assistantRoleValues = customRules?.assistantRoleValues || ['assistant', 'ai', 'bot', 'character', 'model', '回复者', '助手'];

  // Add lowercase character name to assistant roles if available
  const charNameLower = (characterName || '').toLowerCase().trim();

  let sender: 'user' | 'ai' = 'user';
  if (item.is_user === true || item.isUser === true) {
    sender = 'user';
  } else if (item.is_user === false || item.isAi === true || item.is_ai === true || item.isBot === true) {
    sender = 'ai';
  } else if (assistantRoleValues.includes(rawRole) || (charNameLower && rawRole === charNameLower)) {
    sender = 'ai';
  } else if (userRoleValues.includes(rawRole)) {
    sender = 'user';
  } else {
    // If rawRole mentions ai, bot, or character
    if (rawRole.includes('ai') || rawRole.includes('bot') || rawRole.includes('assist') || (charNameLower && rawRole.includes(charNameLower))) {
      sender = 'ai';
    } else {
      sender = 'user';
    }
  }

  // 2. Extract Content / Text
  const rawContent =
    (customRules?.contentField && item[customRules.contentField]) ||
    (customRules?.textField && item[customRules.textField]) ||
    item.content ||
    item.text ||
    item.message ||
    item.mes ||
    item.body ||
    item.msg;

  const { text } = sanitizeMessageContent(rawContent);
  if (!text) return null;

  // 3. Extract Timestamp (Strict reliable check - NEVER use Date.now()!)
  const rawTs =
    (customRules?.timestampField && item[customRules.timestampField]) ||
    (customRules?.timeField && item[customRules.timeField]) ||
    item.timestamp ||
    item.time ||
    item.create_time ||
    item.created_at ||
    item.createdAt ||
    item.send_time ||
    item.sendTime ||
    item.date;

  const reliableTs = parseReliableTimestamp(rawTs);
  if (reliableTs === null) {
    return null; // Do NOT fabricate fake timestamp
  }

  const msgId = item.id || item._id || (customRules?.idField && item[customRules.idField]) || `msg_sync_${characterId}_${reliableTs}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id: String(msgId),
    characterId,
    sender,
    text,
    timestamp: reliableTs,
    thinkingProcess: item.thinkingProcess || item.reasoning,
    quoteMessageId: item.quoteMessageId || item.reply_to || item.replyTo,
  };
}

function parseOpenAiMapping(mapping: Record<string, any>, characterId: string, out: ChatMessage[]): void {
  for (const [, node] of Object.entries(mapping)) {
    const msg = (node as any)?.message;
    if (!msg || !msg.content?.parts) continue;
    const role = (msg.author?.role || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    const partsText = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n').trim();
    const { text } = sanitizeMessageContent(partsText);
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

/**
 * Level 3: Local fault-tolerant repair for corrupted / partial JSON.
 * Recovers messages from files that fail standard JSON.parse due to:
 * - File header garbage / BOM / markdown fences
 * - Truncated JSON / unclosed brackets
 * - Stray commas or unescaped quotes/newlines
 * - Large trailing data
 */
export function repairAndExtractCorruptedJson(
  rawContent: string,
  characterId: string,
  characterName?: string,
  customRules?: FieldMappingRule
): { messages: ChatMessage[]; repairedCount: number } {
  const messages: ChatMessage[] = [];
  let repairedCount = 0;

  // 1. Clean wrappers
  let clean = rawContent.replace(/^\uFEFF/, '').trim();
  // Strip markdown code fences if wrapped: ```json ... ```
  clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

  // 2. Tokenize and extract JSON objects with balanced braces
  let i = 0;
  const len = clean.length;

  while (i < len) {
    const openIdx = clean.indexOf('{', i);
    if (openIdx === -1) break;

    // Fast peek to check if this candidate object contains message-like properties
    const peek = clean.slice(openIdx, openIdx + 400);
    const looksLikeMessage =
      peek.includes('"role"') ||
      peek.includes('"sender"') ||
      peek.includes('"content"') ||
      peek.includes('"text"') ||
      peek.includes('"message"') ||
      peek.includes('"mes"');

    let depth = 0;
    let inString = false;
    let isEscaped = false;
    let closeIdx = -1;

    for (let j = openIdx; j < len; j++) {
      const ch = clean[j];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else {
        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            closeIdx = j;
            break;
          }
        }
      }
    }

    if (closeIdx !== -1) {
      if (looksLikeMessage) {
        const candidateStr = clean.slice(openIdx, closeIdx + 1);
        try {
          const obj = JSON.parse(candidateStr);
          if (
            obj &&
            typeof obj === 'object' &&
            (obj.role || obj.sender || obj.content || obj.text || obj.message || obj.mes)
          ) {
            const msg = normalizeAdaptiveItem(obj, characterId, characterName, customRules);
            if (msg) {
              messages.push(msg);
              repairedCount++;
              i = closeIdx + 1;
              continue;
            }
          }
        } catch {
          // Try fixing unescaped newlines inside quotes
          try {
            const fixedStr = candidateStr.replace(/(?<=":[ ]*"[^"]*)\n(?=[^"]*")/g, '\\n');
            const obj = JSON.parse(fixedStr);
            const msg = normalizeAdaptiveItem(obj, characterId, characterName, customRules);
            if (msg) {
              messages.push(msg);
              repairedCount++;
              i = closeIdx + 1;
              continue;
            }
          } catch {
            // ignore
          }
        }
      }
      // If it wasn't a leaf message (e.g. an outer wrapper like { "history": [ ... ),
      // advance past '{' to inspect inner objects
      i = openIdx + 1;
    } else {
      // Unclosed object at the end of file (truncated file)
      if (looksLikeMessage) {
        const truncated = clean.slice(openIdx);
        const attempts = [truncated + '"}', truncated + '}', truncated + '"}}'];
        for (const att of attempts) {
          try {
            const obj = JSON.parse(att);
            const msg = normalizeAdaptiveItem(obj, characterId, characterName, customRules);
            if (msg) {
              messages.push(msg);
              repairedCount++;
              break;
            }
          } catch {
            // continue
          }
        }
      }
      i = openIdx + 1;
    }
  }

  return { messages, repairedCount };
}

/**
 * Extracts a minimal, safe, anonymized structure sample for AI API format analysis.
 * Never includes full conversation logs, personal documents, or base64 attachments.
 */
export function extractSampleForAiAnalysis(content: string): { sampleSnippet: string; fieldKeys: string[] } {
  let sampleSnippet = '';
  const fieldKeys: string[] = [];

  const trimmed = content.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          fieldKeys.push(...Object.keys(parsed[0]));
          sampleSnippet = JSON.stringify(
            parsed.slice(0, 2).map((item) => {
              if (item && typeof item === 'object') {
                const sub: Record<string, any> = {};
                for (const [sk, sv] of Object.entries(item)) {
                  if (typeof sv === 'string' && sv.length > 40) sub[sk] = sv.slice(0, 40) + '...';
                  else sub[sk] = sv;
                }
                return sub;
              }
              return item;
            }),
            null,
            2
          );
        }
      } else {
        fieldKeys.push(...Object.keys(parsed));
        const anonymized: Record<string, any> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) {
            anonymized[k] = v.slice(0, 2).map((item) => {
              if (item && typeof item === 'object') {
                const sub: Record<string, any> = {};
                for (const [sk, sv] of Object.entries(item)) {
                  if (typeof sv === 'string' && sv.length > 40) sub[sk] = sv.slice(0, 40) + '...';
                  else sub[sk] = sv;
                }
                return sub;
              }
              return item;
            });
          } else if (typeof v === 'string' && v.length > 40) {
            anonymized[k] = v.slice(0, 40) + '...';
          } else {
            anonymized[k] = v;
          }
        }
        sampleSnippet = JSON.stringify(anonymized, null, 2);
      }
    }
  } catch {
    // If not JSON, extract first 500 chars with regex cleanup
    sampleSnippet = trimmed
      .slice(0, 500)
      .replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{20,}/g, '[base64 image]');
  }

  return {
    sampleSnippet: sampleSnippet.slice(0, 1500),
    fieldKeys,
  };
}

/**
 * Calls the existing backend endpoint `/api/import/analyze-structure` using user's configured API.
 * Purely asks for field mapping schema, never generates fake chat.
 */
export async function analyzeFileStructureWithAi(
  sampleSnippet: string,
  fieldKeys: string[],
  fileName: string,
  apiConfig?: any
): Promise<FieldMappingRule | null> {
  try {
    const res = await fetch('/api/import/analyze-structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sampleSnippet: sampleSnippet.slice(0, 1500),
        fieldKeys,
        fileName,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.rules) {
      return data.rules as FieldMappingRule;
    }
  } catch (err) {
    console.error('Failed to analyze file structure with AI API:', err);
  }
  return null;
}
