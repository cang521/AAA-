/**
 * ProactiveGate.ts
 * Unified Policy Gate for ALL Proactive Messages in AI Studio Applet.
 *
 * Enforces exact 12-step local inspection order BEFORE any AI API call:
 * 0. API 429 quota cooldown & 503 failure backoff (persisted)
 * 1. Master Toggle (settings.enabled)
 * 2. Global "今天别管我" (doNotDisturbToday)
 * 3. Temporary DND (pausedUntil)
 * 4. Fixed Quiet Hours (quietHours, with high-priority bypass option)
 * 5. Per-AI Authorization & proactive_chat permission + specific trigger toggle
 * 6. AI not currently executing a normal reply task
 * 7. EventId deduplication (handledEventIds)
 * 8. Daily proactive EPISODE cap (counts episodes, NOT individual bubbles or follow-up steps)
 * 9. Minimum cooldown for new episodes (does NOT block scheduled follow-ups of an active episode)
 * 10. Active conversation / real prior chat check (no inactivity without real chat)
 *
 * Also enforces all 9 local pre-send checks for unreplied follow-up steps (+15m -> +60m) with ZERO API calls.
 */

import {
  loadProactiveSettings,
  loadProactiveRuntimeState,
  saveProactiveRuntimeState,
  getCharacterProactiveRuntime,
  getProactiveEpisodeById,
  isEpisodeActiveStatus,
  isStepIdExecuted,
  isMessageIdExecuted,
  ProactiveSettings,
} from './proactiveStore';
import { chatMessageBridge } from '../agent/ChatMessageBridge';
import { permissionManager } from '../agent/PermissionManager';
import { loadPermissions, loadMenstrualData } from '../storage';
import { aiReplyTaskManager } from '../aiReply/AiReplyTaskManager';
import { hasChatMessage } from '../chatDb';
import { isAiInOfflineMode } from '../offline/offlineInteractionState';

export interface GateCheckParams {
  aiId: string;
  triggerType: string;
  priority?: 'high' | 'medium' | 'low';
  eventId: string;
  sourceSystem: 'proactiveEngine' | 'agent' | 'androidBackgroundWorker';
  eventData?: any;
  isFollowUpStep?: boolean;
  nowMs?: number;
}

export interface GateCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ProactiveDispatchParams extends GateCheckParams {
  proposedText: string;
  explicitMessages?: string[];
  deterministicMessageIds?: string[];
  contextSummary?: string;
  thinkingProcess?: string;
  reasoningAvailable?: boolean;
  reasoningSource?: import('../../types').ReasoningSource;
  episodeId?: string;
  stepId?: string;
  intent?: string;
  generatedAt?: number;
  skipTypingDelay?: boolean;
}

