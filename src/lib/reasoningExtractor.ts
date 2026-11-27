/**
 * reasoningExtractor.ts
 * Unified, honest API reasoning/thinking extraction for:
 * 1. OpenAI compatible responses (non-stream & SSE delta: reasoning_content / reasoning / thinking)
 * 2. Gemini native responses (non-stream & stream: candidates[].content.parts[] thought parts)
 * 3. Anthropic native responses (content[].type === 'thinking' & thinking_delta)
 * 4. Text-embedded <think>...</think>, unclosed <think>..., and explicit Reasoning prefixes
 *
 * Strictly guarantees:
 * - Never fabricates fake thinking templates or fallback summaries.
 * - Never leaks thinking into answer text.
 * - Never treats final answer as thinking.
 */

export type ReasoningSource =
  | 'reasoning_content'
  | 'reasoning'
  | 'thinking'
  | 'gemini_thought_part'
  | 'think_tag'
  | 'none';

export interface ExtractedApiReasoning {
  text: string;
  thinkingProcess: string;
  reasoningAvailable: boolean;
  reasoningSource: ReasoningSource;
  detectedFields: string[];
  hasThoughtSignatureOnly?: boolean;
}

function coerceReasoningValueToString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, any>;
          if (typeof obj.thinking === 'string') return obj.thinking;
          if (typeof obj.reasoning === 'string') return obj.reasoning;
          if (typeof obj.reasoning_content === 'string') return obj.reasoning_content;
          if (typeof obj.text === 'string') return obj.text;
        }
        return '';
      })
      .filter((s) => s.trim().length > 0)
      .join('\n\n');
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, any>;
    if (typeof obj.thinking === 'string') return obj.thinking;
    if (typeof obj.reasoning === 'string') return obj.reasoning;
    if (typeof obj.reasoning_content === 'string') return obj.reasoning_content;
    if (typeof obj.text === 'string') return obj.text;
  }
  return '';
}

function deduplicateExactSegments(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    // Also skip if a segment is an exact duplicate already fully contained in an existing segment
    let isSubstringDup = false;
    for (const existing of seen) {
      if (existing === trimmed) {
        isSubstringDup = true;
        break;
      }
    }
    if (!isSubstringDup) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Extract <think>...</think>, <thinking>...</thinking>, unclosed <think>...,
 * and explicit Reasoning:/Thinking Process:/思考过程： prefixes from raw text.
 */
export function extractTextThinkTags(rawText: string): {
  thinkingParts: string[];
  cleanText: string;
  hasExplicitThinkTag: boolean;
} {
  let text = typeof rawText === 'string' ? rawText : '';
  const thinkingParts: string[] = [];
  let hasExplicitThinkTag = false;

  // 1. Complete <think>...</think> or <thinking>...</thinking> blocks
  const completeRegex = /<(think|thinking)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = completeRegex.exec(text)) !== null) {
    hasExplicitThinkTag = true;
    const inner = match[2].trim();
    if (inner) {
      thinkingParts.push(inner);
    }
  }
  text = text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');

  // 2. Unclosed <think>... or <thinking>... blocks
  const lower = text.toLowerCase();
  const unclosedThinkIdx = lower.indexOf('<think>');
  const unclosedThinkingIdx = lower.indexOf('<thinking>');
  let unclosedIdx = -1;
  let openTagLen = 0;
  if (unclosedThinkIdx >= 0 && (unclosedThinkingIdx < 0 || unclosedThinkIdx < unclosedThinkingIdx)) {
    unclosedIdx = unclosedThinkIdx;
    openTagLen = 7;
  } else if (unclosedThinkingIdx >= 0) {
    unclosedIdx = unclosedThinkingIdx;
    openTagLen = 10;
  }
  if (unclosedIdx >= 0) {
    hasExplicitThinkTag = true;
    const unclosedContent = text.slice(unclosedIdx + openTagLen).trim();
    if (unclosedContent) {
      thinkingParts.push(unclosedContent);
    }
    text = text.slice(0, unclosedIdx);
  }

  // 3. Remove stray closing tags
  text = text.replace(/<\/(?:think|thinking)>/gi, '');

  // 4. Explicit Reasoning: / Thinking Process: / 思考过程： at start followed by blank line
  const prefixRegex = /^(?:思考过程|Thinking Process|Reasoning)\s*[:：]\s*([\s\S]*?)(?:\r?\n\r?\n|$)/i;
  const prefixMatch = text.match(prefixRegex);
  if (prefixMatch) {
    hasExplicitThinkTag = true;
    const body = (prefixMatch[1] || '').trim();
    if (body) {
      thinkingParts.push(body);
    }
    text = text.replace(prefixRegex, '');
  }

  const cleanText = text
    .replace(/<\/?(?:think|thinking)>/gi, '')
    .replace(/^(?:思考过程|Thinking Process|Reasoning)\s*[:：]\s*/gi, '')
    .replace(/reasoning_content\s*[:：]?/gi, '')
    .trim();

  return {
    thinkingParts,
    cleanText,
    hasExplicitThinkTag,
  };
}

