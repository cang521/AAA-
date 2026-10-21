import { ApiLog } from '../types';

export interface ApiLogPayload {
  appName: string;
  modelName?: string;
  interfaceType?: string;
  category?: 'text' | 'image' | 'voice';
  status?: 'success' | 'failed';
  durationMs?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  isRealTokens?: boolean;
  estimatedCost?: number | null;
  costDisplay?: string;
  errorType?: string;
  errorMessage?: string;
  purpose: string;
}

export function recordApiLog(payload: Partial<ApiLogPayload> & { appName: string; purpose?: string }): ApiLog | null {
  try {
    const isFailed = payload.status === 'failed' || Boolean(payload.errorMessage);
    const status: 'success' | 'failed' = isFailed ? 'failed' : 'success';

    const model = payload.modelName || 'gemini-3.6-flash';
    const isOfficialGemini = model.includes('gemini') || payload.appName.includes('Gemini');
    const defaultCostDisplay = isOfficialGemini ? '免费/内置' : '未提供';

    const promptTokens = typeof payload.promptTokens === 'number' ? payload.promptTokens : null;
    const completionTokens = typeof payload.completionTokens === 'number' ? payload.completionTokens : null;
    const totalTokens = typeof payload.totalTokens === 'number'
      ? payload.totalTokens
      : (promptTokens !== null && completionTokens !== null)
      ? promptTokens + completionTokens
      : null;

    const log: ApiLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      appName: payload.appName || '系统',
      timestamp: Date.now(),
      modelName: model,
      interfaceType: payload.interfaceType || 'ChatCompletion',
      category: payload.category || (payload.interfaceType?.toLowerCase().includes('image') ? 'image' : payload.interfaceType?.toLowerCase().includes('speech') ? 'voice' : 'text'),
      status,
      durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
      promptTokens,
      completionTokens,
      totalTokens,
      isRealTokens: Boolean(payload.isRealTokens),
      estimatedCost: typeof payload.estimatedCost === 'number' ? payload.estimatedCost : null,
      costDisplay: payload.costDisplay || defaultCostDisplay,
      errorType: payload.errorType,
      errorMessage: payload.errorMessage,
      purpose: payload.purpose || (isFailed ? 'API 请求失败' : '模型接口调用'),
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('record_api_log', {
          detail: log,
        })
      );
    }

    return log;
  } catch (err) {
    console.warn('[apiLogger] 记录 API 日志异常 (已被防崩溃拦截):', err);
    return null;
  }
}

