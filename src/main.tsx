import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { setupLocalBackend } from './lib/localBackend.ts';
import { executeAppUpgradeCheck } from './lib/dataMigration.ts';
import './index.css';

setupLocalBackend();

// 启动前执行 Android 覆盖安装与增量升级安全检查，保障所有已有数据完整保留
executeAppUpgradeCheck().catch((err) => {
  console.warn('[AppInit] Safe upgrade check error (continuing with preserved data):', err);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