/**
 * Unified API reasoning extraction from any OpenAI, Gemini, Anthropic, or raw text payload.
 */
export function extractApiReasoning(
  rawResponse: any,
  protocol?: string
): ExtractedApiReasoning {
  const detectedFields: string[] = [];
  const apiThinkingParts: string[] = [];
  let primaryApiSource: ReasoningSource | null = null;
  let rawAnswerText = '';
  let hasThoughtSignatureOnly = false;

  // Handle raw string directly
  if (typeof rawResponse === 'string') {
    const tagRes = extractTextThinkTags(rawResponse);
    const deduped = deduplicateExactSegments(tagRes.thinkingParts);
    const thinkingProcess = deduped.join('\n\n');
    return {
      text: tagRes.cleanText,
      thinkingProcess,
      reasoningAvailable: thinkingProcess.length > 0,
      reasoningSource: thinkingProcess.length > 0 ? 'think_tag' : 'none',
      detectedFields: thinkingProcess.length > 0 ? ['text:<think>'] : [],
    };
  }

  if (!rawResponse || typeof rawResponse !== 'object') {
    return {
      text: '',
      thinkingProcess: '',
      reasoningAvailable: false,
      reasoningSource: 'none',
      detectedFields: [],
    };
  }

  // 1. OpenAI Compatible structure (non-streaming & single delta chunk)
  if (Array.isArray(rawResponse.choices) && rawResponse.choices.length > 0) {
    const choice = rawResponse.choices[0] || {};
    const msg = choice.message && typeof choice.message === 'object' ? choice.message : null;
    const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null;
    const targets: Array<{ label: string; obj: Record<string, any> }> = [];
    if (msg) targets.push({ label: 'choices[0].message', obj: msg });
    if (delta) targets.push({ label: 'choices[0].delta', obj: delta });

    for (const target of targets) {
      const { label, obj } = target;
      if (obj.reasoning_content !== undefined && obj.reasoning_content !== null) {
        const str = coerceReasoningValueToString(obj.reasoning_content);
        if (str.trim()) {
          detectedFields.push(`${label}.reasoning_content`);
          apiThinkingParts.push(str);
          if (!primaryApiSource) primaryApiSource = 'reasoning_content';
        }
      }
      if (obj.reasoning !== undefined && obj.reasoning !== null) {
        const str = coerceReasoningValueToString(obj.reasoning);
        if (str.trim()) {
          detectedFields.push(`${label}.reasoning`);
          apiThinkingParts.push(str);
          if (!primaryApiSource) primaryApiSource = 'reasoning';
        }
      }
      if (obj.thinking !== undefined && obj.thinking !== null) {
        const str = coerceReasoningValueToString(obj.thinking);
        if (str.trim()) {
          detectedFields.push(`${label}.thinking`);
          apiThinkingParts.push(str);
          if (!primaryApiSource) primaryApiSource = 'thinking';
        }
      }
      if (Array.isArray(obj.reasoning_details)) {
        const detailStr = coerceReasoningValueToString(obj.reasoning_details);
        if (detailStr.trim()) {
          detectedFields.push(`${label}.reasoning_details`);
          apiThinkingParts.push(detailStr);
          if (!primaryApiSource) primaryApiSource = 'reasoning';
        }
      }

      // Extract answer content (handles string OR multimodal array content)
      if (typeof obj.content === 'string') {
        rawAnswerText += obj.content;
      } else if (Array.isArray(obj.content)) {
        for (let pIdx = 0; pIdx < obj.content.length; pIdx++) {
          const part = obj.content[pIdx];
          if (!part || typeof part !== 'object') continue;
          const pType = String(part.type || '').toLowerCase();
          if (pType === 'thinking' || pType === 'reasoning' || pType === 'thought') {
            const thoughtStr = coerceReasoningValueToString(part.thinking || part.reasoning || part.text);
            if (thoughtStr.trim()) {
              detectedFields.push(`${label}.content[${pIdx}].${pType}`);
              apiThinkingParts.push(thoughtStr);
              if (!primaryApiSource) primaryApiSource = 'thinking';
            }
          } else if (typeof part.text === 'string') {
            rawAnswerText += part.text;
          }
        }
      }
    }

    if (!rawAnswerText && typeof choice.text === 'string') {
      rawAnswerText = choice.text;
    }
  }

  // 2. Gemini Native structure (candidates[].content.parts[])
  if (Array.isArray(rawResponse.candidates) && rawResponse.candidates.length > 0) {
    const geminiAnswerParts: string[] = [];
    for (let cIdx = 0; cIdx < rawResponse.candidates.length; cIdx++) {
      const cand = rawResponse.candidates[cIdx];
      const parts = cand?.content?.parts;
      if (!Array.isArray(parts)) continue;
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const part = parts[pIdx];
        if (!part || typeof part !== 'object') continue;

        const hasThoughtSig =
          typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim().length > 0;
        if (hasThoughtSig) {
          detectedFields.push(`candidates[${cIdx}].content.parts[${pIdx}].thoughtSignature`);
        }

        if (part.thought === true && typeof part.text === 'string' && part.text.trim()) {
          detectedFields.push(`candidates[${cIdx}].content.parts[${pIdx}].thought`);
          apiThinkingParts.push(part.text);
          if (!primaryApiSource) primaryApiSource = 'gemini_thought_part';
          continue;
        }

        if (typeof part.thought === 'string' && part.thought.trim()) {
          detectedFields.push(`candidates[${cIdx}].content.parts[${pIdx}].thought`);
          apiThinkingParts.push(part.thought);
          if (!primaryApiSource) primaryApiSource = 'gemini_thought_part';
          // Also check if part.text holds non-thought text
          if (typeof part.text === 'string' && part.text && cIdx === 0) {
            geminiAnswerParts.push(part.text);
          }
          continue;
        }

        const partType = String(part.type || '').toLowerCase();
        if (partType === 'thought' || partType === 'thinking' || partType === 'reasoning') {
          const thoughtStr = coerceReasoningValueToString(part.text || part.thinking || part.reasoning);
          if (thoughtStr.trim()) {
            detectedFields.push(`candidates[${cIdx}].content.parts[${pIdx}].${partType}`);
            apiThinkingParts.push(thoughtStr);
            if (!primaryApiSource) primaryApiSource = 'gemini_thought_part';
          }
          continue;
        }

        if (part.thought === true) {
          // Part flagged as thought without plain text (e.g. only opaque thoughtSignature)
          if (hasThoughtSig) {
            hasThoughtSignatureOnly = true;
          }
          continue;
        }

        if (hasThoughtSig) {
          hasThoughtSignatureOnly = true;
        }

        if (cIdx === 0 && typeof part.text === 'string') {
          geminiAnswerParts.push(part.text);
        }
      }
    }
    if (geminiAnswerParts.length > 0 && !rawAnswerText) {
      rawAnswerText = geminiAnswerParts.join('');
    }
    if (apiThinkingParts.length > 0) {
      hasThoughtSignatureOnly = false;
    }
  }

  // 3. Anthropic Messages API structure (content[] array)
  if (
    !rawAnswerText &&
    Array.isArray(rawResponse.content) &&
    (protocol === 'anthropic' || rawResponse.type === 'message')
  ) {
    const anthropicAnswer: string[] = [];
    for (let idx = 0; idx < rawResponse.content.length; idx++) {
      const block = rawResponse.content[idx];
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'thinking') {
        const t = coerceReasoningValueToString(block.thinking || block.text);
        if (t.trim()) {
          detectedFields.push(`content[${idx}].thinking`);
          apiThinkingParts.push(t);
          if (!primaryApiSource) primaryApiSource = 'thinking';
        }
      } else if (block.type === 'text' && typeof block.text === 'string') {
        anthropicAnswer.push(block.text);
      }
    }
    rawAnswerText = anthropicAnswer.join('');
  }

  // 4. Fallback if Gemini SDK wrapper only passed .text or generic { text }
  if (!rawAnswerText && typeof rawResponse.text === 'string') {
    rawAnswerText = rawResponse.text;
  }

  // 5. Extract any <think>...</think> or explicit headers from answer text
  const tagExtracted = extractTextThinkTags(rawAnswerText);
  if (tagExtracted.thinkingParts.length > 0) {
    detectedFields.push('text:<think>');
  }

  const combinedParts = deduplicateExactSegments([
    ...apiThinkingParts,
    ...tagExtracted.thinkingParts,
  ]);
  const thinkingProcess = combinedParts.join('\n\n');

  let reasoningSource: ReasoningSource = 'none';
  if (thinkingProcess.length > 0) {
    if (primaryApiSource) {
      reasoningSource = primaryApiSource;
    } else if (tagExtracted.thinkingParts.length > 0) {
      reasoningSource = 'think_tag';
    }
  }

  return {
    text: tagExtracted.cleanText,
    thinkingProcess,
    reasoningAvailable: thinkingProcess.length > 0,
    reasoningSource,
    detectedFields: Array.from(new Set(detectedFields)),
    ...(hasThoughtSignatureOnly && thinkingProcess.length === 0 ? { hasThoughtSignatureOnly: true } : {}),
  };
}

