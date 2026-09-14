import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { executeAppUpgradeCheck } from './lib/dataMigration.ts';
import { hydrateApiConfigFromNativeStorage } from './lib/storage.ts';
import './index.css';

async function bootstrapApp() {
  // 1. Android 原生环境优先从 Capacitor Preferences 恢复 API 配置到 localStorage
  try {
    await hydrateApiConfigFromNativeStorage();
  } catch (err) {
    console.warn('[AppInit] API Config hydration error:', err);
  }

  // 2. 执行 Android 覆盖安装与增量升级安全检查，保障所有已有数据完整保留
  try {
    await executeAppUpgradeCheck();
  } catch (err) {
    console.warn('[AppInit] Safe upgrade check error (continuing with preserved data):', err);
  }

  // 3. 渲染 React 应用
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrapApp();
