/**
 * ActivityLogger - System Audit Logger
 *
 * All AI activities and permission checks are recorded here.
 * System Rule:
 * 1. AI CANNOT delete, modify, or hide audit records.
 * 2. Activity records are generated strictly by the system layer.
 * 3. Only the user has manual clear/prune authorization.
 */

import { AiActivityLog, ActivityEventType, ActivityPermissionResult, ActivityExecutionResult } from './types';

const STORAGE_KEY = 'mobile_ai_activity_logs_v1';

// Initial realistic audit records so the UI immediately shows informative context
const INITIAL_ACTIVITY_LOGS: AiActivityLog[] = [
  {
    id: 'act_log_1',
    aiId: 'char_1',
    aiName: '林思微',
    timestamp: Date.now() - 1000 * 60 * 18,
    eventType: 'PERMISSION_CHECK',
    requestedAction: '基础感知: 读取手机当前时间与天气状态',
    trigger: '进入微信对话界面，准备主动生成问候语',
    permissionResult: 'ALLOW',
    executionResult: 'SUCCESS',
    metadata: { scene: 'social', timeOfDay: '下午', weather: '晴转多云' },
  },
  {
    id: 'act_log_2',
    aiId: 'char_2',
    aiName: '顾沉',
    timestamp: Date.now() - 1000 * 60 * 42,
    eventType: 'ACTION_REQUEST',
    requestedAction: '屏幕感知: 请求查看当前屏幕画面',
    trigger: '用户停留在游戏界面超过 30 分钟',
    permissionResult: 'DENY',
    executionResult: 'REJECTED',
    failureReason: 'AI 独立权限配置为【DENY (禁止)】，系统拦截执行',
    metadata: { scene: 'gaming', foregroundApp: '原神 (模拟)' },
  },
  {
    id: 'act_log_3',
    aiId: 'char_1',
    aiName: '林思微',
    timestamp: Date.now() - 1000 * 60 * 95,
    eventType: 'ACTION_REQUEST',
    requestedAction: '通知能力: 请求发送经期关怀系统通知',
    trigger: '经期预测第一天生理周期唤醒',
    permissionResult: 'ALLOW',
    executionResult: 'SUCCESS',
    relatedMessageId: 'msg_auto_care_01',
    metadata: { scene: 'general_app', channel: 'NotificationManager' },
  },
  {
    id: 'act_log_4',
    aiId: 'char_caelum',
    aiName: 'Caelum',
    timestamp: Date.now() - 1000 * 60 * 180,
    eventType: 'PERMISSION_CHANGED',
    requestedAction: '权限状态变更: 屏幕感知 ALLOW → DENY',
    trigger: '用户在 AI权限 控制中心手动调整',
    permissionResult: 'PASSED',
    executionResult: 'SUCCESS',
    metadata: { source: 'USER', permissionId: 'screen_view' },
  },
  {
    id: 'act_log_5',
    aiId: 'char_caelum',
    aiName: 'Caelum',
    timestamp: Date.now() - 1000 * 60 * 240,
    eventType: 'CAPABILITY_CHECK',
    requestedAction: '原生服务检测: 请求调用 UsageStatsManager 前台应用检测',
    trigger: 'AI 准备判断当前用户是否在浏览短视频',
    permissionResult: 'BLOCKED',
    executionResult: 'FAILED',
    failureReason: '系统能力不可用: 当前版本尚未实现该原生服务 (NOT_IMPLEMENTED)',
    metadata: { capabilityId: 'usage_stats' },
  },
];

class ActivityLogger {
  private static instance: ActivityLogger;
  private logs: AiActivityLog[] = [];
  private listeners: Array<() => void> = [];

  private constructor() {
    this.loadLogs();
  }

  public static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  private loadLogs() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.logs = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load activity logs from storage:', e);
    }
    this.logs = [...INITIAL_ACTIVITY_LOGS];
    this.persist();
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      // Keep up to 500 records to maintain high performance
      const trimmed = this.logs.slice(0, 500);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to persist activity logs:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.warn('ActivityLogger listener error:', e);
      }
    });
  }

  /**
   * Record an activity into the audit log.
   * Only callable by the system runtime / PermissionManager.
   */
  public log(entry: Omit<AiActivityLog, 'id' | 'timestamp'> & { timestamp?: number }): AiActivityLog {
    const newRecord: AiActivityLog = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: entry.timestamp || Date.now(),
      aiId: entry.aiId,
      aiName: entry.aiName,
      eventType: entry.eventType,
      requestedAction: entry.requestedAction,
      trigger: entry.trigger,
      permissionResult: entry.permissionResult,
      executionResult: entry.executionResult,
      failureReason: entry.failureReason,
      relatedMessageId: entry.relatedMessageId,
      metadata: entry.metadata,
    };

    // Prepend to list
    this.logs = [newRecord, ...this.logs];
    this.persist();
    this.notify();
    return newRecord;
  }

  public getAllLogs(): AiActivityLog[] {
    return [...this.logs];
  }

  public getTodayLogs(): AiActivityLog[] {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const minTimestamp = startOfToday.getTime();
    return this.logs.filter((l) => l.timestamp >= minTimestamp);
  }

  public getLogsForAi(aiId: string): AiActivityLog[] {
    return this.logs.filter((l) => l.aiId === aiId);
  }

  /**
   * User-only action to clear activity records.
   * AI cannot call this!
   */
  public clearAllLogsByUser(): void {
    this.logs = [];
    this.persist();
    this.notify();
  }
}

export const activityLogger = ActivityLogger.getInstance();