/**
 * Streaming SSE / Chunk accumulator supporting OpenAI SSE deltas,
 * Gemini generateContentStream chunks, and Anthropic message stream events.
 */
export class StreamingReasoningAccumulator {
  private reasoningChunks: string[] = [];
  private contentChunks: string[] = [];
  private reasoningFull = '';
  private contentFull = '';
  private primarySource: ReasoningSource | null = null;
  private detectedFields = new Set<string>();
  private hasThoughtSignatureOnly = false;
  public chunkCount = 0;
  public usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  public isRealTokens = false;

  private appendReasoning(piece: string, source: ReasoningSource, fieldPath: string) {
    if (!piece) return;
    // Guard against final aggregate replay chunk repeating the entire reasoning buffer
    if (
      this.reasoningFull.length > 20 &&
      piece.length >= this.reasoningFull.length &&
      piece === this.reasoningFull
    ) {
      return;
    }
    this.reasoningChunks.push(piece);
    this.reasoningFull += piece;
    this.detectedFields.add(fieldPath);
    if (!this.primarySource) {
      this.primarySource = source;
    }
  }

  private appendContent(piece: string) {
    if (!piece) return;
    // Guard against duplicate aggregate chunk repeating the full accumulated content
    if (
      this.contentFull.length > 20 &&
      piece.length >= this.contentFull.length &&
      piece === this.contentFull
    ) {
      return;
    }
    this.contentChunks.push(piece);
    this.contentFull += piece;
  }

