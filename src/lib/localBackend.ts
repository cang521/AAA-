import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';

const LOCAL_BACKEND = 'http://127.0.0.1:3000';
let backendStatus: 'unknown' | 'ready' | 'failed' = 'unknown';
let failureReason = '';
let readyPromise: Promise<boolean> | null = null;

async function pingBackendHealth(): Promise<boolean> {
  try {
    const res = await window.fetch(`${LOCAL_BACKEND}/api/health`, {
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

async function waitForNodeBackend(): Promise<boolean> {
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

function extractApiPath(input: RequestInfo | URL): string | null {
  const urlStr =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : String(input);

  if (urlStr.startsWith('http://127.0.0.1:3000/api/')) {
    return urlStr.substring('http://127.0.0.1:3000'.length);
  }

  if (urlStr.startsWith('/api/')) {
    return urlStr;
  }

  try {
    const parsed = new URL(urlStr, window.location.href);
    const origin = window.location.origin;
    // Intercept requests targeting current origin, localhost, or android asset host
    if (
      parsed.origin === origin ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.protocol === 'capacitor:'
    ) {
      if (parsed.pathname.startsWith('/api/')) {
        return parsed.pathname + parsed.search;
      }
    }
  } catch {
    // ignore URL parse errors for malformed relative inputs
  }

  return null;
}

function createBackendUnavailableResponse(detailMessage?: string): Response {
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

export function setupLocalBackend() {
  if (!Capacitor.isNativePlatform()) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const apiPath = extractApiPath(input);

    // If it is not an internal /api/... request, pass through directly
    // (e.g. external user-configured Base URL requests like https://my-proxy.com)
    if (!apiPath) {
      return originalFetch(input, init);
    }

    // Ensure local Node.js backend is active
    const isReady = await waitForNodeBackend();
    if (!isReady) {
      return createBackendUnavailableResponse(failureReason || 'Android 内置后端未启动');
    }

    const targetUrl = `${LOCAL_BACKEND}${apiPath}`;
    console.log('[小手机本地后端] 转发 /api 请求:', apiPath, '->', targetUrl);

    try {
      let resp: Response;
      if (input instanceof Request) {
        resp = await originalFetch(new Request(targetUrl, input), init);
      } else {
        resp = await originalFetch(targetUrl, init);
      }

      // Guard against index.html being served when a 404/fallback happens
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
  };
}

