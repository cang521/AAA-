/**
 * offlineDisplaySettings.ts
 * Persistent display settings scoped strictly to Offline Mode.
 * Never alters WeChat or launcher global typography.
 */

export type OfflineFontSizeTier = 'sm' | 'md' | 'lg' | 'xl';

export interface OfflineDisplaySettings {
  fontSize: OfflineFontSizeTier;
  showIntimateState: boolean;
}

const STORAGE_KEY = 'aiphone_offline_display_settings_v1';

// Default bumped one level larger than legacy text-xs (12px) -> 'lg' (16px narrative body)
export const DEFAULT_OFFLINE_DISPLAY_SETTINGS: OfflineDisplaySettings = {
  fontSize: 'lg',
  showIntimateState: true,
};

export const OFFLINE_FONT_TIER_OPTIONS: Array<{ value: OfflineFontSizeTier; label: string; samplePx: string }> = [
  { value: 'sm', label: '小', samplePx: '13px' },
  { value: 'md', label: '标准', samplePx: '15px' },
  { value: 'lg', label: '大', samplePx: '17px' },
  { value: 'xl', label: '特大', samplePx: '19px' },
];

export function loadOfflineDisplaySettings(): OfflineDisplaySettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_OFFLINE_DISPLAY_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OFFLINE_DISPLAY_SETTINGS };
    const parsed = JSON.parse(raw);
    const validSizes: OfflineFontSizeTier[] = ['sm', 'md', 'lg', 'xl'];
    const fontSize: OfflineFontSizeTier = validSizes.includes(parsed?.fontSize)
      ? parsed.fontSize
      : DEFAULT_OFFLINE_DISPLAY_SETTINGS.fontSize;
    const showIntimateState =
      typeof parsed?.showIntimateState === 'boolean'
        ? parsed.showIntimateState
        : DEFAULT_OFFLINE_DISPLAY_SETTINGS.showIntimateState;
    return { fontSize, showIntimateState };
  } catch {
    return { ...DEFAULT_OFFLINE_DISPLAY_SETTINGS };
  }
}

export function saveOfflineDisplaySettings(settings: OfflineDisplaySettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[OfflineDisplaySettings] Failed to save settings:', e);
  }
}

export interface OfflineFontScaleClasses {
  dialogue: string;
  action: string;
  userText: string;
  sceneBackground: string;
  timestamp: string;
  stateMini: string;
  stateModalText: string;
  inputText: string;
}

/**
 * Independent typography scale classes scoped to Offline Mode components.
 * Ensures clean wrapping & generous line-height even at 'xl' ("特大").
 */
export function getOfflineFontScaleClasses(tier: OfflineFontSizeTier): OfflineFontScaleClasses {
  switch (tier) {
    case 'sm':
      return {
        dialogue: 'text-[13.5px] leading-[1.7]',
        action: 'text-[12.5px] leading-[1.7]',
        userText: 'text-[13.5px] leading-[1.65]',
        sceneBackground: 'text-[12px] leading-[1.65]',
        timestamp: 'text-[10.5px]',
        stateMini: 'text-[11px]',
        stateModalText: 'text-[12px]',
        inputText: 'text-[13px]',
      };
    case 'md':
      return {
        dialogue: 'text-[15px] leading-[1.75]',
        action: 'text-[14px] leading-[1.75]',
        userText: 'text-[15px] leading-[1.7]',
        sceneBackground: 'text-[13px] leading-[1.7]',
        timestamp: 'text-[11px]',
        stateMini: 'text-[12px]',
        stateModalText: 'text-[13px]',
        inputText: 'text-[14px]',
      };
    case 'xl':
      return {
        dialogue: 'text-[19px] leading-[1.85]',
        action: 'text-[17.5px] leading-[1.85]',
        userText: 'text-[18.5px] leading-[1.8]',
        sceneBackground: 'text-[15.5px] leading-[1.75]',
        timestamp: 'text-[12.5px]',
        stateMini: 'text-[13.5px]',
        stateModalText: 'text-[15px]',
        inputText: 'text-[16px]',
      };
    case 'lg':
    default:
      return {
        dialogue: 'text-[17px] leading-[1.8]',
        action: 'text-[15.5px] leading-[1.8]',
        userText: 'text-[16.5px] leading-[1.75]',
        sceneBackground: 'text-[14px] leading-[1.7]',
        timestamp: 'text-[12px]',
        stateMini: 'text-[12.5px]',
        stateModalText: 'text-[14px]',
        inputText: 'text-[15px]',
      };
  }
}