  public pushOpenAiChunk(chunk: any): void {
    if (!chunk || typeof chunk !== 'object') return;
    this.chunkCount++;

    if (chunk.usage && typeof chunk.usage === 'object') {
      this.isRealTokens = true;
      this.usage = {
        promptTokens: typeof chunk.usage.prompt_tokens === 'number' ? chunk.usage.prompt_tokens : this.usage?.promptTokens,
        completionTokens: typeof chunk.usage.completion_tokens === 'number' ? chunk.usage.completion_tokens : this.usage?.completionTokens,
        totalTokens: typeof chunk.usage.total_tokens === 'number' ? chunk.usage.total_tokens : this.usage?.totalTokens,
      };
    }

    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null;
    if (!choice || typeof choice !== 'object') return;

    const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null;
    const msg = choice.message && typeof choice.message === 'object' ? choice.message : null;

    if (delta) {
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
        this.appendReasoning(delta.reasoning_content, 'reasoning_content', 'choices[0].delta.reasoning_content');
      } else if (delta.reasoning_content) {
        this.appendReasoning(coerceReasoningValueToString(delta.reasoning_content), 'reasoning_content', 'choices[0].delta.reasoning_content');
      }

      if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
        this.appendReasoning(delta.reasoning, 'reasoning', 'choices[0].delta.reasoning');
      } else if (delta.reasoning) {
        this.appendReasoning(coerceReasoningValueToString(delta.reasoning), 'reasoning', 'choices[0].delta.reasoning');
      }

