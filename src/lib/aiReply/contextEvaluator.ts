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
export async function evaluateMenstrualContext(
  characterId: string,
  combinedUserText: string,
  permissions?: any
): Promise<any | null> {
  if (permissions?.appAccess?.menstrualData === false) {
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
