import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';
import { recordApiLog } from './apiLogger';

const LOCAL_BACKEND_PORT = 3000;
const LOCAL_BACKEND = `http://127.0.0.1:${LOCAL_BACKEND_PORT}`;
const STARTUP_TIMEOUT_MS = 15000;
const HEALTH_POLL_INTERVAL_MS = 350;

export type BackendStatus = 'stopped' | 'starting' | 'ready' | 'failed';

export interface BackendDiagnosticLog {
  timestamp: number;
  event: string;
  status: BackendStatus;
  bridgeExists: boolean;
  startCommandResult: string;
  port: number;
  healthCheckResult: boolean | null;
  failureReason: string;
  pendingTaskCount: number;
}

export interface BackendDiagnosticsSnapshot {
  status: BackendStatus;
  bridgeExists: boolean;
  startCommandResult: string;
  port: number;
  lastHealthCheckOk: boolean | null;
  lastHealthCheckAt: number | null;
  failureReason: string;
  pendingTaskCount: number;
  logs: BackendDiagnosticLog[];
}

type BackendListener = (snapshot: BackendDiagnosticsSnapshot) => void;
type ResumeCallback = () => void | Promise<void>;

let backendStatus: BackendStatus = Capacitor.isNativePlatform() ? 'stopped' : 'ready';
let failureReason = '';
let startCommandResult = Capacitor.isNativePlatform() ? 'not_started' : 'web_preview_direct';
let lastHealthCheckOk: boolean | null = Capacitor.isNativePlatform() ? null : true;
let lastHealthCheckAt: number | null = null;
let startingPromise: Promise<void> | null = null;
let inFlightQueueWaiters = 0;

const diagnosticLogs: BackendDiagnosticLog[] = [];
const statusListeners = new Set<BackendListener>();
const pendingCountProviders = new Set<() => number>();
const resumeCallbacks = new Set<ResumeCallback>();
let lifecycleListenersInitialized = false;

function hasNativeNodejsBridge(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    typeof Nodejs !== 'undefined' &&
    typeof Nodejs?.isReady === 'function'
  );
}

function computePendingTaskCount(): number {
  let externalPending = 0;
  pendingCountProviders.forEach((fn) => {
    try {
      externalPending += Math.max(0, fn());
    } catch {
      // ignore
    }
  });
  return inFlightQueueWaiters + externalPending;
}

function appendDiagnosticLog(
  event: string,
  healthCheckResult: boolean | null = lastHealthCheckOk
): void {
  const entry: BackendDiagnosticLog = {
    timestamp: Date.now(),
    event,
    status: backendStatus,
    bridgeExists: hasNativeNodejsBridge(),
    startCommandResult,
    port: LOCAL_BACKEND_PORT,
    healthCheckResult,
    failureReason,
    pendingTaskCount: computePendingTaskCount(),
  };
  diagnosticLogs.push(entry);
  if (diagnosticLogs.length > 50) {
    diagnosticLogs.splice(0, diagnosticLogs.length - 50);
  }
  console.log(
    `[小手机内置后端] ${event} | status=${entry.status} bridge=${entry.bridgeExists} start=${entry.startCommandResult} port=${entry.port} health=${entry.healthCheckResult} pending=${entry.pendingTaskCount}${
      entry.failureReason ? ` err=${entry.failureReason}` : ''
    }`
  );
}

export function getBackendDiagnostics(): BackendDiagnosticsSnapshot {
  return {
    status: backendStatus,
    bridgeExists: hasNativeNodejsBridge(),
    startCommandResult,
    port: LOCAL_BACKEND_PORT,
    lastHealthCheckOk,
    lastHealthCheckAt,
    failureReason,
    pendingTaskCount: computePendingTaskCount(),
    logs: [...diagnosticLogs],
  };
}

export function subscribeBackendStatus(listener: BackendListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function notifyBackendDiagnosticsChanged(): void {
  const snap = getBackendDiagnostics();
  statusListeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      // ignore listener errors
    }
  });
}

