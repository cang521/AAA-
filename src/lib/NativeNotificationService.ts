import { App } from '@capacitor/app';

class NativeNotificationService {
  private static instance: NativeNotificationService;
  private isAppActive: boolean = true;

  private constructor() {
    this.initAppStateListeners();
  }

  public static getInstance(): NativeNotificationService {
    if (!NativeNotificationService.instance) {
      NativeNotificationService.instance = new NativeNotificationService();
    }
    return NativeNotificationService.instance;
  }

  private initAppStateListeners() {
    if (typeof window === 'undefined') return;

    // Default status based on current document visibility
    this.isAppActive = document.visibilityState === 'visible';

    // 1. Web visibilityState
    document.addEventListener('visibilitychange', () => {
      this.isAppActive = document.visibilityState === 'visible';
      console.log(`[NativeNotificationService] visibilitychange -> isAppActive=${this.isAppActive}`);
    });

    // 2. Window focus & blur
    window.addEventListener('focus', () => {
      this.isAppActive = true;
      console.log('[NativeNotificationService] window focus -> isAppActive=true');
    });

    window.addEventListener('blur', () => {
      if (document.visibilityState !== 'visible') {
        this.isAppActive = false;
        console.log('[NativeNotificationService] window blur & hidden -> isAppActive=false');
      }
    });

    // 3. Capacitor App Plugin listener
    try {
      App.addListener('appStateChange', (state: { isActive: boolean }) => {
        this.isAppActive = state.isActive;
        console.log(`[NativeNotificationService] Capacitor appStateChange -> isAppActive=${this.isAppActive}`);
      }).catch((err) => {
        console.warn('[NativeNotificationService] App.addListener error:', err);
      });
    } catch (e) {
      console.warn('[NativeNotificationService] Capacitor listener init failed:', e);
    }
  }

  public getIsAppActive(): boolean {
    return this.isAppActive;
  }

  public notifyAiMessage(
    character: { id: string; name: string; avatar?: string },
    text: string
  ): void {
    // Requirement 8:
    // App 前台 (isAppActive === true) -> 不发送 Android 系统通知
    // App 后台 (isAppActive === false) -> AI 新消息允许产生 Android 系统通知
    if (this.isAppActive) {
      console.log(`[NativeNotificationService] App is active (foreground). Skipping notification for ${character.name}.`);
      return;
    }

    const title = character.name || 'AI 消息';
    const body = text || '';
    const avatarUrl = character.avatar || '/favicon.ico';

    console.log(`[NativeNotificationService] App in background. Sending notification for ${title}: "${body}"`);

    // Web Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: avatarUrl,
            badge: avatarUrl,
            data: { aiId: character.id },
          });
        } catch (e) {
          console.warn('[NativeNotificationService] Failed to create Web Notification:', e);
        }
      }
    }

    // Capacitor / Native Plugin if available
    if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.LocalNotifications) {
      try {
        (window as any).Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 100000),
              largeIcon: avatarUrl,
              extra: { aiId: character.id },
            },
          ],
        });
      } catch (e) {
        console.warn('[NativeNotificationService] LocalNotifications schedule error:', e);
      }
    }
  }
}

export const nativeNotificationService = NativeNotificationService.getInstance();
export { NativeNotificationService };
