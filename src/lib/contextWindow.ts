/**
 * contextWindow.ts
 * Unified 100-message context window + over-length protection helper.
 * Pure TypeScript with zero DOM or child_process dependencies so it can be shared
 * between Vite frontend modules and server.ts / Android Node backend.
 *
 * Core Contract:
 * 1. Normal mode: keep up to 100 recent valid messages verbatim (in chronological order).
 * 2. Over-length protection: ONLY when total formatted tokens/characters exceed the safe
 *    model/proxy budget, preserve the latest 30 raw messages verbatim and condense the
 *    earlier up to 70 messages into a chronological timeline summary (ZERO extra API calls).
 * 3. Single oversized message protection: safely truncate any mega-message so a single
 *    long message never crashes a reply turn.
 */

export const STANDARD_CONTEXT_LIMIT = 100;
export const OVERFLOW_RAW_TAIL_LIMIT = 30;
export const OVERFLOW_MAX_EARLIER_SUMMARY = 70;
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 26000;
export const DEFAULT_SINGLE_MESSAGE_MAX_CHARS = 4000;

export interface ContextWindowMetrics {
  totalCandidateCount: number;
  rawCount: number;
  summarizedCount: number;
  didCompress: boolean;
  estimatedTokens: number;
  tokenBudget: number;
}

export interface ProtectedContextResult<T> {
  rawMessages: T[];
  earlierSummaryText: string;
  metrics: ContextWindowMetrics;
}

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount += 1;
    }
  }
  const nonCjkCount = text.length - cjkCount;
  // Conservative token estimate: CJK ~1.5 tokens/char, ASCII/punctuation ~0.35 tokens/char
  return Math.max(1, Math.ceil(cjkCount * 1.5 + nonCjkCount * 0.35));
}

export function truncateSingleMessageText(
  text: string,
  maxChars: number = DEFAULT_SINGLE_MESSAGE_MAX_CHARS
): string {
  const clean = String(text || '');
  if (clean.length <= maxChars) return clean;
  const keep = Math.max(120, maxChars - 24);
  return `${clean.slice(0, keep)}...(已截断过长文本)`;
}

function formatShortTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MM}-${DD} ${hh}:${mm}`;
}

export function summarizeMessagesChronologically<T>(
  items: T[],
  getSummaryMeta: (item: T) => {
    timestamp?: number;
    senderName?: string;
    text: string;
  },
  maxSummaryChars = 6500
): string {
  if (!items || items.length === 0) return '';
  const lines: string[] = [];
  for (const item of items) {
    const meta = getSummaryMeta(item);
    const timeStr = formatShortTime(meta.timestamp);
    const sender = (meta.senderName || '').trim();
    const snippet = String(meta.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110);
    if (!snippet) continue;
    const prefix = [timeStr ? `[${timeStr}]` : '', sender ? `${sender}:` : ''].filter(Boolean).join(' ');
    lines.push(`- ${prefix ? `${prefix} ` : ''}${snippet}`);
  }
  if (lines.length === 0) return '';

  const header = `【较早 ${items.length} 条记录时间线摘要（超长保护自动折叠）】`;
  const joined = `${header}\n${lines.join('\n')}`;
  if (joined.length <= maxSummaryChars) return joined;

  // Keep earliest anchor + most recent lines up to maxSummaryChars so chronology stays clear
  const keptTail: string[] = [];
  let charCount = header.length + 60;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (charCount + line.length + 1 > maxSummaryChars) break;
    keptTail.unshift(line);
    charCount += line.length + 1;
  }
  const omitted = lines.length - keptTail.length;
  return `${header}\n${omitted > 0 ? `(略去最早期 ${omitted} 条次要流水)\n` : ''}${keptTail.join('\n')}`;
}

export function applyOverlengthContextProtection<T>(params: {
  messages: T[];
  formatForEstimate: (item: T) => {
    timestamp?: number;
    senderName?: string;
    text: string;
  };
  maxRawLimit?: number;
  overflowRawTail?: number;
  tokenBudget?: number;
  singleMessageMaxChars?: number;
  cloneWithTruncatedText?: (item: T, truncatedText: string) => T;
}): ProtectedContextResult<T> {
  const maxRawLimit = Math.max(1, params.maxRawLimit ?? STANDARD_CONTEXT_LIMIT);
  const overflowRawTail = Math.max(1, Math.min(maxRawLimit, params.overflowRawTail ?? OVERFLOW_RAW_TAIL_LIMIT));
  const tokenBudget = Math.max(2000, params.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET);
  const singleMessageMaxChars = Math.max(300, params.singleMessageMaxChars ?? DEFAULT_SINGLE_MESSAGE_MAX_CHARS);

  const input = Array.isArray(params.messages) ? params.messages : [];
  const candidateSlice = input.length > maxRawLimit ? input.slice(-maxRawLimit) : [...input];

  const normalized = candidateSlice.map((item) => {
    const meta = params.formatForEstimate(item);
    if (meta.text && meta.text.length > singleMessageMaxChars && params.cloneWithTruncatedText) {
      return params.cloneWithTruncatedText(item, truncateSingleMessageText(meta.text, singleMessageMaxChars));
    }
    return item;
  });

  let totalTokens = 0;
  for (const item of normalized) {
    const meta = params.formatForEstimate(item);
    totalTokens += estimateTextTokens(`${meta.senderName || ''}: ${truncateSingleMessageText(meta.text || '', singleMessageMaxChars)}`);
  }

  // Normal case: all up-to-100 messages fit comfortably within budget
  if (totalTokens <= tokenBudget || normalized.length <= overflowRawTail) {
    // Still guard against a catastrophic 30-or-fewer-message single payload explosion
    if (totalTokens > tokenBudget && normalized.length > 0) {
      const perMsgCap = Math.max(400, Math.floor((tokenBudget * 0.75) / normalized.length));
      const trimmedTail = params.cloneWithTruncatedText
        ? normalized.map((item) => {
            const meta = params.formatForEstimate(item);
            return meta.text.length > perMsgCap
              ? params.cloneWithTruncatedText!(item, truncateSingleMessageText(meta.text, perMsgCap))
              : item;
          })
        : normalized;
      const reEstimated = trimmedTail.reduce((sum, item) => {
        const meta = params.formatForEstimate(item);
        return sum + estimateTextTokens(`${meta.senderName || ''}: ${meta.text || ''}`);
      }, 0);
      return {
        rawMessages: trimmedTail,
        earlierSummaryText: '',
        metrics: {
          totalCandidateCount: input.length,
          rawCount: trimmedTail.length,
          summarizedCount: 0,
          didCompress: false,
          estimatedTokens: reEstimated,
          tokenBudget,
        },
      };
    }

    return {
      rawMessages: normalized,
      earlierSummaryText: '',
      metrics: {
        totalCandidateCount: input.length,
        rawCount: normalized.length,
        summarizedCount: 0,
        didCompress: false,
        estimatedTokens: totalTokens,
        tokenBudget,
      },
    };
  }

  // Over-length protection activated: keep latest 30 raw verbatim, condense earlier up to 70
  const tailRaw = normalized.slice(-overflowRawTail);
  const earlierRaw = normalized.slice(0, normalized.length - tailRaw.length);

  // Reserve ~70% budget for latest 30 raw messages + ~30% for earlier timeline summary
  const summaryBudgetTokens = Math.max(800, Math.floor(tokenBudget * 0.28));
  const maxSummaryChars = Math.min(8000, Math.max(1200, Math.floor(summaryBudgetTokens * 0.65)));

  const earlierSummaryText = summarizeMessagesChronologically(
    earlierRaw,
    params.formatForEstimate,
    maxSummaryChars
  );

  let tailTokens = tailRaw.reduce((sum, item) => {
    const meta = params.formatForEstimate(item);
    return sum + estimateTextTokens(`${meta.senderName || ''}: ${truncateSingleMessageText(meta.text || '', singleMessageMaxChars)}`);
  }, 0);
  const summaryTokens = estimateTextTokens(earlierSummaryText);

  let finalTail = tailRaw;
  // If the latest 30 messages themselves still exceed the remaining budget, proportionally cap mega-messages in the 30-msg tail
  const remainingForTail = Math.max(1500, tokenBudget - summaryTokens);
  if (tailTokens > remainingForTail && params.cloneWithTruncatedText) {
    const avgCharAllowance = Math.max(300, Math.floor(((remainingForTail / tailTokens) * singleMessageMaxChars)));
    finalTail = tailRaw.map((item) => {
      const meta = params.formatForEstimate(item);
      if (meta.text.length > avgCharAllowance) {
        return params.cloneWithTruncatedText!(item, truncateSingleMessageText(meta.text, avgCharAllowance));
      }
      return item;
    });
    tailTokens = finalTail.reduce((sum, item) => {
      const meta = params.formatForEstimate(item);
      return sum + estimateTextTokens(`${meta.senderName || ''}: ${meta.text || ''}`);
    }, 0);
  }

  return {
    rawMessages: finalTail,
    earlierSummaryText,
    metrics: {
      totalCandidateCount: input.length,
      rawCount: finalTail.length,
      summarizedCount: earlierRaw.length,
      didCompress: true,
      estimatedTokens: tailTokens + summaryTokens,
      tokenBudget,
    },
  };
}
