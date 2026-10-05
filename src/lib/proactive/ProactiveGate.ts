/**
 * ProactiveGate.ts
 * Unified Policy Gate for ALL Proactive Messages in AI Studio Applet.
 * 
 * Enforces:
 * 1. Master Toggle (settings.enabled)
 * 2. Temporary Pause (pausedUntil)
 * 3. Per-AI Character Authorization & Permission Levels (proactive_chat)
 * 4. Specific Trigger Toggles (Weather, Menstrual, Greetings, App Usage, etc.)
 * 5. Menstrual Care Explicit Character Authorization
 * 6. Quiet Hours & High-Priority Bypasses
 * 7. Daily Caps & Minimum Cooldown Limits
 * 8. Active Conversation Interruption Guard (suppress casual greetings if user chatted recently)
 * 9. Unified Multi-System Event Deduplication
 */

import {
  loadProactiveSettings,
  loadProactiveRuntimeState,
  saveProactiveRuntimeState,
  ProactiveSettings,
} from './proactiveStore';
import { chatMessageBridge } from '../agent/ChatMessageBridge';
import { permissionManager } from '../agent/PermissionManager';
import { loadCharacters } from '../storage';

export interface GateCheckParams {
  aiId: string;
  triggerType: string;
  priority?: 'high' | 'medium' | 'low';
  eventId: string;
  sourceSystem: 'proactiveEngine' | 'agent';
  eventData?: any;
}

export interface GateCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ProactiveDispatchParams extends GateCheckParams {
  proposedText: string;
  contextSummary?: string;
  thinkingProcess?: string;
}

export interface ProactiveDispatchResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

class ProactiveGateService {
  private static instance: ProactiveGateService;
  private lastGateRejectReason: string = '初始化完成';
  private lastCheckTimestamp: number = 0;

  private constructor() {}

  public static getInstance(): ProactiveGateService {
    if (!ProactiveGateService.instance) {
      ProactiveGateService.instance = new ProactiveGateService();
    }
    return ProactiveGateService.instance;
  }

  public getLastRejectReason(): string {
    return this.lastGateRejectReason;
  }

  public getLastCheckTimestamp(): number {
    return this.lastCheckTimestamp;
  }

