/**
 * proactiveBusyParser.ts
 * Parses natural Chinese/English user replies for busy, work, sleep, or explicit temporary DND durations.
 *
 * Rules:
 * - Explicit user duration (e.g. "我要上班三个小时", "30小时后再聊") is honored directly and may exceed AI's 24h cap.
 * - Explicit clock time (e.g. "下午五点下班", "17:30以后再说", "明早8点联系") resolves to the exact next occurrence.
 * - Implicit busy/work/sleep statements without explicit duration (e.g. "我在上班", "先去睡了", "在开会")
 *   use a finite safe default duration (NEVER infinite!).
 */

export interface UserBusyPauseIntent {
  matched: boolean;
  pauseUntilMs?: number;
  durationMinutes?: number;
  reason?: string;
  isExplicitUserDuration: boolean;
  category?: 'work' | 'sleep' | 'meeting' | 'busy' | 'explicit_time';
}

const CN_NUM_MAP: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  俩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseChineseOrArabicNumber(raw: string): number | null {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }
  if (s === '半') return 0.5;
  if (s.includes('个半') || s.endsWith('半')) {
    const baseStr = s.replace(/个半$/, '').replace(/半$/, '');
    const base = baseStr ? parseChineseOrArabicNumber(baseStr) : 0;
    return base !== null ? base + 0.5 : 0.5;
  }

  // Handle simple Chinese integers up to 99 (e.g. 十, 十二, 二十, 二十四, 三十)
  if (s.includes('十')) {
    const parts = s.split('十');
    const tens = parts[0] ? CN_NUM_MAP[parts[0]] : 1;
    const ones = parts[1] ? CN_NUM_MAP[parts[1]] : 0;
    if (tens !== undefined && ones !== undefined) {
      return tens * 10 + ones;
    }
  }

  if (s.length === 1 && CN_NUM_MAP[s] !== undefined) {
    return CN_NUM_MAP[s];
  }

  return null;
}

const BUSY_CONTEXT_PATTERN =
  /(上班|工作|打工|加班|搬砖|值班|下班|开会|会议|上课|考试|学习|自习|写作业|复习|睡觉|去睡|先睡|睡了|晚安|补觉|午睡|小睡|在忙|有点忙|很忙|忙着|忙完|没空|没时间|抽不开身|先不聊|一会儿再聊|等会再说|稍后再|再联系|别打扰|别找我|先忙|开车|看电影|健身)/i;

const NEGATION_PATTERN = /(不忙了|下班了|睡醒了|醒了|有空了|忙完了|开完会了|没事了|可以聊了)/;

function detectCategoryAndReason(text: string): {
  category: UserBusyPauseIntent['category'];
  reason: string;
} {
  if (/(睡觉|去睡|先睡|睡了|晚安|补觉|午睡|小睡)/.test(text)) {
    return { category: 'sleep', reason: '用户表示正在睡觉/休息' };
  }
  if (/(开会|会议|上课|考试)/.test(text)) {
    return { category: 'meeting', reason: '用户正在开会或上课' };
  }
  if (/(上班|下班|工作|加班|值班|打工|搬砖)/.test(text)) {
    return { category: 'work', reason: '用户表示正在上班' };
  }
  if (/(在忙|很忙|有点忙|忙着|忙完|没空|没时间|抽不开身|开车|先忙|别打扰|别找我)/.test(text)) {
    return { category: 'busy', reason: '用户表示暂时没空' };
  }
  return { category: 'explicit_time', reason: '用户约定稍后再联系' };
}

/**
 * Parse a user message to detect whether temporary proactive DND should be enabled.
 * Always returns a finite timestamp when matched.
 */
