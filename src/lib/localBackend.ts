import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';
import { recordApiLog } from './apiLogger';

const LOCAL_BACKEND_PORT = 3000;
const LOCAL_BACKEND = `http://127.0.0.1:${LOCAL_BACKEND_PORT}`;
const STARTUP_TIMEOUT_MS = 45000;
const HEALTH_POLL_INTERVAL_MS = 350;
const READY_POLL_INTERVAL_MS = 250;

export type BackendStatus = 'stopped' | 'starting' | 'ready' | 'failed';

export type BackendDiagnosticStage =
  | 'IDLE'
  | 'OK'
  | 'NODE_BRIDGE_UNAVAILABLE'
  | 'NODE_START_FAILED'
  | 'NODE_RUNTIME_READY_HTTP_FAILED'
  | 'NODE_RUNTIME_EXITED'
  | 'HEALTH_CHECK_TIMEOUT';

const DIAGNOSTIC_STAGE_CODES: BackendDiagnosticStage[] = [
  'NODE_BRIDGE_UNAVAILABLE',
  'NODE_START_FAILED',
  'NODE_RUNTIME_READY_HTTP_FAILED',
  'NODE_RUNTIME_EXITED',
  'HEALTH_CHECK_TIMEOUT',
];

export const RUNTIME_EXITED_USER_MESSAGE = '内置后端已异常退出，请重新打开 App 后重试';

export function formatBackendDiagnosticError(
  stage: BackendDiagnosticStage,
  detail: string
): string {
  const cleanDetail = (detail || '').trim();
  const prefix = `[${stage}]`;
  if (!cleanDetail) return prefix;
  if (cleanDetail.startsWith(prefix)) return cleanDetail;
  return `${prefix} ${cleanDetail}`;
}

export class BackendStartupError extends Error {
  public readonly isBackendUnavailable = true;
  public readonly stage: BackendDiagnosticStage;
  public readonly detail: string;
  public readonly requiresAppRestart: boolean;

  constructor(
    stage: BackendDiagnosticStage,
    detail: string,
    requiresAppRestart = stage === 'NODE_RUNTIME_EXITED'
  ) {
    super(formatBackendDiagnosticError(stage, detail));
    this.name = 'BackendStartupError';
    this.stage = stage;
    this.detail = detail;
    this.requiresAppRestart = requiresAppRestart;
  }
}

export function isBackendUnavailableError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && (err as any).isBackendUnavailable === true) {
    return true;
  }
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String((err as any)?.message || (err as any)?.error || '');
  if (!msg) return false;
  return (
    DIAGNOSTIC_STAGE_CODES.some((code) => msg.includes(`[${code}]`)) ||
    msg.includes(RUNTIME_EXITED_USER_MESSAGE)
  );
}

export interface BackendDiagnosticLog {
  timestamp: number;
  event: string;
  status: BackendStatus;
  stage: BackendDiagnosticStage;
  bridgeExists: boolean;
  hasInvokedNodeStart: boolean;
  nodeRuntimeExited: boolean;
  startCommandResult: string;
  port: number;
  healthCheckResult: boolean | null;
  failureReason: string;
  pendingTaskCount: number;
}

export interface BackendDiagnosticsSnapshot {
  status: BackendStatus;
  failureStage: BackendDiagnosticStage;
  bridgeExists: boolean;
  hasInvokedNodeStart: boolean;
  nodeRuntimeExited: boolean;
  startCommandResult: string;
  port: number;
  lastHealthCheckOk: boolean | null;
  lastHealthCheckAt: number | null;
  failureReason: string;
  lastNodeErrorDetail: string;
  pendingTaskCount: number;
  logs: BackendDiagnosticLog[];
}

type BackendListener = (snapshot: BackendDiagnosticsSnapshot) => void;
type ResumeCallback = () => void | Promise<void>;

let backendStatus: BackendStatus = Capacitor.isNativePlatform() ? 'stopped' : 'ready';
let failureStage: BackendDiagnosticStage = Capacitor.isNativePlatform() ? 'IDLE' : 'OK';
let failureReason = '';
let startCommandResult = Capacitor.isNativePlatform() ? 'not_started' : 'web_preview_direct';
let lastHealthCheckOk: boolean | null = Capacitor.isNativePlatform() ? null : true;
let lastHealthCheckAt: number | null = null;

