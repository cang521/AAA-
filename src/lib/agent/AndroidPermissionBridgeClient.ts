/**
 * AndroidPermissionBridgeClient
 *
 * Typesafe TypeScript client communicating with the native Android Capacitor plugin:
 * com.aistudio.aiphone.plugins.AndroidPermissionBridge
 *
 * Provides real-time detection, runtime permission requests, and deep-link
 * navigation into exact Android system setting pages.
 */

import { registerPlugin, Capacitor, WebPlugin } from '@capacitor/core';
import { CapabilityStatus, SystemCapabilityId } from './types';
import { AppUsageListResult } from '../../types';

export interface AndroidNativeInfo {
  isNativeAndroid: boolean;
  sdkVersion: number;
  model: string;
  manufacturer: string;
  packageName: string;
}

export interface ScreenUsageStatsResult {
  hasPermission: boolean;
  totalScreenTimeMinutes: number;
  appUsageTimeMinutes: number;
  continuousUsageMinutes: number;
  minutes: number;
}

export interface ShowAiMessageNotificationOptions {
  aiId: string;
  title: string;
  body: string;
  avatar?: string;
  notificationId: number;
  timestamp?: number;
  groupKey?: string;
}

export interface NativeNotificationResult {
  success: boolean;
  code: string;
  message?: string;
  notificationId?: number;
}

export interface NotificationDiagnostics {
  isNativeAndroid: boolean;
  sdkVersion: number;
  postNotificationsGranted: boolean;
  notificationsEnabled: boolean;
  channelId: string;
  channelExists: boolean;
  channelImportance: number;
}

export interface PendingNotificationAction {
  hasPendingAction: boolean;
  aiId: string;
}

export type LauncherPresetId = 'default' | 'xiaoshouji' | 'cloud_milk' | 'starlight' | 'minimal';

export interface LauncherAppearanceStatus {
  isNativeAndroid: boolean;
  activePresetId: LauncherPresetId | string;
  supportsPinShortcut: boolean;
  availablePresets: string[];
}

export interface SetLauncherPresetResult {
  success: boolean;
  message?: string;
  activePresetId?: string;
}

export interface CreateCustomShortcutResult {
  success: boolean;
  supported?: boolean;
  message?: string;
  shortcutId?: string;
}

export interface AndroidPermissionBridgePlugin {
  getEnvironmentInfo(): Promise<AndroidNativeInfo>;
  checkAllPermissions(): Promise<Record<string, CapabilityStatus>>;
  requestPermission(options: { id: string }): Promise<{ success: boolean; message?: string }>;
  openSystemSettings(options: { target: string }): Promise<{ success: boolean; message?: string }>;
  getScreenUsageMinutes(): Promise<ScreenUsageStatsResult>;
  getAppUsageList(): Promise<AppUsageListResult>;
  showAiMessageNotification(options: ShowAiMessageNotificationOptions): Promise<NativeNotificationResult>;
  consumePendingNotificationAction(): Promise<PendingNotificationAction>;
  getNotificationDiagnostics(): Promise<NotificationDiagnostics>;
  getLauncherAppearanceStatus(): Promise<LauncherAppearanceStatus>;
  setLauncherPreset(options: { presetId: LauncherPresetId | string }): Promise<SetLauncherPresetResult>;
  resetLauncherDefault(): Promise<SetLauncherPresetResult>;
  createCustomShortcut(options: {
    label: string;
    iconDataUrl?: string;
    shortcutId?: string;
  }): Promise<CreateCustomShortcutResult>;
}

export class AndroidPermissionBridgeWeb extends WebPlugin implements AndroidPermissionBridgePlugin {
  async getEnvironmentInfo(): Promise<AndroidNativeInfo> {
    return {
      isNativeAndroid: false,
      sdkVersion: 0,
      model: 'Web Preview',
      manufacturer: 'Browser Environment',
      packageName: 'com.aistudio.aiphone',
    };
  }

  async checkAllPermissions(): Promise<Record<string, CapabilityStatus>> {
    return {};
  }

