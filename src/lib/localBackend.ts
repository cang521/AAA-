import { Capacitor } from '@capacitor/core';

const LOCAL_BACKEND = 'http://127.0.0.1:3000';

export function setupLocalBackend() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input;

    // 只接管 App 自己的 /api 请求。
    // 你的反代 Base URL、API Key、模型请求全部不碰。
    if (!url.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const targetUrl = LOCAL_BACKEND + url;

    console.log(
      '[小手机本地后端]',
      url,
      '->',
      targetUrl
    );

    if (input instanceof Request) {
      const request = new Request(
        targetUrl,
        input
      );

      return originalFetch(
        request,
        init
      );
    }

    return originalFetch(
      targetUrl,
      init
    );
  };
}