export function parseUserBusyPauseIntent(
  text: string,
  nowMs: number = Date.now(),
  knownOffWorkHour?: number
): UserBusyPauseIntent {
  const cleaned = (text || '').trim();
  if (!cleaned) {
    return { matched: false, isExplicitUserDuration: false };
  }

  // If user explicitly says they are free now, do not trigger a busy pause
  if (NEGATION_PATTERN.test(cleaned) && !/(还要|再忙|去上班|再去睡|别打扰)/.test(cleaned)) {
    return { matched: false, isExplicitUserDuration: false };
  }

  const { category, reason } = detectCategoryAndReason(cleaned);
  const hasBusyKeyword = BUSY_CONTEXT_PATTERN.test(cleaned);

  // 1. Explicit relative duration:
  // e.g. "三个小时后再说", "我要上班三个小时", "半小时后", "30小时后", "45分钟后", "2天后"
  const relativeHourHalfMatch = cleaned.match(
    /([零〇一二两俩三四五六七八九十\d]+)\s*个?\s*半\s*(?:小时|钟头)/
  );
  if (relativeHourHalfMatch && (hasBusyKeyword || /(后|再|忙|别)/.test(cleaned))) {
    const baseNum = parseChineseOrArabicNumber(relativeHourHalfMatch[1]);
    if (baseNum !== null && baseNum >= 0) {
      const hours = baseNum + 0.5;
      const durationMinutes = Math.max(15, Math.min(7 * 24 * 60, Math.round(hours * 60)));
      return {
        matched: true,
        durationMinutes,
        pauseUntilMs: nowMs + durationMinutes * 60000,
        reason,
        isExplicitUserDuration: true,
        category,
      };
    }
  }

  const halfHourMatch = cleaned.match(/半\s*(?:个)?(?:小时|钟头)/);
  if (halfHourMatch && (hasBusyKeyword || /(后|再|忙|别)/.test(cleaned))) {
    return {
      matched: true,
      durationMinutes: 30,
      pauseUntilMs: nowMs + 30 * 60000,
      reason,
      isExplicitUserDuration: true,
      category,
    };
  }

  const relativeDurationMatch = cleaned.match(
    /([零〇一二两俩三四五六七八九十\d]+(?:\.\d+)?)\s*(?:个)?\s*(小时|钟头|h|hr|hours?|分钟|分|min|mins?|minutes?|天|日)/i
  );
  if (relativeDurationMatch && (hasBusyKeyword || /(后|再说|再聊|再联系|再找|别打扰|别管)/.test(cleaned))) {
    const value = parseChineseOrArabicNumber(relativeDurationMatch[1]);
    const unit = relativeDurationMatch[2].toLowerCase();
    if (value !== null && value > 0) {
      let durationMinutes = 0;
      if (unit === '天' || unit === '日') {
        durationMinutes = Math.round(value * 24 * 60);
      } else if (unit.startsWith('h') || unit === '小时' || unit === '钟头') {
        durationMinutes = Math.round(value * 60);
      } else {
        durationMinutes = Math.round(value);
      }
      // Clamp extreme nonsense (e.g. 99999 days) to 7 days max, minimum 10 min, allowing > 24h when user explicitly says e.g. 30h
      durationMinutes = Math.max(10, Math.min(7 * 24 * 60, durationMinutes));
      return {
        matched: true,
        durationMinutes,
        pauseUntilMs: nowMs + durationMinutes * 60000,
        reason,
        isExplicitUserDuration: true,
        category,
      };
    }
  }

  // 2. Explicit clock time:
  // e.g. "下午五点下班", "下午5点半后再聊", "17:30以后", "明早8点再联系", "晚上十点后"
  const clockMatch = cleaned.match(
    /(明早|明天早上|明天上午|明天下午|明天晚上|明天|今晚|今天晚上|今天下午|下午|傍晚|晚上|上午|早上|凌晨)?\s*([零〇一二两俩三四五六七八九十\d]{1,3})\s*(?:点|:|：)\s*(半|[零〇一二两俩三四五六七八九十\d]{1,2})?(?:\s*分)?\s*(?:下班|以后|之后|后|再说|再聊|再联系|再找|结束|放学|散会|起床|醒)?/
  );
  if (
    clockMatch &&
    (hasBusyKeyword || /(下班|以后|之后|后|再说|再聊|再联系|结束|放学|散会|起床)/.test(cleaned))
  ) {
    const period = clockMatch[1] || '';
    const hourNum = parseChineseOrArabicNumber(clockMatch[2]);
    let minuteNum = 0;
    if (clockMatch[3] === '半') {
      minuteNum = 30;
    } else if (clockMatch[3]) {
      const parsedMin = parseChineseOrArabicNumber(clockMatch[3]);
      if (parsedMin !== null && parsedMin >= 0 && parsedMin < 60) {
        minuteNum = parsedMin;
      }
    }

    if (hourNum !== null && hourNum >= 0 && hourNum <= 24) {
      let resolvedHour = Math.floor(hourNum);
      if (/(下午|傍晚|晚上|今晚)/.test(period) && resolvedHour >= 1 && resolvedHour <= 11) {
        resolvedHour += 12;
      } else if (!period && /(下班)/.test(cleaned) && resolvedHour >= 1 && resolvedHour <= 8) {
        // "五点下班" typically means 17:00
        resolvedHour += 12;
      }
      if (resolvedHour === 24) resolvedHour = 0;

      const target = new Date(nowMs);
      if (period.includes('明')) {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(resolvedHour, minuteNum, 0, 0);

      // If target time is already in the past (and wasn't explicitly tomorrow), roll forward
      if (target.getTime() <= nowMs + 60000) {
        if (!period && resolvedHour < 12 && resolvedHour + 12 <= 23) {
          target.setHours(resolvedHour + 12, minuteNum, 0, 0);
        }
        if (target.getTime() <= nowMs + 60000) {
          target.setDate(target.getDate() + 1);
        }
      }

      const diffMin = Math.round((target.getTime() - nowMs) / 60000);
      if (diffMin >= 5 && diffMin <= 7 * 24 * 60) {
        return {
          matched: true,
          durationMinutes: diffMin,
          pauseUntilMs: target.getTime(),
          reason,
          isExplicitUserDuration: true,
          category,
        };
      }
    }
  }

  // 3. Implicit busy/work/sleep statements without explicit duration -> finite safe defaults
  if (hasBusyKeyword) {
    if (category === 'sleep') {
      // Nap vs night sleep
      if (/(午睡|小睡|眯一会|睡一会)/.test(cleaned)) {
        return {
          matched: true,
          durationMinutes: 90,
          pauseUntilMs: nowMs + 90 * 60000,
          reason: '用户表示正在午睡/小睡',
          isExplicitUserDuration: false,
          category: 'sleep',
        };
      }
      // Night sleep: until next morning 08:00 (bounded to 4h..10h, fallback 7h)
      const wakeTarget = new Date(nowMs);
      const hourNow = wakeTarget.getHours();
      if (hourNow >= 20 || hourNow < 5) {
        if (hourNow >= 20) wakeTarget.setDate(wakeTarget.getDate() + 1);
        wakeTarget.setHours(8, 0, 0, 0);
        const mins = Math.max(240, Math.min(600, Math.round((wakeTarget.getTime() - nowMs) / 60000)));
        return {
          matched: true,
          durationMinutes: mins,
          pauseUntilMs: nowMs + mins * 60000,
          reason,
          isExplicitUserDuration: false,
          category: 'sleep',
        };
      }
      return {
        matched: true,
        durationMinutes: 420,
        pauseUntilMs: nowMs + 420 * 60000,
        reason,
        isExplicitUserDuration: false,
        category: 'sleep',
      };
    }

    if (category === 'work') {
      if (typeof knownOffWorkHour === 'number' && knownOffWorkHour >= 12 && knownOffWorkHour <= 23) {
        const offWork = new Date(nowMs);
        offWork.setHours(knownOffWorkHour, 0, 0, 0);
        const diffMin = Math.round((offWork.getTime() - nowMs) / 60000);
        if (diffMin >= 30 && diffMin <= 10 * 60) {
          return {
            matched: true,
            durationMinutes: diffMin,
            pauseUntilMs: offWork.getTime(),
            reason,
            isExplicitUserDuration: false,
            category: 'work',
          };
        }
      }
      // Safe finite default: 3 hours (180 minutes)
      return {
        matched: true,
        durationMinutes: 180,
        pauseUntilMs: nowMs + 180 * 60000,
        reason,
        isExplicitUserDuration: false,
        category: 'work',
      };
    }

    if (category === 'meeting') {
      return {
        matched: true,
        durationMinutes: 90,
        pauseUntilMs: nowMs + 90 * 60000,
        reason,
        isExplicitUserDuration: false,
        category: 'meeting',
      };
    }

    // General "在忙 / 暂时没空 / 先不聊"
    return {
      matched: true,
      durationMinutes: 90,
      pauseUntilMs: nowMs + 90 * 60000,
      reason,
      isExplicitUserDuration: false,
      category: 'busy',
    };
  }

  return { matched: false, isExplicitUserDuration: false };
}
