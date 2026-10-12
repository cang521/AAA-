import { ApiLog } from '../types';

export interface ApiLogPayload {
  appName: string;
  modelName: string;
  interfaceType: string;
  promptTokens: number;
  completionTokens: number;
  isRealTokens?: boolean;
  estimatedCost: number;
  purpose: string;
  success: boolean;
  durationMs: number;
  errorType?: string;
}

export function recordApiLog(payload: ApiLogPayload) {
  const log: ApiLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    appName: payload.appName || '系统',
    timestamp: Date.now(),
    modelName: payload.modelName || 'gemini-3.6-flash',
    interfaceType: payload.interfaceType || 'ChatCompletion',
    promptTokens: payload.promptTokens || 0,
    completionTokens: payload.completionTokens || 0,
    estimatedCost: payload.estimatedCost || 0.0001,
    purpose: `${payload.purpose} | 状态: ${payload.success ? '成功' : '失败'} | 耗时: ${payload.durationMs}ms${payload.isRealTokens ? ' | Token: 真实返回' : ' | Token: 估算'}`,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('record_api_log', {
        detail: log,
      })
    );
  }
}
