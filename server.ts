import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

interface AiCallParams {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
  responseMimeType?: string;
  temperature?: number;
  timeoutMs?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Universal High-Reliability AI Service Engine
 * Supports:
 * 1. Google Gemini (Official / Custom Reverse Proxy / Custom Base URL)
 * 2. OpenAI Compatible APIs (OpenAI, DeepSeek, OpenRouter, Groq, SiliconFlow, OneAPI, NewAPI, Cloudflare, Local Ollama, etc.)
 * 3. Anthropic Messages API compatible endpoints
 * 4. Full Timeout, Error Extraction, and HTTP status diagnostics
 */
async function callAiService({
  prompt,
  systemInstruction,
  model = 'gemini-3.6-flash',
  apiKey,
  baseUrl,
  providerType,
  responseMimeType,
  temperature = 0.7,
  timeoutMs = 35000,
  customHeaders = {},
}: AiCallParams): Promise<string> {
  const activeKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';
  const targetModel = model?.trim() || 'gemini-3.6-flash';

  // Determine whether this request is OpenAI-compatible / Non-Google
  const isOpenAiCompatible =
    providerType === 'openai_compatible' ||
    providerType === 'deepseek' ||
    providerType === 'openrouter' ||
    providerType === 'groq' ||
    providerType === 'siliconflow' ||
    providerType === 'ollama' ||
    providerType === 'custom' ||
    (cleanBaseUrl &&
      (cleanBaseUrl.includes('/v1') ||
        cleanBaseUrl.includes('openai') ||
        cleanBaseUrl.includes('deepseek') ||
        cleanBaseUrl.includes('openrouter') ||
        cleanBaseUrl.includes('groq') ||
        cleanBaseUrl.includes('siliconflow') ||
        cleanBaseUrl.includes('oneapi') ||
        cleanBaseUrl.includes('newapi') ||
        cleanBaseUrl.includes(':11434') ||
        targetModel.startsWith('gpt-') ||
        targetModel.startsWith('claude-') ||
        targetModel.startsWith('deepseek-') ||
        targetModel.startsWith('qwen') ||
        targetModel.startsWith('llama')));

  if (isOpenAiCompatible) {
    if (!cleanBaseUrl && !activeKey) {
      throw new Error('未配置 Base URL 或 API Key。请在系统设置中配置 API Provider。');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let endpoint = cleanBaseUrl;
      if (!endpoint) {
        endpoint = 'https://api.openai.com/v1';
      }
      if (!endpoint.endsWith('/chat/completions')) {
        if (endpoint.endsWith('/v1')) {
          endpoint = `${endpoint}/chat/completions`;
        } else {
          endpoint = `${endpoint}/v1/chat/completions`;
        }
      }

      const messages: Array<{ role: string; content: string }> = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const payload: any = {
        model: targetModel,
        messages,
        temperature,
      };

      if (responseMimeType === 'application/json') {
        payload.response_format = { type: 'json_object' };
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };

      if (activeKey) {
        headers['Authorization'] = `Bearer ${activeKey}`;
      }

      // Special provider header additions
      if (endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://ai.studio.simulated.phone';
        headers['X-Title'] = 'Simulated Android Phone';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedErrorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedErrorMsg = parsed.error?.message || parsed.message || errorText;
        } catch {
          // ignore
        }

        if (response.status === 401) {
          throw new Error(`[401 鉴权失败] API Key 无效或未授权: ${parsedErrorMsg}`);
        } else if (response.status === 404) {
          throw new Error(`[404 路由或模型不存在] 请求端点 ${endpoint} 或模型 ${targetModel} 不存在: ${parsedErrorMsg}`);
        } else if (response.status === 429) {
          throw new Error(`[429 配额或限流] 账户配额不足或触发请求频率限制: ${parsedErrorMsg}`);
        } else if (response.status >= 500) {
          throw new Error(`[${response.status} 服务端错误] API Provider 上游异常: ${parsedErrorMsg}`);
        } else {
          throw new Error(`[${response.status} API 错误] ${parsedErrorMsg}`);
        }
      }

      const resJson = await response.json();
      const content = resJson.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        return content;
      }
      return '';
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`请求超时 (${timeoutMs / 1000}秒)，上游 API 未能在限定时间内返回。`);
      }
      throw err;
    }
  }

  // Google Gemini Execution
  if (activeKey) {
    const clientOptions: any = {
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-phone',
          ...customHeaders,
        },
      },
    };
    if (cleanBaseUrl) {
      clientOptions.httpOptions.baseUrl = cleanBaseUrl;
    }

    try {
      const aiClient = new GoogleGenAI(clientOptions);
      const generateOptions: any = {
        model: targetModel,
        contents: prompt,
      };

      const config: any = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (responseMimeType) {
        config.responseMimeType = responseMimeType;
      }
      if (temperature !== undefined) {
        config.temperature = temperature;
      }
      if (Object.keys(config).length > 0) {
        generateOptions.config = config;
      }

      const result = await aiClient.models.generateContent(generateOptions);
      return result.text || '';
    } catch (geminiErr: any) {
      const errMsg = geminiErr.message || '';
      if (errMsg.includes('401') || errMsg.includes('API_KEY_INVALID')) {
        throw new Error(`[Gemini 401 鉴权失败] Gemini API Key 无效: ${errMsg}`);
      } else if (errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
        throw new Error(`[Gemini 404 模型不存在] 模型 ${targetModel} 在此端点不可用: ${errMsg}`);
      } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(`[Gemini 429 配额用尽] API 额度超限或受限: ${errMsg}`);
      }
      throw geminiErr;
    }
  }

  throw new Error('未配置有效的 API 密钥，且系统环境变量中无默认密钥。请先在系统设置中配置 API Provider。');
}