  async requestPermission(_options: { id: string }): Promise<{ success: boolean; message?: string }> {
    return {
      success: false,
      message: '当前运行于 Web Preview 浏览器环境，此能力需要安装 Android APK 后在手机系统设置中授权。',
    };
  }

  async openSystemSettings(_options: { target: string }): Promise<{ success: boolean; message?: string }> {
    return {
      success: false,
      message: '当前运行于 Web Preview 浏览器环境，无法直接唤起宿主设备系统设置。',
    };
  }

  async getScreenUsageMinutes(): Promise<ScreenUsageStatsResult> {
    return {
      hasPermission: false,
      totalScreenTimeMinutes: 0,
      appUsageTimeMinutes: 0,
      continuousUsageMinutes: 0,
      minutes: 0,
    };
  }

  async getAppUsageList(): Promise<AppUsageListResult> {
    return {
      hasPermission: false,
      apps: [],
      isSimulation: false,
    };
  }

  async showAiMessageNotification(
    options: ShowAiMessageNotificationOptions
  ): Promise<NativeNotificationResult> {
    return {
      success: false,
      code: 'NOT_NATIVE_ANDROID',
      message: '当前运行于 Web 预览环境，无法调用 Android 原生状态栏通知。',
      notificationId: options.notificationId,
    };
  }

  async consumePendingNotificationAction(): Promise<PendingNotificationAction> {
    return {
      hasPendingAction: false,
      aiId: '',
    };
  }

  async getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
    const webPermGranted =
      typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    return {
      isNativeAndroid: false,
      sdkVersion: 0,
      postNotificationsGranted: webPermGranted,
      notificationsEnabled: webPermGranted,
      channelId: 'ai_messages_v1',
      channelExists: false,
      channelImportance: 0,
    };
  }

  async getLauncherAppearanceStatus(): Promise<LauncherAppearanceStatus> {
    return {
      isNativeAndroid: false,
      activePresetId: 'default',
      supportsPinShortcut: false,
      availablePresets: ['default', 'xiaoshouji', 'cloud_milk', 'starlight', 'minimal'],
    };
  }

  async setLauncherPreset(_options: { presetId: LauncherPresetId | string }): Promise<SetLauncherPresetResult> {
    return {
      success: false,
      activePresetId: 'default',
      message: '真实桌面图标与名称切换仅能在 Android APK 中验证。',
    };
  }

  async resetLauncherDefault(): Promise<SetLauncherPresetResult> {
    return {
      success: false,
      activePresetId: 'default',
      message: '真实桌面图标与名称切换仅能在 Android APK 中验证。',
    };
  }

  async createCustomShortcut(_options: {
    label: string;
    iconDataUrl?: string;
    shortcutId?: string;
  }): Promise<CreateCustomShortcutResult> {
    return {
      success: false,
      supported: false,
      message: '创建系统桌面快捷方式仅能在 Android APK 中验证。',
    };
  }
}

export const AndroidPermissionBridge = registerPlugin<AndroidPermissionBridgePlugin>('AndroidPermissionBridge', {
  web: () => new AndroidPermissionBridgeWeb(),
});

export class AndroidPermissionBridgeClient {
  private static instance: AndroidPermissionBridgeClient;
  private isNativeCache: boolean | null = null;
  private nativeInfo: AndroidNativeInfo | null = null;

  public static getInstance(): AndroidPermissionBridgeClient {
    if (!AndroidPermissionBridgeClient.instance) {
      AndroidPermissionBridgeClient.instance = new AndroidPermissionBridgeClient();
    }
    return AndroidPermissionBridgeClient.instance;
  }

  public isNativeAndroid(): boolean {
    if (this.isNativeCache !== null) {
      return this.isNativeCache;
    }
    if (typeof window === 'undefined') {
      return false;
    }

    // Must be running inside Capacitor's native container on an Android device
    const isCapacitorNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    // Check if the native bridge is truly available and callable
    const hasNativeBridge = isCapacitorNative && Capacitor.isPluginAvailable('AndroidPermissionBridge');

    this.isNativeCache = Boolean(hasNativeBridge);
    return this.isNativeCache;
  }

