/**
 * ProactiveScheduler.ts
 * Real-time background scheduler for AI Proactive Message System.
 * 
 * Automatically triggers proactive evaluation at key lifecycle points:
 * 1. App Startup
 * 2. App Resume / Return to Foreground (visibilitychange / window focus)
 * 3. Capacitor App Resume
 * 4. Periodic 12-minute background interval
 * 
 * Features O(1) debouncing & single-instance guard to prevent duplicate loops.
 */

import { proactiveEngine } from './proactiveEngine';
import { eventManager } from '../agent/EventManager';
import { deviceContextManager } from '../agent/DeviceContextManager';

class ProactiveSchedulerService {
  private static instance: ProactiveSchedulerService;
  private isStarted = false;
  private isEvaluating = false;
  private lastCheckTime = 0;
  private timerId: any = null;
  private checkIntervalMs = 12 * 60 * 1000; // Every 12 minutes

  private constructor() {}

  public static getInstance(): ProactiveSchedulerService {
    if (!ProactiveSchedulerService.instance) {
      ProactiveSchedulerService.instance = new ProactiveSchedulerService();
    }
    return ProactiveSchedulerService.instance;
  }

  public isSchedulerActive(): boolean {
    return this.isStarted;
  }

  public getLastCheckTime(): number {
    return this.lastCheckTime;
  }

  public getNextEstimatedCheckTime(): number {
    if (!this.lastCheckTime) return Date.now();
    return this.lastCheckTime + this.checkIntervalMs;
  }

  /**
   * Start the scheduler and attach all lifecycle event listeners
   */
  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    // 1. Initial check on startup (delayed 3s to allow UI load)
    setTimeout(() => {
      this.triggerCheck('App 启动事件巡检');
    }, 3000);

    // 2. Periodic interval
    this.timerId = setInterval(() => {
      this.triggerCheck('周期性 12 分钟背景巡检');
    }, this.checkIntervalMs);

    // 3. Browser / Web visibility listener
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          this.triggerCheck('App 回到前台 (visibilitychange)');
        }
      };

      const handleWindowFocus = () => {
        this.triggerCheck('App 重新获得焦点 (focus)');
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleWindowFocus);

      // Capacitor App Resume event if Capacitor is available
      if ((window as any).Capacitor) {
        try {
          const AppPlugin = (window as any).Capacitor.Plugins?.App;
          if (AppPlugin && AppPlugin.addListener) {
            AppPlugin.addListener('appStateChange', (state: { isActive: boolean }) => {
              if (state.isActive) {
                this.triggerCheck('Android Capacitor App Resume');
              }
            });
          }
        } catch (e) {
          console.warn('[ProactiveScheduler] Capacitor App listener error:', e);
        }
      }
    }
  }

  /**
   * Triggers evaluation cycle with 2-minute debouncing
   */
  public async triggerCheck(reason: string): Promise<void> {
    const now = Date.now();
    // Debounce check: at least 2 minutes between execution cycles
    if (this.isEvaluating || now - this.lastCheckTime < 2 * 60 * 1000) {
      return;
    }

    this.isEvaluating = true;
    this.lastCheckTime = now;

    try {
      // 1. Emit Agent periodic event so LocalRuleEngine & AgentOrchestrator receive real events
      const context = await deviceContextManager.getContext();
      eventManager.emit('PERIODIC_EVALUATION', {
        reason,
        app: context.currentApp,
        durationMinutes: context.foregroundDurationMinutes,
        batteryLevel: context.batteryLevel,
        isCharging: context.isCharging,
      });

      // Also emit app usage tick if app usage is active
      if (context.foregroundDurationMinutes >= 15) {
        eventManager.emit('APP_USAGE_TICK', {
          appName: context.currentApp,
          durationMinutes: context.foregroundDurationMinutes,
        });
      }

      // 2. Execute ProactiveEngine Evaluation
      await proactiveEngine.checkAndTriggerProactiveMessages();
    } catch (e) {
      console.error('[ProactiveScheduler] Evaluation error:', e);
    } finally {
      this.isEvaluating = false;
    }
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isStarted = false;
  }
}

export const proactiveScheduler = ProactiveSchedulerService.getInstance();
