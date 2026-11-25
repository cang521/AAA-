import { Capacitor, registerPlugin } from '@capacitor/core';
import { androidPermissionBridgeClient } from '../agent/AndroidPermissionBridgeClient';
import { getBackendDiagnostics, ensureBackendReady } from '../localBackend';
import { getNativeWorkerStatus, syncProactiveStateToNative } from '../proactive/proactiveNativeBridge';
import { nativeNotificationService } from '../NativeNotificationService';
import { loadApiLogs } from '../storage';
import { recordApiLog } from '../apiLogger';

export interface NativeDiagnosticStatus {
  isNativeAndroid: boolean;
  sdkVersion?: number;
  manufacturer?: string;
  model?: string;
  workerRegistered: boolean;
  workerState: string;
  diagnosticState: string;
  notificationsEnabled: boolean;
  batteryUnrestricted: boolean;
  snapshotReady: boolean;
  lastInspectionAt: number;
  lastInspectionSummary: string;
  pausedUntil?: number;
  pauseReason?: string;
  error?: string;
}

interface DiagnosticsPlugin {
  getStatus(): Promise<NativeDiagnosticStatus>;
  runProactiveDiagnostic(): Promise<{ enqueued: boolean; workId?: string }>;
}

const Diagnostics = registerPlugin<DiagnosticsPlugin>('Diagnostics');

export async function collectTestingSnapshot() {
  const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [permissions, worker] = await Promise.all([
    androidPermissionBridgeClient.checkAllPermissions().catch(() => null),
    getNativeWorkerStatus().catch(() => null),
  ]);
  let native: NativeDiagnosticStatus | null = null;
  if (isNative && Capacitor.isPluginAvailable('Diagnostics')) {
    native = await Diagnostics.getStatus().catch(() => null);
  }
  return {
    capturedAt: Date.now(),
    isNative,
    permissions,
    worker,
    native,
    backend: getBackendDiagnostics(),
    apiLogCount: loadApiLogs().length,
  };
}

export async function runBackendHealthTest(): Promise<string> {
  try {
    await ensureBackendReady('testing_app_manual_health');
    return '内置后端已启动，健康检查通过';
  } catch (error: any) {
    return error?.message || '内置后端健康检查失败';
  }
}

export async function runNativeProactiveTest(): Promise<string> {
  if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) {
    return '当前是网页预览环境，真实后台任务只能在APK中测试';
  }
  const synced = await syncProactiveStateToNative();
  if (!synced) return '主动消息状态同步失败，未提交后台测试';
  const result = await Diagnostics.runProactiveDiagnostic();
  return result?.enqueued
    ? '后台测试任务已真实提交，请稍后刷新状态查看结果'
    : '后台测试任务提交失败';
}

export async function runNativeNotificationTest(): Promise<string> {
  const result = await nativeNotificationService.notifyAiMessage(
    { id: 'testing_app', name: '小手机测试' },
    '这是一条真实的安卓系统通知测试。',
    {
      messageId: `testing_notification_${Date.now()}`,
      forceForTest: true,
      triggerSource: 'testing_app',
    }
  );
  return `${result.success ? '成功' : '失败'}：${result.message || result.code}`;
}

export async function runVibrationTest(): Promise<string> {
  const result = await androidPermissionBridgeClient.vibrateDevice(180);
  return `${result.success ? '成功' : '失败'}：${result.message || '设备未返回说明'}`;
}

/** Zero-cost integrity check: verifies three concurrent log writes survive. */
export async function runApiLogConcurrencyTest(): Promise<string> {
  const batchId = `monitor_test_${Date.now()}`;
  await Promise.all([0, 1, 2].map(async (index) => {
    recordApiLog({
      appName: '测试APP-监控自检',
      provider: 'local_test',
      modelName: 'no-api-cost',
      interfaceType: 'MonitorIntegrityTest',
      category: 'text_generation',
      status: 'success',
      requestId: `${batchId}_${index}`,
      durationMs: index + 1,
      purpose: `并发日志完整性测试 ${index + 1}/3（未调用模型）`,
      costDisplay: '0（未调用API）',
    });
  }));
  const matched = loadApiLogs().filter((log) => log.requestId?.startsWith(batchId)).length;
  return matched === 3
    ? '通过：连续3条记录全部保存，没有互相覆盖'
    : `失败：预期3条，实际保存${matched}条`;
}
