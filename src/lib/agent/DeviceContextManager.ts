/**
 * DeviceContextManager - Phone State & Environment Context Provider (Phase 1)
 *
 * Collects and provides read-only device context to the agent architecture:
 * - Current foreground App (in simulator or via UsageStats)
 * - Usage duration (in minutes / seconds)
 * - Battery & charging state
 * - Network status
 * - Current scene
 */

import { SceneId } from './types';
import { systemNativeService } from '../systemNativeService';
import { permissionManager } from './PermissionManager';

export interface DeviceContextState {
  currentApp: string;
  appCategory: string;
  foregroundDurationMinutes: number;
  currentScene: SceneId;
  batteryLevel: number;
  isCharging: boolean;
  networkType: string;
  isScreenOn: boolean;
  timestamp: number;
}

class DeviceContextManager {
  private static instance: DeviceContextManager;
  private simulatedForegroundApp: string = '小手机桌面';
  private foregroundStartTime: number = Date.now();

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

  public async getContext(): Promise<DeviceContextState> {
    const battery = await systemNativeService.getBattery();
    const network = systemNativeService.getNetworkState();
    const currentScene = permissionManager.getCurrentScene();
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - this.foregroundStartTime) / (1000 * 60)));

    return {
      currentApp: this.simulatedForegroundApp,
      appCategory: currentScene,
      foregroundDurationMinutes: elapsedMinutes,
      currentScene,
      batteryLevel: battery.level,
      isCharging: battery.isCharging,
      networkType: network.type,
      isScreenOn: true,
      timestamp: Date.now(),
    };
  }
}

export const deviceContextManager = DeviceContextManager.getInstance();