export function registerPendingTaskCountProvider(provider: () => number): () => void {
  pendingCountProviders.add(provider);
  return () => {
    pendingCountProviders.delete(provider);
  };
}

export function registerBackendResumeHandler(handler: ResumeCallback): () => void {
  resumeCallbacks.add(handler);
  initBackendLifecycleListeners();
  return () => {
    resumeCallbacks.delete(handler);
  };
}

export function initBackendLifecycleListeners(): void {
  if (lifecycleListenersInitialized || typeof window === 'undefined') return;
  lifecycleListenersInitialized = true;

  const handleResume = (source: string) => {
    const pending = computePendingTaskCount();
    appendDiagnosticLog(`lifecycle_resume:${source}`);
    notifyBackendDiagnosticsChanged();

    if (pending > 0 || backendStatus === 'failed' || backendStatus === 'stopped') {
      void (async () => {
        if (pending > 0) {
          try {
            await ensureBackendReady(`resume:${source}`);
          } catch {
            // Individual task managers still expose retry if startup fails
          }
        }
        resumeCallbacks.forEach((cb) => {
          try {
            void cb();
          } catch {
            // ignore
          }
        });
      })();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleResume('visibilitychange');
      }
    });
  }

  if (Capacitor.isPluginAvailable('App')) {
    CapacitorApp.addListener('appStateChange', (state: { isActive: boolean }) => {
      if (state.isActive) {
        handleResume('capacitor_appStateChange');
      }
    }).catch(() => {});
  }
}

export async function pingBackendHealth(timeoutMs = 1500): Promise<boolean> {
  try {
    const healthUrl = Capacitor.isNativePlatform() ? `${LOCAL_BACKEND}/api/health` : '/api/health';
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'ok' || data.ok === true)) {
        lastHealthCheckOk = true;
        lastHealthCheckAt = Date.now();
        return true;
      }
    }
  } catch {
    // Port not yet accepting connections
  }
  lastHealthCheckOk = false;
  lastHealthCheckAt = Date.now();
  return false;
}

/**
 * Global unified Android embedded Node.js backend lifecycle manager.
 * - Never permanently caches failure: calling again or retrying restarts cleanly.
 * - Shares one single in-flight startup Promise across concurrent callers.
 * - Re-verifies `/api/health` before assuming a previously-ready runtime is still alive.
 */
