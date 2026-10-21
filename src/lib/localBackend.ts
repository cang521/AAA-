import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';

const LOCAL_BACKEND = 'http://127.0.0.1:3000';
let backendStatus: 'unknown' | 'ready' | 'failed' = 'unknown';
let failureReason = '';
let readyPromise: Promise<boolean> | null = null;

export async function pingBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_BACKEND}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'ok' || data.ok === true)) {
        return true;
      }
    }
  } catch {
    // Port not yet accepting connections
  }
  return false;
}

export async function waitForNodeBackend(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  if (backendStatus === 'ready') return true;
  if (backendStatus === 'failed') return false;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    // 1. First quick health check (in case backend is already up)
    if (await pingBackendHealth()) {
      backendStatus = 'ready';
      return true;
    }

    // 2. Try starting or checking Nodejs plugin status
    try {
      const { ready } = await Nodejs.isReady();
      if (!ready) {
        // If not auto-started, trigger start
        await Nodejs.start().catch(() => {});
      }
    } catch (e: any) {
      console.warn('[小手机本地后端] Nodejs.isReady 检查异常:', e);
    }

    // 3. Poll health check for up to 15 seconds (retrying every 300ms)
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      if (await pingBackendHealth()) {
        backendStatus = 'ready';
        console.log('[小手机本地后端] 127.0.0.1:3000 健康检查通过，后端已准备就绪');
        return true;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    backendStatus = 'failed';
    failureReason = 'Android 内置 Node.js 后端启动超时或 127.0.0.1:3000 端口未响应';
    console.error('[小手机本地后端]', failureReason);
    return false;
  })();

  return readyPromise;
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

  if (urlStr.startsWith('http://127.0.0.1:3000/api/')) {
    return urlStr.substring('http://127.0.0.1:3000'.length);
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
    message: detailMessage || 'Android 内置后端未启动，请检查运行时状态或重启应用。',
  });
  return new Response(body, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'application/json',
      'X-Android-Backend-Status': 'offline',
    },
  });
}

import { recordApiLog } from './apiLogger';

function deriveAppName(path: string): string {
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
          // Automatic success log fallback if backend didn't attach apiLog object
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
 * - In standard Web / AI Studio preview environment: requests /api/... directly.
 * - In Capacitor Android native environment: checks 127.0.0.1:3000 health, then rewrites to http://127.0.0.1:3000/api/...
 * - Non-/api requests (e.g. user custom Base URLs) pass through unmodified.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const apiPath = extractApiPath(input);
  const startTime = Date.now();

  // Non-internal /api/ request (e.g. user custom external Base URL) or not Native Android
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

  const isReady = await waitForNodeBackend();
  if (!isReady) {
    const errResp = createBackendUnavailableResponse(failureReason || 'Android 内置后端未启动');
    logModelApiResponse(apiPath, init, errResp, startTime);
    return errResp;
  }

  const targetUrl = `${LOCAL_BACKEND}${apiPath}`;
  console.log('[小手机本地后端] apiFetch 转发:', apiPath, '->', targetUrl);

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
        console.warn('[小手机本地后端] 拦截到 HTML 响应，转换为明确后端未就绪错误');
        const errResp = createBackendUnavailableResponse('Android 内置后端未启动（收到前端静态页面响应，非 API 数据）');
        logModelApiResponse(apiPath, init, errResp, startTime);
        return errResp;
      }
    }

    logModelApiResponse(apiPath, init, resp, startTime);
    return resp;
  } catch (netErr: any) {
    console.error('[小手机本地后端] 连接 127.0.0.1:3000 失败:', netErr);
    const errResp = createBackendUnavailableResponse(`Android 内置后端未启动 (127.0.0.1:3000 连接失败: ${netErr.message || '网络连接拒绝'})`);
    logModelApiResponse(apiPath, init, errResp, startTime);
    return errResp;
  }
}

/**
 * Legacy setup helper - kept for backwards compatibility (no-op, window.fetch is no longer overridden).
 */
export function setupLocalBackend() {
  // Deprecated: window.fetch is not globally overridden. Use apiFetch for internal /api requests.
}


