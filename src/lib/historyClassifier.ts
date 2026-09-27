import { ChatMessage, HistorySourceType, HistoryImportance } from '../types';

const FOUR_MONTHS_MS = 120 * 24 * 3600 * 1000; // 120 days

/**
 * Determine history source category:
 * 1. live: Current normal chat
 * 2. archived: Normal chat older than 4 months
 * 3. imported: External imported history
 */
export function determineSourceType(
  timestamp: number,
  isImported = false,
  existingSourceType?: HistorySourceType
): HistorySourceType {
  if (existingSourceType) return existingSourceType;
  if (isImported) return 'imported';
  const age = Date.now() - timestamp;
  if (age > FOUR_MONTHS_MS) return 'archived';
  return 'live';
}

/**
 * Determine history importance level:
 * P0 核心: 重大事件、重要约定、关系变化、核心偏好、长期项目等。不能因为时间久自动降级。
 * P1 重要: 有持续价值的重要经历、决定、阶段事件。
 * P2 普通: 一般生活和普通聊天，有一定上下文价值。
 * P3 碎片: “哈哈”“嗯嗯”、重复闲聊、低价值短句等。默认不参与历史检索。
 * P4 噪声: 重复数据、无意义系统记录、错误内容等。永远不能进入AI Prompt。
 */
export function classifyImportance(text: string, existingImportance?: HistoryImportance): HistoryImportance {
  if (existingImportance) return existingImportance;
  if (!text || typeof text !== 'string') return 'P4';

  const clean = text.trim();
  if (!clean) return 'P4';

  // Noise / error patterns
  if (
    clean.includes('[系统错误]') ||
    clean.includes('Error:') ||
    clean.includes('Failed to load') ||
    clean.includes('<!DOCTYPE') ||
    clean.includes('<html')
  ) {
    return 'P4';
  }

  // Trivial casual phrases / fragments (length <= 4 with no substance)
  if (clean.length <= 4) {
    if (/^(哈哈|嗯嗯|好的|对|哦|哦哦|拜拜|1|ok|OK|A|B|C|D|呀|哈|嘻嘻|拉|啊|吧|呢|好)+$/.test(clean)) {
      return 'P3';
    }
  }

  // P0 Core keywords: Major promises, relationships, secrets, deep preferences, birthdays, project commitments
  const p0Keywords = [
    '核心偏好',
    '约定',
    '承诺',
    '秘密',
    '生日',
    '重大',
    '关系',
    '特别喜欢',
    '特别讨厌',
    '最爱',
    '绝对不能',
    '极其重要',
    '一定要记得',
    '不许忘记',
    '梦想',
    '深爱',
    '表白',
    '分手',
    '结婚',
    '毕业',
    '入职',
    '离职',
    '生病',
    '手术',
  ];
  if (p0Keywords.some((k) => clean.includes(k))) {
    return 'P0';
  }

  // P1 Important keywords: Experiences, decisions, projects, events
  const p1Keywords = [
    '决定',
    '打算',
    '计划',
    '项目',
    '总结',
    '经历',
    '旅游',
    '旅行',
    '考试',
    '面试',
    '体会',
    '记录',
    '习惯',
    '推荐',
    '难过',
    '开心',
    '重要',
    '学习',
    '工作',
  ];
  if (p1Keywords.some((k) => clean.includes(k))) {
    return 'P1';
  }

  // P3 Casual filler check
  if (
    clean.length <= 8 &&
    (clean.startsWith('哈哈') || clean.startsWith('嗯嗯') || clean.startsWith('对的') || clean.startsWith('确实'))
  ) {
    return 'P3';
  }

  return 'P2';
}

export function classifyMessage(
  msg: Partial<ChatMessage>,
  options?: { isImported?: boolean }
): { sourceType: HistorySourceType; importance: HistoryImportance } {
  const timestamp = msg.timestamp || Date.now();
  const sourceType = determineSourceType(timestamp, options?.isImported, msg.sourceType);
  const importance = classifyImportance(msg.text || '', msg.importance);
  return { sourceType, importance };
}
