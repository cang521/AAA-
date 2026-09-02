import { MenstrualData, MenstrualRecord } from '../types';

export interface DayStatus {
  dateStr: string; // YYYY-MM-DD
  isPeriod: boolean; // Confirmed pink highlight
  isPredictedPeriod: boolean; // Light pink highlight
  isOvulationDay: boolean; // Ovulation day
  isOvulationWindow: boolean; // Ovulation window (typically 5 days around ovulation)
  periodDayNumber?: number; // 1, 2, 3...
}

export interface CycleStats {
  daysUntilNextPeriod: number;
  currentPeriodDay: number | null; // null if not in period, 1, 2, 3...
  daysUntilOvulation: number;
  currentOvulationDay: number | null; // null if not in ovulation window
  predictedNextStart: string; // YYYY-MM-DD
  avgCycleLength: number;
  avgPeriodDuration: number;
  // Enhanced Physiological Phase & Care
  phase: 'pre_period' | 'period' | 'ovulation' | 'follicular' | 'luteal';
  phaseTitle: string; // e.g. "🌸 经期第 1 天 · 重点温暖守护" or "⚠️ 经前预警 (剩 2 天) · 注意防寒备好用品"
  phaseAdvice: string; // Detailed care tips for AI to reference
  todaySymptoms: string[]; // Symptoms recorded today
  recentNotesSummary: string; // Summary of recent user notes
}

// Calculate weighted average cycle length based on history records
export function calculateAdaptiveMetrics(data: MenstrualData): {
  avgCycle: number;
  avgDuration: number;
} {
  const { records, cycleLength, periodDuration } = data;
  if (!records || records.length < 2) {
    return { avgCycle: cycleLength, avgDuration: periodDuration };
  }

  // Sort records by date ascending
  const sorted = [...records].sort((a, b) => a.startDate.localeCompare(b.startDate));
  
  const cycleDiffs: number[] = [];
  const durations: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.endDate) {
      const dStart = new Date(cur.startDate).getTime();
      const dEnd = new Date(cur.endDate).getTime();
      const durDays = Math.max(1, Math.round((dEnd - dStart) / (1000 * 3600 * 24)) + 1);
      durations.push(durDays);
    }

    if (i > 0) {
      const prevStart = new Date(sorted[i - 1].startDate).getTime();
      const curStart = new Date(cur.startDate).getTime();
      const cycleDays = Math.round((curStart - prevStart) / (1000 * 3600 * 24));
      if (cycleDays > 15 && cycleDays < 50) {
        cycleDiffs.push(cycleDays);
      }
    }
  }

  // Calculate exponential weighted average giving higher weight to recent cycles
  let avgCycle = cycleLength;
  if (cycleDiffs.length > 0) {
    let weightSum = 0;
    let valSum = 0;
    cycleDiffs.forEach((diff, index) => {
      const weight = index + 1; // More recent gets higher weight
      valSum += diff * weight;
      weightSum += weight;
    });
    avgCycle = Math.round(valSum / weightSum);
  }

  let avgDuration = periodDuration;
  if (durations.length > 0) {
    const sum = durations.reduce((a, b) => a + b, 0);
    avgDuration = Math.round(sum / durations.length);
  }

  return { avgCycle, avgDuration };
}