// Process-lifetime guards: @capawesome/capacitor-nodejs only allows Nodejs.start() ONCE per App process.
let hasInvokedNodeStart = false;
let nodeRuntimeExited = false;
let nodeBridgeReadySeen = false;
let lastNodeErrorDetail = '';

// Single-flight startup lock (no concurrent Nodejs.start() calls).
let startPromise: Promise<void> | null = null;
let inFlightQueueWaiters = 0;

const diagnosticLogs: BackendDiagnosticLog[] = [];
const statusListeners = new Set<BackendListener>();
const pendingCountProviders = new Set<() => number>();
const resumeCallbacks = new Set<ResumeCallback>();
let lifecycleListenersInitialized = false;
let nodeBridgeListenersRegistered = false;

function hasNativeNodejsBridge(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    typeof Nodejs !== 'undefined' &&
    typeof Nodejs?.isReady === 'function' &&
    typeof Nodejs?.start === 'function'
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
    stage: failureStage,
    bridgeExists: hasNativeNodejsBridge(),
    hasInvokedNodeStart,
    nodeRuntimeExited,
    startCommandResult,
    port: LOCAL_BACKEND_PORT,
    healthCheckResult,
    failureReason,
    pendingTaskCount: computePendingTaskCount(),
  };
  diagnosticLogs.push(entry);
  if (diagnosticLogs.length > 60) {
    diagnosticLogs.splice(0, diagnosticLogs.length - 60);
  }
  console.log(
    `[小手机内置后端] ${event} | status=${entry.status} stage=${entry.stage} bridge=${entry.bridgeExists} startedOnce=${entry.hasInvokedNodeStart} exited=${entry.nodeRuntimeExited} start=${entry.startCommandResult} port=${entry.port} health=${entry.healthCheckResult} pending=${entry.pendingTaskCount}${
      entry.failureReason ? ` err=${entry.failureReason}` : ''
    }`
  );
}

