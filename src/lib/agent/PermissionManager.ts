/**
 * PermissionManager - Tier 2 (AI Independent Permissions) & Tier 3 (Scene Rules)
 *
 * Implements:
 * 1. AI independent permission configurations across 7 categories
 * 2. 3-level permission model (DENY, ASK, ALLOW)
 * 3. AI permission change events (PERMISSION_CHANGED) and history
 * 4. AI-restricted self permission query (getMyPermissions, getMyAvailableActions)
 * 5. Scene rules management with 10 predefined scenes & Gaming / Short video defaults
 * 6. Global "今天别管我" (Do Not Disturb Today) master toggle
 * 7. Synchronized with existing AI characters from storage
 */

import {
  AiPermissionLevel,
  AiPermissionCategory,
  AiPermissionItemDef,
  AiAgentPermissionConfig,
  PermissionChangedEvent,
  SceneId,
  SceneRuleConfig,
  AiSelfPermissionView,
} from './types';
import { systemCapabilityManager } from './SystemCapabilityManager';
import { activityLogger } from './ActivityLogger';
import { loadCharacters } from '../storage';

const STORAGE_KEYS = {
  AI_PERMS: 'mobile_ai_independent_perms_v1',
  PERM_EVENTS: 'mobile_ai_perm_changed_events_v1',
  SCENE_RULES: 'mobile_ai_scene_rules_v1',
  DND_TODAY: 'mobile_ai_dnd_today_v1',
  CURRENT_SCENE: 'mobile_ai_current_scene_v1',
};

// 7 Categories of AI Items
export const AI_PERMISSION_ITEMS: AiPermissionItemDef[] = [
  // 1. 基础感知
  {
    id: 'time_weather',
    category: 'basic_sense',
    name: '读取时间与环境天气',
    description: '感知当前时间段与本地气温、降水、天气状况',
    defaultLevel: 'ALLOW',
    requiredCapabilityId: 'geolocation',
    isSensitive: false,
  },
  {
    id: 'battery_network',
    category: 'basic_sense',
    name: '感知手机电量与网络状态',
    description: '感知当前电池电量、充电状态、Wi-Fi/蜂窝网络连接',
    defaultLevel: 'ALLOW',
    isSensitive: false,
  },
  {
    id: 'app_awareness',
    category: 'basic_sense',
    name: '感知当前前台应用与使用时长',
    description: '知道用户正在使用什么 App 以及持续了多长时间',
    defaultLevel: 'ASK',
    requiredCapabilityId: 'usage_stats',
    isSensitive: true,
  },

  // 2. 屏幕感知
  {
    id: 'screen_view',
    category: 'screen_sense',
    name: '查看当前手机屏幕',
    description: '在用户需要或允许的场景下读取当前手机屏幕画面',
    defaultLevel: 'DENY',
    requiredCapabilityId: 'screen_capture',
    isSensitive: true,
  },

  // 3. 主动参与
  {
    id: 'proactive_chat',
    category: 'proactive_engagement',
    name: '主动发送聊天消息',
    description: 'AI 根据日常日程或关怀规则主动发起微信聊天',
    defaultLevel: 'ASK',
    isSensitive: false,
  },
  {
    id: 'context_care',
    category: 'proactive_engagement',
    name: '结合长期记忆与状态主动关怀',
    description: '结合用户历史记忆与当前情境生成温情提醒',
    defaultLevel: 'ALLOW',
    isSensitive: false,
  },

  // 4. 界面控制
  {
    id: 'applet_navigation',
    category: 'ui_control',
    name: '小手机内部页面主动跳转',
    description: '在小手机内部由 AI 引导打开备忘录、天气或经期页面',
    defaultLevel: 'ASK',
    isSensitive: false,
  },
  {
    id: 'external_app_interaction',
    category: 'ui_control',
    name: '辅助点击与外部 App 控制 (Phase 2)',
    description: '通过无障碍服务辅助点击、滑动或输入',
    defaultLevel: 'DENY',
    requiredCapabilityId: 'accessibility',
    isSensitive: true,
  },

  // 5. 通知能力
  {
    id: 'system_notification',
    category: 'notification_power',
    name: '发送系统通知栏消息',
    description: '在 Android 通知栏推送常驻或临时通知消息',
    defaultLevel: 'ALLOW',
    requiredCapabilityId: 'notification',
    isSensitive: false,
  },
  {
    id: 'floating_bubble',
    category: 'notification_power',
    name: '弹出桌面悬浮气泡 / 挂件',
    description: '以轻量级悬浮气泡形式展示动态对话或情绪小挂件',
    defaultLevel: 'ASK',
    requiredCapabilityId: 'floating_window',
    isSensitive: true,
  },
  {
    id: 'haptic_vibration',
    category: 'notification_power',
    name: '触觉震动马达反馈',
    description: '在微信表达心跳、惊喜或重要提醒时调用手机震动',
    defaultLevel: 'ALLOW',
    isSensitive: false,
  },

  // 6. 设备能力
  {
    id: 'camera_use',
    category: 'device_power',
    name: '拍摄照片与图库识别',
    description: '在聊天中拍摄现实生活照片供 AI 观看',
    defaultLevel: 'DENY',
    requiredCapabilityId: 'camera',
    isSensitive: true,
  },
  {
    id: 'mic_listen',
    category: 'device_power',
    name: '麦克风语音录制与实时通话',
    description: '录制用户说话语音或建立实时双向语音通话',
    defaultLevel: 'DENY',
    requiredCapabilityId: 'microphone',
    isSensitive: true,
  },
  {
    id: 'iot_device_control',
    category: 'device_power',
    name: '联动控制已连接的智能设备',
    description: '协助开关空调、调暗台灯或读取手环健康数据',
    defaultLevel: 'ASK',
    isSensitive: false,
  },

  // 7. 后台能力
  {
    id: 'background_ai_decision',
    category: 'background_power',
    name: '后台 AI 评估与状态关怀决策',
    description: '在手机待机或后台运行时定期评估是否需要关怀',
    defaultLevel: 'ASK',
    requiredCapabilityId: 'background_execution',
    isSensitive: true,
  },
  {
    id: 'scheduled_alarm_wake',
    category: 'background_power',
    name: '定时唤醒与闹钟备忘服务',
    description: '按照设定时间点准时触发早晚安或日程备忘提醒',
    defaultLevel: 'ALLOW',
    isSensitive: false,
  },
];

