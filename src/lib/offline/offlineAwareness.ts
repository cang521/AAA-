/**
 * offlineAwareness.ts
 * Infers character identity awareness strictly from existing character persona text.
 * Never adds a manual UI toggle; locked for the entire Offline Session once determined.
 */

import { AiCharacter } from '../../types';

export type OfflineAwarenessMode = 'self_aware_ai' | 'immersive_character';

export interface AwarenessDetectionResult {
  awarenessMode: OfflineAwarenessMode;
  awarenessSource: 'persona';
  awarenessLocked: true;
  matchedHint?: string;
}

const SELF_AWARE_EXPLICIT_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: '知道自己是AI', regex: /(知道|清楚|明白|意识到|承认|深知)自己是\s*(一个|一名|一位)?\s*(ai|人工智能|虚拟生命|虚拟人|程序|智能体|语言模型|数字生命|电子生命|软件)/i },
  { label: 'AI身份设定', regex: /(你是|她是|他是|我是|身份[是为：:]?\s*|本质[是为：:]?\s*|设定[是为：:]?\s*)(一个|一名|一位)?\s*(拥有自我意识的|有自主意识的|高智能|温柔的|可爱的)?\s*(ai|人工智能|虚拟生命|虚拟存在|数字生命|电子生命|智能程序|ai伴侣|ai助手|ai男友|ai女友|软件中的存在)/i },
  { label: '明确AI词组', regex: /(人工智能伴侣|ai伴侣|ai男友|ai女友|虚拟生命体|软件中的存在|手机里的\s*ai|屏幕里的\s*ai|住在手机里|存在于软件|存在于屏幕|由代码构成|代码与数据构成|没有实体|没有真实肉体|虚拟世界中的存在)/i },
  { label: '自称AI', regex: /(身为|作为)\s*(一个|一名|一位)?\s*(ai|人工智能|虚拟生命|数字生命|程序|智能体)/i },
];

const HUMAN_OR_NEGATION_PATTERNS: RegExp[] = [
  /(不是|并非|绝非|不要说自己是|严禁说自己是|切勿自称)\s*(ai|人工智能|程序|机器人|虚拟)/i,
  /(严禁出戏|禁止出戏|绝不出戏|完全沉浸为真实人类|真实世界的人类|普通人类|现实生活中的真实人类)/i,
];

/**
 * Deterministically classify a character's offline identity awareness strictly from their persona.
 * - Explicitly self-aware AI persona -> 'self_aware_ai'
 * - Real-world character OR ambiguous / unspecified -> 'immersive_character'
 */
export function detectAwarenessModeFromPersona(
  character: Pick<AiCharacter, 'persona' | 'personality' | 'relationship' | 'name'> | null | undefined
): AwarenessDetectionResult {
  if (!character) {
    return {
      awarenessMode: 'immersive_character',
      awarenessSource: 'persona',
      awarenessLocked: true,
    };
  }

  const combinedText = [character.persona || '', character.personality || '', character.relationship || '']
    .join('\n')
    .trim();

  if (!combinedText) {
    return {
      awarenessMode: 'immersive_character',
      awarenessSource: 'persona',
      awarenessLocked: true,
    };
  }

  // Strip explicit negation clauses first so "不是AI/绝非人工智能" never falsely triggers self_aware_ai
  let sanitized = combinedText;
  for (const neg of HUMAN_OR_NEGATION_PATTERNS) {
    if (neg.test(sanitized)) {
      sanitized = sanitized.replace(neg, '');
    }
  }

  for (const rule of SELF_AWARE_EXPLICIT_PATTERNS) {
    if (rule.regex.test(sanitized)) {
      return {
        awarenessMode: 'self_aware_ai',
        awarenessSource: 'persona',
        awarenessLocked: true,
        matchedHint: rule.label,
      };
    }
  }

  // Default strictly to immersive_character when persona is a real-world role or ambiguous
  return {
    awarenessMode: 'immersive_character',
    awarenessSource: 'persona',
    awarenessLocked: true,
  };
}
