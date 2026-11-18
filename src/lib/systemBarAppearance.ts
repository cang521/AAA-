import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { WeChatThemeId } from '../components/apps/wechat/theme/types';
import { androidPermissionBridgeClient } from './agent/AndroidPermissionBridgeClient';

export type SystemBarIconStyle = 'light' | 'dark';

export interface SystemBarAppearance {
  statusBarBackground: string;
  statusBarIconStyle: SystemBarIconStyle;
  navigationBarBackground: string;
  navigationBarIconStyle: SystemBarIconStyle;
}

export interface ResolveSystemBarParams {
  effectiveTheme: 'light' | 'dark';
  activeAppId: string | null;
  isLocked: boolean;
  wechatTheme: WeChatThemeId;
}

export const resolveSystemBarAppearance = ({
  effectiveTheme,
  activeAppId,
  isLocked,
  wechatTheme,
}: ResolveSystemBarParams): SystemBarAppearance => {
  const isDark = effectiveTheme === 'dark';

  // WeChat Classic theme uses #EDEDED (light) / #111111 (dark) top bar & #F7F7F7 / #191919 bottom bar
  if (!isLocked && activeAppId === 'wechat' && wechatTheme === 'classic') {
    if (isDark) {
      return {
        statusBarBackground: '#111111',
        statusBarIconStyle: 'light',
        navigationBarBackground: '#191919',
        navigationBarIconStyle: 'light',
      };
    }
    return {
      statusBarBackground: '#EDEDED',
      statusBarIconStyle: 'dark',
      navigationBarBackground: '#F7F7F7',
      navigationBarIconStyle: 'dark',
    };
  }

  // Global Light / Dark appearance (applies to WeChat Default theme and all non-WeChat screens)
  if (isDark) {
    return {
      statusBarBackground: '#090D12',
      statusBarIconStyle: 'light',
      navigationBarBackground: '#090D12',
      navigationBarIconStyle: 'light',
    };
  }

  return {
    statusBarBackground: '#FFFFFF',
    statusBarIconStyle: 'dark',
    navigationBarBackground: '#FFFFFF',
    navigationBarIconStyle: 'dark',
  };
};

let lastAppliedKey = '';

export const applySystemBarAppearance = async (appearance: SystemBarAppearance): Promise<void> => {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--system-status-bar-bg', appearance.statusBarBackground);
    root.style.setProperty('--system-nav-bar-bg', appearance.navigationBarBackground);
    root.style.backgroundColor = appearance.statusBarBackground;
    if (document.body) {
      document.body.style.backgroundColor = appearance.statusBarBackground;
    }
  }

  const applyKey = `${appearance.statusBarBackground}|${appearance.statusBarIconStyle}|${appearance.navigationBarBackground}|${appearance.navigationBarIconStyle}`;
  if (applyKey === lastAppliedKey) {
    return;
  }
  lastAppliedKey = applyKey;

  if (typeof window === 'undefined') {
    return;
  }

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  if (!isNativeAndroid) {
    return;
  }

  // 1. Update @capacitor/status-bar (keeps StatusBar plugin internal state synchronized)
  if (Capacitor.isPluginAvailable('StatusBar')) {
    try {
      await StatusBar.setStyle({
        // Note: In @capacitor/status-bar, Style.Light = dark icons for light backgrounds;
        // Style.Dark = light icons for dark backgrounds.
        style: appearance.statusBarIconStyle === 'dark' ? Style.Light : Style.Dark,
      });
    } catch {
      // Safe fallback in environments where StatusBar.setStyle is unsupported
    }

    try {
      await StatusBar.setBackgroundColor({ color: appearance.statusBarBackground });
    } catch {
      // Ignored on Android 15+ edge-to-edge where pt-safe renders behind transparent status bar
    }
  }

  // 2. Sync WindowInsetsControllerCompat light/dark status & navigation bar icons + window/WebView bg
  await androidPermissionBridgeClient.setSystemBarAppearance(appearance);
};