export interface ProactiveDispatchResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
  messageIds?: string[];
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

  public markQuotaExhausted(cooldownMs: number = 30 * 60 * 1000): void {
    const rt = loadProactiveRuntimeState();
    rt.quotaExhaustedUntil = Date.now() + Math.max(60000, cooldownMs);
    saveProactiveRuntimeState(rt);
    this.lastGateRejectReason = `【Gate 熔断】AI 模型配额超限(429)，已开启 ${Math.ceil(cooldownMs / 60000)} 分钟避让保护`;
    console.warn(`[ProactiveGate] API 额度超限熔断已开启，静默避让 ${Math.ceil(cooldownMs / 60000)} 分钟`);
  }

  public isQuotaExhausted(nowMs: number = Date.now()): boolean {
    const rt = loadProactiveRuntimeState();
    return Boolean(rt.quotaExhaustedUntil && nowMs < rt.quotaExhaustedUntil);
  }

  public clearQuotaExhaustion(): void {
    const rt = loadProactiveRuntimeState();
    rt.quotaExhaustedUntil = 0;
    rt.backoffUntil = 0;
    rt.consecutiveFailures = 0;
    saveProactiveRuntimeState(rt);
  }

  public getQuotaRemainingMinutes(nowMs: number = Date.now()): number {
    const rt = loadProactiveRuntimeState();
    if (!rt.quotaExhaustedUntil || nowMs >= rt.quotaExhaustedUntil) return 0;
    return Math.ceil((rt.quotaExhaustedUntil - nowMs) / 60000);
  }

  public recordServiceBusyBackoff(): number {
    const rt = loadProactiveRuntimeState();
    const failures = Math.min(5, (rt.consecutiveFailures || 0) + 1);
    const delayMins = Math.min(60, 10 * Math.pow(2, failures - 1));
    rt.consecutiveFailures = failures;
    rt.backoffUntil = Date.now() + delayMins * 60000;
    saveProactiveRuntimeState(rt);
    this.lastGateRejectReason = `【Gate 退避】当前模型繁忙，请稍后重试（已退避 ${delayMins} 分钟）`;
    return delayMins;
  }

  public resetServiceBusyBackoff(): void {
    const rt = loadProactiveRuntimeState();
    if (rt.consecutiveFailures || rt.backoffUntil) {
      rt.consecutiveFailures = 0;
      rt.backoffUntil = 0;
      saveProactiveRuntimeState(rt);
    }
  }

  public isInBackoff(nowMs: number = Date.now()): boolean {
    const rt = loadProactiveRuntimeState();
    return Boolean(rt.backoffUntil && nowMs < rt.backoffUntil);
  }

  public getLastRejectReason(): string {
    return this.lastGateRejectReason;
  }

  public getLastCheckTimestamp(): number {
    return this.lastCheckTimestamp;
  }

  /**
   * Strict 12-step local gate check BEFORE any AI API call or new proactive episode dispatch.
   */
  public canSendProactiveMessage(params: GateCheckParams): GateCheckResult {
    const nowMs = params.nowMs ?? Date.now();
    this.lastCheckTimestamp = nowMs;
    const settings = loadProactiveSettings();
    const runtimeState = loadProactiveRuntimeState();
    const now = new Date(nowMs);
    const priority = params.priority || 'medium';

    // 0a. Persisted 429 Quota Circuit Breaker
    if (this.isQuotaExhausted(nowMs)) {
      const minutesLeft = this.getQuotaRemainingMinutes(nowMs);
      const reason = `【Gate 拦截】AI 模型配额暂时耗尽 (429/限流)，已进入熔断避让保护 (剩余约 ${minutesLeft} 分钟)`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // 0b. Persisted 503/Busy Backoff
    if (!params.isFollowUpStep && this.isInBackoff(nowMs)) {
      const reason = '【Gate 拦截】当前模型繁忙，处于有限退避冷却期内，暂不发起新请求';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 1: Master Switch
    if (!settings.enabled) {
      const reason = '【Gate 拦截】AI 主动消息总开关已关闭';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 2: Global "今天别管我" (DND Today)
    if (permissionManager.isDoNotDisturbToday()) {
      const reason = '【Gate 拦截】全局【今天别管我】免打扰已开启';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 3: Temporary DND pausedUntil
    if (settings.pausedUntil && settings.pausedUntil > nowMs) {
      const resumeTimeStr = new Date(settings.pausedUntil).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const reasonSuffix = settings.pauseReason ? ` (${settings.pauseReason})` : '';
      const reason = `【Gate 拦截】主动消息处于临时免打扰状态 (暂停至 ${resumeTimeStr})${reasonSuffix}`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 4: Fixed Quiet Hours
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const inQuiet = this.isInQuietHours(currentTimeStr, settings.quietHours);
    if (inQuiet) {
      if (priority !== 'high' || !settings.allowHighPriorityBypassQuiet) {
        const reason = `【Gate 拦截】处于安静免打扰时段 (${settings.quietHours.startStr} - ${settings.quietHours.endStr})`;
        this.lastGateRejectReason = reason;
        return { allowed: false, reason };
      }
    }

    // Step 5: Per-AI Authorization & proactive_chat permission
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

    const aiAgentConfig = permissionManager.getAiConfig(params.aiId);
    const proactiveChatPerm = aiAgentConfig?.permissions['proactive_chat'];
    if (proactiveChatPerm === 'DENY') {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 的 [proactive_chat] 独立权限为 DENY`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Check Specific Trigger Type Toggles
    const triggerToggleResult = this.checkTriggerSpecificToggle(settings, params.triggerType, params.aiId);
    if (!triggerToggleResult.allowed) {
      this.lastGateRejectReason = triggerToggleResult.reason || '【Gate 拦截】触发类型开关已关闭';
      return triggerToggleResult;
    }

    // Step 5.5: Per-AI Offline Mode Mutual Exclusion (0 API calls; other AIs unaffected)
    if (isAiInOfflineMode(params.aiId)) {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 当前正处于线下模式共处中，已暂停微信主动消息`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 6: AI not currently executing a reply task
    if (aiReplyTaskManager.isCharacterThinking(params.aiId)) {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 正在回复或生成对话中，禁止插入主动消息`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    const charRuntime = getCharacterProactiveRuntime(params.aiId, runtimeState);

    // Step 7: EventId deduplication
    if (!params.isFollowUpStep && params.eventId && charRuntime.handledEventIds.includes(params.eventId)) {
      const reason = `【Gate 拦截】相同事件 ID [${params.eventId}] 已处理，禁止重复发送`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 8: Daily proactive EPISODE cap (does NOT block scheduled follow-ups of an already started episode)
    if (!params.isFollowUpStep && charRuntime.dailyProactiveCount >= (settings.dailyCap || 3)) {
      const reason = `【Gate 拦截】角色 [${params.aiId}] 今日主动消息轮次已达上限 (${settings.dailyCap}轮)`;
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    // Step 9: Minimum cooldown for NEW episodes (does NOT block scheduled follow-up steps of active episode)
    if (!params.isFollowUpStep) {
      const minutesSinceLastProactive = (nowMs - (charRuntime.lastProactiveMsgAt || 0)) / 60000;
      if (
        charRuntime.lastProactiveMsgAt > 0 &&
        priority !== 'high' &&
        minutesSinceLastProactive < (settings.minCooldownMinutes || 120)
      ) {
        const reason = `【Gate 拦截】触发过频，未满最短冷却时间 (${Math.ceil((settings.minCooldownMinutes || 120) - minutesSinceLastProactive)}分钟后恢复)`;
        this.lastGateRejectReason = reason;
        return { allowed: false, reason };
      }
    }

    // Step 10: Real prior chat & active conversation guard
    if (params.triggerType === 'inactivity_timeout' && (!charRuntime.lastUserMsgAt || charRuntime.lastUserMsgAt === 0)) {
      const reason = '【Gate 拦截】该角色从未发生过真实对话，严禁凭空触发不活跃超时提醒';
      this.lastGateRejectReason = reason;
      return { allowed: false, reason };
    }

    if (charRuntime.lastUserMsgAt > 0) {
      const minutesSinceLastUserMsg = (nowMs - charRuntime.lastUserMsgAt) / 60000;
      if (['greeting', 'inactivity_timeout'].includes(params.triggerType) && minutesSinceLastUserMsg < 15) {
        const reason = '【Gate 拦截】用户最近 15 分钟内刚进行过对话，抑制闲聊问候以防打扰';
        this.lastGateRejectReason = reason;
        return { allowed: false, reason };
      }
    }

    this.lastGateRejectReason = '通过 12 步本地 Gate 检测';
    return { allowed: true };
  }

  /**
   * Enforce all 9 local pre-send checks for a scheduled unreplied follow-up step (+15m -> +60m).
   * Makes ZERO AI API calls!
   */
  public async canSendFollowUpStep(params: {
    episodeId: string;
    aiId: string;
    stepId: string;
    nowMs?: number;
  }): Promise<GateCheckResult> {
    const nowMs = params.nowMs ?? Date.now();
    const settings = loadProactiveSettings();

    if (!settings.enabled || settings.followUpEnabled === false) {
      return { allowed: false, reason: '主动消息或未回复追问功能已关闭' };
    }

    // Per-AI Offline Mode Mutual Exclusion: pause/cancel follow-ups for this AI only
    if (isAiInOfflineMode(params.aiId)) {
      return { allowed: false, reason: `角色 [${params.aiId}] 当前正处于线下模式，拦截未回复追问` };
    }

    const ep = getProactiveEpisodeById(params.episodeId);
    if (!ep) {
      return { allowed: false, reason: '未找到对应主动消息 episode' };
    }

    // 1. Has user replied?
    const runtimeState = loadProactiveRuntimeState();
    const charRuntime = getCharacterProactiveRuntime(params.aiId, runtimeState);
    if (ep.answeredAt || (charRuntime.lastUserMsgAt && charRuntime.lastUserMsgAt > ep.startedAt)) {
      return { allowed: false, reason: '用户已回复，取消后续追问' };
    }

    // 2. Is episode still waiting_for_user / active?
    if (!isEpisodeActiveStatus(ep.status)) {
      return { allowed: false, reason: `episode 状态为 ${ep.status}，不再追问` };
    }

    // 3. Temporary DND pausedUntil
    if (settings.pausedUntil && settings.pausedUntil > nowMs) {
      return { allowed: false, reason: '临时免打扰 pausedUntil 生效中，拦截追问' };
    }

    // 4. "今天别管我"
    if (permissionManager.isDoNotDisturbToday()) {
      return { allowed: false, reason: '今天别管我已开启，拦截追问' };
    }

    // 5. Fixed quiet hours
    const now = new Date(nowMs);
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (this.isInQuietHours(currentTimeStr, settings.quietHours)) {
      return { allowed: false, reason: '当前处于安静免打扰时段，拦截追问' };
    }

    // 6. User busy/work/sleeping inferred state
    const stateText = ep.inferredUserState || '';
    if (/(上班|开会|睡觉|睡眠|忙碌)/.test(stateText)) {
      return { allowed: false, reason: '用户处于上班/开会/睡觉状态，拦截追问' };
    }

    // 7. Has stepId already been executed?
    if (isStepIdExecuted(params.episodeId, params.stepId) || (ep.executedStepIds || []).includes(params.stepId)) {
      return { allowed: false, reason: `追问步骤 ${params.stepId} 已执行，禁止重复发送` };
    }

    // 8. Has this step/task been cancelled?
    const step = (ep.followUpPlan || []).find((s) => s.stepId === params.stepId);
    if (!step || step.status !== 'pending') {
      return { allowed: false, reason: `追问步骤 ${params.stepId} 已取消或已完成` };
    }

    // 9. Are deterministic messageIds already in ChatDB?
    for (let i = 0; i < step.messages.length; i++) {
      const msgId = `msg_proactive_${params.episodeId}_${params.stepId}_${i}`;
      if (isMessageIdExecuted(msgId)) {
        return { allowed: false, reason: `消息 ${msgId} 已执行，幂等跳过` };
      }
      const inDb = await hasChatMessage(msgId).catch(() => false);
      if (inDb) {
        return { allowed: false, reason: `消息 ${msgId} 已存在于聊天记录，幂等跳过` };
      }
    }

    return { allowed: true };
  }

  /**
   * Process dispatch: Checks gate, writes message(s) via ChatMessageBridge, and updates runtime state.
   * Increments dailyProactiveCount by 1 EPISODE for new episodes (NOT per bubble and NOT for follow-up steps).
   */
  public async dispatchProactiveMessage(params: ProactiveDispatchParams): Promise<ProactiveDispatchResult> {
    if (!params.isFollowUpStep) {
      const gateResult = this.canSendProactiveMessage(params);
      if (!gateResult.allowed) {
        return { sent: false, reason: gateResult.reason };
      }
    }

    const settings = loadProactiveSettings();
    const runtimeState = loadProactiveRuntimeState();

    try {
      const results = await chatMessageBridge.postProactiveMultiBubbleMessage(
        params.aiId,
        params.proposedText,
        params.contextSummary || `【触发类型: ${params.triggerType}】${params.eventId}`,
        {
          notifySystem: Boolean(settings.systemNotificationsEnabled),
          triggerSource: params.triggerType,
          triggerType: params.triggerType,
          eventId: params.eventId,
          sourceSystem: params.sourceSystem,
          priority: params.priority,
          episodeId: params.episodeId,
          stepId: params.stepId,
          intent: params.intent,
          generatedAt: params.generatedAt,
          explicitMessages: params.explicitMessages,
          deterministicMessageIds: params.deterministicMessageIds,
          skipTypingDelay: params.skipTypingDelay,
          thinkingProcess: params.thinkingProcess,
          reasoningAvailable: params.reasoningAvailable,
          reasoningSource: params.reasoningSource,
        }
      );

      if (results.length === 0) {
        return { sent: false, reason: '消息已存在或内容无效，已安全跳过' };
      }

      const firstMessage = results[0]?.message;
      const messageIds = results.map((r) => r.message.id).filter(Boolean);

      // Update Runtime State
      const charRuntime = getCharacterProactiveRuntime(params.aiId, runtimeState);
      const nowMs = params.nowMs ?? Date.now();
      charRuntime.lastProactiveMsgAt = nowMs;
      charRuntime.lastConversationAt = nowMs;
      charRuntime.lastUnrepliedProactiveAt = nowMs;

      // Daily cap counts EPISODES (only increment on initial episode dispatch, not follow-up steps)
      if (!params.isFollowUpStep) {
        charRuntime.dailyProactiveCount += 1;
        if (params.eventId && !charRuntime.handledEventIds.includes(params.eventId)) {
          charRuntime.handledEventIds.push(params.eventId);
          if (charRuntime.handledEventIds.length > 60) {
            charRuntime.handledEventIds = charRuntime.handledEventIds.slice(-50);
          }
        }
      }

      runtimeState.characterStates[params.aiId] = charRuntime;
      runtimeState.lastGlobalCheckAt = nowMs;
      saveProactiveRuntimeState(runtimeState);

      return { sent: true, messageId: firstMessage?.id, messageIds };
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
      case 'menstrual_care': {
        if (!settings.menstrual.enabled) return { allowed: false, reason: '经期关怀触发器已关闭' };
        const globalPerms = loadPermissions();
        const menstrualDataObj = loadMenstrualData();
        const menstrualAiPerm = permissionManager.checkAiPermission(aiId, 'menstrual_health');
        if (!globalPerms?.appAccess?.menstrualData || menstrualDataObj?.aiAccessEnabled === false || menstrualAiPerm === 'DENY') {
          return { allowed: false, reason: '经期健康数据访问权限 (menstrual_health) 未开启或已禁用，禁止读取敏感健康数据' };
        }
        if (!settings.menstrual.allowedCharacterIds.includes(aiId) && !settings.allowAllCharacters) {
          return { allowed: false, reason: `角色 [${aiId}] 未获得经期健康数据专属授权` };
        }
        break;
      }
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

  public isInQuietHours(currentTimeStr: string, quietConfig: { enabled: boolean; startStr: string; endStr: string }): boolean {
    if (!quietConfig.enabled) return false;
    const start = quietConfig.startStr || '23:30';
    const end = quietConfig.endStr || '08:00';
    if (start > end) {
      return currentTimeStr >= start || currentTimeStr < end;
    }
    return currentTimeStr >= start && currentTimeStr < end;
  }
}

export const proactiveGate = ProactiveGateService.getInstance();