  /**
   * Evaluates all 10 unified security & policy checks before sending ANY proactive chat message
   */
  public canSendProactiveMessage(params: GateCheckParams): GateCheckResult {
    this.lastCheckTimestamp = Date.now();
    const settings = loadProactiveSettings();
    const runtimeState = loadProactiveRuntimeState();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const priority = params.priority || 'medium';

    // 1. Check Master Switch
    if (!settings.enabled) {
      const reason = '【Gate 拦截】AI 主动消息总开关已关闭';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 2. Check Temporary Pause
    if (settings.pausedUntil && settings.pausedUntil > Date.now()) {
      const resumeTimeStr = new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const reason = `【Gate 拦截】主动消息处于临时暂停状态 (暂停至 ${resumeTimeStr})`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 3. Check Global "今天别管我" (DND Today) Toggle
    if (permissionManager.isDoNotDisturbToday()) {
      const reason = '【Gate 拦截】全局【今天别管我】免打扰已开启';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 4. Check Per-AI Character Authorization & Permission Level
    const perAiConfig = settings.perAiConfigs[params.aiId];
    const isCharPermittedInSettings =
      perAiConfig?.enabled !== undefined
        ? perAiConfig.enabled
        : settings.allowAllCharacters || settings.allowedCharacterIds.includes(params.aiId);

    if (!isCharPermittedInSettings) {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 在主动消息配置中未授权`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Check Tier 2 Agent Independent Permission for proactive_chat
    const aiAgentConfig = permissionManager.getAiConfig(params.aiId);
    const proactiveChatPerm = aiAgentConfig?.permissions['proactive_chat'];
    if (proactiveChatPerm === 'DENY') {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 的 [proactive_chat] 独立权限为 DENY`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 5. Check Specific Trigger Type Toggles
    const triggerToggleResult = this.checkTriggerSpecificToggle(settings, params.triggerType, params.aiId);
    if (!triggerToggleResult.allowed) {
      this.lastGateRejectReason = triggerToggleResult.reason || '【Gate 拦截】触发类型开关已关闭';
      return triggerToggleResult;
    }

    // 6. Check Character Runtime State (Daily Cap & Cooldown)
    let charRuntime = runtimeState.characterStates[params.aiId] || {
      lastUserMsgAt: Date.now() - 3600000 * 24,
      lastConversationAt: Date.now() - 3600000 * 24,
      lastProactiveMsgAt: 0,
      dailyProactiveCount: 0,
      lastCountResetDateStr: todayStr,
      handledEventIds: [],
    };

    // Reset daily count if date changed
    if (charRuntime.lastCountResetDateStr !== todayStr) {
      charRuntime.dailyProactiveCount = 0;
      charRuntime.lastCountResetDateStr = todayStr;
    }

    if (charRuntime.dailyProactiveCount >= (settings.dailyCap || 3)) {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 今日主动消息触发数已达上限 (${settings.dailyCap}条)`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Check Minimum Cooldown
    const minutesSinceLastProactive = (Date.now() - (charRuntime.lastProactiveMsgAt || 0)) / 60000;
    if (priority !== 'high' && minutesSinceLastProactive < (settings.minCooldownMinutes || 120)) {
      const reason = `【Gate 拦截】触发过频，未满最短冷却时间 (${Math.ceil((settings.minCooldownMinutes || 120) - minutesSinceLastProactive)}分钟后恢复)`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 7. Check Quiet Hours
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const inQuiet = this.isInQuietHours(currentTimeStr, settings.quietHours);
    if (inQuiet) {
      if (priority !== 'high' || !settings.allowHighPriorityBypassQuiet) {
        const reason = `【Gate 拦截】处于免打扰时段 (${settings.quietHours.startStr} - ${settings.quietHours.endStr})`;
        this.lastGateRejectReason = reason;
        return { allowed: false, reason };
      }
    }

    // 8. Interruption Guard: Suppress casual greetings if user chatted recently (< 15 mins)
    const minutesSinceLastUserMsg = (Date.now() - (charRuntime.lastUserMsgAt || 0)) / 60000;
    if (['greeting', 'inactivity_timeout'].includes(params.triggerType) && minutesSinceLastUserMsg < 15) {
      const reason = '【Gate 拦截】用户最近 15 分钟内刚进行过对话，抑制闲聊问候以防打扰';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 9. Event Deduplication
    if (params.eventId && charRuntime.handledEventIds.includes(params.eventId)) {
      const reason = `【Gate 拦截】相同事件 ID [${params.eventId}] 已处理，禁止重复发送`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    this.lastGateRejectReason = '通过 Gate 检测';
    return { allowed: true };
  }

  /**
   * Process dispatch: Checks gate, writes message via ChatMessageBridge, and updates state
   */
  public async dispatchProactiveMessage(params: ProactiveDispatchParams): Promise<ProactiveDispatchResult> {
    const gateResult = this.canSendProactiveMessage(params);
    if (!gateResult.allowed) {
      return { sent: false, reason: gateResult.reason };
    }

    const settings = loadProactiveSettings();
    const runtimeState = loadProactiveRuntimeState();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
      // 1. Post message via ChatMessageBridge with metadata
      const { message, character } = await chatMessageBridge.postProactiveMessage(
        params.aiId,
        params.proposedText,
        params.contextSummary || `【触发类型: ${params.triggerType}】${params.eventId}`
      );

      // 2. Update Runtime State
      let charRuntime = runtimeState.characterStates[params.aiId] || {
        lastUserMsgAt: Date.now() - 3600000 * 24,
        lastConversationAt: Date.now() - 3600000 * 24,
        lastProactiveMsgAt: 0,
        dailyProactiveCount: 0,
        lastCountResetDateStr: todayStr,
        handledEventIds: [],
      };

      charRuntime.lastProactiveMsgAt = Date.now();
      charRuntime.lastUnrepliedProactiveAt = Date.now();
      charRuntime.dailyProactiveCount += 1;
      if (params.eventId) {
        charRuntime.handledEventIds.push(params.eventId);
        if (charRuntime.handledEventIds.length > 50) {
          charRuntime.handledEventIds = charRuntime.handledEventIds.slice(-40);
        }
      }

      runtimeState.characterStates[params.aiId] = charRuntime;
      runtimeState.lastGlobalCheckAt = Date.now();
      saveProactiveRuntimeState(runtimeState);

      // 3. System Notification (if systemNotificationsEnabled is true)
      if (settings.systemNotificationsEnabled) {
        this.showSystemNotification(character.name, params.proposedText, character.id);
      }

      return { sent: true, messageId: message.id };
    } catch (e: any) {
      console.error('[ProactiveGate] Dispatch error:', e);
      return { sent: false, reason: e.message || '发送主动消息失败' };
    }
  }

  private checkTriggerSpecificToggle(settings: ProactiveSettings, triggerType: string, aiId: string): GateCheckResult {
    switch (triggerType) {
      case 'inactivity_timeout':
        if (!settings.inactivity.enabled) return { allowed: false, reason: '长时间未聊天触发器已关闭' };
        break;
      case 'weather_alert':
        if (!settings.weather.enabled) return { allowed: false, reason: '天气关怀触发器已关闭' };
        break;
      case 'menstrual_care':
        if (!settings.menstrual.enabled) return { allowed: false, reason: '经期关怀触发器已关闭' };
        if (!settings.menstrual.allowedCharacterIds.includes(aiId)) {
          return { allowed: false, reason: `角色 [${aiId}] 未获得经期健康数据授权` };
        }
        break;
      case 'greeting':
        if (!settings.greetings.enabled) return { allowed: false, reason: '时间段问候触发器已关闭' };
        break;
      case 'important_event':
        if (!settings.importantEvents.enabled) return { allowed: false, reason: '重要事件提醒已关闭' };
        break;
      case 'followup_topic':
        if (!settings.followupTopics.enabled) return { allowed: false, reason: '待跟进事项追问已关闭' };
        break;
      case 'device_life_event':
        if (!settings.deviceEvents.enabled) return { allowed: false, reason: '设备状态关怀已关闭' };
        break;
      case 'app_usage':
      case 'APP_USAGE_TICK':
        if (settings.appUsage?.enabled === false) return { allowed: false, reason: 'App/小手机使用状态主动关心已关闭' };
        break;
      case 'life_event_followup':
        if (settings.lifeState?.enabled === false || settings.lifeState?.allowProactiveFollowup === false) {
          return { allowed: false, reason: '生活连续性跟进已关闭' };
        }
        break;
    }
    return { allowed: true };
  }

  private isInQuietHours(currentTimeStr: string, quietConfig: { enabled: boolean; startStr: string; endStr: string }): boolean {
    if (!quietConfig.enabled) return false;
    const start = quietConfig.startStr || '23:30';
    const end = quietConfig.endStr || '08:00';
    if (start > end) {
      return currentTimeStr >= start || currentTimeStr < end;
    }
    return currentTimeStr >= start && currentTimeStr < end;
  }

  private showSystemNotification(title: string, body: string, aiId: string) {
    if (typeof window === 'undefined') return;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    } catch (e) {
      console.warn('System Notification error:', e);
    }
  }
}

export const proactiveGate = ProactiveGateService.getInstance();