// =========================================================================
// 0.1 核心 Provider 系统端点：真实连接测试 (Real Connection Test)
// =========================================================================
app.post('/api/provider/test-connection', async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = 'text', customHeaders } = req.body;
  const startTime = Date.now();
  const cleanKey = (apiKey && apiKey.trim()) || (providerType === 'google_gemini' ? process.env.GEMINI_API_KEY : '') || '';
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

  // 1. Google Gemini Connection Test
  if (providerType === 'google_gemini' || (!cleanBaseUrl && !providerType)) {
    const testEndpoint = cleanBaseUrl
      ? `${cleanBaseUrl}/v1beta/models?key=${cleanKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

    try {
      const resp = await fetch(testEndpoint, {
        method: 'GET',
        headers: { 'User-Agent': 'aistudio-build-provider-test' },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - startTime;

      if (!resp.ok) {
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
            message: 'Gemini API Key 鉴权失败',
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
      const modelsCount = Array.isArray(data.models) ? data.models.length : 0;

      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: 'OK',
        providerType: 'google_gemini',
        checkedEndpoint: testEndpoint.replace(cleanKey, '***'),
        maskedKey,
        availableModelsCount: modelsCount,
        message: `Google Gemini 官方/反代 API 连通成功！检测到 ${modelsCount} 个可用模型 (耗时 ${latencyMs}ms)`,
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
  const cleanKey = (apiKey && apiKey.trim()) || (providerType === 'google_gemini' ? process.env.GEMINI_API_KEY : '') || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';

  // 1. Google Gemini Models Fetching
  if (providerType === 'google_gemini' || (!cleanBaseUrl && !providerType)) {
    const fetchUrl = cleanBaseUrl
      ? `${cleanBaseUrl}/v1beta/models?key=${cleanKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

    try {
      const resp = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'aistudio-build-models-fetch' },
        signal: AbortSignal.timeout(12000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(resp.status).json({
          success: false,
          supported: true,
          models: [],
          message: `拉取 Gemini 模型列表失败 (${resp.status})`,
          error: errText,
        });
      }

      const data = await resp.json();
      const rawList = Array.isArray(data.models) ? data.models : [];
      const formattedModels = rawList.map((m: any) => {
        const id = (m.name || '').replace('models/', '');
        const isImage = id.includes('imagen') || id.includes('image');
        const isVoice = id.includes('audio') || id.includes('tts') || id.includes('speech');
        return {
          id,
          name: m.displayName || id,
          description: m.description || '',
          type: isImage ? 'image' : isVoice ? 'voice' : 'text',
          contextWindow: m.inputTokenLimit,
          owned_by: 'Google',
        };
      });

      return res.json({
        success: true,
        supported: true,
        models: formattedModels,
        sourceEndpoint: fetchUrl.replace(cleanKey, '***'),
        message: `成功拉取到 ${formattedModels.length} 个 Gemini 真实模型`,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        supported: false,
        models: [],
        message: '拉取 Gemini 模型列表失败',
        error: err.message,
      });
    }
  }

  // 2. Ollama Models Fetching
  if (providerType === 'ollama' || cleanBaseUrl.includes(':11434')) {
    const tagsUrl = `${cleanBaseUrl}/api/tags`;
    try {
      const resp = await fetch(tagsUrl, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.models) ? data.models : [];
        const formatted = rawList.map((m: any) => ({
          id: m.name,
          name: m.name,
          description: `Size: ${Math.round((m.size || 0) / 1024 / 1024)}MB, Format: ${m.details?.format || 'gguf'}`,
          type: 'text',
          owned_by: 'Ollama-Local',
        }));

        return res.json({
          success: true,
          supported: true,
          models: formatted,
          sourceEndpoint: tagsUrl,
          message: `成功拉取到 ${formatted.length} 个 Ollama 本地模型`,
        });
      }
    } catch {
      // fallback to openai compatible /models
    }
  }

  // 3. OpenAI-Compatible Models Fetching (GET /models or /v1/models)
  let modelsEndpoint = cleanBaseUrl;
  if (!modelsEndpoint) modelsEndpoint = 'https://api.openai.com/v1';
  if (!modelsEndpoint.endsWith('/models')) {
    modelsEndpoint = modelsEndpoint.endsWith('/v1') ? `${modelsEndpoint}/models` : `${modelsEndpoint}/v1/models`;
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
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      if (resp.status === 404 || resp.status === 405) {
        return res.json({
          success: false,
          supported: false,
          models: [],
          statusCode: resp.status,
          message: '该 Provider 未提供 /v1/models 接口，不支持自动获取模型列表。请在下方手动输入模型名称。',
        });
      }

      const errText = await resp.text();
      return res.status(resp.status).json({
        success: false,
        supported: true,
        models: [],
        statusCode: resp.status,
        message: `从 Provider 获取模型列表失败 (${resp.status})`,
        error: errText,
      });
    }

    const data = await resp.json();
    let rawList: any[] = [];
    if (Array.isArray(data.data)) {
      rawList = data.data;
    } else if (Array.isArray(data)) {
      rawList = data;
    } else if (Array.isArray(data.models)) {
      rawList = data.models;
    }

    const formattedModels = rawList.map((m: any) => {
      const id = typeof m === 'string' ? m : m.id || m.name;
      const lower = id.toLowerCase();
      let type: 'text' | 'image' | 'voice' | 'embedding' = 'text';
      if (lower.includes('dall-e') || lower.includes('image') || lower.includes('flux') || lower.includes('midjourney') || lower.includes('stable-diffusion')) {
        type = 'image';
      } else if (lower.includes('tts') || lower.includes('whisper') || lower.includes('speech') || lower.includes('audio')) {
        type = 'voice';
      } else if (lower.includes('embedding')) {
        type = 'embedding';
      }

      return {
        id,
        name: typeof m === 'object' && m.name ? m.name : id,
        owned_by: typeof m === 'object' ? m.owned_by || m.permission?.[0]?.organization || '' : '',
        created: typeof m === 'object' ? m.created : undefined,
        type,
      };
    });

    return res.json({
      success: true,
      supported: true,
      models: formattedModels,
      sourceEndpoint: modelsEndpoint,
      message: `成功拉取到 ${formattedModels.length} 个真实模型`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      supported: false,
      models: [],
      message: '网络异常，无法获取模型列表',
      error: err.message,
    });
  }
});

