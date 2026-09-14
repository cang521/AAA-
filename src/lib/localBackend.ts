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

  // Non-internal /api/ request (e.g. user custom external Base URL) or not Native Android
  if (!Capacitor.isNativePlatform() || !apiPath) {
    return fetch(input, init);
  }

  const isReady = await waitForNodeBackend();
  if (!isReady) {
    return createBackendUnavailableResponse(failureReason || 'Android 内置后端未启动');
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
        return createBackendUnavailableResponse('Android 内置后端未启动（收到前端静态页面响应，非 API 数据）');
      }
    }

    return resp;
  } catch (netErr: any) {
    console.error('[小手机本地后端] 连接 127.0.0.1:3000 失败:', netErr);
    return createBackendUnavailableResponse(`Android 内置后端未启动 (127.0.0.1:3000 连接失败: ${netErr.message || '网络连接拒绝'})`);
  }
}

/**
 * Legacy setup helper - kept for backwards compatibility (no-op, window.fetch is no longer overridden).
 */
export function setupLocalBackend() {
  // Deprecated: window.fetch is not globally overridden. Use apiFetch for internal /api requests.
}


