import { Capacitor } from '@capacitor/core';

const LOCAL_BACKEND_URL = 'http://127.0.0.1:3000';

export function setupLocalBackend() {
  // 电脑网页预览不要改
  // 只有真正安装到 Android APK 后才连接手机本地后端
  if (!Capacitor.isNativePlatform()) {
    console.log('[LocalBackend] Web 模式，不使用手机本地后端');
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const originalUrl =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input;

    // 把：
    // /api/gemini/chat
    //
    // 自动变成：
    // http://127.0.0.1:3000/api/gemini/chat
    if (originalUrl.startsWith('/api/')) {
      const targetUrl = `${LOCAL_BACKEND_URL}${originalUrl}`;

      console.log('[LocalBackend]', originalUrl, '→', targetUrl);

      if (input instanceof Request) {
        return originalFetch(
          new Request(targetUrl, input),
          init
        );
      }

      return originalFetch(targetUrl, init);
    }

    return originalFetch(input, init);
  };

  console.log(
    `[LocalBackend] Android 本地后端已启用：${LOCAL_BACKEND_URL}`
  );
}
