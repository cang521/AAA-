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
 * 检查字符串中是否存在未闭合的括号/引号配对结构
 */
function hasUnclosedPairs(str: string): boolean {
  const pairs: [string, string][] = [
    ['（', '）'],
    ['(', ')'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
    ['【', '】'],
    ['[', ']'],
  ];

  for (const [open, close] of pairs) {
    const openCount = (str.match(new RegExp('\\' + open, 'g')) || []).length;
    const closeCount = (str.match(new RegExp('\\' + close, 'g')) || []).length;
    if (openCount > closeCount) {
      return true;
    }
  }

  const doubleQuotes = (str.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) return true;

  return false;
}

/**
 * 检查片段是否以未完成的连字符/标点结尾（逗号、顿号、冒号、分号）
 */
function endsWithIncompletePunctuation(str: string): boolean {
  const trimmed = str.trim();
  return /[，,、：:；;]$/.test(trimmed);
}

/**
 * 检查片段是否以闭合标点开头
 */
function startsWithClosingPunctuation(str: string): boolean {
  const trimmed = str.trim();
  return /^[）\)”"」』】\]，,；;]/.test(trimmed);
}

/**
 * 检查片段是否属于明显半句或连词开头的未完成短片段
 */
function isIncompleteFragment(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return true;

  if (endsWithIncompletePunctuation(trimmed)) return true;
  if (hasUnclosedPairs(trimmed)) return true;
  if (startsWithClosingPunctuation(trimmed)) return true;

  if (/^(不过|但是|所以|而且|因[此为]|结果|如果是|虽然|假使|好啦|话说|另外|但是呢)[，,；;]?$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * 智能分句算法：
 * 保证语义完整优先，避免割裂半句；当数量超过 maxBubbles 时采用相邻合并，保证气泡长度自然均衡
 */
export function splitMessageIntoSentenceBubbles(
  rawText: string,
  options: SplitOptions = {}
): string[] {
  if (!rawText) return [];
  const text = rawText.trim();
  if (!text) return [];

  const maxBubbles = options.maxBubbles ?? 5;
  const targetMaxChars = options.targetMaxChars ?? 38;

  // 1. 代码块保持完整
  if (text.includes('```')) {
    return [text];
  }

  // 2. 强断点分割 (句末强标点：。！？!?~…及后随引号/括号)
  const strongRegex = /[^。！？!?~…\r\n]+([。！？!?~…]+["”'」』）)]*|$)/g;

  const rawLines = text.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  let initialChunks: string[] = [];

  for (const line of rawLines) {
    const matches = line.match(strongRegex);
    if (matches && matches.length > 0) {
      initialChunks.push(...matches.map((m) => m.trim()).filter(Boolean));
    } else {
      initialChunks.push(line);
    }
  }

  // 3. 智能语义与保护成对结构合并Pass：修复半句、未闭合括号/引号
  const mergedChunks: string[] = [];
  for (let i = 0; i < initialChunks.length; i++) {
    let current = initialChunks[i];

    while (i + 1 < initialChunks.length && (isIncompleteFragment(current) || hasUnclosedPairs(current))) {
      i++;
      current = current + initialChunks[i];
    }

    if (
      mergedChunks.length > 0 &&
      (startsWithClosingPunctuation(current) ||
        endsWithIncompletePunctuation(mergedChunks[mergedChunks.length - 1]) ||
        isIncompleteFragment(mergedChunks[mergedChunks.length - 1]))
    ) {
      mergedChunks[mergedChunks.length - 1] += current;
    } else {
      mergedChunks.push(current);
    }
  }

  // 4. 清理极短断句碎片 (< 4字)
  const refinedChunks: string[] = [];
  for (let i = 0; i < mergedChunks.length; i++) {
    const chunk = mergedChunks[i];
    if (chunk.length < 4 && refinedChunks.length > 0) {
      refinedChunks[refinedChunks.length - 1] += chunk;
    } else if (chunk.length < 4 && i + 1 < mergedChunks.length) {
      mergedChunks[i + 1] = chunk + mergedChunks[i + 1];
    } else {
      refinedChunks.push(chunk);
    }
  }

  // 5. 软切分超长无强标点子句 (仅当字数 > targetMaxChars + 15，且切分后绝不留尾随逗号/半句)
  const softChunks: string[] = [];
  for (const chunk of refinedChunks) {
    if (chunk.length > targetMaxChars + 15 && !/[。！？!?~…]/.test(chunk.slice(0, -1))) {
      const softMatches = chunk.match(/[^，,；;]+([，,；;]+|$)/g);
      if (softMatches && softMatches.length > 1) {
        let temp = '';
        for (const sub of softMatches) {
          temp += sub;
          if (temp.length >= 18 && !hasUnclosedPairs(temp) && !endsWithIncompletePunctuation(temp)) {
            softChunks.push(temp.trim());
            temp = '';
          }
        }
        if (temp.trim()) {
          if (softChunks.length > 0) {
            softChunks[softChunks.length - 1] += temp.trim();
          } else {
            softChunks.push(temp.trim());
          }
        }
      } else {
        softChunks.push(chunk);
      }
    } else {
      softChunks.push(chunk);
    }
  }

  // 二次清理软切分后可能留下的末尾未完成连字符
  const cleanedChunks: string[] = [];
  for (let i = 0; i < softChunks.length; i++) {
    let current = softChunks[i];
    while (i + 1 < softChunks.length && (endsWithIncompletePunctuation(current) || hasUnclosedPairs(current))) {
      i++;
      current = current + softChunks[i];
    }
    cleanedChunks.push(current);
  }

  // 6. 均衡合并算法：当气泡数量超过 maxBubbles 时，采用相邻短气泡贪心合并，保证气泡长度自然均衡
  let finalBubbles = cleanedChunks.filter((s) => s.trim().length > 0);

  while (finalBubbles.length > maxBubbles) {
    let minSum = Infinity;
    let minIndex = 0;

    for (let i = 0; i < finalBubbles.length - 1; i++) {
      const sum = finalBubbles[i].length + finalBubbles[i + 1].length;
      if (sum < minSum) {
        minSum = sum;
        minIndex = i;
      }
    }

    const mergedPair = finalBubbles[minIndex] + finalBubbles[minIndex + 1];
    finalBubbles.splice(minIndex, 2, mergedPair);
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

  let base = 450;
  let perChar = 32;

  if (speed === 'fast') {
    base = 300;
    perChar = 20;
    return Math.min(850, Math.max(350, base + charCount * perChar));
  } else if (speed === 'slow') {
    base = 800;
    perChar = 45;
    return Math.min(1800, Math.max(750, base + charCount * perChar));
  } else {
    base = 450;
    perChar = 32;
    return Math.min(1250, Math.max(450, base + charCount * perChar));
  }
}
