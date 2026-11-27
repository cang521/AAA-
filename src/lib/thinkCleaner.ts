/**
 * High-Reliability Thinking & Reply Sanitizer
 * Ensures NO <think>, </think>, "思考过程：", "Thinking Process", "reasoning_content"
 * ever leaks into standard chat bubbles, and NEVER fabricates fake thinking templates.
 */

import { extractApiReasoning } from './reasoningExtractor';

export interface ThinkingCleanResult {
  thinkingProcess: string;
  cleanText: string;
}

export function extractThinkingAndContent(
  rawText: string,
  extraReasoning?: string
): ThinkingCleanResult {
  const fromText = extractApiReasoning(rawText || '');
  const parts: string[] = [];

  if (extraReasoning && extraReasoning.trim()) {
    parts.push(extraReasoning.trim());
  }
  if (fromText.thinkingProcess && fromText.thinkingProcess.trim()) {
    const trimmedFromText = fromText.thinkingProcess.trim();
    if (!parts.includes(trimmedFromText)) {
      parts.push(trimmedFromText);
    }
  }

  return {
    thinkingProcess: parts.filter(Boolean).join('\n\n'),
    cleanText: fromText.text,
  };
}

export function sanitizeReplyText(text: string): string {
  if (!text) return '';

  let clean = text;

  // Remove full <think>...</think> and <thinking>...</thinking>
  clean = clean.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');

  // Remove unclosed <think>... or <thinking>... to end
  clean = clean.replace(/<(think|thinking)>[\s\S]*/gi, '');

  // Remove residual tags & headers
  clean = clean
    .replace(/<\/(?:think|thinking)>/gi, '')
    .replace(/^(?:思考过程|Thinking Process|Reasoning)\s*[:：]\s*/gi, '')
    .replace(/reasoning_content\s*[:：]?/gi, '')
    .trim();

  return clean;
}
