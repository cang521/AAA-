/**
 * AI Phone Agent - Core Types & Permission Models (Phase 1)
 *
 * Four-Tier Permission Architecture:
 * 1. Android System Capability (Tier 1)
 * 2. AI Independent Permissions (Tier 2)
 * 3. Scene Rules (Tier 3)
 * 4. Runtime Verification (Tier 4)
 */

// ==========================================
// Tier 1: System Capability Statuses & Types
// ==========================================

export type CapabilityStatus =
  | 'GRANTED'            // 🟢 已授权
  | 'TEMPORARY'          // 🟡 临时授权 / 使用时授权
  | 'DENIED'             // 🔴 未授权
  | 'REQUEST_FAILED'     // 🟠 获取失败
  | 'SETTINGS_REQUIRED'  // 🔵 需要系统设置
  | 'UNSUPPORTED'        // ⚫ 当前设备不支持
  | 'NEED_APK'           // 🟣 需要安装 Android APK 后使用
  | 'NOT_IMPLEMENTED';   // ⚪ 未实现

export type SystemCapabilityId =
  | 'notification'             // 1. 通知权限
  | 'notification_listener'    // 2. 通知读取 (NotificationListenerService)
  | 'usage_stats'              // 3. 前台 App / App 使用情况 (UsageStatsManager)
  | 'screen_capture'           // 4. 屏幕查看 / 屏幕捕获 (MediaProjection)
  | 'floating_window'          // 5. 悬浮窗 (Draw Over Other Apps / SYSTEM_ALERT_WINDOW)
  | 'accessibility'            // 6. 无障碍 / 界面辅助控制 (AccessibilityService)
  | 'geolocation'              // 7. 定位 (ACCESS_FINE_LOCATION / GPS)
  | 'camera'                   // 8. 相机 (CAMERA)
  | 'microphone'               // 9. 麦克风 (RECORD_AUDIO)
  | 'bluetooth'                // 10. 蓝牙 / 附近设备 (BLUETOOTH_CONNECT/SCAN)
  | 'media_storage'            // 11. 文件 / 媒体访问 (READ_MEDIA_IMAGES/VIDEO)
  | 'background_execution'     // 12. 后台运行 (ForegroundService / WakeLock)
  | 'battery_optimization'     // 13. 电池优化白名单 (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
  | 'vendor_autostart';        // 14. 厂商自启动 / 后台弹出界面 (Vendor OEM Settings)

export interface SystemCapabilityDef {
  id: SystemCapabilityId;
  name: string;
  category: 'core' | 'sensing' | 'hardware' | 'system_level' | 'vendor';
  androidApiName: string;
  description: string;
  whyNeeded: string;
  isSensitive: boolean;
  requiresNativeService: boolean; // Needs native Android Service (Accessibility, NotificationListener, etc.)
  settingsPathTier1: string;     // Exact target settings intent
  settingsPathTier2: string;     // Special access page
  settingsPathTier3: string;     // App details page
}

export interface CapabilityDiagnosticResult {
  vendor: string;
  model: string;
  osVersion: string;
  targetCapabilityId: SystemCapabilityId;
  targetCapabilityName: string;
  androidSupported: boolean;
  nativeInterfaceExists: boolean;
  exactSettingsAccessible: boolean;
  fallbackSettingsAccessible: boolean;
  currentStatus: CapabilityStatus;
  recommendedAction: string;
  bestSettingsTarget: string;
  notSupportedReason?: string;
  timestamp: number;
}

// ==========================================
// Tier 2: AI Independent Permissions (Per AI)
// ==========================================

export type AiPermissionLevel = 'DENY' | 'ASK' | 'ALLOW';

export type AiPermissionCategory =
  | 'basic_sense'             // 1. 基础感知 (时间、电量、网络、当前前台应用)
  | 'screen_sense'            // 2. 屏幕感知 (查看当前屏幕)
  | 'proactive_engagement'    // 3. 主动参与 (主动发消息、主动发起话题)
  | 'ui_control'              // 4. 界面控制 (页面内部跳转、辅助交互)
  | 'notification_power'      // 5. 通知能力 (发送系统通知、震动关怀)
  | 'device_power'            // 6. 设备能力 (音量、亮度、硬件设备感知)
  | 'background_power';       // 7. 后台能力 (后台活动、定时唤醒、延迟任务)

export interface AiPermissionItemDef {
  id: string;
  category: AiPermissionCategory;
  name: string;
  description: string;
  defaultLevel: AiPermissionLevel;
  requiredCapabilityId?: SystemCapabilityId;
  isSensitive: boolean;
}

export interface AiAgentPermissionConfig {
  aiId: string;
  aiName: string;
  allowAwarePermissionChanges: boolean; // 允许 AI 感知自己的权限变化 (默认开启)
  permissions: Record<string, AiPermissionLevel>; // key: permissionId -> DENY | ASK | ALLOW
  updatedAt: number;
}

export interface PermissionChangedEvent {
  id: string;
  aiId: string;
  aiName: string;
  permissionId: string;
  permissionName: string;
  oldValue: AiPermissionLevel;
  newValue: AiPermissionLevel;
  timestamp: number;
  source: 'USER' | 'SYSTEM';
}

