import type { WeChatThemeId } from '../components/apps/wechat/theme/types';

export interface ChatDisplayPreference {
  messageFontSize: number;
}

export const CHAT_DISPLAY_PREFERENCES_STORAGE_KEY = 'wechat_chat_display_preferences_v1';
export const MIN_CHAT_MESSAGE_FONT_SIZE = 12;
export const MAX_CHAT_MESSAGE_FONT_SIZE = 22;

/**
 * Returns the original default message bubble font size in px for the active WeChat theme:
 * - Default WeChat theme uses Tailwind `text-xs` (0.75rem = 12px)
 * - Classic WeChat theme uses `0.8125rem` (13px)
 */
export function getDefaultChatMessageFontSize(wechatTheme?: WeChatThemeId): number {
  return wechatTheme === 'classic' ? 13 : 12;
}

/**
 * Safely clamps any incoming value (number, numeric string, NaN, out-of-range) into [12, 22].
 */
export function clampChatMessageFontSize(
  value: unknown,
  fallback: number = MIN_CHAT_MESSAGE_FONT_SIZE
): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.min(MAX_CHAT_MESSAGE_FONT_SIZE, Math.max(MIN_CHAT_MESSAGE_FONT_SIZE, Math.round(fallback)))
      : MIN_CHAT_MESSAGE_FONT_SIZE;

  if (value === null || value === undefined || value === '') {
    return safeFallback;
  }

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }

  const rounded = Math.round(parsed);
  return Math.min(MAX_CHAT_MESSAGE_FONT_SIZE, Math.max(MIN_CHAT_MESSAGE_FONT_SIZE, rounded));
}

export type ChatFontPresetId = 'small' | 'standard' | 'large' | 'xlarge';

export interface ChatFontPresetOption {
  id: ChatFontPresetId;
  label: string;
  size: number;
}

export function getChatFontPresets(wechatTheme?: WeChatThemeId): ChatFontPresetOption[] {
  const standardSize = getDefaultChatMessageFontSize(wechatTheme);
  return [
    { id: 'small', label: '小', size: 12 },
    { id: 'standard', label: '标准', size: standardSize },
    { id: 'large', label: '大', size: 18 },
    { id: 'xlarge', label: '特大', size: 21 },
  ];
}

function sanitizePreferencesMap(raw: unknown): Record<string, ChatDisplayPreference> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: Record<string, ChatDisplayPreference> = {};
  for (const [charId, pref] of Object.entries(raw as Record<string, unknown>)) {
    if (!charId || typeof charId !== 'string' || !pref || typeof pref !== 'object') {
      continue;
    }
    const rawSize = (pref as Record<string, unknown>).messageFontSize;
    if (rawSize === undefined || rawSize === null || rawSize === '') {
      continue;
    }
    const parsed = typeof rawSize === 'number' ? rawSize : Number(String(rawSize).trim());
    if (!Number.isFinite(parsed)) {
      continue;
    }
    result[charId] = {
      messageFontSize: clampChatMessageFontSize(parsed, MIN_CHAT_MESSAGE_FONT_SIZE),
    };
  }
  return result;
}

export function loadAllChatDisplayPreferences(): Record<string, ChatDisplayPreference> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }
    const raw = window.localStorage.getItem(CHAT_DISPLAY_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return sanitizePreferencesMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeAllChatDisplayPreferences(map: Record<string, ChatDisplayPreference>): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CHAT_DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage write errors in restricted webviews
  }
}

export function hasCustomChatDisplayPreference(characterId: string | null | undefined): boolean {
  if (!characterId) return false;
  const all = loadAllChatDisplayPreferences();
  return Boolean(all[characterId]);
}

export function getChatDisplayPreference(
  characterId: string | null | undefined,
  wechatTheme?: WeChatThemeId
): ChatDisplayPreference {
  const defaultSize = getDefaultChatMessageFontSize(wechatTheme);
  if (!characterId) {
    return { messageFontSize: defaultSize };
  }
  const all = loadAllChatDisplayPreferences();
  const saved = all[characterId];
  if (!saved) {
    return { messageFontSize: defaultSize };
  }
  return {
    messageFontSize: clampChatMessageFontSize(saved.messageFontSize, defaultSize),
  };
}

export function getEffectiveChatMessageFontSize(
  prefsMap: Record<string, ChatDisplayPreference> | null | undefined,
  characterId: string | null | undefined,
  wechatTheme?: WeChatThemeId
): number {
  const defaultSize = getDefaultChatMessageFontSize(wechatTheme);
  if (!characterId || !prefsMap) {
    return defaultSize;
  }
  const saved = prefsMap[characterId];
  if (!saved) {
    return defaultSize;
  }
  return clampChatMessageFontSize(saved.messageFontSize, defaultSize);
}

export function saveChatDisplayPreference(
  characterId: string,
  preference: Partial<ChatDisplayPreference>,
  wechatTheme?: WeChatThemeId
): Record<string, ChatDisplayPreference> {
  const all = loadAllChatDisplayPreferences();
  if (!characterId) {
    return all;
  }
  const defaultSize = getDefaultChatMessageFontSize(wechatTheme);
  const existing = all[characterId];
  const nextFontSize = clampChatMessageFontSize(
    preference.messageFontSize ?? existing?.messageFontSize,
    defaultSize
  );
  const updated: Record<string, ChatDisplayPreference> = {
    ...all,
    [characterId]: {
      messageFontSize: nextFontSize,
    },
  };
  writeAllChatDisplayPreferences(updated);
  return updated;
}

export function resetChatDisplayPreference(
  characterId: string
): Record<string, ChatDisplayPreference> {
  const all = loadAllChatDisplayPreferences();
  if (!characterId || !(characterId in all)) {
    return all;
  }
  const updated = { ...all };
  delete updated[characterId];
  writeAllChatDisplayPreferences(updated);
  return updated;
}
