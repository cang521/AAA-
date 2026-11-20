/**
 * offlineSegments.ts
 * Mandatory Action & Dialogue segmentation utilities for Offline Mode.
 * - action segments: standalone paragraph wrapped in single full-width Chinese parentheses （...）
 * - dialogue segments: standalone line with NO outer parentheses
 * - Backward compatible with legacy plain-text OfflineMessage records
 */

export interface OfflineMessageSegment {
  type: 'action' | 'dialogue';
  text: string;
}

/**
 * Strip redundant outer parentheses from an action text and wrap cleanly in a single （...）
 */
export function formatActionSegmentDisplay(raw: string): string {
  let clean = (raw || '').trim();
  if (!clean) return '';
  // Remove leading/trailing quotes or asterisks
  clean = clean.replace(/^\*+|\*+$/g, '').trim();
  // Strip repeated outer parentheses pairs （...） or (...)
  while (
    (clean.startsWith('（') && clean.endsWith('）')) ||
    (clean.startsWith('(') && clean.endsWith(')'))
  ) {
    const inner = clean.slice(1, -1).trim();
    if (!inner) break;
    // Only unwrap if parens are balanced inside
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '（' || ch === '(') depth++;
      else if (ch === '）' || ch === ')') {
        depth--;
        if (depth < 0) {
          balanced = false;
          break;
        }
      }
    }
    if (balanced && depth === 0) {
      clean = inner;
    } else {
      break;
    }
  }
  // Remove leading label prefixes like "动作：" / "旁白："
  clean = clean.replace(/^(动作|神态|旁白|环境|描写|Action)\s*[:：]\s*/i, '').trim();
  if (!clean) return '';
  return `（${clean}）`;
}

/**
 * Clean dialogue segment text: never wrapped in action parentheses
 */
export function formatDialogueSegmentDisplay(raw: string): string {
  let clean = (raw || '').trim();
  if (!clean) return '';
  clean = clean.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, '').trim();
  // Strip accidental wrapping parentheses if entire dialogue was mistakenly parenthesized
  if (
    (clean.startsWith('（') && clean.endsWith('）')) ||
    (clean.startsWith('(') && clean.endsWith(')'))
  ) {
    const inner = clean.slice(1, -1).trim();
    if (inner) clean = inner;
  }
  return clean;
}

/**
 * Parse legacy plain-text message (+ optional action string) into alternating action / dialogue segments.
 * Ensures old historical OfflineMode sessions render cleanly with action/dialogue separation.
 */
export function parseLegacyTextToSegments(text: string, legacyAction?: string): OfflineMessageSegment[] {
  const segments: OfflineMessageSegment[] = [];
  const raw = (text || '').trim();

  if (raw) {
    // Split on full-width or half-width parentheses blocks, or *action* blocks
    const tokenRegex = /([（\(][^（\(\)）]+[）\)]|\*[^*\n]+\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(raw)) !== null) {
      const before = raw.slice(lastIndex, match.index).trim();
      if (before) {
        const lines = before.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const cleaned = formatDialogueSegmentDisplay(line);
          if (cleaned) {
            segments.push({ type: 'dialogue', text: cleaned });
          }
        }
      }

      const actionToken = match[0].trim();
      const inner = actionToken.slice(1, -1).trim();
      if (inner) {
        segments.push({ type: 'action', text: formatActionSegmentDisplay(inner) });
      }
      lastIndex = tokenRegex.lastIndex;
    }

    const tail = raw.slice(lastIndex).trim();
    if (tail) {
      const lines = tail.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const cleaned = formatDialogueSegmentDisplay(line);
        if (cleaned) {
          segments.push({ type: 'dialogue', text: cleaned });
        }
      }
    }
  }

  // Append legacy separate action field if it is not already covered
  if (legacyAction && legacyAction.trim()) {
    const formattedAct = formatActionSegmentDisplay(legacyAction);
    const core = formattedAct.slice(1, -1);
    const alreadyPresent = segments.some(
      (s) => s.type === 'action' && (s.text === formattedAct || s.text.includes(core))
    );
    if (formattedAct && !alreadyPresent) {
      segments.push({ type: 'action', text: formattedAct });
    }
  }

  return segments;
}

/**
 * Normalize structured segments returned from API (or fallback from legacy reply/action).
 */
export function normalizeOfflineSegments(
  rawSegments: unknown,
  fallbackText?: string,
  fallbackAction?: string
): OfflineMessageSegment[] {
  const normalized: OfflineMessageSegment[] = [];

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    for (const item of rawSegments) {
      if (!item || typeof item !== 'object') continue;
      const typeRaw = String((item as any).type || '').toLowerCase().trim();
      const textRaw = typeof (item as any).text === 'string' ? (item as any).text.trim() : '';
      if (!textRaw) continue;

      if (typeRaw === 'action' || typeRaw === 'narration' || typeRaw === 'env' || typeRaw === 'scene') {
        const formatted = formatActionSegmentDisplay(textRaw);
        if (formatted) {
          normalized.push({ type: 'action', text: formatted });
        }
      } else {
        const isEntirelyWrapped = /^[（\(][^（\(\)）]+[）\)]$/.test(textRaw);
        if (!isEntirelyWrapped && /[（\(][^（\(\)）]{2,}[）\)]/.test(textRaw)) {
          // Guard against a model accidentally embedding （action） mixed with dialogue
          const sub = parseLegacyTextToSegments(textRaw);
          normalized.push(...sub);
        } else {
          const formatted = formatDialogueSegmentDisplay(textRaw);
          if (formatted) {
            normalized.push({ type: 'dialogue', text: formatted });
          }
        }
      }
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return parseLegacyTextToSegments(fallbackText || '', fallbackAction);
}

/**
 * Convert segments into clean multi-paragraph plain text (for clipboard copy & legacy text field)
 */
export function segmentsToPlainText(segments: OfflineMessageSegment[]): string {
  return segments
    .map((seg) => (seg.type === 'action' ? formatActionSegmentDisplay(seg.text) : formatDialogueSegmentDisplay(seg.text)))
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract a concise action summary string from segments (backward compatibility for legacy fields)
 */
export function extractPrimaryActionFromSegments(segments: OfflineMessageSegment[]): string {
  const firstAction = segments.find((s) => s.type === 'action');
  return firstAction ? formatActionSegmentDisplay(firstAction.text) : '';
}
