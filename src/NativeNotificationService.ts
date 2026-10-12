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

    this.isAppActive = document.visibilityState === 'visible';

    document.addEventListener('visibilitychange', () => {
      this.isAppActive = document.visibilityState === 'visible';
      console.log(`[NativeNotificationService] visibilitychange -> isAppActive=${this.isAppActive}`);
    });

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

  private getCharacterNotificationId(aiId: string): number {
    let hash = 0;
    for (let i = 0; i < aiId.length; i++) {
      hash = (hash << 5) - hash + aiId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 90000 + 1000;
  }

  public notifyAiMessage(
    character: { id: string; name: string; avatar?: string },
    text: string
  ): void {
    if (this.isAppActive) {
      console.log(`[NativeNotificationService] App is active (foreground). Skipping notification for ${character.name}.`);
      return;
    }

    const title = character.name || 'AI 消息';
    const body = text || '';
    const avatarUrl = character.avatar || '/favicon.ico';
    const notifTag = `ai_proactive_${character.id}`;
    const notifNumericId = this.getCharacterNotificationId(character.id);

    console.log(`[NativeNotificationService] App in background. Grouping/updating notification for ${title}: "${body}"`);

    // Web Notification API with group tag to prevent spam & update with latest preview
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: avatarUrl,
            badge: avatarUrl,
            tag: notifTag, // Groups and updates with latest preview
            data: { aiId: character.id },
          });
        } catch (e) {
          console.warn('[NativeNotificationService] Failed to create Web Notification:', e);
        }
      }
    }

    // Capacitor LocalNotifications with fixed ID per character to update/group instead of spamming
    if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.LocalNotifications) {
      try {
        (window as any).Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: notifNumericId, // Fixed ID per character so it updates/groups in notification tray
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
