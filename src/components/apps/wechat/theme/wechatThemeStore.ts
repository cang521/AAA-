import { WeChatThemeId } from './types';

export const WECHAT_THEME_STORAGE_KEY = 'wechat_theme_v1';

export const isValidWeChatTheme = (value: unknown): value is WeChatThemeId => {
  return value === 'default' || value === 'classic';
};

export const loadWeChatTheme = (): WeChatThemeId => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'default';
    }
    const raw = window.localStorage.getItem(WECHAT_THEME_STORAGE_KEY);
    if (isValidWeChatTheme(raw)) {
      return raw;
    }
    return 'default';
  } catch {
    return 'default';
  }
};

export const saveWeChatTheme = (themeId: WeChatThemeId): WeChatThemeId => {
  const safeTheme: WeChatThemeId = isValidWeChatTheme(themeId) ? themeId : 'default';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(WECHAT_THEME_STORAGE_KEY, safeTheme);
    }
  } catch {
    // Ignore storage write errors in restricted webviews
  }
  return safeTheme;
};
