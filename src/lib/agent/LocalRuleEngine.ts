import {
  ActionCandidate,
  AgentEvent,
  SceneId,
  AgentActionType,
} from './types';
import { permissionManager } from './PermissionManager';
import { deviceContextManager, DeviceContextState } from './DeviceContextManager';
import { loadCharacters } from '../storage';
import { AiCharacter } from '../../types';

export interface RuleEvaluationResult {
  passed: boolean;
  rejectReason?: string;
  candidate?: ActionCandidate;
}

class LocalRuleEngine {
  private static instance: LocalRuleEngine;

  // Track per-AI and per-action last execution timestamps to enforce cooldowns
  private lastActionTimes: Map<string, number> = new Map(); // key: `${aiId}_${actionType}` -> timestamp
  private globalLastActionTime = 0;

  // Default cooldown in milliseconds (15 minutes in normal mode, can be adjusted or bypassed in simulator)
  private defaultCooldownMs = 15 * 60 * 1000;
  private simulationBypassCooldown = false;

  private constructor() {}

  public static getInstance(): LocalRuleEngine {
    if (!LocalRuleEngine.instance) {
      LocalRuleEngine.instance = new LocalRuleEngine();
    }
    return LocalRuleEngine.instance;
  }

  public setSimulationBypassCooldown(bypass: boolean) {
    this.simulationBypassCooldown = bypass;
  }

  public isBypassCooldown(): boolean {
    return this.simulationBypassCooldown;
  }

  public resetAllCooldowns() {
    this.lastActionTimes.clear();
    this.globalLastActionTime = 0;
  }

  public recordActionExecuted(aiId: string, actionType: AgentActionType) {
    const now = Date.now();
    this.lastActionTimes.set(`${aiId}_${actionType}`, now);
    this.globalLastActionTime = now;
  }

