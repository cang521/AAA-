const fs = require('node:fs');
const path = require('node:path');
const bridge = require('bridge');
const { app, channel } = bridge;

process.env.XIAOSHOUJI_EMBEDDED_NODE = '1';

let dataDir = '';
try {
  dataDir = typeof app?.datadir === 'function' ? String(app.datadir() || '') : '';
} catch (err) {
  console.error('[小手机] 获取 app.datadir() 失败:', err);
}

const logFilePath = dataDir ? path.join(dataDir, 'xiaoshouji-backend.log') : '';

function appendLog(level, stage, message, stack) {
  const line = [
    new Date().toISOString(),
    `[${level}]`,
    `[${stage}]`,
    message || '',
    stack ? `\n${stack}` : '',
  ].join(' ');

  if (level === 'ERROR') {
    console.error('[小手机]', line);
  } else {
    console.log('[小手机]', line);
  }

  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line + '\n', 'utf8');
    } catch {
      // ignore log file write failures
    }
  }
}

function serializeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message || String(err),
      code: err.code ? String(err.code) : undefined,
      stack: err.stack || '',
    };
  }
  return {
    name: typeof err,
    message: typeof err === 'string' ? err : JSON.stringify(err),
    code: undefined,
    stack: '',
  };
}

function postToFrontend(eventName, payload) {
  try {
    if (channel && typeof channel.post === 'function') {
      channel.post(eventName, payload);
    } else if (channel && typeof channel.send === 'function') {
      channel.send(eventName, payload);
    }
  } catch (postErr) {
    console.error('[小手机] bridge.channel 上报失败:', postErr);
  }
}

function reportBackendEvent(eventName, payload) {
  const enriched = {
    timestamp: Date.now(),
    dataDir,
    logFilePath,
    ...(payload || {}),
  };
  const isError = eventName === 'backend_error' || eventName === 'backend_exit';
  appendLog(
    isError ? 'ERROR' : 'INFO',
    enriched.stage || eventName,
    enriched.message || '',
    enriched.stack || ''
  );
  postToFrontend(eventName, enriched);
}

globalThis.__XIAOSHOUJI_BACKEND_REPORT__ = reportBackendEvent;

try {
  if (app && typeof app.on === 'function') {
    app.on('pause', (pauseLock) => {
      try {
        if (pauseLock && typeof pauseLock.release === 'function') {
          pauseLock.release();
        }
      } catch {
        // ignore
      }
    });
  }
} catch {
  // ignore lifecycle hook errors
}

process.on('uncaughtException', (err) => {
  const info = serializeError(err);
  reportBackendEvent('backend_error', {
    stage: 'UNCAUGHT_EXCEPTION',
    fatal: true,
    ...info,
  });
});

process.on('unhandledRejection', (reason) => {
  const info = serializeError(reason);
  reportBackendEvent('backend_error', {
    stage: 'UNHANDLED_REJECTION',
    fatal: false,
    ...info,
  });
});

process.on('exit', (code) => {
  reportBackendEvent('backend_exit', {
    stage: 'NODE_PROCESS_EXIT',
    code,
    message: `Node 进程已退出 (code=${code})`,
  });
});

appendLog('INFO', 'BOOTSTRAP_START', `内置 Node.js 已启动, dataDir=${dataDir || '(empty)'}`);

try {
  require('./server.cjs');
} catch (err) {
  const info = serializeError(err);
  reportBackendEvent('backend_error', {
    stage: 'REQUIRE_SERVER_FAILED',
    fatal: true,
    ...info,
  });
}
