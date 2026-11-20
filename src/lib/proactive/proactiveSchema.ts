/**
 * proactiveSchema.ts
 * Strict JSON schema validation & normalization for structured AI proactive responses.
 *
 * Enforces:
 * - action in ['send', 'defer', 'cancel', 'close']
 * - messages: sanitized non-empty string[] (never leaks raw JSON)
 * - pauseProactiveMinutes: 0 or clamped 15..1440 (15 min to 24 hours)
 * - followUpPlan: max 2 steps (default +15m then +60m after previous), each with sanitized non-empty messages[]
 * - followUpAt: optional future timestamp (ms)
 * - eventStatus in ['waiting_for_user', 'scheduled', 'answered', 'completed', 'cancelled']
 */

import {
  ProactiveAction,
  ProactiveEventStatus,
  ProactiveFollowUpStep,
  ProactiveStructuredAction,
  ProactiveStructuredApiResponse,
} from '../../types';
import { sanitizeReplyText } from '../thinkCleaner';

export const AI_PAUSE_MIN_MINUTES = 15;
export const AI_PAUSE_MAX_MINUTES = 24 * 60; // 1440 min (24h)
export const MAX_FOLLOWUP_STEPS = 2;

export interface SchemaValidationResult {
  valid: boolean;
  data?: ProactiveStructuredApiResponse;
  error?: string;
}

const VALID_STRUCTURED_ACTIONS = new Set<ProactiveStructuredAction>(['send', 'defer', 'cancel', 'close']);
const VALID_EVENT_STATUSES = new Set<ProactiveEventStatus>([
  'waiting_for_user',
  'scheduled',
  'answered',
  'completed',
  'cancelled',
]);

/**
 * Clamp AI-supplied pauseProactiveMinutes to 0 or [15, 1440] minutes.
 */
export function clampAiPauseMinutes(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }
  const rounded = Math.round(rawValue);
  return Math.min(AI_PAUSE_MAX_MINUTES, Math.max(AI_PAUSE_MIN_MINUTES, rounded));
}

/**
 * Guard against leaking raw JSON or schema strings directly as chat bubbles.
 */