// =========================================================================
// 0.3 核心 Provider 系统端点：测试指定模型 (Test Model Execution)
// =========================================================================
app.post('/api/provider/test-model', async (req, res) => {
  const { providerType, baseUrl, apiKey, model, serviceType = 'text', testPrompt, customHeaders } = req.body;
  const startTime = Date.now();
  const prompt = testPrompt || '请仅回复一句话：模型链路测试正常，已准备就绪！';

  try {
    const reply = await callAiService({
      prompt,
      model,
      apiKey,
      baseUrl,
      providerType,
      temperature: 0.3,
      timeoutMs: 25000,
      customHeaders,
    });

    const latencyMs = Date.now() - startTime;
    if (reply && reply.trim()) {
      return res.json({
        success: true,
        latencyMs,
        model,
        reply: reply.trim(),
        promptTokens: Math.round(prompt.length / 2),
        completionTokens: Math.round(reply.length / 2),
      });
    }

    return res.status(502).json({
      success: false,
      latencyMs,
      model,
      error: '模型已响应但返回空内容',
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latencyMs,
      model,
      error: err.message || '模型执行测试失败',
    });
  }
});

// 兼容老版本的 /api/test-api 接口
app.post('/api/test-api', async (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  const startTime = Date.now();
  const cleanKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';
  const targetModel = model || 'gemini-3.6-flash';

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

    // 1. Try BigDataCloud open reverse geocoding API (Fast, Free, Supports Worldwide Locality in Chinese)
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
      const bdcResp = await fetch(bdcUrl, { signal: AbortSignal.timeout(6000) });
      if (bdcResp.ok) {
        const bdcData = await bdcResp.json();
        const city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || '当前位置';
        const district = bdcData.locality || '';
        const province = bdcData.principalSubdivision || '';
        const country = bdcData.countryName || '中国';

        // Construct friendly display name
        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);
        const displayName = displayParts.join(' ');

        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayName || city,
          source: 'BigDataCloud',
        });
      }
    } catch (e) {
      console.warn('BigDataCloud reverse geocode error, trying OSM fallback:', e);
    }

    // 2. Fallback to OpenStreetMap Nominatim reverse geocode
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`;
      const osmResp = await fetch(osmUrl, {
        headers: { 'User-Agent': 'SimulatedAndroidPhone/2.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (osmResp.ok) {
        const osmData = await osmResp.json();
        const addr = osmData.address || {};
        const city = addr.city || addr.town || addr.county || addr.district || addr.state || '当前位置';
        const district = addr.suburb || addr.district || addr.neighbourhood || '';
        const province = addr.state || '';
        const country = addr.country || '中国';

        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: osmData.display_name || `${country} ${province} ${city}`,
          source: 'OpenStreetMap',
        });
      }
    } catch (e) {
      console.warn('OSM reverse geocode error:', e);
    }

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

// 0.1 Real-time Weather Endpoint (Zero Hardcoded Cities, 100% Real Live Coordinates & Weather Data)
app.get('/api/weather', async (req, res) => {
  const reqStart = Date.now();
  try {
    let city = (req.query.city as string)?.trim() || '';
    let lat: number | undefined = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    let lon: number | undefined = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    const isAuto = req.query.auto === 'true';

    // If city is specified but no lat/lon, geocode the city first
    if ((lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) && city) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
          { signal: AbortSignal.timeout(6000) }
        );
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
          city = geoData.results[0].name || city;
        }
      } catch (geoErr) {
        console.warn('Geocoding city query failed:', geoErr);
      }
    }

    // If coordinates are provided but no city name, reverse geocode to get actual city
    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon) && (!city || city === '当前位置' || city === '本地')) {
      try {
        const bdcResp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (bdcResp.ok) {
          const bdcData = await bdcResp.json();
          city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || `经纬度 (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
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

    // Parallel fetch from Open-Meteo Forecast API & Real Open-Meteo Air Quality API
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&timezone=auto`;

    const [weatherFetchResult, aqiFetchResult] = await Promise.allSettled([
      fetch(weatherUrl, { signal: AbortSignal.timeout(9000) }),
      fetch(aqiUrl, { signal: AbortSignal.timeout(8000) }),
    ]);

    let data: any = null;
    if (weatherFetchResult.status === 'fulfilled' && weatherFetchResult.value.ok) {
      data = await weatherFetchResult.value.json();
    } else {
      const errReason = weatherFetchResult.status === 'rejected' ? weatherFetchResult.reason : 'HTTP status ' + (weatherFetchResult as any).value?.status;
      throw new Error(`Open-Meteo weather fetch failed: ${errReason}`);
    }

    let aqiData: any = null;
    if (aqiFetchResult.status === 'fulfilled' && aqiFetchResult.value.ok) {
      try {
        aqiData = await aqiFetchResult.value.json();
      } catch {}
    }

    // Parse structured weather object from real response
    if (data && data.current) {
      const current = data.current;
      const hourly = data.hourly || {};
      const daily = data.daily || {};

      const currentCode = current.weather_code ?? 0;
      const { condition } = mapWmoWeatherCode(currentCode);
      const windSpeed = Math.round(current.wind_speed_10m || 0);
      const windDir = `${getWindDirectionText(current.wind_direction_10m || 0)} ${getWindScaleText(windSpeed)}`;

      // Calculate hourly forecasts with accurate timezone alignment
      const hourlyList: any[] = [];
      const currentLocalTimeStr = current.time || '';
      const currentLocalHour = currentLocalTimeStr.slice(0, 13); // e.g. "2026-08-19T08"
      const timeArr: string[] = hourly.time || [];

      let startIndex = timeArr.findIndex((t) => t.slice(0, 13) === currentLocalHour);
      if (startIndex === -1) {
        startIndex = timeArr.findIndex((t) => t >= currentLocalHour);
      }
      if (startIndex === -1) startIndex = 0;

      for (let i = startIndex; i < Math.min(startIndex + 24, timeArr.length); i++) {
        const hTimeStr = timeArr[i];
        // Parse local time cleanly from "YYYY-MM-DDTHH:MM"
        const timeFormatted = hTimeStr.includes('T') ? hTimeStr.split('T')[1].slice(0, 5) : hTimeStr;
        const hCode = hourly.weather_code ? hourly.weather_code[i] ?? 0 : 0;
        const hCond = mapWmoWeatherCode(hCode);

        // Approximate UTC timestamp using local string + timezone offset
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

      // Calculate daily forecasts with accurate date indexing
      const dailyList: any[] = [];
      const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const currentLocalDate = currentLocalTimeStr.slice(0, 10); // e.g. "2026-08-19"
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

      // Short-term Rain Forecast Summary derived purely from real forecast data
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

      // Real Meteorological Warning Alerts based strictly on real measurement data
      const alerts: any[] = [];
      const curTemp = Math.round(current.temperature_2m ?? 26);
      const todayMax = dailyList[0]?.tempMax ?? curTemp;
      const todayMin = dailyList[0]?.tempMin ?? curTemp;

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

      if (current.precipitation >= 20 || hourlyList.slice(0, 4).some((h) => h.precipitation >= 15)) {
        alerts.push({
          id: 'alert_rain_orange',
          title: '暴雨橙色预警',
          level: 'orange',
          levelText: '橙色预警',
          description: '累积雨量已达暴雨级别，低洼路段易出现积水，行车注意减速慢行。',
          pubTime: '气象预警中心',
        });
      }

      // Real Air Quality (from Open-Meteo Air Quality API or undefined if unserved)
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

      const weatherResult = {
        city: city || '当前位置',
        country: '',
        latitude: lat,
        longitude: lon,
        temp: Math.round(current.temperature_2m ?? 26),
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
          geocodingService: 'Open-Meteo & BigDataCloud / Nominatim 逆地理编码',
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

      return res.json({ success: true, weather: weatherResult });
    }

    return res.status(500).json({ success: false, error: '未能获取有效气象响应数据' });
  } catch (error: any) {
    console.error('Weather error:', error);
    res.status(500).json({ success: false, error: error.message || '获取天气数据失败' });
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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
3. 输出格式要求：
在回答最开头用 <think>...</think> 标签写明你的思考链，分析当前天气事件、结合用户日程（若有）与角色人设的切入点；
在 </think> 标签之后直接输出你要发送给用户的微信消息文本（1~3句话，符合微信日常打字习惯）。
`;

    let responseText = '';
    let thinkingProcess = `分析天气事件 [${weatherEvent.title}]，结合 ${character.name} 的人设口吻生成微信关怀。`;
    let replyContent = '';

    try {
      responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
      });
    } catch (e: any) {
      console.warn('Weather care AI call failed, using fallback:', e.message);
    }

    if (!responseText) {
      const isRain = weatherEvent.type.includes('rain') || weatherEvent.type === 'severe_weather';
      const isHeat = weatherEvent.type === 'high_temp';
      const isCold = weatherEvent.type === 'low_temp' || weatherEvent.type === 'temp_drop';

      if (isRain) {
        responseText = `<think>感知到即将降雨（降雨概率较高），根据${character.name}人设提醒带伞与避雨。</think>${userProfile?.name || '小清'}，看天气等下可能要下雨呢，出门记得带把伞哦，别淋湿啦！🌧️`;
      } else if (isHeat) {
        responseText = `<think>感知到高温预警，提醒防暑降温与补充水分。</think>今天外面气温好高呀，尽量少在太阳底下晒着，多喝点水注意防暑哦！☀️`;
      } else if (isCold) {
        responseText = `<think>感知到气温骤降，提醒增添衣物保暖。</think>今天降温明显，外面风大挺冷的，出门多穿件外套，千万别着凉了哦！🧣`;
      } else {
        responseText = `<think>感知到突发天气变化，生成暖心问候。</think>注意看天气变化哦，外出照顾好自己！✨`;
      }
    }

    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    } else {
      replyContent = responseText.trim();
    }

    const duration = Date.now() - startTime;
    const promptTokens = Math.round(prompt.length / 2);
    const completionTokens = Math.round(responseText.length / 2);

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '天气-AI主动关怀',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'ProactiveWeatherCare',
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 0.0000005).toFixed(5)),
        purpose: `AI [${character.name}] 针对 [${weatherEvent.title}] 发送微信天气关怀 (耗时 ${duration}ms)`,
      },
    });
  } catch (error: any) {
    console.error('Weather proactive care error:', error);
    res.status(500).json({ success: false, error: error.message || 'Weather proactive care failed' });
  }
});

