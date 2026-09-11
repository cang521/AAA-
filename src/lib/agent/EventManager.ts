import { AgentEvent, AgentEventType } from './types';

type EventListener = (event: AgentEvent) => void;

class EventManager {
  private static instance: EventManager;
  private listeners: Set<EventListener> = new Set();
  private recentEvents: AgentEvent[] = [];
  private maxHistory = 50;

  private constructor() {}

  public static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(type: AgentEventType, payload: Record<string, any> = {}, summary?: string): AgentEvent {
    const event: AgentEvent = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type,
      timestamp: Date.now(),
      payload,
      summary: summary || this.generateDefaultSummary(type, payload),
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxHistory) {
      this.recentEvents.pop();
    }

    // Notify listeners safely
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[EventManager] Listener error:', err);
      }
    });

    return event;
  }

  public getRecentEvents(): AgentEvent[] {
    return [...this.recentEvents];
  }

  public clearHistory(): void {
    this.recentEvents = [];
  }

  private generateDefaultSummary(type: AgentEventType, payload: Record<string, any>): string {
    switch (type) {
      case 'APP_FOREGROUND_CHANGED':
        return `前台应用切换为: ${payload.appName || '未知'}`;
      case 'APP_USAGE_TICK':
        return `应用 [${payload.appName || '当前应用'}] 持续运行已达 ${payload.durationMinutes || 0} 分钟`;
      case 'BATTERY_CHANGED':
        return `电池电量变更: ${payload.level}% ${payload.isCharging ? '(充电中)' : ''}`;
      case 'TIME_PERIOD_CHANGED':
        return `时间段变更: ${payload.periodName || '时段变化'} (${payload.hour}:${String(payload.minute).padStart(2, '0')})`;
      case 'SCENE_CHANGED':
        return `场景切换为: ${payload.sceneName || payload.sceneId || '默认场景'}`;
      case 'MANUAL_TRIGGER':
        return `人工触发动作请求: ${payload.actionTitle || '即时指令'}`;
      case 'PERIODIC_EVALUATION':
        return '周期性 AI 伴随评估巡检';
      default:
        return `系统事件 [${type}]`;
    }
  }
}

export const eventManager = EventManager.getInstance();
