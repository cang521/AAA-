/**
 * ActionExecutor - Action Execution Engine (Phase 1)
 *
 * Verifies 4-tier permissions before executing any AI action:
 * Tier 1: System Capability
 * Tier 2: AI Independent Permission
 * Tier 3: Scene Rules
 * Tier 4: Runtime Verification
 *
 * Logs execution outcome to ActivityLogger.
 */

import { permissionManager, AI_PERMISSION_ITEMS } from './PermissionManager';
import { systemCapabilityManager } from './SystemCapabilityManager';
import { activityLogger } from './ActivityLogger';

export interface ActionRequest {
  aiId: string;
  aiName: string;
  actionId: string;
  actionName: string;
  trigger: string;
  payload?: any;
}

export interface ActionResult {
  success: boolean;
  blockedByTier?: 'DND_TODAY' | 'SYSTEM_CAPABILITY' | 'AI_PERMISSION' | 'SCENE_RULE';
  message: string;
}

class ActionExecutor {
  private static instance: ActionExecutor;

  private constructor() {}

  public static getInstance(): ActionExecutor {
    if (!ActionExecutor.instance) {
      ActionExecutor.instance = new ActionExecutor();
    }
    return ActionExecutor.instance;
  }

  /**
   * Safe execution entry point enforcing 4-tier verification
   */
  public async executeAction(request: ActionRequest): Promise<ActionResult> {
    const { aiId, aiName, actionId, actionName, trigger, payload } = request;

    // 0. Check Master Mute ("今天别管我")
    if (permissionManager.isDoNotDisturbToday()) {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'DENY',
        executionResult: 'REJECTED',
        failureReason: '当前已开启【今天别管我】总静默模式，拦截所有主动行为',
        metadata: { actionId, payload },
      });
      return {
        success: false,
        blockedByTier: 'DND_TODAY',
        message: '今天别管我模式已开启，已静默拦截。',
      };
    }

    // 1. Tier 2: AI Independent Permission Check
    const aiConfig = permissionManager.getAiConfig(aiId);
    const permLevel = aiConfig?.permissions[actionId] || 'DENY';
    if (permLevel === 'DENY') {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'DENY',
        executionResult: 'REJECTED',
        failureReason: `AI 独立权限配置为【DENY (禁止)】`,
        metadata: { actionId, payload },
      });
      return {
        success: false,
        blockedByTier: 'AI_PERMISSION',
        message: `AI角色未获得该动作的授权 (当前权限为禁止)。`,
      };
    }

    // 2. Tier 1: System Capability Check
    const itemDef = AI_PERMISSION_ITEMS.find((i) => i.id === actionId);
    if (itemDef?.requiredCapabilityId) {
      const capStatus = systemCapabilityManager.getStatus(itemDef.requiredCapabilityId);
      if (capStatus !== 'GRANTED' && capStatus !== 'TEMPORARY') {
        activityLogger.log({
          aiId,
          aiName,
          eventType: 'ACTION_REQUEST',
          requestedAction: actionName,
          trigger,
          permissionResult: 'BLOCKED',
          executionResult: 'FAILED',
          failureReason: `底层系统能力状态为【${capStatus}】，系统无法执行该原生动作`,
          metadata: { actionId, requiredCapabilityId: itemDef.requiredCapabilityId, capStatus },
        });
        return {
          success: false,
          blockedByTier: 'SYSTEM_CAPABILITY',
          message: `手机底层系统能力未就绪 (${capStatus})。`,
        };
      }
    }

    // 3. Tier 3: Scene Rules Check
    const currentScene = permissionManager.getCurrentScene();
    const sceneRule = permissionManager.getSceneRule(currentScene);

    if (actionId === 'screen_view' && !sceneRule.allowScreen) {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'DENY',
        executionResult: 'REJECTED',
        failureReason: `当前处于【${sceneRule.sceneName}】场景，场景规则禁止查看屏幕`,
        metadata: { currentScene },
      });
      return {
        success: false,
        blockedByTier: 'SCENE_RULE',
        message: `当前场景禁止查看屏幕。`,
      };
    }

    if (actionId === 'proactive_chat' && !sceneRule.allowProactiveMessage) {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'DENY',
        executionResult: 'REJECTED',
        failureReason: `当前处于【${sceneRule.sceneName}】场景，场景规则禁止主动发送消息`,
        metadata: { currentScene },
      });
      return {
        success: false,
        blockedByTier: 'SCENE_RULE',
        message: `当前场景禁止主动发消息。`,
      };
    }

    // 4. If action requires user confirmation (ASK)
    if (permLevel === 'ASK') {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'ASK_PENDING',
        executionResult: 'NOT_ATTEMPTED',
        failureReason: '权限设置为【每次询问】，等待用户手动授权',
        metadata: { actionId, payload },
      });
      return {
        success: false,
        message: '该动作权限为每次询问，需要用户批准确认。',
      };
    }

    // 5. Execution
    try {
      // Phase 1: Safe executions like notification or vibration
      if (actionId === 'system_notification' && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`${aiName} 悄悄给你发来消息`, {
            body: payload?.text || '点击进入小手机查看详情',
            icon: payload?.avatar || '/favicon.ico',
          });
        }
      }

      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'ALLOW',
        executionResult: 'SUCCESS',
        metadata: { actionId, payload },
      });

      return {
        success: true,
        message: '执行成功',
      };
    } catch (e: any) {
      activityLogger.log({
        aiId,
        aiName,
        eventType: 'ACTION_REQUEST',
        requestedAction: actionName,
        trigger,
        permissionResult: 'ALLOW',
        executionResult: 'FAILED',
        failureReason: e?.message || '运行时执行异常',
        metadata: { actionId, payload },
      });
      return {
        success: false,
        message: e?.message || '执行遇到错误',
      };
    }
  }
}

export const actionExecutor = ActionExecutor.getInstance();