  public async getEnvironmentInfo(): Promise<AndroidNativeInfo | null> {
    if (!this.isNativeAndroid()) return null;
    try {
      this.nativeInfo = await AndroidPermissionBridge.getEnvironmentInfo();
      return this.nativeInfo;
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] getEnvironmentInfo error:', e);
      return null;
    }
  }

  /**
   * Check real Android permissions directly through native OS APIs.
   * Returns null if running in standard Web browser.
   */
  public async checkAllPermissions(): Promise<Record<SystemCapabilityId, CapabilityStatus> | null> {
    if (!this.isNativeAndroid()) {
      return null;
    }

    try {
      const rawStatuses = await AndroidPermissionBridge.checkAllPermissions();
      const mapped: Partial<Record<SystemCapabilityId, CapabilityStatus>> = {};

      for (const [key, val] of Object.entries(rawStatuses)) {
        mapped[key as SystemCapabilityId] = val as CapabilityStatus;
      }

      return mapped as Record<SystemCapabilityId, CapabilityStatus>;
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] checkAllPermissions error:', e);
      return null;
    }
  }

  /**
   * Request a permission or jump directly into the exact Android system settings page.
   */
  public async requestPermission(id: SystemCapabilityId): Promise<{ success: boolean; message?: string }> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        message: '当前运行于 Web Preview 环境，此能力需要安装 Android APK 后在真机系统设置中授权。',
      };
    }

    try {
      return await AndroidPermissionBridge.requestPermission({ id });
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] requestPermission error:', e);
      return {
        success: false,
        message: e?.message || '调起 Android 系统设置或授权失败',
      };
    }
  }

  /**
   * Directly open target system settings page
   */
  public async openSystemSettings(target: SystemCapabilityId | string): Promise<{ success: boolean; message?: string }> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        message: '当前运行于 Web Preview 环境，无法直接唤起宿主设备系统设置。',
      };
    }

    try {
      return await AndroidPermissionBridge.openSystemSettings({ target });
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] openSystemSettings error:', e);
      return {
        success: false,
        message: e?.message || '打开系统设置失败',
      };
    }
  }

  /**
   * Show real Android system notification via AndroidPermissionBridge
   */
  public async showAiMessageNotification(
    options: ShowAiMessageNotificationOptions
  ): Promise<NativeNotificationResult> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        code: 'NOT_NATIVE_ANDROID',
        message: '当前处于 Web 预览环境，未调用 Android 原生状态栏通知',
        notificationId: options.notificationId,
      };
    }

    try {
      return await AndroidPermissionBridge.showAiMessageNotification(options);
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] showAiMessageNotification error:', e);
      return {
        success: false,
        code: 'NOTIFICATION_BRIDGE_ERROR',
        message: e?.message || '调用 Android 原生通知桥失败',
        notificationId: options.notificationId,
      };
    }
  }

  /**
   * Consume any pending AI chat ID saved when user tapped a notification
   */
  public async consumePendingNotificationAction(): Promise<PendingNotificationAction> {
    if (!this.isNativeAndroid()) {
      return { hasPendingAction: false, aiId: '' };
    }

    try {
      return await AndroidPermissionBridge.consumePendingNotificationAction();
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] consumePendingNotificationAction error:', e);
      return { hasPendingAction: false, aiId: '' };
    }
  }

  /**
   * Read genuine Android notification channel and permission diagnostics
   */
  public async getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
    if (!this.isNativeAndroid()) {
      const webPermGranted =
        typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
      return {
        isNativeAndroid: false,
        sdkVersion: 0,
        postNotificationsGranted: webPermGranted,
        notificationsEnabled: webPermGranted,
        channelId: 'ai_messages_v1',
        channelExists: false,
        channelImportance: 0,
      };
    }

    try {
      return await AndroidPermissionBridge.getNotificationDiagnostics();
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] getNotificationDiagnostics error:', e);
      return {
        isNativeAndroid: true,
        sdkVersion: 0,
        postNotificationsGranted: false,
        notificationsEnabled: false,
        channelId: 'ai_messages_v1',
        channelExists: false,
        channelImportance: 0,
      };
    }
  }

  /**
   * Query screen usage statistics from Android OS UsageStatsManager
   */
  public async getScreenUsageMinutes(): Promise<ScreenUsageStatsResult> {
    if (!this.isNativeAndroid()) {
      return {
        hasPermission: false,
        totalScreenTimeMinutes: 0,
        appUsageTimeMinutes: 0,
        continuousUsageMinutes: 0,
        minutes: 0,
      };
    }

    try {
      return await AndroidPermissionBridge.getScreenUsageMinutes();
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] getScreenUsageMinutes error:', e);
      return {
        hasPermission: false,
        totalScreenTimeMinutes: 0,
        appUsageTimeMinutes: 0,
        continuousUsageMinutes: 0,
        minutes: 0,
      };
    }
  }

  public async getAppUsageList(): Promise<AppUsageListResult> {
    if (!this.isNativeAndroid()) {
      return {
        hasPermission: false,
        apps: [],
        isSimulation: false,
      };
    }

    try {
      return await AndroidPermissionBridge.getAppUsageList();
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] getAppUsageList error:', e);
      return {
        hasPermission: false,
        apps: [],
        isSimulation: false,
      };
    }
  }

  public async getLauncherAppearanceStatus(): Promise<LauncherAppearanceStatus> {
    if (!this.isNativeAndroid()) {
      return {
        isNativeAndroid: false,
        activePresetId: 'default',
        supportsPinShortcut: false,
        availablePresets: ['default', 'xiaoshouji', 'cloud_milk', 'starlight', 'minimal'],
      };
    }

    try {
      return await AndroidPermissionBridge.getLauncherAppearanceStatus();
    } catch (e) {
      console.warn('[AndroidPermissionBridgeClient] getLauncherAppearanceStatus error:', e);
      return {
        isNativeAndroid: true,
        activePresetId: 'default',
        supportsPinShortcut: false,
        availablePresets: ['default', 'xiaoshouji', 'cloud_milk', 'starlight', 'minimal'],
      };
    }
  }

  public async setLauncherPreset(presetId: LauncherPresetId | string): Promise<SetLauncherPresetResult> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        activePresetId: 'default',
        message: '真实桌面图标与名称切换仅能在 Android APK 中验证。',
      };
    }

    try {
      return await AndroidPermissionBridge.setLauncherPreset({ presetId });
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] setLauncherPreset error:', e);
      return {
        success: false,
        message: e?.message || '切换桌面图标预设失败',
      };
    }
  }

  public async resetLauncherDefault(): Promise<SetLauncherPresetResult> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        activePresetId: 'default',
        message: '真实桌面图标与名称切换仅能在 Android APK 中验证。',
      };
    }

    try {
      return await AndroidPermissionBridge.resetLauncherDefault();
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] resetLauncherDefault error:', e);
      return {
        success: false,
        message: e?.message || '恢复默认桌面图标失败',
      };
    }
  }

  public async createCustomShortcut(options: {
    label: string;
    iconDataUrl?: string;
    shortcutId?: string;
  }): Promise<CreateCustomShortcutResult> {
    if (!this.isNativeAndroid()) {
      return {
        success: false,
        supported: false,
        message: '创建系统桌面快捷方式仅能在 Android APK 中验证。',
      };
    }

    try {
      return await AndroidPermissionBridge.createCustomShortcut(options);
    } catch (e: any) {
      console.warn('[AndroidPermissionBridgeClient] createCustomShortcut error:', e);
      return {
        success: false,
        supported: false,
        message: e?.message || '创建系统桌面快捷方式失败',
      };
    }
  }

  public get AndroidPermissionBridge() {
    return AndroidPermissionBridge;
  }
}

export const androidPermissionBridgeClient = AndroidPermissionBridgeClient.getInstance();