export async function ensureBackendReady(reason = 'unspecified'): Promise<void> {
  initBackendLifecycleListeners();

  if (!Capacitor.isNativePlatform()) {
    backendStatus = 'ready';
    startCommandResult = 'web_preview_direct';
    lastHealthCheckOk = true;
    return;
  }

  // If startup is already underway, all callers await the exact same Promise
  if (startingPromise) {
    appendDiagnosticLog(`join_existing_startup(${reason})`);
    notifyBackendDiagnosticsChanged();
    return startingPromise;
  }

  // If previously ready, perform a quick live health ping to ensure Node wasn't stopped by OS
  if (backendStatus === 'ready') {
    const stillAlive = await pingBackendHealth(1200);
    if (stillAlive) {
      return;
    }
    backendStatus = 'stopped';
    failureReason = '';
    appendDiagnosticLog(`ready_lost_restarting(${reason})`, false);
    notifyBackendDiagnosticsChanged();
  }

  // Status is 'stopped' or 'failed' -> start (or re-start) fresh
  backendStatus = 'starting';
  failureReason = '';
  startCommandResult = 'initializing';
  appendDiagnosticLog(`start_requested(${reason})`, null);
  notifyBackendDiagnosticsChanged();

  startingPromise = (async () => {
    try {
      // 1. Immediate health check in case auto-start already finished listening
      if (await pingBackendHealth(1200)) {
        backendStatus = 'ready';
        startCommandResult = 'already_listening';
        failureReason = '';
        appendDiagnosticLog('health_ok_immediate', true);
        notifyBackendDiagnosticsChanged();
        return;
      }

      // 2. Check native Node.js Capacitor bridge & start if not ready
      const bridgeAvailable = hasNativeNodejsBridge();
      if (!bridgeAvailable) {
        startCommandResult = 'bridge_missing';
        throw new Error('Android 原生 Nodejs 插件桥接不可用，请确认 APK 包含 @capawesome/capacitor-nodejs');
      }

      let isBridgeReady = false;
      try {
        const res = await Nodejs.isReady();
        isBridgeReady = Boolean(res?.ready);
      } catch (e: any) {
        startCommandResult = `isReady_error:${e?.message || e}`;
        appendDiagnosticLog('nodejs_isReady_exception', false);
      }

      if (!isBridgeReady) {
        try {
          await Nodejs.start();
          startCommandResult = 'start_invoked_ok';
        } catch (e: any) {
          const code = String(e?.code || e?.message || '');
          if (code.includes('NODE_ALREADY_RUNNING') || code.includes('START_MODE_NOT_MANUAL')) {
            // Normal when startMode === 'auto' or runtime is already booting
            startCommandResult = `start_skipped:${code}`;
          } else {
            startCommandResult = `start_error:${code || 'unknown'}`;
          }
        }
        appendDiagnosticLog('nodejs_start_dispatched', null);
      } else {
        startCommandResult = 'bridge_ready_polling_http';
        appendDiagnosticLog('nodejs_bridge_ready', null);
      }

      // 3. Poll real HTTP health endpoint up to 15s (never assume start command = HTTP ready)
      const startTime = Date.now();
      while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
        if (await pingBackendHealth(1500)) {
          backendStatus = 'ready';
          failureReason = '';
          appendDiagnosticLog('health_check_passed', true);
          notifyBackendDiagnosticsChanged();
          return;
        }
        await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
      }

      throw new Error(
        `Android 内置后端启动超时（端口 ${LOCAL_BACKEND_PORT} 在 ${Math.round(
          STARTUP_TIMEOUT_MS / 1000
        )} 秒内未通过健康检查）`
      );
    } catch (err: any) {
      backendStatus = 'failed';
      failureReason = err?.message || 'Android 内置后端未启动';
      appendDiagnosticLog('startup_failed', false);
      notifyBackendDiagnosticsChanged();
      throw new Error(failureReason);
    } finally {
      startingPromise = null;
    }
  })();

  return startingPromise;
}

/**
 * Boolean wrapper kept for existing callers; returns true when backend is healthy, false on failure.
 */
export async function waitForNodeBackend(reason = 'waitForNodeBackend'): Promise<boolean> {
  try {
    await ensureBackendReady(reason);
    return true;
  } catch {
    return false;
  }
}

// Sequential queue gate so bursts of queued calls wait cleanly for backend readiness
let backendExecutionChain: Promise<void> = Promise.resolve();

export async function runWithBackendReady<T>(
  taskName: string,
  fn: () => Promise<T>
): Promise<T> {
  inFlightQueueWaiters += 1;
  notifyBackendDiagnosticsChanged();

  const waitTurn = backendExecutionChain.catch(() => {});
  let releaseTurn!: () => void;
  backendExecutionChain = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });

  try {
    await waitTurn;
    await ensureBackendReady(taskName);
  } finally {
    releaseTurn();
  }

  try {
    return await fn();
  } finally {
    inFlightQueueWaiters = Math.max(0, inFlightQueueWaiters - 1);
    notifyBackendDiagnosticsChanged();
  }
}

export function extractApiPath(input: RequestInfo | URL): string | null {
  const urlStr =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : String(input);

  // Health check should bypass the /api interceptor to prevent any re-entry
  if (urlStr === '/api/health' || urlStr.endsWith('/api/health') || urlStr.includes('/api/health?')) {
    return null;
  }

  if (urlStr.startsWith(`http://127.0.0.1:${LOCAL_BACKEND_PORT}/api/`)) {
    return urlStr.substring(`http://127.0.0.1:${LOCAL_BACKEND_PORT}`.length);
  }

  if (urlStr.startsWith('/api/')) {
    return urlStr;
  }

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(urlStr, origin);
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    if (
      parsed.origin === origin ||
      parsed.hostname === host ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.protocol === 'capacitor:'
    ) {
      if (parsed.pathname.startsWith('/api/')) {
        return parsed.pathname + parsed.search;
      }
    }
  } catch {
    // ignore URL parse errors
  }

  return null;
}