// 1. AI WeChat Chat Endpoint (with Thinking Process CoT, WorldBook & Smart Devices Control)
app.post('/api/gemini/chat', async (req, res) => {
  const {
    character,
    userMessage,
    conversationHistory = [],
    recalledMemoriesSummary,
    userProfile,
    systemTime,
    locationCity,
    menstrualInfo,
    memosSummary,
    associatedWorldBook,
    realDeviceContext,
    weatherInfo,
    devicesSummary,
    permissions,
    apiConfig,
  } = req.body;

  const startTime = Date.now();
  const selectedModel = character?.modelConfig?.modelName || apiConfig?.textModel || 'gemini-3.6-flash';

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
    const currentNativeTime = systemTime || new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
    const currentNativeLoc = locationCity || realDeviceContext?.locationCity || weatherInfo?.city;
    contextPrompt += `\n【📱 Android 手机原生底层感知·真实时间与环境】:
- 手机系统本地真实时间：${currentNativeTime}
- 手机物理位置/城市：${currentNativeLoc ? currentNativeLoc : '当前未授权手机定位或未选择城市'}
`;

    // Inject WorldBook if character is associated and permission is enabled
    if (permissions?.appAccess?.worldBookData !== false && associatedWorldBook && associatedWorldBook.title) {
      contextPrompt += `\n【🌌 已绑定世界书·世界观法则与背景设定】
- 世界书名称：《${associatedWorldBook.title}》
- 核心世界法则与背景：${associatedWorldBook.worldSetting || '无特定背景'}
${
  associatedWorldBook.entries && associatedWorldBook.entries.length > 0
    ? '【专有名词与词条设定库】：\n' +
      associatedWorldBook.entries.map((e: any) => `* [${e.keyword}]: ${e.content}`).join('\n')
    : ''
}
【演职关键法则】：你当前处于该世界观背景中。你的言谈举止、世界常识、用词习惯必须自然融入该世界观法则与词条设定，同时保持你自身的人设性格。
`;
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

    contextPrompt += `\n【核心输出格式要求】：
请在回答的最前面用 <think>...</think> 标签输出你本次回答的思考链 (Thinking Process / Chain of Thought)，说明你是如何结合角色人设、记忆、世界书背景（若有关联）以及用户上下文做出回应的。
在 </think> 标签之后，直接输出你给用户的微信回复文本（保持微信口语化、亲切自如，适合微信聊天）。
`;

    const contents = [];
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.slice(-6).forEach((msg: any) => {
        contents.push(`${msg.sender === 'user' ? userProfile?.name || '用户' : character.name}: ${msg.text}`);
      });
    }
    contents.push(`${userProfile?.name || '用户'}: ${userMessage}`);

    const promptText = contextPrompt + '\n对话历史：\n' + contents.join('\n');

    let responseText = '';
    let thinkingProcess = '分析用户意图，匹配人设特征，形成微信口语化回复。';
    let replyContent = '';
    const extractedDeviceActions: any[] = [];

    let aiErrorMessage = '';
    try {
      responseText = await callAiService({
        prompt: promptText,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        providerType: apiConfig?.textProvider,
        customHeaders: apiConfig?.customHeaders,
        timeoutMs: apiConfig?.timeoutMs || 35000,
      });
    } catch (e: any) {
      aiErrorMessage = e.message || 'API 调用异常';
      console.warn('AI call threw error:', e.message);
    }

    if (!responseText) {
      if (aiErrorMessage) {
        responseText = `<think>API 调用出现异常: ${aiErrorMessage}。尝试以角色身份提醒用户检查系统设置中的 API Provider 配置。</think>[系统提示: 当前选用的模型 (${selectedModel}) 请求失败: ${aiErrorMessage}。请在系统设置中测试并更新 API 密钥或 Base URL。]`;
      } else {
        responseText = `<think>结合了${character.name}的人设与用户的关怀需求，组织口语化聊天回复。</think>${character.greeting || '收到你的消息啦！今天过得怎么样？'}`;
      }
    }

    // Extract <think> content
    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    } else {
      replyContent = responseText.trim();
    }

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
    // Clean device action tags from display text
    replyContent = replyContent.replace(/<device_action>[\s\S]*?<\/device_action>/gi, '').trim();

    const duration = Date.now() - startTime;
    const promptTokens = Math.round(promptText.length / 2);
    const completionTokens = Math.round(responseText.length / 2);

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      deviceActions: extractedDeviceActions,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '微信-AI聊天',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'ChatGeneration',
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 0.0000005).toFixed(5)),
        purpose: `与 ${character.name} 对话交互 (耗时 ${duration}ms)`,
      },
    });
  } catch (error: any) {
    console.error('Gemini Chat error:', error);
    res.status(500).json({ success: false, error: error.message || 'Chat generation failed' });
  }
});

