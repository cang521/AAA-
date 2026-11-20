/**
 * ProactiveScheduler.ts
 * Native-first background scheduler controller for AI Proactive Message System.
 *
 * CRITICAL LIFECYCLE RULES:
 * - Opening the App, returning to foreground, visibilitychange, window focus,
 *   Capacitor appStateChange, or entering WeChat/chat/character views MUST NEVER
 *   trigger proactive message evaluations or AI API calls!
 * - Removed: 3-second startup check, 12-minute foreground setInterval, visibilitychange/focus triggers.
 * - On App startup, start() ONLY:
 *   1. Registers native store sync/cancellation hooks.
 *   2. Idempotently ensures Android WorkManager 1-hour PeriodicWorkRequest is registered
 *      (with ExistingPeriodicWorkPolicy.KEEP — never fires immediately on open!).
 *   3. Drains & merges any messages already created by Android background workers into ChatDB.
 *   4. Passively syncs state changes (settings, DND, pausedUntil, chat saves) to Android native storage.
 */

import {
  ensureHourlyAndroidWorkerRegistered,
  drainAndMergeNativeInbox,
  syncProactiveStateToNative,
  initProactiveNativeStoreHooks,
  scheduleDebouncedNativeSync,
  getNativeWorkerStatus,
  NativeWorkerStatus,
} from './proactiveNativeBridge';
import { loadProactiveRuntimeState, loadProactiveSettings } from './proactiveStore';
import { subscribeChatDb } from '../chatDb';

class ProactiveSchedulerService {
  private static instance: ProactiveSchedulerService;
  private isStarted = false;
  private lastWorkerStatus: NativeWorkerStatus | null = null;
  private cleanupFns: Array<() => void> = [];

  private constructor() {}

  public static getInstance(): ProactiveSchedulerService {
    if (!ProactiveSchedulerService.instance) {
      ProactiveSchedulerService.instance = new ProactiveSchedulerService();
    }
    return ProactiveSchedulerService.instance;
  }

  public isSchedulerActive(): boolean {
    const settings = loadProactiveSettings();
    return this.isStarted && settings.enabled && settings.androidBackgroundEnabled !== false;
  }

  public getLastCheckTime(): number {
    if (this.lastWorkerStatus?.lastInspectionAt) {
      return this.lastWorkerStatus.lastInspectionAt;
    }
    return loadProactiveRuntimeState().lastGlobalCheckAt || 0;
  }

  public getLastWorkerStatus(): NativeWorkerStatus | null {
    return this.lastWorkerStatus;
  }

  public async refreshWorkerStatus(): Promise<NativeWorkerStatus> {
    const status = await getNativeWorkerStatus();
    this.lastWorkerStatus = status;
    return status;
  }

  /**
   * Initialize native Android WorkManager background binding & passive inbox hydration.
   * ZERO proactive trigger checks and ZERO AI API calls are made here!
   */
  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    initProactiveNativeStoreHooks();

    // 1. Drain any messages already saved by Android WorkManager while App was closed (0 API calls),
    //    then idempotently ensure the 1-hour PeriodicWorkRequest is registered, then sync latest state.
    void (async () => {
      try {
        await drainAndMergeNativeInbox();
        await ensureHourlyAndroidWorkerRegistered();
        await syncProactiveStateToNative();
        this.lastWorkerStatus = await getNativeWorkerStatus();
      } catch (e) {
        console.warn('[ProactiveScheduler] Native background initialization warning:', e);
      }
    })();

    if (typeof window !== 'undefined') {
      // Passive settings sync: updates WorkManager registration & native SharedPreferences only
      const handleSettingsUpdated = () => {
        void ensureHourlyAndroidWorkerRegistered();
        scheduleDebouncedNativeSync();
      };
      window.addEventListener('proactive_settings_updated', handleSettingsUpdated);
      this.cleanupFns.push(() => window.removeEventListener('proactive_settings_updated', handleSettingsUpdated));

      // Passive Capacitor resume listener: ONLY drains already-saved native background inbox!
      // Strictly NEVER triggers proactive checks or AI API calls on resume!
      if ((window as any).Capacitor?.Plugins?.App?.addListener) {
        try {
          const promise = (window as any).Capacitor.Plugins.App.addListener(
            'appStateChange',
            (state: { isActive: boolean }) => {
              if (state.isActive) {
                void drainAndMergeNativeInbox().then(() => {
                  scheduleDebouncedNativeSync();
                });
              }
            }
          );
          if (promise && typeof promise.then === 'function') {
            promise
              .then((handle: { remove: () => Promise<void> }) => {
                this.cleanupFns.push(() => {
                  handle.remove().catch(() => {});
                });
              })
              .catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    }

    // Passive ChatDB change listener: keeps native snapshot's lastUserMsgAt & recent messages fresh
    const unsubDb = subscribeChatDb(() => {
      scheduleDebouncedNativeSync();
    });
    this.cleanupFns.push(unsubDb);
  }

  public stop(): void {
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
    this.cleanupFns = [];
    this.isStarted = false;
  }
}

export const proactiveScheduler = ProactiveSchedulerService.getInstance();
