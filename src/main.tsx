import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { executeAppUpgradeCheck } from './lib/dataMigration.ts';
import './index.css';

async function bootstrapApp() {
  // 1. 执行 Android 覆盖安装与增量升级安全检查，保障所有已有数据完整保留
  try {
    await executeAppUpgradeCheck();
  } catch (err) {
    console.warn('[AppInit] Safe upgrade check error (continuing with preserved data):', err);
  }

  // 2. 渲染 React 应用
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrapApp();