export function getBackendDiagnostics(): BackendDiagnosticsSnapshot {
  return {
    status: backendStatus,
    failureStage,
    bridgeExists: hasNativeNodejsBridge(),
    hasInvokedNodeStart,
    nodeRuntimeExited,
    startCommandResult,
    port: LOCAL_BACKEND_PORT,
    lastHealthCheckOk,
    lastHealthCheckAt,
    failureReason,
    lastNodeErrorDetail,
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

function summarizeNodeBridgePayload(rawArg: unknown): {
  stage: string;
  fatal: boolean;
  summary: string;
} {
  if (!rawArg || typeof rawArg !== 'object') {
    const text = rawArg == null ? '' : String(rawArg);
    return { stage: 'NODE_MESSAGE', fatal: false, summary: text };
  }
  const obj = rawArg as Record<string, any>;
  const stage = String(obj.stage || 'NODE_ERROR');
  const fatal =
    obj.fatal === true ||
    stage === 'REQUIRE_SERVER_FAILED' ||
    stage === 'UNCAUGHT_EXCEPTION' ||
    stage === 'HTTP_LISTEN_ERROR' ||
    stage === 'START_SERVER_EXCEPTION' ||
    stage === 'START_SERVER_REJECTED' ||
    stage === 'NODE_PROCESS_EXIT';

  const parts: string[] = [];
  if (stage) parts.push(stage);
  if (obj.code) parts.push(`code=${obj.code}`);
  if (obj.name && obj.name !== 'Error') parts.push(String(obj.name));
  if (obj.message) parts.push(String(obj.message));
  const summary = parts.join(': ') || JSON.stringify(obj);
  return { stage, fatal, summary };
}

function registerNativeNodeBridgeListeners(): void {
  if (nodeBridgeListenersRegistered || !hasNativeNodejsBridge()) return;
  nodeBridgeListenersRegistered = true;

  if (typeof Nodejs.addListener === 'function') {
    Nodejs.addListener('ready', () => {
      nodeBridgeReadySeen = true;
      appendDiagnosticLog('nodejs_event_ready', lastHealthCheckOk);
      notifyBackendDiagnosticsChanged();
    }).catch((err: any) => {
      appendDiagnosticLog(`nodejs_ready_listener_error:${err?.message || err}`, lastHealthCheckOk);
    });

    Nodejs.addListener('message', (event: { eventName?: string; args?: unknown[] }) => {
      const eventName = event?.eventName || 'unknown';
      const firstArg = Array.isArray(event?.args) ? event.args[0] : undefined;

      if (eventName === 'backend_ready') {
        const info = summarizeNodeBridgePayload(firstArg);
        appendDiagnosticLog(`node_bridge_ready:${info.summary}`, lastHealthCheckOk);
        notifyBackendDiagnosticsChanged();
        return;
      }

      if (eventName === 'backend_exit') {
        const info = summarizeNodeBridgePayload(firstArg);
        nodeRuntimeExited = true;
        lastNodeErrorDetail = info.summary || 'Node process exited';
        backendStatus = 'failed';
        failureStage = 'NODE_RUNTIME_EXITED';
        failureReason = formatBackendDiagnosticError(
          'NODE_RUNTIME_EXITED',
          `${RUNTIME_EXITED_USER_MESSAGE}（${lastNodeErrorDetail}）`
        );
        appendDiagnosticLog('node_bridge_exit', false);
        notifyBackendDiagnosticsChanged();
        return;
      }

      if (eventName === 'backend_error') {
        const info = summarizeNodeBridgePayload(firstArg);
        lastNodeErrorDetail = info.summary;
        if (info.fatal) {
          nodeRuntimeExited = true;
          backendStatus = 'failed';
          failureStage = 'NODE_RUNTIME_EXITED';
          failureReason = formatBackendDiagnosticError(
            'NODE_RUNTIME_EXITED',
            `${RUNTIME_EXITED_USER_MESSAGE}（${info.summary}）`
          );
        }
        appendDiagnosticLog(`node_bridge_error:${info.stage}`, false);
        notifyBackendDiagnosticsChanged();
      }
    }).catch((err: any) => {
      appendDiagnosticLog(`nodejs_message_listener_error:${err?.message || err}`, lastHealthCheckOk);
    });
  }
}

export function initBackendLifecycleListeners(): void {
  if (lifecycleListenersInitialized || typeof window === 'undefined') return;
  lifecycleListenersInitialized = true;

  // Attach bridge diagnostic listeners ONLY. Never eagerly call Nodejs.start() at App launch!
  registerNativeNodeBridgeListeners();

  const handleResume = (source: string) => {
    const pending = computePendingTaskCount();
    appendDiagnosticLog(`lifecycle_resume:${source}`);
    notifyBackendDiagnosticsChanged();

    // Strictly on-demand: only wake/check on foreground resume when there are active queued tasks.
    if (pending > 0 && !nodeRuntimeExited) {
      void (async () => {
        try {
          await ensureBackendReady(`resume:${source}`);
        } catch {
          // Individual task managers retain tasks as waiting_backend and expose Retry
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

async function queryNodeBridgeReady(): Promise<{ ready: boolean; error?: string }> {
  try {
    const res = await Nodejs.isReady();
    const ready = Boolean(res?.ready);
    if (ready) {
      nodeBridgeReadySeen = true;
    }
    return { ready };
  } catch (err: any) {
    return { ready: false, error: err?.message || String(err) };
  }
}

function buildRuntimeExitedError(): BackendStartupError {
  const detail = lastNodeErrorDetail
    ? `${RUNTIME_EXITED_USER_MESSAGE}（${lastNodeErrorDetail}）`
    : RUNTIME_EXITED_USER_MESSAGE;
  return new BackendStartupError('NODE_RUNTIME_EXITED', detail, true);
}

/**
 * Strict on-demand Android embedded Node.js backend state machine:
 * 1. Only one startPromise globally (zero concurrent Nodejs.start() calls).
 * 2. Check http://127.0.0.1:3000/api/health first -> reuse directly if healthy.
 * 3. If unhealthy and Nodejs.start() has NOT been called yet in this App process:
 *    invoke Nodejs.start({ script: 'index.cjs' }) ONCE (requires startMode: 'manual').
 * 4. Wait for Nodejs.isReady() -> then poll http://127.0.0.1:3000/api/health up to 45s.
 * 5. Never call Nodejs.start() a second time in the same App process; retries only
 *    re-check Nodejs.isReady() and /api/health, or explicitly report NODE_RUNTIME_EXITED.
 */
export async function ensureBackendReady(reason = 'unspecified'): Promise<void> {
  initBackendLifecycleListeners();

  if (!Capacitor.isNativePlatform()) {
    backendStatus = 'ready';
    failureStage = 'OK';
    failureReason = '';
    startCommandResult = 'web_preview_direct';
    lastHealthCheckOk = true;
    return;
  }

  // Single-flight lock: all concurrent callers await the exact same Promise.
  if (startPromise) {
    appendDiagnosticLog(`join_existing_startup(${reason})`);
    notifyBackendDiagnosticsChanged();
    return startPromise;
  }

  const startedPreviouslyInProcess = hasInvokedNodeStart;

  startPromise = (async () => {
    try {
      // Step 1: Always check /api/health first and reuse immediately if already listening.
      if (await pingBackendHealth(1500)) {
        backendStatus = 'ready';
        failureStage = 'OK';
        failureReason = '';
        if (startCommandResult === 'not_started') {
          startCommandResult = 'already_listening';
        }
        appendDiagnosticLog(`health_ok_reuse(${reason})`, true);
        notifyBackendDiagnosticsChanged();
        return;
      }

      // Step 2: If Node runtime has already exited/crashed in this process, fail fast honestly.
      if (nodeRuntimeExited) {
        throw buildRuntimeExitedError();
      }

      // Step 3: Verify Capacitor Nodejs bridge exists.
      if (!hasNativeNodejsBridge()) {
        startCommandResult = 'bridge_missing';
        throw new BackendStartupError(
          'NODE_BRIDGE_UNAVAILABLE',
          'Android 原生 Nodejs 插件桥接不可用，请确认 APK 包含 @capawesome/capacitor-nodejs',
          true
        );
      }

      backendStatus = 'starting';
      failureReason = '';
      appendDiagnosticLog(`startup_check_begin(${reason})`, false);
      notifyBackendDiagnosticsChanged();

      const deadline = Date.now() + STARTUP_TIMEOUT_MS;

      // Step 4: Call Nodejs.start({ script: 'index.cjs' }) AT MOST ONCE per App process.
      const initialReadyCheck = await queryNodeBridgeReady();
      if (!initialReadyCheck.ready && !hasInvokedNodeStart) {
        hasInvokedNodeStart = true;
        startCommandResult = 'starting_manual_index_cjs';
        appendDiagnosticLog('nodejs_start_invoking', null);
        notifyBackendDiagnosticsChanged();

        try {
          await Nodejs.start({ script: 'index.cjs' });
          startCommandResult = 'start_invoked_ok';
          appendDiagnosticLog('nodejs_start_resolved', null);
        } catch (err: any) {
          const code = String(err?.code || '');
          const msg = String(err?.message || err || 'unknown error');
          const combined = code && !msg.includes(code) ? `${code}: ${msg}` : msg;

          if (combined.includes('NODE_ALREADY_RUNNING')) {
            startCommandResult = 'already_running';
            appendDiagnosticLog('nodejs_start_already_running', null);
          } else {
            startCommandResult = `start_failed:${combined}`;
            throw new BackendStartupError(
              'NODE_START_FAILED',
              `调用 Nodejs.start({ script: 'index.cjs' }) 失败: ${combined}`,
              true
            );
          }
        }
      } else if (startedPreviouslyInProcess) {
        // Strict rule: never call Nodejs.start() again in the same App process.
        startCommandResult = initialReadyCheck.ready
          ? 'recheck_ready_polling_http'
          : 'recheck_only_no_restart';
        appendDiagnosticLog('nodejs_recheck_without_restart', false);
      } else {
        startCommandResult = 'bridge_already_ready';
        appendDiagnosticLog('nodejs_bridge_already_ready', null);
      }

      // Step 5: Wait for Nodejs.isReady() (never polling HTTP blindly before runtime loads bridge,
      // while still succeeding early if /api/health already responds).
      let runtimeReady = initialReadyCheck.ready || nodeBridgeReadySeen;
      let lastIsReadyError = initialReadyCheck.error || '';

      while (!runtimeReady && Date.now() < deadline) {
        if (nodeRuntimeExited) {
          throw buildRuntimeExitedError();
        }
        if (await pingBackendHealth(1000)) {
          backendStatus = 'ready';
          failureStage = 'OK';
          failureReason = '';
          appendDiagnosticLog('health_ok_during_ready_wait', true);
          notifyBackendDiagnosticsChanged();
          return;
        }
        const check = await queryNodeBridgeReady();
        if (check.ready || nodeBridgeReadySeen) {
          runtimeReady = true;
          break;
        }
        if (check.error) {
          lastIsReadyError = check.error;
        }
        // If this is a retry check (Nodejs.start was already invoked earlier) and Node is still not ready
        // after 4 seconds, it will not recover in this process without restarting the App.
        if (startedPreviouslyInProcess && Date.now() > deadline - (STARTUP_TIMEOUT_MS - 4000)) {
          nodeRuntimeExited = true;
          throw buildRuntimeExitedError();
        }
        await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
      }

      if (nodeRuntimeExited) {
        throw buildRuntimeExitedError();
      }

      if (!runtimeReady) {
        const extra = [
          lastIsReadyError ? `isReady 错误: ${lastIsReadyError}` : '',
          lastNodeErrorDetail ? `Node 日志: ${lastNodeErrorDetail}` : '',
        ]
          .filter(Boolean)
          .join('；');
        throw new BackendStartupError(
          'HEALTH_CHECK_TIMEOUT',
          `等待 Node.js 运行时就绪超时（${Math.round(STARTUP_TIMEOUT_MS / 1000)} 秒）${extra ? `；${extra}` : ''}`,
          false
        );
      }

      appendDiagnosticLog('nodejs_isReady_confirmed_polling_http', null);
      notifyBackendDiagnosticsChanged();

      // Step 6: Poll http://127.0.0.1:3000/api/health until the 45s startup budget expires.
      while (Date.now() < deadline) {
        if (nodeRuntimeExited) {
          throw buildRuntimeExitedError();
        }
        if (await pingBackendHealth(1500)) {
          backendStatus = 'ready';
          failureStage = 'OK';
          failureReason = '';
          appendDiagnosticLog('health_check_passed', true);
          notifyBackendDiagnosticsChanged();
          return;
        }
        await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
      }

      // Timed out after Nodejs.isReady() was true -> check if runtime exited or HTTP failed to bind.
      if (nodeRuntimeExited) {
        throw buildRuntimeExitedError();
      }
      const finalReadyCheck = await queryNodeBridgeReady();
      if (!finalReadyCheck.ready) {
        nodeRuntimeExited = true;
        throw buildRuntimeExitedError();
      }

      throw new BackendStartupError(
        'NODE_RUNTIME_READY_HTTP_FAILED',
        `Node 运行时已就绪，但 127.0.0.1:${LOCAL_BACKEND_PORT}/api/health 在 ${Math.round(
          STARTUP_TIMEOUT_MS / 1000
        )} 秒内未响应${lastNodeErrorDetail ? `；后端报错: ${lastNodeErrorDetail}` : ''}`,
        false
      );
    } catch (err: any) {
      backendStatus = 'failed';
      if (err instanceof BackendStartupError) {
        failureStage = err.stage;
        failureReason = err.message;
        appendDiagnosticLog(`startup_failed:${err.stage}`, false);
        notifyBackendDiagnosticsChanged();
        throw err;
      }
      const fallbackStage: BackendDiagnosticStage = nodeRuntimeExited
        ? 'NODE_RUNTIME_EXITED'
        : 'HEALTH_CHECK_TIMEOUT';
      const wrapped = new BackendStartupError(
        fallbackStage,
        err?.message || 'Android 内置后端启动失败'
      );
      failureStage = wrapped.stage;
      failureReason = wrapped.message;
      appendDiagnosticLog(`startup_failed:${wrapped.stage}`, false);
      notifyBackendDiagnosticsChanged();
      throw wrapped;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
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

export function createBackendUnavailableResponse(
  detailMessage?: string,
  stage?: BackendDiagnosticStage
): Response {
  const resolvedStage: BackendDiagnosticStage =
    stage ||
    (failureStage !== 'OK' && failureStage !== 'IDLE'
      ? failureStage
      : nodeRuntimeExited
        ? 'NODE_RUNTIME_EXITED'
        : 'HEALTH_CHECK_TIMEOUT');

  const rawDetail =
    detailMessage ||
    failureReason ||
    (nodeRuntimeExited
      ? RUNTIME_EXITED_USER_MESSAGE
      : 'Android 内置后端未就绪，请查看诊断信息后重试');

  const fullDiagnosticError = formatBackendDiagnosticError(resolvedStage, rawDetail);

  const body = JSON.stringify({
    success: false,
    ok: false,
    statusCode: 503,
    backendUnavailable: true,
    stage: resolvedStage,
    requiresAppRestart: resolvedStage === 'NODE_RUNTIME_EXITED',
    error: fullDiagnosticError,
    message: fullDiagnosticError,
  });

  return new Response(body, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'application/json',
      'X-Android-Backend-Status': backendStatus,
      'X-Android-Backend-Stage': resolvedStage,
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
 * - Capacitor Android: starts embedded Node.js on demand (at most once per process),
 *   verifies /api/health, and forwards to http://127.0.0.1:3000/api/...
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
      const stage: BackendDiagnosticStage | undefined =
        wakeErr instanceof BackendStartupError ? wakeErr.stage : undefined;
      const detail =
        wakeErr instanceof BackendStartupError
          ? wakeErr.detail
          : wakeErr?.message || failureReason;
      const errResp = createBackendUnavailableResponse(detail, stage);
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
        if (
          text.trim().startsWith('<!DOCTYPE') ||
          text.trim().startsWith('<html') ||
          text.trim().startsWith('<!doctype')
        ) {
          backendStatus = 'failed';
          failureStage = 'NODE_RUNTIME_READY_HTTP_FAILED';
          failureReason = formatBackendDiagnosticError(
            'NODE_RUNTIME_READY_HTTP_FAILED',
            '收到前端静态 HTML 页面而非 API JSON 响应（内置后端未正确提供 API 路由）'
          );
          appendDiagnosticLog('received_html_instead_of_api', false);
          notifyBackendDiagnosticsChanged();
          const errResp = createBackendUnavailableResponse(
            failureReason,
            'NODE_RUNTIME_READY_HTTP_FAILED'
          );
          logModelApiResponse(apiPath, init, errResp, startTime);
          return errResp;
        }
      }

      logModelApiResponse(apiPath, init, resp, startTime);
      return resp;
    } catch (netErr: any) {
      const stage: BackendDiagnosticStage = nodeRuntimeExited
        ? 'NODE_RUNTIME_EXITED'
        : 'NODE_RUNTIME_READY_HTTP_FAILED';
      const detail = nodeRuntimeExited
        ? `${RUNTIME_EXITED_USER_MESSAGE}（${netErr?.message || '连接中断'}）`
        : `127.0.0.1:${LOCAL_BACKEND_PORT} 请求失败: ${netErr?.message || '网络连接拒绝'}`;

      backendStatus = 'failed';
      failureStage = stage;
      failureReason = formatBackendDiagnosticError(stage, detail);
      appendDiagnosticLog('apiFetch_connection_failed', false);
      notifyBackendDiagnosticsChanged();

      const errResp = createBackendUnavailableResponse(detail, stage);
      logModelApiResponse(apiPath, init, errResp, startTime);
      return errResp;
    }
  } finally {
    inFlightQueueWaiters = Math.max(0, inFlightQueueWaiters - 1);
    notifyBackendDiagnosticsChanged();
  }
}

/**
 * Legacy setup helper - initializes lifecycle & diagnostic listeners ONLY (no eager Nodejs.start()).
 */
export function setupLocalBackend() {
  initBackendLifecycleListeners();
}