// Predefined 10 Scene Rules
const DEFAULT_SCENE_RULES: Record<SceneId, SceneRuleConfig> = {
  short_video: {
    sceneId: 'short_video',
    sceneName: '短视频 (抖音/快手等)',
    description: '刷短视频沉浸娱乐场景，支持设定使用时长分阶段温和介入',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
    interventionThresholds: {
      minutesForProactiveMessage: 20,
      minutesForFloatingNotice: 30,
      minutesForRequestOpenPhone: 45,
      minutesForForceOpenPhone: 60,
    },
  },
  gaming: {
    sceneId: 'gaming',
    sceneName: '游戏场景 (王者/原神等)',
    description: '游戏对战中，默认允许感知与发消息，严禁强制切走或抢占前台',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: false,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  browser: {
    sceneId: 'browser',
    sceneName: '网页浏览',
    description: '日常查阅网页资料，可适度进行辅助阅读',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  social: {
    sceneId: 'social',
    sceneName: '社交聊天',
    description: '日常使用微信、微博、小红书等社交应用',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  media_video: {
    sceneId: 'media_video',
    sceneName: '影音播放',
    description: '观看电影、长视频或听音乐中，避免突兀打断',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: false,
    allowNotification: true,
    allowFloating: false,
    allowRequestOpenPhone: false,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  study: {
    sceneId: 'study',
    sceneName: '学习 / 办公',
    description: '专注工作或阅读学习场景，鼓励提供高效辅助',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  general_app: {
    sceneId: 'general_app',
    sceneName: '普通 App',
    description: '其他常规工具类、生活类应用场景',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  finance_payment: {
    sceneId: 'finance_payment',
    sceneName: '银行 / 支付安全',
    description: '银行手机网银、支付宝、微信支付等财务敏感场景',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: false,
    allowNotification: false,
    allowFloating: false,
    allowRequestOpenPhone: false,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  password_auth: {
    sceneId: 'password_auth',
    sceneName: '密码 / 验证场景',
    description: '输入锁屏密码、动态短信验证码等高私密场景',
    allowSense: false,
    allowScreen: false,
    allowProactiveMessage: false,
    allowNotification: false,
    allowFloating: false,
    allowRequestOpenPhone: false,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
  custom: {
    sceneId: 'custom',
    sceneName: '自定义场景',
    description: '用户根据个人日常习惯自定义配置的场景规则',
    allowSense: true,
    allowScreen: false,
    allowProactiveMessage: true,
    allowNotification: true,
    allowFloating: true,
    allowRequestOpenPhone: true,
    allowForceOpenPhone: false,
    allowExternalControl: false,
  },
};

class PermissionManager {
  private static instance: PermissionManager;
  private aiConfigs: Record<string, AiAgentPermissionConfig> = {};
  private permChangeEvents: PermissionChangedEvent[] = [];
  private sceneRules: Record<SceneId, SceneRuleConfig> = { ...DEFAULT_SCENE_RULES };
  private currentScene: SceneId = 'general_app';
  private doNotDisturbToday: boolean = false;
  private dndDate: string = '';
  private listeners: Array<() => void> = [];

  private constructor() {
    this.loadAll();
    this.syncWithExistingCharacters();
  }

  public static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  private loadAll() {
    if (typeof window === 'undefined') return;
    try {
      // 1. AI Independent Permissions
      const rawAi = localStorage.getItem(STORAGE_KEYS.AI_PERMS);
      if (rawAi) {
        this.aiConfigs = JSON.parse(rawAi);
      }

      // 2. Permission Change Events
      const rawEvents = localStorage.getItem(STORAGE_KEYS.PERM_EVENTS);
      if (rawEvents) {
        this.permChangeEvents = JSON.parse(rawEvents);
      }

      // 3. Scene Rules
      const rawRules = localStorage.getItem(STORAGE_KEYS.SCENE_RULES);
      if (rawRules) {
        this.sceneRules = { ...DEFAULT_SCENE_RULES, ...JSON.parse(rawRules) };
      }

      // 4. Current Scene
      const rawCurrentScene = localStorage.getItem(STORAGE_KEYS.CURRENT_SCENE);
      if (rawCurrentScene && DEFAULT_SCENE_RULES[rawCurrentScene as SceneId]) {
        this.currentScene = rawCurrentScene as SceneId;
      }

      // 5. DND Today
      const rawDnd = localStorage.getItem(STORAGE_KEYS.DND_TODAY);
      if (rawDnd) {
        const parsed = JSON.parse(rawDnd);
        const todayStr = new Date().toISOString().slice(0, 10);
        if (parsed.date === todayStr) {
          this.doNotDisturbToday = Boolean(parsed.enabled);
          this.dndDate = todayStr;
        } else {
          this.doNotDisturbToday = false;
          this.dndDate = todayStr;
        }
      }
    } catch (e) {
      console.warn('Failed to load PermissionManager storage:', e);
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.AI_PERMS, JSON.stringify(this.aiConfigs));
      localStorage.setItem(STORAGE_KEYS.PERM_EVENTS, JSON.stringify(this.permChangeEvents.slice(0, 200)));
      localStorage.setItem(STORAGE_KEYS.SCENE_RULES, JSON.stringify(this.sceneRules));
      localStorage.setItem(STORAGE_KEYS.CURRENT_SCENE, this.currentScene);
      localStorage.setItem(
        STORAGE_KEYS.DND_TODAY,
        JSON.stringify({ enabled: this.doNotDisturbToday, date: this.dndDate })
      );
    } catch (e) {
      console.warn('Failed to persist PermissionManager:', e);
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
        console.warn('PermissionManager listener error:', e);
      }
    });
  }

  /**
   * Reads existing AI characters from storage and ensures each AI has an independent permission profile.
   * Does NOT create duplicate AI data!
   */
  public syncWithExistingCharacters(): void {
    const chars = loadCharacters();
    let hasChanges = false;

    chars.forEach((c) => {
      if (!this.aiConfigs[c.id]) {
        const defaultPerms: Record<string, AiPermissionLevel> = {};
        AI_PERMISSION_ITEMS.forEach((item) => {
          defaultPerms[item.id] = item.defaultLevel;
        });

        this.aiConfigs[c.id] = {
          aiId: c.id,
          aiName: c.name,
          allowAwarePermissionChanges: true, // 默认允许感知
          permissions: defaultPerms,
          updatedAt: Date.now(),
        };
        hasChanges = true;
      } else {
        // Update name in case character name was renamed in WeChat
        if (this.aiConfigs[c.id].aiName !== c.name) {
          this.aiConfigs[c.id].aiName = c.name;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      this.persist();
      this.notify();
    }
  }

  // ==========================================
  // AI Independent Permissions Management
  // ==========================================

  public getAiConfig(aiId: string): AiAgentPermissionConfig | null {
    this.syncWithExistingCharacters();
    return this.aiConfigs[aiId] || null;
  }

  public getAllAiConfigs(): Record<string, AiAgentPermissionConfig> {
    this.syncWithExistingCharacters();
    return { ...this.aiConfigs };
  }

  /**
   * Update a specific permission for an AI character.
   * Generates PERMISSION_CHANGED event and logs to ActivityLogger.
   */
  public updateAiPermission(
    aiId: string,
    permissionId: string,
    newLevel: AiPermissionLevel,
    source: 'USER' | 'SYSTEM' = 'USER'
  ): void {
    this.syncWithExistingCharacters();
    const config = this.aiConfigs[aiId];
    if (!config) return;

    const oldValue = config.permissions[permissionId] || 'DENY';
    if (oldValue === newLevel) return;

    const itemDef = AI_PERMISSION_ITEMS.find((i) => i.id === permissionId);
    const permName = itemDef?.name || permissionId;

    // Update permission level
    config.permissions[permissionId] = newLevel;
    config.updatedAt = Date.now();

    // Create PERMISSION_CHANGED Event
    const event: PermissionChangedEvent = {
      id: 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      aiId,
      aiName: config.aiName,
      permissionId,
      permissionName: permName,
      oldValue,
      newValue: newLevel,
      timestamp: Date.now(),
      source,
    };

    this.permChangeEvents = [event, ...this.permChangeEvents];

    // Log to system audit ActivityLogger
    activityLogger.log({
      aiId,
      aiName: config.aiName,
      eventType: 'PERMISSION_CHANGED',
      requestedAction: `修改权限【${permName}】: ${oldValue} → ${newLevel}`,
      trigger: source === 'USER' ? '用户在 AI权限 控制中心手动配置' : '系统自动规则调整',
      permissionResult: 'PASSED',
      executionResult: 'SUCCESS',
      metadata: {
        permissionId,
        oldValue,
        newValue: newLevel,
        source,
      },
    });

    this.persist();
    this.notify();
  }

  /**
   * Update "允许 AI 感知自己的权限变化" toggle
   */
  public setAllowAwarePermissionChanges(aiId: string, enabled: boolean): void {
    this.syncWithExistingCharacters();
    const config = this.aiConfigs[aiId];
    if (!config) return;

    config.allowAwarePermissionChanges = enabled;
    config.updatedAt = Date.now();
    this.persist();
    this.notify();
  }

  public getPermissionChangeEvents(aiId?: string): PermissionChangedEvent[] {
    if (aiId) {
      return this.permChangeEvents.filter((e) => e.aiId === aiId);
    }
    return [...this.permChangeEvents];
  }

  // ==========================================
  // AI-Restricted Self Query API (Mandatory Requirement)
  // AI can ONLY view its OWN permissions!
  // ==========================================

  /**
   * Returns this AI's own permissions, current scene rules, system capabilities,
   * allowed and denied actions.
   *
   * System Rule: An AI cannot view other AIs' permissions!
   */
  public getMyPermissions(aiId: string): AiSelfPermissionView | null {
    this.syncWithExistingCharacters();
    const config = this.aiConfigs[aiId];
    if (!config) return null;

    const sysCaps = systemCapabilityManager.getAllStatuses();
    const sceneRule = this.sceneRules[this.currentScene] || DEFAULT_SCENE_RULES.general_app;

    const allowedActions: string[] = [];
    const deniedActions: string[] = [];

    AI_PERMISSION_ITEMS.forEach((item) => {
      const level = config.permissions[item.id] || 'DENY';
      // System Capability check
      let sysOk = true;
      if (item.requiredCapabilityId) {
        const capStatus = sysCaps[item.requiredCapabilityId];
        sysOk = capStatus === 'GRANTED' || capStatus === 'TEMPORARY';
      }

      // Master switch check
      if (this.doNotDisturbToday) {
        deniedActions.push(item.id);
        return;
      }

      // 4-tier check
      if (level === 'ALLOW' && sysOk) {
        allowedActions.push(item.id);
      } else {
        deniedActions.push(item.id);
      }
    });

    const recentChanges = config.allowAwarePermissionChanges
      ? this.permChangeEvents.filter((e) => e.aiId === aiId).slice(0, 10)
      : [];

    return {
      aiId,
      aiName: config.aiName,
      doNotDisturbActive: this.doNotDisturbToday,
      permissions: { ...config.permissions },
      systemCapabilities: sysCaps,
      currentScene: this.currentScene,
      currentSceneRules: sceneRule,
      allowedActions,
      deniedActions,
      recentPermissionChanges: recentChanges,
    };
  }

  /**
   * Quick check for AI's authorized action list
   */
  public getMyAvailableActions(aiId: string): string[] {
    const view = this.getMyPermissions(aiId);
    return view ? view.allowedActions : [];
  }

  // ==========================================
  // Scene Rules Management
  // ==========================================

  public getAllSceneRules(): Record<SceneId, SceneRuleConfig> {
    return { ...this.sceneRules };
  }

  public getSceneRule(sceneId: SceneId): SceneRuleConfig {
    return this.sceneRules[sceneId] || DEFAULT_SCENE_RULES.general_app;
  }

  public updateSceneRule(sceneId: SceneId, updates: Partial<SceneRuleConfig>): void {
    const current = this.sceneRules[sceneId] || DEFAULT_SCENE_RULES[sceneId];
    this.sceneRules[sceneId] = {
      ...current,
      ...updates,
    };
    this.persist();
    this.notify();
  }

  public getCurrentScene(): SceneId {
    return this.currentScene;
  }

  public setCurrentScene(sceneId: SceneId): void {
    if (this.sceneRules[sceneId]) {
      this.currentScene = sceneId;
      this.persist();
      this.notify();
    }
  }

  // ==========================================
  // "今天别管我" (Do Not Disturb Today) Master Switch
  // ==========================================

  public isDoNotDisturbToday(): boolean {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (this.dndDate !== todayStr) {
      this.doNotDisturbToday = false;
      this.dndDate = todayStr;
      this.persist();
    }
    return this.doNotDisturbToday;
  }

  public setDoNotDisturbToday(enabled: boolean): void {
    const todayStr = new Date().toISOString().slice(0, 10);
    this.doNotDisturbToday = enabled;
    this.dndDate = todayStr;
    this.persist();
    this.notify();

    activityLogger.log({
      aiId: 'system',
      aiName: '系统主控',
      eventType: 'ACTION_REQUEST',
      requestedAction: enabled ? '开启【今天别管我】总静默模式' : '关闭【今天别管我】，恢复原有权限配置',
      trigger: '用户在 AI权限 控制中心顶栏操作',
      permissionResult: 'PASSED',
      executionResult: 'SUCCESS',
      metadata: { enabled, date: todayStr },
    });
  }
}

export const permissionManager = PermissionManager.getInstance();