export function computeCycleStats(data: MenstrualData, referenceDate: Date = new Date()): CycleStats {
  const { avgCycle, avgDuration } = calculateAdaptiveMetrics(data);
  const sorted = [...data.records].sort((a, b) => b.startDate.localeCompare(a.startDate)); // descending

  const todayStr = toDateStr(referenceDate);
  const todayTime = referenceDate.getTime();

  let lastStart = sorted.length > 0 ? sorted[0].startDate : todayStr;
  let lastStartDate = new Date(lastStart);

  // If latest recorded start is far in the past, project forward by avgCycle
  let projectedStart = new Date(lastStartDate);
  while (projectedStart.getTime() + avgCycle * 86400000 <= todayTime) {
    projectedStart = new Date(projectedStart.getTime() + avgCycle * 86400000);
  }

  // Check if today falls in an active period record
  let currentPeriodDay: number | null = null;
  const latestRec = sorted[0];
  if (latestRec) {
    const rStart = new Date(latestRec.startDate).getTime();
    const rEnd = latestRec.endDate
      ? new Date(latestRec.endDate).getTime()
      : rStart + (avgDuration - 1) * 86400000;

    if (todayTime >= rStart && todayTime <= rEnd + 86399999) {
      const dayDiff = Math.floor((todayTime - rStart) / 86400000) + 1;
      currentPeriodDay = dayDiff;
    }
  }

  // Calculate next predicted start date
  let nextStart: Date;
  if (currentPeriodDay !== null) {
    // Currently in period, next start is last start + avgCycle
    nextStart = new Date(new Date(sorted[0].startDate).getTime() + avgCycle * 86400000);
  } else {
    // If future or past
    if (todayTime < projectedStart.getTime()) {
      nextStart = projectedStart;
    } else {
      nextStart = new Date(projectedStart.getTime() + avgCycle * 86400000);
    }
  }

  const daysUntilNextPeriod = Math.max(0, Math.ceil((nextStart.getTime() - todayTime) / 86400000));

  // Ovulation calculation: Typically 14 days before next period start
  const ovulationDate = new Date(nextStart.getTime() - 14 * 86400000);
  const daysUntilOvulation = Math.ceil((ovulationDate.getTime() - todayTime) / 86400000);

  // Check if today is in ovulation window (ovulation day +/- 2 days)
  let currentOvulationDay: number | null = null;
  const ovDiffDays = Math.floor((todayTime - ovulationDate.getTime()) / 86400000);
  if (Math.abs(ovDiffDays) <= 2) {
    currentOvulationDay = ovDiffDays + 3; // Day 1 to 5 of ovulation window
  }

  // Determine Physiological Phase & Care Tips
  let phase: CycleStats['phase'] = 'follicular';
  let phaseTitle = '🍃 卵泡期 · 状态良好';
  let phaseAdvice = '激素水平平稳，精力充沛，适合适度运动与工作学习。';

  if (currentPeriodDay !== null) {
    phase = 'period';
    if (currentPeriodDay <= 2) {
      phaseTitle = `🌸 经期第 ${currentPeriodDay} 天 · 重点温暖守护`;
      phaseAdvice = '属于经期痛经/疲劳敏感高峰期。请重点关注下腹保暖、避免生冷辛辣食物与剧烈运动，建议饮用温热红糖姜茶，多注意休息与情绪抚慰。';
    } else {
      phaseTitle = `🌸 经期第 ${currentPeriodDay} 天 · 经期恢复期`;
      phaseAdvice = '经期中后期，注意适度补充温水与清淡营养，避免过度劳累，保持心情舒畅。';
    }
  } else if (daysUntilNextPeriod >= 0 && daysUntilNextPeriod <= 3) {
    phase = 'pre_period';
    phaseTitle = `⚠️ 经前预警 (距经期还有 ${daysUntilNextPeriod} 天) · 提前防护`;
    phaseAdvice = '即将迎来生理期（黄体后期/PMS阶段），可能出现容易疲劳、下腹隐痛或情绪敏感。建议提前准备好卫生用品、暖宝宝与温水，避免受凉与贪吃冷饮。';
  } else if (currentOvulationDay !== null) {
    phase = 'ovulation';
    phaseTitle = '✨ 排卵期 · 激素活跃';
    phaseAdvice = '排卵期阶段，体温略升，身心状态活跃，注意保持水分摄入与规律作息。';
  } else if (daysUntilNextPeriod > 3 && daysUntilNextPeriod <= 10) {
    phase = 'luteal';
    phaseTitle = '🌙 黄体期 · 情绪维稳';
    phaseAdvice = '黄体期阶段，身体代谢平缓，建议清淡饮食、少熬夜，维持平稳好心情。';
  }

  // Extract today's symptoms
  const todaySymptoms = data.symptoms?.[todayStr] || [];

  // Extract recent notes summary (last 30 days)
  const recentNotesList: string[] = [];
  if (data.notes) {
    Object.entries(data.notes).forEach(([dStr, noteText]) => {
      if (noteText && noteText.trim()) {
        const dTime = new Date(dStr).getTime();
        if (todayTime - dTime <= 30 * 86400000 && dTime <= todayTime + 86400000) {
          recentNotesList.push(`[${dStr}]: ${noteText}`);
        }
      }
    });
  }
  const recentNotesSummary = recentNotesList.slice(0, 3).join('； ') || '近期暂无特殊身体不适笔记';

  return {
    daysUntilNextPeriod,
    currentPeriodDay,
    daysUntilOvulation: daysUntilOvulation < 0 ? 0 : daysUntilOvulation,
    currentOvulationDay,
    predictedNextStart: toDateStr(nextStart),
    avgCycleLength: avgCycle,
    avgPeriodDuration: avgDuration,
    phase,
    phaseTitle,
    phaseAdvice,
    todaySymptoms,
    recentNotesSummary,
  };
}

