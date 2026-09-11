import {
  AgentEvent,
  ActionCandidate,
  AgentDecisionTrace,
  DecisionTraceStage,
  AgentAskPrompt,
  InPhoneNotification,
  AgentActionType,
} from './types';
import { eventManager } from './EventManager';
import { localRuleEngine } from './LocalRuleEngine';
import { permissionManager, AI_PERMISSION_ITEMS } from './PermissionManager';
import { systemCapabilityManager } from './SystemCapabilityManager';
import { activityLogger } from './ActivityLogger';
import { chatMessageBridge } from './ChatMessageBridge';
import { deviceContextManager } from './DeviceContextManager';
import { loadCharacters } from '../storage';

type AskPromptListener = (prompt: AgentAskPrompt | null) => void;
type NotificationListener = (notif: InPhoneNotification | null) => void;
type TraceListener = (traces: AgentDecisionTrace[]) => void;

class AgentOrchestrator {
  private static instance: AgentOrchestrator;

  private askListeners: Set<AskPromptListener> = new Set();
  private notifListeners: Set<NotificationListener> = new Set();
  private traceListeners: Set<TraceListener> = new Set();

  private recentTraces: AgentDecisionTrace[] = [];
  private activeAskPrompt: AgentAskPrompt | null = null;
  private activeNotification: InPhoneNotification | null = null;
  private isAutoLoopStarted = false;

  private constructor() {
    // Subscribe to EventManager
    eventManager.subscribe((event) => {
      this.handleIncomingEvent(event);
    });
  }