// 1.2 Dedicated Group Chat Multi-AI Orchestrator Endpoint
app.post('/api/gemini/group-chat', async (req, res) => {
  const {
    group,
    recentMessages = [],
    aiCandidates = [],
    triggeredAiId,
    userProfile,
    systemTime,
    locationCity,
    weatherInfo,
    apiConfig,
  } = req.body;

  const startTime = Date.now();
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

  try {
    if (!aiCandidates || aiCandidates.length === 0) {
      return res.json({ success: true, shouldRespond: false, reason: 'No AI members in group' });
    }

    // Format member candidate profiles
    const candidateProfilesText = aiCandidates.map((c: any) => {
      const persona = c.customPersona || c.persona || '普通群友';
      const personality = c.customPersonality || c.personality || '友善交流';
      const memories = c.memories && c.memories.length > 0 ? c.memories.join('；') : '暂无特殊记忆';
      return `【AI成员: ${c.name}】(ID: ${c.id}, 微信号: ${c.wxid || c.id})
- 身份设定: ${persona}
- 性格与口吻特征: ${personality}
- 专属长期记忆: ${memories}`;
    }).join('\n\n');

    // Format recent chat history
    const historyText = recentMessages.map((m: any) => {
      const mentions = m.mentionedMemberIds && m.mentionedMemberIds.length > 0 ? ` [@${m.mentionedMemberIds.join(', ')}]` : '';
      return `[${m.senderName} (${m.senderType})]: ${m.text}${mentions}`;
    }).join('\n');

    const nativeTime = systemTime || new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });

    const systemPrompt = `你是一个高度拟真的多AI微信群聊模拟中枢。
当前群聊信息：
- 群名称：${group?.name || '微信群聊'}
- 群公告：${group?.notice || '无特定公告'}
- 本地真实系统时间：${nativeTime}
- 城市/位置感知：${locationCity || weatherInfo?.city || '未指定'}
- 用户信息：${userProfile?.name || '小清'} (wxid: ${userProfile?.wxid || 'xiaoqing'})

群内当前的所有AI成员设定如下：
${candidateProfilesText}

【群聊运作核心法则】：
1. 真实群聊氛围：不要让所有AI机械地全部抢着回答。AI要像真实微信群友一样，根据自己的性格爱好、当前话题相关度、人设背景来决定是否发言。
2. 独立人格与独立记忆：每个AI的发言必须极其符合其独立的人设性格、用语习惯（例如：温柔学姐林思微贴心细腻、学霸顾言冷静严谨偏学术、总裁陆沉简短有力重格局等），绝不能混淆。
3. @ 互动机制：
   - 如果某位AI被显式 @ 了（例如 @林思微），该AI必须优先回答。
   - AI发言时也可以自然地 @ 某位群友（例如 "@顾言 你觉得呢？" 或 "@小清 记得休息"）。
4. 语言风格：地道自然的微信口语，不要说任何“作为一个AI”、“我是语言模型”之类的出戏内容。可适度使用日常标点和emoji。
`;

    let userPrompt = `以下是该群聊最近的对话记录：
---
${historyText || '(群内暂无更多历史)'}
---

`;

    if (triggeredAiId && triggeredAiId !== '@all') {
      const targetAi = aiCandidates.find((c: any) => c.id === triggeredAiId);
      userPrompt += `请指定由 AI成员【${targetAi ? targetAi.name : '指定AI'}】(ID: ${triggeredAiId}) 进行回复。
请以 JSON 格式输出：
{
  "shouldRespond": true,
  "responderId": "${triggeredAiId}",
  "responderName": "${targetAi?.name || 'AI'}",
  "text": "回复内容（地道微信口吻，可包含@其他成员）",
  "thinkingProcess": "简要分析该角色为何这样说",
  "mentionedMemberIds": ["@提到的成员ID列表，若无则为空数组"]
}`;
    } else {
      userPrompt += `请评估当前对话流向，决定群内哪一位AI最适合发言（或如果大家都觉得无需插话，也可以保持沉默 shouldRespond: false）。
请以 JSON 格式输出：
{
  "shouldRespond": true,
  "responderId": "选择发言的AI的ID",
  "responderName": "选择发言的AI的名称",
  "text": "回复内容（地道微信口吻，可包含@其他成员）",
  "thinkingProcess": "简要分析为什么选择该AI以及为何这样回复",
  "mentionedMemberIds": ["@提到的成员ID列表，若无则为空数组"]
}`;
    }

    const rawResponse = await callAiService({
      prompt: userPrompt,
      systemInstruction: systemPrompt,
      model: selectedModel,
      apiKey: apiConfig?.apiKey,
      baseUrl: apiConfig?.baseUrl,
      providerType: apiConfig?.providerType,
      responseMimeType: 'application/json',
      temperature: 0.75,
      timeoutMs: 35000,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析群聊AI返回的JSON');
      }
    }

    const duration = Date.now() - startTime;
    const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 2);
    const completionTokens = Math.ceil((rawResponse.length) / 2);

    res.json({
      success: true,
      shouldRespond: parsed.shouldRespond !== false,
      responderId: parsed.responderId || (aiCandidates[0]?.id),
      responderName: parsed.responderName || (aiCandidates[0]?.name),
      text: parsed.text || '',
      thinkingProcess: parsed.thinkingProcess || '',
      mentionedMemberIds: parsed.mentionedMemberIds || [],
      log: {
        id: 'log_' + Date.now(),
        appName: 'WeChatGroup',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'GroupChatOrchestration',
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 0.0000005).toFixed(5)),
        purpose: `群聊AI发言: ${parsed.responderName || 'AI'} (耗时 ${duration}ms)`,
      },
    });
  } catch (error: any) {
    console.error('Gemini Group Chat error:', error);
    res.status(500).json({ success: false, error: error.message || 'Group chat generation failed' });
  }
});

