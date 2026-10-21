import { weatherService } from '../weatherService';
import { computeCycleStats } from '../menstrual';
import { loadFromStorage } from '../storage';
import { MenstrualData } from '../../types';

const LAST_WEATHER_CARE_PREFIX = 'weather_care_time_';
const LAST_MENSTRUAL_CARE_PREFIX = 'menstrual_care_time_';

/**
 * Weather Context Perception Evaluator
 * Only returns weatherInfo when user explicitly asks OR weather anomaly / morning greeting / cooldown expired (>8h)
 */
export async function evaluateWeatherContext(
  characterId: string,
  combinedUserText: string,
  permissions?: any
): Promise<any | null> {
  if (permissions?.appAccess?.weatherData === false) {
    return null;
  }

  try {
    const weather = await weatherService.getWeather(false).catch(() => null);
    if (!weather || !weather.city) {
      return null;
    }

    const weatherKeywordRegex =
      /天气|下雨|暴雨|阴天|晴天|降温|降水|气温|温度|冷|热|带伞|伞|穿什么|预报|出门|外勤|气象|大风|刮风|多云|温差/i;
    const userTrigger = weatherKeywordRegex.test(combinedUserText);

    const weatherAnomaly =
      (weather.precipProbability !== undefined && weather.precipProbability >= 60) ||
      (weather.precipitation !== undefined && weather.precipitation > 0) ||
      (weather.alerts && weather.alerts.length > 0) ||
      (weather.tempMax !== undefined && weather.tempMin !== undefined && weather.tempMax - weather.tempMin >= 10) ||
      (weather.temp !== undefined && (weather.temp < 5 || weather.temp > 33));

    const currentHour = new Date().getHours();
    const morningGreeting = currentHour >= 6 && currentHour <= 10 && (combinedUserText.includes('早') || combinedUserText.includes('起'));

    const lastCareRaw = localStorage.getItem(LAST_WEATHER_CARE_PREFIX + characterId);
    const lastCareTime = lastCareRaw ? parseInt(lastCareRaw, 10) : 0;
    const cooldownExpired = Date.now() - lastCareTime > 8 * 3600 * 1000;

    const shouldInject = userTrigger || weatherAnomaly || morningGreeting || cooldownExpired;

    if (shouldInject) {
      localStorage.setItem(LAST_WEATHER_CARE_PREFIX + characterId, Date.now().toString());
      return weather;
    }

    return null;
  } catch (err) {
    console.warn('[evaluateWeatherContext] Error:', err);
    return null;
  }
}

/**
 * Menstrual & Health Perception Evaluator
 * Only returns menstrualInfo when user mentions health symptoms OR user is in period/PMS phase and cooldown expired (>12h)
 */
import { permissionManager } from '../agent/PermissionManager';

export async function evaluateMenstrualContext(
  characterId: string,
  combinedUserText: string,
  permissions?: any
): Promise<any | null> {
  if (permissions?.appAccess?.menstrualData === false) {
    return null;
  }

  // Check character-level AI permission for menstrual health privacy
  const aiPerm = permissionManager.checkAiPermission(characterId, 'menstrual_health');
  if (aiPerm === 'DENY') {
    return null;
  }

  try {
    const menstrualData = loadFromStorage<MenstrualData | null>('phone_menstrual_data', null);
    if (!menstrualData || !menstrualData.records || menstrualData.records.length === 0) {
      return null;
    }

    const cycleStats = computeCycleStats(menstrualData);
    if (!cycleStats) return null;

    const healthKeywordRegex =
      /例假|大姨妈|月经|肚子疼|痛经|经期|不舒服|难受|身体不适|小腹|侧腰|胸胀|生病|头晕|腰酸|腹痛/i;
    const userTrigger = healthKeywordRegex.test(combinedUserText);

    const isSpecialPhase = cycleStats.currentPeriodDay !== null || cycleStats.phase === 'pre_period';

    const lastCareRaw = localStorage.getItem(LAST_MENSTRUAL_CARE_PREFIX + characterId);
    const lastCareTime = lastCareRaw ? parseInt(lastCareRaw, 10) : 0;
    const cooldownExpired = Date.now() - lastCareTime > 12 * 3600 * 1000;

    const shouldInject = userTrigger || (isSpecialPhase && cooldownExpired);

    if (shouldInject) {
      localStorage.setItem(LAST_MENSTRUAL_CARE_PREFIX + characterId, Date.now().toString());
      return cycleStats;
    }

    return null;
  } catch (err) {
    console.warn('[evaluateMenstrualContext] Error:', err);
    return null;
  }
}

/**
 * WorldBook Multi-Book Perception & Smart Keyword Evaluator
 */
import { WorldBook } from '../../types';

