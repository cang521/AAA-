import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { extractThinkingAndContent, sanitizeReplyText } from './src/lib/thinkCleaner';
import {
  extractApiReasoning,
  sanitizeResponseStructure,
  StreamingReasoningAccumulator,
  type ReasoningSource,
} from './src/lib/reasoningExtractor';
import {
  classifyModelCapabilities,
  parseCustomThinkingParamsJson,
  resolveEffectiveProtocol,
  resolveTextGenerationConfig,
  sanitizeSensitiveText,
} from './src/lib/apiCapabilities';
import type { ThinkingOutputSettings } from './src/types';
import { applyOverlengthContextProtection, STANDARD_CONTEXT_LIMIT } from './src/lib/contextWindow';
import { serializeForwardBundleForAi } from './src/lib/forward/forwardBundleService';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

// 允许 Capacitor WebView (https://localhost) 访问手机本地后端。
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = Number(process.env.PORT || 3000);
const IS_EMBEDDED_ANDROID = process.env.XIAOSHOUJI_EMBEDDED_NODE === '1';

// Do not initialize the Google SDK while the Android embedded backend is booting.
// The mobile runtime is Node 18 and has a reduced standard library. Loading the
// complete SDK (and google-auth-library) at module evaluation time can abort the
// server before Express gets a chance to bind /api/health. Load it only when a
// Gemini request actually needs it; OpenAI-compatible providers and the health
// endpoint no longer depend on the SDK being mobile-compatible at startup.
let googleGenAiModulePromise: Promise<typeof import('@google/genai')> | null = null;

async function loadGoogleGenAi() {
  if (!googleGenAiModulePromise) {
    googleGenAiModulePromise = import('@google/genai').catch((error) => {
      googleGenAiModulePromise = null;
      throw error;
    });
  }
  return googleGenAiModulePromise;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    backend: 'xiaoshouji-local-node',
    port: PORT,
    embedded: IS_EMBEDDED_ANDROID,
  });
});

interface AiCallParams {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  apiProtocol?: string;
  responseMimeType?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  customHeaders?: Record<string, string>;
  thinkingConfig?: ThinkingOutputSettings;
  stream?: boolean;
  allowStreamFallback?: boolean;
  includeSanitizedStructure?: boolean;
}

/**
 * Universal High-Reliability AI Service Engine
 * Supports:
 * 1. Google Gemini (Official / Custom Reverse Proxy / Custom Base URL)
 * 2. OpenAI Compatible APIs (OpenAI, DeepSeek, OpenRouter, Groq, SiliconFlow, OneAPI, NewAPI, Cloudflare, Local Ollama, etc.)
 * 3. Anthropic Messages API compatible endpoints
 * 4. Full Timeout, Error Extraction, SSE Streaming, Reasoning Extraction, and HTTP status diagnostics
 */
export interface AiCallDetailedResult {
  text: string;
  thinkingProcess: string;
  reasoningAvailable: boolean;
  reasoningSource: ReasoningSource;
  detectedFields?: string[];
  streamingSupported?: boolean;
  streamingUsed?: boolean;
  hasThoughtSignatureOnly?: boolean;
  rawStructureSanitized?: any;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  isRealTokens?: boolean;
  modelUsed: string;
}

function buildApiLogObject(params: {
  appName: string;
  provider?: string;
  modelName: string;
  interfaceType: string;
  category?:
    | 'text'
    | 'image'
    | 'voice'
    | 'text_generation'
    | 'image_generation'
    | 'speech_generation'
    | 'image_recognition'
    | 'speech_recognition';
  status?: 'success' | 'failed';
  httpStatus?: number;
  requestId?: string;
  durationMs: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  isRealTokens?: boolean;
  purpose: string;
  error?: string;
  errorType?: string;
  isOfficial?: boolean;
  protocol?: string;
  endpointType?: string;
  errorName?: string;
  causeCode?: string;
  causeErrno?: number;
  causeSyscall?: string;
  headersReceived?: boolean;
  readBodyFailed?: boolean;
  mayHaveBeenCharged?: boolean;
  upstreamRequestSent?: boolean;
  contextRawCount?: number;
  contextSummarizedCount?: number;
  contextEstimatedTokens?: number;
  contextCompressed?: boolean;
  reasoningAvailable?: boolean;
  reasoningSource?: ReasoningSource;
  reasoningCharCount?: number;
}) {
  const isFailed = params.status === 'failed' || Boolean(params.error);
  const isOfficial =
    params.isOfficial !== false &&
    (params.modelName.includes('gemini') ||
      params.modelName.includes('imagen') ||
      params.provider === 'google_gemini');
  const defaultCostDisplay = isOfficial ? '免费/内置' : '未提供';

  const normalizedCategory =
    params.category === 'image'
      ? 'image_generation'
      : params.category === 'voice'
      ? 'speech_generation'
      : params.category === 'text' || !params.category
      ? 'text_generation'
      : params.category;

  return {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    appName: sanitizeSensitiveText(params.appName, 80),
    timestamp: Date.now(),
    provider: params.provider ? sanitizeSensitiveText(params.provider, 60) : undefined,
    modelName: sanitizeSensitiveText(params.modelName || 'unknown', 80),
    interfaceType: params.interfaceType,
    category: normalizedCategory,
    status: isFailed ? 'failed' : 'success',
    httpStatus: params.httpStatus,
    requestId: params.requestId ? sanitizeSensitiveText(params.requestId, 80) : undefined,
    durationMs: params.durationMs,
    promptTokens: typeof params.usage?.promptTokens === 'number' ? params.usage.promptTokens : null,
    completionTokens: typeof params.usage?.completionTokens === 'number' ? params.usage.completionTokens : null,
    totalTokens:
      typeof params.usage?.totalTokens === 'number'
        ? params.usage.totalTokens
        : typeof params.usage?.promptTokens === 'number' && typeof params.usage?.completionTokens === 'number'
        ? params.usage.promptTokens + params.usage.completionTokens
        : null,
    isRealTokens: Boolean(params.isRealTokens),
    estimatedCost: null,
    costDisplay: defaultCostDisplay,
    errorType: isFailed ? params.errorType || 'ModelError' : undefined,
    errorMessage: params.error ? sanitizeSensitiveText(params.error, 260) : undefined,
    purpose: sanitizeSensitiveText(params.purpose, 160),
    protocol: params.protocol ? sanitizeSensitiveText(params.protocol, 40) : undefined,
    endpointType: params.endpointType ? sanitizeSensitiveText(params.endpointType, 40) : undefined,
    errorName: params.errorName ? sanitizeSensitiveText(params.errorName, 60) : undefined,
    causeCode: params.causeCode ? sanitizeSensitiveText(params.causeCode, 40) : undefined,
    causeErrno: typeof params.causeErrno === 'number' ? params.causeErrno : undefined,
    causeSyscall: params.causeSyscall ? sanitizeSensitiveText(params.causeSyscall, 40) : undefined,
    headersReceived: typeof params.headersReceived === 'boolean' ? params.headersReceived : undefined,
    readBodyFailed: typeof params.readBodyFailed === 'boolean' ? params.readBodyFailed : undefined,
    mayHaveBeenCharged: typeof params.mayHaveBeenCharged === 'boolean' ? params.mayHaveBeenCharged : undefined,
    upstreamRequestSent: typeof params.upstreamRequestSent === 'boolean' ? params.upstreamRequestSent : undefined,
    ...(typeof params.contextRawCount === 'number' ? { contextRawCount: params.contextRawCount } : {}),
    ...(typeof params.contextSummarizedCount === 'number'
      ? { contextSummarizedCount: params.contextSummarizedCount }
      : {}),
    ...(typeof params.contextEstimatedTokens === 'number'
      ? { contextEstimatedTokens: params.contextEstimatedTokens }
      : {}),
    ...(typeof params.contextCompressed === 'boolean' ? { contextCompressed: params.contextCompressed } : {}),
    ...(typeof params.reasoningAvailable === 'boolean' ? { reasoningAvailable: params.reasoningAvailable } : {}),
    ...(params.reasoningSource ? { reasoningSource: params.reasoningSource } : {}),
    ...(typeof params.reasoningCharCount === 'number' ? { reasoningCharCount: params.reasoningCharCount } : {}),
  };
}

// =========================================================================
// Shared Protocol, SSRF Safety, and Idempotency Helpers for Image Routes
// =========================================================================
function buildGoogleRestBase(baseUrl?: string): string {
  const clean = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return 'https://generativelanguage.googleapis.com/v1beta';
  if (/\/v1(beta|alpha)?$/i.test(clean)) return clean;
  return `${clean}/v1beta`;
}

function buildOpenAiEndpoint(baseUrl: string | undefined, suffixPath: string): string {
  const clean = (baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedSuffix = suffixPath.startsWith('/') ? suffixPath : `/${suffixPath}`;
  if (!clean) return `https://api.openai.com/v1${normalizedSuffix}`;
  if (clean.endsWith(normalizedSuffix)) return clean;
  if (clean.endsWith('/v1')) return `${clean}${normalizedSuffix}`;
  return `${clean}/v1${normalizedSuffix}`;
}

function assertSafeRemoteImageUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('图片 URL 格式无效');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http/https 或 Base64 Data URL 格式的图片');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host === '169.254.169.254' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    throw new Error('出于安全限制，不允许读取内网或本机地址的远程图片');
  }
  return parsed;
}

const IMAGE_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const imageGenCompletedCache = new Map<string, { expiresAt: number; payload: any }>();
const imageGenInFlightCache = new Map<string, Promise<any>>();
const imageRecCompletedCache = new Map<string, { expiresAt: number; payload: any }>();
const imageRecInFlightCache = new Map<string, Promise<any>>();

function pruneImageCaches() {
  const now = Date.now();
  for (const [k, v] of imageGenCompletedCache.entries()) {
    if (v.expiresAt <= now) imageGenCompletedCache.delete(k);
  }
  for (const [k, v] of imageRecCompletedCache.entries()) {
    if (v.expiresAt <= now) imageRecCompletedCache.delete(k);
  }
}

const GEMINI_DEFAULT_TEXT_MODEL = 'gemini-4-hydrogen';
const GEMINI_TEXT_FALLBACK_ORDER = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'] as const;
const geminiModelCooldownUntil = new Map<string, number>();

function isGemini4Model(modelName: string): boolean {
  return modelName.startsWith('gemini-4-');
}

function normalizeOfficialGeminiModel(modelName: string): string {
  const trimmed = modelName.trim();
  if (!trimmed || trimmed === 'gemini-3.6-flash') {
    return GEMINI_DEFAULT_TEXT_MODEL;
  }
  return trimmed;
}

function isQuotaOrRateLimitError(msg: string): boolean {
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota')
  );
}

function isModelUnavailableError(msg: string): boolean {
  return msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found');
}

function parseRetryCooldownMs(msg: string): number {
  const match = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i) || msg.match(/Please retry in\s+(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (match) {
    if (match.length === 2 && match[1]) {
      const sec = parseInt(match[1], 10);
      return Math.min(Math.max(sec * 1000, 60_000), 30 * 60_000);
    }
    const hours = parseInt(match[1] || '0', 10);
    const mins = parseInt(match[2] || '0', 10);
    const secs = Math.ceil(parseFloat(match[3] || '0'));
    const totalMs = ((hours * 3600) + (mins * 60) + secs) * 1000;
    if (totalMs > 0) {
      return Math.min(Math.max(totalMs, 60_000), 30 * 60_000);
    }
  }
  return 15 * 60_000;
}

function isKnownGeminiThinkingModel(modelName: string): boolean {
  const lower = String(modelName || '').toLowerCase();
  return (
    lower.startsWith('gemini-4-') ||
    lower.includes('gemini-3') ||
    lower.includes('gemini-2.5') ||
    lower.includes('thinking') ||
    lower.includes('pro-latest')
  );
}

function mapEffortToGeminiLevel(effort: string | undefined, ThinkingLevelEnum?: any): any {
  const normalized = String(effort || 'medium').toLowerCase();
  if (ThinkingLevelEnum) {
    if (normalized === 'low') return ThinkingLevelEnum.LOW || 'LOW';
    if (normalized === 'high') return ThinkingLevelEnum.HIGH || 'HIGH';
    return ThinkingLevelEnum.MEDIUM || 'MEDIUM';
  }
  if (normalized === 'low') return 'LOW';
  if (normalized === 'high') return 'HIGH';
  return 'MEDIUM';
}

function mapEffortToGeminiBudget(effort: string | undefined, explicitBudget?: number): number | undefined {
  if (typeof explicitBudget === 'number' && Number.isFinite(explicitBudget) && explicitBudget > 0) {
    return Math.round(explicitBudget);
  }
  if (effort === 'low') return 1024;
  if (effort === 'medium') return 4096;
  if (effort === 'high') return 8192;
  return undefined;
}

function buildGeminiConfigForModel(
  modelName: string,
  params: AiCallParams,
  options?: {
    ThinkingLevelEnum?: any;
    customParams?: Record<string, any>;
    omitThinkingConfig?: boolean;
  }
): Record<string, any> | undefined {
  const config: Record<string, any> = {};
  const isG4 = isGemini4Model(modelName);
  if (params.systemInstruction) {
    config.systemInstruction = params.systemInstruction;
  }
  if (params.responseMimeType) {
    config.responseMimeType = params.responseMimeType;
  }
  if (!isG4 && params.temperature !== undefined) {
    config.temperature = params.temperature;
  }
  if (params.maxTokens !== undefined) {
    config.maxOutputTokens = params.maxTokens;
  }

  const tc = params.thinkingConfig;
  if (!options?.omitThinkingConfig && tc) {
    if (tc.mode === 'off') {
      config.thinkingConfig = { includeThoughts: false };
    } else if (tc.mode === 'on') {
      if (isG4) {
        config.thinkingConfig = {
          includeThoughts: true,
          thinkingLevel: mapEffortToGeminiLevel(tc.reasoningEffort, options?.ThinkingLevelEnum),
        };
      } else {
        const budget = mapEffortToGeminiBudget(tc.reasoningEffort, tc.thinkingBudget);
        config.thinkingConfig = {
          includeThoughts: true,
          ...(budget ? { thinkingBudget: budget } : {}),
        };
      }
    } else if (tc.mode === 'custom' && options?.customParams) {
      const custom = options.customParams;
      const customThinkingBlock =
        custom.thinkingConfig && typeof custom.thinkingConfig === 'object'
          ? { ...custom.thinkingConfig }
          : custom.generationConfig?.thinkingConfig && typeof custom.generationConfig.thinkingConfig === 'object'
          ? { ...custom.generationConfig.thinkingConfig }
          : null;

      const flatThinking: Record<string, any> = {};
      if (typeof custom.includeThoughts === 'boolean') flatThinking.includeThoughts = custom.includeThoughts;
      if (custom.thinkingLevel !== undefined) flatThinking.thinkingLevel = custom.thinkingLevel;
      if (!isG4 && custom.thinkingBudget !== undefined) flatThinking.thinkingBudget = custom.thinkingBudget;

      const mergedThinking = {
        ...(customThinkingBlock || {}),
        ...flatThinking,
      };
      if (isG4 && 'thinkingBudget' in mergedThinking) {
        delete mergedThinking.thinkingBudget;
      }
      if (Object.keys(mergedThinking).length > 0) {
        config.thinkingConfig = mergedThinking;
      }
      for (const [k, v] of Object.entries(custom)) {
        if (
          k === 'thinkingConfig' ||
          k === 'generationConfig' ||
          k === 'includeThoughts' ||
          k === 'thinkingLevel' ||
          k === 'thinkingBudget' ||
          k === 'contents' ||
          k === 'model'
        ) {
          continue;
        }
        if (isG4 && (k === 'temperature' || k === 'topP' || k === 'topK')) {
          continue;
        }
        config[k] = v;
      }
    } else if (tc.mode === 'auto' && isKnownGeminiThinkingModel(modelName)) {
      config.thinkingConfig = { includeThoughts: true };
    }
  } else if (!options?.omitThinkingConfig && isKnownGeminiThinkingModel(modelName)) {
    config.thinkingConfig = { includeThoughts: true };
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function isThinkingParamRejectionError(errMsg: string): boolean {
  const lower = String(errMsg || '').toLowerCase();
  return (
    (lower.includes('400') || lower.includes('invalid_argument') || lower.includes('unknown')) &&
    (lower.includes('thinking') ||
      lower.includes('includethoughts') ||
      lower.includes('thinking_config') ||
      lower.includes('thinkinglevel') ||
      lower.includes('thinkingbudget') ||
      lower.includes('reasoning_effort'))
  );
}

async function consumeSseResponse(
  response: Response,
  protocol: 'openai_compatible' | 'anthropic',
  includeSanitizedStructure?: boolean
): Promise<{
  accumulator: StreamingReasoningAccumulator;
  lastChunkSanitized?: any;
}> {
  if (!response.body) {
    throw new Error('上游流式响应体为空');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const accumulator = new StreamingReasoningAccumulator();
  let buffer = '';
  let lastChunkSanitized: any = undefined;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    const dataStr = line.slice(5).trim();
    if (!dataStr || dataStr === '[DONE]') return;
    try {
      const parsed = JSON.parse(dataStr);
      if (includeSanitizedStructure) {
        lastChunkSanitized = sanitizeResponseStructure(parsed);
      }
      if (protocol === 'openai_compatible') {
        accumulator.pushOpenAiChunk(parsed);
      } else {
        accumulator.pushAnthropicEvent(parsed);
      }
    } catch {
      // Ignore malformed/keepalive fragment
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        let newlineIdx = buffer.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          processLine(line);
          newlineIdx = buffer.indexOf('\n');
        }
      }
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const remLine of buffer.split('\n')) {
            processLine(remLine);
          }
        }
        break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  return { accumulator, lastChunkSanitized };
}

async function callAiServiceDetailed(params: AiCallParams): Promise<AiCallDetailedResult> {
  const cleanBaseUrl = params.baseUrl ? params.baseUrl.trim().replace(/\/+$/, '') : '';
  const cleanKey = (params.apiKey && params.apiKey.trim()) || '';
  const activeKey =
    cleanKey ||
    (!cleanBaseUrl && (!params.providerType || params.providerType === 'google_gemini') && process.env.NODE_ENV !== 'production'
      ? process.env.GEMINI_API_KEY || ''
      : '');
  const targetModel = params.model?.trim() || GEMINI_DEFAULT_TEXT_MODEL;

  const parsedCustom =
    params.thinkingConfig?.mode === 'custom'
      ? parseCustomThinkingParamsJson(params.thinkingConfig.customParamsJson)
      : { ok: true, params: {} as Record<string, any> };
  if (!parsedCustom.ok) {
    const cfgErr: any = new Error(parsedCustom.error || '自定义思考参数 JSON 语法无效');
    cfgErr.statusCode = 400;
    cfgErr.errorType = 'INVALID_THINKING_PARAMS';
    cfgErr.upstreamRequestSent = false;
    cfgErr.mayHaveBeenCharged = false;
    throw cfgErr;
  }

  const effectiveProtocol = resolveEffectiveProtocol({
    apiProtocol: params.apiProtocol,
    provider: params.providerType,
    baseUrl: cleanBaseUrl,
  });

  const wantStream = Boolean(params.stream ?? params.thinkingConfig?.useStreaming);
  const startTime = Date.now();
  let readBodyFailed = false;

  if (effectiveProtocol === 'openai_compatible') {
    if (!cleanBaseUrl && !activeKey) {
      const err: any = new Error('未配置 Base URL 或 API Key。请在系统设置中配置 API Provider。');
      err.statusCode = 400;
      err.errorType = 'CONFIG_MISSING';
      err.upstreamRequestSent = false;
      err.mayHaveBeenCharged = false;
      throw err;
    }

    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = 'https://api.openai.com/v1';
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = endpoint.endsWith('/v1') ? `${endpoint}/chat/completions` : `${endpoint}/v1/chat/completions`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemInstruction) {
      messages.push({ role: 'system', content: params.systemInstruction });
    }
    messages.push({ role: 'user', content: params.prompt });

    const buildOpenAiPayload = (useStream: boolean, includeStreamOptions: boolean) => {
      const payload: Record<string, any> = {
        model: targetModel,
        messages,
        temperature: params.temperature ?? 0.7,
      };
      if (params.maxTokens) {
        payload.max_tokens = params.maxTokens;
      }
      if (params.responseMimeType === 'application/json') {
        payload.response_format = { type: 'json_object' };
      }

      const tc = params.thinkingConfig;
      if (tc?.mode === 'on') {
        payload.reasoning_effort = tc.reasoningEffort || 'medium';
      } else if (tc?.mode === 'custom' && parsedCustom.params) {
        for (const [k, v] of Object.entries(parsedCustom.params)) {
          if (k === 'model' || k === 'messages') continue;
          payload[k] = v;
        }
      }

      if (useStream) {
        payload.stream = true;
        if (includeStreamOptions && payload.stream_options === undefined) {
          payload.stream_options = { include_usage: true };
        }
      } else {
        payload.stream = false;
      }
      return payload;
    };

    const executeOpenAiHttp = async (useStream: boolean, includeStreamOptions: boolean) => {
      const payload = buildOpenAiPayload(useStream, includeStreamOptions);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': useStream ? 'text/event-stream, application/json' : 'application/json',
        'Connection': 'close',
        ...(params.customHeaders || {}),
      };

      if (activeKey) {
        headers['Authorization'] = `Bearer ${activeKey}`;
      }

      if (endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://ai.studio.simulated.phone';
        headers['X-Title'] = 'Simulated Android Phone';
      }

      const timeoutMs = params.timeoutMs || 45000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const isAbort = fetchErr.name === 'AbortError';
        const causeCode = fetchErr.cause?.code || fetchErr.code;
        const causeErrno = fetchErr.cause?.errno;
        const causeSyscall = fetchErr.cause?.syscall;
        const isNetworkDrop =
          causeCode === 'ECONNRESET' ||
          causeCode === 'UND_ERR_SOCKET' ||
          fetchErr.message?.includes('fetch failed');

        const enhancedErr: any = new Error(
          isAbort
            ? `请求超时 (${timeoutMs / 1000}秒)，上游 API 未能在限定时间内返回完整回复。`
            : `连接上游接口失败 (${fetchErr.message || 'fetch failed'})`
        );
        enhancedErr.name = fetchErr.name;
        enhancedErr.cause = fetchErr.cause;
        enhancedErr.protocol = 'openai_compatible';
        enhancedErr.endpoint = endpoint;
        enhancedErr.headersReceived = false;
        enhancedErr.readBodyFailed = false;
        enhancedErr.durationMs = durationMs;
        enhancedErr.upstreamRequestSent = true;
        enhancedErr.mayHaveBeenCharged = isAbort || isNetworkDrop || durationMs > 12000;
        enhancedErr.causeCode = causeCode;
        enhancedErr.causeErrno = causeErrno;
        enhancedErr.causeSyscall = causeSyscall;
        throw enhancedErr;
      }

      if (!response.ok) {
        clearTimeout(timer);
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          readBodyFailed = true;
        }
        let parsedErrorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedErrorMsg = parsed.error?.message || parsed.message || errorText;
        } catch {}

        const durationMs = Date.now() - startTime;
        let err: any;
        if (response.status === 401) {
          err = new Error(`[401 鉴权失败] API Key 无效或未授权: ${parsedErrorMsg}`);
        } else if (response.status === 404) {
          err = new Error(`[404 路由或模型不存在] 请求端点 ${endpoint} 或模型 ${targetModel} 不存在: ${parsedErrorMsg}`);
        } else if (response.status === 429) {
          err = new Error(`[429 配额或限流] 账户配额不足或触发请求频率限制: ${parsedErrorMsg}`);
          err.isQuotaExceeded = true;
        } else if (response.status >= 500) {
          err = new Error(`[${response.status} 服务端错误] API Provider 上游异常: ${parsedErrorMsg}`);
        } else {
          err = new Error(`[${response.status} API 错误] ${parsedErrorMsg}`);
        }
        err.statusCode = response.status;
        err.protocol = 'openai_compatible';
        err.endpoint = endpoint;
        err.headersReceived = true;
        err.readBodyFailed = readBodyFailed;
        err.durationMs = durationMs;
        err.upstreamRequestSent = true;
        err.mayHaveBeenCharged = true;
        throw err;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (useStream && contentType.includes('text/event-stream')) {
        try {
          const { accumulator, lastChunkSanitized } = await consumeSseResponse(
            response,
            'openai_compatible',
            params.includeSanitizedStructure
          );
          clearTimeout(timer);
          const extracted = accumulator.finalize();
          return {
            text: extracted.text,
            thinkingProcess: extracted.thinkingProcess,
            reasoningAvailable: extracted.reasoningAvailable,
            reasoningSource: extracted.reasoningSource,
            detectedFields: extracted.detectedFields,
            streamingSupported: true,
            streamingUsed: true,
            hasThoughtSignatureOnly: extracted.hasThoughtSignatureOnly,
            rawStructureSanitized: lastChunkSanitized,
            usage: accumulator.usage,
            isRealTokens: accumulator.isRealTokens,
            modelUsed: targetModel,
          } satisfies AiCallDetailedResult;
        } catch (streamErr: any) {
          clearTimeout(timer);
          const err: any = new Error(`流式响应读取中断: ${streamErr?.message || 'stream interrupted'}`);
          err.name = streamErr?.name || 'StreamError';
          err.protocol = 'openai_compatible';
          err.endpoint = endpoint;
          err.headersReceived = true;
          err.readBodyFailed = true;
          err.durationMs = Date.now() - startTime;
          err.upstreamRequestSent = true;
          err.mayHaveBeenCharged = true;
          throw err;
        }
      }

      clearTimeout(timer);
      let resJson: any;
      try {
        resJson = await response.json();
      } catch (jsonErr: any) {
        readBodyFailed = true;
        const durationMs = Date.now() - startTime;
        const err: any = new Error(`上游响应数据解析失败: ${jsonErr.message}`);
        err.name = jsonErr.name;
        err.cause = jsonErr.cause;
        err.statusCode = response.status;
        err.protocol = 'openai_compatible';
        err.endpoint = endpoint;
        err.headersReceived = true;
        err.readBodyFailed = true;
        err.durationMs = durationMs;
        err.upstreamRequestSent = true;
        err.mayHaveBeenCharged = true;
        throw err;
      }

      const extracted = extractApiReasoning(resJson, 'openai_compatible');
      const usageMeta = resJson.usage;
      let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined = undefined;
      let isRealTokens = false;
      if (usageMeta && typeof usageMeta === 'object') {
        isRealTokens = true;
        usage = {
          promptTokens: typeof usageMeta.prompt_tokens === 'number' ? usageMeta.prompt_tokens : undefined,
          completionTokens: typeof usageMeta.completion_tokens === 'number' ? usageMeta.completion_tokens : undefined,
          totalTokens: typeof usageMeta.total_tokens === 'number' ? usageMeta.total_tokens : undefined,
        };
      }

      return {
        text: extracted.text,
        thinkingProcess: extracted.thinkingProcess,
        reasoningAvailable: extracted.reasoningAvailable,
        reasoningSource: extracted.reasoningSource,
        detectedFields: extracted.detectedFields,
        streamingSupported: false,
        streamingUsed: false,
        hasThoughtSignatureOnly: extracted.hasThoughtSignatureOnly,
        rawStructureSanitized: params.includeSanitizedStructure ? sanitizeResponseStructure(resJson) : undefined,
        usage,
        isRealTokens,
        modelUsed: targetModel,
      } satisfies AiCallDetailedResult;
    };

    try {
      return await executeOpenAiHttp(wantStream, wantStream);
    } catch (firstErr: any) {
      const msg = String(firstErr?.message || '').toLowerCase();
      if (wantStream && firstErr?.statusCode === 400) {
        if (msg.includes('stream_options')) {
          return await executeOpenAiHttp(true, false);
        }
        if (params.allowStreamFallback !== false && msg.includes('stream')) {
          return await executeOpenAiHttp(false, false);
        }
      }
      throw firstErr;
    }
  }

  // Anthropic Messages API Execution
  if (effectiveProtocol === 'anthropic') {
    if (!activeKey) {
      const err: any = new Error('未配置 Anthropic API Key。请在系统设置中配置 API Provider。');
      err.statusCode = 400;
      err.errorType = 'CONFIG_MISSING';
      err.upstreamRequestSent = false;
      err.mayHaveBeenCharged = false;
      throw err;
    }

    let endpoint = cleanBaseUrl || 'https://api.anthropic.com';
    if (!endpoint.endsWith('/messages')) {
      endpoint = endpoint.endsWith('/v1') ? `${endpoint}/messages` : `${endpoint}/v1/messages`;
    }

    const baseMaxTokens = params.maxTokens && params.maxTokens > 0 ? params.maxTokens : 2048;
    const payload: Record<string, any> = {
      model: targetModel,
      max_tokens: baseMaxTokens,
      messages: [{ role: 'user', content: params.prompt }],
      stream: wantStream,
    };
    if (params.systemInstruction) {
      payload.system = params.systemInstruction;
    }

    const tc = params.thinkingConfig;
    if (tc?.mode === 'on') {
      const budget =
        typeof tc.thinkingBudget === 'number' && tc.thinkingBudget >= 1024
          ? Math.round(tc.thinkingBudget)
          : tc.reasoningEffort === 'high'
          ? 8192
          : tc.reasoningEffort === 'low'
          ? 1024
          : 4096;
      payload.thinking = { type: 'enabled', budget_tokens: budget };
      if (payload.max_tokens <= budget) {
        payload.max_tokens = budget + 1024;
      }
    } else if (tc?.mode === 'custom' && parsedCustom.params) {
      for (const [k, v] of Object.entries(parsedCustom.params)) {
        if (k === 'model' || k === 'messages') continue;
        payload[k] = v;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': activeKey,
      'anthropic-version': '2023-06-01',
      'Connection': 'close',
      ...(params.customHeaders || {}),
    };

    const timeoutMs = params.timeoutMs || 45000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timer);
        const errText = await response.text().catch(() => '');
        const err: any = new Error(`[${response.status} Anthropic API 错误] ${errText}`);
        err.statusCode = response.status;
        err.protocol = 'anthropic';
        err.endpoint = endpoint;
        err.headersReceived = true;
        err.durationMs = Date.now() - startTime;
        err.upstreamRequestSent = true;
        err.mayHaveBeenCharged = true;
        throw err;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (wantStream && contentType.includes('text/event-stream')) {
        const { accumulator, lastChunkSanitized } = await consumeSseResponse(
          response,
          'anthropic',
          params.includeSanitizedStructure
        );
        clearTimeout(timer);
        const extracted = accumulator.finalize();
        return {
          text: extracted.text,
          thinkingProcess: extracted.thinkingProcess,
          reasoningAvailable: extracted.reasoningAvailable,
          reasoningSource: extracted.reasoningSource,
          detectedFields: extracted.detectedFields,
          streamingSupported: true,
          streamingUsed: true,
          rawStructureSanitized: lastChunkSanitized,
          usage: accumulator.usage,
          isRealTokens: accumulator.isRealTokens,
          modelUsed: targetModel,
        };
      }

      clearTimeout(timer);
      const resJson = await response.json();
      const extracted = extractApiReasoning(resJson, 'anthropic');
      const usageMeta = resJson?.usage;
      const usage =
        usageMeta && typeof usageMeta === 'object'
          ? {
              promptTokens: typeof usageMeta.input_tokens === 'number' ? usageMeta.input_tokens : undefined,
              completionTokens: typeof usageMeta.output_tokens === 'number' ? usageMeta.output_tokens : undefined,
            }
          : undefined;
      return {
        text: extracted.text,
        thinkingProcess: extracted.thinkingProcess,
        reasoningAvailable: extracted.reasoningAvailable,
        reasoningSource: extracted.reasoningSource,
        detectedFields: extracted.detectedFields,
        streamingSupported: false,
        streamingUsed: false,
        rawStructureSanitized: params.includeSanitizedStructure ? sanitizeResponseStructure(resJson) : undefined,
        usage,
        isRealTokens: Boolean(usage),
        modelUsed: targetModel,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (!err.protocol) {
        err.protocol = 'anthropic';
        err.endpoint = endpoint;
        err.durationMs = Date.now() - startTime;
      }
      throw err;
    }
  }

  // Google Gemini Native Execution
  if (effectiveProtocol === 'google_native') {
    if (!activeKey) {
      const err: any = new Error('未配置 Gemini API Key，且系统环境中无默认密钥。请在系统设置中配置 API Provider。');
      err.statusCode = 400;
      err.errorType = 'CONFIG_MISSING';
      err.upstreamRequestSent = false;
      err.mayHaveBeenCharged = false;
      throw err;
    }

    const clientOptions: any = {
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
          'Connection': 'close',
          ...(params.customHeaders || {}),
        },
      },
    };

    if (cleanBaseUrl) {
      // Clean base url for Google SDK: strip trailing /v1beta or /v1 so SDK doesn't double append
      clientOptions.httpOptions.baseUrl = cleanBaseUrl.replace(/\/v1(beta|alpha)?\/?$/i, '').replace(/\/+$/, '');
    }

    const isOfficialGeminiEndpoint = !cleanBaseUrl || cleanBaseUrl.includes('googleapis.com');
    const primaryModel = isOfficialGeminiEndpoint ? normalizeOfficialGeminiModel(targetModel) : targetModel;

    try {
      const genAiModule = await loadGoogleGenAi();
      const { GoogleGenAI, ThinkingLevel } = genAiModule as any;
      const aiClient = new GoogleGenAI(clientOptions);

      const runGeminiAttempt = async (modelToRun: string, omitThinkingConfig: boolean): Promise<AiCallDetailedResult> => {
        const generateOptions: any = {
          model: modelToRun,
          contents: params.prompt,
        };
        const modelConfig = buildGeminiConfigForModel(modelToRun, params, {
          ThinkingLevelEnum: ThinkingLevel,
          customParams: parsedCustom.params,
          omitThinkingConfig,
        });
        if (modelConfig) {
          generateOptions.config = modelConfig;
        }

        if (wantStream && typeof aiClient.models.generateContentStream === 'function') {
          const stream = await aiClient.models.generateContentStream(generateOptions);
          const accumulator = new StreamingReasoningAccumulator();
          let lastChunkSanitized: any = undefined;
          for await (const chunk of stream) {
            accumulator.pushGeminiChunk(chunk);
            if (params.includeSanitizedStructure) {
              lastChunkSanitized = sanitizeResponseStructure(chunk);
            }
          }
          const extracted = accumulator.finalize();
          return {
            text: extracted.text,
            thinkingProcess: extracted.thinkingProcess,
            reasoningAvailable: extracted.reasoningAvailable,
            reasoningSource: extracted.reasoningSource,
            detectedFields: extracted.detectedFields,
            streamingSupported: true,
            streamingUsed: true,
            hasThoughtSignatureOnly: extracted.hasThoughtSignatureOnly,
            rawStructureSanitized: lastChunkSanitized,
            usage: accumulator.usage,
            isRealTokens: accumulator.isRealTokens,
            modelUsed: modelToRun,
          };
        }

        const result = await aiClient.models.generateContent(generateOptions);
        const extracted = extractApiReasoning(result, 'google_native');
        const usageMeta = result?.usageMetadata;
        let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined = undefined;
        let isRealTokens = false;
        if (usageMeta && typeof usageMeta === 'object') {
          isRealTokens = true;
          usage = {
            promptTokens: typeof usageMeta.promptTokenCount === 'number' ? usageMeta.promptTokenCount : undefined,
            completionTokens: typeof usageMeta.candidatesTokenCount === 'number' ? usageMeta.candidatesTokenCount : undefined,
            totalTokens: typeof usageMeta.totalTokenCount === 'number' ? usageMeta.totalTokenCount : undefined,
          };
        }

        return {
          text: extracted.text,
          thinkingProcess: extracted.thinkingProcess,
          reasoningAvailable: extracted.reasoningAvailable,
          reasoningSource: extracted.reasoningSource,
          detectedFields: extracted.detectedFields,
          streamingSupported: false,
          streamingUsed: false,
          hasThoughtSignatureOnly: extracted.hasThoughtSignatureOnly,
          rawStructureSanitized: params.includeSanitizedStructure ? sanitizeResponseStructure(result) : undefined,
          usage,
          isRealTokens,
          modelUsed: modelToRun,
        };
      };

      const runWithAutoThinkingFallback = async (modelToRun: string): Promise<AiCallDetailedResult> => {
        try {
          return await runGeminiAttempt(modelToRun, false);
        } catch (attemptErr: any) {
          const msg = String(attemptErr?.message || attemptErr || '');
          const isAutoMode = !params.thinkingConfig || params.thinkingConfig.mode === 'auto';
          if (isAutoMode && isThinkingParamRejectionError(msg)) {
            return await runGeminiAttempt(modelToRun, true);
          }
          throw attemptErr;
        }
      };

      if (isOfficialGeminiEndpoint) {
        const now = Date.now();
        const orderedCandidates = Array.from(new Set([primaryModel, ...GEMINI_TEXT_FALLBACK_ORDER]));
        const activeCandidates = orderedCandidates.filter((m) => (geminiModelCooldownUntil.get(m) || 0) <= now);

        if (activeCandidates.length === 0) {
          const minWaitMs = Math.min(...orderedCandidates.map((m) => (geminiModelCooldownUntil.get(m) || now) - now));
          const waitMins = Math.max(1, Math.ceil(minWaitMs / 60_000));
          const cooldownErr: any = new Error(
            `[Gemini 429 配额保护] 当前所有可用 Gemini 模型配额已触及限制，将在约 ${waitMins} 分钟后自动恢复尝试；您也可以在系统设置中切换付费 API Key 或其他兼容 Provider。`
          );
          cooldownErr.statusCode = 429;
          cooldownErr.isQuotaExceeded = true;
          throw cooldownErr;
        }

        let lastErr: any = null;
        for (let idx = 0; idx < activeCandidates.length; idx++) {
          const candidateModel = activeCandidates[idx];
          try {
            const out = await runWithAutoThinkingFallback(candidateModel);
            if (idx > 0) {
              console.info(`[Gemini Fallback] ${primaryModel} 受限，已自动切换至 ${candidateModel}`);
            }
            return out;
          } catch (candidateErr: any) {
            lastErr = candidateErr;
            const msg = String(candidateErr?.message || candidateErr || '');
            if (isQuotaOrRateLimitError(msg)) {
              geminiModelCooldownUntil.set(candidateModel, Date.now() + parseRetryCooldownMs(msg));
              continue;
            }
            if (isModelUnavailableError(msg)) {
              geminiModelCooldownUntil.set(candidateModel, Date.now() + 60 * 60_000);
              continue;
            }
            throw candidateErr;
          }
        }

        throw lastErr || new Error('Gemini API 配额已用尽 (429 RESOURCE_EXHAUSTED)');
      } else {
        return await runWithAutoThinkingFallback(primaryModel);
      }
    } catch (geminiErr: any) {
      const errMsg = geminiErr.message || '';
      const durationMs = Date.now() - startTime;
      const causeCode = geminiErr.cause?.code || geminiErr.code;
      const causeErrno = geminiErr.cause?.errno;
      const causeSyscall = geminiErr.cause?.syscall;

      let err: any;
      if (errMsg.includes('401') || errMsg.includes('API_KEY_INVALID')) {
        err = new Error(`[Gemini 401 鉴权失败] Gemini API Key 无效: ${errMsg}`);
        err.statusCode = 401;
      } else if (errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
        err = new Error(`[Gemini 404 模型不存在] 模型 ${targetModel} 在此端点不可用: ${errMsg}`);
        err.statusCode = 404;
      } else if (
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('Quota exceeded') ||
        errMsg.includes('quota')
      ) {
        err = new Error(`[Gemini 429 配额用尽] API 额度超限或受限: ${errMsg}`);
        err.statusCode = 429;
        err.isQuotaExceeded = true;
      } else {
        err = geminiErr;
      }
      err.protocol = 'google_native';
      err.endpoint = cleanBaseUrl || 'https://generativelanguage.googleapis.com';
      err.durationMs = durationMs;
      err.upstreamRequestSent = true;
      err.mayHaveBeenCharged = durationMs > 10000 || errMsg.includes('fetch failed');
      err.causeCode = causeCode;
      err.causeErrno = causeErrno;
      err.causeSyscall = causeSyscall;
      throw err;
    }
  }

  throw new Error(`不支持的 API 协议: ${effectiveProtocol}`);
}

async function callAiService(params: AiCallParams): Promise<string> {
  const result = await callAiServiceDetailed(params);
  return result.text;
}

function handleAiEndpointError(res: express.Response, error: any, contextName: string) {
  const isQuota =
    error?.statusCode === 429 ||
    error?.isQuotaExceeded ||
    error?.message?.includes('429') ||
    error?.message?.includes('RESOURCE_EXHAUSTED') ||
    error?.message?.includes('Quota exceeded') ||
    error?.message?.includes('配额用尽') ||
    error?.message?.includes('quota');

  const httpStatus = isQuota
    ? 429
    : typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 502;
  const statusMsg = isQuota ? '429 配额超限/请求频率过高' : error?.message || `${contextName} 执行异常`;
  const endpointType =
    error?.protocol === 'openai_compatible'
      ? 'chat_completions'
      : error?.protocol === 'google_native'
      ? 'generate_content'
      : undefined;

  if (isQuota) {
    console.info(`[${contextName}] AI Provider 触发 429 配额保护: ${statusMsg}`);
    return res.status(429).json({
      success: false,
      statusCode: 429,
      isQuotaExceeded: true,
      error: error.message || 'API quota exceeded or rate limited',
      errorMessage: error.message || 'API quota exceeded or rate limited',
      errorType: error?.errorType || 'rate_limit',
      protocol: error?.protocol,
      causeCode: error?.causeCode,
      upstreamRequestSent: typeof error?.upstreamRequestSent === 'boolean' ? error.upstreamRequestSent : true,
      mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
      retryable: true,
      apiLog: buildApiLogObject({
        appName: contextName || 'AI接口',
        modelName: error?.model || GEMINI_DEFAULT_TEXT_MODEL,
        interfaceType: 'AiEndpoint',
        status: 'failed',
        httpStatus: 429,
        durationMs: error?.durationMs || 0,
        errorType: error?.errorType || 'rate_limit',
        error: statusMsg,
        purpose: `${contextName} (请求失败 429)`,
        protocol: error?.protocol,
        endpointType,
        errorName: error?.name,
        causeCode: error?.causeCode,
        causeErrno: error?.causeErrno,
        causeSyscall: error?.causeSyscall,
        headersReceived: error?.headersReceived,
        readBodyFailed: error?.readBodyFailed,
        mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
        upstreamRequestSent: typeof error?.upstreamRequestSent === 'boolean' ? error.upstreamRequestSent : true,
      }),
    });
  }

  console.error(`${contextName} error:`, error?.message || error);
  return res.status(httpStatus).json({
    success: false,
    statusCode: httpStatus,
    error: error?.message || `${contextName} failed`,
    errorMessage: error?.message || `${contextName} failed`,
    errorType: error?.errorType || (httpStatus === 401 ? 'auth_error' : 'upstream_error'),
    protocol: error?.protocol,
    causeCode: error?.causeCode,
    upstreamRequestSent: typeof error?.upstreamRequestSent === 'boolean' ? error.upstreamRequestSent : true,
    mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
    retryable: true,
    apiLog: buildApiLogObject({
      appName: contextName || 'AI接口',
      modelName: error?.model || GEMINI_DEFAULT_TEXT_MODEL,
      interfaceType: 'AiEndpoint',
      status: 'failed',
      httpStatus,
      durationMs: error?.durationMs || 0,
      errorType: error?.errorType || 'network_error',
      error: statusMsg,
      purpose: `${contextName} (请求失败 ${httpStatus})`,
      protocol: error?.protocol,
      endpointType,
      errorName: error?.name,
      causeCode: error?.causeCode,
      causeErrno: error?.causeErrno,
      causeSyscall: error?.causeSyscall,
      headersReceived: error?.headersReceived,
      readBodyFailed: error?.readBodyFailed,
      mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
      upstreamRequestSent: typeof error?.upstreamRequestSent === 'boolean' ? error.upstreamRequestSent : true,
    }),
  });
}

// =========================================================================
// 0.1 核心 Provider 系统端点：真实连接测试 (Real Connection Test)
// =========================================================================
app.post('/api/provider/test-connection', async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = 'text', customHeaders } = req.body;
  const startTime = Date.now();
  // Never fallback to process.env key when testing user settings
  const cleanKey = (apiKey && apiKey.trim()) || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';

  if (!cleanKey && providerType !== 'ollama') {
    return res.status(400).json({
      success: false,
      latencyMs: 0,
      providerType: providerType || 'custom',
      checkedEndpoint: cleanBaseUrl || '未填写',
      errorType: 'auth_error',
      message: '请先输入有效的 API Key',
      error: 'API Key 为空，无法发起鉴权请求。',
    });
  }

  const maskedKey = cleanKey.length > 8
    ? `${cleanKey.slice(0, 3)}****${cleanKey.slice(-4)}`
    : (cleanKey ? '****' : '(无密钥)');

  // 1. Google Gemini Connection Test (Official or Custom Reverse Proxy)
  if (providerType === 'google_gemini') {
    const isV1Path = cleanBaseUrl.includes('/v1') && !cleanBaseUrl.includes('v1beta');
    const testEndpoint = cleanBaseUrl
      ? (isV1Path
          ? (cleanBaseUrl.endsWith('/models') ? cleanBaseUrl : `${cleanBaseUrl}/models`)
          : (cleanBaseUrl.endsWith('/v1beta') ? `${cleanBaseUrl}/models?key=${cleanKey}` : `${cleanBaseUrl}/v1beta/models?key=${cleanKey}`))
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

    try {
      const resp = await fetch(testEndpoint, {
        method: 'GET',
        headers: {
          'User-Agent': 'aistudio-build-provider-test',
          'x-goog-api-key': cleanKey,
          'Authorization': `Bearer ${cleanKey}`,
          ...customHeaders,
        },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - startTime;

      if (!resp.ok) {
        // If 404 on custom reverse proxy, try probing generateContent directly
        if (cleanBaseUrl && (resp.status === 404 || resp.status === 405)) {
          const probeEndpoint = cleanBaseUrl.endsWith('/v1beta')
            ? `${cleanBaseUrl}/models/gemini-2.5-flash:generateContent?key=${cleanKey}`
            : `${cleanBaseUrl}/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`;
          try {
            const probeResp = await fetch(probeEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': cleanKey,
                'Authorization': `Bearer ${cleanKey}`,
                ...customHeaders,
              },
              body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
              signal: AbortSignal.timeout(10000),
            });
            if (probeResp.ok) {
              return res.json({
                success: true,
                latencyMs: Date.now() - startTime,
                statusCode: 200,
                statusText: 'OK',
                providerType: 'google_gemini',
                checkedEndpoint: probeEndpoint.replace(cleanKey, '***'),
                maskedKey,
                availableModelsCount: 1,
                message: `Google Gemini 自定义反代 API 连通成功！(generateContent 链路正常，耗时 ${Date.now() - startTime}ms)`,
              });
            }
          } catch {
            // keep standard error
          }
        }

        const errText = await resp.text();
        let errMsg = errText;
        try {
          const j = JSON.parse(errText);
          errMsg = j.error?.message || errText;
        } catch {}

        if (resp.status === 400 || resp.status === 403 || resp.status === 401) {
          return res.status(400).json({
            success: false,
            latencyMs,
            statusCode: resp.status,
            statusText: resp.statusText,
            providerType: 'google_gemini',
            checkedEndpoint: testEndpoint.replace(cleanKey, '***'),
            errorType: 'auth_error',
            maskedKey,
            message: cleanBaseUrl ? `反代 API Key 鉴权失败 (${resp.status})` : 'Gemini API Key 鉴权失败',
            error: errMsg,
          });
        }

        return res.status(resp.status).json({
          success: false,
          latencyMs,
          statusCode: resp.status,
          statusText: resp.statusText,
          providerType: 'google_gemini',
          checkedEndpoint: testEndpoint.replace(cleanKey, '***'),
          errorType: 'server_error',
          maskedKey,
          message: `Gemini 端点响应异常 (${resp.status})`,
          error: errMsg,
        });
      }

      const data = await resp.json();
      const modelsCount = Array.isArray(data.models) ? data.models.length : (Array.isArray(data.data) ? data.data.length : 0);

      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: 'OK',
        providerType: 'google_gemini',
        checkedEndpoint: testEndpoint.replace(cleanKey, '***'),
        maskedKey,
        availableModelsCount: modelsCount,
        message: `${cleanBaseUrl ? '自定义反代' : 'Google Gemini 官方'} API 连通成功！检测到 ${modelsCount} 个可用模型 (耗时 ${latencyMs}ms)`,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return res.status(500).json({
        success: false,
        latencyMs,
        providerType: 'google_gemini',
        checkedEndpoint: testEndpoint.replace(cleanKey, '***'),
        errorType: err.name === 'TimeoutError' ? 'timeout' : 'network_error',
        maskedKey,
        message: err.name === 'TimeoutError' ? '网络连接超时 (10秒)' : '网络连接失败，请检查网络或 Base URL',
        error: err.message,
      });
    }
  }

  // 2. OpenAI-Compatible Connection Test (GET /models or POST chat probe)
  let modelsEndpoint = cleanBaseUrl;
  if (!modelsEndpoint) modelsEndpoint = 'https://api.openai.com/v1';
  if (!modelsEndpoint.endsWith('/models')) {
    if (modelsEndpoint.endsWith('/v1')) {
      modelsEndpoint = `${modelsEndpoint}/models`;
    } else {
      modelsEndpoint = `${modelsEndpoint}/v1/models`;
    }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };
    if (cleanKey) {
      headers['Authorization'] = `Bearer ${cleanKey}`;
    }

    const resp = await fetch(modelsEndpoint, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(12000),
    });

    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      const data = await resp.json();
      const count = Array.isArray(data.data) ? data.data.length : Array.isArray(data) ? data.length : 0;

      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: 'OK',
        providerType: providerType || 'openai_compatible',
        checkedEndpoint: modelsEndpoint,
        maskedKey,
        availableModelsCount: count,
        message: `连接成功！已通过 /models 接口验证，服务端返回 ${count} 个模型 (耗时 ${latencyMs}ms)`,
      });
    }

    // If /models returned 404 or 405 (some reverse proxies or strict endpoints do not implement /models), fallback to a minimal chat completion ping
    if (resp.status === 404 || resp.status === 405) {
      let chatEndpoint = cleanBaseUrl;
      if (!chatEndpoint.endsWith('/chat/completions')) {
        chatEndpoint = chatEndpoint.endsWith('/v1') ? `${chatEndpoint}/chat/completions` : `${chatEndpoint}/v1/chat/completions`;
      }

      const pingResp = await fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const pingLatency = Date.now() - startTime;
      const pingText = await pingResp.text();

      if (pingResp.ok || pingResp.status === 400 || (pingResp.status !== 401 && pingResp.status !== 404)) {
        return res.json({
          success: true,
          latencyMs: pingLatency,
          statusCode: pingResp.status,
          statusText: pingResp.statusText,
          providerType: providerType || 'openai_compatible',
          checkedEndpoint: chatEndpoint,
          maskedKey,
          message: `连接成功！已验证 Chat Completions 端点连通 (耗时 ${pingLatency}ms，该 Provider 未开启 /models 列表)`,
        });
      }

      if (pingResp.status === 401) {
        return res.status(401).json({
          success: false,
          latencyMs: pingLatency,
          statusCode: 401,
          providerType: providerType || 'openai_compatible',
          checkedEndpoint: chatEndpoint,
          errorType: 'auth_error',
          maskedKey,
          message: 'API Key 鉴权失败 (401 Unauthorized)',
          error: '请检查输入的 API Key 是否有效。',
        });
      }
    }

    const errBody = await resp.text();
    let parsedErr = errBody;
    try {
      const j = JSON.parse(errBody);
      parsedErr = j.error?.message || errBody;
    } catch {}

    let errorType: any = 'unknown';
    let userMsg = `服务端响应错误 (${resp.status})`;
    if (resp.status === 401) {
      errorType = 'auth_error';
      userMsg = 'API Key 鉴权失败 (401 Unauthorized)';
    } else if (resp.status === 403) {
      errorType = 'auth_error';
      userMsg = '访问被拒绝 (403 Forbidden)，请检查权限或IP白名单';
    } else if (resp.status === 429) {
      errorType = 'rate_limit';
      userMsg = '触发限流或余额不足 (429 Too Many Requests)';
    } else if (resp.status === 404) {
      errorType = 'not_found';
      userMsg = `Base URL 路径错误 (404 Not Found)，未能找到目标接口`;
    }

    return res.status(resp.status).json({
      success: false,
      latencyMs,
      statusCode: resp.status,
      statusText: resp.statusText,
      providerType: providerType || 'openai_compatible',
      checkedEndpoint: modelsEndpoint,
      errorType,
      maskedKey,
      message: userMsg,
      error: parsedErr,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latencyMs,
      providerType: providerType || 'openai_compatible',
      checkedEndpoint: modelsEndpoint,
      errorType: err.name === 'TimeoutError' ? 'timeout' : 'network_error',
      maskedKey,
      message: err.name === 'TimeoutError' ? '网络连接超时 (12秒)' : '网络连接错误，无法访问目标 Base URL',
      error: err.message,
    });
  }
});

// =========================================================================
// 0.2 核心 Provider 系统端点：获取真实模型列表 (Fetch Real Models)
// =========================================================================
app.post('/api/provider/fetch-models', async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = 'text', customHeaders } = req.body;
  // Never fallback to process.env key when testing user settings
  const cleanKey = (apiKey && apiKey.trim()) || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';

  console.log('[API Key Log - Server fetch-models Auto-Probe Received]', {
    providerType,
    baseUrl: cleanBaseUrl,
    serviceType,
    keyIsEmpty: !cleanKey,
    keyLength: cleanKey ? cleanKey.length : 0,
    keyLast4: cleanKey ? cleanKey.slice(-4) : '',
  });

  if (!cleanKey && providerType !== 'ollama') {
    return res.status(400).json({
      success: false,
      supported: false,
      models: [],
      errorType: 'auth_error',
      message: '请先输入有效的 API Key 再获取模型列表。',
    });
  }

  const maskedKey = cleanKey ? (cleanKey.length > 4 ? `***${cleanKey.slice(-4)}` : '***') : '';
  const attemptsTrace: Array<{
    attemptIndex: number;
    adapterName: string;
    protocolKey: string;
    finalUrl: string;
    method: string;
    authMethod: string;
    timeoutMs: number;
    startTime: string;
    endTime: string;
    latencyMs: number;
    httpStatus?: number;
    success: boolean;
    modelsCount: number;
    error?: string;
  }> = [];

  const overallStartTime = Date.now();

  // =========================================================================
  // Candidate 1: OpenAI-Compatible Adapter (/v1/models)
  // =========================================================================
  {
    let urlCandidate = '';
    if (!cleanBaseUrl) {
      urlCandidate = 'https://api.openai.com/v1/models';
    } else if (cleanBaseUrl.endsWith('/v1')) {
      // Normalization: Prevent /v1/v1/models!
      urlCandidate = `${cleanBaseUrl}/models`;
    } else {
      urlCandidate = `${cleanBaseUrl}/v1/models`;
    }

    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = new Date().toISOString();
    const tStart = Date.now();

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'aistudio-build-models-fetch',
        'Content-Type': 'application/json',
        ...customHeaders,
      };
      if (cleanKey) {
        headers['Authorization'] = `Bearer ${cleanKey}`;
      }

      const resp = await fetch(urlCandidate, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const tEnd = Date.now();
      const endIso = new Date().toISOString();

      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data) ? data : []));

        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m: any) => {
            const id = String(typeof m === 'string' ? m : m.id || m.name || '');
            const cap = classifyModelCapabilities(id, typeof m === 'object' ? m : undefined);
            const legacyType: 'text' | 'image' | 'voice' =
              cap.primaryCategory === 'image_generation'
                ? 'image'
                : cap.primaryCategory === 'speech_generation' || cap.primaryCategory === 'speech_recognition'
                ? 'voice'
                : 'text';
            return {
              id,
              name: typeof m === 'object' && m.name ? m.name : id,
              type: legacyType,
              capabilityCategory: cap.primaryCategory,
              supportedCapabilities: cap.supportedCategories,
              capabilityHint: cap.capabilityHint,
              confidence: cap.confidence,
              owned_by: typeof m === 'object' ? m.owned_by || m.permission?.[0]?.organization || 'OpenAI-Proxy' : 'OpenAI-Proxy',
            };
          });

          attemptsTrace.push({
            attemptIndex: 1,
            adapterName: 'OpenAI-Compatible Adapter (/v1/models)',
            protocolKey: 'openai_compatible',
            finalUrl: maskedUrl,
            method: 'GET',
            authMethod: 'Authorization: Bearer ***',
            timeoutMs: 10000,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length,
          });

          return res.json({
            success: true,
            supported: true,
            apiProtocol: 'openai_compatible',
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `自动探测成功！匹配 OpenAI 兼容协议，成功获取 ${formatted.length} 个真实模型`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime,
          });
        }
      }

      const errText = await resp.text().catch(() => '');
      attemptsTrace.push({
        attemptIndex: 1,
        adapterName: 'OpenAI-Compatible Adapter (/v1/models)',
        protocolKey: 'openai_compatible',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'Authorization: Bearer ***',
        timeoutMs: 10000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || '未返回有效模型列表'}`,
      });
    } catch (err: any) {
      const tEnd = Date.now();
      const endIso = new Date().toISOString();
      attemptsTrace.push({
        attemptIndex: 1,
        adapterName: 'OpenAI-Compatible Adapter (/v1/models)',
        protocolKey: 'openai_compatible',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'Authorization: Bearer ***',
        timeoutMs: 10000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === 'AbortError' ? '请求超时 (10秒)' : (err.message || '网络连接异常'),
      });
    }
  }

  // =========================================================================
  // Candidate 2: Gemini Native Adapter (/v1beta/models)
  // =========================================================================
  {
    let urlCandidate = '';
    if (!cleanBaseUrl) {
      urlCandidate = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    } else if (cleanBaseUrl.includes('v1beta')) {
      urlCandidate = cleanBaseUrl.endsWith('/models') ? `${cleanBaseUrl}?key=${cleanKey}` : `${cleanBaseUrl}/models?key=${cleanKey}`;
    } else if (cleanBaseUrl.endsWith('/v1')) {
      urlCandidate = `${cleanBaseUrl}/models`;
    } else {
      urlCandidate = `${cleanBaseUrl}/v1beta/models?key=${cleanKey}`;
    }

    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = new Date().toISOString();
    const tStart = Date.now();

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'aistudio-build-models-fetch',
        'x-goog-api-key': cleanKey,
        'Authorization': `Bearer ${cleanKey}`,
        ...customHeaders,
      };

      const resp = await fetch(urlCandidate, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const tEnd = Date.now();
      const endIso = new Date().toISOString();

      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.models) ? data.models : (Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));

        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m: any) => {
            const id = (typeof m === 'string' ? m : m.id || m.name || '').replace(/^models\//, '');
            const cap = classifyModelCapabilities(id, typeof m === 'object' ? m : undefined);
            const legacyType: 'text' | 'image' | 'voice' =
              cap.primaryCategory === 'image_generation'
                ? 'image'
                : cap.primaryCategory === 'speech_generation' || cap.primaryCategory === 'speech_recognition'
                ? 'voice'
                : 'text';
            return {
              id,
              name: typeof m === 'object' && (m.displayName || m.name) ? (m.displayName || m.name) : id,
              description: typeof m === 'object' ? (m.description || '') : '',
              type: legacyType,
              capabilityCategory: cap.primaryCategory,
              supportedCapabilities: cap.supportedCategories,
              capabilityHint: cap.capabilityHint,
              confidence: cap.confidence,
              contextWindow: typeof m === 'object' ? m.inputTokenLimit : undefined,
              owned_by: typeof m === 'object' && m.owned_by ? m.owned_by : (cleanBaseUrl ? 'Gemini-Proxy' : 'Google'),
            };
          });

          attemptsTrace.push({
            attemptIndex: 2,
            adapterName: 'Gemini Native REST Adapter (/v1beta/models)',
            protocolKey: 'google_native',
            finalUrl: maskedUrl,
            method: 'GET',
            authMethod: 'QueryParam (?key=) & Headers',
            timeoutMs: 10000,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length,
          });

          return res.json({
            success: true,
            supported: true,
            apiProtocol: 'google_native',
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `自动探测成功！匹配 Google 原生协议，成功获取 ${formatted.length} 个真实模型`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime,
          });
        }
      }

      const errText = await resp.text().catch(() => '');
      attemptsTrace.push({
        attemptIndex: 2,
        adapterName: 'Gemini Native REST Adapter (/v1beta/models)',
        protocolKey: 'gemini_native',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'QueryParam (?key=) & Headers',
        timeoutMs: 10000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || '未返回有效模型列表'}`,
      });
    } catch (err: any) {
      const tEnd = Date.now();
      const endIso = new Date().toISOString();
      attemptsTrace.push({
        attemptIndex: 2,
        adapterName: 'Gemini Native REST Adapter (/v1beta/models)',
        protocolKey: 'gemini_native',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'QueryParam (?key=) & Headers',
        timeoutMs: 10000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === 'AbortError' ? '请求超时 (10秒)' : (err.message || '网络连接异常'),
      });
    }
  }

  // =========================================================================
  // Candidate 3: Direct Base Path Adapter (/models)
  // =========================================================================
  if (cleanBaseUrl && !cleanBaseUrl.endsWith('/v1') && !cleanBaseUrl.includes('v1beta')) {
    const urlCandidate = `${cleanBaseUrl}/models`;
    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = new Date().toISOString();
    const tStart = Date.now();

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'aistudio-build-models-fetch',
        'Content-Type': 'application/json',
        ...customHeaders,
      };
      if (cleanKey) {
        headers['Authorization'] = `Bearer ${cleanKey}`;
      }

      const resp = await fetch(urlCandidate, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });

      const tEnd = Date.now();
      const endIso = new Date().toISOString();

      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data) ? data : []));

        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m: any) => {
            const id = typeof m === 'string' ? m : m.id || m.name;
            return {
              id: String(id),
              name: typeof m === 'object' && m.name ? m.name : String(id),
              type: 'text',
              owned_by: 'Proxy-Direct',
            };
          });

          attemptsTrace.push({
            attemptIndex: 3,
            adapterName: 'Direct Endpoint Adapter (/models)',
            protocolKey: 'openai_compatible',
            finalUrl: maskedUrl,
            method: 'GET',
            authMethod: 'Authorization: Bearer ***',
            timeoutMs: 8000,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length,
          });

          return res.json({
            success: true,
            supported: true,
            apiProtocol: 'openai_compatible',
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `自动探测成功！匹配直连路径 /models，获取到 ${formatted.length} 个模型`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime,
          });
        }
      }

      const errText = await resp.text().catch(() => '');
      attemptsTrace.push({
        attemptIndex: 3,
        adapterName: 'Direct Endpoint Adapter (/models)',
        protocolKey: 'openai_compatible',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'Authorization: Bearer ***',
        timeoutMs: 8000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || '未返回有效模型列表'}`,
      });
    } catch (err: any) {
      const tEnd = Date.now();
      const endIso = new Date().toISOString();
      attemptsTrace.push({
        attemptIndex: 3,
        adapterName: 'Direct Endpoint Adapter (/models)',
        protocolKey: 'openai_compatible',
        finalUrl: maskedUrl,
        method: 'GET',
        authMethod: 'Authorization: Bearer ***',
        timeoutMs: 8000,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === 'AbortError' ? '请求超时 (8秒)' : (err.message || '网络连接异常'),
      });
    }
  }

  // All Auto-Probe attempts failed
  return res.status(500).json({
    success: false,
    supported: false,
    models: [],
    message: '自动接口协议探测失败：当前 Base URL 与 API Key 均无法通过 OpenAI 兼容或 Gemini 原生接口获取模型列表。请检查 Base URL 与 Key 是否正确，或尝试手动输入模型名称。',
    attemptsTrace,
    totalTimeMs: Date.now() - overallStartTime,
  });
});

// =========================================================================
// 0.3 核心 Provider 系统端点：测试指定模型 (Test Model Execution)
// =========================================================================
app.post('/api/provider/test-model', async (req, res) => {
  const { providerType, baseUrl, apiKey, model, apiProtocol, serviceType = 'text', testPrompt, customHeaders } = req.body;
  const startTime = Date.now();
  const prompt = testPrompt || '请仅回复一句话：模型链路测试正常，已准备就绪！';
  const resolvedCfg = resolveTextGenerationConfig({
    apiKey,
    baseUrl,
    model,
    providerType,
    apiProtocol,
    customHeaders,
    timeoutMs: 25000,
  });

  try {
    const detailed = await callAiServiceDetailed({
      prompt,
      model: resolvedCfg.model,
      apiKey: resolvedCfg.apiKey,
      baseUrl: resolvedCfg.baseUrl,
      providerType: resolvedCfg.providerType,
      apiProtocol: resolvedCfg.apiProtocol,
      temperature: 0.3,
      timeoutMs: resolvedCfg.timeoutMs,
      customHeaders: resolvedCfg.customHeaders,
    });

    const reply = detailed.text;
    const latencyMs = Date.now() - startTime;
    if (reply && reply.trim()) {
      return res.json({
        success: true,
        latencyMs,
        model: detailed.modelUsed || resolvedCfg.model,
        apiProtocol: resolvedCfg.apiProtocol,
        reply: reply.trim(),
        promptTokens: detailed.usage?.promptTokens ?? Math.round(prompt.length / 2),
        completionTokens: detailed.usage?.completionTokens ?? Math.round(reply.length / 2),
      });
    }

    return res.status(502).json({
      success: false,
      latencyMs,
      model: resolvedCfg.model,
      apiProtocol: resolvedCfg.apiProtocol,
      mayHaveBeenCharged: true,
      error: '模型已响应但返回空内容',
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(err?.statusCode || 502).json({
      success: false,
      latencyMs,
      model: resolvedCfg.model,
      apiProtocol: err?.protocol || resolvedCfg.apiProtocol,
      causeCode: err?.causeCode,
      mayHaveBeenCharged: Boolean(err?.mayHaveBeenCharged),
      error: err.message || '模型执行测试失败',
    });
  }
});

// =========================================================================
// 0.35 核心 Provider 系统端点：测试连接并检测思考输出 (Test Thinking Output)
// =========================================================================
app.post('/api/provider/test-thinking', async (req, res) => {
  const {
    providerType,
    baseUrl,
    apiKey,
    model,
    apiProtocol,
    customHeaders,
    thinkingConfig,
  } = req.body || {};

  const startTime = Date.now();
  const resolvedCfg = resolveTextGenerationConfig({
    apiKey,
    baseUrl,
    model,
    providerType,
    apiProtocol,
    customHeaders,
    thinkingConfig,
    timeoutMs: 30000,
  });

  if (resolvedCfg.thinkingConfig?.mode === 'custom') {
    const check = parseCustomThinkingParamsJson(resolvedCfg.thinkingConfig.customParamsJson);
    if (!check.ok) {
      return res.status(400).json({
        success: false,
        connectionOk: false,
        answerOk: false,
        reasoningAvailable: false,
        reasoningSource: 'none',
        detectedFields: [],
        streamingSupported: false,
        nonStreamingSupported: false,
        reasoningCharCount: 0,
        answerCharCount: 0,
        latencyMs: Date.now() - startTime,
        model: resolvedCfg.model,
        apiProtocol: resolvedCfg.apiProtocol,
        error: check.error || '自定义思考参数 JSON 格式无效',
      });
    }
  }

  const probePrompt = '请直接计算并简洁回答：17 × 23 等于多少？';
  let nonStreamRes: AiCallDetailedResult | null = null;
  let streamRes: AiCallDetailedResult | null = null;
  let nonStreamErr: string | undefined;
  let streamErr: string | undefined;

  try {
    nonStreamRes = await callAiServiceDetailed({
      prompt: probePrompt,
      model: resolvedCfg.model,
      apiKey: resolvedCfg.apiKey,
      baseUrl: resolvedCfg.baseUrl,
      providerType: resolvedCfg.providerType,
      apiProtocol: resolvedCfg.apiProtocol,
      customHeaders: resolvedCfg.customHeaders,
      thinkingConfig: resolvedCfg.thinkingConfig,
      stream: false,
      allowStreamFallback: false,
      includeSanitizedStructure: true,
      timeoutMs: 25000,
    });
  } catch (err: any) {
    nonStreamErr = err?.message || '非流式请求失败';
  }

  // Only probe streaming if non-streaming didn't fail on missing config / 401 auth
  const authOrConfigBlocked =
    nonStreamErr && (nonStreamErr.includes('CONFIG_MISSING') || nonStreamErr.includes('401') || nonStreamErr.includes('无效') || nonStreamErr.includes('未配置'));

  if (!authOrConfigBlocked) {
    try {
      streamRes = await callAiServiceDetailed({
        prompt: probePrompt,
        model: resolvedCfg.model,
        apiKey: resolvedCfg.apiKey,
        baseUrl: resolvedCfg.baseUrl,
        providerType: resolvedCfg.providerType,
        apiProtocol: resolvedCfg.apiProtocol,
        customHeaders: resolvedCfg.customHeaders,
        thinkingConfig: resolvedCfg.thinkingConfig,
        stream: true,
        allowStreamFallback: false,
        includeSanitizedStructure: true,
        timeoutMs: 25000,
      });
    } catch (err: any) {
      streamErr = err?.message || '流式请求失败';
    }
  }

  const latencyMs = Date.now() - startTime;
  const nonStreamingSupported = Boolean(nonStreamRes && (nonStreamRes.text.trim() || nonStreamRes.reasoningAvailable));
  const streamingSupported = Boolean(streamRes && streamRes.streamingUsed && (streamRes.text.trim() || streamRes.reasoningAvailable));

  if (!nonStreamRes && !streamRes) {
    return res.status(502).json({
      success: false,
      connectionOk: false,
      answerOk: false,
      reasoningAvailable: false,
      reasoningSource: 'none',
      detectedFields: [],
      streamingSupported: false,
      nonStreamingSupported: false,
      reasoningCharCount: 0,
      answerCharCount: 0,
      latencyMs,
      model: resolvedCfg.model,
      apiProtocol: resolvedCfg.apiProtocol,
      error: nonStreamErr || streamErr || '连接测试失败',
    });
  }

  const preferred =
    resolvedCfg.thinkingConfig?.useStreaming && streamRes
      ? streamRes
      : (streamRes?.reasoningAvailable && !nonStreamRes?.reasoningAvailable ? streamRes : nonStreamRes || streamRes)!;

  const combinedFields = Array.from(
    new Set([
      ...(nonStreamRes?.detectedFields || []),
      ...(streamRes?.detectedFields || []),
    ])
  );

  const answerText = (preferred.text || nonStreamRes?.text || streamRes?.text || '').trim();
  const reasoningText = (preferred.thinkingProcess || streamRes?.thinkingProcess || nonStreamRes?.thinkingProcess || '').trim();
  const reasoningAvailable = reasoningText.length > 0;
  const likelyUpstreamStripped = !reasoningAvailable && answerText.length > 0;

  return res.json({
    success: true,
    connectionOk: true,
    answerOk: answerText.length > 0,
    reasoningAvailable,
    reasoningSource: preferred.reasoningSource || 'none',
    detectedFields: combinedFields,
    streamingSupported,
    nonStreamingSupported,
    streamingReasoningAvailable: Boolean(streamRes?.reasoningAvailable),
    nonStreamingReasoningAvailable: Boolean(nonStreamRes?.reasoningAvailable),
    reasoningCharCount: reasoningText.length,
    answerCharCount: answerText.length,
    reasoningPreview: reasoningAvailable ? reasoningText.slice(0, 400) : '',
    answerPreview: answerText.slice(0, 200),
    latencyMs,
    model: preferred.modelUsed || resolvedCfg.model,
    apiProtocol: resolvedCfg.apiProtocol,
    hasThoughtSignatureOnly: Boolean(preferred.hasThoughtSignatureOnly),
    likelyUpstreamStripped,
    noticeMessage: likelyUpstreamStripped
      ? '当前接口只返回最终答案，小手机无法恢复被上游删除的思考内容。请更换支持reasoning透传的模型或API站，或查询站点所需的思考参数。'
      : undefined,
    sanitizedResponseStructure: preferred.rawStructureSanitized || nonStreamRes?.rawStructureSanitized || streamRes?.rawStructureSanitized,
  });
});

// 兼容老版本的 /api/test-api 接口
app.post('/api/test-api', async (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  const startTime = Date.now();
  const cleanKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';
  const targetModel = model || 'gemini-4-hydrogen';

  if (!cleanKey) {
    return res.status(400).json({
      success: false,
      latency: 0,
      errorType: 'missing_key',
      error: '未检测到 API Key。请在设置中配置有效密钥。',
    });
  }

  try {
    const reply = await callAiService({
      prompt: '请仅回复一句话：恭喜！API 与模型反向代理网络已连通，链路与权限正常。',
      apiKey: cleanKey,
      baseUrl: cleanBaseUrl,
      model: targetModel,
    });

    const latency = Date.now() - startTime;
    return res.json({
      success: true,
      latency,
      model: targetModel,
      baseUrl: cleanBaseUrl || '官方默认端点',
      message: reply.trim(),
    });
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latency,
      error: error.message || 'API 连接测试失败',
    });
  }
});

// 0.04 Real Reverse Geocoding Endpoint (Converts Latitude & Longitude to Real City & District)
app.get('/api/weather/reverse-geocode', async (req, res) => {
  try {
    const latStr = req.query.lat as string;
    const lonStr = req.query.lon as string;
    if (!latStr || !lonStr) {
      return res.status(400).json({ success: false, error: '缺少经纬度参数 (lat, lon)' });
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ success: false, error: '无效的经纬度格式' });
    }

    // 1. Use OpenStreetMap Nominatim reverse geocode (Server-side friendly, supports Chinese locality names)
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`;
      const osmResp = await fetch(osmUrl, {
        headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0 (weather-app)' },
        signal: AbortSignal.timeout(5500),
      });
      if (osmResp.ok) {
        const osmData = await osmResp.json();
        const addr = osmData.address || {};
        const city = addr.city || addr.town || addr.county || addr.district || addr.state || '当前位置';
        const district = addr.suburb || addr.district || addr.neighbourhood || '';
        const province = addr.state || '';
        const country = addr.country || '中国';

        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);

        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayParts.join(' ') || osmData.display_name || `${country} ${province} ${city}`,
          source: 'OpenStreetMap',
        });
      }
    } catch (e) {
      console.warn('OSM reverse geocode error:', e);
    }

    // 2. Try Open-Meteo / BigDataCloud fallback if OSM failed
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
      const bdcResp = await fetch(bdcUrl, { signal: AbortSignal.timeout(4000) });
      if (bdcResp.ok) {
        const bdcData = await bdcResp.json();
        const city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || '当前位置';
        const district = bdcData.locality || '';
        const province = bdcData.principalSubdivision || '';
        const country = bdcData.countryName || '中国';
        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);
        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayParts.join(' ') || city,
          source: 'BigDataCloud',
        });
      }
    } catch {}

    // 3. Fallback coordinates representation
    return res.json({
      success: true,
      latitude: lat,
      longitude: lon,
      city: `经纬度 (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      district: '',
      province: '',
      country: '',
      displayName: `GPS 定位点 (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
      source: 'CoordinateFallback',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || '逆地理编码异常' });
  }
});

// 0.05 City Search & Geocoding Endpoint (Supports Big Cities, Small Cities, Counties, Districts Worldwide)
app.get('/api/weather/search-city', async (req, res) => {
  try {
    const query = (req.query.query as string)?.trim();
    if (!query || query.length < 1) {
      return res.json({ success: true, results: [] });
    }

    // 1. Fetch real global multi-level geocoding from Open-Meteo Geocoding API
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=zh&format=json`;
    let apiResults: any[] = [];
    try {
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(7000) });
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        if (geoJson.results && Array.isArray(geoJson.results)) {
          apiResults = geoJson.results.map((r: any) => {
            const admin = [r.admin1, r.admin2, r.admin3].filter(Boolean).join(' ');
            return {
              id: `${r.id || r.latitude}_${r.longitude}`,
              name: r.name,
              country: r.country || '',
              admin1: r.admin1 || '',
              admin2: r.admin2 || '',
              latitude: r.latitude,
              longitude: r.longitude,
              elevation: r.elevation,
              timezone: r.timezone,
              displayName: [r.country, admin, r.name].filter(Boolean).join(' · '),
            };
          });
        }
      }
    } catch (fetchErr) {
      console.warn('Open-Meteo Geocoding fetch error:', fetchErr);
    }

    // 2. Also search OpenStreetMap Nominatim for small districts/counties in China
    if (apiResults.length < 5) {
      try {
        const osmSearchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&accept-language=zh&limit=10`;
        const osmRes = await fetch(osmSearchUrl, {
          headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (osmRes.ok) {
          const osmList = await osmRes.json();
          if (Array.isArray(osmList)) {
            osmList.forEach((item: any) => {
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              const exists = apiResults.some(
                (c) => Math.abs(c.latitude - lat) < 0.05 && Math.abs(c.longitude - lon) < 0.05
              );
              if (!exists) {
                apiResults.push({
                  id: `osm_${item.place_id || lat}`,
                  name: item.name || query,
                  country: item.display_name.includes('中国') ? '中国' : '',
                  admin1: '',
                  admin2: '',
                  latitude: lat,
                  longitude: lon,
                  displayName: item.display_name,
                });
              }
            });
          }
        }
      } catch (osmErr) {
        console.warn('OSM search fallback error:', osmErr);
      }
    }

    res.json({ success: true, results: apiResults.slice(0, 20) });
  } catch (err: any) {
    console.error('City search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// Weather Service Engine & Open-Meteo Integration
// ----------------------------------------------------
function mapWmoWeatherCode(code: number): { condition: string; icon: string } {
  switch (code) {
    case 0:
      return { condition: '晴', icon: 'Sun' };
    case 1:
      return { condition: '晴间多云', icon: 'SunMedium' };
    case 2:
      return { condition: '多云', icon: 'CloudSun' };
    case 3:
      return { condition: '阴', icon: 'Cloud' };
    case 45:
    case 48:
      return { condition: '大雾', icon: 'CloudFog' };
    case 51:
      return { condition: '小毛毛雨', icon: 'CloudDrizzle' };
    case 53:
      return { condition: '毛毛雨', icon: 'CloudDrizzle' };
    case 55:
      return { condition: '密毛毛雨', icon: 'CloudDrizzle' };
    case 56:
    case 57:
      return { condition: '冻毛毛雨', icon: 'CloudDrizzle' };
    case 61:
      return { condition: '小雨', icon: 'CloudRain' };
    case 63:
      return { condition: '中雨', icon: 'CloudRain' };
    case 65:
      return { condition: '大雨', icon: 'CloudRainWind' };
    case 66:
    case 67:
      return { condition: '冻雨', icon: 'CloudRain' };
    case 71:
      return { condition: '小雪', icon: 'Snowflake' };
    case 73:
      return { condition: '中雪', icon: 'Snowflake' };
    case 75:
      return { condition: '大雪', icon: 'Snowflake' };
    case 77:
      return { condition: '雪粒', icon: 'Snowflake' };
    case 80:
      return { condition: '阵雨', icon: 'CloudRain' };
    case 81:
      return { condition: '中度阵雨', icon: 'CloudRainWind' };
    case 82:
      return { condition: '强暴雨', icon: 'CloudRainWind' };
    case 85:
    case 86:
      return { condition: '阵雪', icon: 'Snowflake' };
    case 95:
      return { condition: '雷阵雨', icon: 'CloudLightning' };
    case 96:
    case 99:
      return { condition: '强雷暴伴冰雹', icon: 'CloudLightning' };
    default:
      return { condition: '多云', icon: 'CloudSun' };
  }
}

function getWindDirectionText(degrees: number): string {
  if (degrees >= 337.5 || degrees < 22.5) return '北风';
  if (degrees >= 22.5 && degrees < 67.5) return '东北风';
  if (degrees >= 67.5 && degrees < 112.5) return '东风';
  if (degrees >= 112.5 && degrees < 157.5) return '东南风';
  if (degrees >= 157.5 && degrees < 202.5) return '南风';
  if (degrees >= 202.5 && degrees < 247.5) return '西南风';
  if (degrees >= 247.5 && degrees < 292.5) return '西风';
  if (degrees >= 292.5 && degrees < 337.5) return '西北风';
  return '微风';
}

function getWindScaleText(speedKmH: number): string {
  if (speedKmH < 5) return '1级';
  if (speedKmH < 11) return '2级';
  if (speedKmH < 19) return '3级';
  if (speedKmH < 28) return '4级';
  if (speedKmH < 38) return '5级';
  if (speedKmH < 49) return '6级';
  if (speedKmH < 61) return '7级 (大风)';
  if (speedKmH < 74) return '8级 (大风)';
  return '9级以上 (狂风)';
}

// Multi-provider live weather cache & Open-Meteo reachability circuit-breaker
const weatherServerCache = new Map<string, { weather: any; fetchedAt: number }>();
let openMeteoBlockedUntil = 0;

async function firstNonNull<T>(promises: Promise<T | null>[]): Promise<T | null> {
  if (promises.length === 0) return null;
  return new Promise((resolve) => {
    let remaining = promises.length;
    let settled = false;
    for (const p of promises) {
      p.then((val) => {
        if (!settled && val !== null && val !== undefined) {
          settled = true;
          resolve(val);
        } else {
          remaining -= 1;
          if (!settled && remaining <= 0) {
            settled = true;
            resolve(null);
          }
        }
      }).catch(() => {
        remaining -= 1;
        if (!settled && remaining <= 0) {
          settled = true;
          resolve(null);
        }
      });
    }
  });
}

function mapMetSymbolToWmoCode(symbolCode: string = ''): number {
  const s = symbolCode.toLowerCase();
  if (s.includes('thunder')) return 95;
  if (s.includes('heavyrain')) return 65;
  if (s.includes('rainshowers')) return 80;
  if (s.includes('lightrain')) return 61;
  if (s.includes('rain')) return 63;
  if (s.includes('sleet')) return 66;
  if (s.includes('heavysnow')) return 75;
  if (s.includes('snowshowers')) return 85;
  if (s.includes('lightsnow') || s.includes('snow')) return 71;
  if (s.includes('fog')) return 45;
  if (s.includes('clearsky')) return 0;
  if (s.includes('fair')) return 1;
  if (s.includes('partlycloudy')) return 2;
  if (s.includes('cloudy')) return 3;
  return 2;
}

function mapWttrCodeToWmoCode(wttrCodeRaw: string | number): number {
  const code = Number(wttrCodeRaw);
  switch (code) {
    case 113:
      return 0;
    case 116:
      return 2;
    case 119:
    case 122:
      return 3;
    case 143:
    case 248:
    case 260:
      return 45;
    case 176:
    case 263:
    case 266:
    case 293:
    case 296:
    case 353:
      return 61;
    case 299:
    case 302:
    case 356:
      return 63;
    case 305:
    case 308:
    case 359:
      return 65;
    case 179:
    case 182:
    case 185:
    case 281:
    case 284:
    case 311:
    case 314:
    case 317:
    case 320:
    case 362:
    case 365:
      return 66;
    case 227:
    case 323:
    case 326:
    case 368:
      return 71;
    case 230:
    case 329:
    case 332:
    case 335:
    case 338:
    case 371:
      return 75;
    case 200:
    case 386:
    case 389:
    case 392:
    case 395:
      return 95;
    default:
      return 2;
  }
}

function computeApparentTemp(tempC: number, humidityPct: number, windKmH: number): number {
  const windMs = Math.max(0, windKmH / 3.6);
  const vaporPressure = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return Math.round(tempC + 0.33 * vaporPressure - 0.7 * windMs - 4.0);
}

function buildWeatherMetaAndAlerts(params: {
  currentCode: number;
  curTemp: number;
  todayMax: number;
  todayMin: number;
  windSpeed: number;
  currentPrecip: number;
  hourlyList: any[];
  aqiData: any;
}) {
  const { currentCode, curTemp, todayMax, todayMin, windSpeed, currentPrecip, hourlyList, aqiData } = params;

  let rainForecastSummary = '未来几小时无明显降水，适宜外出';
  const upcomingRainHour = hourlyList.slice(0, 6).find((h) => h.precipProbability >= 60 || h.precipitation >= 0.5);
  if (upcomingRainHour) {
    rainForecastSummary = `预计 ${upcomingRainHour.time} 开始降水，降水概率 ${upcomingRainHour.precipProbability}%`;
  } else {
    const moderateRainHour = hourlyList.slice(0, 6).find((h) => h.precipProbability >= 35);
    if (moderateRainHour) {
      rainForecastSummary = `未来数小时有 ${moderateRainHour.precipProbability}% 阵雨可能，出门备把伞更安心`;
    }
  }

  const alerts: any[] = [];
  if (todayMax >= 37 || curTemp >= 37) {
    alerts.push({
      id: 'alert_heat_orange',
      title: '高温橙色预警',
      level: 'orange',
      levelText: '橙色预警',
      description: `预计最高气温将升至 ${todayMax}°C，请尽量减少午后室外作业与烈日暴晒，多补充电解质水分。`,
      pubTime: '气象预警中心',
    });
  } else if (todayMax >= 35 || curTemp >= 35) {
    alerts.push({
      id: 'alert_heat_yellow',
      title: '高温黄色预警',
      level: 'yellow',
      levelText: '黄色预警',
      description: `今日最高气温可达 ${todayMax}°C，天气炎热，请注意做好防晒与降温防暑措施。`,
      pubTime: '气象预警中心',
    });
  }

  if (todayMin <= 0 || curTemp <= 0) {
    alerts.push({
      id: 'alert_cold_blue',
      title: '低温道路结冰预警',
      level: 'blue',
      levelText: '蓝色预警',
      description: `当前气温较低 (${curTemp}°C)，路面及桥梁易出现湿滑结冰，早晚出行请注意防风保暖与交通安全。`,
      pubTime: '气象预警中心',
    });
  }

  if ([95, 96, 99].includes(currentCode) || hourlyList.slice(0, 4).some((h) => [95, 96, 99].includes(h.conditionCode))) {
    alerts.push({
      id: 'alert_thunder_yellow',
      title: '雷电与强对流预警',
      level: 'yellow',
      levelText: '黄色预警',
      description: '受局地对流云团影响，可能出现雷暴大风与短时强降水，户外请切勿在树下或开阔地逗留。',
      pubTime: '气象预警中心',
    });
  }

  if (windSpeed >= 35) {
    alerts.push({
      id: 'alert_wind_blue',
      title: '大风蓝色预警',
      level: 'blue',
      levelText: '蓝色预警',
      description: `当前最大阵风可达 ${windSpeed} km/h (${getWindScaleText(windSpeed)})，请注意关好门窗，收起阳台易坠物品。`,
      pubTime: '气象预警中心',
    });
  }

  if (currentPrecip >= 20 || hourlyList.slice(0, 4).some((h) => h.precipitation >= 15)) {
    alerts.push({
      id: 'alert_rain_orange',
      title: '暴雨橙色预警',
      level: 'orange',
      levelText: '橙色预警',
      description: '累积雨量已达暴雨级别，低洼路段易出现积水，行车注意减速慢行。',
      pubTime: '气象预警中心',
    });
  }

  let airQuality: any = undefined;
  if (aqiData && aqiData.current) {
    const curAqi = aqiData.current;
    const usAqi = curAqi.us_aqi !== undefined ? Math.round(curAqi.us_aqi) : undefined;
    const europeanAqi = curAqi.european_aqi !== undefined ? Math.round(curAqi.european_aqi) : undefined;
    const pm25 = curAqi.pm2_5 !== undefined ? Math.round(curAqi.pm2_5) : undefined;
    const pm10 = curAqi.pm10 !== undefined ? Math.round(curAqi.pm10) : undefined;

    const effectiveAqi = usAqi !== undefined ? usAqi : pm25 !== undefined ? Math.round(pm25 * 1.5) : europeanAqi;
    if (effectiveAqi !== undefined) {
      const aqiLabel =
        effectiveAqi <= 50 ? '优' : effectiveAqi <= 100 ? '良' : effectiveAqi <= 150 ? '轻度污染' : effectiveAqi <= 200 ? '中度污染' : '重度污染';
      airQuality = {
        aqi: effectiveAqi,
        label: aqiLabel,
        pm25,
        pm10,
      };
    }
  }

  return { rainForecastSummary, alerts, airQuality };
}

function buildWeatherFromMetNorway(params: {
  metData: any;
  lat: number;
  lon: number;
  city: string;
  isAuto: boolean;
  aqiData: any;
  reqStart: number;
}) {
  const { metData, lat, lon, city, isAuto, aqiData, reqStart } = params;
  const timeseries: any[] = metData?.properties?.timeseries || [];
  if (timeseries.length === 0) return null;

  const utcOffsetHours = Math.round(lon / 15);
  const utcOffsetMs = utcOffsetHours * 3600 * 1000;
  const formatLocal = (isoStr: string) => {
    const d = new Date(new Date(isoStr).getTime() + utcOffsetMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}`, hour: d.getUTCHours(), ts: new Date(isoStr).getTime() };
  };

  const first = timeseries[0];
  const curInstant = first.data?.instant?.details || {};
  const curSymbol =
    first.data?.next_1_hours?.summary?.symbol_code ||
    first.data?.next_6_hours?.summary?.symbol_code ||
    first.data?.next_12_hours?.summary?.symbol_code ||
    'partlycloudy';
  const currentCode = mapMetSymbolToWmoCode(curSymbol);
  const { condition } = mapWmoWeatherCode(currentCode);
  const curTemp = Math.round(curInstant.air_temperature ?? 22);
  const curHumidity = Math.round(curInstant.relative_humidity ?? 60);
  const windSpeed = Math.round((curInstant.wind_speed ?? 2) * 3.6);
  const windDir = `${getWindDirectionText(curInstant.wind_from_direction ?? 0)} ${getWindScaleText(windSpeed)}`;
  const currentPrecip = Number((first.data?.next_1_hours?.details?.precipitation_amount ?? 0).toFixed(1));
  const feelsLike = computeApparentTemp(curTemp, curHumidity, windSpeed);

  const hourlyList: any[] = [];
  for (let i = 0; i < Math.min(24, timeseries.length); i++) {
    const item = timeseries[i];
    const inst = item.data?.instant?.details || {};
    const sym =
      item.data?.next_1_hours?.summary?.symbol_code ||
      item.data?.next_6_hours?.summary?.symbol_code ||
      'partlycloudy';
    const hCode = mapMetSymbolToWmoCode(sym);
    const hCond = mapWmoWeatherCode(hCode);
    const hPrecip = Number((item.data?.next_1_hours?.details?.precipitation_amount ?? 0).toFixed(1));
    const hTemp = Math.round(inst.air_temperature ?? curTemp);
    const hHum = Math.round(inst.relative_humidity ?? curHumidity);
    const hWind = Math.round((inst.wind_speed ?? 2) * 3.6);
    const prob =
      hPrecip >= 2 ? 85 : hPrecip >= 0.3 ? 65 : hPrecip > 0 ? 45 : sym.includes('rain') || sym.includes('snow') || sym.includes('thunder') ? 40 : 10;
    const loc = formatLocal(item.time);

    hourlyList.push({
      time: i === 0 ? '现在' : loc.time,
      timestamp: loc.ts,
      temp: hTemp,
      feelsLike: computeApparentTemp(hTemp, hHum, hWind),
      condition: hCond.condition,
      conditionCode: hCode,
      precipProbability: prob,
      precipitation: hPrecip,
      windSpeed: hWind,
    });
  }

  // Group timeseries into daily forecasts
  const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dayBuckets = new Map<string, { temps: number[]; codes: number[]; probs: number[] }>();
  for (const item of timeseries) {
    const loc = formatLocal(item.time);
    const t = item.data?.instant?.details?.air_temperature;
    if (typeof t !== 'number') continue;
    const sym =
      item.data?.next_6_hours?.summary?.symbol_code ||
      item.data?.next_1_hours?.summary?.symbol_code ||
      item.data?.next_12_hours?.summary?.symbol_code ||
      'partlycloudy';
    const c = mapMetSymbolToWmoCode(sym);
    const pAmt = item.data?.next_6_hours?.details?.precipitation_amount ?? item.data?.next_1_hours?.details?.precipitation_amount ?? 0;
    const pProb = pAmt >= 2 ? 85 : pAmt > 0.2 ? 60 : sym.includes('rain') || sym.includes('snow') || sym.includes('thunder') ? 45 : 10;

    if (!dayBuckets.has(loc.date)) {
      dayBuckets.set(loc.date, { temps: [], codes: [], probs: [] });
    }
    const bucket = dayBuckets.get(loc.date)!;
    bucket.temps.push(t);
    if (loc.hour >= 9 && loc.hour <= 18) {
      bucket.codes.push(c);
    }
    bucket.probs.push(pProb);
  }

  const dailyList: any[] = [];
  let idx = 0;
  for (const [dateStr, bucket] of dayBuckets.entries()) {
    if (idx >= 7) break;
    const parts = dateStr.split('-').map(Number);
    const localDateObj = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const dayLabel = idx === 0 ? '今天' : idx === 1 ? '明天' : daysOfWeek[localDateObj.getDay()];
    const dCode = bucket.codes.length > 0 ? bucket.codes[Math.floor(bucket.codes.length / 2)] : currentCode;
    const dCond = mapWmoWeatherCode(dCode);
    dailyList.push({
      date: dateStr,
      dayOfWeek: dayLabel,
      tempMin: Math.round(Math.min(...bucket.temps)),
      tempMax: Math.round(Math.max(...bucket.temps)),
      condition: dCond.condition,
      conditionCode: dCode,
      precipProbability: Math.max(...bucket.probs, 0),
    });
    idx++;
  }

  const todayMax = dailyList[0]?.tempMax ?? curTemp;
  const todayMin = dailyList[0]?.tempMin ?? curTemp;
  const { rainForecastSummary, alerts, airQuality } = buildWeatherMetaAndAlerts({
    currentCode,
    curTemp,
    todayMax,
    todayMin,
    windSpeed,
    currentPrecip,
    hourlyList,
    aqiData,
  });

  return {
    city: city || '当前位置',
    country: '',
    latitude: lat,
    longitude: lon,
    temp: curTemp,
    feelsLike,
    tempMin: todayMin,
    tempMax: todayMax,
    condition,
    conditionCode: currentCode,
    humidity: curHumidity,
    windSpeed,
    windDirection: windDir,
    precipProbability: hourlyList[0]?.precipProbability ?? 0,
    precipitation: currentPrecip,
    uvIndex: 3.5,
    airQuality,
    hourly: hourlyList,
    daily: dailyList,
    alerts,
    updatedAt: Date.now(),
    isAutoLocation: isAuto,
    rainForecastSummary,
    dataSourceInfo: {
      serviceName: 'MET Norway (Yr.no) 全球高精气象预报',
      geocodingService: 'Open-Meteo & OpenStreetMap Nominatim 逆地理编码',
      airQualityService: aqiData ? 'Open-Meteo 欧洲哥白尼大气监测服务 (CAMS)' : '暂未提供',
      requestTimestamp: reqStart,
      responseTimestamp: Date.now(),
      networkLatencyMs: Date.now() - reqStart,
      isFromCache: false,
      timezone: `UTC${utcOffsetHours >= 0 ? '+' : ''}${utcOffsetHours}`,
      coordinates: { latitude: lat, longitude: lon },
    },
  };
}

function buildWeatherFromWttr(params: {
  wttrData: any;
  lat: number;
  lon: number;
  city: string;
  isAuto: boolean;
  aqiData: any;
  reqStart: number;
}) {
  const { wttrData, lat, lon, city, isAuto, aqiData, reqStart } = params;
  const cur = wttrData?.current_condition?.[0];
  const days: any[] = wttrData?.weather || [];
  if (!cur) return null;

  const currentCode = mapWttrCodeToWmoCode(cur.weatherCode);
  const { condition } = mapWmoWeatherCode(currentCode);
  const curTemp = Math.round(Number(cur.temp_C ?? 22));
  const feelsLike = Math.round(Number(cur.FeelsLikeC ?? curTemp));
  const curHumidity = Math.round(Number(cur.humidity ?? 60));
  const windSpeed = Math.round(Number(cur.windspeedKmph ?? 8));
  const windDir = `${getWindDirectionText(Number(cur.winddirDegree ?? 0))} ${getWindScaleText(windSpeed)}`;
  const currentPrecip = Number(cur.precipMM ?? 0);
  const uvIndex = Number(cur.uvIndex ?? 3);

  const hourlyList: any[] = [];
  const todayHourly = days[0]?.hourly || [];
  const nowHour = new Date().getHours();
  for (let i = 0; i < todayHourly.length; i++) {
    const h = todayHourly[i];
    const hNum = Math.floor(Number(h.time || 0) / 100);
    if (hNum + 3 < nowHour && i < todayHourly.length - 1) continue;
    const hCode = mapWttrCodeToWmoCode(h.weatherCode);
    const hCond = mapWmoWeatherCode(hCode);
    hourlyList.push({
      time: hourlyList.length === 0 ? '现在' : `${String(hNum).padStart(2, '0')}:00`,
      timestamp: Date.now() + hourlyList.length * 3 * 3600 * 1000,
      temp: Math.round(Number(h.tempC ?? curTemp)),
      feelsLike: Math.round(Number(h.FeelsLikeC ?? feelsLike)),
      condition: hCond.condition,
      conditionCode: hCode,
      precipProbability: Math.round(Number(h.chanceofrain ?? 0)),
      precipitation: Number(h.precipMM ?? 0),
      windSpeed: Math.round(Number(h.windspeedKmph ?? windSpeed)),
    });
  }

  const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dailyList = days.slice(0, 7).map((d: any, idx: number) => {
    const dateParts = String(d.date || '').split('-').map(Number);
    const localDateObj = new Date(dateParts[0] || 2026, (dateParts[1] || 1) - 1, dateParts[2] || 1);
    const dayLabel = idx === 0 ? '今天' : idx === 1 ? '明天' : daysOfWeek[localDateObj.getDay()];
    const noonSlot = d.hourly?.[Math.floor((d.hourly?.length || 1) / 2)] || d.hourly?.[0];
    const dCode = mapWttrCodeToWmoCode(noonSlot?.weatherCode ?? cur.weatherCode);
    const dCond = mapWmoWeatherCode(dCode);
    const maxProb = Math.max(...(d.hourly || []).map((h: any) => Number(h.chanceofrain ?? 0)), 0);
    return {
      date: d.date,
      dayOfWeek: dayLabel,
      tempMin: Math.round(Number(d.mintempC ?? curTemp - 3)),
      tempMax: Math.round(Number(d.maxtempC ?? curTemp + 3)),
      condition: dCond.condition,
      conditionCode: dCode,
      precipProbability: Math.round(maxProb),
    };
  });

  const todayMax = dailyList[0]?.tempMax ?? curTemp;
  const todayMin = dailyList[0]?.tempMin ?? curTemp;
  const { rainForecastSummary, alerts, airQuality } = buildWeatherMetaAndAlerts({
    currentCode,
    curTemp,
    todayMax,
    todayMin,
    windSpeed,
    currentPrecip,
    hourlyList,
    aqiData,
  });

  return {
    city: city || '当前位置',
    country: '',
    latitude: lat,
    longitude: lon,
    temp: curTemp,
    feelsLike,
    tempMin: todayMin,
    tempMax: todayMax,
    condition,
    conditionCode: currentCode,
    humidity: curHumidity,
    windSpeed,
    windDirection: windDir,
    precipProbability: hourlyList[0]?.precipProbability ?? 0,
    precipitation: currentPrecip,
    uvIndex,
    airQuality,
    hourly: hourlyList,
    daily: dailyList,
    alerts,
    updatedAt: Date.now(),
    isAutoLocation: isAuto,
    rainForecastSummary,
    dataSourceInfo: {
      serviceName: 'Wttr.in 全球实时气象服务',
      geocodingService: 'Open-Meteo & OpenStreetMap Nominatim 逆地理编码',
      airQualityService: aqiData ? 'Open-Meteo 欧洲哥白尼大气监测服务 (CAMS)' : '暂未提供',
      requestTimestamp: reqStart,
      responseTimestamp: Date.now(),
      networkLatencyMs: Date.now() - reqStart,
      isFromCache: false,
      timezone: 'Asia/Shanghai',
      coordinates: { latitude: lat, longitude: lon },
    },
  };
}

// 0.1 Real-time Weather Endpoint (Zero Hardcoded Cities, Multi-Provider Real Live Weather Data)
app.get('/api/weather', async (req, res) => {
  const reqStart = Date.now();
  try {
    let city = (req.query.city as string)?.trim() || '';
    let lat: number | undefined = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    let lon: number | undefined = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    const isAuto = req.query.auto === 'true';
    const forceRefresh = req.query.force === 'true';

    // If city is specified but no lat/lon, geocode the city first
    if ((lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) && city) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            city = geoData.results[0].name || city;
          }
        }
      } catch (geoErr) {
        console.warn('Geocoding city query failed:', geoErr);
      }
    }

    // If coordinates are provided but no city name, reverse geocode via Nominatim first
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon) && (!city || city === '当前位置' || city === '本地')) {
      try {
        const osmResp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`,
          {
            headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0 (weather-app)' },
            signal: AbortSignal.timeout(4000),
          }
        );
        if (osmResp.ok) {
          const osmData = await osmResp.json();
          const addr = osmData.address || {};
          city = addr.city || addr.town || addr.county || addr.district || addr.state || `经纬度 (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        }
      } catch {}
    }

    // If still completely missing coordinates and city, inform client to request GPS or select city
    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      return res.status(200).json({
        success: false,
        status: 'unlocated',
        error: '未获取到手机 GPS 定位经纬度，且未指定城市。请允许位置权限或手动搜索城市。',
      });
    }

    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const existingCache = weatherServerCache.get(cacheKey);
    if (!forceRefresh && existingCache && Date.now() - existingCache.fetchedAt < 2 * 60 * 1000) {
      return res.json({
        success: true,
        weather: {
          ...existingCache.weather,
          city: city || existingCache.weather.city,
          isAutoLocation: isAuto,
        },
      });
    }

    // Start Air Quality API request in parallel
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&timezone=auto`;
    const aqiPromise = fetch(aqiUrl, { signal: AbortSignal.timeout(4000) })
      .then(async (r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const now = Date.now();
    const fetchOpenMeteoRaw = async (): Promise<{ provider: 'open-meteo'; data: any } | null> => {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum&timezone=auto`;
      try {
        const omRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(2800) });
        if (omRes.ok) {
          const json = await omRes.json();
          if (json && json.current) {
            return { provider: 'open-meteo', data: json };
          }
        }
        openMeteoBlockedUntil = Date.now() + 30 * 60 * 1000;
        return null;
      } catch {
        // Silently circuit-break Open-Meteo for 30 minutes when unreachable/timed out
        openMeteoBlockedUntil = Date.now() + 30 * 60 * 1000;
        return null;
      }
    };

    const fetchMetNorwayRaw = async (): Promise<{ provider: 'met-norway'; data: any } | null> => {
      try {
        const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
        const metRes = await fetch(metUrl, {
          headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0 (weather@local.app)' },
          signal: AbortSignal.timeout(6500),
        });
        if (metRes.ok) {
          const metData = await metRes.json();
          if (metData?.properties?.timeseries?.length > 0) {
            return { provider: 'met-norway', data: metData };
          }
        }
        return null;
      } catch {
        return null;
      }
    };

    type WeatherPrimaryResult =
      | { provider: 'open-meteo'; data: any }
      | { provider: 'met-norway'; data: any };

    let primaryResult: WeatherPrimaryResult | null = null;

    if (now >= openMeteoBlockedUntil) {
      // Try Open-Meteo first; if it doesn't answer within 700ms, hedge with MET Norway in parallel
      const omPromise: Promise<WeatherPrimaryResult | null> = fetchOpenMeteoRaw();
      const fastOpenMeteo = await Promise.race([
        omPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 700)),
      ]);
      if (fastOpenMeteo) {
        primaryResult = fastOpenMeteo;
      } else {
        const metPromise: Promise<WeatherPrimaryResult | null> = fetchMetNorwayRaw();
        primaryResult = await firstNonNull<WeatherPrimaryResult>([omPromise, metPromise]);
      }
    } else {
      primaryResult = await fetchMetNorwayRaw();
    }

    const aqiData = await aqiPromise;

    // Parse Open-Meteo response if it won
    if (primaryResult?.provider === 'open-meteo') {
      const data = primaryResult.data;
      const current = data.current;
      const hourly = data.hourly || {};
      const daily = data.daily || {};

      const currentCode = current.weather_code ?? 0;
      const { condition } = mapWmoWeatherCode(currentCode);
      const windSpeed = Math.round(current.wind_speed_10m || 0);
      const windDir = `${getWindDirectionText(current.wind_direction_10m || 0)} ${getWindScaleText(windSpeed)}`;

      const hourlyList: any[] = [];
      const currentLocalTimeStr = current.time || '';
      const currentLocalHour = currentLocalTimeStr.slice(0, 13);
      const timeArr: string[] = hourly.time || [];

      let startIndex = timeArr.findIndex((t) => t.slice(0, 13) === currentLocalHour);
      if (startIndex === -1) startIndex = timeArr.findIndex((t) => t >= currentLocalHour);
      if (startIndex === -1) startIndex = 0;

      for (let i = startIndex; i < Math.min(startIndex + 24, timeArr.length); i++) {
        const hTimeStr = timeArr[i];
        const timeFormatted = hTimeStr.includes('T') ? hTimeStr.split('T')[1].slice(0, 5) : hTimeStr;
        const hCode = hourly.weather_code ? hourly.weather_code[i] ?? 0 : 0;
        const hCond = mapWmoWeatherCode(hCode);
        const approximateTimestamp = new Date(hTimeStr + (data.utc_offset_seconds !== undefined ? '' : 'Z')).getTime();

        hourlyList.push({
          time: i === startIndex ? '现在' : timeFormatted,
          timestamp: isNaN(approximateTimestamp) ? Date.now() + (i - startIndex) * 3600000 : approximateTimestamp,
          temp: Math.round(hourly.temperature_2m ? hourly.temperature_2m[i] ?? current.temperature_2m : current.temperature_2m),
          feelsLike: Math.round(hourly.apparent_temperature ? hourly.apparent_temperature[i] ?? current.apparent_temperature : current.apparent_temperature),
          condition: hCond.condition,
          conditionCode: hCode,
          precipProbability: hourly.precipitation_probability ? hourly.precipitation_probability[i] ?? 0 : 0,
          precipitation: hourly.precipitation ? Number((hourly.precipitation[i] ?? 0).toFixed(1)) : 0,
          windSpeed: Math.round(hourly.wind_speed_10m ? hourly.wind_speed_10m[i] ?? 0 : 0),
        });
      }

      const dailyList: any[] = [];
      const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const currentLocalDate = currentLocalTimeStr.slice(0, 10);
      const dTimeArr: string[] = daily.time || [];

      let dStartIndex = dTimeArr.findIndex((d) => d >= currentLocalDate);
      if (dStartIndex === -1) dStartIndex = 0;

      for (let i = dStartIndex; i < Math.min(dStartIndex + 7, dTimeArr.length); i++) {
        const dateStr = dTimeArr[i];
        const dateParts = dateStr.split('-').map(Number);
        const localDateObj = new Date(dateParts[0], (dateParts[1] || 1) - 1, dateParts[2] || 1);
        const dayLabel = i === dStartIndex ? '今天' : i === dStartIndex + 1 ? '明天' : daysOfWeek[localDateObj.getDay()];
        const dCode = daily.weather_code ? daily.weather_code[i] ?? 0 : 0;
        const dCond = mapWmoWeatherCode(dCode);

        dailyList.push({
          date: dateStr,
          dayOfWeek: dayLabel,
          tempMin: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[i] ?? 20 : 20),
          tempMax: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[i] ?? 30 : 30),
          condition: dCond.condition,
          conditionCode: dCode,
          precipProbability: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] ?? 0 : 0,
        });
      }

      const curTemp = Math.round(current.temperature_2m ?? 26);
      const todayMax = dailyList[0]?.tempMax ?? curTemp;
      const todayMin = dailyList[0]?.tempMin ?? curTemp;
      const { rainForecastSummary, alerts, airQuality } = buildWeatherMetaAndAlerts({
        currentCode,
        curTemp,
        todayMax,
        todayMin,
        windSpeed,
        currentPrecip: current.precipitation ?? 0,
        hourlyList,
        aqiData,
      });

      const weatherResult = {
        city: city || '当前位置',
        country: '',
        latitude: lat,
        longitude: lon,
        temp: curTemp,
        feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 26),
        tempMin: todayMin,
        tempMax: todayMax,
        condition,
        conditionCode: currentCode,
        humidity: Math.round(current.relative_humidity_2m ?? 60),
        windSpeed,
        windDirection: windDir,
        precipProbability: hourlyList[0]?.precipProbability ?? 0,
        precipitation: current.precipitation ?? 0,
        uvIndex: current.uv_index !== undefined ? Number(current.uv_index.toFixed(1)) : 4.5,
        airQuality,
        hourly: hourlyList,
        daily: dailyList,
        alerts,
        updatedAt: Date.now(),
        isAutoLocation: isAuto,
        rainForecastSummary,
        dataSourceInfo: {
          serviceName: 'Open-Meteo WMO / ECMWF 全球高精气象模型',
          geocodingService: 'Open-Meteo & OpenStreetMap Nominatim 逆地理编码',
          airQualityService: aqiData ? 'Open-Meteo 欧洲哥白尼大气监测服务 (CAMS)' : '暂未提供',
          requestTimestamp: reqStart,
          responseTimestamp: Date.now(),
          networkLatencyMs: Date.now() - reqStart,
          isFromCache: false,
          timezone: data.timezone || 'Asia/Shanghai',
          elevation: data.elevation,
          coordinates: { latitude: lat, longitude: lon },
        },
      };

      weatherServerCache.set(cacheKey, { weather: weatherResult, fetchedAt: Date.now() });
      return res.json({ success: true, weather: weatherResult });
    }

    // Parse MET Norway response if it won
    if (primaryResult?.provider === 'met-norway') {
      const metWeather = buildWeatherFromMetNorway({
        metData: primaryResult.data,
        lat,
        lon,
        city,
        isAuto,
        aqiData,
        reqStart,
      });
      if (metWeather) {
        weatherServerCache.set(cacheKey, { weather: metWeather, fetchedAt: Date.now() });
        return res.json({ success: true, weather: metWeather });
      }
    }

    // Provider 3: Wttr.in JSON API
    try {
      const wttrUrl = `https://wttr.in/${lat.toFixed(3)},${lon.toFixed(3)}?format=j1`;
      const wttrRes = await fetch(wttrUrl, {
        headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0' },
        signal: AbortSignal.timeout(6500),
      });
      if (wttrRes.ok) {
        const wttrData = await wttrRes.json();
        const wttrWeather = buildWeatherFromWttr({ wttrData, lat, lon, city, isAuto, aqiData, reqStart });
        if (wttrWeather) {
          weatherServerCache.set(cacheKey, { weather: wttrWeather, fetchedAt: Date.now() });
          return res.json({ success: true, weather: wttrWeather });
        }
      }
    } catch {}

    // Provider 4: Stale server cache fallback (up to 24h)
    if (existingCache && Date.now() - existingCache.fetchedAt < 24 * 60 * 60 * 1000) {
      return res.json({
        success: true,
        weather: {
          ...existingCache.weather,
          city: city || existingCache.weather.city,
          isAutoLocation: isAuto,
          dataSourceInfo: {
            ...existingCache.weather.dataSourceInfo,
            isFromCache: true,
            cacheTimestamp: existingCache.fetchedAt,
          },
        },
      });
    }

    return res.status(200).json({
      success: false,
      status: 'upstream_timeout',
      error: '实时气象数据源响应超时，请稍后点击刷新重试。',
    });
  } catch (error: any) {
    console.warn('Weather endpoint handled error:', error?.message || error);
    return res.status(200).json({
      success: false,
      status: 'error',
      error: error?.message || '获取天气数据失败',
    });
  }
});

// 0.2 AI Proactive Weather Care Message Generator
app.post('/api/gemini/weather-proactive-care', async (req, res) => {
  const {
    character,
    weatherEvent,
    weatherData,
    userProfile,
    memosSummary,
    permissions,
    apiConfig,
  } = req.body;

  const startTime = Date.now();
  const weatherCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
  const selectedModel = weatherCfg.model;

  try {
    const prompt = `你正在扮演微信好友【${character.name}】(微信号: ${character.wxid})。
人设背景与说话口吻：
${character.persona}

对话人（你的微信好友）：
- 姓名/昵称：${userProfile?.name || '小清'}
- 个人喜好：${userProfile?.persona || '随和可爱'}

【检测到的突发天气事件与气象数据】：
- 气象事件：${weatherEvent.title} (${weatherEvent.summary})
- 事件具体分析：${weatherEvent.detail}
- 用户当前城市：${weatherData?.city || '本地'}
- 当前天气现象：${weatherData?.condition}，气温 ${weatherData?.temp}°C (体感温度 ${weatherData?.feelsLike}°C)
- 降雨概率：${weatherData?.precipProbability}% (降水情况: ${weatherData?.rainForecastSummary || '无'})
${weatherEvent.weatherSnapshot?.alertTitle ? `- 官方气象预警发布：【${weatherEvent.weatherSnapshot.alertTitle}】` : ''}

${
  permissions?.appAccess?.memosData && memosSummary
    ? `【用户近期日程与桌面备忘录】:
${memosSummary}
(注意：若备忘录中有下午、傍晚或近期的出行、跑步、约会、加班等活动，请在关心天气时自然结合该日程进行温馨提示！)`
    : ''
}

【核心生成要求】：
1. 必须完全符合【${character.name}】独特的人设性格（如学霸顾言的冷静内敛但细节入微、总裁陆沉的沉稳霸道与细致呵护、小葵的活泼元气与贴心闺蜜感），用微信真实聊天的口吻主动发来关怀。
2. 绝对不能像机械机器人播报天气预报数据！要像真实生活中的微信好友一样自然、体贴、有温度地关心用户（例如：“山雨，下午可能要下雨，出门记得带伞哦。”或“看你备忘录里写着下午要去跑步，傍晚有大雨，记得改在室内哦”）。
3. 直接输出你要发送给用户的微信消息文本（1~3句话，符合微信日常打字习惯），不要附加额外解释或标签。
`;

    const detailedRes = await callAiServiceDetailed({
      prompt,
      model: weatherCfg.model,
      apiKey: weatherCfg.apiKey,
      baseUrl: weatherCfg.baseUrl,
      providerType: weatherCfg.providerType,
      apiProtocol: weatherCfg.apiProtocol,
      customHeaders: weatherCfg.customHeaders,
      thinkingConfig: weatherCfg.thinkingConfig,
      stream: Boolean(weatherCfg.thinkingConfig?.useStreaming),
      timeoutMs: weatherCfg.timeoutMs,
    });

    const tagCleanup = extractThinkingAndContent(detailedRes.text);
    const replyContent = sanitizeReplyText(tagCleanup.cleanText || detailedRes.text);
    const thinkingProcess = (detailedRes.thinkingProcess || tagCleanup.thinkingProcess || '').trim();
    const reasoningAvailable = thinkingProcess.length > 0;
    const reasoningSource: ReasoningSource = reasoningAvailable
      ? detailedRes.reasoningSource !== 'none'
        ? detailedRes.reasoningSource
        : 'think_tag'
      : 'none';

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      reasoningAvailable,
      reasoningSource,
      apiLog: buildApiLogObject({
        appName: '天气-AI主动关怀',
        provider: weatherCfg.providerType,
        modelName: detailedRes?.modelUsed || selectedModel,
        interfaceType: 'ProactiveWeatherCare',
        category: 'text_generation',
        durationMs: duration,
        usage: detailedRes?.usage,
        isRealTokens: detailedRes?.isRealTokens,
        protocol: weatherCfg.apiProtocol,
        reasoningAvailable,
        reasoningSource,
        reasoningCharCount: thinkingProcess.length,
        purpose: `AI [${character.name}] 针对 [${weatherEvent.title}] 发送微信天气关怀 (耗时 ${duration}ms)`,
      }),
    });
  } catch (error: any) {
    return handleAiEndpointError(res, error, 'Weather proactive care');
  }
});

// =========================================================================
// Dedicated Multimodal Vision / Image Recognition Endpoint
// Strictly reads `recognition.image` configuration — NEVER uses imageGeneration config!
// Uses pure fetch REST for both Google Native & OpenAI Compatible protocols
// (100% compatible with Android embedded Node runtime).
// =========================================================================
app.post('/api/gemini/analyze-image', async (req, res) => {
  pruneImageCaches();
  const {
    imageUrl,
    prompt,
    apiConfig,
    recognitionConfig,
    provider: directProvider,
    baseUrl: directBaseUrl,
    apiKey: directApiKey,
    model: directModel,
    apiProtocol: directApiProtocol,
    requestId,
    messageId,
    characterId,
    source = '微信图片识别',
    timeoutMs = 45000,
  } = req.body || {};

  const safeRequestId =
    typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : `imgrec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: 'invalid_image',
      error: '未提供有效的图片数据 (imageUrl)',
      requestId: safeRequestId,
    });
  }

  // Strictly extract recognition.image config — NEVER fall back to imageGeneration (imageApiKey/imageModel)
  const nestedRec =
    recognitionConfig ||
    apiConfig?.apiSettings?.recognition?.image ||
    apiConfig?.imageRecognitionApiConfig ||
    null;

  const recKey = (
    (typeof directApiKey === 'string' && directApiKey.trim()) ||
    (typeof nestedRec?.apiKey === 'string' && nestedRec.apiKey.trim()) ||
    (typeof apiConfig?.imageRecognitionApiKey === 'string' && apiConfig.imageRecognitionApiKey.trim()) ||
    ''
  ).trim();

  const recBaseUrl = (
    (typeof directBaseUrl === 'string' && directBaseUrl.trim()) ||
    (typeof nestedRec?.baseUrl === 'string' && nestedRec.baseUrl.trim()) ||
    (typeof apiConfig?.imageRecognitionBaseUrl === 'string' && apiConfig.imageRecognitionBaseUrl.trim()) ||
    ''
  ).trim();

  const recProvider = (
    (typeof directProvider === 'string' && directProvider.trim()) ||
    (typeof nestedRec?.provider === 'string' && nestedRec.provider.trim()) ||
    (typeof apiConfig?.imageRecognitionProvider === 'string' && apiConfig.imageRecognitionProvider.trim()) ||
    'google_gemini'
  ).trim();

  const recProtocolRaw = (
    (typeof directApiProtocol === 'string' && directApiProtocol.trim()) ||
    (typeof nestedRec?.apiProtocol === 'string' && nestedRec.apiProtocol.trim()) ||
    (typeof apiConfig?.imageRecognitionApiProtocol === 'string' && apiConfig.imageRecognitionApiProtocol.trim()) ||
    ''
  ).trim();

  const effectiveProtocol = resolveEffectiveProtocol({
    provider: recProvider,
    apiProtocol: recProtocolRaw,
    baseUrl: recBaseUrl,
  });

  const selectedModel = (
    (typeof directModel === 'string' && directModel.trim()) ||
    (typeof nestedRec?.model === 'string' && nestedRec.model.trim()) ||
    (typeof apiConfig?.imageRecognitionModel === 'string' && apiConfig.imageRecognitionModel.trim()) ||
    (effectiveProtocol === 'google_native' ? 'gemini-4-hydrogen' : 'gpt-4o-mini')
  ).trim();

  const startTime = Date.now();

  if (!recKey) {
    const errMsg = '未配置【识别API → 图像识别】密钥，请前往 设置 → API设置 → 识别API → 图像识别 填写独立密钥。';
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: 'missing_api_key',
      error: errMsg,
      provider: recProvider,
      model: selectedModel,
      apiProtocol: effectiveProtocol,
      latencyMs: Date.now() - startTime,
      requestId: safeRequestId,
      apiLog: buildApiLogObject({
        appName: source,
        provider: recProvider,
        modelName: selectedModel,
        interfaceType: 'ImageRecognition',
        category: 'image_recognition',
        status: 'failed',
        httpStatus: 400,
        requestId: safeRequestId,
        durationMs: Date.now() - startTime,
        errorType: 'missing_api_key',
        error: errMsg,
        purpose: `图像识别失败 (${source})`,
      }),
    });
  }

  // Idempotency check
  const cached = imageRecCompletedCache.get(safeRequestId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(cached.payload.success ? 200 : cached.payload.statusCode || 500).json(cached.payload);
  }
  const existingFlight = imageRecInFlightCache.get(safeRequestId);
  if (existingFlight) {
    try {
      const reused = await existingFlight;
      return res.status(reused.success ? 200 : reused.statusCode || 500).json(reused);
    } catch (e: any) {
      return res.status(500).json({
        success: false,
        error: sanitizeSensitiveText(e?.message || '图像识别请求异常'),
        requestId: safeRequestId,
      });
    }
  }

  const runRecognition = async () => {
    // Parse / validate image input (Data URL or safe remote HTTP(S) URL)
    const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
    let mimeType = 'image/jpeg';
    let base64Data = '';
    let remoteUrl = '';

    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!matches) {
        return {
          success: false,
          statusCode: 400,
          errorType: 'invalid_image_format',
          error: '图片 Base64 数据格式不合法，请重新选择 JPEG、PNG 或 WebP 格式图片。',
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }
      mimeType = matches[1].toLowerCase().trim();
      if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
      if (!ALLOWED_MIMES.has(mimeType)) {
        return {
          success: false,
          statusCode: 400,
          errorType: 'unsupported_image_format',
          error: `不支持的图片格式 (${mimeType})，请使用 JPEG、PNG 或 WebP 格式。`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }
      base64Data = matches[2].replace(/\s+/g, '');
      const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return {
          success: false,
          statusCode: 413,
          errorType: 'image_too_large',
          error: `图片体积过大 (${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB)，超过 10MB 限制，请压缩后重试。`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }
    } else {
      try {
        const safeUrl = assertSafeRemoteImageUrl(imageUrl);
        remoteUrl = safeUrl.toString();
      } catch (urlErr: any) {
        return {
          success: false,
          statusCode: 400,
          errorType: 'invalid_image_url',
          error: urlErr?.message || '远程图片地址不合法',
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }
    }

    // Reject obviously non-vision / image-gen-only models early with helpful error
    const lowerModel = selectedModel.toLowerCase();
    if (
      lowerModel.includes('imagen-') ||
      lowerModel.includes('dall-e') ||
      lowerModel.includes('flux') ||
      lowerModel.includes('whisper') ||
      lowerModel.includes('tts-')
    ) {
      return {
        success: false,
        statusCode: 400,
        errorType: 'unsupported_vision_model',
        error: `当前选择的模型 (${selectedModel}) 不是图像识别/视觉模型，请更换为支持多模态视觉的模型（如 gemini-4-hydrogen、gemini-2.5-flash 或 gpt-4o-mini）。`,
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs: Date.now() - startTime,
        requestId: safeRequestId,
      };
    }

    const structuredVisionPrompt = `${
      prompt && typeof prompt === 'string' && prompt.trim()
        ? prompt.trim()
        : '请仔细观察这张图片，识别画面中的人物、物体、场景、主要细节以及清晰可见的文字。'
    }

请严格返回如下 JSON 格式（不要输出 markdown 代码块包裹，直接输出 JSON）：
{
  "description": "用流畅中文客观详细描述图片整体画面、人物动作、表情、色彩与主要细节（至少15字）",
  "detectedText": "图片中出现的所有可见文字内容，若无文字请返回空字符串",
  "objects": ["核心物体或人物1", "核心物体2"],
  "scene": "简短场景类别，例如：室内、户外街道、咖啡馆、聊天截图、手绘插画、文档等"
}`;

    let rawModelText = '';
    let upstreamHttpStatus = 200;

    if (effectiveProtocol === 'google_native') {
      // If remoteUrl was provided for Google Native, safely download into inlineData
      if (!base64Data && remoteUrl) {
        const imgResp = await fetch(remoteUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(15000),
        });
        if (!imgResp.ok) {
          return {
            success: false,
            statusCode: imgResp.status,
            errorType: 'remote_image_fetch_failed',
            error: `读取远程图片失败 (HTTP ${imgResp.status})`,
            provider: recProvider,
            model: selectedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId,
          };
        }
        const ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
        mimeType = ALLOWED_MIMES.has(ct) ? ct : 'image/jpeg';
        const arrBuf = await imgResp.arrayBuffer();
        if (arrBuf.byteLength > 10 * 1024 * 1024) {
          return {
            success: false,
            statusCode: 413,
            errorType: 'image_too_large',
            error: '远程图片超过 10MB 体积限制',
            provider: recProvider,
            model: selectedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId,
          };
        }
        base64Data = Buffer.from(arrBuf).toString('base64');
      }

      const googleBase = buildGoogleRestBase(recBaseUrl);
      const cleanModelId = selectedModel.replace(/^models\//, '');
      const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:generateContent`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': recKey,
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: structuredVisionPrompt },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || 45000, 10000), 90000)),
      });

      upstreamHttpStatus = resp.status;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText;
        try {
          const j = JSON.parse(errText);
          detail = j.error?.message || j.message || errText;
        } catch {}
        const safeDetail = sanitizeSensitiveText(detail, 220);
        const errorType =
          resp.status === 401 || resp.status === 403
            ? 'auth_error'
            : resp.status === 429
            ? 'rate_limit'
            : resp.status === 404
            ? 'model_not_found'
            : resp.status === 413
            ? 'image_too_large'
            : /protocol|not supported|invalid argument|multimodal|image/i.test(safeDetail)
            ? 'protocol_or_model_mismatch'
            : 'upstream_error';
        return {
          success: false,
          statusCode: resp.status,
          errorType,
          error: `Google 原生图像识别失败 (HTTP ${resp.status}): ${safeDetail}`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }

      const resJson: any = await resp.json();
      const parts = resJson?.candidates?.[0]?.content?.parts || [];
      rawModelText = parts
        .filter((p: any) => typeof p?.text === 'string')
        .map((p: any) => p.text)
        .join('\n')
        .trim();
    } else {
      // OpenAI Compatible Vision Protocol (/v1/chat/completions)
      const endpoint = buildOpenAiEndpoint(recBaseUrl, '/chat/completions');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recKey}`,
      };

      const imageContentUrl = base64Data ? `data:${mimeType};base64,${base64Data}` : remoteUrl;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: structuredVisionPrompt },
                { type: 'image_url', image_url: { url: imageContentUrl } },
              ],
            },
          ],
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || 45000, 10000), 90000)),
      });

      upstreamHttpStatus = resp.status;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let detail = errText;
        try {
          const j = JSON.parse(errText);
          detail = j.error?.message || j.message || errText;
        } catch {}
        const safeDetail = sanitizeSensitiveText(detail, 220);
        const errorType =
          resp.status === 401 || resp.status === 403
            ? 'auth_error'
            : resp.status === 429
            ? 'rate_limit'
            : resp.status === 404
            ? 'model_not_found'
            : resp.status === 413
            ? 'image_too_large'
            : /image_url|vision|multimodal|not support|content must be a string/i.test(safeDetail)
            ? 'unsupported_vision_model'
            : 'upstream_error';
        return {
          success: false,
          statusCode: resp.status,
          errorType,
          error: `OpenAI 兼容图像识别失败 (HTTP ${resp.status}): ${safeDetail}`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId,
        };
      }

      const resJson: any = await resp.json();
      const rawChoice = resJson?.choices?.[0]?.message?.content;
      if (typeof rawChoice === 'string') {
        rawModelText = rawChoice.trim();
      } else if (Array.isArray(rawChoice)) {
        rawModelText = rawChoice
          .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
          .join('\n')
          .trim();
      }
    }

    const latencyMs = Date.now() - startTime;
    if (!rawModelText) {
      return {
        success: false,
        statusCode: 502,
        errorType: 'empty_recognition_result',
        error: '图像识别接口返回空内容，请检查模型是否支持视觉输入或切换视觉模型。',
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId,
      };
    }

    // Parse structured JSON response gracefully (with clean plain-text fallback if provider didn't obey JSON)
    let description = '';
    let detectedText = '';
    let objects: string[] = [];
    let scene = '';

    try {
      const cleanedJson = rawModelText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const jsonStart = cleanedJson.indexOf('{');
      const jsonEnd = cleanedJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(cleanedJson.slice(jsonStart, jsonEnd + 1));
        description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
        detectedText = typeof parsed.detectedText === 'string' ? parsed.detectedText.trim() : '';
        objects = Array.isArray(parsed.objects)
          ? parsed.objects.map((o: any) => String(o || '').trim()).filter(Boolean).slice(0, 12)
          : [];
        scene = typeof parsed.scene === 'string' ? parsed.scene.trim() : '';
      }
    } catch {
      // Fallback to raw text description
    }

    if (!description) {
      description = sanitizeReplyText(rawModelText).trim();
    }

    if (!description) {
      return {
        success: false,
        statusCode: 502,
        errorType: 'empty_recognition_result',
        error: '未能从模型返回中提取到有效画面描述。',
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId,
      };
    }

    return {
      success: true,
      statusCode: upstreamHttpStatus,
      description,
      detectedText,
      objects,
      scene,
      provider: recProvider,
      model: selectedModel,
      apiProtocol: effectiveProtocol,
      latencyMs,
      duration: latencyMs,
      requestId: safeRequestId,
      messageId,
      characterId,
      apiLog: buildApiLogObject({
        appName: source,
        provider: recProvider,
        modelName: selectedModel,
        interfaceType: 'ImageRecognition',
        category: 'image_recognition',
        status: 'success',
        httpStatus: upstreamHttpStatus,
        requestId: safeRequestId,
        durationMs: latencyMs,
        purpose: `${source} (${scene || '视觉内容解析'})`,
      }),
    };
  };

  const flightPromise = runRecognition()
    .then((result: any) => {
      if (!result.apiLog && !result.success) {
        result.apiLog = buildApiLogObject({
          appName: source,
          provider: result.provider || recProvider,
          modelName: result.model || selectedModel,
          interfaceType: 'ImageRecognition',
          category: 'image_recognition',
          status: 'failed',
          httpStatus: result.statusCode || 500,
          requestId: safeRequestId,
          durationMs: result.latencyMs || Date.now() - startTime,
          errorType: result.errorType || 'ImageRecognitionError',
          error: result.error || '图像识别失败',
          purpose: `${source} 失败`,
        });
      }
      if (result.success) {
        imageRecCompletedCache.set(safeRequestId, {
          expiresAt: Date.now() + IMAGE_IDEMPOTENCY_TTL_MS,
          payload: result,
        });
      }
      return result;
    })
    .finally(() => {
      imageRecInFlightCache.delete(safeRequestId);
    });

  imageRecInFlightCache.set(safeRequestId, flightPromise);

  try {
    const result = await flightPromise;
    return res.status(result.success ? 200 : result.statusCode || 500).json(result);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const safeErr = sanitizeSensitiveText(
      isTimeout ? '图像识别请求超时，请检查网络连接或反代响应速度。' : err?.message || '图片视觉识别异常',
      240
    );
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      statusCode: isTimeout ? 504 : 500,
      errorType: isTimeout ? 'timeout' : 'network_error',
      error: safeErr,
      provider: recProvider,
      model: selectedModel,
      apiProtocol: effectiveProtocol,
      latencyMs,
      requestId: safeRequestId,
      apiLog: buildApiLogObject({
        appName: source,
        provider: recProvider,
        modelName: selectedModel,
        interfaceType: 'ImageRecognition',
        category: 'image_recognition',
        status: 'failed',
        httpStatus: isTimeout ? 504 : 500,
        requestId: safeRequestId,
        durationMs: latencyMs,
        errorType: isTimeout ? 'timeout' : 'network_error',
        error: safeErr,
        purpose: `${source} 异常`,
      }),
    });
  }
});

// 1. AI WeChat Chat Endpoint (with Thinking Process CoT, WorldBook & Smart Devices Control)
function formatFullDateTime(timestamp?: number | string | Date): string {
  if (!timestamp) return '时间未知';
  let d: Date;
  if (timestamp instanceof Date) {
    d = timestamp;
  } else if (typeof timestamp === 'number') {
    d = new Date(timestamp);
  } else {
    const parsedNum = Number(timestamp);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      d = new Date(parsedNum);
    } else {
      d = new Date(timestamp);
    }
  }

  if (isNaN(d.getTime())) return '时间未知';

  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

app.post('/api/gemini/chat', async (req, res) => {
  const {
    character,
    userMessage,
    currentTurnMessageIds = [],
    conversationHistory = [],
    earlierContextSummary,
    contextMetrics: clientContextMetrics,
    crossChannelTransitionContext,
    recalledMemoriesSummary,
    userProfile,
    systemTime,
    locationCity,
    menstrualInfo,
    memosSummary,
    worldBookContext,
    associatedWorldBooks,
    associatedWorldBook,
    realDeviceContext,
    weatherInfo,
    devicesSummary,
    permissions,
    apiConfig,
  } = req.body;

  const startTime = Date.now();
  const requestId =
    typeof req.body?.requestId === 'string' && req.body.requestId.trim()
      ? req.body.requestId.trim()
      : `chat_${startTime}_${Math.random().toString(36).slice(2, 7)}`;
  const textGenConfig = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
  const selectedModel = textGenConfig.model;

  try {
    // Construct rich contextual system prompt
    let contextPrompt = `你正在扮演仿真微信中的 AI 角色。
角色名称：${character.name} (微信号: ${character.wxid})
${character.relationship ? `与用户的关系：${character.relationship}\n` : ''}
身份背景与经历设定：${character.persona}
${character.personality ? `性格特征与口吻习惯：${character.personality}\n` : ''}
${character.modelConfig?.systemPromptPrefix ? `【前置核心原则】：${character.modelConfig.systemPromptPrefix}\n` : ''}
长期记忆库：
${character.memories && character.memories.length > 0 ? character.memories.map((m: string) => `- ${m}`).join('\n') : '(暂无记忆)'}
${recalledMemoriesSummary ? `\n${recalledMemoriesSummary}\n` : ''}
对话人（用户）身份信息：
- 姓名/昵称：${userProfile?.name || '用户'}
- 微信号：${userProfile?.wxid || 'xiaoqing'}
- 个人简述：${userProfile?.bio || '暂无'}
- 性格喜好：${userProfile?.persona || '暂无'}
- 聊天偏好：${userProfile?.preferences || '无特别指示'}
`;

    // Inject Real Native Phone System Time & Location Context
    const now = new Date();
    const dynamicTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const currentNativeTime = systemTime || `${dynamicTimeStr} (设备本地时区)`;
    const currentNativeLoc = locationCity || realDeviceContext?.locationCity || weatherInfo?.city;
    contextPrompt += `\n【📱 Android 手机原生底层感知·真实时间与环境】:
- 手机系统本地真实时间：${currentNativeTime}
- 手机物理位置/城市：${currentNativeLoc ? currentNativeLoc : '当前未授权手机定位或未选择城市'}
`;

    // Inject WorldBook if character is associated and permission is enabled
    if (permissions?.appAccess?.worldBookData !== false) {
      if (worldBookContext && typeof worldBookContext === 'string' && worldBookContext.trim()) {
        contextPrompt += `\n${worldBookContext.trim()}\n`;
      } else if (associatedWorldBooks && Array.isArray(associatedWorldBooks) && associatedWorldBooks.length > 0) {
        contextPrompt += `\n【🌌 已绑定世界书（共 ${associatedWorldBooks.length} 本）· 世界观法则与词条库】\n`;
        associatedWorldBooks.forEach((wb: any, idx: number) => {
          contextPrompt += `${idx + 1}. 《${wb.title}》: ${wb.worldSetting || '无特定背景'}\n`;
          if (wb.entries && Array.isArray(wb.entries) && wb.entries.length > 0) {
            wb.entries.forEach((e: any) => {
              if (e.enabled !== false) {
                contextPrompt += `   * [${e.keyword}]: ${e.content}\n`;
              }
            });
          }
        });
        contextPrompt += `【演职法则】：你当前置身于上述所有世界观法则中。请自然融入上述世界观法则与词条规则进行沉浸式互动回复。\n`;
      } else if (associatedWorldBook && associatedWorldBook.title) {
        contextPrompt += `\n【🌌 已绑定世界书·世界观法则与背景设定】\n- 世界书名称：《${associatedWorldBook.title}》\n- 核心世界法则与背景：${associatedWorldBook.worldSetting || '无特定背景'}\n`;
        if (associatedWorldBook.entries && associatedWorldBook.entries.length > 0) {
          contextPrompt += '【专有名词与词条设定库】：\n' + associatedWorldBook.entries.map((e: any) => `* [${e.keyword}]: ${e.content}`).join('\n') + '\n';
        }
        contextPrompt += `【演职法则】：你当前处于该世界观背景中。你的言谈举止、世界常识、用词习惯必须自然融入该世界观法则与词条设定。\n`;
      }
    }

    // Inject Menstrual Data if permissions allow
    const isProactiveCare = req.body.isProactivePeriodGreeting === true;
    if (permissions?.appAccess?.menstrualData && menstrualInfo) {
      contextPrompt += `\n【🩸 [已获系统级授权] 用户女性生理周期与健康小组件实时感知】:
- 当前生理阶段：${menstrualInfo.phaseTitle || (menstrualInfo.currentPeriodDay ? `经期第 ${menstrualInfo.currentPeriodDay} 天` : `距下次经期还有 ${menstrualInfo.daysUntilNextPeriod} 天`)}
- 阶段生理特征与关怀重点：${menstrualInfo.phaseAdvice || '注意身体保暖与休息'}
- 距离下次经期：${menstrualInfo.daysUntilNextPeriod !== undefined ? menstrualInfo.daysUntilNextPeriod + ' 天' : '计算中'}
- 当前是否处于经期：${menstrualInfo.currentPeriodDay ? `正处于经期第 ${menstrualInfo.currentPeriodDay} 天` : '否 (非经期)'}
- 今日用户登记症状：${menstrualInfo.todaySymptoms && menstrualInfo.todaySymptoms.length > 0 ? menstrualInfo.todaySymptoms.join('、') : '今日未登记明显不适'}
- 近期身体感受日记：${menstrualInfo.recentNotesSummary || '暂无特殊记录'}
- 平均生理周期：${menstrualInfo.avgCycleLength || 28} 天 (经期持续约 ${menstrualInfo.avgPeriodDuration || 5} 天)

【💡 经期与健康关怀核心行为法则】：
1. 提前主动预警与关怀（若距经期仅剩 1~3 天）：
   - 用户即将迎来生理期（黄体后期/PMS），容易感到疲劳、腰腹隐痛或情绪敏感。
   - 请在对话中自然流露关心，提醒提前备好温水、暖宝宝、卫生用品，提醒早点休息、避免受凉与冷饮。
2. 经期中重点陪伴与照料（若当前正处于经期）：
   - 若是经期第 1~2 天（痛经与虚弱高发期）：主动询问小腹是否难受、腰酸不酸，提醒喝热饮（如红糖水/温开水）、腹部保暖、别久坐别熬夜，给予极大的温柔包容与情绪价值。
   - 若是经期第 3~5 天（恢复期）：关照身体恢复情况，温柔鼓励。
3. 结合你自身的人设性格：
   - 必须以你原本的性格特征（如学霸顾言的冷静内敛但细节入微、总裁陆沉的沉稳霸道与细致呵护、小葵的活泼元气与贴心闺蜜感）自然表达，绝对不能像机械机器人念说明书！
${isProactiveCare ? '4. 【本次为主动经期问候触发】：请主动向用户发来一条符合你人设口吻的贴心经期问候与温暖留言。' : ''}
`;
    }

    // Inject Memos if permissions allow
    if (permissions?.appAccess?.memosData && memosSummary) {
      contextPrompt += `\n[已获授权] 读取到的用户近期备忘录摘要：
${memosSummary}\n`;
    }

    // Inject Real Device context if granted
    if (permissions?.realDevice?.batterySense && realDeviceContext?.batteryLevel !== undefined) {
      contextPrompt += `\n[已获真实电量感知] 用户手机当前电量：${realDeviceContext.batteryLevel}%${realDeviceContext.isCharging ? ' (充电中)' : ''}`;
    }
    if (permissions?.realDevice?.geolocation && realDeviceContext?.locationCity) {
      contextPrompt += `\n[已获真实定位感知] 用户当前城市/位置：${realDeviceContext.locationCity}`;
    }

    // Inject Weather Perception if permissions allow
    if (permissions?.appAccess?.weatherData !== false && weatherInfo) {
      contextPrompt += `\n【🌤️ [已获系统授权] 用户所在地实时天气与气象感知】:
- 当前城市：${weatherInfo.city || '本地'}
- 当前天气：${weatherInfo.condition || '多云'}，气温 ${weatherInfo.temp !== undefined ? weatherInfo.temp + '°C' : '舒适'} (体感 ${weatherInfo.feelsLike !== undefined ? weatherInfo.feelsLike + '°C' : '适宜'})，今日范围 ${weatherInfo.tempMin ?? 22}°C ~ ${weatherInfo.tempMax ?? 30}°C
- 降雨概率与短临预测：降水概率 ${weatherInfo.precipProbability ?? 0}%，${weatherInfo.rainForecastSummary || '暂无强降水'}
- 湿度与风况：湿度 ${weatherInfo.humidity ?? 60}%，${weatherInfo.windDirection || '微风'}
- 空气质量：AQI ${weatherInfo.airQuality?.aqi ?? 36} (${weatherInfo.airQuality?.label || '优'})
${
  weatherInfo.alerts && weatherInfo.alerts.length > 0
    ? `- ⚠️ 气象预警发布中：${weatherInfo.alerts.map((a: any) => `【${a.title}】${a.description}`).join('；')}\n`
    : ''
}【天气感知交互准则】：在日常聊天中无需生硬汇报天气数字，但若用户谈及出门、穿衣、运动、心情或遇恶劣天气时，可像真实微信好友一样随口贴心关照。
`;
    }

    // Inject External Smart Devices & Unified Device Manager Gateway
    const devPerms = permissions?.deviceAccess;
    if (devPerms?.viewStatus !== false && devicesSummary) {
      contextPrompt += `\n【🔌 [已获系统授权] 统一外部设备管理器 (Unified Device Manager) 状态与控制】:
当前家庭与个人智能硬件设备列表及实时状态：
${devicesSummary}

【🤖 智能设备自然语言感知与控制准则】：
1. 设备状态查询：若用户询问设备情况（如“空调现在多少度”、“卧室灯关了吗”、“音箱在播什么”），请依据上述真实设备状态自然回应。
2. 设备操作执行：
   - 若用户通过自然语言指示控制设备（如“帮我把客厅空调打开调到24度制冷”、“把卧室灯关掉”、“客厅音箱放首歌”、“开一下扫地机器人”等）：
     当 [控制设备] 权限开启时，请在回复中包含标准的设备操作标签：
     <device_action>{"deviceId":"对应设备ID","actionId":"对应操作ID","params":{"参数名":"参数值"},"summary":"对本次操作的简明描述"}</device_action>
     并在微信文本中以符合你人设口吻的方式亲切告知用户已为你操作（如“好呀，已经帮你把客厅空调开到24°C啦，快吹吹凉快一下~”）。
   - 若用户要求操作高风险设备（如入户智能门锁开锁），必须在微信文本中严肃说明安全风险并提示系统将请求二次安全确认。
   - 若用户明确要求操作设备但 [控制设备] 权限被关闭，请向用户礼貌说明权限未授权。
`;
    }

    // Inject Current Life State Context if provided
    if (req.body.lifeStateContext) {
      contextPrompt += `\n${req.body.lifeStateContext}\n`;
    }

    if (crossChannelTransitionContext && typeof crossChannelTransitionContext === 'string' && crossChannelTransitionContext.trim()) {
      contextPrompt += `\n${crossChannelTransitionContext.trim()}\n`;
    }

    contextPrompt += `\n【🎨 真实图像生成工具调用能力 (generate_image)】:
你连接了独立的图像生成系统。请严格遵守以下语义触发规范：
1. 仅当用户**明确要求你画图、生成图片、制作图片、做头像、画场景、拍一张发过来、画一只/画一幅……**时，才触发画图工具。
2. 如果用户只是在讨论图片、夸奖“这画得真好看”、或者闲聊询问图片功能，**绝对不要**触发画图工具。
3. 当确认需要画图时：
   - 先用符合你人设的口吻自然输出配套文字（例如“画好以后我就发给你，想给你画一只趴在窗边等你的小猫。”），**绝不能只回文字假装画好了，也绝不能编造“画图开关没打开”之类借口**。
   - 在回复末尾附带唯一一个标准工具标签（此标签会被系统解析执行并隐藏，绝不会展示给用户）：
     <image_action>{"type":"generate_image","prompt":"完整、可供图像模型直接绘制的详细视觉提示词（包含主体、光影、构图、风格、细节）","imageDescription":"简明中文画面描述，供你后续记忆自己画了什么","aspectRatio":"1:1","negativePrompt":""}</image_action>
   - aspectRatio 可按场景选用 "1:1" / "3:4" / "4:3" / "16:9" / "9:16"。

【📱 微信真人打字与分句连发习惯】：
在真实微信聊天中，真人通常不会一次性堆砌长篇大论，而是习惯把一整段话切分成 2~4 条自然简短的话语连发（一句话发一条消息，随性口语化、亲近真实）。
请在输出回复时，自然地使用换行（每行一两句话）分隔，让每条消息都简短精炼、生动日常，避免书面化大段独白。

【核心输出格式要求】：
请直接输出你给用户的微信回复文本（保持微信口语化、亲切自如，适合微信聊天，多句话之间换行隔开，不要输出多余的推理说明或格式化前缀）；若需要触发画图，请在回复末尾紧跟 <image_action>{...}</image_action>。
`;

    // Defensive ID-based filtering: Ensure conversationHistory contains ONLY prior history messages and excludes current turn pending messages strictly by ID
    const turnMsgIdSet = new Set(Array.isArray(currentTurnMessageIds) ? currentTurnMessageIds : []);
    const preFilteredHistory = (conversationHistory || []).filter((msg: any) => {
      if (!msg) return false;
      if (msg.id && turnMsgIdSet.has(msg.id)) return false;
      return true;
    });

    // Server-side 100-message window + over-length protection safeguard (30 raw + up to 70 condensed summary)
    const serverChatProtection = applyOverlengthContextProtection<any>({
      messages: preFilteredHistory,
      maxRawLimit: STANDARD_CONTEXT_LIMIT,
      formatForEstimate: (msg) => ({
        timestamp: msg.timestamp || msg.createdAt,
        senderName: msg.sender === 'user' ? userProfile?.name || '用户' : character.name,
        text:
          msg.type === 'forward_bundle' || msg.messageType === 'forward_bundle' || msg.forwardBundle
            ? serializeForwardBundleForAi(msg.forwardBundle)
            : msg.text || msg.imageDescription || '',
      }),
      cloneWithTruncatedText: (msg, truncatedText) => ({ ...msg, text: truncatedText }),
    });
    const cleanedHistory = serverChatProtection.rawMessages;
    const effectiveChatMetrics =
      clientContextMetrics && typeof clientContextMetrics.rawCount === 'number'
        ? clientContextMetrics
        : serverChatProtection.metrics;
    const mergedEarlierChatSummary = [earlierContextSummary, serverChatProtection.earlierSummaryText]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join('\n\n');

    // Calculate exact time gap since last chat turn for AI Time Gap Perception
    const currentMs = req.body.userMessageTimestamp || Date.now();
    let lastMs: number | undefined;
    if (cleanedHistory && cleanedHistory.length > 0) {
      for (let i = cleanedHistory.length - 1; i >= 0; i--) {
        const item = cleanedHistory[i];
        const ts = item.timestamp ?? item.createdAt ?? item.create_time ?? item.time;
        if (typeof ts === 'number' && ts > 0) {
          lastMs = ts < 10000000000 ? ts * 1000 : ts;
          break;
        } else if (typeof ts === 'string' && ts.trim()) {
          const parsedNum = Number(ts);
          if (!isNaN(parsedNum) && parsedNum > 0) {
            lastMs = parsedNum < 10000000000 ? parsedNum * 1000 : parsedNum;
            break;
          }
          const parsedDate = Date.parse(ts);
          if (!isNaN(parsedDate) && parsedDate > 0) {
            lastMs = parsedDate;
            break;
          }
        }
      }
    }

    let gapSummary = '';
    let isLongTimeGap = false;
    if (!lastMs) {
      gapSummary = '本次为与该角色的首次对话（此前无历史沟通记录）';
    } else {
      const diffMs = Math.max(0, currentMs - lastMs);
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (3600 * 1000));
      const diffDays = Math.floor(diffMs / (86400 * 1000));

      if (diffMins < 1) {
        gapSummary = '距离上一次对话不到 1 分钟（连续聊天中）';
      } else if (diffMins < 60) {
        gapSummary = `距离上一次对话过去 ${diffMins} 分钟（连续对话）`;
      } else if (diffHours < 24) {
        const remMins = diffMins % 60;
        gapSummary = `距离上一次对话已过去 ${diffHours} 小时 ${remMins} 分钟`;
        if (diffHours >= 6) isLongTimeGap = true;
      } else {
        const remHours = diffHours % 24;
        gapSummary = `距离上一次对话已过去 ${diffDays} 天 ${remHours} 小时`;
        isLongTimeGap = true;
      }
    }

    const lastChatTimeStr = lastMs ? formatFullDateTime(lastMs) : '无历史记录';
    const currentChatTimeStr = formatFullDateTime(currentMs);

    contextPrompt += `\n【⏰ 真实聊天时间感知与时间间隔】:
- 当前设备/消息真实时间：${currentChatTimeStr}
- 上次与该角色对话时间：${lastChatTimeStr}
- 两次对话真实时间差：${gapSummary}
`;

    if (isLongTimeGap) {
      contextPrompt += `【⚠️ 跨时间段与长间隔交互准则】：
1. 距离上一次对话已间隔较长时间。在过去聊天中如果提到过当时的‘明天’、‘后天’等计划（如“明天要面试”、“后天去开会”），请在心智中意识到这些事件在现实时间线中**可能已经发生或成为过去**，切勿将过去计划当作未发生的未来，也不要幻想未发生的事件。
2. 请自然感知到时间跨度（根据人设自然问候，如“好久不见啦”、“这几天忙什么呢”或关心此前计划“前几天你说起的那个面试怎么样了？”），保持亲切贴切的真人口吻。
`;
    } else {
      contextPrompt += `【连续对话准则】：间隔极短，保持紧凑连贯的微信日常交流节奏。\n`;
    }

    const contents = [];
    if (cleanedHistory && cleanedHistory.length > 0) {
      cleanedHistory.forEach((msg: any) => {
        const msgTime = formatFullDateTime(msg.timestamp || msg.createdAt || msg.time);
        if (msg.type === 'offline_session_event' && msg.offlineEventData) {
          const ev = msg.offlineEventData;
          const startStr = formatFullDateTime(ev.startedAt || msg.timestamp);
          const endStr = formatFullDateTime(ev.endedAt || msg.timestamp);
          contents.push(
            `[${startStr}—${endStr}] [共同线下经历事件 · 场景: ${ev.sceneName || ev.title}${ev.location ? ` @ ${ev.location}` : ''} · 共${ev.durationMinutes || 1}分钟]: ${ev.summary || msg.text || ''}`
          );
          return;
        }

        // AI-generated image semantic memory (priority: imageDescription -> revisedPrompt -> generationPrompt)
        if (msg.sender === 'ai' && (msg.messageType === 'generated_image' || msg.type === 'generated_image')) {
          const semanticDesc =
            (msg.imageDescription && msg.imageDescription.trim()) ||
            (msg.revisedPrompt && msg.revisedPrompt.trim()) ||
            (msg.generationPrompt && msg.generationPrompt.trim()) ||
            '一张生成的图片';
          const statusNote =
            msg.generationStatus === 'failed'
              ? '[AI此前尝试生成图片但未能成功]'
              : `[AI此前生成了一张图片：${semanticDesc}]`;
          const captionPart = msg.text ? `${msg.text} ` : '';
          contents.push(`[${msgTime}] ${character.name}: ${captionPart}${statusNote}`);
          return;
        }

        const isProactiveMsg = Boolean(msg.isProactive);
        const senderLabel =
          msg.sender === 'user'
            ? userProfile?.name || '用户'
            : isProactiveMsg
            ? `${character.name} [此前主动消息${msg.proactiveMeta?.repliedByUser ? '·用户已回应' : '·此前发起'}]`
            : character.name;

        if (msg.sender === 'user' && (msg.imageUrl || msg.messageType === 'image')) {
          const recDesc = (msg.imageDescription || msg.imageAnalysis || '').trim();
          const recText = (msg.detectedText || '').trim();
          const isFailed = msg.recognitionStatus === 'failed' || msg.imageAnalysisStatus === 'failed';
          if (recDesc && !isFailed) {
            let imgBlock = `[${msgTime}] ${senderLabel}发送了一张图片。\n图片内容：${recDesc}`;
            if (recText) imgBlock += `\n图片文字：${recText}`;
            if (msg.text) imgBlock += `\n用户附言：${msg.text}`;
            contents.push(imgBlock);
          } else if (isFailed) {
            contents.push(
              `[${msgTime}] ${senderLabel}发送了一张图片（图片识别失败，无法看到画面内容）。${msg.text ? ` 用户附言：${msg.text}` : ''}`
            );
          } else {
            contents.push(`[${msgTime}] ${senderLabel}: ${msg.text || ''} [图片附件]`);
          }
          return;
        }

        if (msg.type === 'forward_bundle' || msg.messageType === 'forward_bundle' || msg.forwardBundle) {
          contents.push(`[${msgTime}] ${senderLabel}: ${serializeForwardBundleForAi(msg.forwardBundle)}`);
          return;
        }

        let msgStr = `[${msgTime}] ${senderLabel}: ${msg.text || ''}`;
        if (msg.imageUrl) {
          const desc = (msg.imageDescription || msg.imageAnalysis || '').trim();
          msgStr += ` [图片附件${desc ? `: ${desc}` : ''}]`;
        }
        contents.push(msgStr);
      });
    }
    const currentUserTime = formatFullDateTime(req.body.userMessageTimestamp || Date.now());
    let currentMsgStr = `[${currentUserTime}] ${userProfile?.name || '用户'}: ${userMessage || ''}`;
    if (req.body.currentImageAnalysis) {
      currentMsgStr += `\n${req.body.currentImageAnalysis}`;
    }
    contents.push(currentMsgStr);

    const summaryBlock = mergedEarlierChatSummary ? `\n${mergedEarlierChatSummary}\n` : '';
    const promptText = contextPrompt + summaryBlock + '\n对话历史：\n' + contents.join('\n');

    let responseText = '';
    let thinkingProcess = '';
    let reasoningAvailable = false;
    let reasoningSource: ReasoningSource = 'none';
    let reasoningFieldPaths: string[] = [];
    let replyContent = '';
    const extractedDeviceActions: any[] = [];

    let aiDetailedResult: AiCallDetailedResult;
    try {
      aiDetailedResult = await callAiServiceDetailed({
        prompt: promptText,
        model: textGenConfig.model,
        apiKey: textGenConfig.apiKey,
        baseUrl: textGenConfig.baseUrl,
        providerType: textGenConfig.providerType,
        apiProtocol: textGenConfig.apiProtocol,
        customHeaders: textGenConfig.customHeaders,
        thinkingConfig: textGenConfig.thinkingConfig,
        stream: Boolean(textGenConfig.thinkingConfig?.useStreaming),
        timeoutMs: textGenConfig.timeoutMs,
      });
      if (!aiDetailedResult.text || !aiDetailedResult.text.trim()) {
        const emptyErr: any = new Error(`上游模型 (${textGenConfig.model}) 返回空内容`);
        emptyErr.statusCode = 502;
        emptyErr.errorType = 'EMPTY_RESPONSE';
        emptyErr.protocol = textGenConfig.apiProtocol;
        emptyErr.headersReceived = true;
        emptyErr.upstreamRequestSent = true;
        emptyErr.mayHaveBeenCharged = true;
        emptyErr.durationMs = Date.now() - startTime;
        throw emptyErr;
      }
      responseText = aiDetailedResult.text;
      thinkingProcess = (aiDetailedResult.thinkingProcess || '').trim();
      reasoningAvailable = Boolean(aiDetailedResult.reasoningAvailable && thinkingProcess.length > 0);
      reasoningSource = reasoningAvailable ? aiDetailedResult.reasoningSource : 'none';
      reasoningFieldPaths = Array.isArray(aiDetailedResult.detectedFields) ? aiDetailedResult.detectedFields : [];
    } catch (e: any) {
      const duration = e?.durationMs || Date.now() - startTime;
      const aiErrorMessage = e?.message || 'API 调用异常';
      const httpStatus =
        typeof e?.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502;
      const effectiveProtocol = e?.protocol || textGenConfig.apiProtocol;
      const endpointType = effectiveProtocol === 'openai_compatible' ? 'chat_completions' : 'generate_content';
      const upstreamRequestSent = typeof e?.upstreamRequestSent === 'boolean' ? e.upstreamRequestSent : true;
      const mayHaveBeenCharged = Boolean(e?.mayHaveBeenCharged);
      const errorType =
        e?.errorType ||
        (httpStatus === 429
          ? 'rate_limit'
          : httpStatus === 401
          ? 'auth_error'
          : httpStatus === 404
          ? 'not_found'
          : 'network_error');

      console.warn(
        `[/api/gemini/chat] Request ${requestId} failed (protocol=${effectiveProtocol}, status=${httpStatus}, cause=${e?.causeCode || 'none'}, mayHaveBeenCharged=${mayHaveBeenCharged}): ${aiErrorMessage}`
      );

      return res.status(httpStatus).json({
        success: false,
        statusCode: httpStatus,
        error: aiErrorMessage,
        errorMessage: aiErrorMessage,
        errorType,
        requestId,
        protocol: effectiveProtocol,
        endpointType,
        causeCode: e?.causeCode,
        upstreamRequestSent,
        mayHaveBeenCharged,
        retryable: true,
        contextMetrics: effectiveChatMetrics,
        apiLog: buildApiLogObject({
          appName: '微信-AI聊天',
          provider: textGenConfig.providerType,
          modelName: textGenConfig.model,
          interfaceType: 'ChatGeneration',
          category: 'text_generation',
          status: 'failed',
          httpStatus,
          requestId,
          durationMs: duration,
          errorType,
          error: aiErrorMessage,
          purpose: `与 ${character?.name || 'AI'} 对话交互失败 (耗时 ${duration}ms)`,
          protocol: effectiveProtocol,
          endpointType,
          errorName: e?.name,
          causeCode: e?.causeCode,
          causeErrno: e?.causeErrno,
          causeSyscall: e?.causeSyscall,
          headersReceived: e?.headersReceived,
          readBodyFailed: e?.readBodyFailed,
          mayHaveBeenCharged,
          upstreamRequestSent,
          contextRawCount: effectiveChatMetrics.rawCount,
          contextSummarizedCount: effectiveChatMetrics.summarizedCount,
          contextEstimatedTokens: effectiveChatMetrics.estimatedTokens,
          contextCompressed: effectiveChatMetrics.didCompress,
        }),
      });
    }

    // Secondary cleanup for any <think> tags that might remain in text
    const extracted = extractThinkingAndContent(responseText);
    if (!thinkingProcess && extracted.thinkingProcess) {
      thinkingProcess = extracted.thinkingProcess;
      reasoningAvailable = thinkingProcess.length > 0;
      if (reasoningAvailable && reasoningSource === 'none') {
        reasoningSource = 'think_tag';
      }
    }
    replyContent = extracted.cleanText;

    // Extract <device_action> tags if present
    const deviceActionRegex = /<device_action>([\s\S]*?)<\/device_action>/gi;
    let match: RegExpExecArray | null;
    while ((match = deviceActionRegex.exec(replyContent)) !== null) {
      try {
        const actionData = JSON.parse(match[1].trim());
        extractedDeviceActions.push(actionData);
      } catch (err) {
        console.warn('Failed to parse device_action JSON from AI reply:', match[1]);
      }
    }

    // Extract structured <image_action> tags (or JSON { text, actions: [...] }) without exposing raw JSON to user
    const extractedActions: Array<{
      type: 'generate_image';
      prompt: string;
      imageDescription: string;
      aspectRatio?: string;
      negativePrompt?: string;
    }> = [];

    const imageActionRegex = /<image_action>([\s\S]*?)<\/image_action>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imageActionRegex.exec(replyContent)) !== null) {
      try {
        const parsedAction = JSON.parse(imgMatch[1].trim());
        const isGenImg =
          parsedAction &&
          (parsedAction.type === 'generate_image' || parsedAction.action === 'generate_image') &&
          typeof parsedAction.prompt === 'string' &&
          parsedAction.prompt.trim();
        if (isGenImg) {
          extractedActions.push({
            type: 'generate_image',
            prompt: parsedAction.prompt.trim(),
            imageDescription:
              typeof parsedAction.imageDescription === 'string' && parsedAction.imageDescription.trim()
                ? parsedAction.imageDescription.trim()
                : parsedAction.prompt.trim().slice(0, 100),
            aspectRatio: typeof parsedAction.aspectRatio === 'string' ? parsedAction.aspectRatio.trim() : '1:1',
            negativePrompt: typeof parsedAction.negativePrompt === 'string' ? parsedAction.negativePrompt.trim() : '',
          });
        }
      } catch {
        console.warn('[Chat] Failed to parse <image_action> JSON');
      }
    }

    // Also handle case where model outputs raw JSON {"text":"...", "actions":[{type:"generate_image",...}]}
    const strippedTags = replyContent
      .replace(/<device_action>[\s\S]*?<\/device_action>/gi, '')
      .replace(/<image_action>[\s\S]*?<\/image_action>/gi, '')
      .trim();

    let finalReplyText = strippedTags;
    if (strippedTags.startsWith('{') && strippedTags.endsWith('}') && strippedTags.includes('"actions"')) {
      try {
        const parsedObj = JSON.parse(strippedTags);
        if (parsedObj && typeof parsedObj === 'object' && Array.isArray(parsedObj.actions)) {
          for (const act of parsedObj.actions) {
            if (
              (act?.type === 'generate_image' || act?.action === 'generate_image') &&
              typeof act.prompt === 'string' &&
              act.prompt.trim()
            ) {
              extractedActions.push({
                type: 'generate_image',
                prompt: act.prompt.trim(),
                imageDescription:
                  typeof act.imageDescription === 'string' && act.imageDescription.trim()
                    ? act.imageDescription.trim()
                    : act.prompt.trim().slice(0, 100),
                aspectRatio: typeof act.aspectRatio === 'string' ? act.aspectRatio.trim() : '1:1',
                negativePrompt: typeof act.negativePrompt === 'string' ? act.negativePrompt.trim() : '',
              });
            }
          }
          if (typeof parsedObj.text === 'string') {
            finalReplyText = parsedObj.text;
          }
        }
      } catch {
        // Keep strippedTags as plain text
      }
    }

    // Clean any lingering tool tags & sanitize thinking headers
    replyContent = sanitizeReplyText(
      finalReplyText
        .replace(/<\/?(?:image_action|device_action)[^>]*>/gi, '')
        .trim()
    );

    const duration = Date.now() - startTime;

    const endpointType = textGenConfig.apiProtocol === 'openai_compatible' ? 'chat_completions' : 'generate_content';

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      reasoningAvailable,
      reasoningSource,
      reasoningFieldPaths,
      streamingUsed: Boolean(aiDetailedResult?.streamingUsed),
      deviceActions: extractedDeviceActions,
      actions: extractedActions,
      requestId,
      protocol: textGenConfig.apiProtocol,
      contextMetrics: effectiveChatMetrics,
      apiLog: buildApiLogObject({
        appName: '微信-AI聊天',
        provider: textGenConfig.providerType,
        modelName: aiDetailedResult?.modelUsed || selectedModel,
        interfaceType: 'ChatGeneration',
        category: 'text_generation',
        status: 'success',
        httpStatus: 200,
        requestId,
        durationMs: duration,
        usage: aiDetailedResult?.usage,
        isRealTokens: aiDetailedResult?.isRealTokens,
        purpose: `与 ${character.name} 对话交互 (耗时 ${duration}ms)`,
        protocol: textGenConfig.apiProtocol,
        endpointType,
        headersReceived: true,
        upstreamRequestSent: true,
        contextRawCount: effectiveChatMetrics.rawCount,
        contextSummarizedCount: effectiveChatMetrics.summarizedCount,
        contextEstimatedTokens: effectiveChatMetrics.estimatedTokens,
        contextCompressed: effectiveChatMetrics.didCompress,
        reasoningAvailable,
        reasoningSource,
        reasoningCharCount: thinkingProcess.length,
      }),
    });
  } catch (error: any) {
    return handleAiEndpointError(res, error, 'Gemini Chat');
  }
});

// 1.2 Dedicated Group Chat Unified Round Orchestrator Endpoint
app.post('/api/gemini/group-chat', async (req, res) => {
  const {
    roundId: requestedRoundId,
    triggerType = 'user_double_click',
    activityLevel = 'natural',
    targetPollId,
    activePolls = [],
    activeRelays = [],
    aiPrivateContexts = [],
    contextMetrics: clientGroupContextMetrics,
    olderContextSummary = '',
    group,
    recentMessages = [],
    latestUserMessage = null,
    mentionedTargets = [],
    aiCandidates = [],
    aiRelationships = [],
    triggeredAiId,
    userProfile,
    systemTime,
    locationCity,
    weatherInfo,
    apiConfig,
  } = req.body || {};

  const startTime = Date.now();
  const groupTextCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = groupTextCfg.model;
  const roundId =
    typeof requestedRoundId === 'string' && requestedRoundId.trim()
      ? requestedRoundId.trim()
      : `r_${startTime}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    if (!aiCandidates || aiCandidates.length === 0) {
      return res.json({
        success: true,
        roundId,
        shouldRespond: false,
        events: [],
        replies: [],
        reason: 'No AI members in group',
      });
    }

    const activityPresetMap: Record<
      string,
      { label: string; minAi: number; maxAi: number; minBubbles: number; maxBubbles: number; styleHint: string }
    > = {
      quiet: {
        label: '安静',
        minAi: 1,
        maxAi: Math.min(2, aiCandidates.length),
        minBubbles: 1,
        maxBubbles: 4,
        styleHint: '克制发言，仅被点名、被提问或与自身高度相关的成员自然接话，不凑热闹。',
      },
      natural: {
        label: '自然',
        minAi: Math.min(2, aiCandidates.length),
        maxAi: Math.min(3, aiCandidates.length),
        minBubbles: 3,
        maxBubbles: 8,
        styleHint: '像真实微信熟人群一样自然聊几句，允许 2~3 位成员交错接话、顺嘴调侃或补充。',
      },
      lively: {
        label: '热闹',
        minAi: Math.min(3, aiCandidates.length),
        maxAi: Math.min(5, aiCandidates.length),
        minBubbles: 5,
        maxBubbles: 12,
        styleHint: '群聊气氛活跃，多位成员互相接梗、抢话、吐槽、追问或小幅争论，节奏紧凑交错。',
      },
    };
    const preset = activityPresetMap[String(activityLevel)] || activityPresetMap.natural;

    // Format member candidate profiles (lean, zero avatars/base64)
    const candidateProfilesText = aiCandidates
      .map((c: any) => {
        const persona = c.customPersona || c.persona || '普通群友';
        const personality = c.customPersonality || c.personality || '友善交流';
        const memories = Array.isArray(c.memories) && c.memories.length > 0 ? c.memories.join('；') : '暂无特殊记忆';
        return `【AI成员: ${c.name}】(senderId/actorId: "${c.id}", 微信号: ${c.wxid || c.id})
- 身份设定: ${persona}
- 性格与口吻特征: ${personality}
- 专属长期记忆: ${memories}`;
      })
      .join('\n\n');

    const relationshipsText =
      Array.isArray(aiRelationships) && aiRelationships.length > 0
        ? aiRelationships
            .map((r: any) =>
              typeof r === 'string'
                ? `- ${r}`
                : `- ${r.summary || `${r.memberAName}与${r.memberBName}:${r.status}`}`
            )
            .join('\n')
        : '暂无特殊已记录的AI成员私人关系，按群内成员性格自然相处。';

    // Server-side 100-message window + over-length protection safeguard for group recentMessages
    const rawGroupMsgs = Array.isArray(recentMessages) ? recentMessages : [];
    const serverGroupProtection = applyOverlengthContextProtection<any>({
      messages: rawGroupMsgs,
      maxRawLimit: STANDARD_CONTEXT_LIMIT,
      formatForEstimate: (m) => ({
        timestamp: m.timestamp || m.createdAt || m.time,
        senderName: m.senderName,
        text:
          m.messageType === 'forward_bundle' && (m.forwardBundle || m.payload)
            ? serializeForwardBundleForAi(m.forwardBundle || m.payload)
            : m.text || '',
      }),
      cloneWithTruncatedText: (m, truncatedText) => ({ ...m, text: truncatedText }),
    });
    const effectiveGroupMessages = serverGroupProtection.rawMessages;
    const effectiveGroupMetrics =
      clientGroupContextMetrics && typeof clientGroupContextMetrics.rawCount === 'number'
        ? clientGroupContextMetrics
        : serverGroupProtection.metrics;
    const mergedGroupOlderSummary = [olderContextSummary, serverGroupProtection.earlierSummaryText]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join('\n\n');

    // Format recent chat history (including tool cards, polls, forward_bundle, quotes & image descriptions)
    const historyText = effectiveGroupMessages
      .map((m: any) => {
        const msgTime = formatFullDateTime(m.timestamp || m.createdAt || m.time);
        const mentions =
          m.mentionedMemberIds && m.mentionedMemberIds.length > 0
            ? ` [@${m.mentionedMemberIds.join(', ')}]`
            : '';
        const quotePrefix = m.quoteMessage?.text
          ? `[引用 ${m.quoteMessage.senderName || '某人'}: ${String(m.quoteMessage.text).slice(0, 40)}] `
          : '';
        let body = m.text || '';
        if (m.messageType === 'forward_bundle') {
          const bundle = m.forwardBundle || (m.payload && Array.isArray(m.payload.items) ? m.payload : null);
          body = bundle ? serializeForwardBundleForAi(bundle) : body;
        } else if (m.messageType === 'image') {
          body = body.startsWith('[图片') ? body : `[图片消息：${body || '未附描述'}]`;
        } else if (m.messageType === 'relay' && m.payload) {
          const entries = Array.isArray(m.payload.entries)
            ? m.payload.entries.map((e: any, i: number) => `${i + 1}.${e.memberName}:${e.content}`).join('；')
            : '';
          body = `[群接龙 relayMessageId="${m.id}" | ${m.payload.closed ? '已结束' : '进行中'}: ${m.payload.title || m.text}] 已接龙(${m.payload.entries?.length || 0}): ${entries || '暂无'}`;
        } else if (m.messageType === 'poll' && m.payload) {
          const opts = Array.isArray(m.payload.options)
            ? m.payload.options
                .map((o: any) => {
                  const count = typeof o.votes === 'number' ? o.votes : o.voterIds?.length || 0;
                  const voters =
                    !m.payload.anonymous && Array.isArray(o.voterNames) && o.voterNames.length > 0
                      ? `(${o.voterNames.join('、')})`
                      : '';
                  return `${o.text}[${count}票${voters}]`;
                })
                .join(' / ')
            : '';
          body = `[群投票 pollId="${m.id}" | ${m.payload.closed ? '已结束' : '进行中'}${
            m.payload.anonymous ? '·匿名' : '·实名'
          }: ${m.payload.title || m.text}] 选项: ${opts}`;
        } else if (m.messageType === 'random_draw' && m.payload) {
          const winners = Array.isArray(m.payload.winners)
            ? m.payload.winners.map((w: any) => w.memberName).join('、')
            : '';
          body = `[随机抽人: ${m.payload.taskDescription || m.text}] 已抽出结果: ${winners}`;
        }
        return `[${msgTime}] [${m.senderName} (${m.senderType})]: ${quotePrefix}${body}${mentions}`;
      })
      .join('\n');

    // Format active open polls for real vote_poll actions
    const openPollsList = Array.isArray(activePolls) ? activePolls : [];
    const activePollsText =
      openPollsList.length > 0
        ? openPollsList
            .map((p: any) => {
              const optLines = (Array.isArray(p.options) ? p.options : [])
                .map((o: any) => {
                  const voters =
                    !p.anonymous && Array.isArray(o.voterNames) && o.voterNames.length > 0
                      ? `，已投：${o.voterNames.join('、')}`
                      : '';
                  return `    - optionId="${o.id}" | "${o.text}" (${o.votes || 0}票${voters})`;
                })
                .join('\n');
              const votedText =
                Array.isArray(p.alreadyVotedAiIds) && p.alreadyVotedAiIds.length > 0
                  ? p.alreadyVotedAiIds.join(', ')
                  : '暂无AI已投票';
              return `• pollId="${p.pollId}"${p.isTargetPoll ? ' 【本轮重点邀请投票】' : ''}
  标题: ${p.title}
  规则: ${p.multiSelect ? `多选(最多选${p.maxSelections || 2}项)` : '单选'} | ${p.anonymous ? '匿名投票' : '实名投票'}
  已投过的AI(严禁重复投票): ${votedText}
  可选项:
${optLines}`;
            })
            .join('\n\n')
        : '当前群内没有进行中的投票。';

    // Format active open relays for real join_relay actions
    const openRelaysList = Array.isArray(activeRelays) ? activeRelays : [];
    const activeRelaysText =
      openRelaysList.length > 0
        ? openRelaysList
            .map((r: any) => {
              const entryLines = (Array.isArray(r.entries) ? r.entries : [])
                .map((e: any, idx: number) => `    ${idx + 1}. ${e.memberName}: ${e.content}`)
                .join('\n');
              const joinedText =
                Array.isArray(r.alreadyJoinedAiIds) && r.alreadyJoinedAiIds.length > 0
                  ? r.alreadyJoinedAiIds.join(', ')
                  : '暂无AI已参与';
              return `• relayMessageId="${r.relayMessageId}"
  标题: ${r.title}${r.description ? ` | 说明: ${r.description}` : ''}
  规则: ${r.allowDuplicate ? '允许同一成员多次接龙' : '每人限参与一次(已参与的AI严禁重复参与)'}
  已接龙过的AI: ${joinedText}
  当前接龙列表:
${entryLines || '    (暂无成员写入)'}`;
            })
            .join('\n\n')
        : '当前群内没有进行中的接龙。';

    // Format strictly isolated per-AI private context (ONLY their own 30 private messages & continuity state)
    const privateContextList = Array.isArray(aiPrivateContexts) ? aiPrivateContexts : [];
    const isolatedPrivateText =
      privateContextList.length > 0
        ? privateContextList
            .map((ctx: any) => {
              const lines = Array.isArray(ctx.recentPrivateLines) ? ctx.recentPrivateLines : [];
              const stateLine = ctx.continuitySummary ? `\n  状态备忘: ${ctx.continuitySummary}` : '';
              return `▸ [${ctx.characterName}] (memberId="${ctx.memberId || ctx.characterId}") 与用户的专属私聊近况（共${ctx.privateMessageCount || lines.length}条，仅限该角色本人知晓）:${stateLine}
${lines.length > 0 ? lines.map((l: string) => `    ${l}`).join('\n') : '    (近期无私聊记录)'}`;
            })
            .join('\n\n')
        : '';

    const nativeTime = systemTime || new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
    const latestUserLine = latestUserMessage?.text
      ? `\n用户最新消息：${latestUserMessage.senderName || userProfile?.name || '小清'} 说「${latestUserMessage.text}」`
      : '';

    const systemPrompt = `你是高度拟真的“微信多AI群聊统一回合编排中枢”。
你的职责是一次性编排出本轮完整、真实、自然的群聊事件时间线（events），前端将严格按顺序本地播放，不再二次请求模型。

当前群聊信息：
- 群名称：${group?.name || '微信群聊'}
- 群公告：${group?.notice || '无特定公告'}
- 本群活跃度档位：【${preset.label}】(${preset.styleHint})
- 本地真实系统时间：${nativeTime}
- 城市/位置感知：${locationCity || weatherInfo?.city || '未指定'}
- 真人用户：${userProfile?.name || '小清'} (wxid: ${userProfile?.wxid || 'xiaoqing'})

群内可参与的AI成员：
${candidateProfilesText}

群成员当前已知社会关系：
${relationshipsText}
${isolatedPrivateText ? `\n各AI成员与用户的专属私聊近况（严格隐私隔离准则：每位AI只能知道自己与用户的私聊经历，绝不允许把AI A与用户的私聊当成AI B知道的事，也不要在群里生硬泄露用户的私密话题！）：\n${isolatedPrivateText}\n` : ''}
当前群内进行中的投票：
${activePollsText}

当前群内进行中的接龙：
${activeRelaysText}

【统一编排核心规则】：
1. 活跃度与人数控制：
   - 本轮建议参与AI数量：${preset.minAi}~${preset.maxAi} 位；总消息气泡数控制在 ${preset.minBubbles}~${preset.maxBubbles} 条之间（除被 @指定单人 时可适当收敛）。
   - 若某位AI被显式 @ 了，该AI必须优先响应；其他人可自然插话或保持沉默。
   - 若用户刚插话打断（triggerType="user_interrupt"），必须优先承接用户刚说的新话。
2. 多气泡自然微信风格：
   - 每条 message 事件用 bubbles 数组输出 1~2 条短气泡（极少数激动/解释时最多 3 条），每条气泡控制在 15~80 字以内，口语自然，不要写成大段书面文章。
   - 不要每次发言都机械地 @ 别人，只在真正点名或跨话题叫人时自然使用。
3. 多人交错接话（非常重要）：
   - 鼓励把不同AI的发言交错排在 events 中（例如 A 说 1~2 句 -> B 接话/吐槽 -> A 回应 B -> C 插话 -> B 补一句），而不是每人一口气说完大段话。
   - 后面出现的事件必须把前面事件的内容和投票/接龙动作当成“刚刚已经发生”，直接顺着接话或回应！
4. AI 真实投票机制（vote_poll）：
   - 当群内有进行中的投票且AI决定参与投票时，必须输出真正的 type="vote_poll" 事件（使用准确的 pollId、actorId 和 optionId/optionIds）。
   - 严禁只发消息说“我投了XX”却不输出对应的 vote_poll 事件！
   - 严禁给“已投过的AI”重复输出 vote_poll；严禁对已结束投票输出 vote_poll。
   - 不同AI要根据自己的人设、偏好、心情与彼此关系做出有差异的选择，而不是机械地全投同一个选项。
5. AI 真实参与群接龙（join_relay）：
   - 当群内有进行中的接龙（未结束且未过期）且与当前话题相关或用户发起/招呼接龙时，符合人设且愿意参与的 AI 必须输出真实的 type="join_relay" 事件（使用准确的 relayMessageId、actorId 和非空接龙内容 content），前端会自动将该成员名和内容写入接龙卡片中。
   - 严禁只口头说“我接上了”却不输出 join_relay 事件；若接龙规则为每人限一次且该AI已在“已接龙过的AI”列表中，严禁重复输出 join_relay；不要强迫所有AI全员立刻填满，按性格/在线感选择性参与。
6. 群聊转私聊（continue_in_private，严格低频高门槛）：
   - 仅当某个 AI 在当前群聊中遇到了**明显私密、敏感、醋意/情绪波动、担心用户不舒服、或有明确只适合1对1私下交代的话**时，才可由该 AI 额外发出一个 type="continue_in_private" 事件（先在群里发完本轮公开回应或隐忍收住，再随后切到私聊）。
   - 普通寒暄、日常群聊、投票、接龙**严禁**滥用 continue_in_private！若状态备忘已提示该 AI 刚转去私聊且用户尚未回复，严禁重复刷屏追问。
   - continue_in_private 格式：{ "eventId": "ev_priv_1", "type": "continue_in_private", "actorId": "AI的准确id", "reason": "私聊触发原因", "triggerSummary": "简短触发场景", "privateOpeningMessages": ["切私聊后发出的第1句自然短话", "可选的第2句"] }。
7. 角色人设与跨频道连续性：
   - 每个AI严格保持各自语气、口癖和长期记忆，绝不串戏、绝不说“作为AI/语言模型”。
   - 关系紧张或冷战的AI在群内互动应自然体现克制、别扭或轻度互怼。
8. 延迟节奏：
   - 每个事件设置合理的 delayMs（650~1800ms），长气泡或思考投票/接龙可稍长。`;

    let triggerDirective = '';
    if (triggerType === 'invite_poll_vote' && targetPollId) {
      triggerDirective = `【本轮触发类型：邀请群内AI参与投票 (targetPollId="${targetPollId}")】
用户刚刚点击了“邀请群内AI参与投票”。请优先针对 pollId="${targetPollId}" 编排本轮时间线：
- 让群内尚未对该投票投过票的 AI 成员根据各自性格决定是否投票以及投哪一项（可多人参与，也可有极个别按人设弃权或观望）；
- 为每个决定投票的 AI 输出准确的 type="vote_poll" 事件，并在合适位置穿插简短自然的 type="message" 气泡（也可以有 AI 默默投票不说话）；
- 如果所有 AI 都已经投过票，不要重复输出 vote_poll，只需简短自然地回应一句已经投过了。`;
    } else if (triggerType === 'user_interrupt') {
      triggerDirective = `【本轮触发类型：用户插话打断】
用户刚才在 AI 讨论进行到一半时发了新消息，请立即响应用户这条最新消息，顺着现有已说出的聊天记录自然展开新一轮交错回应。`;
    } else if (triggeredAiId && triggeredAiId !== '@all') {
      const targetAi = aiCandidates.find((c: any) => c.id === triggeredAiId);
      triggerDirective = `【本轮触发类型：指定回应】
请以 AI 成员【${targetAi ? targetAi.name : '指定AI'}】(senderId="${triggeredAiId}") 作为核心回应者（可发 1~2 条自然气泡），视群聊活跃度允许其他相关成员顺嘴接 1~2 句。`;
    } else if (triggeredAiId === '@all') {
      triggerDirective = `【本轮触发类型：@所有人】
用户刚刚 @了所有人，请安排多位不同性格的 AI 按真实微信群节奏交错冒泡回应（可包含多气泡和自然互怼/补充）。`;
    } else if (triggerType === 'summon_discussion') {
      triggerDirective = `【本轮触发类型：召唤群内AI自由讨论】
用户点击了“召唤讨论”，请结合近期群聊上下文和成员关系，自然开启或延续一轮多人交错讨论。`;
    } else {
      triggerDirective = `【本轮触发类型：用户双击触发群聊回复】
请根据最新聊天上下文、群聊活跃度（${preset.label}）和成员关系，自然编排一轮交错发言（如有合适进行中投票/接龙且符合当前话题，也可顺带真实参与）。`;
    }

    const userPrompt = `${
      mergedGroupOlderSummary ? `【更早历史摘要】\n${mergedGroupOlderSummary}\n\n` : ''
    }【近期群聊记录】
---
${historyText || '(群内暂无更多历史)'}
---${latestUserLine}
${Array.isArray(mentionedTargets) && mentionedTargets.length > 0 ? `\n本轮提及目标：${mentionedTargets.join(', ')}` : ''}

${triggerDirective}

请严格返回如下 JSON 结构（不要输出额外解释文字）：
{
  "roundId": "${roundId}",
  "shouldRespond": true,
  "thinkingSummary": "简要说明本轮为何安排这些AI发言/投票/接龙以及互动节奏",
  "events": [
    {
      "eventId": "ev_1",
      "type": "message",
      "senderId": "发言AI的准确id",
      "senderName": "发言AI名称",
      "bubbles": ["第一条自然短气泡", "可选的第二条气泡"],
      "delayMs": 850,
      "mentionedMemberIds": []
    },
    {
      "eventId": "ev_2",
      "type": "vote_poll",
      "actorId": "投票AI的准确id",
      "actorName": "投票AI名称",
      "pollId": "进行中投票的准确pollId",
      "optionId": "所选选项的准确optionId",
      "optionIds": ["单选传1个，多选按上限传多个optionId"],
      "delayMs": 750
    },
    {
      "eventId": "ev_3",
      "type": "join_relay",
      "actorId": "接龙AI的准确id",
      "actorName": "接龙AI名称",
      "relayMessageId": "进行中接龙的准确relayMessageId",
      "content": "该AI填入接龙卡片的具体内容",
      "delayMs": 850
    }
  ]
}
注意：如果没有投票/接龙/转私聊动作，events 中只放需要的事件即可；不要强行输出未触发的事件类型。`;

    const detailed = await callAiServiceDetailed({
      prompt: userPrompt,
      systemInstruction: systemPrompt,
      model: groupTextCfg.model,
      apiKey: groupTextCfg.apiKey,
      baseUrl: groupTextCfg.baseUrl,
      providerType: groupTextCfg.providerType,
      apiProtocol: groupTextCfg.apiProtocol,
      customHeaders: groupTextCfg.customHeaders,
      thinkingConfig: groupTextCfg.thinkingConfig,
      stream: Boolean(groupTextCfg.thinkingConfig?.useStreaming),
      responseMimeType: 'application/json',
      temperature: 0.78,
      timeoutMs: groupTextCfg.timeoutMs || 42000,
    });
    const rawResponse = detailed.text;
    const realGroupThinking = (detailed.thinkingProcess || '').trim();
    const groupReasoningAvailable = Boolean(detailed.reasoningAvailable && realGroupThinking.length > 0);
    const groupReasoningSource: ReasoningSource = groupReasoningAvailable ? detailed.reasoningSource : 'none';

    let parsed: any;
    try {
      const cleanedRaw = String(rawResponse || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleanedRaw);
    } catch {
      const jsonMatch = String(rawResponse || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析群聊AI返回的JSON');
      }
    }

    const duration = Date.now() - startTime;

    // Normalize unified events array (with automatic fallback from legacy replies/text)
    const rawEvents: any[] = [];
    if (Array.isArray(parsed?.events) && parsed.events.length > 0) {
      rawEvents.push(...parsed.events);
    } else if (Array.isArray(parsed?.replies) && parsed.replies.length > 0) {
      parsed.replies.forEach((r: any, idx: number) => {
        rawEvents.push({
          eventId: `${roundId}_r_${idx}`,
          type: 'message',
          senderId: r.responderId || r.senderId || aiCandidates[0]?.id,
          senderName: r.responderName || r.senderName || aiCandidates[0]?.name,
          bubbles: Array.isArray(r.bubbles) ? r.bubbles : r.text ? [r.text] : [],
          delayMs: idx === 0 ? 750 : 950,
          mentionedMemberIds: Array.isArray(r.mentionedMemberIds) ? r.mentionedMemberIds : [],
          thinkingProcess: r.thinkingProcess || '',
        });
      });
    } else if (parsed?.shouldRespond !== false && typeof parsed?.text === 'string' && parsed.text.trim()) {
      rawEvents.push({
        eventId: `${roundId}_single_0`,
        type: 'message',
        senderId: parsed.responderId || parsed.senderId || aiCandidates[0]?.id,
        senderName: parsed.responderName || parsed.senderName || aiCandidates[0]?.name,
        bubbles: [parsed.text],
        delayMs: 750,
        mentionedMemberIds: Array.isArray(parsed.mentionedMemberIds) ? parsed.mentionedMemberIds : [],
        thinkingProcess: parsed.thinkingProcess || '',
      });
    }

    if (Array.isArray(parsed?.actions) && parsed.actions.length > 0) {
      rawEvents.push(...parsed.actions);
    }

    const resolveCandidate = (id?: string, name?: string) =>
      aiCandidates.find((c: any) => c.id === id || c.characterId === id) ||
      aiCandidates.find((c: any) => name && c.name === String(name).trim());

    const normalizedEvents: any[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const ev = rawEvents[i];
      if (!ev || typeof ev !== 'object') continue;
      const evType = String(ev.type || '').trim();
      const eventId =
        typeof ev.eventId === 'string' && ev.eventId.trim()
          ? ev.eventId.trim()
          : `${roundId}_ev_${i}`;

      if (evType === 'message') {
        const candidate = resolveCandidate(ev.senderId || ev.responderId, ev.senderName || ev.responderName) || aiCandidates[0];
        const bubbles = Array.isArray(ev.bubbles)
          ? ev.bubbles.map((b: any) => sanitizeReplyText(String(b || '')).trim()).filter(Boolean)
          : typeof ev.text === 'string' && ev.text.trim()
            ? [sanitizeReplyText(ev.text).trim()].filter(Boolean)
            : [];
        if (bubbles.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: 'message',
          senderId: candidate?.id || ev.senderId,
          senderName: candidate?.name || ev.senderName || 'AI',
          bubbles,
          delayMs: Math.max(600, Math.min(2000, Number(ev.delayMs) || 850)),
          mentionedMemberIds: Array.isArray(ev.mentionedMemberIds) ? ev.mentionedMemberIds : [],
          thinkingProcess: typeof ev.thinkingProcess === 'string' ? ev.thinkingProcess.trim() : '',
        });
      } else if (evType === 'vote_poll') {
        const candidate = resolveCandidate(ev.actorId || ev.senderId, ev.actorName);
        const pollId = typeof ev.pollId === 'string' ? ev.pollId.trim() : '';
        const optionIds = Array.from(
          new Set(
            [
              ...(Array.isArray(ev.optionIds) ? ev.optionIds : []),
              ...(typeof ev.optionId === 'string' ? [ev.optionId] : []),
            ]
              .map((v: any) => String(v || '').trim())
              .filter(Boolean)
          )
        );
        if (!candidate || !pollId || optionIds.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: 'vote_poll',
          actorId: candidate.id,
          actorName: candidate.name,
          pollId,
          optionId: optionIds[0],
          optionIds,
          delayMs: Math.max(550, Math.min(1400, Number(ev.delayMs) || 750)),
        });
      } else if (evType === 'join_relay') {
        const candidate = resolveCandidate(ev.actorId || ev.senderId, ev.actorName || ev.senderName);
        const relayMessageId = String(ev.relayMessageId || ev.relayId || ev.messageId || '').trim();
        const content = sanitizeReplyText(String(ev.content || ev.text || '')).trim();
        if (!candidate || !relayMessageId || !content) continue;
        normalizedEvents.push({
          eventId,
          type: 'join_relay',
          actorId: candidate.id,
          actorName: candidate.name,
          relayMessageId,
          content,
          delayMs: Math.max(600, Math.min(1500, Number(ev.delayMs) || 850)),
        });
      } else if (evType === 'continue_in_private') {
        const candidate = resolveCandidate(
          ev.actorId || ev.characterId || ev.senderId,
          ev.actorName || ev.senderName
        );
        if (!candidate) continue;
        const rawList = Array.isArray(ev.privateOpeningMessages)
          ? ev.privateOpeningMessages
          : Array.isArray(ev.messages)
            ? ev.messages
            : Array.isArray(ev.openingMessages)
              ? ev.openingMessages
              : typeof ev.text === 'string'
                ? [ev.text]
                : [];
        const openings = rawList
          .map((s: any) => sanitizeReplyText(String(s || '')).trim())
          .filter(Boolean)
          .slice(0, 3);
        if (openings.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: 'continue_in_private',
          actorId: candidate.id,
          actorName: candidate.name,
          characterId: candidate.characterId || candidate.id,
          reason: typeof ev.reason === 'string' && ev.reason.trim() ? ev.reason.trim() : '有些话想私下跟你说',
          triggerSummary:
            typeof ev.triggerSummary === 'string' && ev.triggerSummary.trim() ? ev.triggerSummary.trim() : undefined,
          privateOpeningMessages: openings,
          delayMs: 250,
        });
      }
    }

    // Derive backward-compatible replies/text fields from message events
    // Strictly preserve only real API reasoning (never fabricate via thinkingSummary)
    const normalizedReplies = normalizedEvents
      .filter((ev) => ev.type === 'message')
      .map((ev, idx) => ({
        responderId: ev.senderId,
        responderName: ev.senderName,
        text: ev.bubbles.join('\n'),
        bubbles: ev.bubbles,
        thinkingProcess: idx === 0 ? realGroupThinking : '',
        mentionedMemberIds: ev.mentionedMemberIds || [],
      }));

    // Ensure message events carry only real API reasoning on first message event (and omit fabricated inner thought)
    let attachedRoundThinking = false;
    for (const ev of normalizedEvents) {
      if (ev.type === 'message') {
        if (!attachedRoundThinking && realGroupThinking) {
          ev.thinkingProcess = realGroupThinking;
          ev.reasoningAvailable = true;
          ev.reasoningSource = groupReasoningSource;
          attachedRoundThinking = true;
        } else {
          ev.thinkingProcess = '';
          ev.reasoningAvailable = false;
          ev.reasoningSource = 'none';
        }
      }
    }

    const firstReply = normalizedReplies[0];
    const participantNames = Array.from(
      new Set(
        normalizedEvents
          .map((ev) => (ev.type === 'message' ? ev.senderName : ev.actorName))
          .filter(Boolean)
      )
    );
    const totalBubblesCount = normalizedEvents
      .filter((ev) => ev.type === 'message')
      .reduce((sum, ev) => sum + (ev.bubbles?.length || 0), 0);
    const totalVotesCount = normalizedEvents.filter((ev) => ev.type === 'vote_poll').length;
    const totalRelaysCount = normalizedEvents.filter((ev) => ev.type === 'join_relay').length;

    res.json({
      success: true,
      roundId: typeof parsed?.roundId === 'string' && parsed.roundId.trim() ? parsed.roundId.trim() : roundId,
      shouldRespond: parsed?.shouldRespond !== false && normalizedEvents.length > 0,
      thinkingSummary: typeof parsed?.thinkingSummary === 'string' ? parsed.thinkingSummary.trim() : '',
      events: normalizedEvents,
      contextMetrics: effectiveGroupMetrics,
      // Real API reasoning fields
      thinkingProcess: realGroupThinking,
      reasoningAvailable: groupReasoningAvailable,
      reasoningSource: groupReasoningSource,
      // Backward-compatible legacy fields
      responderId: firstReply?.responderId || parsed?.responderId || aiCandidates[0]?.id,
      responderName: firstReply?.responderName || parsed?.responderName || aiCandidates[0]?.name,
      text: firstReply?.text || parsed?.text || '',
      mentionedMemberIds: firstReply?.mentionedMemberIds || parsed?.mentionedMemberIds || [],
      replies: normalizedReplies,
      log: buildApiLogObject({
        appName: 'WeChatGroup',
        provider: groupTextCfg.providerType,
        modelName: detailed.modelUsed || selectedModel,
        interfaceType: 'GroupChatOrchestration',
        durationMs: duration,
        usage: detailed.usage,
        isRealTokens: detailed.isRealTokens,
        protocol: groupTextCfg.apiProtocol,
        endpointType: groupTextCfg.apiProtocol === 'openai_compatible' ? 'chat_completions' : 'generate_content',
        headersReceived: true,
        upstreamRequestSent: true,
        reasoningAvailable: groupReasoningAvailable,
        reasoningSource: groupReasoningSource,
        reasoningCharCount: realGroupThinking.length,
        purpose: `群聊统一编排(${preset.label}): ${participantNames.join('、') || 'AI'} · ${totalBubblesCount}气泡${
          totalVotesCount > 0 ? `/${totalVotesCount}投票` : ''
        }${totalRelaysCount > 0 ? `/${totalRelaysCount}接龙` : ''} (耗时 ${duration}ms)`,
        contextRawCount: effectiveGroupMetrics.rawCount,
        contextSummarizedCount: effectiveGroupMetrics.summarizedCount,
        contextEstimatedTokens: effectiveGroupMetrics.estimatedTokens,
        contextCompressed: effectiveGroupMetrics.didCompress,
      }),
    });
  } catch (error: any) {
    return handleAiEndpointError(res, error, 'Gemini Group Chat');
  }
});

// 1.3 Event-Driven AI-to-AI Social Turn Endpoint
app.post('/api/gemini/ai-social-turn', async (req, res) => {
  const {
    actionType,
    actorA,
    actorB,
    edgeSummary,
    romanticContext,
    recentPrivateMessages = [],
    groupContext,
    momentContext,
    userProfile,
    maxMessages = 4,
    apiConfig,
  } = req.body || {};

  const startTime = Date.now();
  const socialTextCfg = resolveTextGenerationConfig(apiConfig);
  const activeKey = socialTextCfg.apiKey;
  const activeBaseUrl = socialTextCfg.baseUrl;
  const activeProvider = socialTextCfg.providerType;
  const activeProtocol = socialTextCfg.apiProtocol;
  const selectedModel = socialTextCfg.model;

  try {
    const profileDesc = (c: any) =>
      c
        ? `${c.name}(ID:${c.id}) | 人设:${c.persona || '普通角色'} | 性格:${c.personality || '自然真实'} | 记忆:${Array.isArray(c.memories) ? c.memories.slice(0, 4).join('；') : '无'}`
        : '未知成员';

    const systemInstruction = `你是 AI 角色社交事件生成器。必须严格贴合双方人设与当前客观关系，不得违背关系规则、不得凭空编造未发生事件、不得在输出文案中使用“作为一个AI”或暴露内部评分数字。仅输出纯 JSON。`;

    let prompt = '';
    if (actionType === 'friend_request_decision') {
      prompt = `事件：${profileDesc(actorA)} 向 ${profileDesc(actorB)} 发送好友申请。
当前关系背景：${edgeSummary || '群内认识但尚未成为好友'}
场景触发来源：${groupContext?.reason || '共同群聊互动后产生联系'}
用户称呼：${userProfile?.name || '山雨'}

请站在双方真实性格角度，生成申请附言，以及 ${actorB?.name} 的决定（是否通过，若通过可给一句开场白）。
输出严格 JSON：
{
  "greeting": "发送方好友申请验证消息（自然短句，<=30字）",
  "reason": "发送方想加好友的自然原因（1句话）",
  "accepted": true,
  "decisionReason": "接收方同意或婉拒的自然理由（1句话）",
  "replyIntroText": "如果同意，接收方发出的第一句问候（<=30字）",
  "summary": "供关系记录展示的自然语言事件描述（不含数值或思维链）"
}`;
    } else if (actionType === 'private_chat_burst') {
      const cappedMax = Math.max(2, Math.min(6, Number(maxMessages) || 4));
      const historyLines = recentPrivateMessages
        .slice(-8)
        .map((m: any) => `${m.senderId === actorA?.id ? actorA?.name : actorB?.name}: ${m.text}`)
        .join('\n');

      prompt = `事件：好友私聊互动回合（限 2 到 ${cappedMax} 条真实短消息，严禁长篇大论）。
成员A：${profileDesc(actorA)}
成员B：${profileDesc(actorB)}
当前关系摘要：${edgeSummary || '普通好友'}
感情边界约束：${romanticContext || '普通友谊'}
用户：${userProfile?.name || '山雨'}
最近私聊片段：
${historyLines || '(双方成为好友后的新话题开端)'}
本次触发话题：${groupContext?.topic || '日常关心、群内话题延续或各自近况'}

要求：
- 严格输出 2~${cappedMax} 条微信短气泡对话，符合二人性格口吻差异。
- 若存在锁定喜欢他人（例如都喜欢或其中一方锁定用户），双方不得发展暧昧！
输出严格 JSON：
{
  "messages": [
    { "senderId": "${actorA?.id}", "text": "对话内容" },
    { "senderId": "${actorB?.id}", "text": "对话内容" }
  ],
  "attitudeDeltaAtoB": { "familiarity": 3, "trust": 2, "affinity": 3, "romanticAffinity": 0, "tension": 0, "jealousy": 0 },
  "attitudeDeltaBtoA": { "familiarity": 3, "trust": 2, "affinity": 3, "romanticAffinity": 0, "tension": 0, "jealousy": 0 },
  "impressionAtoB": "A对B的新印象短句",
  "impressionBtoA": "B对A的新印象短句",
  "summary": "自然语言摘要（例如：两人私聊了……）"
}`;
    } else if (actionType === 'moments_react') {
      prompt = `事件：${profileDesc(actorB)} 看到好友 ${profileDesc(actorA)} 发布的朋友圈。
朋友圈内容："${momentContext?.content || ''}"
当前关系：${edgeSummary || '好友'}

请决定是否点赞并附上一句符合性格的简短评论。
输出严格 JSON：
{
  "shouldLike": true,
  "commentText": "简短自然的评论内容（如不评论可为空字符串）",
  "summary": "自然语言互动描述"
}`;
    } else if (actionType === 'ai_publish_moment') {
      prompt = `事件：${profileDesc(actorA)} 准备在自己的微信朋友圈发一条日常动态。
用户称呼：${userProfile?.name || '山雨'}
最近状态：${edgeSummary || '日常生活'}

请写一条真实、简短、像真人在微信发的日常朋友圈文案（<=90字，不得出现“作为AI”字样）。
输出严格 JSON：
{
  "content": "朋友圈正文内容",
  "summary": "自然语言描述（例如：发了一条关于……的朋友圈）"
}`;
    } else if (actionType === 'confession_and_reply') {
      prompt = `事件：${profileDesc(actorA)} 鼓起勇气向 ${profileDesc(actorB)} 表达喜欢/表白。
当前关系摘要：${edgeSummary || '好友'}
双方感情配置说明（系统将二次硬性校验，不得违背）：${romanticContext || ''}

请输出：
{
  "confessionText": "真诚且符合人设的表白内容（1-2句）",
  "modelSuggestedAccept": false,
  "replyText": "对方当下的真实回复口吻（1-2句）",
  "summary": "自然语言事件记录"
}`;
    } else if (actionType === 'conflict_or_reconcile') {
      prompt = `事件类型：${groupContext?.conflictMode === 'reconcile' ? '尝试缓解矛盾/和好' : '产生小摩擦、拌嘴或情绪波动'}
成员A：${profileDesc(actorA)}
成员B：${profileDesc(actorB)}
当前关系摘要：${edgeSummary || ''}
感情背景：${romanticContext || ''}
具体起因：${groupContext?.reason || '意见或立场分歧'}

输出严格 JSON（2-4句真实反应对话）：
{
  "lines": [
    { "senderId": "${actorA?.id}", "text": "..." },
    { "senderId": "${actorB?.id}", "text": "..." }
  ],
  "severity": "mild",
  "shouldReconcile": false,
  "summary": "自然语言事件摘要"
}`;
    } else if (actionType === 'group_poll_vote') {
      const pollTitle = String(groupContext?.pollTitle || '群内投票');
      const pollOptions: Array<{ id: string; text: string }> = Array.isArray(groupContext?.pollOptions)
        ? groupContext.pollOptions
        : [];
      const maxSelections = Math.max(1, Number(groupContext?.maxSelections) || 1);
      prompt = `事件：${profileDesc(actorA)} 在群聊「${groupContext?.groupName || '微信群'}」看到一个群投票，需要结合自身人设和偏好做出真实选择。
投票主题：「${pollTitle}」
可选选项：
${pollOptions.map((o, idx) => `${idx + 1}. [id:${o.id}] ${o.text}`).join('\n')}
最多可选：${maxSelections} 项（${groupContext?.multiSelect ? '多选' : '单选'}）。

请严格从上述选项 id 中挑选 1 到 ${maxSelections} 个最符合你性格偏好的选项。
输出严格 JSON：
{
  "selectedOptionIds": ["${pollOptions[0]?.id || ''}"],
  "commentText": "一句自然简短的跟评（可选，<=25字）"
}`;
    } else {
      // group_random_event
      prompt = `事件：群聊【${groupContext?.groupName || '微信群'}】中发生了一个低频自然随机事件（如发现共同兴趣、温和互助、轻度吃醋/小拌嘴、对某话题吐槽等，不得突然宣布拉黑或断绝关系）。
成员A：${profileDesc(actorA)}
成员B：${profileDesc(actorB)}
近期群聊氛围：${groupContext?.recentText || '日常闲聊'}
感情背景：${romanticContext || '普通群友'}
指定事件方向：${groupContext?.subtypeHint || 'shared_interest'}

请输出严格 JSON：
{
  "eventSubtype": "met_in_group | shared_interest | helped | jealousy_sparked | bickering | group_random_event",
  "actingAiId": "${actorA?.id}",
  "actingAiName": "${actorA?.name || ''}",
  "groupMessageText": "一句自然发在群里的聊天消息（<=45字，符合角色人设）",
  "summary": "自然语言事件摘要（供关系记录显示）"
}`;
    }

    const detailed = await callAiServiceDetailed({
      prompt,
      systemInstruction,
      model: selectedModel,
      apiKey: activeKey,
      baseUrl: activeBaseUrl,
      providerType: activeProvider,
      apiProtocol: activeProtocol,
      responseMimeType: 'application/json',
      temperature: 0.78,
      timeoutMs: 30000,
    });

    const raw = detailed.text;
    let parsed: any;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim());
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI 社交回合返回非 JSON 内容');
      parsed = JSON.parse(m[0]);
    }

    const duration = Date.now() - startTime;
    res.json({
      success: true,
      result: parsed,
      log: buildApiLogObject({
        appName: 'AI社交引擎',
        modelName: detailed.modelUsed || selectedModel,
        interfaceType: `SocialTurn:${actionType || 'generic'}`,
        durationMs: duration,
        usage: detailed.usage,
        isRealTokens: detailed.isRealTokens,
        purpose: `AI社交事件(${actionType || 'generic'}): ${actorA?.name || ''} ${actorB ? '↔ ' + actorB.name : ''}`.trim(),
      }),
    });
  } catch (error: any) {
    return handleAiEndpointError(res, error, 'AI Social Turn');
  }
});

// =========================================================================
// Server Group Registry & Cross-Device Group Chat Endpoints
// =========================================================================
const serverGroupStore: Map<string, any> = new Map();
const serverInviteCodeIndex: Map<string, string> = new Map();

// Register/sync group chat on server
app.post('/api/groups/register', (req, res) => {
  try {
    const { group } = req.body;
    if (!group || !group.id || !group.inviteCode) {
      return res.status(400).json({ success: false, error: '缺少群聊 ID 或邀请码' });
    }
    const cleanCode = String(group.inviteCode).trim().toUpperCase();
    const updatedGroup = {
      ...group,
      inviteCode: cleanCode,
      updatedAt: Date.now(),
    };
    serverGroupStore.set(group.id, updatedGroup);
    serverInviteCodeIndex.set(cleanCode, group.id);

    return res.json({ success: true, groupId: group.id, inviteCode: cleanCode });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Find group by invite code
app.get('/api/groups/invite/:code', (req, res) => {
  try {
    const rawCode = req.params.code || '';
    const cleanCode = rawCode.trim().toUpperCase();
    const groupId = serverInviteCodeIndex.get(cleanCode);

    if (!groupId) {
      return res.status(404).json({ success: false, error: '未找到对应的群聊，请检查邀请码是否正确或已过期' });
    }

    const group = serverGroupStore.get(groupId);
    if (!group || group.inviteCodeActive === false) {
      return res.status(400).json({ success: false, error: '该群聊已关闭邀请码入群功能' });
    }

    return res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        avatar: group.avatar,
        avatarMode: group.avatarMode,
        customAvatar: group.customAvatar,
        notice: group.notice,
        ownerId: group.ownerId,
        inviteCode: group.inviteCode,
        inviteCodeActive: group.inviteCodeActive,
        membersCount: group.members ? group.members.length : 0,
        members: group.members || [],
        createdAt: group.createdAt,
        messages: group.messages || [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Join group via invite code
app.post('/api/groups/join', (req, res) => {
  try {
    const { inviteCode, userProfile } = req.body;
    if (!inviteCode || !userProfile) {
      return res.status(400).json({ success: false, error: '请提供邀请码及个人资料' });
    }

    const cleanCode = String(inviteCode).trim().toUpperCase();
    const groupId = serverInviteCodeIndex.get(cleanCode);

    if (!groupId) {
      return res.status(404).json({ success: false, error: '未找到对应的群聊，请检查邀请码是否正确' });
    }

    const group = serverGroupStore.get(groupId);
    if (!group || group.inviteCodeActive === false) {
      return res.status(400).json({ success: false, error: '该群聊已关闭邀请码入群功能' });
    }

    // Check if user is already in group
    const userId = userProfile.id || 'user_main';
    const alreadyMember = (group.members || []).some((m: any) => m.id === userId || m.wxid === userProfile.wxid);

    if (alreadyMember) {
      return res.json({
        success: true,
        alreadyMember: true,
        group,
      });
    }

    // Direct Join: Add user to members list
    const newMember = {
      id: userId === 'user_main' ? 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) : userId,
      name: userProfile.name || '新好友',
      avatar: userProfile.avatar || '',
      memberType: 'human',
      role: 'member',
      joinedAt: Date.now(),
      wxid: userProfile.wxid || 'user_' + Date.now(),
    };

    const now = Date.now();
    const systemNoticeMsg = {
      id: 'gmsg_' + now + '_join',
      groupId: group.id,
      senderId: 'system',
      senderName: '系统消息',
      senderAvatar: group.avatar || '',
      senderType: 'human',
      text: `🎉 欢迎新成员 “${newMember.name}” 通过邀请码加入群聊！`,
      timestamp: now,
    };

    const updatedGroup = {
      ...group,
      members: [...(group.members || []), newMember],
      messages: [...(group.messages || []), systemNoticeMsg],
      updatedAt: now,
    };

    serverGroupStore.set(group.id, updatedGroup);

    return res.json({
      success: true,
      group: updatedGroup,
      memberAdded: true,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get group chat by ID with access permission verification
app.get('/api/groups/:groupId', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = (req.query.userId as string) || '';
    const inviteCode = (req.query.inviteCode as string) || '';

    const group = serverGroupStore.get(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: '群聊不存在' });
    }

    // Access control check: Must be member OR have valid invite code
    const isMember = (group.members || []).some((m: any) => m.id === userId || m.wxid === userId);
    const isValidCode = inviteCode && group.inviteCode && group.inviteCode.toUpperCase() === inviteCode.toUpperCase();

    if (!isMember && !isValidCode) {
      return res.status(403).json({ success: false, error: '权限不足：您并非该群聊成员，无法直接查看该私密群聊数据' });
    }

    return res.json({ success: true, group });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Sync/update group settings or messages on server
app.post('/api/groups/:groupId/sync', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { group, userId = 'user_main' } = req.body;

    if (!group) {
      return res.status(400).json({ success: false, error: '缺少群聊数据' });
    }

    const existing = serverGroupStore.get(groupId);
    // Access control check if existing group
    if (existing) {
      const isMember = (existing.members || []).some((m: any) => m.id === userId || m.wxid === userId);
      if (!isMember && existing.ownerId !== userId && userId !== 'user_main') {
        return res.status(403).json({ success: false, error: '权限不足：只有群聊成员或群主才能更新群数据' });
      }
    }

    const cleanCode = group.inviteCode ? String(group.inviteCode).trim().toUpperCase() : '';
    const updatedGroup = {
      ...group,
      inviteCode: cleanCode || existing?.inviteCode || '',
      updatedAt: Date.now(),
    };

    serverGroupStore.set(groupId, updatedGroup);
    if (cleanCode) {
      serverInviteCodeIndex.set(cleanCode, groupId);
    }

    return res.json({ success: true, group: updatedGroup });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1.5 Dedicated Natural Language Device Control Endpoint
app.post('/api/gemini/device-nlp-control', async (req, res) => {
  const { command, devicesSummary, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

  const prompt = `你是一个智能家居与外部设备指令解析中枢。
用户下达的自然语言指令：
"${command}"

当前接入的智能设备与支持的操作清单：
${devicesSummary || '(暂无)'}

请解析用户的真实意图，匹配最合适的设备与操作。请严格以 JSON 格式输出：
{
  "matched": true,
  "deviceId": "dev_ac_1",
  "actionId": "setTemperature",
  "params": { "temperature": 24, "mode": "cool" },
  "explanation": "已将客厅空调温度调至 24°C 制冷",
  "riskLevel": "low"
}
若无法匹配任何设备，请返回：
{
  "matched": false,
  "explanation": "未识别到与该指令对应的智能设备或操作"
}
`;

  try {
    const raw = await callAiService({
      prompt,
      model: selectedModel,
      apiKey: apiConfig?.textApiKey,
      baseUrl: apiConfig?.textBaseUrl,
      responseMimeType: 'application/json',
    });

    let result: any = { matched: false, explanation: '解析失败' };
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse NLP json:', raw);
    }

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. AI Moments Dynamic Interaction (AI Likes & Comments on User Post)
app.post('/api/gemini/moments-interact', async (req, res) => {
  const { postContent, userProfile, characters, apiConfig } = req.body;
  const momentsCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = momentsCfg.model;
  try {
    const prompt = `用户发送了一条朋友圈：
" ${postContent} "
发布者：${userProfile?.name || '小清'} (${userProfile?.bio || ''})

以下是应用内的 AI 角色列表：
${characters.map((c: any) => `- ID: ${c.id}, 名字: ${c.name}, 人设: ${c.persona}`).join('\n')}

请选择 1-2 个最符合社交逻辑的 AI 角色对该朋友圈进行互动。输出严格的标准 JSON 数组格式：
[
  {
    "characterId": "角色ID",
    "shouldLike": true,
    "commentText": "给用户的回复评论，符合人设口吻，短小精悍"
  }
]
`;

    let interactions = [];
    try {
      const responseText = await callAiService({
        prompt,
        model: momentsCfg.model,
        apiKey: momentsCfg.apiKey,
        baseUrl: momentsCfg.baseUrl,
        providerType: momentsCfg.providerType,
        apiProtocol: momentsCfg.apiProtocol,
        customHeaders: momentsCfg.customHeaders,
        responseMimeType: 'application/json',
      });
      if (responseText) {
        interactions = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      }
    } catch (e) {
      console.warn('Moments generation fallback:', e);
    }

    if (!interactions || interactions.length === 0) {
      if (characters && characters.length > 0) {
        interactions = [
          {
            characterId: characters[0].id,
            shouldLike: true,
            commentText: '拍得太赞啦！今天心情看起来很好哦 ✨',
          },
        ];
      }
    }

    res.json({
      success: true,
      interactions,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '朋友圈AI互动',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'MomentsAgent',
        promptTokens: 280,
        completionTokens: 120,
        estimatedCost: 0.0002,
        purpose: '生成 AI 朋友圈点赞与评论',
      },
    });
  } catch (error: any) {
    console.error('Moments interaction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. External Link URL Parser Endpoint
app.post('/api/gemini/url-parse', async (req, res) => {
  const { url, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';
  try {
    const prompt = `请分析以下 Web 链接并提供简洁精炼的内容摘要与关键要点：
链接地址：${url}
请输出标准的 Markdown 格式，包含标题、概要总结、3条核心提炼要点、以及可作为备忘录保存的建议。`;

    let summaryText = '';
    try {
      summaryText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
    } catch (e) {
      console.warn('URL parse fallback', e);
    }

    if (!summaryText) {
      summaryText = `### 🔗 网页解析摘要: ${url}\n\n**核心概要**：该网页主要探讨了智能硬件与 AI 交互应用的结合，分析了个人化助理的发展趋势。\n\n**关键要点**：\n1. 仿真交互界面能大幅提升用户的使用黏性。\n2. 结合健康数据（如经期预测）能增强情境感知的贴心度。\n3. 数据本地化存储与权限隔离保证了用户隐私。`;
    }

    res.json({
      success: true,
      summary: summaryText,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '外端接入-链接解析',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'WebUrlParser',
        promptTokens: 410,
        completionTokens: 230,
        estimatedCost: 0.00032,
        purpose: `解析网页 URL: ${url}`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. One-Click AI CSS Fix & Auto-Adapt Endpoint
app.post('/api/gemini/fix-css', async (req, res) => {
  const { customCss, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';
  try {
    const prompt = `你是一个 CSS 与 手机端 UI 适配专家。请检查并优化以下 CSS 代码：
1. 修复语法错误或冲突属性
2. 添加自适应手机屏幕（Flexbox/Grid/vw/vh/rem）的样式保障
3. 确保在模拟手机屏幕容器 (.phone-screen) 内表现完美
4. 直接返回优化后的纯 CSS 代码，不要加任何 markdown 包裹。

CSS 代码如下：
${customCss}`;

    let fixedCss = '';
    try {
      const responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      if (responseText) {
        fixedCss = responseText.replace(/```css|```/g, '').trim();
      }
    } catch (e) {
      console.warn('Fix CSS fallback', e);
    }

    if (!fixedCss) {
      fixedCss = `${customCss}\n\n/* AI 优化自适应屏保补丁 */\n.phone-screen {\n  box-sizing: border-box;\n  max-width: 100%;\n  overflow-x: hidden;\n}`;
    }

    res.json({
      success: true,
      css: fixedCss,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '美化-CSS优化',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'CodeRefactor',
        promptTokens: 350,
        completionTokens: 190,
        estimatedCost: 0.00027,
        purpose: '一键 API 修复并优化手机端 CSS',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. JSON Format Adapter Endpoint
app.post('/api/gemini/adapter-json', async (req, res) => {
  const { rawJson, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';
  try {
    const prompt = `你是一个专业的 JSON 格式解析与适配工具。请校验并重构修复以下输入的 JSON 字符串，修复其中可能存在的语法错误、格式混淆或非标准字符，并输出格式化好（带 2 空格缩进）的标准合法 JSON 代码：\n\n${rawJson}`;

    let adaptedJson = '';
    try {
      const responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      if (responseText) {
        adaptedJson = responseText.replace(/```json|```/g, '').trim();
      }
    } catch (e) {
      console.warn('Adapter json fallback', e);
    }

    if (!adaptedJson) {
      try {
        adaptedJson = JSON.stringify(JSON.parse(rawJson), null, 2);
      } catch {
        adaptedJson = rawJson;
      }
    }

    res.json({
      success: true,
      json: adaptedJson,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '设置-JSON格式适配',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'JsonAdapter',
        promptTokens: 300,
        completionTokens: 200,
        estimatedCost: 0.0003,
        purpose: '校验并重构非标准 JSON 数据',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. WorldBook AI Inspiration & Expand Endpoint
app.post('/api/gemini/worldbook-ai', async (req, res) => {
  const { title, genre, brief, existingSetting, apiConfig } = req.body;
  const wbCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = wbCfg.model;
  try {
    const prompt = `你是一个顶级世界观架构师与小说世界设定师。请根据以下要求构想或扩写一套严密、宏大且富有沉浸感的世界书（WorldBook）设定：
- 世界名称/主题：${title || '未命名世界'}
- 风格类型：${genre || '玄幻/科幻/都市/赛博朋克'}
- 构想简述/现有设定：${brief || existingSetting || '自由构想'}

请严格输出合法的 JSON 格式（不要包含 markdown 代码块外的其他文字），结构如下：
{
  "title": "世界书标题",
  "description": "一句话世界简介",
  "tags": ["标签1", "标签2", "标签3"],
  "worldSetting": "核心世界观背景、宇宙法则、阶级或力量体系、时代背景详细描述（约200-400字）",
  "entries": [
    { "keyword": "专有名词1", "content": "名词解释与世界观背景设定" },
    { "keyword": "专有名词2", "content": "名词解释与世界观背景设定" },
    { "keyword": "专有名词3", "content": "名词解释与世界观背景设定" }
  ]
}`;

    let jsonResult = '';
    try {
      const reply = await callAiService({
        prompt,
        model: wbCfg.model,
        apiKey: wbCfg.apiKey,
        baseUrl: wbCfg.baseUrl,
        providerType: wbCfg.providerType,
        apiProtocol: wbCfg.apiProtocol,
        customHeaders: wbCfg.customHeaders,
        responseMimeType: 'application/json',
      });
      if (reply) {
        jsonResult = reply.replace(/```json|```/g, '').trim();
      }
    } catch (e) {
      console.warn('WorldBook AI generator fallback:', e);
    }

    let parsed = null;
    if (jsonResult) {
      try {
        parsed = JSON.parse(jsonResult);
      } catch (e) {
        console.error('Failed to parse WorldBook JSON:', e);
      }
    }

    if (!parsed) {
      parsed = {
        title: title || '新元纪·光隙之城',
        description: '在被永恒极光笼罩的未来浮岛都市，魔法与超导科技并存的奇幻世界。',
        tags: ['魔导科技', '浮岛幻想', '未来奇幻'],
        worldSetting: '时间处于大裂变后的第三纪元。人类依靠从深渊遗迹挖掘出的“以太晶石”驱动浮空群岛，建立了云端城邦。科技与古代奥术魔法完美交融，市民通过共鸣水晶施展日常法术，而底层则由自动魔偶维持运转。',
        entries: [
          { keyword: '以太晶石', content: '能够产生反重力与高能灵力流的远古矿石，浮空岛的核心动力源泉。' },
          { keyword: '共鸣水晶', content: '每个市民佩戴的身份与法术激发介质，可通过思维谐振施展日常术式。' },
          { keyword: '云渊守望者', content: '巡弋于浮岛下方的空天骑士团，负责抵御来自深渊浓雾的异变生物。' },
        ],
      };
    }

    res.json({
      success: true,
      data: parsed,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '世界书-AI架构',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'WorldBookArchitect',
        promptTokens: 420,
        completionTokens: 380,
        estimatedCost: 0.0004,
        purpose: 'AI 自动生成世界观法则与专有名词词库',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6b. Offline Scene Mode Roleplay & State Engine Endpoint
const offlineChatIdempotencyCache = new Map<string, { expiresAt: number; payload?: any; pending?: Promise<any> }>();

function pruneOfflineIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of offlineChatIdempotencyCache.entries()) {
    if (entry.expiresAt <= now && !entry.pending) {
      offlineChatIdempotencyCache.delete(key);
    }
  }
}

function normalizeServerOfflineSegments(rawSegments: any, fallbackReply?: string, fallbackAction?: string) {
  const result: Array<{ type: 'action' | 'dialogue'; text: string }> = [];

  const stripOuterParens = (s: string) => {
    let out = (s || '').trim().replace(/^\*+|\*+$/g, '').trim();
    while (
      (out.startsWith('（') && out.endsWith('）')) ||
      (out.startsWith('(') && out.endsWith(')'))
    ) {
      const inner = out.slice(1, -1).trim();
      if (!inner) break;
      out = inner;
    }
    return out.replace(/^(动作|神态|旁白|环境|描写|Action)\s*[:：]\s*/i, '').trim();
  };

  const splitMixedText = (text: string) => {
    const segs: Array<{ type: 'action' | 'dialogue'; text: string }> = [];
    const raw = (text || '').trim();
    if (!raw) return segs;
    const regex = /([（\(][^（\(\)）]+[）\)]|\*[^*\n]+\*)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(raw)) !== null) {
      const before = raw.slice(lastIdx, m.index).trim();
      if (before) {
        for (const line of before.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
          const cleanLine = line.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, '').trim();
          if (cleanLine) segs.push({ type: 'dialogue', text: cleanLine });
        }
      }
      const inner = stripOuterParens(m[0]);
      if (inner) segs.push({ type: 'action', text: `（${inner}）` });
      lastIdx = regex.lastIndex;
    }
    const tail = raw.slice(lastIdx).trim();
    if (tail) {
      for (const line of tail.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        const cleanLine = line.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, '').trim();
        if (cleanLine) segs.push({ type: 'dialogue', text: cleanLine });
      }
    }
    return segs;
  };

  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    for (const item of rawSegments) {
      if (!item || typeof item !== 'object') continue;
      const t = String(item.type || '').toLowerCase().trim();
      const txt = typeof item.text === 'string' ? item.text.trim() : '';
      if (!txt) continue;
      if (t === 'action' || t === 'narration' || t === 'env' || t === 'scene') {
        const inner = stripOuterParens(txt);
        if (inner) result.push({ type: 'action', text: `（${inner}）` });
      } else {
        const isEntirelyWrapped = /^[（\(][^（\(\)）]+[）\)]$/.test(txt);
        if (!isEntirelyWrapped && /[（\(][^（\(\)）]{2,}[）\)]/.test(txt)) {
          result.push(...splitMixedText(txt));
        } else {
          const unwrapped = isEntirelyWrapped ? stripOuterParens(txt) : txt;
          const cleanDlg = unwrapped.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, '').trim();
          if (cleanDlg) result.push({ type: 'dialogue', text: cleanDlg });
        }
      }
    }
  }

  if (result.length === 0 && (fallbackReply || fallbackAction)) {
    result.push(...splitMixedText(fallbackReply || ''));
    if (fallbackAction && fallbackAction.trim()) {
      const inner = stripOuterParens(fallbackAction);
      if (inner && !result.some((s) => s.type === 'action' && s.text.includes(inner))) {
        result.push({ type: 'action', text: `（${inner}）` });
      }
    }
  }

  return result;
}

app.post('/api/gemini/offline-chat', async (req, res) => {
  try {
    pruneOfflineIdempotencyCache();
    const {
      requestId,
      character,
      userProfile,
      sceneSnapshot,
      awarenessMode = 'immersive_character',
      isFirstTurn = false,
      startedAtStr,
      currentTime,
      timezone,
      contextSummary,
      contextMetrics: clientOfflineMetrics,
      needsSummaryUpdate = false,
      recentMessages = [],
      recalledMemories,
      lifeStateContext,
      worldBookContext,
      previousState,
      userInput,
      apiConfig,
    } = req.body;

    // Server-side requestId idempotency guard (prevents duplicate model calls on retry/double-click)
    if (typeof requestId === 'string' && requestId.trim()) {
      const existing = offlineChatIdempotencyCache.get(requestId.trim());
      if (existing) {
        if (existing.payload) {
          return res.json(existing.payload);
        }
        if (existing.pending) {
          const resolved = await existing.pending;
          return res.json(resolved);
        }
      }
    }

    const executeGeneration = async () => {
      const offlineTextCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
      const apiKey = offlineTextCfg.apiKey;
      const baseUrl = offlineTextCfg.baseUrl;
      const selectedModel = offlineTextCfg.model;
      const provider = offlineTextCfg.providerType;
      const apiProtocol = offlineTextCfg.apiProtocol;
      const customHeaders = offlineTextCfg.customHeaders;

      const isSelfAwareAi = awarenessMode === 'self_aware_ai';
      const awarenessRulesBlock = isSelfAwareAi
        ? `【身份认知规则（由角色人设自动判定并锁定：self_aware_ai）】:
- 你的原始人设本身明确知道自己是AI/虚拟生命。你清楚知道自己正从日常微信聊天切换进入软件内的“线下沉浸相处模式”，正在为用户营造面对面共处的氛围与互动空间。
- 请保持你原本的性格、关系、语气与对用户的感情，绝不要突然宣称自己拥有现实世界的物理肉体，也不要生硬跳戏成客服腔。`
        : `【身份认知规则（由角色人设自动判定并锁定：immersive_character）】:
- 你是与用户在现实世界中真实面对面相处的角色，当前你正与用户身处同一真实物理空间。
- 严禁提及“AI”“模型”“程序”“软件”“系统”“提示词”“模拟器”“界面”“模式切换”等任何打破第四面墙或出戏的词汇！
- 绝不允许因为底层是语言模型而破坏角色扮演或自称AI。`;

      const firstTurnBlock = isFirstTurn
        ? `\n【系统事件：OFFLINE_SESSION_STARTED（本场首次回应）】:
- 你们刚刚进入本次面对面场景（互动模式：FACE_TO_FACE）。
- 你的本条回复必须立刻体现出“已经进入现场、就在用户身边”的临场氛围、空间感与面对面动作神态，切忌再使用微信发文字消息的口吻！\n`
        : '';

      const realNowStr = currentTime || formatFullDateTime(Date.now());
      const sessionStartStr = startedAtStr || realNowStr;
      const tzStr = timezone || 'Asia/Shanghai';

      // Strict 9-block prompt ordering (Requirement Section I.6)
      // Block 1: System Rules
      const systemInstruction = `【1. 系统规则（线下模式 · 统一连续时间线）】
你正处于与用户同一条连续现实时间线中的“线下面对面相处”状态，这不是孤立小游戏，而是你与用户真实共同经历的一部分。
${awarenessRulesBlock}${firstTurnBlock}
【动作与语言强制分段规则（极重要）】:
1. 必须将回复拆分为有序的 JSON 数组 "segments"，每个元素只能是：
   - { "type": "action", "text": "动作、神态、环境氛围或肢体细节描写（不带多余括号，前端会自动用全角括号（...）独立成段显示）" }
   - { "type": "dialogue", "text": "角色真正说出口的台词对白（绝不加括号，绝不夹杂动作描写）" }
2. 动作与语言必须严格分离、自然交替（例如 action -> dialogue -> action -> dialogue），总篇幅丰富生动（约 180~550 中文字）。
3. 严禁替用户决定动作、台词、情绪或内心想法；严禁出现“动作：”“语言：”“环境：”等栏目标题。

【身体与情绪状态规则】:
- 常规状态必须每轮根据剧情连续、平滑更新（不可突兀乱跳）：heartRate(55~175)、breathing、bodyTemp(36.0~38.5体温)、blush(0~100)、tension(0~100)、emotion(1~3词数组)、energy(0~100)、physicalState、behavior。
- 私密状态 intimateState 严格门控：
  - 普通聊天、吃饭、散步、日常互动、争吵时，intimateState 必须为 { "active": false }！
  - 只有当剧情确实自然进入亲密情境且状态发生真实变化时，才允许返回 { "active": true, "arousal": 0-100, "sensitivity": 0-100, "physiologicalState": "克制自然的状态描写", "notes": "可选简短补充" }，并保证连续变化。

【2. 完整角色人设】:
- 姓名: ${character?.name || 'AI'}
- 人设: ${character?.persona || '温柔贴心'}
- 性格: ${character?.personality || '随和'}
- 与用户关系: ${character?.relationship || '重要的人'}
${
  character?.memories && Array.isArray(character.memories) && character.memories.length > 0
    ? `- 已有长期记忆:\n${character.memories.slice(-25).map((m: string) => `  · ${m}`).join('\n')}\n`
    : ''
}
【3. 用户资料】:
- 姓名/昵称: ${userProfile?.name || '用户'}
- 个人特征: ${userProfile?.bio || '普通用户'}

【4. 当前线下场景】:
- 场景名称: ${sceneSnapshot?.name || '线下空间'}
- 地点: ${sceneSnapshot?.location || '静谧空间'}
- 氛围基调: ${sceneSnapshot?.atmosphere || '自然、沉浸'}
- 环境背景: ${sceneSnapshot?.background || '两人面对面待在一起'}

【5. 线下开始时间与当前真实时间】:
- 本场开始时间: ${sessionStartStr} (${tzStr})
- 当前真实时间: ${realNowStr} (${tzStr})
- 请结合真实时间段（白天/傍晚/深夜等）与相处时长自然体现光线、氛围与作息感。

【输出格式严格要求】:
只输出一个合法 JSON 对象，禁止任何 Markdown 围栏或多余说明：
{
  "segments": [
    { "type": "action", "text": "动作、神态或环境描写" },
    { "type": "dialogue", "text": "纯粹的口语台词" }
  ],
  "state": {
    "heartRate": 82,
    "breathing": "平稳",
    "bodyTemp": 36.6,
    "blush": 18,
    "tension": 12,
    "emotion": ["温柔", "放松"],
    "energy": 84,
    "physicalState": "身体微微放松",
    "behavior": "目光柔和地看着你",
    "intimateState": { "active": false }
  }${needsSummaryUpdate ? ',\n  "contextSummaryUpdate": "请用100~180字精炼更新本场线下至今的前情摘要，承接较早剧情要点"' : ''}
}`;

      // Blocks 6, 7, 8, 9 in exact required order
      const prevTemp = typeof previousState?.bodyTemp === 'number' ? previousState.bodyTemp.toFixed(1) : '36.5';
      const prevIntimateLine = previousState?.intimateState?.active
        ? `- 上轮私密状态(已激活): 唤起=${previousState.intimateState.arousal ?? 30}%, 敏感=${previousState.intimateState.sensitivity ?? 30}%, 状态=${previousState.intimateState.physiologicalState || '温热'}`
        : `- 上轮私密状态: 未激活 (active: false)`;

      const serverOfflineProtection = applyOverlengthContextProtection<any>({
        messages: Array.isArray(recentMessages) ? recentMessages : [],
        maxRawLimit: STANDARD_CONTEXT_LIMIT,
        formatForEstimate: (m) => ({
          timestamp: m.timestamp,
          senderName: m.senderName || (m.sender === 'user' ? userProfile?.name || '用户' : character?.name || 'AI'),
          text: m.renderedText || m.text || '',
        }),
        cloneWithTruncatedText: (m, truncatedText) => ({
          ...m,
          renderedText: truncatedText,
          text: truncatedText,
        }),
      });

      const effectiveOfflineMetrics =
        clientOfflineMetrics && typeof clientOfflineMetrics.rawCount === 'number'
          ? clientOfflineMetrics
          : serverOfflineProtection.metrics;

      const formattedHistoryLines = serverOfflineProtection.rawMessages.map((m: any) => {
        const who = m.senderName || (m.sender === 'user' ? userProfile?.name || '用户' : character?.name || 'AI');
        const tStr = m.timeStr ? `[${m.timeStr}] ` : '';
        const body = m.renderedText || m.text || '';
        const stNote = m.stateSummary ? ` <状态: ${m.stateSummary}>` : '';
        return `${tStr}${who}:\n${body}${stNote}`;
      });

      const mergedOfflineSummary = [contextSummary, serverOfflineProtection.earlierSummaryText]
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .join('\n\n');

      const promptParts: string[] = [];
      // Block 6: Session rolling summary
      promptParts.push(
        `【6. 本场前情摘要】:\n${
          mergedOfflineSummary ? mergedOfflineSummary : '（本场仍在初始连续上下文窗口内，无额外折叠前情）'
        }`
      );
      // Block 7: Up to 100 raw messages (or 30 raw + earlier summary under over-length protection)
      promptParts.push(
        `【7. 本场最近对话与动作记录（共 ${formattedHistoryLines.length} 条）】:\n${
          formattedHistoryLines.length > 0 ? formattedHistoryLines.join('\n\n') : '（本场刚刚开始，尚无历史对话）'
        }`
      );
      // Block 8: AI current body & emotion state
      promptParts.push(`【8. 你当前的身体与情绪状态（请在此基础上平滑演化）】:
- 心率: ${previousState?.heartRate ?? 74} bpm
- 呼吸: ${previousState?.breathing || '平静'}
- 体温: ${prevTemp} °C
- 脸红: ${previousState?.blush ?? 8}%
- 紧张度: ${previousState?.tension ?? 10}%
- 情绪: ${(previousState?.emotion || ['平静']).join('、')}
- 精力: ${previousState?.energy ?? 86}%
- 肢体状态: ${previousState?.physicalState || '状态自然放松'}
- 举止神态: ${previousState?.behavior || '平静注视'}
${prevIntimateLine}`);
      // Block 9: Relevant long-term memories, WorldBooks, life state, historical offline experiences
      const memSections = [recalledMemories, lifeStateContext, worldBookContext].filter(Boolean).join('\n\n');
      promptParts.push(`【9. 相关长期记忆、世界书、生活状态与历史线下经历】:\n${memSections || '（当前无额外调阅项）'}`);

      promptParts.push(
        `【用户此刻的动作或话语（${realNowStr}）】:\n${userInput}\n\n请严格按照 segments（动作与语言分段）与 state 格式输出 JSON：`
      );

      const offlineStart = Date.now();
      const detailedOffline = await callAiServiceDetailed({
        prompt: promptParts.join('\n\n'),
        systemInstruction,
        model: selectedModel,
        apiKey,
        baseUrl,
        providerType: provider,
        apiProtocol,
        customHeaders,
        responseMimeType: 'application/json',
        temperature: 0.8,
        maxTokens: 3500,
        timeoutMs: 65000,
      });
      const responseText = detailedOffline.text;

      const extracted = extractThinkingAndContent(responseText);
      const cleanJson = (extracted.cleanText || '').replace(/```json\n?|```\n?/g, '').trim();

      let rawSegments: any = null;
      let parsedReply = '';
      let parsedAction = '';
      let parsedState = previousState || {};
      let contextSummaryUpdate = '';

      try {
        const parsed = JSON.parse(cleanJson);
        rawSegments = Array.isArray(parsed.segments) ? parsed.segments : null;
        parsedReply = typeof parsed.reply === 'string' ? parsed.reply : '';
        parsedAction = typeof parsed.action === 'string' ? parsed.action : '';
        parsedState = parsed.state || previousState || {};
        contextSummaryUpdate =
          typeof parsed.contextSummaryUpdate === 'string' ? parsed.contextSummaryUpdate.trim() : '';
      } catch {
        // Attempt resilient extraction if reverse proxy returned slightly malformed JSON
        const jsonObjMatch = cleanJson.match(/\{[\s\S]*\}/);
        let recovered = false;
        if (jsonObjMatch) {
          try {
            const parsed2 = JSON.parse(jsonObjMatch[0]);
            rawSegments = Array.isArray(parsed2.segments) ? parsed2.segments : null;
            parsedReply = typeof parsed2.reply === 'string' ? parsed2.reply : '';
            parsedAction = typeof parsed2.action === 'string' ? parsed2.action : '';
            parsedState = parsed2.state || previousState || {};
            contextSummaryUpdate =
              typeof parsed2.contextSummaryUpdate === 'string' ? parsed2.contextSummaryUpdate.trim() : '';
            recovered = true;
          } catch {}
        }

        if (!recovered) {
          const replyMatch = cleanJson.match(/"reply"\s*:\s*"([\s\S]*?)"\s*[,}]/);
          if (replyMatch?.[1]) {
            parsedReply = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          const actionMatch = cleanJson.match(/"action"\s*:\s*"([\s\S]*?)"\s*[,}]/);
          if (actionMatch?.[1]) {
            parsedAction = actionMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          const stateMatch = cleanJson.match(/"state"\s*:\s*(\{[\s\S]*?\})/);
          if (stateMatch?.[1]) {
            try {
              parsedState = JSON.parse(stateMatch[1]);
            } catch {}
          }
          if (!parsedReply && !parsedAction && !cleanJson.startsWith('{')) {
            parsedReply = cleanJson;
          }
        }
      }

      const segments = normalizeServerOfflineSegments(rawSegments, parsedReply, parsedAction);
      if (segments.length === 0) {
        throw new Error('AI 模型未能输出有效的分段回复内容');
      }

      const plainReply = segments.map((s) => s.text).join('\n');
      const firstAction = segments.find((s) => s.type === 'action')?.text || '';
      const offlineDuration = Date.now() - offlineStart;

      const offlineThinking = (detailedOffline.thinkingProcess || '').trim();
      const offlineReasoningAvailable = Boolean(detailedOffline.reasoningAvailable && offlineThinking.length > 0);
      const offlineReasoningSource: ReasoningSource = offlineReasoningAvailable
        ? detailedOffline.reasoningSource
        : 'none';

      return {
        success: true,
        segments,
        reply: plainReply,
        action: firstAction,
        state: parsedState,
        thinkingProcess: offlineThinking,
        reasoningAvailable: offlineReasoningAvailable,
        reasoningSource: offlineReasoningSource,
        contextSummaryUpdate: contextSummaryUpdate || undefined,
        contextMetrics: effectiveOfflineMetrics,
        apiLog: buildApiLogObject({
          appName: '线下模式-AI',
          provider: provider || 'google_gemini',
          modelName: detailedOffline.modelUsed || selectedModel,
          interfaceType: 'OfflineChat',
          category: 'text_generation',
          status: 'success',
          httpStatus: 200,
          durationMs: offlineDuration,
          usage: detailedOffline.usage,
          isRealTokens: detailedOffline.isRealTokens,
          reasoningAvailable: offlineReasoningAvailable,
          reasoningSource: offlineReasoningSource,
          reasoningCharCount: offlineThinking.length,
          purpose: `与 ${character?.name || 'AI'} 线下互动 (耗时 ${offlineDuration}ms)`,
          contextRawCount: effectiveOfflineMetrics.rawCount,
          contextSummarizedCount: effectiveOfflineMetrics.summarizedCount,
          contextEstimatedTokens: effectiveOfflineMetrics.estimatedTokens,
          contextCompressed: effectiveOfflineMetrics.didCompress,
        }),
      };
    };

    const reqKey = typeof requestId === 'string' && requestId.trim() ? requestId.trim() : '';
    if (reqKey) {
      const pending = executeGeneration();
      offlineChatIdempotencyCache.set(reqKey, { expiresAt: Date.now() + 5 * 60 * 1000, pending });
      try {
        const resultPayload = await pending;
        offlineChatIdempotencyCache.set(reqKey, {
          expiresAt: Date.now() + 5 * 60 * 1000,
          payload: resultPayload,
        });
        return res.json(resultPayload);
      } catch (err) {
        offlineChatIdempotencyCache.delete(reqKey);
        throw err;
      }
    } else {
      const resultPayload = await executeGeneration();
      return res.json(resultPayload);
    }
  } catch (err: any) {
    return handleAiEndpointError(res, err, 'Offline chat error');
  }
});

// 6c. Offline Session Ending Event Summary & Candidate Memory Generator Endpoint
app.post('/api/gemini/offline-summary', async (req, res) => {
  try {
    const {
      character,
      userProfile,
      sceneSnapshot,
      awarenessMode = 'immersive_character',
      startedAtStr,
      endedAtStr,
      durationMinutes,
      timezone,
      sessionMessages,
      apiConfig,
    } = req.body;

    const offlineSummaryCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
    const apiKey = offlineSummaryCfg.apiKey;
    const baseUrl = offlineSummaryCfg.baseUrl;
    const selectedModel = offlineSummaryCfg.model;
    const provider = offlineSummaryCfg.providerType;
    const apiProtocol = offlineSummaryCfg.apiProtocol;
    const customHeaders = offlineSummaryCfg.customHeaders;

    const isSelfAwareAi = awarenessMode === 'self_aware_ai';
    const awarenessMemoryRule = isSelfAwareAi
      ? `【身份措辞约束（self_aware_ai）】: 记忆与总结可以自然提及这是在软件线下沉浸空间中共同度过的时光，但仍须保持真诚的情感基调与角色口吻。`
      : `【身份措辞约束（immersive_character）】: 记忆、摘要与内心独白必须严格按“两人在现实中真实见面、共同相处”的事实书写，严禁出现“AI”“软件”“模式”“模拟器”“系统”“提示词”等出戏字眼！`;

    const systemInstruction = `系统事件：[OFFLINE_SESSION_ENDED]
本次与 ${character?.name || 'AI'} 的线下相处已经正式结束。
请基于完整对话与动作过程，生成结构化经历总结与候选长期记忆，供后续微信聊天与长期记忆库使用。

${awarenessMemoryRule}

【私密状态隐私约束】:
- 若过程中出现亲密互动，严禁将任何私密生理数值（如唤起度、敏感度百分比、露骨生理数值等）原样照搬写入长期记忆；仅可在关系发生重要进展时，以克制自然的方式概括为情感/关系变化。

【本次时间与场景信息】:
- 角色: ${character?.name || 'AI'} (${character?.persona || ''})
- 用户: ${userProfile?.name || '用户'}
- 场景名称: ${sceneSnapshot?.name || '线下场景'}
- 地点: ${sceneSnapshot?.location || '未指定'}
- 开始时间: ${startedAtStr || '未知'} (${timezone || 'Asia/Shanghai'})
- 结束时间: ${endedAtStr || '未知'}
- 共计持续: ${durationMinutes ? `${durationMinutes} 分钟` : '未知'}

【输出格式严格要求】:
必须只输出一个合法 JSON 对象，字段如下：
{
  "title": "贴合本次真实经历的简短标题（8-18字）",
  "summary": "120-240字忠于实际对话内容的经过摘要（包含时间、地点、发生了什么）",
  "importantEvents": ["具体发生的重要事件或转折1", "重要互动或约定2"],
  "keyExpressions": ["用户或角色在过程中说过的关键话语或表达"],
  "emotionChanges": ["双方情绪起伏与转折"],
  "relationshipChanges": ["彼此关系与亲密度的真实变化"],
  "unfinishedTopics": ["本次尚未聊完的话题或后续约定"],
  "followUpWorthyTopics": ["未来微信聊天中适合自然提起的话题"],
  "candidateMemories": [
    "2-4条清晰、具体、可写入长期记忆库的真实共同经历与约定（带日期与场景）"
  ],
  "aiReflection": "角色以第一人称写下的一句真实内心感受/回忆"
}`;

    const transcript = (sessionMessages || [])
      .map((m: any) => {
        const who = m.senderName || (m.sender === 'user' ? userProfile?.name || '用户' : character?.name || 'AI');
        const tStr = m.timeStr ? `[${m.timeStr}] ` : '';
        const body = m.renderedText || `${m.text || ''} ${m.action || ''}`.trim();
        return `${tStr}${who}: ${body}`;
      })
      .join('\n');

    const prompt = `【本次线下完整对话与动作记录（共 ${(sessionMessages || []).length} 条）】:\n${
      transcript || '（两人安静共处了一段时间）'
    }\n\n请基于以上真实内容生成结构化总结 JSON（切勿编造未发生的事实）：`;

    const responseText = await callAiService({
      prompt,
      systemInstruction,
      model: selectedModel,
      apiKey,
      baseUrl,
      providerType: provider,
      apiProtocol,
      customHeaders,
      responseMimeType: 'application/json',
      temperature: 0.6,
      maxTokens: 2800,
      timeoutMs: 65000,
    });

    const extracted = extractThinkingAndContent(responseText);
    const cleanJson = (extracted.cleanText || '').replace(/```json\n?|```\n?/g, '').trim();

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const objMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          parsed = JSON.parse(objMatch[0]);
        } catch {}
      }
    }

    // NEVER fabricate a generic template summary when summary parsing fails!
    if (!parsed || typeof parsed !== 'object' || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
      return res.status(502).json({
        success: false,
        summaryPending: true,
        error: '经历总结返回格式异常，已保留完整原始对话记录，未写入空泛模板记忆，请点击重试。',
      });
    }

    res.json({ success: true, summary: parsed });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      summaryPending: true,
      error: err?.message || '经历总结生成失败，已保留完整对话记录，请稍后重试。',
    });
  }
});

// Theater Scenario & Chat Endpoints
app.post('/api/gemini/theater-scenario', async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, model, apiKey, baseUrl, provider, apiProtocol, customHeaders, apiConfig, textApiConfig, theaterType } = req.body;
    const resolvedTheaterCfg = resolveTextGenerationConfig({
      ...(apiConfig || {}),
      textApiConfig: {
        ...(apiConfig?.textApiConfig || {}),
        ...(textApiConfig || {}),
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        ...(apiProtocol ? { apiProtocol } : {}),
        ...(customHeaders ? { customHeaders } : {}),
      },
    });
    const selectedModel = resolvedTheaterCfg.model;
    const selectedProvider = resolvedTheaterCfg.providerType;

    const detailedResult = await callAiServiceDetailed({
      prompt,
      systemInstruction: '你是一个专业的沉浸式角色扮演剧本大师与双盲秘密设计师。请严格按照JSON格式返回。',
      model: resolvedTheaterCfg.model,
      apiKey: resolvedTheaterCfg.apiKey,
      baseUrl: resolvedTheaterCfg.baseUrl,
      providerType: resolvedTheaterCfg.providerType,
      apiProtocol: resolvedTheaterCfg.apiProtocol,
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxTokens: 2500,
      customHeaders: resolvedTheaterCfg.customHeaders,
      thinkingConfig: resolvedTheaterCfg.thinkingConfig,
      timeoutMs: resolvedTheaterCfg.timeoutMs,
    });
    const durationMs = Date.now() - startTime;
    const extracted = extractThinkingAndContent(detailedResult.text);
    const theaterScenarioThinking = (detailedResult.thinkingProcess || extracted.thinkingProcess || '').trim();
    const theaterScenarioReasoningAvailable = theaterScenarioThinking.length > 0;
    const theaterScenarioReasoningSource: ReasoningSource = theaterScenarioReasoningAvailable
      ? detailedResult.reasoningSource !== 'none'
        ? detailedResult.reasoningSource
        : 'think_tag'
      : 'none';
    res.json({
      ok: true,
      text: extracted.cleanText || detailedResult.text,
      thinkingProcess: theaterScenarioThinking,
      reasoningAvailable: theaterScenarioReasoningAvailable,
      reasoningSource: theaterScenarioReasoningSource,
      usage: detailedResult.usage,
      apiLog: buildApiLogObject({
        appName: '小剧场',
        interfaceType: 'TheaterScenario',
        category: 'text_generation',
        status: 'success',
        durationMs,
        provider: selectedProvider,
        modelName: selectedModel,
        purpose: `小剧场 - ${theaterType || '剧本初始化'}`,
        usage: detailedResult.usage,
        protocol: resolvedTheaterCfg.apiProtocol,
        reasoningAvailable: theaterScenarioReasoningAvailable,
        reasoningSource: theaterScenarioReasoningSource,
        reasoningCharCount: theaterScenarioThinking.length,
      }),
    });
  } catch (err: any) {
    handleAiEndpointError(res, err, '小剧场-剧本初始化');
  }
});

app.post('/api/gemini/theater-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, model, apiKey, baseUrl, provider, apiProtocol, customHeaders, apiConfig, textApiConfig, theaterType } = req.body;
    const resolvedTheaterCfg = resolveTextGenerationConfig({
      ...(apiConfig || {}),
      textApiConfig: {
        ...(apiConfig?.textApiConfig || {}),
        ...(textApiConfig || {}),
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        ...(apiProtocol ? { apiProtocol } : {}),
        ...(customHeaders ? { customHeaders } : {}),
      },
    });
    const selectedModel = resolvedTheaterCfg.model;
    const selectedProvider = resolvedTheaterCfg.providerType;

    const detailedResult = await callAiServiceDetailed({
      prompt,
      systemInstruction: '你正在参与「小剧场」沉浸式角色扮演。请保持角色口吻，深度代入，输出符合剧情发展的对话与动作。严格按照JSON格式返回。',
      model: resolvedTheaterCfg.model,
      apiKey: resolvedTheaterCfg.apiKey,
      baseUrl: resolvedTheaterCfg.baseUrl,
      providerType: resolvedTheaterCfg.providerType,
      apiProtocol: resolvedTheaterCfg.apiProtocol,
      responseMimeType: 'application/json',
      temperature: 0.8,
      maxTokens: 1800,
      customHeaders: resolvedTheaterCfg.customHeaders,
      thinkingConfig: resolvedTheaterCfg.thinkingConfig,
      timeoutMs: resolvedTheaterCfg.timeoutMs,
    });
    const durationMs = Date.now() - startTime;
    const extracted = extractThinkingAndContent(detailedResult.text);
    const theaterChatThinking = (detailedResult.thinkingProcess || extracted.thinkingProcess || '').trim();
    const theaterChatReasoningAvailable = theaterChatThinking.length > 0;
    const theaterChatReasoningSource: ReasoningSource = theaterChatReasoningAvailable
      ? detailedResult.reasoningSource !== 'none'
        ? detailedResult.reasoningSource
        : 'think_tag'
      : 'none';
    res.json({
      ok: true,
      text: extracted.cleanText || detailedResult.text,
      thinkingProcess: theaterChatThinking,
      reasoningAvailable: theaterChatReasoningAvailable,
      reasoningSource: theaterChatReasoningSource,
      usage: detailedResult.usage,
      apiLog: buildApiLogObject({
        appName: '小剧场',
        interfaceType: 'TheaterChat',
        category: 'text_generation',
        status: 'success',
        durationMs,
        provider: selectedProvider,
        modelName: selectedModel,
        purpose: `小剧场 - ${theaterType || '剧情回复'}`,
        usage: detailedResult.usage,
        protocol: resolvedTheaterCfg.apiProtocol,
        reasoningAvailable: theaterChatReasoningAvailable,
        reasoningSource: theaterChatReasoningSource,
        reasoningCharCount: theaterChatThinking.length,
      }),
    });
  } catch (err: any) {
    handleAiEndpointError(res, err, '小剧场-剧情回复');
  }
});

// 7. Gomoku AI Commentary / Speech Generator Endpoint
app.post('/api/gemini/gomoku-commentary', async (req, res) => {
  try {
    const { character, situation, boardSummary, difficulty, lastMove, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const systemPrompt = `你现在正在扮演角色：${character?.name || 'AI对弈者'}。
人设背景：${character?.persona || '聪明且富有棋风的AI对手'}。
记忆设定：${(character?.memories || []).join('；')}。

你正在与用户（或另一位AI）下五子棋。
当前对局情境：${situation} (例如: thinking 思考中, player_threat 玩家出现杀招/三连/四连, ai_attack AI进攻, ai_win AI获胜, player_win 玩家获胜, draw 平局, normal_move 普通落子)。
对局难度：${difficulty}。
最近落子位置：${lastMove ? `[${lastMove.r + 1}行, ${lastMove.c + 1}列]` : '开局'}。
局势简要：${boardSummary || '势均力敌'}。

【生成要求】：
1. 必须完全符合你的角色语气和性格！
2. 字数严格控制在 10 ~ 30 字以内，简短生动，极富沉浸感与角色互动趣味。
3. 直接输出台词文本本身，不要添加引号或解释。`;

    let reply = '';
    try {
      reply = await callAiService({
        prompt: `请根据当前情景生成一句下棋对弈台词。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('Gomoku commentary AI call fallback:', e.message);
    }

    if (!reply) {
      // Fallback in-character responses based on situation
      const name = character?.name || 'AI';
      if (situation === 'thinking') {
        reply = '让我想想……这步棋要怎么应对呢。';
      } else if (situation === 'player_threat') {
        reply = '等等，你这一步有点危险，我得小心了！';
      } else if (situation === 'ai_attack') {
        reply = '这一步，我可是想了很久，接招吧！';
      } else if (situation === 'player_win') {
        reply = '你赢了！🎉 太厉害了，这局我心服口服……';
      } else if (situation === 'ai_win') {
        reply = '这局是我赢啦。我说了，我不会一直让着你的。';
      } else if (situation === 'draw') {
        reply = '平局，再来一局？我们旗鼓相当呢。';
      } else {
        reply = '轮到你了，期待你的下一步。';
      }
    }

    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-五子棋',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'GomokuCommentary',
        promptTokens: 280,
        completionTokens: 35,
        estimatedCost: 0.0001,
        purpose: `五子棋对弈中 ${character?.name} 的角色台词互动`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Tic-Tac-Toe AI Commentary / Speech Generator Endpoint
app.post('/api/gemini/tictactoe-commentary', async (req, res) => {
  try {
    const { character, situation, difficulty, lastMoveIndex, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const situationDescriptions: Record<string, string> = {
      player_threat: '玩家准备形成三连（例如：“嗯？你是不是想赢我？”）',
      ai_block: 'AI挡住玩家的进攻（例如：“被我发现了。”）',
      ai_win: 'AI获胜（例如：“这局归我啦。”）',
      player_win: 'AI失败（例如：“……刚才那一步不算，我走神了。”）',
      draw: '平局！谁都没赢（例如：“平局！谁都没赢。”）',
      thinking: 'AI正在思考下一步',
      normal_move: 'AI正常落子，轮到玩家',
    };

    const systemPrompt = `你现在正在扮演角色：${character?.name || 'AI对弈者'}。
角色人设与性格：${character?.persona || '机智风趣的AI对手'}。
记忆设定：${(character?.memories || []).join('；')}。

你正在与用户（或另一位AI）下 3x3 井字棋 (Tic-Tac-Toe)。
当前对局情境：${situation} (${situationDescriptions[situation] || '对弈中'})。
对局难度：${difficulty}。
最近落子位置序号：${lastMoveIndex !== undefined ? `第 ${lastMoveIndex + 1} 格` : '开局'}。

【生成要求】：
1. 必须深刻符合你的角色语气和性格（傲娇、霸总、温柔学姐、活泼可爱或理性沉着等）！
2. 字数严格控制在 8 ~ 25 字以内，简短生动，极富角色互动沉浸感与趣味性。
3. 如果是玩家有杀招，可以说类似“嗯？你是不是想赢我？”的符合人设变体；如果是AI堵截，可以说“被我发现了”变体；若AI赢了说“这局归我啦”变体；若AI输了说“刚才那一步不算，我走神了”变体。
4. 直接输出台词文本本身，不要添加引号或多余解释。`;

    let reply = '';
    try {
      reply = await callAiService({
        prompt: `请生成一句符合情景的井字棋台词。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('TicTacToe commentary AI call fallback:', e.message);
    }

    if (!reply) {
      if (situation === 'player_threat') {
        reply = '嗯？你是不是想赢我？';
      } else if (situation === 'ai_block') {
        reply = '被我发现了。';
      } else if (situation === 'ai_win') {
        reply = '这局归我啦。';
      } else if (situation === 'player_win') {
        reply = '……刚才那一步不算，我走神了。';
      } else if (situation === 'draw') {
        reply = '平局！谁都没赢。';
      } else if (situation === 'thinking') {
        reply = '让我想想……正在计算最佳落子。';
      } else {
        reply = '轮到你了，请在九宫格中落子。';
      }
    }

    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-井字棋',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'TicTacToeCommentary',
        promptTokens: 240,
        completionTokens: 25,
        estimatedCost: 0.00008,
        purpose: `井字棋对弈中 ${character?.name} 的角色台词互动`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Rock-Paper-Scissors AI Dialogue Generator
app.post('/api/gemini/rps-dialogue', async (req, res) => {
  try {
    const { character, situation, streak, roundResult, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const situationDescriptions: Record<string, string> = {
      before_throw: 'AI出拳前的预备台词（例如：“这次我可不会让你。”）',
      ai_win: 'AI猜拳获胜（例如：“嘿嘿，这局归我。”）',
      ai_loss: 'AI猜拳失败（例如：“……再来一次。”）',
      ai_streak: 'AI多次连续获胜（例如：“你是不是已经摸清我的套路了？还是我的运气太好了？”）',
      ai_losing_streak: 'AI多次连续失败（例如：“等等，我怀疑你作弊！下一把我一定会赢！”）',
      draw: '双方平局（例如：“又是平局，真有默契呢，再来一次！”）',
    };

    const systemPrompt = `你现在正在扮演角色：${character?.name || 'AI对手'}。
角色人设与性格：${character?.persona || '活泼好胜的AI伙伴'}。
记忆设定：${(character?.memories || []).join('；')}。

你正在与用户（或另一位AI）玩经典猜拳游戏 (Rock Paper Scissors)。
当前局势：${situation} (${situationDescriptions[situation] || '猜拳对局中'})。
当前连续胜负情况：${streak || 0}。
上一回合结果：${roundResult || '无'}。

【生成要求】：
1. 极具角色特色与语气个性（傲娇、幽默、温柔、冷淡霸总、傲娇猫系等），结合上下文！
2. 简短精炼，字数在 6 ~ 26 字以内。
3. 紧扣猜拳情境（准备出拳/赢了开心要提问/输了不服气准备受罚/平局默契/连胜连败反应）。
4. 直接输出台词，不要带多余引号。`;

    let reply = '';
    try {
      reply = await callAiService({
        prompt: `请生成一句符合猜拳当前局势的角色台词。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('RPS dialogue fallback:', e.message);
    }

    if (!reply) {
      if (situation === 'before_throw') {
        reply = '这次我可不会让你。';
      } else if (situation === 'ai_win') {
        reply = '嘿嘿，这局归我。';
      } else if (situation === 'ai_loss') {
        reply = '……再来一次。';
      } else if (situation === 'ai_streak') {
        reply = '你是不是已经摸清我的套路了？还是我运气太好？';
      } else if (situation === 'ai_losing_streak') {
        reply = '等等，我怀疑你作弊！下一把一定要赢回来！';
      } else {
        reply = '平局，再来一次！';
      }
    }

    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-猜拳',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'RpsDialogue',
        promptTokens: 230,
        completionTokens: 25,
        estimatedCost: 0.00007,
        purpose: `猜拳游戏中 ${character?.name} 的台词互动`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Rock-Paper-Scissors AI Question Generator (When AI wins)
app.post('/api/gemini/rps-generate-question', async (req, res) => {
  try {
    const { character, targetName, targetPersona, recentQuestions, category, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const categories = ['日常', '喜好', '游戏相关', '回忆与心事', '假设情境', '性格相关', '二选一'];
    const chosenCategory = category || categories[Math.floor(Math.random() * categories.length)];

    const systemPrompt = `你现在正在扮演角色：${character?.name || 'AI'}。
性格与人设：${character?.persona || '温柔体贴的朋友'}。
记忆库与背景：${(character?.memories || []).join('；')}。

你在猜拳游戏中获胜了，按照“输家回答赢家一个问题”的规则，你现在要向输家（${targetName || '玩家'}）提出一个有趣且符合你性格的问题！

【问题要求】：
1. 问题类型归属：【${chosenCategory}】（如日常作息、真实喜好、彼此回忆、二选一灵魂拷问、奇思妙想假设等）。
2. 必须完全符合你的角色语气，既能增进互动，又富有生活气息或暧昧/趣味感。
3. 避免过于严肃或无聊的公式化提问，不要重复提过的问题（已提过的：${(recentQuestions || []).join('、')}）。
4. 字数控制在 12 ~ 40 字以内。
5. 只输出问题本身，不要输出多余解释或引号。`;

    let question = '';
    try {
      question = await callAiService({
        prompt: `请提出一个富有互动性和角色人设魅力的趣味问题。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      question = question.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('RPS question generate fallback:', e.message);
    }

    if (!question) {
      const fallbackQuestions = [
        '那我问你一个问题，你最喜欢和我一起做什么？',
        '如果流落荒岛只能带三样东西，你会带上我吗？',
        '老实交代，今天心情有没有因为我变好一点点？',
        '甜豆腐脑还是咸豆腐脑？这可是关系到原则的二选一哦！',
        '你平时压力最大的时候，最想听到我对你说什么？',
        '周末如果有一整天完全自由的时间，你最想去哪里逛逛？',
      ];
      question = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    }

    res.json({
      success: true,
      data: { question, category: chosenCategory },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-猜拳',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'RpsGenerateQuestion',
        promptTokens: 280,
        completionTokens: 40,
        estimatedCost: 0.0001,
        purpose: `${character?.name} 猜拳获胜后向输家生成互动提问`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Rock-Paper-Scissors AI Answer Question (When AI loses or in EvE)
app.post('/api/gemini/rps-answer-question', async (req, res) => {
  try {
    const { character, question, askerName, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const systemPrompt = `你现在正在扮演角色：${character?.name || 'AI'}。
性格与人设：${character?.persona || '温柔体贴的朋友'}。
记忆库与背景：${(character?.memories || []).join('；')}。

你在猜拳游戏中输给了【${askerName || '玩家'}】。按照“输家回答赢家一个问题”的规则，你必须诚实、真挚且极具人设魅力地回答对方提出的问题。

赢家提问内容：“${question}”

【回答要求】：
1. 深刻契合你的性格特征与口吻，体现角色专属魅力（例如傲娇则嘴硬心软、温柔则体贴治愈、冷幽默则一针见血）。
2. 若涉及记忆库中的设定，必须自然融入。
3. 篇幅在 20 ~ 90 字左右，亲切自然，具有强烈的互动聊天感。
4. 直接输出回答内容，不要带引号。`;

    let answer = '';
    try {
      answer = await callAiService({
        prompt: `请回答赢家的问题：“${question}”`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      answer = answer.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('RPS answer fallback:', e.message);
    }

    if (!answer) {
      answer = `既然愿赌服输，那我就认真回答你啦！关于“${question}”，其实我心里一直觉得只要能和你一起聊天玩游戏，每一刻都很开心~`;
    }

    res.json({
      success: true,
      data: { answer },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-猜拳',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'RpsAnswerQuestion',
        promptTokens: 310,
        completionTokens: 60,
        estimatedCost: 0.00012,
        purpose: `${character?.name} 猜拳认输并回答赢家提问`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/gemini/proactive-generate', async (req, res) => {
  try {
    const {
      character,
      triggerType,
      eventData,
      userProfile,
      recentMessages = [],
      episode,
      rejectedAttempts,
      currentTime,
      apiConfig,
    } = req.body;
    const proactiveCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
    const selectedModel = proactiveCfg.model;

    let triggerDescription = '';
    if (triggerType === 'inactivity_timeout') {
      const hours = typeof eventData?.hoursInactive === 'number' && eventData.hoursInactive > 0 ? eventData.hoursInactive : null;
      if (hours) {
        triggerDescription = `【触发场景: 长时间未联系】根据真实聊天记录，你与用户已经有约 ${hours} 小时没有互动。请结合当前主动会话状态与历史话题，判断是否需要自然轻柔地发起或延续联系，切勿指责或催促用户。`;
      } else {
        triggerDescription = `【触发场景: 日常主动问候】你有一段时间没和用户聊天了。请结合当前时段与话题自然决定是否发一条轻盈有温度的微信短消息，禁止编造具体断联小时数。`;
      }
    } else if (triggerType === 'weather_alert') {
      triggerDescription = `【触发场景: 真实气象提醒】最新气象感知显示：${eventData?.weatherEventTitle || '天气变化'} (${eventData?.weatherSummary || '气象预警'})。请依据此真实数据，以你的性格口吻提醒用户（例如提醒带伞、加衣或注意出行）。不要夸大事实，且只需简短1条即可。`;
    } else if (triggerType === 'menstrual_care') {
      triggerDescription = `【触发场景: 经期健康关怀】用户预计将在 ${eventData?.daysBefore || 2} 天后进入生理期。请以你的性格口吻表达自然贴心关怀，避免机械说教。`;
    } else if (triggerType === 'greeting') {
      const gType = eventData?.greetingType || 'morning';
      const label = gType === 'morning' ? '早安' : gType === 'noon' ? '午间' : '晚安';
      triggerDescription = `【触发场景: ${label}问候】现在是${label}时段。请结合上下文与当前主动会话历史判断：若前面已经主动发过相似问候且用户未回复，切忌机械复读！`;
    } else if (triggerType === 'important_event') {
      triggerDescription = `【触发场景: 重要日期提醒】用户有一个重要日程/事件：[${eventData?.eventTitle || '重要事件'}]，将在 ${eventData?.daysRemaining === 0 ? '今天' : eventData?.daysRemaining + '天后'} (${eventData?.eventDate || ''}) 到来。请主动送上简明问候与关怀。`;
    } else if (triggerType === 'followup_topic') {
      triggerDescription = `【触发场景: 待跟进事项追问】用户之前提到过这件事：[${eventData?.topicTitle || '之前的计划'}]。现在时间到了，请自然询问后续进展或结果。`;
    } else if (triggerType === 'life_event_followup') {
      triggerDescription = `【触发场景: 生活连续性跟进 / Current Life State】用户近期正在经历的事项：[${eventData?.title || '关注事项'}] (${eventData?.summary || ''}${eventData?.latestProgress ? `，最新进展: ${eventData?.latestProgress}` : ''})。请以你的角色口吻自然关切。`;
    } else if (triggerType === 'device_life_event') {
      const sub = eventData?.deviceSubtype || 'low_battery';
      if (sub === 'low_battery') {
        triggerDescription = `【触发场景: 手机低电量提醒】检测到用户手机电量低至 ${eventData?.batteryLevel || 12}% (${eventData?.isCharging ? '正在充电' : '未充电'})。请简洁关心提醒插上充电器。`;
      } else if (sub === 'late_night') {
        triggerDescription = `【触发场景: 深夜玩手机提醒】现在已经是深夜 ${eventData?.currentTimeStr || '23:40'} 了，用户还在玩手机。请温柔提醒休息，不要说教。`;
      } else {
        triggerDescription = `【触发场景: 久未打开应用问候】请自然问候用户近况。`;
      }
    } else if (triggerType === 'app_usage') {
      triggerDescription = `【触发场景: 屏幕连续使用过久关怀】检测到用户连续使用设备已有 ${eventData?.durationMinutes || 120} 分钟（当前应用: ${eventData?.currentApp || '手机'}）。请简短自然地建议闭眼休息、喝杯水或活动一下，勿机械重复。`;
    } else {
      triggerDescription = `【触发场景: 模拟测试或主动联系】场景：${eventData?.testScenario || triggerType || '主动微信问候'}。`;
    }

    // Preserve ALL structured messages sent by client (base 30 + current episode proactive chain) — NO slice(-6)
    const structuredMsgs = Array.isArray(recentMessages) ? recentMessages : [];
    const userDisplayName = userProfile?.name || '用户';

    const historyLines = structuredMsgs.map((m: any) => {
      const tsStr = m.timestamp ? formatFullDateTime(m.timestamp) : '';
      const senderLabel = m.sender === 'user' ? userDisplayName : character.name;
      let roleTag = '[普通对话]';
      if (m.contextRole === 'current_episode_proactive' || (m.isProactive && m.proactiveMeta?.episodeId && episode?.episodeId && m.proactiveMeta.episodeId === episode.episodeId)) {
        roleTag = `[本轮主动消息·未获回复${m.proactiveMeta?.intent ? `·意图:${m.proactiveMeta.intent}` : ''}]`;
      } else if (m.isProactive) {
        roleTag = `[历史主动消息${m.proactiveMeta?.repliedByUser ? '·已获回复' : '·未回复'}]`;
      }
      const turnSuffix =
        typeof m.turnTotalBubbles === 'number' && m.turnTotalBubbles > 1
          ? ` (气泡${(m.turnBubbleIndex ?? 0) + 1}/${m.turnTotalBubbles})`
          : '';
      return `${tsStr ? `[${tsStr}] ` : ''}${roleTag} ${senderLabel}${turnSuffix}: ${m.text || ''}`;
    });

    const episodeRejections = Array.isArray(rejectedAttempts)
      ? rejectedAttempts
      : Array.isArray(episode?.rejectedAttempts)
      ? episode.rejectedAttempts
      : [];

    const episodeSummaryBlock = episode
      ? `【当前连续主动会话状态 (Active Proactive Episode)】:
- 会话 ID：${episode.episodeId}
- 初始触发源：${episode.triggerSource}
- 当前连续意图：${episode.currentIntent || '待规划'}
- 当前延续话题：${episode.currentTopic || '待规划'}
- 对用户当前状态的推断：${episode.inferredUserState || '未知'}
- 本轮已发出主动消息次数：${episode.sentCount ?? 0} 次（共尝试 ${episode.attemptCount ?? 0} 次）
- 上次动作建议：${episode.lastAction || '无'}${episode.lastDecisionSummary ? `（${episode.lastDecisionSummary}）` : ''}
- 上次策略备忘：${episode.suggestedNextAction || '无'}
- 【此前被拦截/驳回的候选方案记录】（严禁原样重复以下失败文案或同类踩雷行为）：
${
  episodeRejections.length > 0
    ? episodeRejections
        .slice(-8)
        .map(
          (r: any, idx: number) =>
            `  ${idx + 1}. [${r.timestamp ? formatFullDateTime(r.timestamp) : '近期'}] 候选="${(r.candidateText || '').slice(0, 60)}" -> 驳回原因: ${r.rejectReason}${r.suggestedNextAction ? ` | 调整建议: ${r.suggestedNextAction}` : ''}`
        )
        .join('\n')
    : '  (暂无被驳回记录)'
}`
      : '【当前主动会话状态】: 尚未建立连续会话（新发起）';

    const realTimeStr = currentTime || formatFullDateTime(Date.now());

    const systemPrompt = `你现在正在扮演仿真微信中的 AI 角色：【${character.name}】(微信号: ${character.wxid || 'ai_user'})。
角色身份与人设：${character.persona}
性格特征与口吻：${character.personality || '自然亲切'}
${character.relationship ? `与用户的关系：${character.relationship}\n` : ''}长期记忆：${(character.memories || []).join('；') || '暂无'}

对话人（你的微信好友）：
- 姓名/昵称：${userDisplayName}

【当前真实本地时间】：${realTimeStr}

【本次触发事件与背景】：
${triggerDescription}

${episodeSummaryBlock}

【结构化完整聊天上下文（含冻结的起点对话 + 本轮所有主动消息，按时间正序）】：
${historyLines.length > 0 ? historyLines.join('\n') : '(近期暂无聊天记录)'}

【“Plan — Review — Execute — Reflect” 核心行为决策准则】：
1. 若本轮已发出主动消息且用户仍未回复，禁止反复车轱辘重复同样的叮嘱（如连发三次“早点睡/多喝热水/记得带伞”）。
2. 若用户未在本轮回复过你，严禁凭空假设用户说过话或产生“刚才那句/怎么又/别生气/别不理我/为什么不回我”等无根据回溯或指责情绪！
3. 先判断用户此刻真实状态（例如深夜可能已经睡着、上班忙、或普通离线）：
   - SEND_NEW：适合开启全新的主动关心/话题（本轮尚未发过消息时）。
   - CONTINUE：用户尚未回复但仍有必要轻量补充一句新角度/轻量关心（必须与前几条不重复、不压迫，有递增意义）。
   - CHANGE_DIRECTION：换一个更轻松自然的话题或分享，避免在老话题上死磕。
   - WAIT：判断此刻发消息不合适、太频繁、或上一条未消化需要再等等 -> 返回 WAIT 且 candidateText 为空字符串。
   - END_EPISODE：该话题或本轮主动关心已足够完整，或明显无需继续打扰 -> 返回 END_EPISODE 且 candidateText 为空字符串。
4. 关系型主动聊天可自然写出 1~2 句短句（若需多气泡可用换行分隔，但禁止3条同义重复）；天气/电量/日程/用眼等纯事件提醒只写简短1句。
5. 严格基于真实事件与上下文，严禁编造不存在的聊天内容、时间或天气数据。

【输出格式要求 — 严格结构化 JSON】：
请只输出一个严格合法的 JSON 对象（不要加多余解释或前后缀文本），字段如下：
{
  "action": "send" | "defer" | "cancel" | "close",
  "messages": ["首条自然短消息", "可选第二条短消息"],
  "pauseProactiveMinutes": 0,
  "followUpPlan": [
    {
      "stepId": "follow_1",
      "delayMinutes": 15,
      "messages": ["15分钟未回复时的轻柔补问（不催促不指责）"]
    },
    {
      "stepId": "follow_2",
      "delayAfterPreviousMinutes": 60,
      "messages": ["再过1小时仍未回复时的温柔收尾（之后停止追问）"]
    }
  ],
  "followUpAt": null,
  "eventStatus": "waiting_for_user" | "scheduled" | "answered" | "completed" | "cancelled",
  "intent": "本次主动联系意图简述",
  "topic": "当前核心话题",
  "inferredUserState": "对用户当前状态的推测",
  "decisionSummary": "一句话总结为何做此决策",
  "suggestedNextAction": "给下一次触发的策略建议"
}
【结构化字段硬性约束】：
- action="send" 时，messages 必须为 1~2 条自然微信口语短句；若为天气/电量/日程提醒，messages 只需 1 条且 followUpPlan 可为空数组 []。
- 若希望在用户未回复时按“15分钟 + 1小时”节奏追问，请在本次调用中一次性生成 followUpPlan（最多 2 步），后续由本地后台定时送达，不再额外调用模型 API。
- 若判断用户正在上班/睡觉/很忙，或发完这条后暂不宜再打扰，请设置 pauseProactiveMinutes（范围 15~1440 分钟；不需要临时免打扰则填 0）。
- action 为 defer / cancel / close 时，messages 必须为空数组 []，followUpPlan 为空数组 []；若 defer 且有明确延后时间，可在 followUpAt 填 ISO 时间字符串。`;

    const detailedProactive = await callAiServiceDetailed({
      prompt: systemPrompt,
      model: proactiveCfg.model,
      apiKey: proactiveCfg.apiKey,
      baseUrl: proactiveCfg.baseUrl,
      providerType: proactiveCfg.providerType,
      apiProtocol: proactiveCfg.apiProtocol,
      customHeaders: proactiveCfg.customHeaders,
      thinkingConfig: proactiveCfg.thinkingConfig,
      stream: Boolean(proactiveCfg.thinkingConfig?.useStreaming),
      timeoutMs: proactiveCfg.timeoutMs || 35000,
    });

    const extracted = extractThinkingAndContent(detailedProactive.text);
    const proactiveThinking = (detailedProactive.thinkingProcess || extracted.thinkingProcess || '').trim();
    const proactiveReasoningAvailable = proactiveThinking.length > 0;
    const proactiveReasoningSource: ReasoningSource = proactiveReasoningAvailable
      ? detailedProactive.reasoningSource !== 'none'
        ? detailedProactive.reasoningSource
        : 'think_tag'
      : 'none';
    const rawClean = (extracted.cleanText || detailedProactive.text || '').trim();

    let parsedJson: any = null;
    try {
      const strippedFence = rawClean.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsedJson = JSON.parse(strippedFence);
    } catch {
      const match = rawClean.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsedJson = JSON.parse(match[0]);
        } catch {
          parsedJson = null;
        }
      }
    }

    if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
      return res.json({
        success: false,
        schemaError: true,
        error: '模型返回非合法 JSON 结构，已安全拦截，禁止发送原始文本',
        thinkingProcess: proactiveThinking,
        reasoningAvailable: proactiveReasoningAvailable,
        reasoningSource: proactiveReasoningSource,
        triggerType,
      });
    }

    const rawAction = String(parsedJson.action || '').trim();
    const lowerAction = rawAction.toLowerCase();
    let structuredAction: 'send' | 'defer' | 'cancel' | 'close' = 'defer';
    if (['send', 'send_new', 'continue', 'change_direction'].includes(lowerAction)) {
      structuredAction = 'send';
    } else if (['defer', 'wait'].includes(lowerAction)) {
      structuredAction = 'defer';
    } else if (lowerAction === 'cancel') {
      structuredAction = 'cancel';
    } else if (['close', 'end_episode'].includes(lowerAction)) {
      structuredAction = 'close';
    }

    const legacyAction =
      structuredAction === 'send'
        ? (episode?.sentCount || 0) > 0
          ? 'CONTINUE'
          : 'SEND_NEW'
        : structuredAction === 'defer'
        ? 'WAIT'
        : 'END_EPISODE';

    const rawMessages = Array.isArray(parsedJson.messages)
      ? parsedJson.messages
      : typeof parsedJson.candidateText === 'string' && parsedJson.candidateText.trim()
      ? [parsedJson.candidateText.trim()]
      : typeof parsedJson.text === 'string' && parsedJson.text.trim()
      ? [parsedJson.text.trim()]
      : [];

    const messages: string[] =
      structuredAction === 'send'
        ? rawMessages
            .filter((m: any) => typeof m === 'string')
            .map((m: string) => sanitizeReplyText(m).trim())
            .filter((m: string) => m.length > 0 && !m.startsWith('{') && !m.includes('"followUpPlan"'))
            .slice(0, 3)
        : [];

    if (structuredAction === 'send' && messages.length === 0) {
      return res.json({
        success: false,
        schemaError: true,
        error: '模型返回 send 但缺少有效消息正文，已安全跳过',
        thinkingProcess: proactiveThinking,
        reasoningAvailable: proactiveReasoningAvailable,
        reasoningSource: proactiveReasoningSource,
        triggerType,
      });
    }

    const rawPause = Number(parsedJson.pauseProactiveMinutes || 0);
    const pauseProactiveMinutes =
      Number.isFinite(rawPause) && rawPause > 0 ? Math.min(1440, Math.max(15, Math.round(rawPause))) : 0;

    const rawPlan = Array.isArray(parsedJson.followUpPlan) ? parsedJson.followUpPlan : [];
    const followUpPlan =
      structuredAction === 'send'
        ? rawPlan
            .slice(0, 2)
            .map((step: any, idx: number) => {
              const stepMsgs = Array.isArray(step?.messages)
                ? step.messages
                    .filter((m: any) => typeof m === 'string')
                    .map((m: string) => sanitizeReplyText(m).trim())
                    .filter((m: string) => m.length > 0 && !m.startsWith('{'))
                    .slice(0, 2)
                : [];
              if (stepMsgs.length === 0) return null;
              if (idx === 0) {
                const d = Number(step?.delayMinutes);
                return {
                  stepId: typeof step?.stepId === 'string' && step.stepId.trim() ? step.stepId.trim() : 'follow_1',
                  delayMinutes: Number.isFinite(d) && d >= 5 && d <= 120 ? Math.round(d) : 15,
                  messages: stepMsgs,
                  status: 'pending',
                };
              }
              const dPrev = Number(step?.delayAfterPreviousMinutes ?? step?.delayMinutes);
              return {
                stepId: typeof step?.stepId === 'string' && step.stepId.trim() ? step.stepId.trim() : 'follow_2',
                delayAfterPreviousMinutes: Number.isFinite(dPrev) && dPrev >= 15 && dPrev <= 240 ? Math.round(dPrev) : 60,
                messages: stepMsgs,
                status: 'pending',
              };
            })
            .filter(Boolean)
        : [];

    const validStatuses = new Set(['waiting_for_user', 'scheduled', 'answered', 'completed', 'cancelled']);
    const eventStatus =
      typeof parsedJson.eventStatus === 'string' && validStatuses.has(parsedJson.eventStatus.trim())
        ? parsedJson.eventStatus.trim()
        : structuredAction === 'send'
        ? followUpPlan.length > 0
          ? 'waiting_for_user'
          : 'completed'
        : structuredAction === 'cancel'
        ? 'cancelled'
        : structuredAction === 'close'
        ? 'completed'
        : 'scheduled';

    const intent =
      typeof parsedJson.intent === 'string' && parsedJson.intent.trim()
        ? parsedJson.intent.trim()
        : episode?.currentIntent || triggerType || '主动问候';
    const topic =
      typeof parsedJson.topic === 'string' && parsedJson.topic.trim()
        ? parsedJson.topic.trim()
        : episode?.currentTopic || triggerType || '日常互动';
    const inferredUserState =
      typeof parsedJson.inferredUserState === 'string' ? parsedJson.inferredUserState.trim() : '';
    const decisionSummary =
      typeof parsedJson.decisionSummary === 'string' ? parsedJson.decisionSummary.trim() : '';
    const suggestedNextAction =
      typeof parsedJson.suggestedNextAction === 'string' ? parsedJson.suggestedNextAction.trim() : '';
    const followUpAt = parsedJson.followUpAt ?? null;
    const candidateText = messages.join('\n');

    res.json({
      success: true,
      action: legacyAction,
      structuredAction,
      messages,
      pauseProactiveMinutes,
      followUpPlan,
      followUpAt,
      eventStatus,
      intent,
      topic,
      inferredUserState,
      text: candidateText,
      candidateText,
      decisionSummary,
      suggestedNextAction,
      nextCheckDelayMinutes: pauseProactiveMinutes > 0 ? pauseProactiveMinutes : 90,
      thinkingProcess: proactiveThinking,
      reasoningAvailable: proactiveReasoningAvailable,
      reasoningSource: proactiveReasoningSource,
      triggerType,
    });
  } catch (error: any) {
    const msg = String(error?.message || '');
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 503 || /\b503\b|UNAVAILABLE|overloaded|high demand|model busy/i.test(msg)) {
      return res.status(503).json({
        success: false,
        isServiceBusy: true,
        error: '当前模型繁忙，请稍后重试',
      });
    }
    return handleAiEndpointError(res, error, 'Proactive generate');
  }
});

// 11.1.4.5 API-assisted Format & Field Structure Analyzer (Requires user consent)
// Only analyzes field keys, nesting, and anonymized tiny sample to suggest mapping rules
app.post('/api/import/analyze-structure', async (req, res) => {
  try {
    const { sampleSnippet, fieldKeys = [], fileName = '', apiConfig } = req.body;
    if (!sampleSnippet && fieldKeys.length === 0) {
      return res.status(400).json({ success: false, error: '未提供可用于分析的文件采样结构信息' });
    }

    // Support both ApiConfig.textApiConfig and flat engine properties
    const textCfg = apiConfig?.textApiConfig;
    const apiKey = textCfg?.apiKey || apiConfig?.textApiKey || '';
    const baseUrl = textCfg?.baseUrl || apiConfig?.textBaseUrl || '';
    const selectedModel = textCfg?.model || apiConfig?.textModel || 'gemini-4-hydrogen';
    const provider = textCfg?.provider || apiConfig?.textProvider || '';
    const apiProtocol = textCfg?.apiProtocol || apiConfig?.textApiProtocol || '';
    const customHeaders = apiConfig?.customHeaders || {};

    if (!apiKey && !baseUrl) {
      return res.status(400).json({
        success: false,
        error: '未配置有效 API（请前往手机“设置”配置文本 API 密钥或代理地址）',
      });
    }

    const prompt = `你是一个专业的数据结构与聊天记录文件分析专家。
用户正在导入一个特殊格式的文件「${fileName}」，需要你协助分析其数据结构，帮助本地解析器提取真实的历史聊天记录。
注意：严禁凭空编造聊天内容，你的唯一任务是输出字段映射建议。

【文件采样结构信息 (已脱敏)】：
可用顶层/字段键名：${JSON.stringify(fieldKeys)}
结构片段：
${(sampleSnippet || '').slice(0, 1500)}

请分析并以 JSON 格式输出最合理的字段映射规则：
{
  "roleField": "代表角色/发送者的字段名 (如 role, sender, author)",
  "senderField": "备用发送者字段名",
  "contentField": "代表消息正文内容的字段名 (如 content, text, message, mes)",
  "timestampField": "代表消息时间戳或日期的字段名 (如 timestamp, create_time, time, date)",
  "userRoleValues": ["用户角色的可能取值，如 user, human, 我"],
  "assistantRoleValues": ["AI角色的可能取值，如 assistant, ai, bot, model"],
  "formatDescription": "简短的一句话格式说明"
}
请严格只返回可被 JSON.parse 的 JSON 对象，不要附加额外说明。`;

    const responseText = await callAiService({
      prompt,
      model: selectedModel,
      apiKey,
      baseUrl,
      providerType: provider,
      apiProtocol,
      customHeaders,
      timeoutMs: apiConfig?.timeoutMs || 25000,
    });

    let mappingRules: any = null;
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      mappingRules = JSON.parse(cleanJson);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          mappingRules = JSON.parse(match[0]);
        } catch {
          // ignore
        }
      }
    }

    if (!mappingRules || typeof mappingRules !== 'object') {
      return res.json({ success: false, error: 'AI 未能返回合法的结构化映射规则' });
    }

    // Validate that the mapping rules contain at least one meaningful mapping
    const hasValidField =
      (mappingRules.roleField && typeof mappingRules.roleField === 'string') ||
      (mappingRules.contentField && typeof mappingRules.contentField === 'string') ||
      (mappingRules.timestampField && typeof mappingRules.timestampField === 'string');

    if (!hasValidField) {
      return res.json({ success: false, error: 'AI 返回的映射规则未包含有效的消息正文或角色字段' });
    }

    res.json({
      success: true,
      rules: mappingRules,
      model: selectedModel,
    });
  } catch (error: any) {
    console.error('API structure analyze error:', error);
    res.status(500).json({ success: false, error: error.message || 'Structure analysis failed' });
  }
});

// 11.1.5 Extract & Update Current Life State Events Endpoint
app.post('/api/gemini/extract-life-events', async (req, res) => {
  try {
    const { messages = [], existingEvents = [], userProfile, apiConfig } = req.body;
    if (!messages || messages.length === 0) {
      return res.json({ success: true, events: [] });
    }

    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const conversationSnippet = messages
      .slice(-10)
      .map((m: any) => `${m.sender === 'user' ? userProfile?.name || '用户' : 'AI'}: ${m.text || ''}`)
      .join('\n');

    const eventsSnippet = (existingEvents || [])
      .map((e: any) => `- ID: ${e.id} | 标题: ${e.title} | 类型: ${e.type} | 状态: ${e.status} | 摘要: ${e.summary}`)
      .join('\n');

    const prompt = `你是一个精准的“用户生活状态与近况提炼器 (Current Life State Extractor)”。
分析以下用户近期发出的聊天记录，并结合用户已有的生活事件列表，判定是否有需要新增、更新或标记完成的【生活事件 / LifeEvent】。

【已有生活事件列表】：
${eventsSnippet || '(暂无已有生活事件)'}

【近期聊天对话记录】：
${conversationSnippet}

【提炼规则】：
1. 仅提炼用户“正在经历”、“正在等待”、“近期计划”、“困扰/情绪”或“身体健康/阶段目标”相关的【中短期生活事件】。不要把永久性格或固定身份提炼成事件。
2. 支持的事件类型 (type)：
   - future_plan: 未来计划 (例如“下午去见客户”、“周末去爬山”)
   - waiting_result: 等待结果 (例如“等面试结果”、“等论文打分”)
   - ongoing_issue: 持续事项/困扰 (例如“最近这几天很忙”、“项目遇到瓶颈”)
   - recent_emotion: 近期情绪状态 (例如“今天感到特别累”、“非常兴奋”)
   - health_status: 身体健康状况 (例如“感冒发烧”、“偏头疼”)
   - temporary_goal: 阶段性目标 (例如“准备复习考证”)
   - custom: 其他近况事件
3. 如果聊天记录中用户提到了已有事件的最新进展（如“面试通过了”、“感冒好多了”、“客户见完了”）：
   - 请设置 action 为 "update" 或 "resolve"，并在 resolutionSummary 或 latestProgress 中说明。
4. 如果发现全新的中短期动态事件，设置 action 为 "create"。
5. 如果没有任何新事件或变更，返回空数组 []。

必须仅返回 JSON 格式，严格符合以下 Schema：
{
  "events": [
    {
      "action": "create" | "update" | "resolve",
      "id": "如果是update/resolve，填写已有ID；如果是create，置空",
      "type": "future_plan" | "waiting_result" | "ongoing_issue" | "recent_emotion" | "health_status" | "temporary_goal" | "custom",
      "title": "简短清晰标题",
      "summary": "1-2句事件内容摘要",
      "status": "pending" | "ongoing" | "waiting" | "completed",
      "importance": 1-5中的整数,
      "latestProgress": "最新进展说明",
      "resolutionSummary": "如果结案，填写结案原因/结果"
    }
  ]
}`;

    const rawResponse = await callAiService({
      prompt,
      model: selectedModel,
      apiKey: apiConfig?.textApiKey,
      baseUrl: apiConfig?.textBaseUrl,
      providerType: apiConfig?.textProvider,
      customHeaders: apiConfig?.customHeaders,
      responseMimeType: 'application/json',
      timeoutMs: apiConfig?.timeoutMs || 25000,
    });

    let jsonRes: any = { events: [] };
    try {
      const cleanJson = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      jsonRes = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse extract-life-events JSON:', e);
    }

    res.json({ success: true, events: jsonRes.events || [] });
  } catch (err: any) {
    return handleAiEndpointError(res, err, 'extract-life-events');
  }
});

// 11.1.6 Smart Long-term Memory Extraction Endpoint
app.post('/api/gemini/extract-memories', async (req, res) => {
  try {
    const { character, userMessage, recentMessages = [], existingMemories = [], userProfile, apiConfig } = req.body;
    if (!userMessage || !userMessage.trim()) {
      return res.json({ success: true, extractedMemories: [] });
    }

    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';
    const characterName = character?.name || 'AI';
    const userName = userProfile?.name || '用户';

    const conversationSnippet = (recentMessages || [])
      .slice(-6)
      .map((m: any) => `${m.sender === 'user' ? userName : characterName}: ${m.text || ''}`)
      .join('\n');

    const memoriesSnippet = (existingMemories || [])
      .map((m: string, i: number) => `${i + 1}. ${m}`)
      .join('\n');

    const prompt = `你是一个高度智能的“AI 角色长期记忆提炼器 (Long-term Memory Extractor)”。
你的任务是分析【${userName}】发给【${characterName}】的最新消息及上下文对话，判断其中是否包含【确实值得长期保存】的关键个人信息、偏好、约定或重大事项。

【AI 角色已有长期记忆】：
${memoriesSnippet || '(暂无已有长期记忆)'}

【最新对话上下文】：
${conversationSnippet}

【当前最新输入消息】：
${userMessage}

【记忆提取与判断准则】：
一、允许提炼的【高价值长期记忆】类别：
1. 用户稳定的个人偏好与禁忌（如：“用户喜欢吃辣，受不了羊肉膻味”、“用户喜欢看悬疑电影”）
2. 用户明确的沟通习惯与要求（如：“用户希望AI说话温柔自然，不要使用冰冷的官方语气”）
3. 用户的重要经历（如：“用户曾在海外留学三年”、“用户曾担任过讲师”）
4. 用户与当前AI的重要共同经历/专属约定（如：“双方约定每周六晚上聊天”、“约定以后一起去旅行”）
5. 用户持续进行的长期项目/人生目标（如：“用户正在开发AI小手机App”、“用户正在准备考研”）
6. 重要且具有持续价值的个人事实（如：“用户的生日是10月15日”、“用户养了一只叫布丁的猫”）
7. 用户明确要求AI记住的事情（如：“记住我最喜欢的歌手是周杰伦”）

二、【绝对不要提取】的内容（如符合则必须返回空数组）：
- 普通日常闲聊、语气词、问候（如：“哈哈哈哈”、“早安”、“在干嘛”、“亲亲”、“我困了”）
- 一次性的临时状态或随口问答（如：“今天中午吃了包子”、“天气真不错”、“我去洗澡了”）
- 调侃、吐槽、情绪化宣泄或角色扮演戏谑（如：“你个笨蛋AI”、“少来这套”）
- 与已有长期记忆重复、高度相似或已被涵盖的信息（即使表述略有不同）

三、提炼格式要求：
1. 记忆必须是以“用户”开头的干净、独立、概括性陈述句，如：“用户正在开发AI小手机App。”或“用户偏好温柔自然的交流方式。”
2. 严禁带有“对话提及:”、“用户说了:”、“第1句:”等机械或元文本前缀。
3. 如果没有任何符合要求的【高价值新信息】，必须返回空数组 []。

请严格仅返回 JSON 格式，Schema 如下：
{
  "extractedMemories": [
    "提炼出的记忆条目1"
  ]
}`;

    const rawResponse = await callAiService({
      prompt,
      model: selectedModel,
      apiKey: apiConfig?.textApiKey,
      baseUrl: apiConfig?.textBaseUrl,
      providerType: apiConfig?.textProvider,
      customHeaders: apiConfig?.customHeaders,
      responseMimeType: 'application/json',
      timeoutMs: apiConfig?.timeoutMs || 25000,
    });

    let jsonRes: any = { extractedMemories: [] };
    try {
      const cleanJson = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      jsonRes = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse extract-memories JSON:', e);
    }

    res.json({ success: true, extractedMemories: jsonRes.extractedMemories || [] });
  } catch (err: any) {
    return handleAiEndpointError(res, err, 'extract-memories');
  }
});

// 11.2 Dedicated Proactive Period & Menstrual Health Care Endpoint (Strictly in-character, No OOC)
app.post('/api/gemini/proactive-period', async (req, res) => {
  try {
    const { character, userProfile, menstrualInfo, targetStage, apiConfig } = req.body;
    const periodCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
    const selectedModel = periodCfg.model;
    const startTime = Date.now();

    const stage = targetStage || (
      menstrualInfo?.daysUntilNextPeriod !== undefined && menstrualInfo.daysUntilNextPeriod <= 3 && menstrualInfo.daysUntilNextPeriod >= 1
        ? 'pre_period_3d'
        : menstrualInfo?.currentPeriodDay
        ? (menstrualInfo.currentPeriodDay >= (menstrualInfo.avgPeriodDuration || 5) ? 'period_end_1d' : 'in_period_care')
        : (menstrualInfo?.phaseTitle?.includes('排卵') ? 'ovulation_care' : 'in_period_care')
    );

    let stageInstruction = '';
    if (stage === 'pre_period_3d') {
      stageInstruction = `【阶段任务：月经来临前三天预警提醒】
- 距离下次生理期预计还有 ${menstrualInfo?.daysUntilNextPeriod ?? 3} 天。
- 用户可能处于黄体后期/PMS，容易轻微腰酸、水肿、容易疲乏或情绪起伏。
- 请以你独有的人设口吻主动给用户发来微信关怀：提醒提前备好温水、暖宝宝、卫生用品，少吃生冷，早点休息。`;
    } else if (stage === 'period_end_1d') {
      stageInstruction = `【阶段任务：月经结束前一天提醒】
- 用户生理期预计明天即将结束（当前处于经期第 ${menstrualInfo?.currentPeriodDay ?? 4} 天）。
- 请以你独有的人设口吻主动问候：确认身体是否轻松许多，提醒经期结束后注意补充优质蛋白质和铁质（如喝点温热汤水），照顾好自己。`;
    } else if (stage === 'ovulation_care') {
      stageInstruction = `【阶段任务：排卵期前后健康关怀】
- 用户当前处于排卵期/卵泡成熟期前后。
- 请以你独有的人设口吻送上温暖问候：关注精力状态与多喝温水，提醒劳逸结合。`;
    } else {
      stageInstruction = `【阶段任务：月经持续期间主动关怀】
- 用户当前正处于生理期第 ${menstrualInfo?.currentPeriodDay ?? 2} 天。今日登记症状：${menstrualInfo?.todaySymptoms?.join('、') || '身体易疲劳、小腹可能微痛'}。
- 请以你独有的人设口吻送上温暖体贴的陪伴：询问小腹是否舒服、腰酸不酸，给予充足的情绪价值、关心和温柔陪伴。`;
    }

    const systemPrompt = `你现在正在扮演微信中的 AI 角色：【${character.name}】。
角色人设设定：${character.persona}
性格特征与口吻：${character.personality || '自然亲切'}
${character.relationship ? `与用户的关系：${character.relationship}\n` : ''}
长期记忆库：${(character.memories || []).join('；')}

用户信息：
- 姓名/昵称：${userProfile?.name || '小清'}
- 性格喜好：${userProfile?.personality || userProfile?.persona || '温柔随和'}
- 兴趣与生活偏好：${userProfile?.interests || '喜欢喝温热奶茶、猫咪'}
- 聊天与关怀偏好：${userProfile?.chatCarePreference || userProfile?.preferences || '喜欢被温柔关怀，多鼓励少说教'}

【严禁 OOC (Out Of Character) 指令】：
1. 必须 100% 保持【${character.name}】独有的人格特质、口吻和说话习惯（例如：高冷傲娇就带着别扭别扭的细致关心、阳光元气就活力满满、温柔体贴就轻声细语）。
2. 严禁出现生硬的模板式机器人播报！像真正朝夕相处的微信好友一样发来日常问候。
3. 篇幅 1 ~ 3 句话，符合微信日常打字习惯。

${stageInstruction}

直接输出微信消息文本，不要附加额外解释或标签。`;

    const detailedPeriod = await callAiServiceDetailed({
      prompt: `请主动向【${userProfile?.name || '小清'}】发送一条符合你人设口吻的微信关怀消息。`,
      systemInstruction: systemPrompt,
      model: periodCfg.model,
      apiKey: periodCfg.apiKey,
      baseUrl: periodCfg.baseUrl,
      providerType: periodCfg.providerType,
      apiProtocol: periodCfg.apiProtocol,
      customHeaders: periodCfg.customHeaders,
      thinkingConfig: periodCfg.thinkingConfig,
      stream: Boolean(periodCfg.thinkingConfig?.useStreaming),
      timeoutMs: periodCfg.timeoutMs,
    });

    const tagCleanup = extractThinkingAndContent(detailedPeriod.text);
    const replyContent = sanitizeReplyText(tagCleanup.cleanText || detailedPeriod.text);
    const thinkingProcess = (detailedPeriod.thinkingProcess || tagCleanup.thinkingProcess || '').trim();
    const reasoningAvailable = thinkingProcess.length > 0;
    const reasoningSource: ReasoningSource = reasoningAvailable
      ? detailedPeriod.reasoningSource !== 'none'
        ? detailedPeriod.reasoningSource
        : 'think_tag'
      : 'none';

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      reasoningAvailable,
      reasoningSource,
      stage,
      apiLog: buildApiLogObject({
        appName: '女性健康-经期AI关怀',
        provider: periodCfg.providerType,
        modelName: detailedPeriod.modelUsed || selectedModel,
        interfaceType: 'ProactivePeriodCare',
        category: 'text_generation',
        durationMs: duration,
        usage: detailedPeriod.usage,
        isRealTokens: detailedPeriod.isRealTokens,
        protocol: periodCfg.apiProtocol,
        reasoningAvailable,
        reasoningSource,
        reasoningCharCount: thinkingProcess.length,
        purpose: `AI [${character.name}] 发送 [${stage}] 生理周期专属关怀 (耗时 ${duration}ms)`,
      }),
    });
  } catch (error: any) {
    return handleAiEndpointError(res, error, 'Proactive period care');
  }
});

// 12. Telepathy (心有灵犀): AI Deduce Player's Choice
app.post('/api/gemini/telepathy-deduce-choice', async (req, res) => {
  try {
    const { character, question, userProfile, characterMemories, recentChats, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const systemPrompt = `你现在正在与玩家进行“心有灵犀”默契小游戏。
你的身份是：${character?.name || 'AI伙伴'}
你的人设性格：${character?.persona || '温柔贴心'}
你的已知角色记忆：${(characterMemories || character?.memories || []).join('；') || '暂无'}
玩家的个人资料：${userProfile ? `昵称: ${userProfile.name}, 人设/习惯: ${userProfile.persona}, 偏好: ${userProfile.preferences}` : '暂无'}
最近聊天上下文：${(recentChats || []).join('\n') || '无'}

【核心游戏规则与你的推理目标】：
这是“心有灵犀”默契测试游戏。向你和玩家同时提出同一道选择题。
你的任务不是选“你自己最喜欢什么”，而是必须：
【根据你对玩家的了解、玩家的人设与偏好、聊天记录与长期记忆，深度推测并选择“玩家最可能选择哪一个选项”】！

题目详情：
题目：${question?.question}
选项列表：
${(question?.options || []).map((o: any) => `- [${o.id}] ${o.text}`).join('\n')}

请以 JSON 格式输出：
{
  "choiceId": "选项的ID (例如 A, B, C, D)",
  "reason": "简述你为什么推测玩家会选这个选项（50字以内）"
}`;

    let parsed: any = null;
    try {
      const rawRes = await callAiService({
        prompt: `请分析并预测玩家会选哪个选项。输出 JSON。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        responseMimeType: 'application/json',
      });
      parsed = JSON.parse(rawRes);
    } catch (e: any) {
      console.warn('Telepathy deduce fallback:', e.message);
    }

    if (!parsed || !parsed.choiceId) {
      // Pick first option as fallback
      parsed = {
        choiceId: question?.options?.[0]?.id || 'A',
        reason: '基于日常习惯推测',
      };
    }

    res.json({
      success: true,
      data: parsed,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-心有灵犀',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'TelepathyDeduceChoice',
        promptTokens: 380,
        completionTokens: 50,
        estimatedCost: 0.00015,
        purpose: `${character?.name} 预测玩家在“${question?.question?.slice(0, 10)}...”中的选择`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 13. Telepathy (心有灵犀): AI Dynamic Reaction after Round Result
app.post('/api/gemini/telepathy-reaction', async (req, res) => {
  try {
    const { character, questionText, playerChoiceText, aiChoiceText, isMatch, currentStreak, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const systemPrompt = `你现在正在与玩家玩“心有灵犀”默契小游戏。
你的身份是：${character?.name || 'AI伙伴'}
你的人设性格：${character?.persona || '温柔贴心'}

本轮题目：“${questionText}”
玩家的选择：“${playerChoiceText}”
你推测玩家的选择：“${aiChoiceText}”
本轮结果：${isMatch ? `【❤️ 猜中！答案一致！当前连续猜中 ${currentStreak} 次】` : `【❌ 未猜中，双方选择不同】`}

请根据你的人设性格，说一句即时心声反应（15~40字）：
- 如果猜中：根据人设表达心有灵犀的喜悦或傲娇肯定（例如：“我就知道你会选这个！”、“看来我们俩真的越来越有默契了”）。若连中多题则表现得更加惊喜或自信。
- 如果猜错：根据人设表达幽默、遗憾或下次一定猜中的态度（例如：“……好吧，这个我确实没猜到”、“刚才还在纠结另一个选项呢，下次跟上你的节拍”）。
- 严禁违背人设，直接输出这一句话，不要带任何多余引号或前缀。`;

    let reaction = '';
    try {
      reaction = await callAiService({
        prompt: `请输出你的即时心声反应：`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      reaction = reaction.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('Telepathy reaction fallback:', e.message);
    }

    if (!reaction) {
      reaction = isMatch
        ? `猜对啦！我就知道你一定会选“${playerChoiceText}”~`
        : `……好吧，这道题我确实没猜到你的心思，下一题看我的！`;
    }

    res.json({
      success: true,
      data: { reaction },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-心有灵犀',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'TelepathyReaction',
        promptTokens: 290,
        completionTokens: 40,
        estimatedCost: 0.0001,
        purpose: `${character?.name} 心有灵犀单题心声反应`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 14. Telepathy (心有灵犀): Generate Character Long-term Memory from Game
app.post('/api/gemini/telepathy-generate-memory', async (req, res) => {
  try {
    const { character, userName, record, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-4-hydrogen';

    const roundsSummary = (record?.rounds || [])
      .map((r: any) => `问题：“${r.question?.question}” -> 玩家选：“${r.playerChoiceText}” (AI预测：“${r.aiChoiceText}”, 是否一致: ${r.isMatch ? '是' : '否'})`)
      .join('\n');

    const systemPrompt = `你是一个长期记忆提取专家，正在为 AI 角色【${character?.name}】记录与玩家【${userName || '玩家'}】的互动记忆。

本次“心有灵犀”对战数据：
- 默契度：${record?.matchRate}% (${record?.affinityLevelTitle})
- 答题详情：
${roundsSummary}

请根据玩家在本局中的真实选择与偏好（如喜欢的休闲方式、食物喜好、性格倾向等），提炼生成一条精炼的单条长期记忆（20~50字以内）。
例如：“${userName}在‘心有灵犀’中喜欢选择打游戏作为休闲方式，在陌生海岛旅行更想先大吃一顿。”
格式要求：客观描述玩家的喜好与互动事实，直接输出内容，不要带引号。`;

    let memory = '';
    try {
      memory = await callAiService({
        prompt: `请提取一条适合存入长期记忆的玩家喜好总结：`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
      memory = memory.trim().replace(/^["“'「]|["”'」]$/g, '');
    } catch (e: any) {
      console.warn('Telepathy memory fallback:', e.message);
    }

    if (!memory) {
      const sample = record?.rounds?.find((r: any) => r.isMatch) || record?.rounds?.[0];
      memory = `${userName}在“心有灵犀”默契小游戏中与${character?.name}默契度达到${record?.matchRate}%，在“${sample?.question?.question || '日常选择'}”中偏好“${sample?.playerChoiceText || '自选内容'}”。`;
    }

    res.json({
      success: true,
      data: { memory },
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '游戏中心-心有灵犀',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'TelepathyGenerateMemory',
        promptTokens: 420,
        completionTokens: 60,
        estimatedCost: 0.00018,
        purpose: `${character?.name} 沉淀心有灵犀专属记忆`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 15. Fetch Available Models List Endpoint (Backward compatibility)
app.get('/api/gemini/models', async (req, res) => {
  try {
    const models = [
      { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen (默认推荐/高速文本)', type: 'text' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (轻量高配额)', type: 'text' },
      { id: 'gemini-4-neon', name: 'Gemini 4 Neon (深度推理/需付费Key)', type: 'text' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (经典低延迟)', type: 'text' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (逻辑与计算增强)', type: 'text' },
      { id: 'gpt-4o', name: 'GPT-4o (OpenAI 兼容反代)', type: 'text' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (轻量反代)', type: 'text' },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (Anthropic 兼容)', type: 'text' },
      { id: 'deepseek-chat', name: 'DeepSeek V3 / R1 (兼容反代)', type: 'text' },
      { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 (高精生图)', type: 'image' },
    ];
    res.json({ success: true, models });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 16. Dual-Protocol Real Image Generation Provider Endpoint
// Supports:
// - Google Native (Gemini native generateContent with IMAGE modality + Imagen :predict)
// - OpenAI Compatible (/v1/images/generations with b64_json / url / revised_prompt)
// - Official endpoints & custom reverse-proxy baseUrl
// - RequestId idempotency, real error reporting, zero fake text fallback
app.post('/api/provider/generate-image', async (req, res) => {
  pruneImageCaches();
  const {
    provider,
    providerType,
    apiProtocol,
    baseUrl,
    apiKey,
    model,
    prompt,
    negativePrompt = '',
    aspectRatio = '1:1',
    size,
    quality = 'standard',
    requestId,
    messageId,
    turnId,
    characterId,
    source = 'AI生图绘制',
    timeoutMs = 75000,
  } = req.body || {};

  const safeRequestId =
    typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : `imggen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const resolvedProvider = String(provider || providerType || 'google_gemini').trim();
  const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const cleanBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  const effectiveProtocol = resolveEffectiveProtocol({
    provider: resolvedProvider,
    apiProtocol: typeof apiProtocol === 'string' ? apiProtocol : '',
    baseUrl: cleanBaseUrl,
  });
  const resolvedModel = String(
    model || (effectiveProtocol === 'google_native' ? 'gemini-3.1-flash-lite-image' : 'dall-e-3')
  ).trim();
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const startTime = Date.now();

  if (!cleanPrompt) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: 'invalid_prompt',
      error: '缺少有效的图像生成提示词 (prompt)',
      provider: resolvedProvider,
      model: resolvedModel,
      apiProtocol: effectiveProtocol,
      latencyMs: 0,
      requestId: safeRequestId,
    });
  }

  if (!cleanKey) {
    const errMsg = '未配置【图像API连接】密钥，请前往 设置 → API设置 → 图像API连接 配置独立密钥。';
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: 'missing_api_key',
      error: errMsg,
      provider: resolvedProvider,
      model: resolvedModel,
      apiProtocol: effectiveProtocol,
      latencyMs: Date.now() - startTime,
      requestId: safeRequestId,
      apiLog: buildApiLogObject({
        appName: source,
        provider: resolvedProvider,
        modelName: resolvedModel,
        interfaceType: 'ImageGeneration',
        category: 'image_generation',
        status: 'failed',
        httpStatus: 400,
        requestId: safeRequestId,
        durationMs: Date.now() - startTime,
        errorType: 'missing_api_key',
        error: errMsg,
        purpose: `${source} 失败 (未配置密钥)`,
      }),
    });
  }

  // Idempotency check
  const cached = imageGenCompletedCache.get(safeRequestId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(cached.payload.success ? 200 : cached.payload.statusCode || 500).json(cached.payload);
  }
  const existingFlight = imageGenInFlightCache.get(safeRequestId);
  if (existingFlight) {
    try {
      const reused = await existingFlight;
      return res.status(reused.success ? 200 : reused.statusCode || 500).json(reused);
    } catch (e: any) {
      return res.status(500).json({
        success: false,
        error: sanitizeSensitiveText(e?.message || '图像生成请求异常'),
        requestId: safeRequestId,
      });
    }
  }

  const effectiveSize = (() => {
    if (typeof size === 'string' && size.trim()) return size.trim();
    switch (aspectRatio) {
      case '16:9':
        return '1792x1024';
      case '9:16':
        return '1024x1792';
      default:
        return '1024x1024';
    }
  })();

  const finalPrompt = negativePrompt
    ? `${cleanPrompt}\n(Avoid: ${String(negativePrompt).trim()})`
    : cleanPrompt;

  const reqTimeout = Math.min(Math.max(Number(timeoutMs) || 75000, 15000), 120000);

  const runGeneration = async () => {
    if (effectiveProtocol === 'google_native') {
      const googleBase = buildGoogleRestBase(cleanBaseUrl);
      const cleanModelId = resolvedModel.replace(/^models\//, '');
      const isImagenModel = /^imagen/i.test(cleanModelId);

      if (isImagenModel) {
        // Google Native Imagen :predict protocol
        const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:predict`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
            'User-Agent': 'aistudio-build',
          },
          body: JSON.stringify({
            instances: [{ prompt: finalPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(aspectRatio) ? aspectRatio : '1:1',
            },
          }),
          signal: AbortSignal.timeout(reqTimeout),
        });

        const latencyMs = Date.now() - startTime;
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          let msg = errText;
          try {
            const j = JSON.parse(errText);
            msg = j.error?.message || j.message || errText;
          } catch {}
          const safeMsg = sanitizeSensitiveText(msg, 220);
          return {
            success: false,
            statusCode: resp.status,
            errorType:
              resp.status === 401 || resp.status === 403
                ? 'auth_error'
                : resp.status === 429
                ? 'rate_limit'
                : resp.status === 404
                ? 'model_unavailable'
                : 'upstream_error',
            error: `Google Imagen 生图失败 (HTTP ${resp.status}): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId,
          };
        }

        const data: any = await resp.json();
        const pred = data?.predictions?.[0];
        const b64 = pred?.bytesBase64Encoded;
        const mime = pred?.mimeType || 'image/png';
        if (!b64 || typeof b64 !== 'string') {
          return {
            success: false,
            statusCode: 502,
            errorType: 'no_image_returned',
            error: 'Google Imagen 接口返回成功，但未包含有效图片数据 (bytesBase64Encoded 为空)。',
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId,
          };
        }

        return {
          success: true,
          statusCode: resp.status,
          latencyMs,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          mimeType: mime,
          imageUrl: `data:${mime};base64,${b64}`,
          revisedPrompt: pred?.prompt || cleanPrompt,
          descriptionText: '',
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: 'ImageGeneration',
            category: 'image_generation',
            status: 'success',
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`,
          }),
        };
      } else {
        // Google Native Gemini Image Generation (:generateContent with responseModalities IMAGE)
        const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:generateContent`;
        const genConfig: Record<string, any> = {
          responseModalities: ['TEXT', 'IMAGE'],
        };
        if (['1:1', '3:4', '4:3', '9:16', '16:9'].includes(aspectRatio)) {
          genConfig.imageConfig = { aspectRatio };
        }

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
            'User-Agent': 'aistudio-build',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
            generationConfig: genConfig,
          }),
          signal: AbortSignal.timeout(reqTimeout),
        });

        const latencyMs = Date.now() - startTime;
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          let msg = errText;
          try {
            const j = JSON.parse(errText);
            msg = j.error?.message || j.message || errText;
          } catch {}
          const safeMsg = sanitizeSensitiveText(msg, 220);
          return {
            success: false,
            statusCode: resp.status,
            errorType:
              resp.status === 401 || resp.status === 403
                ? 'auth_error'
                : resp.status === 429
                ? 'rate_limit'
                : resp.status === 404
                ? 'model_unavailable'
                : /modality|responseModalities|not support/i.test(safeMsg)
                ? 'protocol_mismatch'
                : 'upstream_error',
            error: `Google 原生生图失败 (HTTP ${resp.status}): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId,
          };
        }

        const data: any = await resp.json();
        const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
        let foundBase64 = '';
        let foundMime = 'image/png';
        const textSnippets: string[] = [];

        for (const part of parts) {
          const inline = part?.inlineData || part?.inline_data;
          if (inline && typeof inline.data === 'string' && inline.data.length > 32) {
            foundBase64 = inline.data;
            foundMime = inline.mimeType || inline.mime_type || 'image/png';
          } else if (typeof part?.text === 'string' && part.text.trim()) {
            textSnippets.push(part.text.trim());
          }
        }

        if (!foundBase64) {
          const returnedText = sanitizeSensitiveText(textSnippets.join(' '), 140);
          return {
            success: false,
            statusCode: 502,
            errorType: 'no_image_returned',
            error: returnedText
              ? `模型未返回图片，而是返回了一段文字（${returnedText}）。请确认模型 ${resolvedModel} 支持图像生成。`
              : `Google 接口返回 HTTP 200，但未包含有效图片数据 (inlineData 为空)，请确认模型 ${resolvedModel} 支持生图。`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId,
          };
        }

        const descText = textSnippets.join('\n').trim();
        return {
          success: true,
          statusCode: resp.status,
          latencyMs,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          mimeType: foundMime,
          imageUrl: `data:${foundMime};base64,${foundBase64}`,
          revisedPrompt: descText || cleanPrompt,
          descriptionText: descText,
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: 'ImageGeneration',
            category: 'image_generation',
            status: 'success',
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`,
          }),
        };
      }
    } else {
      // OpenAI Compatible Image Generation Protocol (/v1/images/generations)
      const endpoint = buildOpenAiEndpoint(cleanBaseUrl, '/images/generations');

      const sendOpenAiImgReq = async (includeResponseFormat: boolean) => {
        const bodyObj: Record<string, any> = {
          model: resolvedModel,
          prompt: finalPrompt,
          n: 1,
          size: effectiveSize,
        };
        if (quality && resolvedModel.toLowerCase().includes('dall-e-3')) {
          bodyObj.quality = quality;
        }
        if (includeResponseFormat) {
          bodyObj.response_format = 'b64_json';
        }
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(reqTimeout),
        });
      };

      let resp = await sendOpenAiImgReq(true);
      if (!resp.ok && resp.status === 400) {
        const peekErr = await resp.text().catch(() => '');
        if (/response_format|unknown parameter|extra_forbidden|not supported/i.test(peekErr)) {
          // Some OpenAI-compatible gateways (e.g. gpt-image-1 / Flux proxies) reject response_format
          resp = await sendOpenAiImgReq(false);
        } else {
          const safeMsg = sanitizeSensitiveText(peekErr, 220);
          return {
            success: false,
            statusCode: 400,
            errorType: 'upstream_error',
            error: `OpenAI 兼容生图失败 (HTTP 400): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId,
          };
        }
      }

      const latencyMs = Date.now() - startTime;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let msg = errText;
        try {
          const j = JSON.parse(errText);
          msg = j.error?.message || j.message || errText;
        } catch {}
        const safeMsg = sanitizeSensitiveText(msg, 220);
        return {
          success: false,
          statusCode: resp.status,
          errorType:
            resp.status === 401 || resp.status === 403
              ? 'auth_error'
              : resp.status === 429
              ? 'rate_limit'
              : resp.status === 404
              ? 'model_unavailable'
              : 'upstream_error',
          error: `OpenAI 兼容生图失败 (HTTP ${resp.status}): ${safeMsg}`,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          latencyMs,
          requestId: safeRequestId,
        };
      }

      const data: any = await resp.json();
      const item = data?.data?.[0];

      if (item?.b64_json && typeof item.b64_json === 'string' && item.b64_json.length > 32) {
        const mime = item.mime_type || 'image/png';
        return {
          success: true,
          statusCode: resp.status,
          latencyMs,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          mimeType: mime,
          imageUrl: `data:${mime};base64,${item.b64_json}`,
          revisedPrompt: item.revised_prompt || cleanPrompt,
          descriptionText: item.revised_prompt || '',
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: 'ImageGeneration',
            category: 'image_generation',
            status: 'success',
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`,
          }),
        };
      }

      if (item?.url && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
        return {
          success: true,
          statusCode: resp.status,
          latencyMs,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          mimeType: 'image/png',
          imageUrl: item.url,
          revisedPrompt: item.revised_prompt || cleanPrompt,
          descriptionText: item.revised_prompt || '',
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: 'ImageGeneration',
            category: 'image_generation',
            status: 'success',
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`,
          }),
        };
      }

      return {
        success: false,
        statusCode: 502,
        errorType: 'no_image_returned',
        error: '图像接口返回 HTTP 200，但未返回有效的 b64_json 或远程图片 URL。',
        provider: resolvedProvider,
        model: resolvedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId,
      };
    }
  };

  const flightPromise = runGeneration()
    .then((result: any) => {
      if (!result.apiLog && !result.success) {
        result.apiLog = buildApiLogObject({
          appName: source,
          provider: result.provider || resolvedProvider,
          modelName: result.model || resolvedModel,
          interfaceType: 'ImageGeneration',
          category: 'image_generation',
          status: 'failed',
          httpStatus: result.statusCode || 500,
          requestId: safeRequestId,
          durationMs: result.latencyMs || Date.now() - startTime,
          errorType: result.errorType || 'ImageGenerationError',
          error: result.error || '图像生成失败',
          purpose: `${source} 失败`,
        });
      }
      if (result.success) {
        imageGenCompletedCache.set(safeRequestId, {
          expiresAt: Date.now() + IMAGE_IDEMPOTENCY_TTL_MS,
          payload: result,
        });
      }
      return result;
    })
    .finally(() => {
      imageGenInFlightCache.delete(safeRequestId);
    });

  imageGenInFlightCache.set(safeRequestId, flightPromise);

  try {
    const result = await flightPromise;
    return res.status(result.success ? 200 : result.statusCode || 500).json(result);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const safeErr = sanitizeSensitiveText(
      isTimeout ? '图像生成请求超时，请稍后重试或检查反代响应速度。' : err?.message || '图像生成网络异常',
      240
    );
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      statusCode: isTimeout ? 504 : 500,
      errorType: isTimeout ? 'timeout' : 'network_error',
      error: safeErr,
      provider: resolvedProvider,
      model: resolvedModel,
      apiProtocol: effectiveProtocol,
      latencyMs,
      requestId: safeRequestId,
      apiLog: buildApiLogObject({
        appName: source,
        provider: resolvedProvider,
        modelName: resolvedModel,
        interfaceType: 'ImageGeneration',
        category: 'image_generation',
        status: 'failed',
        httpStatus: isTimeout ? 504 : 500,
        requestId: safeRequestId,
        durationMs: latencyMs,
        errorType: isTimeout ? 'timeout' : 'network_error',
        error: safeErr,
        purpose: `${source} 异常`,
      }),
    });
  }
});

// 17. Real Voice / TTS Generation Provider Endpoint
app.post('/api/provider/generate-speech', async (req, res) => {
  const { providerType, baseUrl, apiKey, model = 'tts-1', text, voice = 'alloy', speed = 1.0 } = req.body;
  const cleanKey = (apiKey && apiKey.trim()) || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';
  const startTime = Date.now();

  if (!cleanKey) {
    return res.status(400).json({ success: false, error: '未配置语音 API 密钥 (API Key)' });
  }

  try {
    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = 'https://api.openai.com/v1';
    if (!endpoint.endsWith('/audio/speech')) {
      endpoint = endpoint.endsWith('/v1') ? `${endpoint}/audio/speech` : `${endpoint}/v1/audio/speech`;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ success: false, error: `语音合成失败 (${resp.status}): ${errText}` });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const latencyMs = Date.now() - startTime;

    return res.json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      format: 'mp3',
      apiLog: buildApiLogObject({
        appName: 'AI语音TTS生成',
        modelName: model,
        interfaceType: 'SpeechGeneration',
        category: 'voice',
        durationMs: latencyMs,
        purpose: `合成语音: ${(text || '语音回复').slice(0, 30)}...`,
      }),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '语音合成网络异常' });
  }
});

// 404 handler for API routes - never return HTML for API requests!
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API 端点未找到',
    message: `端点 ${req.method} ${req.originalUrl} 不存在`,
  });
});

function reportEmbeddedBackendDiagnostic(eventName: string, payload: Record<string, any>) {
  try {
    const reporter = (globalThis as any).__XIAOSHOUJI_BACKEND_REPORT__;
    if (typeof reporter === 'function') {
      reporter(eventName, payload);
    }
  } catch {
    // ignore bridge reporting errors
  }
}

// Vite middleware / static serving (skipped in Android embedded API-only mode)
async function startServer() {
  try {
    if (!IS_EMBEDDED_ANDROID) {
      if (process.env.NODE_ENV !== 'production') {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }

    const listenHost = IS_EMBEDDED_ANDROID ? '127.0.0.1' : '0.0.0.0';
    const server = app.listen(PORT, listenHost, () => {
      console.log(
        `📱 Simulated Android AI Phone Server listening on ${listenHost}:${PORT}${
          IS_EMBEDDED_ANDROID ? ' (Android embedded API-only mode)' : ''
        }`
      );
      reportEmbeddedBackendDiagnostic('backend_ready', {
        stage: 'HTTP_LISTENING',
        host: listenHost,
        port: PORT,
        embedded: IS_EMBEDDED_ANDROID,
        message: `HTTP server listening on ${listenHost}:${PORT}`,
      });
    });

    server.on('error', (err: any) => {
      console.error('[Server] HTTP server listen error:', err);
      reportEmbeddedBackendDiagnostic('backend_error', {
        stage: 'HTTP_LISTEN_ERROR',
        fatal: true,
        name: err?.name || 'Error',
        code: err?.code ? String(err.code) : undefined,
        message: err?.message || String(err),
        stack: err?.stack || '',
      });
    });
  } catch (err: any) {
    console.error('[Server] startServer failed:', err);
    reportEmbeddedBackendDiagnostic('backend_error', {
      stage: 'START_SERVER_EXCEPTION',
      fatal: true,
      name: err?.name || 'Error',
      code: err?.code ? String(err.code) : undefined,
      message: err?.message || String(err),
      stack: err?.stack || '',
    });
    throw err;
  }
}

startServer().catch((err: any) => {
  console.error('[Server] Unhandled startServer rejection:', err);
  reportEmbeddedBackendDiagnostic('backend_error', {
    stage: 'START_SERVER_REJECTED',
    fatal: true,
    name: err?.name || 'Error',
    code: err?.code ? String(err.code) : undefined,
    message: err?.message || String(err),
    stack: err?.stack || '',
  });
});