  public getCooldownRemainingSeconds(aiId: string, actionType: AgentActionType): number {
    if (this.simulationBypassCooldown) return 0;
    const last = this.lastActionTimes.get(`${aiId}_${actionType}`);
    if (!last) return 0;
    const elapsed = Date.now() - last;
    const remaining = this.defaultCooldownMs - elapsed;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Evaluate context and incoming event to decide whether a candidate action should be generated
   */
  public async evaluate(
    event: AgentEvent,
    targetAiIdOverride?: string
  ): Promise<RuleEvaluationResult> {
    // 1. Check DND (Do Not Disturb) master switch
    if (permissionManager.isDoNotDisturbToday()) {
      return {
        passed: false,
        rejectReason: '全局【今天别管我】免打扰总开关处于开启状态，已阻断所有 AI 主动行为',
      };
    }

    const context = await deviceContextManager.getContext();
    const characters = loadCharacters();
    if (!characters || characters.length === 0) {
      return {
        passed: false,
        rejectReason: '系统中未检测到可用的 AI 角色',
      };
    }

    // Pick target AI character
    let targetChar: AiCharacter = characters[0];
    if (targetAiIdOverride) {
      const found = characters.find((c) => c.id === targetAiIdOverride);
      if (found) targetChar = found;
    } else {
      // Pick based on scene affinity if possible
      if (context.currentScene === 'gaming') {
        const guChen = characters.find((c) => c.name.includes('顾沉'));
        if (guChen) targetChar = guChen;
      } else {
        const linSiWei = characters.find((c) => c.name.includes('林思微'));
        if (linSiWei) targetChar = linSiWei;
      }
    }

    // 2. High-sensitivity scene blocks
    if (context.currentScene === 'password_auth') {
      return {
        passed: false,
        rejectReason: '当前处于【密码与身份验证】高危场景，本地规则引擎强制阻断一切 AI 介入与感知',
      };
    }

    // 3. Evaluate by Event Type & Device Context
    switch (event.type) {
      case 'APP_USAGE_TICK':
      case 'APP_FOREGROUND_CHANGED': {
        return this.evaluateAppUsage(context, targetChar);
      }

      case 'BATTERY_CHANGED': {
        return this.evaluateBattery(context, targetChar);
      }

      case 'TIME_PERIOD_CHANGED': {
        return this.evaluateTimePeriod(context, targetChar, event.payload);
      }

      case 'MANUAL_TRIGGER': {
        // Direct manual request from user or test console
        const actionType: AgentActionType = event.payload.actionType || 'proactive_chat';
        return {
          passed: true,
          candidate: {
            id: 'cand_' + Date.now(),
            targetAiId: targetChar.id,
            targetAiName: targetChar.name,
            actionType,
            actionTitle: event.payload.actionTitle || `主动关怀与互动 (${targetChar.name})`,
            triggerReason: event.payload.reason || '由测试控制台或用户手动触发',
            urgency: 'normal',
            proposedMessageText: event.payload.messageText,
            targetAppId: event.payload.targetAppId,
          },
        };
      }

      case 'PERIODIC_EVALUATION': {
        // Evaluate general health / usage
        if (context.foregroundDurationMinutes >= 20) {
          return this.evaluateAppUsage(context, targetChar);
        }
        if (context.batteryLevel <= 20 && !context.isCharging) {
          return this.evaluateBattery(context, targetChar);
        }
        return {
          passed: false,
          rejectReason: '周期评估正常，未触发任何阈值条件（前台时长或电量未超标）',
        };
      }

      default:
        return {
          passed: false,
          rejectReason: `未定义针对事件类型 [${event.type}] 的主动规则`,
        };
    }
  }

  private evaluateAppUsage(
    context: DeviceContextState,
    targetChar: AiCharacter
  ): RuleEvaluationResult {
    const minutes = context.foregroundDurationMinutes;
    const scene = context.currentScene;
    const appName = context.currentApp;

    // Short video scenario phased thresholds
    if (scene === 'short_video') {
      if (minutes >= 60) {
        return this.generateCandidate(
          targetChar,
          'proactive_chat',
          '短视频超长沉迷强制关怀',
          `用户在 [${appName}] 连续使用已超 60 分钟`,
          'high',
          `${targetChar.name}注意到你已经连续刷了 1 个小时短视频啦，眼睛酸不酸？站起来喝杯水活动一下吧！`
        );
      } else if (minutes >= 45) {
        return this.generateCandidate(
          targetChar,
          'proactive_chat',
          '短视频长时间温和关怀',
          `用户在 [${appName}] 连续使用已达 45 分钟`,
          'normal',
          `已经刷了 45 分钟${appName}啦，要不要停下来深呼吸一下呢？`
        );
      } else if (minutes >= 20) {
        return this.generateCandidate(
          targetChar,
          'proactive_chat',
          '短视频阶段性护眼提醒',
          `用户在 [${appName}] 连续使用已达 20 分钟`,
          'low',
          `看屏幕有一会儿啦，眨眨眼看看远处放松一下哦~`
        );
      }
    }

    // Gaming scenario phased thresholds
    if (scene === 'gaming') {
      if (minutes >= 60) {
        return this.generateCandidate(
          targetChar,
          'proactive_chat',
          '游戏长时间防沉迷提醒',
          `用户玩游戏 [${appName}] 已达 60 分钟`,
          'high',
          `打游戏已经 1 小时了，注意活动手腕和颈椎，不要久坐哦！`
        );
      } else if (minutes >= 30) {
        return this.generateCandidate(
          targetChar,
          'floating_bubble',
          '游戏护眼小贴士',
          `游戏进行中 30 分钟`,
          'low'
        );
      }
    }

    // General app
    if (minutes >= 90) {
      return this.generateCandidate(
        targetChar,
        'proactive_chat',
        '手机连续使用疲劳关怀',
        `手机持续使用达 ${minutes} 分钟`,
        'normal',
        `连续对着屏幕很久啦，适度休息更高效哦~`
      );
    }

    return {
      passed: false,
      rejectReason: `当前使用时长 (${minutes} 分钟) 未达到场景 [${scene}] 设定的介入阈值`,
    };
  }

  private evaluateBattery(
    context: DeviceContextState,
    targetChar: AiCharacter
  ): RuleEvaluationResult {
    if (context.batteryLevel <= 20 && !context.isCharging) {
      return this.generateCandidate(
        targetChar,
        'proactive_chat',
        '低电量及时关怀',
        `手机剩余电量仅 ${context.batteryLevel}% 且未连接充电器`,
        'normal',
        `电量只剩 ${context.batteryLevel}% 啦，记得及时插上充电器，以免关机联系不到你哦~`
      );
    }
    return {
      passed: false,
      rejectReason: `电量正常 (${context.batteryLevel}%) 或处于充电状态，无需触发提醒`,
    };
  }

  private evaluateTimePeriod(
    context: DeviceContextState,
    targetChar: AiCharacter,
    payload: Record<string, any>
  ): RuleEvaluationResult {
    const hour = payload.hour !== undefined ? payload.hour : new Date().getHours();
    if (hour >= 23 || hour < 5) {
      return this.generateCandidate(
        targetChar,
        'proactive_chat',
        '深夜作息健康关怀',
        `当前已进入深夜 (${hour} 点)`,
        'normal',
        `已经很晚啦，放下手机早点休息吧，晚安好梦~`
      );
    } else if (hour >= 7 && hour <= 9) {
      return this.generateCandidate(
        targetChar,
        'proactive_chat',
        '清晨早安问候',
        `清晨时段 (${hour} 点)`,
        'low',
        `早上好呀！新的一天也要元气满满，记得吃早餐哦~`
      );
    }
    return {
      passed: false,
      rejectReason: `当前时间段 (${hour}点) 无专属定时关怀动作`,
    };
  }

  private generateCandidate(
    targetChar: AiCharacter,
    actionType: AgentActionType,
    actionTitle: string,
    triggerReason: string,
    urgency: 'low' | 'normal' | 'high',
    proposedMessageText?: string
  ): RuleEvaluationResult {
    // Check cooldown
    const cooldownRemaining = this.getCooldownRemainingSeconds(targetChar.id, actionType);
    if (cooldownRemaining > 0) {
      return {
        passed: false,
        rejectReason: `触发冷却保护中：${targetChar.name} 在 ${cooldownRemaining} 秒内不可重复执行该动作`,
      };
    }

    return {
      passed: true,
      candidate: {
        id: 'cand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        targetAiId: targetChar.id,
        targetAiName: targetChar.name,
        actionType,
        actionTitle,
        triggerReason,
        urgency,
        proposedMessageText,
      },
    };
  }
}

export const localRuleEngine = LocalRuleEngine.getInstance();
