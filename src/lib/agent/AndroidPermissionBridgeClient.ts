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

export interface AndroidNativeInfo {
  isNativeAndroid: boolean;
  sdkVersion: number;
  model: string;
  manufacturer: string;
  packageName: string;
}

export interface AndroidPermissionBridgePlugin {
  getEnvironmentInfo(): Promise<AndroidNativeInfo>;
  checkAllPermissions(): Promise<Record<string, CapabilityStatus>>;
  requestPermission(options: { id: string }): Promise<{ success: boolean; message?: string }>;
  openSystemSettings(options: { target: string }): Promise<{ success: boolean; message?: string }>;
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
}

export const androidPermissionBridgeClient = AndroidPermissionBridgeClient.getInstance();
