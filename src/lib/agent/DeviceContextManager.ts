/**
 * DeviceContextManager - Phone State & Environment Context Provider
 *
 * Collects and provides read-only device context to the agent architecture:
 * - Current foreground App (in simulator or via Android UsageStatsManager)
 * - Usage duration (in minutes / seconds)
 * - Battery & charging state
 * - Network status
 * - Current scene
 */

import { SceneId } from './types';
import { systemNativeService } from '../systemNativeService';
import { permissionManager } from './PermissionManager';
import { androidPermissionBridgeClient } from './AndroidPermissionBridgeClient';

export interface DeviceContextState {
  currentApp: string;
  appCategory: string;
  foregroundDurationMinutes: number; // 连续使用时间
  totalScreenTimeMinutes?: number;    // 累计屏幕使用时间 (今日总亮屏)
  appUsageTimeMinutes?: number;      // 应用自身使用时间
  currentScene: SceneId;
  batteryLevel: number;
  isCharging: boolean;
  networkType: string;
  isScreenOn: boolean;
  timestamp: number;
  usageStatsPermissionGranted?: boolean;
}

class DeviceContextManager {
  private static instance: DeviceContextManager;
  private simulatedForegroundApp: string = '小手机桌面';
  private foregroundStartTime: number = Date.now();
  private nativeUsageMinutesCache: number = 0;
  private nativeTotalScreenTimeCache: number = 0;
  private nativeAppUsageTimeCache: number = 0;
  private lastUsageQueryAt: number = 0;

  private constructor() {}

  public static getInstance(): DeviceContextManager {
    if (!DeviceContextManager.instance) {
      DeviceContextManager.instance = new DeviceContextManager();
    }
    return DeviceContextManager.instance;
  }

  public setForegroundApp(appName: string) {
    this.simulatedForegroundApp = appName;
    this.foregroundStartTime = Date.now();
  }

  /**
   * Check Android UsageStatsManager permission status and prompt if needed
   */
  public async checkAndRequestUsageStatsPermission(): Promise<boolean> {
    if (!androidPermissionBridgeClient.isNativeAndroid()) {
      return false; // Web preview mode
    }
    try {
      const perms = await androidPermissionBridgeClient.checkAllPermissions();
      if (perms && perms['usage_stats'] === 'GRANTED') {
        return true;
      }
      // Request permission via Android permission bridge
      const res = await androidPermissionBridgeClient.requestPermission('usage_stats');
      return res.success;
    } catch (e) {
      console.warn('[DeviceContextManager] UsageStats permission check error:', e);
      return false;
    }
  }

  public async getContext(): Promise<DeviceContextState> {
    const battery = await systemNativeService.getBattery();
    const network = systemNativeService.getNetworkState();
    const currentScene = permissionManager.getCurrentScene();

    let continuousMinutes = Math.max(0, Math.floor((Date.now() - this.foregroundStartTime) / (1000 * 60)));
    let permissionGranted = false;

    // If running on native Android, attempt to fetch real UsageStatsManager duration if permitted
    if (androidPermissionBridgeClient.isNativeAndroid()) {
      try {
        const now = Date.now();
        if (now - this.lastUsageQueryAt > 30000) { // Throttle native queries to every 30s
          const perms = await androidPermissionBridgeClient.checkAllPermissions();
          permissionGranted = perms?.['usage_stats'] === 'GRANTED';
          if (permissionGranted) {
            // Query native usage stats bridge
            const res = await androidPermissionBridgeClient.getScreenUsageMinutes();
            if (res && res.hasPermission) {
              this.nativeTotalScreenTimeCache = res.totalScreenTimeMinutes || 0;
              this.nativeAppUsageTimeCache = res.appUsageTimeMinutes || 0;
              if (typeof res.continuousUsageMinutes === 'number' && res.continuousUsageMinutes > 0) {
                this.nativeUsageMinutesCache = res.continuousUsageMinutes;
              }
            }
          }
          this.lastUsageQueryAt = now;
        }
        if (permissionGranted && this.nativeUsageMinutesCache > 0) {
          continuousMinutes = Math.max(continuousMinutes, this.nativeUsageMinutesCache);
        }
      } catch (e) {
        console.warn('[DeviceContextManager] Failed to query Android UsageStatsManager:', e);
      }
    }

    return {
      currentApp: this.simulatedForegroundApp,
      appCategory: currentScene,
      foregroundDurationMinutes: continuousMinutes,
      totalScreenTimeMinutes: this.nativeTotalScreenTimeCache,
      appUsageTimeMinutes: this.nativeAppUsageTimeCache,
      currentScene,
      batteryLevel: battery.level,
      isCharging: battery.isCharging,
      networkType: network.type,
      isScreenOn: true,
      timestamp: Date.now(),
      usageStatsPermissionGranted: permissionGranted,
    };
  }
}

export const deviceContextManager = DeviceContextManager.getInstance();