  public static getInstance(): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator();
    }
    return AgentOrchestrator.instance;
  }

  // Subscribe UI to Ask prompts (when permission is ASK)
  public subscribeAskPrompt(listener: AskPromptListener): () => void {
    this.askListeners.add(listener);
    listener(this.activeAskPrompt);
    return () => {
      this.askListeners.delete(listener);
    };
  }

  // Subscribe UI to in-phone Heads-up notifications
  public subscribeNotification(listener: NotificationListener): () => void {
    this.notifListeners.add(listener);
    listener(this.activeNotification);
    return () => {
      this.notifListeners.delete(listener);
    };
  }

  // Subscribe UI to Decision Traces (for Simulator / Debug Console)
  public subscribeTraces(listener: TraceListener): () => void {
    this.traceListeners.add(listener);
    listener([...this.recentTraces]);
    return () => {
      this.traceListeners.delete(listener);
    };
  }

  public getRecentTraces(): AgentDecisionTrace[] {
    return [...this.recentTraces];
  }

  public dismissNotification(): void {
    this.activeNotification = null;
    this.notifyNotifListeners(null);
  }

  /**
   * Handle incoming event through the complete decision pipeline
   */
  public async handleIncomingEvent(
    event: AgentEvent,
    targetAiIdOverride?: string
  ): Promise<AgentDecisionTrace> {
    const traceId = 'trace_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const stages: DecisionTraceStage[] = [];

    // Stage 1: Local Rule Engine Evaluation
    const ruleResult = await localRuleEngine.evaluate(event, targetAiIdOverride);
    if (!ruleResult.passed || !ruleResult.candidate) {
      stages.push({
        stageName: '本地规则引擎 (LocalRuleEngine)',
        passed: false,
        statusText: '未通过 / 规则过滤',
        detail: ruleResult.rejectReason || '未满足触发条件或处于冷却中',
      });

      const trace: AgentDecisionTrace = {
        id: traceId,
        timestamp: Date.now(),
        candidate: {
          id: 'cand_empty',
          targetAiId: targetAiIdOverride || 'unknown',
          targetAiName: '系统伴随AI',
          actionType: 'proactive_chat',
          actionTitle: '意图评估',
          triggerReason: event.summary,
          urgency: 'low',
        },
        stages,
        finalOutcome: 'DENY',
        executionResult: 'REJECTED',
        failureReason: ruleResult.rejectReason,
      };

      this.addTrace(trace);
      return trace;
    }

    const candidate = ruleResult.candidate;
    stages.push({
      stageName: '本地规则引擎 (LocalRuleEngine)',
      passed: true,
      statusText: '通过 / 生成候选动作',
      detail: `命中规则: [${candidate.actionTitle}]，目标角色: ${candidate.targetAiName}`,
    });

    // Stage 2: Tier 1 - System Capability Check
    const actionItemDef = AI_PERMISSION_ITEMS.find((i) => i.id === candidate.actionType);
    let tier1Passed = true;
    let tier1Detail = '当前动作无需特殊原生硬件权限';

    if (actionItemDef?.requiredCapabilityId) {
      const capStatus = systemCapabilityManager.getStatus(actionItemDef.requiredCapabilityId);
      if (capStatus !== 'GRANTED' && capStatus !== 'TEMPORARY') {
        tier1Passed = false;
        tier1Detail = `底层系统能力 [${actionItemDef.requiredCapabilityId}] 状态为 ${capStatus}，无法放行`;
      } else {
        tier1Detail = `底层系统能力 [${actionItemDef.requiredCapabilityId}] 状态正常 (${capStatus})`;
      }
    }

    stages.push({
      stageName: '第一层: 系统能力 (Tier 1)',
      passed: tier1Passed,
      statusText: tier1Passed ? '通过' : '拦截',
      detail: tier1Detail,
    });

    if (!tier1Passed) {
      return this.finalizeTrace(
        traceId,
        candidate,
        stages,
        'DENY',
        'FAILED',
        tier1Detail,
        event.summary
      );
    }

    // Stage 3: Tier 2 - AI Independent Permission Check
    const aiConfig = permissionManager.getAiConfig(candidate.targetAiId);
    const aiPermLevel = aiConfig?.permissions[candidate.actionType] || 'DENY';
    let tier2Passed = false;
    let tier2Detail = '';

    if (aiPermLevel === 'ALLOW') {
      tier2Passed = true;
      tier2Detail = `角色 [${candidate.targetAiName}] 权限设置为【始终允许 (ALLOW)】`;
    } else if (aiPermLevel === 'ASK') {
      tier2Passed = true;
      tier2Detail = `角色 [${candidate.targetAiName}] 权限设置为【每次询问 (ASK)】，需等待用户弹窗确认`;
    } else {
      tier2Passed = false;
      tier2Detail = `角色 [${candidate.targetAiName}] 独立权限设置为【禁止 (DENY)】，系统严格拦截`;
    }

    stages.push({
      stageName: '第二层: AI独立权限 (Tier 2)',
      passed: tier2Passed,
      statusText: aiPermLevel,
      detail: tier2Detail,
    });

    if (aiPermLevel === 'DENY') {
      return this.finalizeTrace(
        traceId,
        candidate,
        stages,
        'DENY',
        'REJECTED',
        tier2Detail,
        event.summary
      );
    }

    // Stage 4: Tier 3 - Scene Rules Check
    const context = await deviceContextManager.getContext();
    const currentScene = context.currentScene;
    const sceneRule = permissionManager.getSceneRule(currentScene);

    let tier3Passed = true;
    let tier3Detail = `当前场景 [${sceneRule.sceneName}] 允许该动作`;

    if (candidate.actionType === 'proactive_chat' && !sceneRule.allowProactiveMessage) {
      tier3Passed = false;
      tier3Detail = `当前场景 [${sceneRule.sceneName}] 场景规则禁止主动发送消息`;
    } else if (candidate.actionType === 'screen_view' && !sceneRule.allowScreen) {
      tier3Passed = false;
      tier3Detail = `当前场景 [${sceneRule.sceneName}] 场景规则禁止查看屏幕`;
    }

    stages.push({
      stageName: '第三层: 场景规则引擎 (Tier 3)',
      passed: tier3Passed,
      statusText: tier3Passed ? '通过' : '场景阻断',
      detail: tier3Detail,
    });

    if (!tier3Passed) {
      return this.finalizeTrace(
        traceId,
        candidate,
        stages,
        'DENY',
        'REJECTED',
        tier3Detail,
        event.summary
      );
    }

    // Stage 5: User Confirmation (if ASK)
    if (aiPermLevel === 'ASK') {
      stages.push({
        stageName: '用户交互确认 (ASK Handshake)',
        passed: false,
        statusText: '挂起等待中',
        detail: '正在向用户展示 Android 规范授权询问弹窗...',
      });

      // Dispatch Ask prompt
      const userApproved = await this.promptUserForPermission(candidate, sceneRule.sceneName);

      if (!userApproved.allowed) {
        stages[stages.length - 1] = {
          stageName: '用户交互确认 (ASK Handshake)',
          passed: false,
          statusText: '用户拒绝',
          detail: '用户在弹窗中选择了【拒绝本次操作】',
        };

        return this.finalizeTrace(
          traceId,
          candidate,
          stages,
          'DENY',
          'REJECTED',
          '用户在交互弹窗中拒绝了授权',
          event.summary
        );
      }

      stages[stages.length - 1] = {
        stageName: '用户交互确认 (ASK Handshake)',
        passed: true,
        statusText: userApproved.always ? '始终允许 (已记入配置)' : '本次允许',
        detail: userApproved.always
          ? '用户授权并勾选了【始终允许】，已同步更新 AI 独立权限'
          : '用户批准了本次单次执行',
      };
    }

    // Stage 6: Execution (ActionExecutor)
    try {
      let relatedMsgId: string | undefined;

      if (candidate.actionType === 'proactive_chat') {
        const text =
          candidate.proposedMessageText ||
          `看你已经使用 ${context.currentApp} 一段时间了，要注意休息眼睛哦~`;

        const { message, character } = await chatMessageBridge.postProactiveMessage(
          candidate.targetAiId,
          text,
          `${event.summary} (场景: ${sceneRule.sceneName})`
        );

        relatedMsgId = message.id;

        // Show in-phone notification banner
        this.showInPhoneNotification({
          id: 'notif_' + Date.now(),
          aiId: character.id,
          aiName: character.name,
          aiAvatar: character.avatar,
          title: `${character.name} 发来新消息`,
          content: text,
          timestamp: Date.now(),
          category: 'proactive_chat',
        });
      } else if (candidate.actionType === 'system_notification') {
        this.showInPhoneNotification({
          id: 'notif_' + Date.now(),
          aiId: candidate.targetAiId,
          aiName: candidate.targetAiName,
          title: `系统关怀提醒`,
          content: candidate.proposedMessageText || candidate.triggerReason,
          timestamp: Date.now(),
          category: 'system_alert',
        });
      } else if (candidate.actionType === 'floating_bubble') {
        this.showInPhoneNotification({
          id: 'notif_' + Date.now(),
          aiId: candidate.targetAiId,
          aiName: candidate.targetAiName,
          title: `悬浮伴随气泡`,
          content: candidate.proposedMessageText || `伴随中: ${candidate.actionTitle}`,
          timestamp: Date.now(),
          category: 'care',
        });
      }

      localRuleEngine.recordActionExecuted(candidate.targetAiId, candidate.actionType);

      stages.push({
        stageName: '第四层: 动作执行与入库 (Tier 4)',
        passed: true,
        statusText: '成功',
        detail: `动作已成功执行，已写入活动日志${relatedMsgId ? '并已同步持久化写入微信聊天库' : ''}`,
      });

      activityLogger.log({
        aiId: candidate.targetAiId,
        aiName: candidate.targetAiName,
        eventType: candidate.actionType === 'proactive_chat' ? 'PROACTIVE_MESSAGE' : 'ACTION_REQUEST',
        requestedAction: candidate.actionTitle,
        trigger: event.summary,
        permissionResult: 'ALLOW',
        executionResult: 'SUCCESS',
        relatedMessageId: relatedMsgId,
        metadata: {
          candidate,
          event,
          scene: currentScene,
        },
      });

      const trace: AgentDecisionTrace = {
        id: traceId,
        timestamp: Date.now(),
        candidate,
        stages,
        finalOutcome: 'ALLOW',
        executionResult: 'SUCCESS',
      };

      this.addTrace(trace);
      return trace;
    } catch (err: any) {
      stages.push({
        stageName: '第四层: 动作执行与入库 (Tier 4)',
        passed: false,
        statusText: '失败',
        detail: `执行时发生异常: ${err?.message || '未知错误'}`,
      });

      return this.finalizeTrace(
        traceId,
        candidate,
        stages,
        'ALLOW',
        'FAILED',
        err?.message || '运行时执行异常',
        event.summary
      );
    }
  }

  private finalizeTrace(
    id: string,
    candidate: ActionCandidate,
    stages: DecisionTraceStage[],
    finalOutcome: 'ALLOW' | 'ASK' | 'DENY',
    executionResult: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WAITING_USER',
    failureReason: string,
    triggerSummary: string
  ): AgentDecisionTrace {
    const permResult =
      finalOutcome === 'ALLOW'
        ? 'ALLOW'
        : finalOutcome === 'ASK'
        ? 'ASK_PENDING'
        : 'DENY';

    activityLogger.log({
      aiId: candidate.targetAiId,
      aiName: candidate.targetAiName,
      eventType: 'ACTION_REQUEST',
      requestedAction: candidate.actionTitle,
      trigger: triggerSummary,
      permissionResult: permResult,
      executionResult: executionResult as any,
      failureReason,
      metadata: { candidate },
    });

    const trace: AgentDecisionTrace = {
      id,
      timestamp: Date.now(),
      candidate,
      stages,
      finalOutcome,
      executionResult,
      failureReason,
    };

    this.addTrace(trace);
    return trace;
  }

  private addTrace(trace: AgentDecisionTrace) {
    this.recentTraces.unshift(trace);
    if (this.recentTraces.length > 30) {
      this.recentTraces.pop();
    }
    this.traceListeners.forEach((fn) => {
      try {
        fn([...this.recentTraces]);
      } catch (e) {
        console.error('Trace listener error', e);
      }
    });
  }

  private promptUserForPermission(
    candidate: ActionCandidate,
    sceneName: string
  ): Promise<{ allowed: boolean; always?: boolean }> {
    return new Promise((resolve) => {
      const characters = loadCharacters();
      const char = characters.find((c) => c.id === candidate.targetAiId);

      const prompt: AgentAskPrompt = {
        id: 'ask_' + Date.now(),
        aiId: candidate.targetAiId,
        aiName: candidate.targetAiName,
        aiAvatar: char?.avatar,
        actionType: candidate.actionType,
        actionTitle: candidate.actionTitle,
        sceneName,
        description: `【${candidate.targetAiName}】请求在当前【${sceneName}】场景下执行【${candidate.actionTitle}】。`,
        timestamp: Date.now(),
        resolve: (decision) => {
          this.activeAskPrompt = null;
          this.notifyAskListeners(null);

          if (decision === 'ALLOW_ALWAYS') {
            permissionManager.updateAiPermission(candidate.targetAiId, candidate.actionType, 'ALLOW', 'USER');
            resolve({ allowed: true, always: true });
          } else if (decision === 'ALLOW_ONCE') {
            resolve({ allowed: true, always: false });
          } else {
            resolve({ allowed: false });
          }
        },
      };

      this.activeAskPrompt = prompt;
      this.notifyAskListeners(prompt);
    });
  }

  private showInPhoneNotification(notif: InPhoneNotification) {
    this.activeNotification = notif;
    this.notifyNotifListeners(notif);

    // Auto-dismiss after 6.5 seconds
    setTimeout(() => {
      if (this.activeNotification?.id === notif.id) {
        this.dismissNotification();
      }
    }, 6500);
  }

  private notifyAskListeners(prompt: AgentAskPrompt | null) {
    this.askListeners.forEach((fn) => {
      try {
        fn(prompt);
      } catch (e) {
        console.error('Ask prompt listener error', e);
      }
    });
  }

  private notifyNotifListeners(notif: InPhoneNotification | null) {
    this.notifListeners.forEach((fn) => {
      try {
        fn(notif);
      } catch (e) {
        console.error('Notification listener error', e);
      }
    });
  }
}

export const agentOrchestrator = AgentOrchestrator.getInstance();