      if (typeof delta.thinking === 'string' && delta.thinking.length > 0) {
        this.appendReasoning(delta.thinking, 'thinking', 'choices[0].delta.thinking');
      } else if (delta.thinking) {
        this.appendReasoning(coerceReasoningValueToString(delta.thinking), 'thinking', 'choices[0].delta.thinking');
      }

      if (Array.isArray(delta.reasoning_details)) {
        const s = coerceReasoningValueToString(delta.reasoning_details);
        if (s) this.appendReasoning(s, 'reasoning', 'choices[0].delta.reasoning_details');
      }

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        this.appendContent(delta.content);
      }
    }

    // Some relays attach full message on last chunk in stream mode
    if (msg) {
      if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.length > 0) {
        this.appendReasoning(msg.reasoning_content, 'reasoning_content', 'choices[0].message.reasoning_content');
      }
      if (typeof msg.reasoning === 'string' && msg.reasoning.length > 0) {
        this.appendReasoning(msg.reasoning, 'reasoning', 'choices[0].message.reasoning');
      }
      if (typeof msg.thinking === 'string' && msg.thinking.length > 0) {
        this.appendReasoning(msg.thinking, 'thinking', 'choices[0].message.thinking');
      }
      if (typeof msg.content === 'string' && msg.content.length > 0) {
        this.appendContent(msg.content);
      }
    }
  }

  public pushGeminiChunk(chunk: any): void {
    if (!chunk || typeof chunk !== 'object') return;
    this.chunkCount++;

    if (chunk.usageMetadata && typeof chunk.usageMetadata === 'object') {
      this.isRealTokens = true;
      this.usage = {
        promptTokens: typeof chunk.usageMetadata.promptTokenCount === 'number' ? chunk.usageMetadata.promptTokenCount : this.usage?.promptTokens,
        completionTokens: typeof chunk.usageMetadata.candidatesTokenCount === 'number' ? chunk.usageMetadata.candidatesTokenCount : this.usage?.completionTokens,
        totalTokens: typeof chunk.usageMetadata.totalTokenCount === 'number' ? chunk.usageMetadata.totalTokenCount : this.usage?.totalTokens,
      };
    }

    const candidates = Array.isArray(chunk.candidates) ? chunk.candidates : [];
    let foundParts = false;
    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const parts = candidates[cIdx]?.content?.parts;
      if (!Array.isArray(parts)) continue;
      foundParts = true;
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const part = parts[pIdx];
        if (!part || typeof part !== 'object') continue;

        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
          this.detectedFields.add(`candidates[${cIdx}].content.parts[${pIdx}].thoughtSignature`);
        }

        if (part.thought === true && typeof part.text === 'string' && part.text.length > 0) {
          this.appendReasoning(part.text, 'gemini_thought_part', `candidates[${cIdx}].content.parts[${pIdx}].thought`);
          continue;
        }
        if (typeof part.thought === 'string' && part.thought.length > 0) {
          this.appendReasoning(part.thought, 'gemini_thought_part', `candidates[${cIdx}].content.parts[${pIdx}].thought`);
          if (cIdx === 0 && typeof part.text === 'string' && part.text.length > 0) {
            this.appendContent(part.text);
          }
          continue;
        }
        const pType = String(part.type || '').toLowerCase();
        if (pType === 'thought' || pType === 'thinking' || pType === 'reasoning') {
          const str = coerceReasoningValueToString(part.text || part.thinking || part.reasoning);
          if (str) {
            this.appendReasoning(str, 'gemini_thought_part', `candidates[${cIdx}].content.parts[${pIdx}].${pType}`);
          }
          continue;
        }
        if (part.thought === true) {
          if (part.thoughtSignature) this.hasThoughtSignatureOnly = true;
          continue;
        }
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
          this.hasThoughtSignatureOnly = true;
        }
        if (cIdx === 0 && typeof part.text === 'string' && part.text.length > 0) {
          this.appendContent(part.text);
        }
      }
    }

    if (!foundParts && typeof chunk.text === 'string' && chunk.text.length > 0) {
      this.appendContent(chunk.text);
    }
  }

  public pushAnthropicEvent(event: any): void {
    if (!event || typeof event !== 'object') return;
    this.chunkCount++;
    if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
      const t = event.content_block.thinking || event.content_block.text || '';
      if (t) this.appendReasoning(t, 'thinking', 'content_block.thinking');
    } else if (event.type === 'content_block_delta' && event.delta) {
      if (event.delta.type === 'thinking_delta' && typeof event.delta.thinking === 'string') {
        this.appendReasoning(event.delta.thinking, 'thinking', 'delta.thinking');
      } else if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') {
        this.appendContent(event.delta.text);
      }
    } else if (event.usage && typeof event.usage === 'object') {
      this.isRealTokens = true;
      this.usage = {
        promptTokens: event.usage.input_tokens ?? this.usage?.promptTokens,
        completionTokens: event.usage.output_tokens ?? this.usage?.completionTokens,
      };
    }
  }

  public finalize(): ExtractedApiReasoning {
    const tagExtracted = extractTextThinkTags(this.contentFull);
    if (tagExtracted.thinkingParts.length > 0) {
      this.detectedFields.add('text:<think>');
    }

    const parts: string[] = [];
    if (this.reasoningFull.trim()) {
      parts.push(this.reasoningFull.trim());
    }
    for (const tp of tagExtracted.thinkingParts) {
      parts.push(tp);
    }

    const deduped = deduplicateExactSegments(parts);
    const thinkingProcess = deduped.join('\n\n');

    let reasoningSource: ReasoningSource = 'none';
    if (thinkingProcess.length > 0) {
      if (this.primarySource) {
        reasoningSource = this.primarySource;
      } else if (tagExtracted.thinkingParts.length > 0) {
        reasoningSource = 'think_tag';
      }
    }

    return {
      text: tagExtracted.cleanText,
      thinkingProcess,
      reasoningAvailable: thinkingProcess.length > 0,
      reasoningSource,
      detectedFields: Array.from(this.detectedFields),
      ...(this.hasThoughtSignatureOnly && thinkingProcess.length === 0
        ? { hasThoughtSignatureOnly: true }
        : {}),
    };
  }
}

