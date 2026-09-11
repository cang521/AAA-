import {
  CapabilityStatus,
  SystemCapabilityId,
  SystemCapabilityDef,
  CapabilityDiagnosticResult,
} from './types';
import { androidPermissionBridgeClient } from './AndroidPermissionBridgeClient';

export const SYSTEM_CAPABILITIES_LIST: SystemCapabilityDef[] = [
  {
    id: 'notification',
    name: '系统通知权限',
    category: 'core',
    androidApiName: 'POST_NOTIFICATIONS / NotificationManagerCompat',
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
    name: '通知使用权 / 监听读取服务',
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
    name: '使用情况访问权限 (前台 App 感知)',
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
    name: '悬浮窗 (显示在其他应用上层)',
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
    name: '无障碍服务 (界面辅助控制)',
    category: 'system_level',
    androidApiName: 'AccessibilityService',
    description: '通过 Android 无障碍机制读取界面节点并提供无障碍辅助控制。',
    whyNeeded: '辅助感知用户当前操作上下文，并支持智能交互引导。',
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
  private isAutoRecheckRegistered: boolean = false;

  private constructor() {
    this.initDefaultStatuses();
    this.setupAppLifecycleListeners();
  }

  public static getInstance(): SystemCapabilityManager {
    if (!SystemCapabilityManager.instance) {
      SystemCapabilityManager.instance = new SystemCapabilityManager();
    }
    return SystemCapabilityManager.instance;
  }

  private initDefaultStatuses() {
    SYSTEM_CAPABILITIES_LIST.forEach((cap) => {
      if (cap.requiresNativeService) {
        this.statusMap[cap.id] = 'NEED_APK';
      } else {
        this.statusMap[cap.id] = 'DENIED';
      }
    });
  }

  /**
   * Listen to app return from system settings.
   * When user returns to the app from Android Settings, instantly recheck real permissions!
   */
  private setupAppLifecycleListeners() {
    if (this.isAutoRecheckRegistered || typeof window === 'undefined') return;
    this.isAutoRecheckRegistered = true;

    // 1. Browser/WebView visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.recheckAll();
      }
    });

    // 2. Window focus
    window.addEventListener('focus', () => {
      this.recheckAll();
    });

    // 3. Capacitor App resume
    if ((window as any).Capacitor?.Plugins?.App) {
      try {
        (window as any).Capacitor.Plugins.App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive) {
            this.recheckAll();
          }
        });
      } catch (e) {
        console.warn('Failed to attach Capacitor App listener:', e);
      }
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
        console.warn('SystemCapabilityManager notify error:', e);
      }
    });
  }

  public isNativeAndroid(): boolean {
    return androidPermissionBridgeClient.isNativeAndroid();
  }

  public getStatus(id: SystemCapabilityId): CapabilityStatus {
    return this.statusMap[id] || (androidPermissionBridgeClient.isNativeAndroid() ? 'DENIED' : 'NEED_APK');
  }

  public getAllStatuses(): Record<SystemCapabilityId, CapabilityStatus> {
    return { ...this.statusMap };
  }

  public getLastCheckTimestamp(): number {
    return this.lastCheckTimestamp;
  }

  public getCapabilityCounts(): {
    total: number;
    available: number;
    granted: number;
    temporary: number;
    denied: number;
    failed: number;
    settingsRequired: number;
    needApk: number;
    unsupported: number;
  } {
    let granted = 0;
    let temporary = 0;
    let denied = 0;
    let failed = 0;
    let settingsRequired = 0;
    let needApk = 0;
    let unsupported = 0;

    SYSTEM_CAPABILITIES_LIST.forEach((cap) => {
      const s = this.statusMap[cap.id];
      if (s === 'GRANTED') granted++;
      else if (s === 'TEMPORARY') temporary++;
      else if (s === 'DENIED') denied++;
      else if (s === 'REQUEST_FAILED') failed++;
      else if (s === 'SETTINGS_REQUIRED') settingsRequired++;
      else if (s === 'NEED_APK') needApk++;
      else if (s === 'UNSUPPORTED') unsupported++;
      else denied++;
    });

    return {
      total: SYSTEM_CAPABILITIES_LIST.length,
      available: granted + temporary,
      granted,
      temporary,
      denied,
      failed,
      settingsRequired,
      needApk,
      unsupported,
    };
  }

  /**
   * Real-time check of all 14 capabilities.
   * Reads genuine Android OS permission states via AndroidPermissionBridge.
   * No fake data or simulated values.
   */
  public async recheckAll(): Promise<Record<SystemCapabilityId, CapabilityStatus>> {
    this.lastCheckTimestamp = Date.now();

    // 1. Try real Android native bridge first (APK environment)
    const nativeStatuses = await androidPermissionBridgeClient.checkAllPermissions();
    if (nativeStatuses) {
      // Running inside Android APK! Directly apply genuine system detected statuses
      for (const [key, val] of Object.entries(nativeStatuses)) {
        this.statusMap[key as SystemCapabilityId] = val as CapabilityStatus;
      }
      this.notify();
      return { ...this.statusMap };
    }

    // 2. Running in Web Preview environment:
    // Web supported permissions are genuinely checked; Android-only services are marked NEED_APK

    // A. Notification
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = Notification.permission;
      if (perm === 'granted') this.statusMap['notification'] = 'GRANTED';
      else if (perm === 'denied') this.statusMap['notification'] = 'DENIED';
      else this.statusMap['notification'] = 'DENIED';
    } else {
      this.statusMap['notification'] = 'UNSUPPORTED';
    }

    // B. Geolocation
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (res.state === 'granted') this.statusMap['geolocation'] = 'GRANTED';
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

    // C. Camera
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const cam = await navigator.permissions.query({ name: 'camera' as any });
          if (cam.state === 'granted') this.statusMap['camera'] = 'GRANTED';
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

    // D. Microphone
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const mic = await navigator.permissions.query({ name: 'microphone' as any });
          if (mic.state === 'granted') this.statusMap['microphone'] = 'GRANTED';
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

    // E. Bluetooth
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      this.statusMap['bluetooth'] = 'DENIED';
    } else {
      this.statusMap['bluetooth'] = 'UNSUPPORTED';
    }

    // F. Media Storage
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        const persisted = await navigator.storage.persisted();
        this.statusMap['media_storage'] = persisted ? 'GRANTED' : 'DENIED';
      } catch {
        this.statusMap['media_storage'] = 'DENIED';
      }
    } else {
      this.statusMap['media_storage'] = 'GRANTED';
    }

    // G. Screen capture
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
      this.statusMap['screen_capture'] = 'TEMPORARY';
    } else {
      this.statusMap['screen_capture'] = 'NEED_APK';
    }

    // H. Background Execution
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      this.statusMap['background_execution'] = 'TEMPORARY';
    } else {
      this.statusMap['background_execution'] = 'NEED_APK';
    }

    // I. Android Dedicated Services - In Web Preview, strictly show NEED_APK (No fake explanation!)
    this.statusMap['notification_listener'] = 'NEED_APK';
    this.statusMap['usage_stats'] = 'NEED_APK';
    this.statusMap['floating_window'] = 'NEED_APK';
    this.statusMap['accessibility'] = 'NEED_APK';
    this.statusMap['battery_optimization'] = 'NEED_APK';
    this.statusMap['vendor_autostart'] = 'NEED_APK';

    this.notify();
    return { ...this.statusMap };
  }

  /**
   * Request a capability directly.
   * If on Android APK, executes native runtime request or navigates to exact Settings page.
   * If on Web Preview, triggers browser prompt for Web permissions, or informs user that APK installation is required.
   */
  public async requestCapability(id: SystemCapabilityId): Promise<{ success: boolean; status: CapabilityStatus; error?: string }> {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    if (!def) {
      return { success: false, status: 'DENIED', error: '未知能力' };
    }

    // 1. If running on native Android APK:
    if (androidPermissionBridgeClient.isNativeAndroid()) {
      const res = await androidPermissionBridgeClient.requestPermission(id);
      await this.recheckAll();
      const newStatus = this.getStatus(id);
      return {
        success: newStatus === 'GRANTED' || newStatus === 'TEMPORARY',
        status: newStatus,
        error: res.success ? undefined : res.message,
      };
    }

    // 2. If running on Web Preview:
    try {
      if (id === 'notification') {
        if ('Notification' in window) {
          const res = await Notification.requestPermission();
          this.statusMap['notification'] = res === 'granted' ? 'GRANTED' : 'REQUEST_FAILED';
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
      } else if (id === 'media_storage') {
        if (navigator.storage && navigator.storage.persist) {
          const persisted = await navigator.storage.persist();
          this.statusMap['media_storage'] = persisted ? 'GRANTED' : 'TEMPORARY';
        } else {
          this.statusMap['media_storage'] = 'GRANTED';
        }
      } else if (id === 'screen_capture') {
        if (navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
          stream.getTracks().forEach((t: any) => t.stop());
          this.statusMap['screen_capture'] = 'TEMPORARY';
        } else {
          this.statusMap['screen_capture'] = 'NEED_APK';
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
          this.statusMap['background_execution'] = 'NEED_APK';
        }
      } else {
        // Native-only capability in Web Preview
        this.statusMap[id] = 'NEED_APK';
        this.notify();
        return {
          success: false,
          status: 'NEED_APK',
          error: `【${def.name}】属于 Android 系统底层特权服务，需要安装 Android APK 后在手机系统设置中授权。`,
        };
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
        error: err?.message || '授权请求未通过，可点击【重新获取权限】重试',
      };
    }
  }

  /**
   * Diagnostic inspector for a capability.
   */
  public runDiagnostics(id: SystemCapabilityId): CapabilityDiagnosticResult {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isNative = androidPermissionBridgeClient.isNativeAndroid();

    let vendor = isNative ? 'Android 真机设备' : 'Web Preview 沙箱环境';
    if (/vivo|v\d{4}|v\d{3}/i.test(ua)) vendor = 'vivo / iQOO';
    else if (/oppo|cph\d{4}|p[a-z]\d{4}/i.test(ua)) vendor = 'OPPO / OnePlus / realme';
    else if (/xiaomi|redmi|mi\s|mix\s/i.test(ua)) vendor = '小米 (Xiaomi / Redmi)';
    else if (/huawei|honor/i.test(ua)) vendor = '华为 (Huawei / 荣耀)';
    else if (/samsung|sm-[a-z]\d{3}/i.test(ua)) vendor = '三星 (Samsung)';

    let osVersion = 'Browser Web / Container';
    const match = ua.match(/Android\s([0-9.]+)/i);
    if (match) osVersion = `Android ${match[1]}`;

    const currentStatus = this.getStatus(id);
    const isNativeService = def?.requiresNativeService ?? false;

    let androidSupported = true;
    let nativeInterfaceExists = isNative;
    let exactSettingsAccessible = isNative;
    let fallbackSettingsAccessible = isNative;
    let recommendedAction = isNative
      ? '点击【获取权限】直接调起授权或跳转对应系统设置页面'
      : (isNativeService ? '需要安装 Android APK 后使用' : '点击【获取权限】调起浏览器授权');
    let bestSettingsTarget = isNative
      ? (def?.settingsPathTier1 || '系统设置')
      : (isNativeService ? '需要安装 Android APK 后使用' : '当前环境可直接授权');
    let notSupportedReason: string | undefined;

    if (!isNative && isNativeService) {
      notSupportedReason = '当前运行在 Web Preview 环境中，缺少 Android 宿主底层 AccessibilityService / UsageStatsManager 权限体系。需要导出并安装 Android APK 在真机上授权。';
    }

    return {
      vendor,
      model: isNative ? 'Android Device' : 'Web Preview',
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
   * Open system settings for a capability.
   */
  public async openSettings(id: SystemCapabilityId): Promise<{ attemptedPath: string; note: string }> {
    const def = SYSTEM_CAPABILITIES_LIST.find((c) => c.id === id);
    const targetPath = def?.settingsPathTier1 || '系统设置';

    if (androidPermissionBridgeClient.isNativeAndroid()) {
      const res = await androidPermissionBridgeClient.openSystemSettings(id);
      return {
        attemptedPath: targetPath,
        note: res.message || '已调起 Android 系统设置',
      };
    }

    return {
      attemptedPath: targetPath,
      note: '需要安装 Android APK 后使用，Web Preview 无法唤起系统底层设置。',
    };
  }
}

export const systemCapabilityManager = SystemCapabilityManager.getInstance();
