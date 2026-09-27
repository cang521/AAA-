/**
 * High-Reliability Thinking & Reply Sanitizer
 * Ensures NO <think>, </think>, "思考过程：", "Thinking Process", "reasoning_content"
 * ever leaks into standard chat bubbles.
 */

export interface ThinkingCleanResult {
  thinkingProcess: string;
  cleanText: string;
}

export function extractThinkingAndContent(
  rawText: string,
  extraReasoning?: string
): ThinkingCleanResult {
  const thinkingParts: string[] = [];

  if (extraReasoning && extraReasoning.trim()) {
    thinkingParts.push(extraReasoning.trim());
  }

  let text = rawText || '';

  // 1. Extract complete <think>...</think> blocks
  const completeThinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match: RegExpExecArray | null;
  while ((match = completeThinkRegex.exec(text)) !== null) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      thinkingParts.push(thinkContent);
    }
  }
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Handle unclosed <think>... blocks (e.g., model output stopped mid-think)
  if (text.toLowerCase().includes('<think>')) {
    const thinkIndex = text.toLowerCase().indexOf('<think>');
    const unclosedContent = text.slice(thinkIndex + 7).trim();
    if (unclosedContent) {
      thinkingParts.push(unclosedContent);
    }
    text = text.slice(0, thinkIndex);
  }

  // 3. Remove leftover </think> if any
  text = text.replace(/<\/think>/gi, '');

  // 4. Handle prefix "思考过程：" / "Thinking Process:" / "Reasoning:" at start of text
  const prefixMatch = text.match(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*([\s\S]*?)(?:\n\n|\r\n\r\n|$)/i);
  if (prefixMatch) {
    if (prefixMatch[1].trim()) {
      thinkingParts.push(prefixMatch[1].trim());
    }
    text = text.replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*[\s\S]*?(?:\n\n|\r\n\r\n|$)/i, '');
  }

  // 5. Clean residual tags or headers from reply text
  let cleanText = text
    .replace(/<think>/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*/gi, '')
    .replace(/reasoning_content[:：]?/gi, '')
    .trim();

  const thinkingProcess =
    thinkingParts.filter(Boolean).join('\n\n') ||
    '结合角色人设、个人回忆与历史对话，形成微信聊天的即时思考过程。';

  return { thinkingProcess, cleanText };
}

export function sanitizeReplyText(text: string): string {
  if (!text) return '';

  let clean = text;

  // Remove full <think>...</think>
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove unclosed <think>... to end
  clean = clean.replace(/<think>[\s\S]*/gi, '');

  // Remove residual tags & headers
  clean = clean
    .replace(/<\/think>/gi, '')
    .replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*/gi, '')
    .replace(/reasoning_content[:：]?/gi, '')
    .trim();

  return clean;
}