// ==========================================
// Tier 3: Scene Rules (Contextual)
// ==========================================

export type SceneId =
  | 'short_video'       // 短视频 (抖音、快手等)
  | 'gaming'            // 游戏
  | 'browser'           // 浏览器
  | 'social'            // 社交
  | 'media_video'       // 影音 (长视频、电影)
  | 'study'             // 学习 / 办公
  | 'general_app'       // 普通 App
  | 'finance_payment'   // 银行 / 支付
  | 'password_auth'     // 密码 / 验证
  | 'custom';           // 自定义场景

export interface SceneRuleConfig {
  sceneId: SceneId;
  sceneName: string;
  description: string;
  allowSense: boolean;              // 是否允许感知
  allowScreen: boolean;             // 是否允许查看屏幕
  allowProactiveMessage: boolean;   // 是否允许主动消息
  allowNotification: boolean;       // 是否允许系统通知
  allowFloating: boolean;           // 是否允许悬浮
  allowRequestOpenPhone: boolean;   // 是否允许请求打开小手机
  allowForceOpenPhone: boolean;     // 是否允许主动打开小手机
  allowExternalControl: boolean;    // 是否允许外部界面控制
  // Phased intervention thresholds (especially for short video)
  interventionThresholds?: {
    minutesForProactiveMessage: number;   // e.g. 20 min
    minutesForFloatingNotice: number;    // e.g. 30 min
    minutesForRequestOpenPhone: number;  // e.g. 45 min
    minutesForForceOpenPhone: number;    // e.g. 60 min
  };
}

// ==========================================
// System Audit Activity Log Model
// ==========================================

export type ActivityEventType =
  | 'PERMISSION_CHECK'
  | 'PERMISSION_CHANGED'
  | 'CAPABILITY_CHECK'
  | 'ACTION_REQUEST'
  | 'PROACTIVE_MESSAGE'
  | 'SCENE_TRANSITION'
  | 'DIAGNOSTIC';

export type ActivityPermissionResult =
  | 'ALLOW'
  | 'DENY'
  | 'ASK_PENDING'
  | 'PASSED'
  | 'BLOCKED';

export type ActivityExecutionResult =
  | 'SUCCESS'
  | 'FAILED'
  | 'REJECTED'
  | 'NOT_ATTEMPTED';

export interface AiActivityLog {
  id: string;
  aiId: string;
  aiName: string;
  timestamp: number;
  eventType: ActivityEventType;
  requestedAction: string;
  trigger: string;
  permissionResult: ActivityPermissionResult;
  executionResult: ActivityExecutionResult;
  failureReason?: string;
  relatedMessageId?: string;
  metadata?: Record<string, any>;
}

// ==========================================
// Phase 2: Events & Decision Chain Types
// ==========================================

export type AgentEventType =
  | 'APP_FOREGROUND_CHANGED'
  | 'APP_USAGE_TICK'
  | 'BATTERY_CHANGED'
  | 'TIME_PERIOD_CHANGED'
  | 'SCENE_CHANGED'
  | 'MANUAL_TRIGGER'
  | 'PERIODIC_EVALUATION';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: number;
  payload: Record<string, any>;
  summary: string;
}

export type AgentActionType =
  | 'proactive_chat'
  | 'screen_view'
  | 'system_notification'
  | 'floating_bubble'
  | 'request_open_phone'
  | 'app_navigate';

export interface ActionCandidate {
  id: string;
  targetAiId: string;
  targetAiName: string;
  actionType: AgentActionType;
  actionTitle: string;
  triggerReason: string;
  urgency: 'low' | 'normal' | 'high';
  proposedMessageText?: string;
  targetAppId?: string;
  metadata?: Record<string, any>;
}

export interface DecisionTraceStage {
  stageName: string;
  passed: boolean;
  statusText: string;
  detail: string;
}

export interface AgentDecisionTrace {
  id: string;
  timestamp: number;
  candidate: ActionCandidate;
  stages: DecisionTraceStage[];
  finalOutcome: 'ALLOW' | 'ASK' | 'DENY';
  executionResult?: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'WAITING_USER';
  failureReason?: string;
}

export interface AgentAskPrompt {
  id: string;
  aiId: string;
  aiName: string;
  aiAvatar?: string;
  actionType: AgentActionType;
  actionTitle: string;
  sceneName: string;
  description: string;
  timestamp: number;
  resolve: (decision: 'ALLOW_ONCE' | 'ALLOW_ALWAYS' | 'DENY') => void;
}

export interface InPhoneNotification {
  id: string;
  aiId: string;
  aiName: string;
  aiAvatar?: string;
  title: string;
  content: string;
  timestamp: number;
  category?: 'proactive_chat' | 'system_alert' | 'care';
}

export interface AiSelfPermissionView {
  aiId: string;
  aiName: string;
  doNotDisturbActive: boolean;
  permissions: Record<string, AiPermissionLevel>;
  systemCapabilities: Record<SystemCapabilityId, CapabilityStatus>;
  currentScene: SceneId;
  currentSceneRules: SceneRuleConfig;
  allowedActions: string[];
  deniedActions: string[];
  recentPermissionChanges: PermissionChangedEvent[];
}