export function createBackendUnavailableResponse(detailMessage?: string): Response {
  const body = JSON.stringify({
    success: false,
    ok: false,
    statusCode: 503,
    error: 'Android 内置后端未启动',
    message: detailMessage || failureReason || 'Android 内置后端未启动，请点击重试或检查运行时状态。',
  });
  return new Response(body, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'application/json',
      'X-Android-Backend-Status': backendStatus,
    },
  });
}

function deriveAppName(path: string): string {
  if (path.includes('group-chat')) return '微信群聊-AI';
  if (path.includes('chat')) return '微信-AI聊天';
  if (path.includes('weather') || path.includes('proactive')) return '主动关怀提醒';
  if (path.includes('moments')) return '朋友圈AI互动';
  if (path.includes('analyze-image')) return '图像识别与多模态分析';
  if (path.includes('generate-image')) return 'AI生图绘制';
  if (path.includes('generate-speech')) return 'AI语音TTS生成';
  if (path.includes('fix-css')) return '美化-CSS优化';
  if (path.includes('url-parse')) return '外端接入-链接解析';
  if (path.includes('adapter-json')) return '设置-JSON格式适配';
  if (path.includes('worldbook')) return '世界书-AI架构';
  if (path.includes('gomoku') || path.includes('tictactoe') || path.includes('rps') || path.includes('telepathy')) return '游戏中心-AI互动';
  if (path.includes('test-connection') || path.includes('test-model')) return 'API设置-连接测试';
  return '系统-模型API';
}

function deriveInterfaceType(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'ModelCall';
}

function deriveCategory(path: string): 'text' | 'image' | 'voice' {
  if (path.includes('image')) return 'image';
  if (path.includes('speech') || path.includes('audio') || path.includes('voice')) return 'voice';
  return 'text';
}

function derivePurpose(path: string, init?: RequestInit): string {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body);
      if (parsed.group?.name) return `群聊 [${parsed.group.name}] AI 互动`;
      if (parsed.character?.name) return `与 ${parsed.character.name} 对话交互`;
      if (parsed.prompt) return `执行 AI 指令: ${String(parsed.prompt).slice(0, 30)}`;
      if (parsed.text) return `处理 AI 文本: ${String(parsed.text).slice(0, 30)}`;
    } catch {}
  }
  return '系统模型接口交互';
}

async function logModelApiResponse(
  apiPath: string,
  init: RequestInit | undefined,
  resp: Response,
  startTime: number
) {
  try {
    const durationMs = Date.now() - startTime;
    const isModelEndpoint = apiPath.startsWith('/api/gemini/') || apiPath.startsWith('/api/provider/');
    if (!isModelEndpoint) return;

    if (resp.ok) {
      const clone = resp.clone();
      const data = await clone.json().catch(() => null);
      if (data) {
        if (data.apiLog) {
          recordApiLog(data.apiLog);
        } else if (data.log) {
          recordApiLog(data.log);
        } else if (data.success === false) {
          recordApiLog({
            appName: deriveAppName(apiPath),
            interfaceType: deriveInterfaceType(apiPath),
            category: deriveCategory(apiPath),
            status: 'failed',
            durationMs,
            errorMessage: data.error || data.message || '模型响应失败',
            purpose: derivePurpose(apiPath, init),
          });
        } else {
          recordApiLog({
            appName: deriveAppName(apiPath),
            interfaceType: deriveInterfaceType(apiPath),
            category: deriveCategory(apiPath),
            status: 'success',
            durationMs,
            purpose: derivePurpose(apiPath, init),
          });
        }
      }
    } else {
      const clone = resp.clone();
      const text = await clone.text().catch(() => '');
      let errorMsg = `HTTP ${resp.status} ${resp.statusText}`;
      try {
        const j = JSON.parse(text);
        errorMsg = j.error || j.message || errorMsg;
      } catch {}

      recordApiLog({
        appName: deriveAppName(apiPath),
        interfaceType: deriveInterfaceType(apiPath),
        category: deriveCategory(apiPath),
        status: 'failed',
        durationMs,
        errorType: `HTTP ${resp.status}`,
        errorMessage: errorMsg,
        purpose: `${derivePurpose(apiPath, init)} (请求异常 ${resp.status})`,
      });
    }
  } catch {
    // Interceptor catch: Never disrupt primary app flow
  }
}

