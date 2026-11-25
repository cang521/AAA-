import { ApiLog, ApiLogCategory } from '../types';
import { sanitizeSensitiveText } from './apiCapabilities';

const API_LOG_STORAGE_KEY = 'phone_api_logs';
const API_LOG_MAX_ENTRIES = 1000;

function loadPersistedApiLogs(): ApiLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(API_LOG_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id) : [];
  } catch {
    return [];
  }
}

function isSameApiCall(a: ApiLog, b: ApiLog): boolean {
  if (a.id === b.id) return true;
  if (a.requestId && b.requestId) {
    return a.requestId === b.requestId && a.interfaceType === b.interfaceType;
  }
  // Legacy endpoints do not always return requestId.  The old UI also manually
  // recorded the same response that apiFetch already intercepted, usually within
  // a few milliseconds.  Treat that pair as one call without merging genuinely
  // separate sequential requests.
  return (
    Math.abs(a.timestamp - b.timestamp) <= 1500 &&
    a.appName === b.appName &&
    a.interfaceType === b.interfaceType &&
    a.modelName === b.modelName &&
    (a.status || 'success') === (b.status || 'success') &&
    a.purpose === b.purpose
  );
}

/**
 * Single durable writer for every API monitor entry.
 * It always reloads the latest storage snapshot before appending, so concurrent
 * AI replies can no longer overwrite one another through stale React closures.
 */
export function persistApiLog(log: ApiLog): ApiLog {
  if (typeof window === 'undefined') return log;
  try {
    const latest = loadPersistedApiLogs();
    const duplicateIndex = latest.findIndex((item) => isSameApiCall(item, log));
    const existing = duplicateIndex >= 0 ? latest[duplicateIndex] : null;
    const merged = existing
      ? {
          ...existing,
          ...log,
          id: existing.id,
          requestId: log.requestId || existing.requestId,
          status: log.status || existing.status,
          category: log.category || existing.category,
          httpStatus: log.httpStatus ?? existing.httpStatus,
          durationMs: log.durationMs ?? existing.durationMs,
        }
      : log;
    const next = duplicateIndex >= 0
      ? [merged, ...latest.filter((_, index) => index !== duplicateIndex)]
      : [merged, ...latest];
    localStorage.setItem(API_LOG_STORAGE_KEY, JSON.stringify(next.slice(0, API_LOG_MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent('api_logs_changed', { detail: { id: log.id } }));
  } catch (error) {
    console.warn('[apiLogger] 持久化 API 日志失败:', error);
  }
  return log;
}

export interface ApiLogPayload {
  appName: string;
  provider?: string;
  modelName?: string;
  interfaceType?: string;
  category?: ApiLogCategory;
  status?: 'success' | 'failed';
  httpStatus?: number;
  requestId?: string;
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
  contextRawCount?: number;
  contextSummarizedCount?: number;
  contextEstimatedTokens?: number;
  contextCompressed?: boolean;
}

export function normalizeApiLogCategory(
  category?: ApiLogCategory,
  interfaceType?: string
): ApiLogCategory {
  if (
    category === 'text_generation' ||
    category === 'image_generation' ||
    category === 'speech_generation' ||
    category === 'image_recognition' ||
    category === 'speech_recognition'
  ) {
    return category;
  }
  const iface = (interfaceType || '').toLowerCase();
  if (iface.includes('analyze') || iface.includes('recognition') || iface.includes('vision')) {
    return 'image_recognition';
  }
  if (iface.includes('image')) {
    return 'image_generation';
  }
  if (iface.includes('transcribe') || iface.includes('stt')) {
    return 'speech_recognition';
  }
  if (iface.includes('speech') || iface.includes('tts') || iface.includes('audio') || iface.includes('voice')) {
    return 'speech_generation';
  }
  if (category === 'image') return 'image_generation';
  if (category === 'voice') return 'speech_generation';
  return 'text_generation';
}

export function recordApiLog(
  payload: Partial<ApiLogPayload> & { appName: string; purpose?: string }
): ApiLog | null {
  try {
    const isFailed = payload.status === 'failed' || Boolean(payload.errorMessage);
    const status: 'success' | 'failed' = isFailed ? 'failed' : 'success';

    const model = payload.modelName || 'unknown-model';
    const isOfficialGemini = model.includes('gemini') || payload.appName.includes('Gemini');
    const defaultCostDisplay = isOfficialGemini ? '免费/内置' : '未提供';

    const promptTokens = typeof payload.promptTokens === 'number' ? payload.promptTokens : null;
    const completionTokens = typeof payload.completionTokens === 'number' ? payload.completionTokens : null;
    const totalTokens =
      typeof payload.totalTokens === 'number'
        ? payload.totalTokens
        : promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null;

    const category = normalizeApiLogCategory(payload.category, payload.interfaceType);

    const log: ApiLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      appName: sanitizeSensitiveText(payload.appName || '系统', 80),
      timestamp: Date.now(),
      provider: payload.provider ? sanitizeSensitiveText(payload.provider, 60) : undefined,
      modelName: sanitizeSensitiveText(model, 80),
      interfaceType: payload.interfaceType || 'ChatCompletion',
      category,
      status,
      httpStatus: typeof payload.httpStatus === 'number' ? payload.httpStatus : undefined,
      requestId: payload.requestId ? sanitizeSensitiveText(payload.requestId, 80) : undefined,
      durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
      promptTokens,
      completionTokens,
      totalTokens,
      isRealTokens: Boolean(payload.isRealTokens),
      estimatedCost: typeof payload.estimatedCost === 'number' ? payload.estimatedCost : null,
      costDisplay: payload.costDisplay || defaultCostDisplay,
      errorType: payload.errorType ? sanitizeSensitiveText(payload.errorType, 60) : undefined,
      errorMessage: payload.errorMessage ? sanitizeSensitiveText(payload.errorMessage, 280) : undefined,
      purpose: sanitizeSensitiveText(
        payload.purpose || (isFailed ? 'API 请求失败' : '模型接口调用'),
        160
      ),
      contextRawCount: typeof payload.contextRawCount === 'number' ? payload.contextRawCount : undefined,
      contextSummarizedCount:
        typeof payload.contextSummarizedCount === 'number' ? payload.contextSummarizedCount : undefined,
      contextEstimatedTokens:
        typeof payload.contextEstimatedTokens === 'number' ? payload.contextEstimatedTokens : undefined,
      contextCompressed: typeof payload.contextCompressed === 'boolean' ? payload.contextCompressed : undefined,
    };

    return persistApiLog(log);
  } catch (err) {
    console.warn('[apiLogger] 记录 API 日志异常 (已被防崩溃拦截):', err);
    return null;
  }
}
