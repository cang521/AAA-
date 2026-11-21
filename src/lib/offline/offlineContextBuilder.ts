/**
 * offlineContextBuilder.ts
 * Dynamic 30 -> up to 60 message context selector for Offline Mode.
 *
 * Rules:
 * 1. Default reads the most recent 30 valid messages (excludes failed/empty messages).
 * 2. If message #30 is still inside an ongoing continuous event (argument, date, intimate moment,
 *    unfinished topic/action, short consecutive time gap), dynamically extends backward up to max 60 messages.
 * 3. NEVER always sends 60 messages (saves tokens when boundary cleanly separates events).
 * 4. Makes ZERO extra model API calls to determine 30 vs 60.
 * 5. Messages earlier than the selected window are bridged via session.contextSummary ("本场前情摘要").
 * 6. Preserves actions, dialogue segments, timestamps, and concise state snapshots in context.
 */

import { OfflineMessage } from './OfflineSessionDb';
import { formatOfflinePromptDateTime } from './offlineTimeFormat';
import { normalizeOfflineSegments, segmentsToPlainText } from './offlineSegments';
import {
  applyOverlengthContextProtection,
  ContextWindowMetrics,
  STANDARD_CONTEXT_LIMIT,
} from '../contextWindow';

export const DEFAULT_OFFLINE_CONTEXT_MIN = STANDARD_CONTEXT_LIMIT;
export const DEFAULT_OFFLINE_CONTEXT_MAX = STANDARD_CONTEXT_LIMIT;

export interface DynamicContextSelection {
  selectedMessages: OfflineMessage[];
  droppedOlderMessages: OfflineMessage[];
  windowSize: number;
  extendedBeyond30: boolean;
  extensionReason?: string;
  earlierSummaryText?: string;
  contextMetrics?: ContextWindowMetrics;
}

const SCENE_BREAK_REGEX = /(第二天|次日|隔天|清晨醒来|转眼到了|睡醒之后|换了个地方|回到家后|过了几个小时|离开这里|结束了这次)/;
const ONGOING_EVENT_REGEX = /(为什么|怎么了|你别|等等|先别走|听我说|抱|吻|靠在|贴近|手心|发抖|呼吸|眼泪|吵|生气|委屈|答应我|还没说完|继续|刚才|继续说|不要停|靠近|耳边|体温)/;

function hasHighEmotionOrIntimateState(msg: OfflineMessage | undefined): boolean {
  const st = msg?.state;
  if (!st || typeof st !== 'object') return false;
  if (st.intimateState?.active) return true;
  if (typeof st.tension === 'number' && st.tension >= 45) return true;
  if (typeof st.blush === 'number' && st.blush >= 45) return true;
  if (typeof st.heartRate === 'number' && st.heartRate >= 100) return true;
  return false;
}

/**
 * Determine whether two adjacent messages (prev -> next) belong to the same ongoing continuous event.
 */
function isContinuousEventLink(prev: OfflineMessage, next: OfflineMessage): { continuous: boolean; reason?: string } {
  const gapMs = Math.max(0, (next.timestamp || 0) - (prev.timestamp || 0));
  const gapMinutes = gapMs / 60000;

  if (gapMinutes > 25) {
    return { continuous: false };
  }
  const combinedNext = `${next.text || ''} ${next.action || ''}`;
  if (SCENE_BREAK_REGEX.test(combinedNext)) {
    return { continuous: false };
  }

  if (hasHighEmotionOrIntimateState(prev) || hasHighEmotionOrIntimateState(next)) {
    return { continuous: true, reason: '情绪/亲密/紧张互动持续中' };
  }
  const combinedPrev = `${prev.text || ''} ${prev.action || ''}`;
  if (ONGOING_EVENT_REGEX.test(combinedPrev) || ONGOING_EVENT_REGEX.test(combinedNext)) {
    return { continuous: true, reason: '连续剧情/争执/动作或未完话题延续中' };
  }
  if (/[？\?]$/.test((prev.text || '').trim())) {
    return { continuous: true, reason: '上一句提问尚未结束' };
  }
  if (gapMinutes <= 8) {
    return { continuous: true, reason: '紧密连续互动（时间间隔<=8分钟）' };
  }

  return { continuous: false };
}

/**
 * Select up to 100 valid offline messages in chronological order, and apply
 * over-length protection (30 raw + up to 70 condensed chronological summary) ONLY when over token budget.
 */