/**
 * Unified internal API request wrapper.
 * - Web / Preview: requests /api/... directly.
 * - Capacitor Android: calls ensureBackendReady() (waking/polling 127.0.0.1:3000),
 *   auto-recovers if backend stopped, and forwards to http://127.0.0.1:3000/api/...
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const apiPath = extractApiPath(input);
  const startTime = Date.now();

  if (!Capacitor.isNativePlatform() || !apiPath) {
    let resp: Response;
    try {
      resp = await fetch(input, init);
      if (apiPath) {
        logModelApiResponse(apiPath, init, resp, startTime);
      }
      return resp;
    } catch (netErr: any) {
      if (apiPath) {
        recordApiLog({
          appName: deriveAppName(apiPath),
          interfaceType: deriveInterfaceType(apiPath),
          category: deriveCategory(apiPath),
          status: 'failed',
          durationMs: Date.now() - startTime,
          errorType: 'NetworkError',
          errorMessage: netErr?.message || '网络连接拒绝或未响应',
          purpose: `${derivePurpose(apiPath, init)} (网络失败)`,
        });
      }
      throw netErr;
    }
  }

  inFlightQueueWaiters += 1;
  notifyBackendDiagnosticsChanged();

  try {
    try {
      await ensureBackendReady(`apiFetch:${apiPath}`);
    } catch (wakeErr: any) {
      const errResp = createBackendUnavailableResponse(wakeErr?.message || failureReason || 'Android 内置后端未启动');
      logModelApiResponse(apiPath, init, errResp, startTime);
      return errResp;
    }

    const targetUrl = `${LOCAL_BACKEND}${apiPath}`;
    console.log('[小手机内置后端] apiFetch 转发:', apiPath, '->', targetUrl);

    try {
      let resp: Response;
      if (input instanceof Request) {
        resp = await fetch(new Request(targetUrl, input), init);
      } else {
        resp = await fetch(targetUrl, init);
      }

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const cloned = resp.clone();
        const text = await cloned.text().catch(() => '');
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().startsWith('<!doctype')) {
          backendStatus = 'stopped';
          appendDiagnosticLog('received_html_instead_of_api', false);
          notifyBackendDiagnosticsChanged();
          const errResp = createBackendUnavailableResponse('Android 内置后端未启动（收到前端静态页面响应，非 API 数据）');
          logModelApiResponse(apiPath, init, errResp, startTime);
          return errResp;
        }
      }

      logModelApiResponse(apiPath, init, resp, startTime);
      return resp;
    } catch (netErr: any) {
      // Connection failed -> invalidate ready state so next call or retry can restart backend cleanly
      backendStatus = 'stopped';
      failureReason = `127.0.0.1:${LOCAL_BACKEND_PORT} 连接失败: ${netErr?.message || '网络连接拒绝'}`;
      appendDiagnosticLog('apiFetch_connection_failed', false);
      notifyBackendDiagnosticsChanged();

      const errResp = createBackendUnavailableResponse(`Android 内置后端未启动 (${failureReason})`);
      logModelApiResponse(apiPath, init, errResp, startTime);
      return errResp;
    }
  } finally {
    inFlightQueueWaiters = Math.max(0, inFlightQueueWaiters - 1);
    notifyBackendDiagnosticsChanged();
  }
}

/**
 * Legacy setup helper - initializes lifecycle listeners on startup.
 */
export function setupLocalBackend() {
  initBackendLifecycleListeners();
}