export function looksLikeRawJsonLeak(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      if (/"(action|followUpPlan|pauseProactiveMinutes|eventStatus|messages)"\s*:/.test(trimmed)) {
        return true;
      }
    }
  }
  if (/```json/i.test(trimmed) || /"(followUpPlan|pauseProactiveMinutes|eventStatus)"\s*:/.test(trimmed)) {
    return true;
  }
  return false;
}

function sanitizeMessageArray(raw: unknown, maxItems: number = 3): string[] {
  const items: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const clean = sanitizeReplyText(entry).trim();
      if (!clean || looksLikeRawJsonLeak(clean)) continue;
      items.push(clean);
      if (items.length >= maxItems) break;
    }
  } else if (typeof raw === 'string') {
    const clean = sanitizeReplyText(raw).trim();
    if (clean && !looksLikeRawJsonLeak(clean)) {
      const lines = clean
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !looksLikeRawJsonLeak(s));
      items.push(...lines.slice(0, maxItems));
    }
  }
  return items;
}

function parseFollowUpAtMs(raw: unknown, nowMs: number = Date.now()): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let ts: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    ts = raw > 1e12 ? raw : raw * 1000;
  } else if (typeof raw === 'string') {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed)) {
      ts = parsed;
    }
  }
  if (ts === null) return null;
  // Must be at least 5 minutes in the future and at most 7 days in the future
  if (ts < nowMs + 5 * 60000 || ts > nowMs + 7 * 24 * 3600000) {
    return null;
  }
  return ts;
}

function mapAction(rawAction: unknown): ProactiveStructuredAction | null {
  if (typeof rawAction !== 'string') return null;
  const lower = rawAction.trim().toLowerCase();
  if (VALID_STRUCTURED_ACTIONS.has(lower as ProactiveStructuredAction)) {
    return lower as ProactiveStructuredAction;
  }
  // Backward compatibility mapping from legacy actions
  const upper = rawAction.trim().toUpperCase();
  if (upper === 'SEND_NEW' || upper === 'CONTINUE' || upper === 'CHANGE_DIRECTION') return 'send';
  if (upper === 'WAIT') return 'defer';
  if (upper === 'END_EPISODE') return 'close';
  return null;
}

export function mapStructuredToLegacyAction(
  structuredAction: ProactiveStructuredAction,
  priorSentCount: number = 0
): ProactiveAction {
  if (structuredAction === 'send') {
    return priorSentCount > 0 ? 'CONTINUE' : 'SEND_NEW';
  }
  if (structuredAction === 'defer') return 'WAIT';
  return 'END_EPISODE';
}

function normalizeFollowUpPlan(rawPlan: unknown): ProactiveFollowUpStep[] {
  if (!Array.isArray(rawPlan)) return [];
  const steps: ProactiveFollowUpStep[] = [];

  for (let i = 0; i < rawPlan.length && steps.length < MAX_FOLLOWUP_STEPS; i++) {
    const item = rawPlan[i];
    if (!item || typeof item !== 'object') continue;
    const msgs = sanitizeMessageArray((item as any).messages, 2);
    if (msgs.length === 0) continue;

    const idx = steps.length;
    const rawStepId =
      typeof (item as any).stepId === 'string' && (item as any).stepId.trim()
        ? (item as any).stepId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
        : `follow_${idx + 1}`;

    if (idx === 0) {
      const rawDelay = Number((item as any).delayMinutes);
      const delayMinutes =
        Number.isFinite(rawDelay) && rawDelay >= 5 && rawDelay <= 120 ? Math.round(rawDelay) : 15;
      steps.push({
        stepId: rawStepId || 'follow_1',
        delayMinutes,
        messages: msgs,
        status: 'pending',
      });
    } else {
      const rawAfterPrev = Number(
        (item as any).delayAfterPreviousMinutes ?? (item as any).delayMinutes
      );
      const delayAfterPreviousMinutes =
        Number.isFinite(rawAfterPrev) && rawAfterPrev >= 15 && rawAfterPrev <= 240
          ? Math.round(rawAfterPrev)
          : 60;
      steps.push({
        stepId: rawStepId || 'follow_2',
        delayAfterPreviousMinutes,
        messages: msgs,
        status: 'pending',
      });
    }
  }

  return steps;
}

/**
 * Validate and normalize an already-parsed object OR raw text response from the AI proactive endpoint.
 * On malformed JSON or schema failure, returns { valid: false } so raw JSON is NEVER sent to chat.
 */
export function validateAndNormalizeProactiveResponse(
  rawPayload: unknown,
  nowMs: number = Date.now()
): SchemaValidationResult {
  let obj: any = rawPayload;

  if (typeof rawPayload === 'string') {
    const stripped = rawPayload
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    if (!stripped) {
      return { valid: false, error: 'AI 主动消息返回为空' };
    }
    try {
      obj = JSON.parse(stripped);
    } catch {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (!match) {
        return { valid: false, error: 'AI 主动消息返回非合法 JSON 结构，已安全拦截' };
      }
      try {
        obj = JSON.parse(match[0]);
      } catch {
        return { valid: false, error: 'AI 主动消息 JSON 解析失败，已安全拦截' };
      }
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, error: 'AI 主动消息 JSON 根节点必须为对象' };
  }

  const action = mapAction(obj.structuredAction ?? obj.action);
  if (!action) {
    return { valid: false, error: `无效的 action 字段: ${String(obj.action)}` };
  }

  const messages =
    action === 'send'
      ? sanitizeMessageArray(
          Array.isArray(obj.messages) && obj.messages.length > 0
            ? obj.messages
            : obj.candidateText ?? obj.text,
          3
        )
      : [];

  if (action === 'send' && messages.length === 0) {
    return { valid: false, error: 'action 为 send 但缺少有效非空消息内容（或疑似原始 JSON 泄漏）' };
  }

  const pauseProactiveMinutes = clampAiPauseMinutes(obj.pauseProactiveMinutes);
  const followUpAt = parseFollowUpAtMs(obj.followUpAt, nowMs);
  const followUpPlan = action === 'send' ? normalizeFollowUpPlan(obj.followUpPlan) : [];

  let eventStatus: ProactiveEventStatus;
  if (
    typeof obj.eventStatus === 'string' &&
    VALID_EVENT_STATUSES.has(obj.eventStatus.trim() as ProactiveEventStatus)
  ) {
    eventStatus = obj.eventStatus.trim() as ProactiveEventStatus;
  } else if (action === 'send') {
    eventStatus = followUpPlan.length > 0 ? 'waiting_for_user' : 'completed';
  } else if (action === 'defer') {
    eventStatus = followUpAt ? 'scheduled' : 'waiting_for_user';
  } else if (action === 'cancel') {
    eventStatus = 'cancelled';
  } else {
    eventStatus = 'completed';
  }

  const intent =
    typeof obj.intent === 'string' && obj.intent.trim()
      ? obj.intent.trim().slice(0, 80)
      : action === 'send'
      ? '主动关怀'
      : action;

  return {
    valid: true,
    data: {
      action,
      messages,
      pauseProactiveMinutes,
      followUpPlan,
      followUpAt,
      eventStatus,
      intent,
      topic: typeof obj.topic === 'string' ? obj.topic.trim() : undefined,
      inferredUserState:
        typeof obj.inferredUserState === 'string' ? obj.inferredUserState.trim() : undefined,
      decisionSummary:
        typeof obj.decisionSummary === 'string' ? obj.decisionSummary.trim() : undefined,
      suggestedNextAction:
        typeof obj.suggestedNextAction === 'string' ? obj.suggestedNextAction.trim() : undefined,
      thinkingProcess:
        typeof obj.thinkingProcess === 'string' ? obj.thinkingProcess : undefined,
    },
  };
}