export function selectDynamicOfflineContextMessages(
  allMessages: OfflineMessage[],
  minWindow: number = DEFAULT_OFFLINE_CONTEXT_MIN,
  maxWindow: number = DEFAULT_OFFLINE_CONTEXT_MAX
): DynamicContextSelection {
  const valid = (allMessages || [])
    .filter((m) => m && m.status !== 'failed' && ((m.text && m.text.trim()) || (m.segments && m.segments.length > 0)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const targetLimit = Math.max(minWindow, maxWindow);
  const total = valid.length;
  const candidateStart = Math.max(0, total - targetLimit);
  const droppedOlderMessages = valid.slice(0, candidateStart);
  const candidateMessages = valid.slice(candidateStart);

  // Preserve continuous event check signal cleanly when extending beyond 30
  let extensionReason: string | undefined;
  if (candidateMessages.length > 30) {
    const idx30 = candidateMessages.length - 30;
    const link = isContinuousEventLink(candidateMessages[idx30 - 1], candidateMessages[idx30]);
    extensionReason = link.reason;
  }

  const protection = applyOverlengthContextProtection<OfflineMessage>({
    messages: candidateMessages,
    maxRawLimit: targetLimit,
    formatForEstimate: (m) => ({
      timestamp: m.timestamp,
      senderName: m.sender === 'user' ? '用户' : 'AI',
      text: `${m.action ? `（${m.action}）` : ''}${m.text || ''}`,
    }),
    cloneWithTruncatedText: (m, truncatedText) => ({
      ...m,
      text: truncatedText,
      segments: undefined,
    }),
  });

  return {
    selectedMessages: protection.rawMessages,
    droppedOlderMessages,
    windowSize: protection.rawMessages.length,
    extendedBeyond30: protection.rawMessages.length > 30,
    extensionReason,
    earlierSummaryText: protection.earlierSummaryText,
    contextMetrics: protection.metrics,
  };
}

/**
 * Format a single OfflineMessage for prompt injection, preserving actions, dialogue segments, and concise state snapshot.
 */
export function formatOfflineMessageForPrompt(
  msg: OfflineMessage,
  userName: string,
  characterName: string
): {
  id: string;
  sender: string;
  senderName: string;
  timestamp: number;
  timeStr: string;
  segments: Array<{ type: 'action' | 'dialogue'; text: string }>;
  renderedText: string;
  stateSummary?: string;
} {
  const senderName = msg.sender === 'user' ? userName : msg.sender === 'ai' ? characterName : '系统';
  const segments =
    msg.sender === 'ai'
      ? normalizeOfflineSegments(msg.segments, msg.text, msg.action)
      : [{ type: 'dialogue' as const, text: (msg.text || '').trim() }];

  const renderedText =
    msg.sender === 'ai' ? segmentsToPlainText(segments) : (msg.text || '').trim();

  let stateSummary: string | undefined;
  if (msg.sender === 'ai' && msg.state && typeof msg.state === 'object') {
    const st = msg.state;
    const parts: string[] = [];
    if (typeof st.heartRate === 'number') parts.push(`心率${st.heartRate}`);
    if (st.breathing) parts.push(`呼吸${st.breathing}`);
    if (typeof st.bodyTemp === 'number') parts.push(`体温${st.bodyTemp.toFixed(1)}°C`);
    if (Array.isArray(st.emotion) && st.emotion.length > 0) parts.push(`情绪:${st.emotion.join('/')}`);
    if (st.physicalState) parts.push(`体态:${st.physicalState}`);
    if (st.intimateState?.active && st.intimateState?.physiologicalState) {
      parts.push(`亲密状态:${st.intimateState.physiologicalState}`);
    }
    if (parts.length > 0) {
      stateSummary = parts.join(' | ');
    }
  }

  return {
    id: msg.id,
    sender: msg.sender,
    senderName,
    timestamp: msg.timestamp,
    timeStr: formatOfflinePromptDateTime(msg.timestamp),
    segments,
    renderedText,
    stateSummary,
  };
}

/**
 * Deterministic lightweight summary fallback for messages dropped before the dynamic 30..60 window
 * when session.contextSummary has not yet been updated by the AI.
 * Strictly for in-session prompt continuity (NEVER written to long-term memory).
 */
export function buildSessionRollingFallbackSummary(
  droppedOlderMessages: OfflineMessage[],
  userName: string,
  characterName: string
): string {
  if (!droppedOlderMessages || droppedOlderMessages.length === 0) return '';
  const sample = droppedOlderMessages.slice(-8);
  const bullets = sample.map((m) => {
    const who = m.sender === 'user' ? userName : characterName;
    const snippet = (m.text || '').replace(/\s+/g, ' ').trim().slice(0, 65);
    return `- ${who}: ${snippet}`;
  });
  return `（本场较早经历的 ${droppedOlderMessages.length} 条记录节选衔接）\n${bullets.join('\n')}`;
}