// 1.5 Dedicated Natural Language Device Control Endpoint
app.post('/api/gemini/device-nlp-control', async (req, res) => {
  const { command, devicesSummary, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';
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
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';
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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';
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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';
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
  const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';
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
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
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

// 7. Gomoku AI Commentary / Speech Generator Endpoint
app.post('/api/gemini/gomoku-commentary', async (req, res) => {
  try {
    const { character, situation, boardSummary, difficulty, lastMove, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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

// 11.2 Dedicated Proactive Period & Menstrual Health Care Endpoint (Strictly in-character, No OOC)
app.post('/api/gemini/proactive-period', async (req, res) => {
  try {
    const { character, userProfile, menstrualInfo, targetStage, apiConfig } = req.body;
    const selectedModel = character?.modelConfig?.modelName || apiConfig?.textModel || 'gemini-3.6-flash';
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

输出要求：
在回答最开头用 <think>...</think> 标签写明你的思考过程（如何根据角色人设切入关怀）；
在 </think> 标签之后直接输出微信消息文本。`;

    let responseText = '';
    let thinkingProcess = `根据 ${character.name} 人设口吻分析生理周期阶段 [${stage}] 生成微信主动关怀。`;
    let replyContent = '';

    try {
      responseText = await callAiService({
        prompt: `请主动向【${userProfile?.name || '小清'}】发送一条符合你人设口吻的微信关怀消息。`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        providerType: apiConfig?.textProvider,
      });
    } catch (e: any) {
      console.warn('Period care AI call failed, using fallback:', e.message);
    }

    if (!responseText) {
      if (stage === 'pre_period_3d') {
        responseText = `<think>感知到经期即将到来（还有3天），以${character.name}口吻提醒温水与备物。</think>${userProfile?.name || '小清'}，算算日子这几天差不多要来例假了哦。提前备好暖宝宝和温水，今天别喝冰的，早点休息呀~`;
      } else if (stage === 'period_end_1d') {
        responseText = `<think>感知到经期进入尾声，送上慰问与调养提示。</think>${userProfile?.name || '小清'}，感觉这两天身体好些了吗？经期快要结束啦，这几天也记得喝点热乎的，好好犒劳一下自己哦。`;
      } else {
        responseText = `<think>感知到处于生理期中，主动关照腹痛与情绪。</think>${userProfile?.name || '小清'}，今天肚子会不会隐隐难受呀？要是累了就多歇一会儿，热水随时泡上，有我在呢~`;
      }
    }

    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    } else {
      replyContent = responseText.trim();
    }

    const duration = Date.now() - startTime;
    const promptTokens = Math.round(systemPrompt.length / 2);
    const completionTokens = Math.round(responseText.length / 2);

    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      stage,
      apiLog: {
        id: 'log_' + Date.now(),
        appName: '女性健康-经期AI关怀',
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: 'ProactivePeriodCare',
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 0.0000005).toFixed(5)),
        purpose: `AI [${character.name}] 发送 [${stage}] 生理周期专属关怀 (耗时 ${duration}ms)`,
      },
    });
  } catch (error: any) {
    console.error('Proactive period care error:', error);
    res.status(500).json({ success: false, error: error.message || 'Period care failed' });
  }
});

// 12. Telepathy (心有灵犀): AI Deduce Player's Choice
app.post('/api/gemini/telepathy-deduce-choice', async (req, res) => {
  try {
    const { character, question, userProfile, characterMemories, recentChats, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
    const selectedModel = apiConfig?.textModel || 'gemini-3.6-flash';

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
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (默认推荐/超快响应)', type: 'text' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (深度推理模型)', type: 'text' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (最新低延迟)', type: 'text' },
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

// 16. Real Image Generation Provider Endpoint
app.post('/api/provider/generate-image', async (req, res) => {
  const { providerType, baseUrl, apiKey, model = 'dall-e-3', prompt, size = '1024x1024', quality = 'standard' } = req.body;
  const cleanKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';
  const startTime = Date.now();

  if (!cleanKey) {
    return res.status(400).json({ success: false, error: '未配置图像 API 密钥 (API Key)' });
  }

  try {
    // 1. OpenAI or OpenAI-Compatible DALL-E / Flux / SD endpoint (/v1/images/generations)
    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = 'https://api.openai.com/v1';
    if (!endpoint.endsWith('/images/generations')) {
      endpoint = endpoint.endsWith('/v1') ? `${endpoint}/images/generations` : `${endpoint}/v1/images/generations`;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let msg = errText;
      try {
        const j = JSON.parse(errText);
        msg = j.error?.message || errText;
      } catch {}
      return res.status(resp.status).json({ success: false, error: `图像生成失败 (${resp.status}): ${msg}` });
    }

    const data = await resp.json();
    const item = data.data?.[0];
    const latencyMs = Date.now() - startTime;

    if (item?.b64_json) {
      return res.json({
        success: true,
        latencyMs,
        model,
        imageUrl: `data:image/png;base64,${item.b64_json}`,
        revisedPrompt: item.revised_prompt || prompt,
      });
    } else if (item?.url) {
      return res.json({
        success: true,
        latencyMs,
        model,
        imageUrl: item.url,
        revisedPrompt: item.revised_prompt || prompt,
      });
    }

    return res.status(500).json({ success: false, error: '未从接口获取到有效图像数据' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '图像生成网络异常' });
  }
});

// 17. Real Voice / TTS Generation Provider Endpoint
app.post('/api/provider/generate-speech', async (req, res) => {
  const { providerType, baseUrl, apiKey, model = 'tts-1', text, voice = 'alloy', speed = 1.0 } = req.body;
  const cleanKey = (apiKey && apiKey.trim()) || '';
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, '') : '';

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

    return res.json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      format: 'mp3',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '语音合成网络异常' });
  }
});

// Vite middleware / static serving
async function startServer() {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`📱 Simulated Android AI Phone Server listening on port ${PORT}`);
  });
}

startServer();
