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

const wechatThemeListeners = new Set<(themeId: WeChatThemeId) => void>();

export const saveWeChatTheme = (themeId: WeChatThemeId): WeChatThemeId => {
  const safeTheme: WeChatThemeId = isValidWeChatTheme(themeId) ? themeId : 'default';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(WECHAT_THEME_STORAGE_KEY, safeTheme);
    }
  } catch {
    // Ignore storage write errors in restricted webviews
  }
  wechatThemeListeners.forEach((listener) => {
    try {
      listener(safeTheme);
    } catch {
      // Ignore subscriber exceptions
    }
  });
  return safeTheme;
};

export const subscribeWeChatTheme = (
  listener: (themeId: WeChatThemeId) => void
): (() => void) => {
  wechatThemeListeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === WECHAT_THEME_STORAGE_KEY) {
      listener(isValidWeChatTheme(event.newValue) ? event.newValue : 'default');
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    wechatThemeListeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
};

