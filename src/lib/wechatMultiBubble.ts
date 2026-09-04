/**
 * WeChat Simulated Human Multi-Bubble Messaging Engine
 * 微信拟真多气泡连发引擎：
 * 将 AI 生成的单段完整长句/段落，像真人发微信一样自然切分为 2~5 条短句连续发送，
 * 并提供打字中状态、平滑滚动、音效震动与自然打字节奏延迟。
 */

export interface MultiBubbleConfig {
  enabled: boolean;
  speed: 'fast' | 'normal' | 'slow';
  maxBubbles: number;
}

const STORAGE_KEY = 'wechat_multi_bubble_config_v1';

export const DEFAULT_MULTI_BUBBLE_CONFIG: MultiBubbleConfig = {
  enabled: true,
  speed: 'normal',
  maxBubbles: 5,
};

export function getMultiBubbleConfig(): MultiBubbleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MULTI_BUBBLE_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_MULTI_BUBBLE_CONFIG.enabled,
      speed: ['fast', 'normal', 'slow'].includes(parsed.speed) ? parsed.speed : DEFAULT_MULTI_BUBBLE_CONFIG.speed,
      maxBubbles: typeof parsed.maxBubbles === 'number' ? Math.max(2, Math.min(8, parsed.maxBubbles)) : DEFAULT_MULTI_BUBBLE_CONFIG.maxBubbles,
    };
  } catch {
    return DEFAULT_MULTI_BUBBLE_CONFIG;
  }
}

export function saveMultiBubbleConfig(config: Partial<MultiBubbleConfig>): MultiBubbleConfig {
  try {
    const current = getMultiBubbleConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_MULTI_BUBBLE_CONFIG;
  }
}

export interface SplitOptions {
  maxBubbles?: number;
  minSentenceLength?: number;
  targetMaxChars?: number;
}

/**
 * 智能分句算法：
 * 将一整段回复拆分成适合微信气泡的短句列表（一句话一条）
 */
export function splitMessageIntoSentenceBubbles(
  rawText: string,
  options: SplitOptions = {}
): string[] {
  if (!rawText) return [];
  const text = rawText.trim();
  if (!text) return [];

  const maxBubbles = options.maxBubbles ?? 5;
  const minSentenceLength = options.minSentenceLength ?? 3;
  const targetMaxChars = options.targetMaxChars ?? 38;

  // 1. 如果包含代码块，保持整体完整，避免切碎代码
  if (text.includes('```')) {
    return [text];
  }

  // 2. 如果包含显式换行且至少有2行
  const rawLines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let initialChunks: string[] = [];

  if (rawLines.length >= 2) {
    // 文本本身已经包含多行换行
    initialChunks = rawLines;
  } else {
    // 3. 纯单行长段落，使用中文与常见标点进行自然断句
    // 句末强断句标点：。！？!?~…以及连续感叹疑问号
    const sentenceRegex = /[^。！？!?~…\n]+([。！？!?~…]+["”'」』）)]*|$)/g;
    const matched = text.match(sentenceRegex);

    if (matched && matched.length > 1) {
      initialChunks = matched.map((s) => s.trim()).filter(Boolean);
    } else {
      // 若没有强句末标点，尝试在逗号、分号（，；,;）处软切分（仅当文本较长时）
      if (text.length > 25) {
        const softRegex = /[^，；,;\n]+([，；,;]+|$)/g;
        const softMatched = text.match(softRegex);
        if (softMatched && softMatched.length > 1) {
          initialChunks = softMatched.map((s) => s.trim()).filter(Boolean);
        } else {
          initialChunks = [text];
        }
      } else {
        initialChunks = [text];
      }
    }
  }

  // 4. 第二阶段：进一步处理过长子句（比如某一行内包含好几个句子）
  const refinedChunks: string[] = [];
  for (const chunk of initialChunks) {
    if (chunk.length > targetMaxChars) {
      // 内部尝试按标点再拆
      const subMatches = chunk.match(/[^。！？!?~…，,；;]+([。！？!?~…，,；;]+["”'」』）)]*|$)/g);
      if (subMatches && subMatches.length > 1) {
        refinedChunks.push(...subMatches.map((s) => s.trim()).filter(Boolean));
      } else {
        refinedChunks.push(chunk);
      }
    } else {
      refinedChunks.push(chunk);
    }
  }

  // 5. 第三阶段：短碎片智能合并（防止出现仅一个字、一个标点或过碎的碎片）
  const mergedChunks: string[] = [];
  for (let i = 0; i < refinedChunks.length; i++) {
    const current = refinedChunks[i];
    // 如果当前片断太短（如仅为纯标点或单个字），且已有前置项，合并到前置项
    if (current.length < minSentenceLength && mergedChunks.length > 0) {
      mergedChunks[mergedChunks.length - 1] += current;
    } else if (
      current.length < minSentenceLength &&
      i + 1 < refinedChunks.length
    ) {
      // 合并到后一项
      refinedChunks[i + 1] = current + refinedChunks[i + 1];
    } else {
      mergedChunks.push(current);
    }
  }

  // 6. 第四阶段：连发总条数控制，限制在 maxBubbles 以内，超出的优雅合并到末尾
  if (mergedChunks.length <= maxBubbles) {
    return mergedChunks.filter((s) => s.trim().length > 0);
  }

  const finalBubbles = mergedChunks.slice(0, maxBubbles - 1);
  const remainingText = mergedChunks.slice(maxBubbles - 1).join('');
  if (remainingText.trim()) {
    finalBubbles.push(remainingText.trim());
  }

  return finalBubbles.filter((s) => s.trim().length > 0);
}

/**
 * 根据句子字数与设定速度，计算真人的打字耗时（毫秒）
 */
export function calculateTypingDelay(
  text: string,
  speed: 'fast' | 'normal' | 'slow' = 'normal'
): number {
  const charCount = text.length;

  let base = 500;
  let perChar = 30;

  if (speed === 'fast') {
    base = 300;
    perChar = 20;
    return Math.min(850, Math.max(350, base + charCount * perChar));
  } else if (speed === 'slow') {
    base = 800;
    perChar = 45;
    return Math.min(1800, Math.max(750, base + charCount * perChar));
  } else {
    // normal
    base = 450;
    perChar = 32;
    return Math.min(1250, Math.max(450, base + charCount * perChar));
  }
}
