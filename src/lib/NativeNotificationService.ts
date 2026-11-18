import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  androidPermissionBridgeClient,
  NativeNotificationResult,
} from './agent/AndroidPermissionBridgeClient';

export type { NativeNotificationResult };

export interface NotifyAiMessageOptions {
  messageId?: string;
  bubbleIndex?: number;
  timestamp?: number;
  forceForTest?: boolean;
  triggerSource?: string;
}

const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_MAX_ENTRIES = 250;

/**
 * Generates a deterministic positive 31-bit integer notification ID from bubble metadata.
 * Ensures sequential bubbles never collide or overwrite one another in the Android shade.
 */
export function generateStableNotificationId(params: {
  aiId: string;
  messageId?: string;
  bubbleIndex?: number;
  timestamp?: number;
}): number {
  const key = `${params.aiId || 'ai'}|${params.messageId || params.timestamp || 0}|${params.bubbleIndex ?? 0}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const positive31 = hash & 0x7fffffff;
  return positive31 === 0 ? 1 : positive31;
}

async function prepareAvatarForNative(avatar?: string): Promise<string> {
  if (!avatar || typeof avatar !== 'string') return '';
  const trimmed = avatar.trim();
  if (!trimmed || trimmed.startsWith('/')) {
    return '';
  }
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (!trimmed.startsWith('blob:') || typeof document === 'undefined' || typeof Image === 'undefined') {
    return '';
  }

  // Fast bounded conversion for blob: URLs; never block notification delivery
  return await new Promise<string>((resolve) => {
    let settled = false;
    const finish = (val: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };

    const timer = setTimeout(() => finish(''), 350);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish('');
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          finish(canvas.toDataURL('image/jpeg', 0.78));
        } catch {
          finish('');
        }
      };
      img.onerror = () => finish('');
      img.src = trimmed;
    } catch {
      finish('');
    }
  });
}

class NativeNotificationService {
  private static instance: NativeNotificationService;
  private isAppActive: boolean = true;
  private listenersInitialized: boolean = false;
  private recentlyNotifiedMessageIds = new Map<string, number>();
  private inFlightMessageIds = new Set<string>();
  private fallbackSequence = 0;

  private constructor() {
    this.initAppStateListeners();
  }

  public static getInstance(): NativeNotificationService {
    if (!NativeNotificationService.instance) {
      NativeNotificationService.instance = new NativeNotificationService();
    }
    return NativeNotificationService.instance;
  }

  private initAppStateListeners(): void {
    if (this.listenersInitialized || typeof window === 'undefined') {
      return;
    }
    this.listenersInitialized = true;

    const isNativePlatform = Capacitor.isNativePlatform();

    if (typeof document !== 'undefined') {
      this.isAppActive = document.visibilityState === 'visible';
      document.addEventListener('visibilitychange', () => {
        // On native Android, Capacitor appStateChange is authoritative when available;
        // still allow visibilitychange to track hidden transitions promptly.
        if (!isNativePlatform || document.visibilityState === 'hidden') {
          this.isAppActive = document.visibilityState === 'visible';
        }
      });
    }

    if (!isNativePlatform) {
      window.addEventListener('focus', () => {
        this.isAppActive = true;
      });
      window.addEventListener('blur', () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          this.isAppActive = false;
        }
      });
    }

    if (Capacitor.isPluginAvailable('App')) {
      try {
        if (typeof App.getState === 'function') {
          App.getState()
            .then((state) => {
              this.isAppActive = Boolean(state.isActive);
            })
            .catch(() => {});
        }
        App.addListener('appStateChange', (state: { isActive: boolean }) => {
          this.isAppActive = Boolean(state.isActive);
        }).catch((err) => {
          console.warn('[NativeNotificationService] App.addListener error:', err);
        });
      } catch (e) {
        console.warn('[NativeNotificationService] Capacitor App listener init failed:', e);
      }
    }
  }

  public getIsAppActive(): boolean {
    return this.isAppActive;
  }

  public setAppActiveForTesting(active: boolean): void {
    this.isAppActive = active;
  }

  private pruneDedupCache(now: number): void {
    if (this.recentlyNotifiedMessageIds.size <= DEDUP_MAX_ENTRIES) {
      for (const [id, ts] of this.recentlyNotifiedMessageIds.entries()) {
        if (now - ts > DEDUP_TTL_MS) {
          this.recentlyNotifiedMessageIds.delete(id);
        }
      }
      return;
    }
    const entries = Array.from(this.recentlyNotifiedMessageIds.entries()).sort((a, b) => a[1] - b[1]);
    const removeCount = entries.length - Math.floor(DEDUP_MAX_ENTRIES / 2);
    for (let i = 0; i < removeCount; i++) {
      this.recentlyNotifiedMessageIds.delete(entries[i][0]);
    }
  }

  public async notifyAiMessage(
    character: { id: string; name: string; avatar?: string },
    text: string,
    options?: NotifyAiMessageOptions
  ): Promise<NativeNotificationResult> {
    const aiId = character?.id || 'default_ai';
    const title = (character?.name || '').trim() || 'AI 消息';
    const body = (text || '').trim();
    const forceForTest = Boolean(options?.forceForTest);
    const timestamp = options?.timestamp && options.timestamp > 0 ? options.timestamp : Date.now();
    const bubbleIndex = options?.bubbleIndex ?? 0;

    if (!body) {
      return {
        success: false,
        code: 'INVALID_ARGUMENT',
        message: '通知内容为空，已跳过',
      };
    }

    if (this.isAppActive && !forceForTest) {
      return {
        success: false,
        code: 'SKIPPED_APP_FOREGROUND',
        message: '应用处于前台，跳过系统状态栏通知',
      };
    }

    const messageId = options?.messageId;
    const now = Date.now();
    this.pruneDedupCache(now);

    if (messageId && !forceForTest) {
      const prevTs = this.recentlyNotifiedMessageIds.get(messageId);
      if ((prevTs !== undefined && now - prevTs < DEDUP_TTL_MS) || this.inFlightMessageIds.has(messageId)) {
        return {
          success: false,
          code: 'DUPLICATE_MESSAGE_SKIPPED',
          message: '该消息气泡已触发过通知，已跳过重复发送',
        };
      }
      this.inFlightMessageIds.add(messageId);
    }

    const stableSeed = messageId
      ? { aiId, messageId, bubbleIndex, timestamp }
      : { aiId, messageId: `auto_${timestamp}_${++this.fallbackSequence}`, bubbleIndex, timestamp };
    const notificationId = generateStableNotificationId(stableSeed);

    try {
      if (androidPermissionBridgeClient.isNativeAndroid()) {
        const preparedAvatar = await prepareAvatarForNative(character?.avatar);
        const result = await androidPermissionBridgeClient.showAiMessageNotification({
          aiId,
          title,
          body,
          avatar: preparedAvatar,
          notificationId,
          timestamp,
          groupKey: `ai_chat_${aiId}`,
        });

        if (messageId && !forceForTest && result.success) {
          this.recentlyNotifiedMessageIds.set(messageId, Date.now());
        }

        console.info(
          `[NativeNotificationService] native notify result: code=${result.code} success=${result.success} aiId=${aiId} id=${notificationId} source=${options?.triggerSource || 'unknown'}`
        );
        return result;
      }

      // Non-native Web Preview fallback: honestly report Web behavior and never pretend Android APK succeeded
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification(title, {
            body,
            icon: character?.avatar || '/favicon.ico',
            badge: '/favicon.ico',
            tag: `ai_chat_${aiId}_${notificationId}`,
            data: { aiId },
          });
          notif.onclick = () => {
            window.focus();
            window.dispatchEvent(new CustomEvent('open_ai_chat', { detail: { aiId, charId: aiId } }));
          };
          if (messageId && !forceForTest) {
            this.recentlyNotifiedMessageIds.set(messageId, Date.now());
          }
          return {
            success: true,
            code: 'WEB_NOTIFICATION_POSTED',
            message: '已在 Web 预览环境发送浏览器通知（真实状态栏通知需在 Android APK 中验证）',
            notificationId,
          };
        } catch (e: any) {
          return {
            success: false,
            code: 'WEB_NOTIFICATION_FAILED',
            message: e?.message || 'Web Notification 创建失败',
            notificationId,
          };
        }
      }

      return {
        success: false,
        code: 'NOT_NATIVE_ANDROID',
        message: '当前处于 Web 预览环境，未安装 Android APK 或未开启浏览器通知权限',
        notificationId,
      };
    } finally {
      if (messageId) {
        this.inFlightMessageIds.delete(messageId);
      }
    }
  }
}

export const nativeNotificationService = NativeNotificationService.getInstance();
export { NativeNotificationService };