// Alias for convenience
export const calculateCycleStats = computeCycleStats;

export function getMonthDayStatuses(
  year: number,
  month: number, // 0-indexed
  data: MenstrualData
): Record<string, DayStatus> {
  const { avgCycle, avgDuration } = calculateAdaptiveMetrics(data);
  const result: Record<string, DayStatus> = {};

  // Build lookup of confirmed period days
  const periodDaysSet: Record<string, number> = {};

  data.records.forEach((rec) => {
    const start = new Date(rec.startDate);
    const end = rec.endDate
      ? new Date(rec.endDate)
      : new Date(start.getTime() + (avgDuration - 1) * 86400000);

    let curr = new Date(start);
    let dayNum = 1;
    while (curr <= end) {
      const dStr = toDateStr(curr);
      periodDaysSet[dStr] = dayNum;
      curr = new Date(curr.getTime() + 86400000);
      dayNum++;
    }
  });

  // Calculate predicted future periods
  const sorted = [...data.records].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const predictedSet: Record<string, boolean> = {};
  const ovulationDaySet: Record<string, boolean> = {};
  const ovulationWinSet: Record<string, boolean> = {};

  if (sorted.length > 0) {
    const lastRec = sorted[sorted.length - 1];
    let anchor = new Date(lastRec.startDate);

    // Generate predictions for next 12 cycles
    for (let i = 1; i <= 12; i++) {
      const predStart = new Date(anchor.getTime() + i * avgCycle * 86400000);
      // Period prediction
      for (let d = 0; d < avgDuration; d++) {
        const pDay = new Date(predStart.getTime() + d * 86400000);
        const pStr = toDateStr(pDay);
        if (!periodDaysSet[pStr]) {
          predictedSet[pStr] = true;
        }
      }

      // Ovulation prediction (14 days before next start)
      const ovDay = new Date(predStart.getTime() - 14 * 86400000);
      ovulationDaySet[toDateStr(ovDay)] = true;

      for (let offset = -2; offset <= 2; offset++) {
        const winDay = new Date(ovDay.getTime() + offset * 86400000);
        ovulationWinSet[toDateStr(winDay)] = true;
      }
    }
  }

  // Fill month days
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const curDate = new Date(year, month, d);
    const dStr = toDateStr(curDate);
    const isPeriod = Boolean(periodDaysSet[dStr]);
    const isPredictedPeriod = Boolean(predictedSet[dStr]);

    result[dStr] = {
      dateStr: dStr,
      isPeriod,
      isPredictedPeriod: !isPeriod && isPredictedPeriod,
      isOvulationDay: Boolean(ovulationDaySet[dStr]),
      isOvulationWindow: Boolean(ovulationWinSet[dStr]),
      periodDayNumber: periodDaysSet[dStr],
    };
  }

  return result;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
