import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { setupLocalBackend } from './lib/localBackend.ts';
import './index.css';

// APK 原生环境下，把 App 自己的本地请求接到手机内置后端。
// 浏览器环境不会启用。
setupLocalBackend();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
