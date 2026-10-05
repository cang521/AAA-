import { ProactiveSettings } from '../../types';
export type { ProactiveSettings };

export const PROACTIVE_SETTINGS_KEY = 'phone_proactive_settings_v2';
export const PROACTIVE_RUNTIME_STATE_KEY = 'phone_proactive_runtime_state_v2';

export interface CharacterProactiveRuntime {
  lastUserMsgAt: number;
  lastConversationAt: number;
  lastProactiveMsgAt: number;
  lastUnrepliedProactiveAt?: number;
  dailyProactiveCount: number;
  lastCountResetDateStr: string; // YYYY-MM-DD
  handledEventIds: string[];
}

export interface ProactiveRuntimeState {
  lastGlobalCheckAt: number;
  lastAppOpenedAt: number;
  characterStates: Record<string, CharacterProactiveRuntime>;
}

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  allowAllCharacters: true,
  allowedCharacterIds: [],
  perAiConfigs: {},

  inactivity: {
    enabled: true,
    hours: 12,
  },
  weather: {
    enabled: true,
    rainSoon: true,
    snowSoon: true,
    tempDrop: true,
    heatWave: true,
    severeWeather: true,
  },
  menstrual: {
    enabled: true,
    daysBefore: 2,
    allowedCharacterIds: [], // Default empty array; women's health data must be explicitly granted
  },
  greetings: {
    enabled: true,
    morning: true,
    noon: true,
    night: true,
  },
  importantEvents: {
    enabled: true,
    notifyBeforeDays: 1,
    notifyOnDay: true,
    allowFollowup: true,
    customEvents: [], // Clean default; no fake demo events
  },
  followupTopics: {
    enabled: true,
    items: [], // Clean default
  },
  deviceEvents: {
    enabled: true,
    lowBattery: true,
    lateNightUsage: true,
    appUnopenedDays: true,
  },
  appUsage: {
    enabled: true,
  },
  lifeState: {
    enabled: true,
    autoExtractFromChat: true,
    allowProactiveFollowup: true,
    sensitivity: 'medium',
  },

  quietHours: {
    enabled: true,
    startStr: '23:30',
    endStr: '08:00',
  },
  dailyCap: 3,
  minCooldownMinutes: 120,
  allowHighPriorityBypassQuiet: true,

  systemNotificationsEnabled: true,
  pausedUntil: undefined,
};

export function loadProactiveSettings(): ProactiveSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_PROACTIVE_SETTINGS;
  try {
    const raw = localStorage.getItem(PROACTIVE_SETTINGS_KEY);
    if (!raw) return DEFAULT_PROACTIVE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROACTIVE_SETTINGS,
      ...parsed,
      inactivity: { ...DEFAULT_PROACTIVE_SETTINGS.inactivity, ...parsed.inactivity },
      weather: { ...DEFAULT_PROACTIVE_SETTINGS.weather, ...parsed.weather },
      menstrual: { ...DEFAULT_PROACTIVE_SETTINGS.menstrual, ...parsed.menstrual },
      greetings: { ...DEFAULT_PROACTIVE_SETTINGS.greetings, ...parsed.greetings },
      importantEvents: { ...DEFAULT_PROACTIVE_SETTINGS.importantEvents, ...parsed.importantEvents },
      followupTopics: { ...DEFAULT_PROACTIVE_SETTINGS.followupTopics, ...parsed.followupTopics },
      deviceEvents: { ...DEFAULT_PROACTIVE_SETTINGS.deviceEvents, ...parsed.deviceEvents },
      quietHours: { ...DEFAULT_PROACTIVE_SETTINGS.quietHours, ...parsed.quietHours },
    };
  } catch (e) {
    console.error('Failed to load proactive settings', e);
    return DEFAULT_PROACTIVE_SETTINGS;
  }
}

export function saveProactiveSettings(settings: ProactiveSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROACTIVE_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event('proactive_settings_updated'));
  } catch (e) {
    console.error('Failed to save proactive settings', e);
  }
}

export function loadProactiveRuntimeState(): ProactiveRuntimeState {
  const defaultState: ProactiveRuntimeState = {
    lastGlobalCheckAt: 0,
    lastAppOpenedAt: Date.now(),
    characterStates: {},
  };
  if (typeof localStorage === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(PROACTIVE_RUNTIME_STATE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch (e) {
    return defaultState;
  }
}

export function saveProactiveRuntimeState(state: ProactiveRuntimeState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROACTIVE_RUNTIME_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save proactive runtime state', e);
  }
}