/**
 * Redacts all API keys, auth headers, private text payloads, and long binary/signature fields
 * while preserving the structural schema of an upstream API JSON response for diagnostics.
 */
export function sanitizeResponseStructure(node: any, depth = 0): any {
  if (depth > 6) return '[MaxDepth]';
  if (node === null || node === undefined) return node;
  if (typeof node === 'boolean' || typeof node === 'number') return node;
  if (typeof node === 'string') {
    const masked = node
      .replace(/Bearer\s+[A-Za-z0-9._\-+=/]{6,}/gi, 'Bearer ***')
      .replace(/\bAIza[0-9A-Za-z\-_]{10,}\b/g, 'AIza***')
      .replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9\-_]{8,}\b/g, 'sk-***');
    if (masked.length > 80) {
      return `[string len=${masked.length}]`;
    }
    return masked;
  }
  if (Array.isArray(node)) {
    return node.slice(0, 5).map((item) => sanitizeResponseStructure(item, depth + 1));
  }
  if (typeof node === 'object') {
    const out: Record<string, any> = {};
    const sensitiveKeyRegex = /^(api_?key|authorization|x-api-key|x-goog-api-key|token|secret|cookie|password|prompt|messages|systemInstruction|thoughtSignature)$/i;
    for (const [k, v] of Object.entries(node)) {
      if (sensitiveKeyRegex.test(k)) {
        if (typeof v === 'string') {
          out[k] = `[redacted len=${v.length}]`;
        } else {
          out[k] = '[redacted]';
        }
        continue;
      }
      if (k === 'reasoning_content' || k === 'reasoning' || k === 'thinking') {
        if (typeof v === 'string') {
          out[k] = v.trim()
            ? `[present: string len=${v.length}]`
            : `[empty string len=${v.length}]`;
        } else if (v === null) {
          out[k] = null;
        } else {
          out[k] = sanitizeResponseStructure(v, depth + 1);
        }
        continue;
      }
      if (k === 'content' && typeof v === 'string') {
        out[k] = `[string len=${v.length}]`;
        continue;
      }
      if (k === 'text' && typeof v === 'string') {
        out[k] = `[string len=${v.length}]`;
        continue;
      }
      out[k] = sanitizeResponseStructure(v, depth + 1);
    }
    return out;
  }
  return String(node);
}
