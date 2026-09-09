import { Capacitor } from '@capacitor/core';
import { Nodejs } from '@capawesome/capacitor-nodejs';

const LOCAL_BACKEND = 'http://127.0.0.1:3000';
let readyPromise: Promise<void> | null = null;

async function waitForNodeBackend(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (readyPromise) return readyPromise;

  readyPromise = new Promise<void>((resolve, reject) => {
    let finished = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    const finish = async (error?: Error) => {
      if (finished) return;
      finished = true;
      try {
        await listenerHandle?.remove();
      } catch {}
      if (error) reject(error);
      else resolve();
    };

    const timer = window.setTimeout(() => {
      void finish(new Error('手机内置 Node.js 后端启动超时'));
    }, 15000);

    Nodejs.addListener('ready', () => {
      window.clearTimeout(timer);
      void finish();
    }).then(handle => {
      listenerHandle = handle;
      return Nodejs.isReady();
    }).then(({ ready }) => {
      if (ready) {
        window.clearTimeout(timer);
        void finish();
      }
    }).catch(error => {
      window.clearTimeout(timer);
      void finish(error instanceof Error ? error : new Error(String(error)));
    });
  });

  return readyPromise;
}

export function setupLocalBackend() {
  if (!Capacitor.isNativePlatform()) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input;

    // 只把 App 自己的 /api/* 请求转给手机内置后端。
    // 用户填写的远程 Base URL / API Key / 反代地址不做任何修改。
    if (!url.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    await waitForNodeBackend();

    const targetUrl = `${LOCAL_BACKEND}${url}`;
    console.log('[小手机本地后端]', url, '->', targetUrl);

    if (input instanceof Request) {
      return originalFetch(new Request(targetUrl, input), init);
    }

    return originalFetch(targetUrl, init);
  };
}
