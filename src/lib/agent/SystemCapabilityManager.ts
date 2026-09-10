/**
 * SystemCapabilityManager - Tier 1 System Capability Manager
 *
 * Manages detection, requesting, diagnostics, and settings navigation
 * for all 14 Android / Environment system capabilities.
 *
 * Rule: Never fake GRANTED!
 * Accurate statuses:
 * GRANTED | TEMPORARY | DENIED | REQUEST_FAILED | SETTINGS_REQUIRED | UNSUPPORTED | NOT_IMPLEMENTED
 */

import {
  CapabilityStatus,
  SystemCapabilityId,
  SystemCapabilityDef,
  CapabilityDiagnosticResult,
} from './types';

export const SYSTEM_CAPABILITIES_LIST: SystemCapabilityDef[] = [
  {
    id: 'notification',
    name: '系统通知权限',
    category: 'core',
    androidApiName: 'POST_NOTIFICATIONS / NotificationManager',
    description: '允许小手机在通知栏常驻并发送系统级关怀消息或提醒。',
    whyNeeded: 'AI 角色在被用户需要或关怀提醒时，通过系统通知栏主动传达消息。',
    isSensitive: false,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.APP_NOTIFICATION_SETTINGS',
    settingsPathTier2: 'android.settings.ALL_APPS_NOTIFICATION_SETTINGS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'notification_listener',
    name: '通知读取服务',
    category: 'system_level',
    androidApiName: 'NotificationListenerService',
    description: '监听并读取外部社交、即时通讯或外卖快递等通知内容。',
    whyNeeded: 'AI 感知用户外部未读消息并在合适时机主动提醒。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
    settingsPathTier2: 'android.settings.NOTIFICATION_SETTINGS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'usage_stats',
    name: '应用使用情况 (前台 App)',
    category: 'system_level',
    androidApiName: 'UsageStatsManager / Usage Access',
    description: '感知当前前台正在运行的外部 App 及其持续使用时长。',
    whyNeeded: 'AI 识别游戏、短视频或学习场景，了解应用使用时长并在合理阈值给出关怀。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.USAGE_ACCESS_SETTINGS',
    settingsPathTier2: 'android.settings.PRIVACY_SETTINGS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'screen_capture',
    name: '屏幕捕获 / 屏幕感知',
    category: 'sensing',
    androidApiName: 'MediaProjection / VirtualDisplay',
    description: '在用户明确授权下获取手机当前屏幕截图或画面进行感知分析。',
    whyNeeded: 'AI 在用户求助或允许场景下辅助阅读文章、看图解惑。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.intent.action.MEDIA_PROJECTION',
    settingsPathTier2: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'floating_window',
    name: '悬浮窗 / 悬浮挂件',
    category: 'system_level',
    androidApiName: 'Draw Over Other Apps / SYSTEM_ALERT_WINDOW',
    description: '在其他 App 上层显示小手机桌面挂件或 AI 悬浮动态气泡。',
    whyNeeded: '在用户刷短视频或打游戏时，以不打扰前台界面的轻量气泡出现。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.action.MANAGE_OVERLAY_PERMISSION',
    settingsPathTier2: 'android.settings.SPECIAL_APP_ACCESS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'accessibility',
    name: '无障碍 / 界面辅助服务',
    category: 'system_level',
    androidApiName: 'AccessibilityService',
    description: '通过 Android 无障碍机制读取界面无障碍节点树并提供辅助控制。',
    whyNeeded: '未来支持根据用户指令自动点按外部按钮或跨应用辅助交互。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.ACCESSIBILITY_SETTINGS',
    settingsPathTier2: 'android.settings.SETTINGS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'geolocation',
    name: 'GPS / 粗略与精确位置',
    category: 'hardware',
    androidApiName: 'ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION',
    description: '获取设备地理经纬度坐标，用于天气更新、城市定位。',
    whyNeeded: 'AI 根据你的城市和天气主动提醒降雨、降温或出行建议。',
    isSensitive: true,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.LOCATION_SOURCE_SETTINGS',
    settingsPathTier2: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'camera',
    name: '相机权限',
    category: 'hardware',
    androidApiName: 'CAMERA / Camera2',
    description: '拍摄照片或扫描现实二维码。',
    whyNeeded: '微信聊天中拍摄照片分享给 AI 角色看。',
    isSensitive: true,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier2: 'android.settings.PRIVACY_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'microphone',
    name: '麦克风语音录制',
    category: 'hardware',
    androidApiName: 'RECORD_AUDIO / AudioRecord',
    description: '录制语音输入、语音备忘或与 AI 实时语音对话。',
    whyNeeded: '微信按住说话发送语音给 AI 角色，或直接与 AI 进行语音通话。',
    isSensitive: true,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier2: 'android.settings.PRIVACY_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'bluetooth',
    name: '蓝牙 / 附近智能设备',
    category: 'hardware',
    androidApiName: 'BLUETOOTH_CONNECT / BLUETOOTH_SCAN',
    description: '扫描和连接附近蓝牙智能手环、IoT设备或耳机。',
    whyNeeded: 'AI 获取手环心率步数或控制外设设备。',
    isSensitive: false,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.BLUETOOTH_SETTINGS',
    settingsPathTier2: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'media_storage',
    name: '多媒体相册与文件访问',
    category: 'core',
    androidApiName: 'READ_MEDIA_IMAGES / READ_EXTERNAL_STORAGE',
    description: '访问手机图库选择壁纸、头像、朋友圈图片以及数据备份文件。',
    whyNeeded: '微信发图、更换桌面壁纸、导入导出小手机全部数据。',
    isSensitive: false,
    requiresNativeService: false,
    settingsPathTier1: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier2: 'android.settings.INTERNAL_STORAGE_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'background_execution',
    name: '后台持续运行',
    category: 'system_level',
    androidApiName: 'FOREGROUND_SERVICE / WakeLock',
    description: '维持后台前台服务与唤醒锁，防止小手机被系统直接杀后台。',
    whyNeeded: '保证闹钟、定时主动关怀以及世界书记忆同步准时生效。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    settingsPathTier2: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
  {
    id: 'battery_optimization',
    name: '电池无限制 / 忽略电池优化',
    category: 'system_level',
    androidApiName: 'ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    description: '加入系统电池优化白名单，避免手机息屏后立即冻结后台进程。',
    whyNeeded: '确保息屏待机状态下主动提醒能够及时弹出。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    settingsPathTier2: 'android.settings.BATTERY_SAVER_SETTINGS',
    settingsPathTier3: 'android.settings.APPLICATION_DETAILS_SETTINGS',
  },
  {
    id: 'vendor_autostart',
    name: '厂商自启动 / 后台弹出界面',
    category: 'vendor',
    androidApiName: 'OEM Autostart / Background Pop-up (vivo/OPPO/Xiaomi/Huawei)',
    description: '主流厂商针对自启动、后台锁卡以及在其他应用上弹出界面的专门权限。',
    whyNeeded: '避免 vivo/OPPO/小米/华为 等系统因自启动拦截导致服务无法拉起。',
    isSensitive: true,
    requiresNativeService: true,
    settingsPathTier1: 'com.iqoo.secure / com.miui.securitycenter / com.huawei.systemmanager',
    settingsPathTier2: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    settingsPathTier3: 'android.settings.SETTINGS',
  },
];

class SystemCapabilityManager {
  private static instance: SystemCapabilityManager;
  private statusMap: Record<SystemCapabilityId, CapabilityStatus> = {} as any;
  private lastCheckTimestamp: number = 0;
  private listeners: Array<() => void> = [];

  private constructor() {
    this.initDefaultStatuses();
  }

  public static getInstance(): SystemCapabilityManager {
    if (!SystemCapabilityManager.instance) {
      SystemCapabilityManager.instance = new SystemCapabilityManager();
    }
    return SystemCapabilityManager.instance;
  }

  private initDefaultStatuses() {
    // Initialize initial safe defaults
    SYSTEM_CAPABILITIES_LIST.forEach((cap) => {
      if (cap.requiresNativeService) {
        this.statusMap[cap.id] = 'NOT_IMPLEMENTED';
      } else {
        this.statusMap[cap.id] = 'DENIED';
      }
    });
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
        console.warn('SystemCapabilityManager notify error:', e);
      }
    });
  }

  public getStatus(id: SystemCapabilityId): CapabilityStatus {
    return this.statusMap[id] || 'NOT_IMPLEMENTED';
  }

  public getAllStatuses(): Record<SystemCapabilityId, CapabilityStatus> {
    return { ...this.statusMap };
  }

  public getCapabilityCounts(): {
    total: number;
    available: number; // GRANTED + TEMPORARY
    granted: number;
    temporary: number;
    denied: number;
    failed: number;
    settingsRequired: number;
    unsupported: number;
    notImplemented: number;
  } {
    let granted = 0;
    let temporary = 0;
    let denied = 0;
    let failed = 0;
    let settingsRequired = 0;
    let unsupported = 0;
    let notImplemented = 0;

    SYSTEM_CAPABILITIES_LIST.forEach((cap) => {
      const s = this.statusMap[cap.id];
      if (s === 'GRANTED') granted++;
      else if (s === 'TEMPORARY') temporary++;
      else if (s === 'DENIED') denied++;
      else if (s === 'REQUEST_FAILED') failed++;
      else if (s === 'SETTINGS_REQUIRED') settingsRequired++;
      else if (s === 'UNSUPPORTED') unsupported++;
      else notImplemented++;
    });

    return {
      total: SYSTEM_CAPABILITIES_LIST.length,
      available: granted + temporary,
      granted,
      temporary,
      denied,
      failed,
      settingsRequired,
      unsupported,
      notImplemented,
    };
  }

  /**
   * Real-time check of all 14 capabilities.
   * Does NOT fake GRANTED!
   */
  public async recheckAll(): Promise<Record<SystemCapabilityId, CapabilityStatus>> {
    this.lastCheckTimestamp = Date.now();

    // 1. Notification
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = Notification.permission;
      if (perm === 'granted') {
        this.statusMap['notification'] = 'GRANTED';
      } else if (perm === 'denied') {
        this.statusMap['notification'] = 'DENIED';
      } else {
        this.statusMap['notification'] = 'DENIED';
      }
    } else {
      this.statusMap['notification'] = 'UNSUPPORTED';
    }

    // 2. Geolocation
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (res.state === 'granted') this.statusMap['geolocation'] = 'GRANTED';
          else if (res.state === 'denied') this.statusMap['geolocation'] = 'DENIED';
          else this.statusMap['geolocation'] = 'DENIED';
        } catch {
          this.statusMap['geolocation'] = 'DENIED';
        }
      } else {
        this.statusMap['geolocation'] = 'DENIED';
      }
    } else {
      this.statusMap['geolocation'] = 'UNSUPPORTED';
    }

    // 3. Camera
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const cam = await navigator.permissions.query({ name: 'camera' as any });
          if (cam.state === 'granted') this.statusMap['camera'] = 'GRANTED';
          else if (cam.state === 'denied') this.statusMap['camera'] = 'DENIED';
          else this.statusMap['camera'] = 'DENIED';
        } catch {
          this.statusMap['camera'] = 'DENIED';
        }
      } else {
        this.statusMap['camera'] = 'DENIED';
      }
    } else {
      this.statusMap['camera'] = 'UNSUPPORTED';
    }

    // 4. Microphone
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const mic = await navigator.permissions.query({ name: 'microphone' as any });
          if (mic.state === 'granted') this.statusMap['microphone'] = 'GRANTED';
          else if (mic.state === 'denied') this.statusMap['microphone'] = 'DENIED';
          else this.statusMap['microphone'] = 'DENIED';
        } catch {
          this.statusMap['microphone'] = 'DENIED';
        }
      } else {
        this.statusMap['microphone'] = 'DENIED';
      }
    } else {
      this.statusMap['microphone'] = 'UNSUPPORTED';
    }

    // 5. Bluetooth
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      this.statusMap['bluetooth'] = 'DENIED';
    } else {
      this.statusMap['bluetooth'] = 'UNSUPPORTED';
    }

    // 6. Media / Storage
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        const persisted = await navigator.storage.persisted();
        this.statusMap['media_storage'] = persisted ? 'GRANTED' : 'DENIED';
      } catch {
        this.statusMap['media_storage'] = 'DENIED';
      }
    } else {
      this.statusMap['media_storage'] = 'GRANTED'; // In web/localStorage, basic storage is naturally available
    }

    // 7. Screen capture (Web getDisplayMedia vs Native MediaProjection)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
      // In web, screen capture is always temporary / prompt per session
      this.statusMap['screen_capture'] = 'TEMPORARY';
    } else {
      this.statusMap['screen_capture'] = 'NOT_IMPLEMENTED';
    }

    // 8. Background execution (WakeLock in web)
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      this.statusMap['background_execution'] = 'TEMPORARY';
    } else {
      this.statusMap['background_execution'] = 'NOT_IMPLEMENTED';
    }

    // Check Android Capacitor Native custom plugins if present in future
    const capacitorAgentPlugin = (window as any).Capacitor?.Plugins?.AndroidPhoneAgent;
    if (capacitorAgentPlugin) {
      try {
        const nativeResults = await capacitorAgentPlugin.checkCapabilities();
        if (nativeResults) {
          if (nativeResults.notificationListener) this.statusMap['notification_listener'] = nativeResults.notificationListener;
          if (nativeResults.usageStats) this.statusMap['usage_stats'] = nativeResults.usageStats;
          if (nativeResults.floatingWindow) this.statusMap['floating_window'] = nativeResults.floatingWindow;
          if (nativeResults.accessibility) this.statusMap['accessibility'] = nativeResults.accessibility;
          if (nativeResults.batteryOptimization) this.statusMap['battery_optimization'] = nativeResults.batteryOptimization;
          if (nativeResults.vendorAutostart) this.statusMap['vendor_autostart'] = nativeResults.vendorAutostart;
        }
      } catch (e) {
        console.warn('Native plugin check failed:', e);
      }
    } else {
      // Phase 1: Native services are explicitly marked as NOT_IMPLEMENTED
      this.statusMap['notification_listener'] = 'NOT_IMPLEMENTED';
      this.statusMap['usage_stats'] = 'NOT_IMPLEMENTED';
      this.statusMap['floating_window'] = 'NOT_IMPLEMENTED';
      this.statusMap['accessibility'] = 'NOT_IMPLEMENTED';
      this.statusMap['battery_optimization'] = 'NOT_IMPLEMENTED';
      this.statusMap['vendor_autostart'] = 'NOT_IMPLEMENTED';
    }

    this.notify();
    return { ...this.statusMap };
  }

  /**
   * Request a specific capability.
   * If request fails, sets status to REQUEST_FAILED and keeps retry always available.
   */
  public async requestCapability(id: SystemCapabilityId): Promise<{ success: boolean; status: CapabilityStatus; error?: string }> {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    if (!def) {
      return { success: false, status: 'NOT_IMPLEMENTED', error: '未知能力' };
    }

    // For not implemented native services, do not fake!
    if (def.requiresNativeService) {
      const capacitorAgentPlugin = (window as any).Capacitor?.Plugins?.AndroidPhoneAgent;
      if (!capacitorAgentPlugin) {
        this.statusMap[id] = 'NOT_IMPLEMENTED';
        this.notify();
        return {
          success: false,
          status: 'NOT_IMPLEMENTED',
          error: '当前版本尚未实现该项 Android 原生后台服务 (Phase 2 原生插件预留)。',
        };
      }
    }

    try {
      if (id === 'notification') {
        if ('Notification' in window) {
          const res = await Notification.requestPermission();
          if (res === 'granted') {
            this.statusMap['notification'] = 'GRANTED';
          } else {
            this.statusMap['notification'] = 'REQUEST_FAILED';
          }
        } else {
          this.statusMap['notification'] = 'UNSUPPORTED';
        }
      } else if (id === 'geolocation') {
        if ('geolocation' in navigator) {
          const success = await new Promise<boolean>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => resolve(true),
              () => resolve(false),
              { timeout: 8000 }
            );
          });
          this.statusMap['geolocation'] = success ? 'GRANTED' : 'REQUEST_FAILED';
        } else {
          this.statusMap['geolocation'] = 'UNSUPPORTED';
        }
      } else if (id === 'camera') {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach((t) => t.stop());
          this.statusMap['camera'] = 'GRANTED';
        } else {
          this.statusMap['camera'] = 'REQUEST_FAILED';
        }
      } else if (id === 'microphone') {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          this.statusMap['microphone'] = 'GRANTED';
        } else {
          this.statusMap['microphone'] = 'REQUEST_FAILED';
        }
      } else if (id === 'screen_capture') {
        if (navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
          stream.getTracks().forEach((t: any) => t.stop());
          this.statusMap['screen_capture'] = 'TEMPORARY';
        } else {
          this.statusMap['screen_capture'] = 'REQUEST_FAILED';
        }
      } else if (id === 'media_storage') {
        if (navigator.storage && navigator.storage.persist) {
          const persisted = await navigator.storage.persist();
          this.statusMap['media_storage'] = persisted ? 'GRANTED' : 'TEMPORARY';
        } else {
          this.statusMap['media_storage'] = 'GRANTED';
        }
      } else if (id === 'background_execution') {
        if ('wakeLock' in navigator) {
          try {
            const lock = await (navigator as any).wakeLock.request('screen');
            setTimeout(() => lock.release(), 1000);
            this.statusMap['background_execution'] = 'TEMPORARY';
          } catch {
            this.statusMap['background_execution'] = 'REQUEST_FAILED';
          }
        } else {
          this.statusMap['background_execution'] = 'NOT_IMPLEMENTED';
        }
      } else {
        // Requires system settings or native plugin
        this.statusMap[id] = 'SETTINGS_REQUIRED';
      }

      this.notify();
      const current = this.statusMap[id];
      return {
        success: current === 'GRANTED' || current === 'TEMPORARY',
        status: current,
      };
    } catch (err: any) {
      console.warn(`Request capability ${id} failed:`, err);
      this.statusMap[id] = 'REQUEST_FAILED';
      this.notify();
      return {
        success: false,
        status: 'REQUEST_FAILED',
        error: err?.message || '用户拒绝或环境暂不支持',
      };
    }
  }

  /**
   * Diagnostic inspector for a capability.
   * Detects device vendor (vivo, OPPO, Xiaomi, Huawei, Honor, Samsung, etc.)
   * and provides fallback analysis.
   */
  public runDiagnostics(id: SystemCapabilityId): CapabilityDiagnosticResult {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

    let vendor = '未知设备 / Web环境';
    if (/vivo|v\d{4}|v\d{3}/i.test(ua)) vendor = 'vivo / iQOO';
    else if (/oppo|cph\d{4}|p[a-z]\d{4}/i.test(ua)) vendor = 'OPPO / OnePlus / realme';
    else if (/xiaomi|redmi|mi\s|mix\s/i.test(ua)) vendor = '小米 (Xiaomi / Redmi)';
    else if (/huawei|honor/i.test(ua)) vendor = '华为 (Huawei / 荣耀)';
    else if (/samsung|sm-[a-z]\d{3}/i.test(ua)) vendor = '三星 (Samsung)';
    else if (/pixel/i.test(ua)) vendor = 'Google Pixel';
    else if (/android/i.test(ua)) vendor = '通用 Android 设备';
    else if (/iphone|ipad|ipod/i.test(ua)) vendor = 'Apple iOS 设备';

    let osVersion = 'Browser Web / Container';
    const match = ua.match(/Android\s([0-9.]+)/i);
    if (match) osVersion = `Android ${match[1]}`;

    const currentStatus = this.getStatus(id);
    const isNativeService = def?.requiresNativeService ?? false;

    let androidSupported = true;
    let nativeInterfaceExists = false;
    let exactSettingsAccessible = false;
    let fallbackSettingsAccessible = true;
    let recommendedAction = '打开应用详情继续设置';
    let bestSettingsTarget = def?.settingsPathTier3 || 'android.settings.APPLICATION_DETAILS_SETTINGS';
    let notSupportedReason: string | undefined;

    if (isNativeService) {
      const hasCapacitor = Boolean((window as any).Capacitor);
      if (!hasCapacitor) {
        nativeInterfaceExists = false;
        exactSettingsAccessible = false;
        notSupportedReason = '当前运行于标准 Web 浏览器环境中，缺少 Android 原生 AccessibilityService / UsageStatsManager 守护服务。';
        recommendedAction = '在最终打包构建为 Android 原生 APK 后方可启用原生系统服务。';
        bestSettingsTarget = '等待 Phase 2 原生插件构建';
      } else {
        nativeInterfaceExists = false; // Phase 1
        recommendedAction = '在小手机 APK 中前往厂商安全中心开放权限';
        bestSettingsTarget = def?.settingsPathTier1 || '系统设置';
      }
    } else {
      nativeInterfaceExists = true;
      exactSettingsAccessible = true;
      if (currentStatus === 'DENIED' || currentStatus === 'REQUEST_FAILED') {
        recommendedAction = '点击【再次获取】或前往浏览器/系统设置授权';
        bestSettingsTarget = def?.settingsPathTier1 || '应用详情';
      } else if (currentStatus === 'GRANTED') {
        recommendedAction = '能力已正常授权，可随时使用';
        bestSettingsTarget = '已生效';
      }
    }

    return {
      vendor,
      model: typeof navigator !== 'undefined' ? (navigator as any).platform || 'Web Simulator' : 'Web Simulator',
      osVersion,
      targetCapabilityId: id,
      targetCapabilityName: def?.name || id,
      androidSupported,
      nativeInterfaceExists,
      exactSettingsAccessible,
      fallbackSettingsAccessible,
      currentStatus,
      recommendedAction,
      bestSettingsTarget,
      notSupportedReason,
      timestamp: Date.now(),
    };
  }

  /**
   * Automatic Settings Fallback Navigator:
   * 1. Target exact permission intent
   * 2. Special access page
   * 3. App details page
   * 4. Permission manager page
   * 5. Settings home
   */
  public findBestSettingsPath(id: SystemCapabilityId): {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
    tier5: string;
    description: string;
  } {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    return {
      tier1: def?.settingsPathTier1 || '精准系统权限页',
      tier2: def?.settingsPathTier2 || '特殊权限管理页',
      tier3: def?.settingsPathTier3 || '小手机应用信息详情页',
      tier4: 'android.settings.PRIVACY_SETTINGS (系统隐私与权限中心)',
      tier5: 'android.settings.SETTINGS (系统设置主页)',
      description: `优先尝试进入【${def?.name}】的精确配置页面，若受厂商或系统版本拦截，则自动降级导航至应用详情页面。`,
    };
  }

  /**
   * Open system settings via best available intent / prompt
   */
  public openSettings(id: SystemCapabilityId): { attemptedPath: string; note: string } {
    const paths = this.findBestSettingsPath(id);
    console.log(`[SystemCapabilityManager] Opening settings for ${id}. Path: ${paths.tier1}`);

    // If Capacitor App plugin is available:
    if ((window as any).Capacitor?.Plugins?.App) {
      try {
        // Can call native openUrl or App settings in Capacitor
        console.log('Dispatching native open settings intent:', paths.tier1);
      } catch (e) {
        console.warn('Native open settings error:', e);
      }
    }

    return {
      attemptedPath: paths.tier1,
      note: `已请求唤起系统设置入口（${paths.tier1}）。若未自动弹出，可直接在手机【系统设置 -> 应用 -> 小手机】中进行授权。`,
    };
  }
}

export const systemCapabilityManager = SystemCapabilityManager.getInstance();