export interface EvaluatedWorldBookResult {
  associatedBooksCount: number;
  activeBooks: Array<{
    id: string;
    title: string;
    description?: string;
    worldSetting?: string;
    priority?: number;
  }>;
  matchedEntries: Array<{
    bookId: string;
    bookTitle: string;
    entryId: string;
    keyword: string;
    content: string;
    isConstant: boolean;
    priority: number;
  }>;
  promptText: string;
  summaryTitle: string;
}

export function evaluateWorldBookContext(
  characterId: string,
  combinedUserText: string,
  worldBooks: WorldBook[] = [],
  permissions?: any
): EvaluatedWorldBookResult | null {
  if (permissions?.appAccess?.worldBookData === false) {
    return null;
  }

  // 1. Find ALL enabled WorldBooks associated with this AI character
  const associatedBooks = (worldBooks || []).filter(
    (wb) =>
      wb &&
      wb.enabled !== false &&
      Array.isArray(wb.associatedCharacterIds) &&
      wb.associatedCharacterIds.includes(characterId)
  );

  if (associatedBooks.length === 0) {
    return null;
  }

  // Sort books by priority (descending)
  associatedBooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const lowerUserText = (combinedUserText || '').toLowerCase();
  const matchedEntriesMap = new Map<
    string,
    {
      bookId: string;
      bookTitle: string;
      entryId: string;
      keyword: string;
      content: string;
      isConstant: boolean;
      priority: number;
      score: number;
    }
  >();

  // 2. Iterate through ALL associated books
  for (const book of associatedBooks) {
    const bookPriority = book.priority || 0;
    const entries = book.entries || [];

    for (const entry of entries) {
      if (entry.enabled === false) continue; // Skip disabled entry

      const entryPriority = entry.priority || 0;
      const score = bookPriority * 100 + entryPriority;
      const rawKeyword = (entry.keyword || '').trim();

      const isConstant =
        entry.constant === true ||
        rawKeyword === '*' ||
        rawKeyword.toLowerCase() === '常驻' ||
        rawKeyword === '';

      let isMatched = isConstant;

      if (!isMatched && rawKeyword) {
        // Split keywords by comma, pipe, or whitespace
        const tokens = rawKeyword
          .split(/[,||\s\n，|]+/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        for (const token of tokens) {
          if (token && lowerUserText.includes(token)) {
            isMatched = true;
            break;
          }
        }
      }

      if (isMatched) {
        const key = `${entry.keyword.trim().toLowerCase()}_${entry.content.trim()}`;
        const existing = matchedEntriesMap.get(key);
        // Keep highest priority entry upon collision
        if (!existing || existing.score < score) {
          matchedEntriesMap.set(key, {
            bookId: book.id,
            bookTitle: book.title,
            entryId: entry.id,
            keyword: entry.keyword || '世界设定',
            content: entry.content,
            isConstant,
            priority: entryPriority,
            score,
          });
        }
      }
    }
  }

  // 3. Sort matched entries by priority score (descending)
  const sortedEntries = Array.from(matchedEntriesMap.values()).sort((a, b) => b.score - a.score);

  // 4. Apply Context Capacity Guard (Limit total content length <= 3000 chars)
  const MAX_CHAR_CAPACITY = 3000;
  let currentLength = 0;
  const cappedEntries: typeof sortedEntries = [];

  for (const entry of sortedEntries) {
    if (currentLength + entry.content.length > MAX_CHAR_CAPACITY && cappedEntries.length > 0) {
      break; // Capacity reached
    }
    cappedEntries.push(entry);
    currentLength += entry.content.length;
  }

  // 5. Format prompt text for AI system context
  const activeBooksSummary = associatedBooks
    .map((b, idx) => {
      let text = `${idx + 1}. 《${b.title}》`;
      if (b.worldSetting) text += `\n   - 核心法则/背景: ${b.worldSetting}`;
      return text;
    })
    .join('\n');

  let entriesFormattedText = '';
  if (cappedEntries.length > 0) {
    entriesFormattedText =
      '\n【专有名词与词条背景库】:\n' +
      cappedEntries.map((e) => `* [《${e.bookTitle}》· ${e.keyword}]: ${e.content}`).join('\n');
  }

  const promptText = `【🌌 已绑定世界书（共 ${associatedBooks.length} 本）· 世界观法则与词条库】\n${activeBooksSummary}${entriesFormattedText}\n【演职法则】：你当前置身于上述世界观法则中。请自然融入上述所有世界观背景与词条规则进行沉浸式互动回复。`;

  const summaryTitle = associatedBooks.map((b) => `《${b.title}》`).join(' + ');

  return {
    associatedBooksCount: associatedBooks.length,
    activeBooks: associatedBooks.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      worldSetting: b.worldSetting,
      priority: b.priority,
    })),
    matchedEntries: cappedEntries.map((e) => ({
      bookId: e.bookId,
      bookTitle: e.bookTitle,
      entryId: e.entryId,
      keyword: e.keyword,
      content: e.content,
      isConstant: e.isConstant,
      priority: e.priority,
    })),
    promptText,
    summaryTitle,
  };
}
