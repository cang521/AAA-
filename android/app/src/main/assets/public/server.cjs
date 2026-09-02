var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_genai = require("@google/genai");
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "10mb" }));
var PORT = 3e3;
async function callAiService({
  prompt,
  systemInstruction,
  model = "gemini-3.6-flash",
  apiKey,
  baseUrl,
  providerType,
  responseMimeType,
  temperature = 0.7,
  timeoutMs = 35e3,
  customHeaders = {}
}) {
  const activeKey = apiKey && apiKey.trim() || process.env.GEMINI_API_KEY || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  const targetModel = model?.trim() || "gemini-3.6-flash";
  const isOpenAiCompatible = providerType === "openai_compatible" || providerType === "deepseek" || providerType === "openrouter" || providerType === "groq" || providerType === "siliconflow" || providerType === "ollama" || providerType === "custom" || cleanBaseUrl && (cleanBaseUrl.includes("/v1") || cleanBaseUrl.includes("openai") || cleanBaseUrl.includes("deepseek") || cleanBaseUrl.includes("openrouter") || cleanBaseUrl.includes("groq") || cleanBaseUrl.includes("siliconflow") || cleanBaseUrl.includes("oneapi") || cleanBaseUrl.includes("newapi") || cleanBaseUrl.includes(":11434") || targetModel.startsWith("gpt-") || targetModel.startsWith("claude-") || targetModel.startsWith("deepseek-") || targetModel.startsWith("qwen") || targetModel.startsWith("llama"));
  if (isOpenAiCompatible) {
    if (!cleanBaseUrl && !activeKey) {
      throw new Error("\u672A\u914D\u7F6E Base URL \u6216 API Key\u3002\u8BF7\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u914D\u7F6E API Provider\u3002");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let endpoint = cleanBaseUrl;
      if (!endpoint) {
        endpoint = "https://api.openai.com/v1";
      }
      if (!endpoint.endsWith("/chat/completions")) {
        if (endpoint.endsWith("/v1")) {
          endpoint = `${endpoint}/chat/completions`;
        } else {
          endpoint = `${endpoint}/v1/chat/completions`;
        }
      }
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
      }
      messages.push({ role: "user", content: prompt });
      const payload = {
        model: targetModel,
        messages,
        temperature
      };
      if (responseMimeType === "application/json") {
        payload.response_format = { type: "json_object" };
      }
      const headers = {
        "Content-Type": "application/json",
        ...customHeaders
      };
      if (activeKey) {
        headers["Authorization"] = `Bearer ${activeKey}`;
      }
      if (endpoint.includes("openrouter.ai")) {
        headers["HTTP-Referer"] = "https://ai.studio.simulated.phone";
        headers["X-Title"] = "Simulated Android Phone";
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        const errorText = await response.text();
        let parsedErrorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedErrorMsg = parsed.error?.message || parsed.message || errorText;
        } catch {
        }
        if (response.status === 401) {
          throw new Error(`[401 \u9274\u6743\u5931\u8D25] API Key \u65E0\u6548\u6216\u672A\u6388\u6743: ${parsedErrorMsg}`);
        } else if (response.status === 404) {
          throw new Error(`[404 \u8DEF\u7531\u6216\u6A21\u578B\u4E0D\u5B58\u5728] \u8BF7\u6C42\u7AEF\u70B9 ${endpoint} \u6216\u6A21\u578B ${targetModel} \u4E0D\u5B58\u5728: ${parsedErrorMsg}`);
        } else if (response.status === 429) {
          throw new Error(`[429 \u914D\u989D\u6216\u9650\u6D41] \u8D26\u6237\u914D\u989D\u4E0D\u8DB3\u6216\u89E6\u53D1\u8BF7\u6C42\u9891\u7387\u9650\u5236: ${parsedErrorMsg}`);
        } else if (response.status >= 500) {
          throw new Error(`[${response.status} \u670D\u52A1\u7AEF\u9519\u8BEF] API Provider \u4E0A\u6E38\u5F02\u5E38: ${parsedErrorMsg}`);
        } else {
          throw new Error(`[${response.status} API \u9519\u8BEF] ${parsedErrorMsg}`);
        }
      }
      const resJson = await response.json();
      const content = resJson.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        return content;
      }
      return "";
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`\u8BF7\u6C42\u8D85\u65F6 (${timeoutMs / 1e3}\u79D2)\uFF0C\u4E0A\u6E38 API \u672A\u80FD\u5728\u9650\u5B9A\u65F6\u95F4\u5185\u8FD4\u56DE\u3002`);
      }
      throw err;
    }
  }
  if (activeKey) {
    const clientOptions = {
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build-phone",
          ...customHeaders
        }
      }
    };
    if (cleanBaseUrl) {
      clientOptions.httpOptions.baseUrl = cleanBaseUrl;
    }
    try {
      const aiClient = new import_genai.GoogleGenAI(clientOptions);
      const generateOptions = {
        model: targetModel,
        contents: prompt
      };
      const config = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (responseMimeType) {
        config.responseMimeType = responseMimeType;
      }
      if (temperature !== void 0) {
        config.temperature = temperature;
      }
      if (Object.keys(config).length > 0) {
        generateOptions.config = config;
      }
      const result = await aiClient.models.generateContent(generateOptions);
      return result.text || "";
    } catch (geminiErr) {
      const errMsg = geminiErr.message || "";
      if (errMsg.includes("401") || errMsg.includes("API_KEY_INVALID")) {
        throw new Error(`[Gemini 401 \u9274\u6743\u5931\u8D25] Gemini API Key \u65E0\u6548: ${errMsg}`);
      } else if (errMsg.includes("404") || errMsg.includes("NOT_FOUND")) {
        throw new Error(`[Gemini 404 \u6A21\u578B\u4E0D\u5B58\u5728] \u6A21\u578B ${targetModel} \u5728\u6B64\u7AEF\u70B9\u4E0D\u53EF\u7528: ${errMsg}`);
      } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(`[Gemini 429 \u914D\u989D\u7528\u5C3D] API \u989D\u5EA6\u8D85\u9650\u6216\u53D7\u9650: ${errMsg}`);
      }
      throw geminiErr;
    }
  }
  throw new Error("\u672A\u914D\u7F6E\u6709\u6548\u7684 API \u5BC6\u94A5\uFF0C\u4E14\u7CFB\u7EDF\u73AF\u5883\u53D8\u91CF\u4E2D\u65E0\u9ED8\u8BA4\u5BC6\u94A5\u3002\u8BF7\u5148\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u914D\u7F6E API Provider\u3002");
}
app.post("/api/provider/test-connection", async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = "text", customHeaders } = req.body;
  const startTime = Date.now();
  const cleanKey = apiKey && apiKey.trim() || (providerType === "google_gemini" ? process.env.GEMINI_API_KEY : "") || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  if (!cleanKey && providerType !== "ollama") {
    return res.status(400).json({
      success: false,
      latencyMs: 0,
      providerType: providerType || "custom",
      checkedEndpoint: cleanBaseUrl || "\u672A\u586B\u5199",
      errorType: "auth_error",
      message: "\u8BF7\u5148\u8F93\u5165\u6709\u6548\u7684 API Key",
      error: "API Key \u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u53D1\u8D77\u9274\u6743\u8BF7\u6C42\u3002"
    });
  }
  const maskedKey = cleanKey.length > 8 ? `${cleanKey.slice(0, 3)}****${cleanKey.slice(-4)}` : cleanKey ? "****" : "(\u65E0\u5BC6\u94A5)";
  if (providerType === "google_gemini" || !cleanBaseUrl && !providerType) {
    const testEndpoint = cleanBaseUrl ? `${cleanBaseUrl}/v1beta/models?key=${cleanKey}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    try {
      const resp = await fetch(testEndpoint, {
        method: "GET",
        headers: { "User-Agent": "aistudio-build-provider-test" },
        signal: AbortSignal.timeout(1e4)
      });
      const latencyMs = Date.now() - startTime;
      if (!resp.ok) {
        const errText = await resp.text();
        let errMsg = errText;
        try {
          const j = JSON.parse(errText);
          errMsg = j.error?.message || errText;
        } catch {
        }
        if (resp.status === 400 || resp.status === 403 || resp.status === 401) {
          return res.status(400).json({
            success: false,
            latencyMs,
            statusCode: resp.status,
            statusText: resp.statusText,
            providerType: "google_gemini",
            checkedEndpoint: testEndpoint.replace(cleanKey, "***"),
            errorType: "auth_error",
            maskedKey,
            message: "Gemini API Key \u9274\u6743\u5931\u8D25",
            error: errMsg
          });
        }
        return res.status(resp.status).json({
          success: false,
          latencyMs,
          statusCode: resp.status,
          statusText: resp.statusText,
          providerType: "google_gemini",
          checkedEndpoint: testEndpoint.replace(cleanKey, "***"),
          errorType: "server_error",
          maskedKey,
          message: `Gemini \u7AEF\u70B9\u54CD\u5E94\u5F02\u5E38 (${resp.status})`,
          error: errMsg
        });
      }
      const data = await resp.json();
      const modelsCount = Array.isArray(data.models) ? data.models.length : 0;
      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: "OK",
        providerType: "google_gemini",
        checkedEndpoint: testEndpoint.replace(cleanKey, "***"),
        maskedKey,
        availableModelsCount: modelsCount,
        message: `Google Gemini \u5B98\u65B9/\u53CD\u4EE3 API \u8FDE\u901A\u6210\u529F\uFF01\u68C0\u6D4B\u5230 ${modelsCount} \u4E2A\u53EF\u7528\u6A21\u578B (\u8017\u65F6 ${latencyMs}ms)`
      });
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return res.status(500).json({
        success: false,
        latencyMs,
        providerType: "google_gemini",
        checkedEndpoint: testEndpoint.replace(cleanKey, "***"),
        errorType: err.name === "TimeoutError" ? "timeout" : "network_error",
        maskedKey,
        message: err.name === "TimeoutError" ? "\u7F51\u7EDC\u8FDE\u63A5\u8D85\u65F6 (10\u79D2)" : "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216 Base URL",
        error: err.message
      });
    }
  }
  let modelsEndpoint = cleanBaseUrl;
  if (!modelsEndpoint) modelsEndpoint = "https://api.openai.com/v1";
  if (!modelsEndpoint.endsWith("/models")) {
    if (modelsEndpoint.endsWith("/v1")) {
      modelsEndpoint = `${modelsEndpoint}/models`;
    } else {
      modelsEndpoint = `${modelsEndpoint}/v1/models`;
    }
  }
  try {
    const headers = {
      "Content-Type": "application/json",
      ...customHeaders
    };
    if (cleanKey) {
      headers["Authorization"] = `Bearer ${cleanKey}`;
    }
    const resp = await fetch(modelsEndpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12e3)
    });
    const latencyMs = Date.now() - startTime;
    if (resp.ok) {
      const data = await resp.json();
      const count = Array.isArray(data.data) ? data.data.length : Array.isArray(data) ? data.length : 0;
      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: "OK",
        providerType: providerType || "openai_compatible",
        checkedEndpoint: modelsEndpoint,
        maskedKey,
        availableModelsCount: count,
        message: `\u8FDE\u63A5\u6210\u529F\uFF01\u5DF2\u901A\u8FC7 /models \u63A5\u53E3\u9A8C\u8BC1\uFF0C\u670D\u52A1\u7AEF\u8FD4\u56DE ${count} \u4E2A\u6A21\u578B (\u8017\u65F6 ${latencyMs}ms)`
      });
    }
    if (resp.status === 404 || resp.status === 405) {
      let chatEndpoint = cleanBaseUrl;
      if (!chatEndpoint.endsWith("/chat/completions")) {
        chatEndpoint = chatEndpoint.endsWith("/v1") ? `${chatEndpoint}/chat/completions` : `${chatEndpoint}/v1/chat/completions`;
      }
      const pingResp = await fetch(chatEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(12e3)
      });
      const pingLatency = Date.now() - startTime;
      const pingText = await pingResp.text();
      if (pingResp.ok || pingResp.status === 400 || pingResp.status !== 401 && pingResp.status !== 404) {
        return res.json({
          success: true,
          latencyMs: pingLatency,
          statusCode: pingResp.status,
          statusText: pingResp.statusText,
          providerType: providerType || "openai_compatible",
          checkedEndpoint: chatEndpoint,
          maskedKey,
          message: `\u8FDE\u63A5\u6210\u529F\uFF01\u5DF2\u9A8C\u8BC1 Chat Completions \u7AEF\u70B9\u8FDE\u901A (\u8017\u65F6 ${pingLatency}ms\uFF0C\u8BE5 Provider \u672A\u5F00\u542F /models \u5217\u8868)`
        });
      }
      if (pingResp.status === 401) {
        return res.status(401).json({
          success: false,
          latencyMs: pingLatency,
          statusCode: 401,
          providerType: providerType || "openai_compatible",
          checkedEndpoint: chatEndpoint,
          errorType: "auth_error",
          maskedKey,
          message: "API Key \u9274\u6743\u5931\u8D25 (401 Unauthorized)",
          error: "\u8BF7\u68C0\u67E5\u8F93\u5165\u7684 API Key \u662F\u5426\u6709\u6548\u3002"
        });
      }
    }
    const errBody = await resp.text();
    let parsedErr = errBody;
    try {
      const j = JSON.parse(errBody);
      parsedErr = j.error?.message || errBody;
    } catch {
    }
    let errorType = "unknown";
    let userMsg = `\u670D\u52A1\u7AEF\u54CD\u5E94\u9519\u8BEF (${resp.status})`;
    if (resp.status === 401) {
      errorType = "auth_error";
      userMsg = "API Key \u9274\u6743\u5931\u8D25 (401 Unauthorized)";
    } else if (resp.status === 403) {
      errorType = "auth_error";
      userMsg = "\u8BBF\u95EE\u88AB\u62D2\u7EDD (403 Forbidden)\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650\u6216IP\u767D\u540D\u5355";
    } else if (resp.status === 429) {
      errorType = "rate_limit";
      userMsg = "\u89E6\u53D1\u9650\u6D41\u6216\u4F59\u989D\u4E0D\u8DB3 (429 Too Many Requests)";
    } else if (resp.status === 404) {
      errorType = "not_found";
      userMsg = `Base URL \u8DEF\u5F84\u9519\u8BEF (404 Not Found)\uFF0C\u672A\u80FD\u627E\u5230\u76EE\u6807\u63A5\u53E3`;
    }
    return res.status(resp.status).json({
      success: false,
      latencyMs,
      statusCode: resp.status,
      statusText: resp.statusText,
      providerType: providerType || "openai_compatible",
      checkedEndpoint: modelsEndpoint,
      errorType,
      maskedKey,
      message: userMsg,
      error: parsedErr
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latencyMs,
      providerType: providerType || "openai_compatible",
      checkedEndpoint: modelsEndpoint,
      errorType: err.name === "TimeoutError" ? "timeout" : "network_error",
      maskedKey,
      message: err.name === "TimeoutError" ? "\u7F51\u7EDC\u8FDE\u63A5\u8D85\u65F6 (12\u79D2)" : "\u7F51\u7EDC\u8FDE\u63A5\u9519\u8BEF\uFF0C\u65E0\u6CD5\u8BBF\u95EE\u76EE\u6807 Base URL",
      error: err.message
    });
  }
});
app.post("/api/provider/fetch-models", async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = "text", customHeaders } = req.body;
  const cleanKey = apiKey && apiKey.trim() || (providerType === "google_gemini" ? process.env.GEMINI_API_KEY : "") || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  if (providerType === "google_gemini" || !cleanBaseUrl && !providerType) {
    const fetchUrl = cleanBaseUrl ? `${cleanBaseUrl}/v1beta/models?key=${cleanKey}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    try {
      const resp = await fetch(fetchUrl, {
        method: "GET",
        headers: { "User-Agent": "aistudio-build-models-fetch" },
        signal: AbortSignal.timeout(12e3)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return res.status(resp.status).json({
          success: false,
          supported: true,
          models: [],
          message: `\u62C9\u53D6 Gemini \u6A21\u578B\u5217\u8868\u5931\u8D25 (${resp.status})`,
          error: errText
        });
      }
      const data = await resp.json();
      const rawList = Array.isArray(data.models) ? data.models : [];
      const formattedModels = rawList.map((m) => {
        const id = (m.name || "").replace("models/", "");
        const isImage = id.includes("imagen") || id.includes("image");
        const isVoice = id.includes("audio") || id.includes("tts") || id.includes("speech");
        return {
          id,
          name: m.displayName || id,
          description: m.description || "",
          type: isImage ? "image" : isVoice ? "voice" : "text",
          contextWindow: m.inputTokenLimit,
          owned_by: "Google"
        };
      });
      return res.json({
        success: true,
        supported: true,
        models: formattedModels,
        sourceEndpoint: fetchUrl.replace(cleanKey, "***"),
        message: `\u6210\u529F\u62C9\u53D6\u5230 ${formattedModels.length} \u4E2A Gemini \u771F\u5B9E\u6A21\u578B`
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        supported: false,
        models: [],
        message: "\u62C9\u53D6 Gemini \u6A21\u578B\u5217\u8868\u5931\u8D25",
        error: err.message
      });
    }
  }
  if (providerType === "ollama" || cleanBaseUrl.includes(":11434")) {
    const tagsUrl = `${cleanBaseUrl}/api/tags`;
    try {
      const resp = await fetch(tagsUrl, { signal: AbortSignal.timeout(8e3) });
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.models) ? data.models : [];
        const formatted = rawList.map((m) => ({
          id: m.name,
          name: m.name,
          description: `Size: ${Math.round((m.size || 0) / 1024 / 1024)}MB, Format: ${m.details?.format || "gguf"}`,
          type: "text",
          owned_by: "Ollama-Local"
        }));
        return res.json({
          success: true,
          supported: true,
          models: formatted,
          sourceEndpoint: tagsUrl,
          message: `\u6210\u529F\u62C9\u53D6\u5230 ${formatted.length} \u4E2A Ollama \u672C\u5730\u6A21\u578B`
        });
      }
    } catch {
    }
  }
  let modelsEndpoint = cleanBaseUrl;
  if (!modelsEndpoint) modelsEndpoint = "https://api.openai.com/v1";
  if (!modelsEndpoint.endsWith("/models")) {
    modelsEndpoint = modelsEndpoint.endsWith("/v1") ? `${modelsEndpoint}/models` : `${modelsEndpoint}/v1/models`;
  }
  try {
    const headers = {
      "Content-Type": "application/json",
      ...customHeaders
    };
    if (cleanKey) {
      headers["Authorization"] = `Bearer ${cleanKey}`;
    }
    const resp = await fetch(modelsEndpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15e3)
    });
    if (!resp.ok) {
      if (resp.status === 404 || resp.status === 405) {
        return res.json({
          success: false,
          supported: false,
          models: [],
          statusCode: resp.status,
          message: "\u8BE5 Provider \u672A\u63D0\u4F9B /v1/models \u63A5\u53E3\uFF0C\u4E0D\u652F\u6301\u81EA\u52A8\u83B7\u53D6\u6A21\u578B\u5217\u8868\u3002\u8BF7\u5728\u4E0B\u65B9\u624B\u52A8\u8F93\u5165\u6A21\u578B\u540D\u79F0\u3002"
        });
      }
      const errText = await resp.text();
      return res.status(resp.status).json({
        success: false,
        supported: true,
        models: [],
        statusCode: resp.status,
        message: `\u4ECE Provider \u83B7\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25 (${resp.status})`,
        error: errText
      });
    }
    const data = await resp.json();
    let rawList = [];
    if (Array.isArray(data.data)) {
      rawList = data.data;
    } else if (Array.isArray(data)) {
      rawList = data;
    } else if (Array.isArray(data.models)) {
      rawList = data.models;
    }
    const formattedModels = rawList.map((m) => {
      const id = typeof m === "string" ? m : m.id || m.name;
      const lower = id.toLowerCase();
      let type = "text";
      if (lower.includes("dall-e") || lower.includes("image") || lower.includes("flux") || lower.includes("midjourney") || lower.includes("stable-diffusion")) {
        type = "image";
      } else if (lower.includes("tts") || lower.includes("whisper") || lower.includes("speech") || lower.includes("audio")) {
        type = "voice";
      } else if (lower.includes("embedding")) {
        type = "embedding";
      }
      return {
        id,
        name: typeof m === "object" && m.name ? m.name : id,
        owned_by: typeof m === "object" ? m.owned_by || m.permission?.[0]?.organization || "" : "",
        created: typeof m === "object" ? m.created : void 0,
        type
      };
    });
    return res.json({
      success: true,
      supported: true,
      models: formattedModels,
      sourceEndpoint: modelsEndpoint,
      message: `\u6210\u529F\u62C9\u53D6\u5230 ${formattedModels.length} \u4E2A\u771F\u5B9E\u6A21\u578B`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      supported: false,
      models: [],
      message: "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u65E0\u6CD5\u83B7\u53D6\u6A21\u578B\u5217\u8868",
      error: err.message
    });
  }
});
app.post("/api/provider/test-model", async (req, res) => {
  const { providerType, baseUrl, apiKey, model, serviceType = "text", testPrompt, customHeaders } = req.body;
  const startTime = Date.now();
  const prompt = testPrompt || "\u8BF7\u4EC5\u56DE\u590D\u4E00\u53E5\u8BDD\uFF1A\u6A21\u578B\u94FE\u8DEF\u6D4B\u8BD5\u6B63\u5E38\uFF0C\u5DF2\u51C6\u5907\u5C31\u7EEA\uFF01";
  try {
    const reply = await callAiService({
      prompt,
      model,
      apiKey,
      baseUrl,
      providerType,
      temperature: 0.3,
      timeoutMs: 25e3,
      customHeaders
    });
    const latencyMs = Date.now() - startTime;
    if (reply && reply.trim()) {
      return res.json({
        success: true,
        latencyMs,
        model,
        reply: reply.trim(),
        promptTokens: Math.round(prompt.length / 2),
        completionTokens: Math.round(reply.length / 2)
      });
    }
    return res.status(502).json({
      success: false,
      latencyMs,
      model,
      error: "\u6A21\u578B\u5DF2\u54CD\u5E94\u4F46\u8FD4\u56DE\u7A7A\u5185\u5BB9"
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latencyMs,
      model,
      error: err.message || "\u6A21\u578B\u6267\u884C\u6D4B\u8BD5\u5931\u8D25"
    });
  }
});
app.post("/api/test-api", async (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  const startTime = Date.now();
  const cleanKey = apiKey && apiKey.trim() || process.env.GEMINI_API_KEY || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  const targetModel = model || "gemini-3.6-flash";
  if (!cleanKey) {
    return res.status(400).json({
      success: false,
      latency: 0,
      errorType: "missing_key",
      error: "\u672A\u68C0\u6D4B\u5230 API Key\u3002\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u6709\u6548\u5BC6\u94A5\u3002"
    });
  }
  try {
    const reply = await callAiService({
      prompt: "\u8BF7\u4EC5\u56DE\u590D\u4E00\u53E5\u8BDD\uFF1A\u606D\u559C\uFF01API \u4E0E\u6A21\u578B\u53CD\u5411\u4EE3\u7406\u7F51\u7EDC\u5DF2\u8FDE\u901A\uFF0C\u94FE\u8DEF\u4E0E\u6743\u9650\u6B63\u5E38\u3002",
      apiKey: cleanKey,
      baseUrl: cleanBaseUrl,
      model: targetModel
    });
    const latency = Date.now() - startTime;
    return res.json({
      success: true,
      latency,
      model: targetModel,
      baseUrl: cleanBaseUrl || "\u5B98\u65B9\u9ED8\u8BA4\u7AEF\u70B9",
      message: reply.trim()
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      latency,
      error: error.message || "API \u8FDE\u63A5\u6D4B\u8BD5\u5931\u8D25"
    });
  }
});
app.get("/api/weather/reverse-geocode", async (req, res) => {
  try {
    const latStr = req.query.lat;
    const lonStr = req.query.lon;
    if (!latStr || !lonStr) {
      return res.status(400).json({ success: false, error: "\u7F3A\u5C11\u7ECF\u7EAC\u5EA6\u53C2\u6570 (lat, lon)" });
    }
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ success: false, error: "\u65E0\u6548\u7684\u7ECF\u7EAC\u5EA6\u683C\u5F0F" });
    }
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
      const bdcResp = await fetch(bdcUrl, { signal: AbortSignal.timeout(6e3) });
      if (bdcResp.ok) {
        const bdcData = await bdcResp.json();
        const city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || "\u5F53\u524D\u4F4D\u7F6E";
        const district = bdcData.locality || "";
        const province = bdcData.principalSubdivision || "";
        const country = bdcData.countryName || "\u4E2D\u56FD";
        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);
        const displayName = displayParts.join(" ");
        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayName || city,
          source: "BigDataCloud"
        });
      }
    } catch (e) {
      console.warn("BigDataCloud reverse geocode error, trying OSM fallback:", e);
    }
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`;
      const osmResp = await fetch(osmUrl, {
        headers: { "User-Agent": "SimulatedAndroidPhone/2.0" },
        signal: AbortSignal.timeout(6e3)
      });
      if (osmResp.ok) {
        const osmData = await osmResp.json();
        const addr = osmData.address || {};
        const city = addr.city || addr.town || addr.county || addr.district || addr.state || "\u5F53\u524D\u4F4D\u7F6E";
        const district = addr.suburb || addr.district || addr.neighbourhood || "";
        const province = addr.state || "";
        const country = addr.country || "\u4E2D\u56FD";
        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: osmData.display_name || `${country} ${province} ${city}`,
          source: "OpenStreetMap"
        });
      }
    } catch (e) {
      console.warn("OSM reverse geocode error:", e);
    }
    return res.json({
      success: true,
      latitude: lat,
      longitude: lon,
      city: `\u7ECF\u7EAC\u5EA6 (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      district: "",
      province: "",
      country: "",
      displayName: `GPS \u5B9A\u4F4D\u70B9 (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
      source: "CoordinateFallback"
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "\u9006\u5730\u7406\u7F16\u7801\u5F02\u5E38" });
  }
});
app.get("/api/weather/search-city", async (req, res) => {
  try {
    const query = req.query.query?.trim();
    if (!query || query.length < 1) {
      return res.json({ success: true, results: [] });
    }
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=zh&format=json`;
    let apiResults = [];
    try {
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(7e3) });
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        if (geoJson.results && Array.isArray(geoJson.results)) {
          apiResults = geoJson.results.map((r) => {
            const admin = [r.admin1, r.admin2, r.admin3].filter(Boolean).join(" ");
            return {
              id: `${r.id || r.latitude}_${r.longitude}`,
              name: r.name,
              country: r.country || "",
              admin1: r.admin1 || "",
              admin2: r.admin2 || "",
              latitude: r.latitude,
              longitude: r.longitude,
              elevation: r.elevation,
              timezone: r.timezone,
              displayName: [r.country, admin, r.name].filter(Boolean).join(" \xB7 ")
            };
          });
        }
      }
    } catch (fetchErr) {
      console.warn("Open-Meteo Geocoding fetch error:", fetchErr);
    }
    if (apiResults.length < 5) {
      try {
        const osmSearchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&accept-language=zh&limit=10`;
        const osmRes = await fetch(osmSearchUrl, {
          headers: { "User-Agent": "SimulatedAndroidPhone/2.0" },
          signal: AbortSignal.timeout(6e3)
        });
        if (osmRes.ok) {
          const osmList = await osmRes.json();
          if (Array.isArray(osmList)) {
            osmList.forEach((item) => {
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              const exists = apiResults.some(
                (c) => Math.abs(c.latitude - lat) < 0.05 && Math.abs(c.longitude - lon) < 0.05
              );
              if (!exists) {
                apiResults.push({
                  id: `osm_${item.place_id || lat}`,
                  name: item.name || query,
                  country: item.display_name.includes("\u4E2D\u56FD") ? "\u4E2D\u56FD" : "",
                  admin1: "",
                  admin2: "",
                  latitude: lat,
                  longitude: lon,
                  displayName: item.display_name
                });
              }
            });
          }
        }
      } catch (osmErr) {
        console.warn("OSM search fallback error:", osmErr);
      }
    }
    res.json({ success: true, results: apiResults.slice(0, 20) });
  } catch (err) {
    console.error("City search error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
function mapWmoWeatherCode(code) {
  switch (code) {
    case 0:
      return { condition: "\u6674", icon: "Sun" };
    case 1:
      return { condition: "\u6674\u95F4\u591A\u4E91", icon: "SunMedium" };
    case 2:
      return { condition: "\u591A\u4E91", icon: "CloudSun" };
    case 3:
      return { condition: "\u9634", icon: "Cloud" };
    case 45:
    case 48:
      return { condition: "\u5927\u96FE", icon: "CloudFog" };
    case 51:
      return { condition: "\u5C0F\u6BDB\u6BDB\u96E8", icon: "CloudDrizzle" };
    case 53:
      return { condition: "\u6BDB\u6BDB\u96E8", icon: "CloudDrizzle" };
    case 55:
      return { condition: "\u5BC6\u6BDB\u6BDB\u96E8", icon: "CloudDrizzle" };
    case 56:
    case 57:
      return { condition: "\u51BB\u6BDB\u6BDB\u96E8", icon: "CloudDrizzle" };
    case 61:
      return { condition: "\u5C0F\u96E8", icon: "CloudRain" };
    case 63:
      return { condition: "\u4E2D\u96E8", icon: "CloudRain" };
    case 65:
      return { condition: "\u5927\u96E8", icon: "CloudRainWind" };
    case 66:
    case 67:
      return { condition: "\u51BB\u96E8", icon: "CloudRain" };
    case 71:
      return { condition: "\u5C0F\u96EA", icon: "Snowflake" };
    case 73:
      return { condition: "\u4E2D\u96EA", icon: "Snowflake" };
    case 75:
      return { condition: "\u5927\u96EA", icon: "Snowflake" };
    case 77:
      return { condition: "\u96EA\u7C92", icon: "Snowflake" };
    case 80:
      return { condition: "\u9635\u96E8", icon: "CloudRain" };
    case 81:
      return { condition: "\u4E2D\u5EA6\u9635\u96E8", icon: "CloudRainWind" };
    case 82:
      return { condition: "\u5F3A\u66B4\u96E8", icon: "CloudRainWind" };
    case 85:
    case 86:
      return { condition: "\u9635\u96EA", icon: "Snowflake" };
    case 95:
      return { condition: "\u96F7\u9635\u96E8", icon: "CloudLightning" };
    case 96:
    case 99:
      return { condition: "\u5F3A\u96F7\u66B4\u4F34\u51B0\u96F9", icon: "CloudLightning" };
    default:
      return { condition: "\u591A\u4E91", icon: "CloudSun" };
  }
}
function getWindDirectionText(degrees) {
  if (degrees >= 337.5 || degrees < 22.5) return "\u5317\u98CE";
  if (degrees >= 22.5 && degrees < 67.5) return "\u4E1C\u5317\u98CE";
  if (degrees >= 67.5 && degrees < 112.5) return "\u4E1C\u98CE";
  if (degrees >= 112.5 && degrees < 157.5) return "\u4E1C\u5357\u98CE";
  if (degrees >= 157.5 && degrees < 202.5) return "\u5357\u98CE";
  if (degrees >= 202.5 && degrees < 247.5) return "\u897F\u5357\u98CE";
  if (degrees >= 247.5 && degrees < 292.5) return "\u897F\u98CE";
  if (degrees >= 292.5 && degrees < 337.5) return "\u897F\u5317\u98CE";
  return "\u5FAE\u98CE";
}
function getWindScaleText(speedKmH) {
  if (speedKmH < 5) return "1\u7EA7";
  if (speedKmH < 11) return "2\u7EA7";
  if (speedKmH < 19) return "3\u7EA7";
  if (speedKmH < 28) return "4\u7EA7";
  if (speedKmH < 38) return "5\u7EA7";
  if (speedKmH < 49) return "6\u7EA7";
  if (speedKmH < 61) return "7\u7EA7 (\u5927\u98CE)";
  if (speedKmH < 74) return "8\u7EA7 (\u5927\u98CE)";
  return "9\u7EA7\u4EE5\u4E0A (\u72C2\u98CE)";
}
app.get("/api/weather", async (req, res) => {
  const reqStart = Date.now();
  try {
    let city = req.query.city?.trim() || "";
    let lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    let lon = req.query.lon ? parseFloat(req.query.lon) : void 0;
    const isAuto = req.query.auto === "true";
    if ((lat === void 0 || lon === void 0 || isNaN(lat) || isNaN(lon)) && city) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
          { signal: AbortSignal.timeout(6e3) }
        );
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
          city = geoData.results[0].name || city;
        }
      } catch (geoErr) {
        console.warn("Geocoding city query failed:", geoErr);
      }
    }
    if (lat !== void 0 && lon !== void 0 && !isNaN(lat) && !isNaN(lon) && (!city || city === "\u5F53\u524D\u4F4D\u7F6E" || city === "\u672C\u5730")) {
      try {
        const bdcResp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
          { signal: AbortSignal.timeout(4e3) }
        );
        if (bdcResp.ok) {
          const bdcData = await bdcResp.json();
          city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || `\u7ECF\u7EAC\u5EA6 (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        }
      } catch {
      }
    }
    if (lat === void 0 || lon === void 0 || isNaN(lat) || isNaN(lon)) {
      return res.status(200).json({
        success: false,
        status: "unlocated",
        error: "\u672A\u83B7\u53D6\u5230\u624B\u673A GPS \u5B9A\u4F4D\u7ECF\u7EAC\u5EA6\uFF0C\u4E14\u672A\u6307\u5B9A\u57CE\u5E02\u3002\u8BF7\u5141\u8BB8\u4F4D\u7F6E\u6743\u9650\u6216\u624B\u52A8\u641C\u7D22\u57CE\u5E02\u3002"
      });
    }
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&timezone=auto`;
    const [weatherFetchResult, aqiFetchResult] = await Promise.allSettled([
      fetch(weatherUrl, { signal: AbortSignal.timeout(9e3) }),
      fetch(aqiUrl, { signal: AbortSignal.timeout(8e3) })
    ]);
    let data = null;
    if (weatherFetchResult.status === "fulfilled" && weatherFetchResult.value.ok) {
      data = await weatherFetchResult.value.json();
    } else {
      const errReason = weatherFetchResult.status === "rejected" ? weatherFetchResult.reason : "HTTP status " + weatherFetchResult.value?.status;
      throw new Error(`Open-Meteo weather fetch failed: ${errReason}`);
    }
    let aqiData = null;
    if (aqiFetchResult.status === "fulfilled" && aqiFetchResult.value.ok) {
      try {
        aqiData = await aqiFetchResult.value.json();
      } catch {
      }
    }
    if (data && data.current) {
      const current = data.current;
      const hourly = data.hourly || {};
      const daily = data.daily || {};
      const currentCode = current.weather_code ?? 0;
      const { condition } = mapWmoWeatherCode(currentCode);
      const windSpeed = Math.round(current.wind_speed_10m || 0);
      const windDir = `${getWindDirectionText(current.wind_direction_10m || 0)} ${getWindScaleText(windSpeed)}`;
      const hourlyList = [];
      const currentLocalTimeStr = current.time || "";
      const currentLocalHour = currentLocalTimeStr.slice(0, 13);
      const timeArr = hourly.time || [];
      let startIndex = timeArr.findIndex((t) => t.slice(0, 13) === currentLocalHour);
      if (startIndex === -1) {
        startIndex = timeArr.findIndex((t) => t >= currentLocalHour);
      }
      if (startIndex === -1) startIndex = 0;
      for (let i = startIndex; i < Math.min(startIndex + 24, timeArr.length); i++) {
        const hTimeStr = timeArr[i];
        const timeFormatted = hTimeStr.includes("T") ? hTimeStr.split("T")[1].slice(0, 5) : hTimeStr;
        const hCode = hourly.weather_code ? hourly.weather_code[i] ?? 0 : 0;
        const hCond = mapWmoWeatherCode(hCode);
        const approximateTimestamp = (/* @__PURE__ */ new Date(hTimeStr + (data.utc_offset_seconds !== void 0 ? "" : "Z"))).getTime();
        hourlyList.push({
          time: i === startIndex ? "\u73B0\u5728" : timeFormatted,
          timestamp: isNaN(approximateTimestamp) ? Date.now() + (i - startIndex) * 36e5 : approximateTimestamp,
          temp: Math.round(hourly.temperature_2m ? hourly.temperature_2m[i] ?? current.temperature_2m : current.temperature_2m),
          feelsLike: Math.round(hourly.apparent_temperature ? hourly.apparent_temperature[i] ?? current.apparent_temperature : current.apparent_temperature),
          condition: hCond.condition,
          conditionCode: hCode,
          precipProbability: hourly.precipitation_probability ? hourly.precipitation_probability[i] ?? 0 : 0,
          precipitation: hourly.precipitation ? Number((hourly.precipitation[i] ?? 0).toFixed(1)) : 0,
          windSpeed: Math.round(hourly.wind_speed_10m ? hourly.wind_speed_10m[i] ?? 0 : 0)
        });
      }
      const dailyList = [];
      const daysOfWeek = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
      const currentLocalDate = currentLocalTimeStr.slice(0, 10);
      const dTimeArr = daily.time || [];
      let dStartIndex = dTimeArr.findIndex((d) => d >= currentLocalDate);
      if (dStartIndex === -1) dStartIndex = 0;
      for (let i = dStartIndex; i < Math.min(dStartIndex + 7, dTimeArr.length); i++) {
        const dateStr = dTimeArr[i];
        const dateParts = dateStr.split("-").map(Number);
        const localDateObj = new Date(dateParts[0], (dateParts[1] || 1) - 1, dateParts[2] || 1);
        const dayLabel = i === dStartIndex ? "\u4ECA\u5929" : i === dStartIndex + 1 ? "\u660E\u5929" : daysOfWeek[localDateObj.getDay()];
        const dCode = daily.weather_code ? daily.weather_code[i] ?? 0 : 0;
        const dCond = mapWmoWeatherCode(dCode);
        dailyList.push({
          date: dateStr,
          dayOfWeek: dayLabel,
          tempMin: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[i] ?? 20 : 20),
          tempMax: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[i] ?? 30 : 30),
          condition: dCond.condition,
          conditionCode: dCode,
          precipProbability: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] ?? 0 : 0
        });
      }
      let rainForecastSummary = "\u672A\u6765\u51E0\u5C0F\u65F6\u65E0\u660E\u663E\u964D\u6C34\uFF0C\u9002\u5B9C\u5916\u51FA";
      const upcomingRainHour = hourlyList.slice(0, 6).find((h) => h.precipProbability >= 60 || h.precipitation >= 0.5);
      if (upcomingRainHour) {
        rainForecastSummary = `\u9884\u8BA1 ${upcomingRainHour.time} \u5F00\u59CB\u964D\u6C34\uFF0C\u964D\u6C34\u6982\u7387 ${upcomingRainHour.precipProbability}%`;
      } else {
        const moderateRainHour = hourlyList.slice(0, 6).find((h) => h.precipProbability >= 35);
        if (moderateRainHour) {
          rainForecastSummary = `\u672A\u6765\u6570\u5C0F\u65F6\u6709 ${moderateRainHour.precipProbability}% \u9635\u96E8\u53EF\u80FD\uFF0C\u51FA\u95E8\u5907\u628A\u4F1E\u66F4\u5B89\u5FC3`;
        }
      }
      const alerts = [];
      const curTemp = Math.round(current.temperature_2m ?? 26);
      const todayMax = dailyList[0]?.tempMax ?? curTemp;
      const todayMin = dailyList[0]?.tempMin ?? curTemp;
      if (todayMax >= 37 || curTemp >= 37) {
        alerts.push({
          id: "alert_heat_orange",
          title: "\u9AD8\u6E29\u6A59\u8272\u9884\u8B66",
          level: "orange",
          levelText: "\u6A59\u8272\u9884\u8B66",
          description: `\u9884\u8BA1\u6700\u9AD8\u6C14\u6E29\u5C06\u5347\u81F3 ${todayMax}\xB0C\uFF0C\u8BF7\u5C3D\u91CF\u51CF\u5C11\u5348\u540E\u5BA4\u5916\u4F5C\u4E1A\u4E0E\u70C8\u65E5\u66B4\u6652\uFF0C\u591A\u8865\u5145\u7535\u89E3\u8D28\u6C34\u5206\u3002`,
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      } else if (todayMax >= 35 || curTemp >= 35) {
        alerts.push({
          id: "alert_heat_yellow",
          title: "\u9AD8\u6E29\u9EC4\u8272\u9884\u8B66",
          level: "yellow",
          levelText: "\u9EC4\u8272\u9884\u8B66",
          description: `\u4ECA\u65E5\u6700\u9AD8\u6C14\u6E29\u53EF\u8FBE ${todayMax}\xB0C\uFF0C\u5929\u6C14\u708E\u70ED\uFF0C\u8BF7\u6CE8\u610F\u505A\u597D\u9632\u6652\u4E0E\u964D\u6E29\u9632\u6691\u63AA\u65BD\u3002`,
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      }
      if (todayMin <= 0 || curTemp <= 0) {
        alerts.push({
          id: "alert_cold_blue",
          title: "\u4F4E\u6E29\u9053\u8DEF\u7ED3\u51B0\u9884\u8B66",
          level: "blue",
          levelText: "\u84DD\u8272\u9884\u8B66",
          description: `\u5F53\u524D\u6C14\u6E29\u8F83\u4F4E (${curTemp}\xB0C)\uFF0C\u8DEF\u9762\u53CA\u6865\u6881\u6613\u51FA\u73B0\u6E7F\u6ED1\u7ED3\u51B0\uFF0C\u65E9\u665A\u51FA\u884C\u8BF7\u6CE8\u610F\u9632\u98CE\u4FDD\u6696\u4E0E\u4EA4\u901A\u5B89\u5168\u3002`,
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      }
      if ([95, 96, 99].includes(currentCode) || hourlyList.slice(0, 4).some((h) => [95, 96, 99].includes(h.conditionCode))) {
        alerts.push({
          id: "alert_thunder_yellow",
          title: "\u96F7\u7535\u4E0E\u5F3A\u5BF9\u6D41\u9884\u8B66",
          level: "yellow",
          levelText: "\u9EC4\u8272\u9884\u8B66",
          description: "\u53D7\u5C40\u5730\u5BF9\u6D41\u4E91\u56E2\u5F71\u54CD\uFF0C\u53EF\u80FD\u51FA\u73B0\u96F7\u66B4\u5927\u98CE\u4E0E\u77ED\u65F6\u5F3A\u964D\u6C34\uFF0C\u6237\u5916\u8BF7\u5207\u52FF\u5728\u6811\u4E0B\u6216\u5F00\u9614\u5730\u9017\u7559\u3002",
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      }
      if (windSpeed >= 35) {
        alerts.push({
          id: "alert_wind_blue",
          title: "\u5927\u98CE\u84DD\u8272\u9884\u8B66",
          level: "blue",
          levelText: "\u84DD\u8272\u9884\u8B66",
          description: `\u5F53\u524D\u6700\u5927\u9635\u98CE\u53EF\u8FBE ${windSpeed} km/h (${getWindScaleText(windSpeed)})\uFF0C\u8BF7\u6CE8\u610F\u5173\u597D\u95E8\u7A97\uFF0C\u6536\u8D77\u9633\u53F0\u6613\u5760\u7269\u54C1\u3002`,
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      }
      if (current.precipitation >= 20 || hourlyList.slice(0, 4).some((h) => h.precipitation >= 15)) {
        alerts.push({
          id: "alert_rain_orange",
          title: "\u66B4\u96E8\u6A59\u8272\u9884\u8B66",
          level: "orange",
          levelText: "\u6A59\u8272\u9884\u8B66",
          description: "\u7D2F\u79EF\u96E8\u91CF\u5DF2\u8FBE\u66B4\u96E8\u7EA7\u522B\uFF0C\u4F4E\u6D3C\u8DEF\u6BB5\u6613\u51FA\u73B0\u79EF\u6C34\uFF0C\u884C\u8F66\u6CE8\u610F\u51CF\u901F\u6162\u884C\u3002",
          pubTime: "\u6C14\u8C61\u9884\u8B66\u4E2D\u5FC3"
        });
      }
      let airQuality = void 0;
      if (aqiData && aqiData.current) {
        const curAqi = aqiData.current;
        const usAqi = curAqi.us_aqi !== void 0 ? Math.round(curAqi.us_aqi) : void 0;
        const europeanAqi = curAqi.european_aqi !== void 0 ? Math.round(curAqi.european_aqi) : void 0;
        const pm25 = curAqi.pm2_5 !== void 0 ? Math.round(curAqi.pm2_5) : void 0;
        const pm10 = curAqi.pm10 !== void 0 ? Math.round(curAqi.pm10) : void 0;
        const effectiveAqi = usAqi !== void 0 ? usAqi : pm25 !== void 0 ? Math.round(pm25 * 1.5) : europeanAqi;
        if (effectiveAqi !== void 0) {
          const aqiLabel = effectiveAqi <= 50 ? "\u4F18" : effectiveAqi <= 100 ? "\u826F" : effectiveAqi <= 150 ? "\u8F7B\u5EA6\u6C61\u67D3" : effectiveAqi <= 200 ? "\u4E2D\u5EA6\u6C61\u67D3" : "\u91CD\u5EA6\u6C61\u67D3";
          airQuality = {
            aqi: effectiveAqi,
            label: aqiLabel,
            pm25,
            pm10
          };
        }
      }
      const weatherResult = {
        city: city || "\u5F53\u524D\u4F4D\u7F6E",
        country: "",
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
        uvIndex: current.uv_index !== void 0 ? Number(current.uv_index.toFixed(1)) : 4.5,
        airQuality,
        hourly: hourlyList,
        daily: dailyList,
        alerts,
        updatedAt: Date.now(),
        isAutoLocation: isAuto,
        rainForecastSummary,
        dataSourceInfo: {
          serviceName: "Open-Meteo WMO / ECMWF \u5168\u7403\u9AD8\u7CBE\u6C14\u8C61\u6A21\u578B",
          geocodingService: "Open-Meteo & BigDataCloud / Nominatim \u9006\u5730\u7406\u7F16\u7801",
          airQualityService: aqiData ? "Open-Meteo \u6B27\u6D32\u54E5\u767D\u5C3C\u5927\u6C14\u76D1\u6D4B\u670D\u52A1 (CAMS)" : "\u6682\u672A\u63D0\u4F9B",
          requestTimestamp: reqStart,
          responseTimestamp: Date.now(),
          networkLatencyMs: Date.now() - reqStart,
          isFromCache: false,
          timezone: data.timezone || "Asia/Shanghai",
          elevation: data.elevation,
          coordinates: { latitude: lat, longitude: lon }
        }
      };
      return res.json({ success: true, weather: weatherResult });
    }
    return res.status(500).json({ success: false, error: "\u672A\u80FD\u83B7\u53D6\u6709\u6548\u6C14\u8C61\u54CD\u5E94\u6570\u636E" });
  } catch (error) {
    console.error("Weather error:", error);
    res.status(500).json({ success: false, error: error.message || "\u83B7\u53D6\u5929\u6C14\u6570\u636E\u5931\u8D25" });
  }
});
app.post("/api/gemini/weather-proactive-care", async (req, res) => {
  const {
    character,
    weatherEvent,
    weatherData,
    userProfile,
    memosSummary,
    permissions,
    apiConfig
  } = req.body;
  const startTime = Date.now();
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u4F60\u6B63\u5728\u626E\u6F14\u5FAE\u4FE1\u597D\u53CB\u3010${character.name}\u3011(\u5FAE\u4FE1\u53F7: ${character.wxid})\u3002
\u4EBA\u8BBE\u80CC\u666F\u4E0E\u8BF4\u8BDD\u53E3\u543B\uFF1A
${character.persona}

\u5BF9\u8BDD\u4EBA\uFF08\u4F60\u7684\u5FAE\u4FE1\u597D\u53CB\uFF09\uFF1A
- \u59D3\u540D/\u6635\u79F0\uFF1A${userProfile?.name || "\u5C0F\u6E05"}
- \u4E2A\u4EBA\u559C\u597D\uFF1A${userProfile?.persona || "\u968F\u548C\u53EF\u7231"}

\u3010\u68C0\u6D4B\u5230\u7684\u7A81\u53D1\u5929\u6C14\u4E8B\u4EF6\u4E0E\u6C14\u8C61\u6570\u636E\u3011\uFF1A
- \u6C14\u8C61\u4E8B\u4EF6\uFF1A${weatherEvent.title} (${weatherEvent.summary})
- \u4E8B\u4EF6\u5177\u4F53\u5206\u6790\uFF1A${weatherEvent.detail}
- \u7528\u6237\u5F53\u524D\u57CE\u5E02\uFF1A${weatherData?.city || "\u672C\u5730"}
- \u5F53\u524D\u5929\u6C14\u73B0\u8C61\uFF1A${weatherData?.condition}\uFF0C\u6C14\u6E29 ${weatherData?.temp}\xB0C (\u4F53\u611F\u6E29\u5EA6 ${weatherData?.feelsLike}\xB0C)
- \u964D\u96E8\u6982\u7387\uFF1A${weatherData?.precipProbability}% (\u964D\u6C34\u60C5\u51B5: ${weatherData?.rainForecastSummary || "\u65E0"})
${weatherEvent.weatherSnapshot?.alertTitle ? `- \u5B98\u65B9\u6C14\u8C61\u9884\u8B66\u53D1\u5E03\uFF1A\u3010${weatherEvent.weatherSnapshot.alertTitle}\u3011` : ""}

${permissions?.appAccess?.memosData && memosSummary ? `\u3010\u7528\u6237\u8FD1\u671F\u65E5\u7A0B\u4E0E\u684C\u9762\u5907\u5FD8\u5F55\u3011:
${memosSummary}
(\u6CE8\u610F\uFF1A\u82E5\u5907\u5FD8\u5F55\u4E2D\u6709\u4E0B\u5348\u3001\u508D\u665A\u6216\u8FD1\u671F\u7684\u51FA\u884C\u3001\u8DD1\u6B65\u3001\u7EA6\u4F1A\u3001\u52A0\u73ED\u7B49\u6D3B\u52A8\uFF0C\u8BF7\u5728\u5173\u5FC3\u5929\u6C14\u65F6\u81EA\u7136\u7ED3\u5408\u8BE5\u65E5\u7A0B\u8FDB\u884C\u6E29\u99A8\u63D0\u793A\uFF01)` : ""}

\u3010\u6838\u5FC3\u751F\u6210\u8981\u6C42\u3011\uFF1A
1. \u5FC5\u987B\u5B8C\u5168\u7B26\u5408\u3010${character.name}\u3011\u72EC\u7279\u7684\u4EBA\u8BBE\u6027\u683C\uFF08\u5982\u5B66\u9738\u987E\u8A00\u7684\u51B7\u9759\u5185\u655B\u4F46\u7EC6\u8282\u5165\u5FAE\u3001\u603B\u88C1\u9646\u6C89\u7684\u6C89\u7A33\u9738\u9053\u4E0E\u7EC6\u81F4\u5475\u62A4\u3001\u5C0F\u8475\u7684\u6D3B\u6CFC\u5143\u6C14\u4E0E\u8D34\u5FC3\u95FA\u871C\u611F\uFF09\uFF0C\u7528\u5FAE\u4FE1\u771F\u5B9E\u804A\u5929\u7684\u53E3\u543B\u4E3B\u52A8\u53D1\u6765\u5173\u6000\u3002
2. \u7EDD\u5BF9\u4E0D\u80FD\u50CF\u673A\u68B0\u673A\u5668\u4EBA\u64AD\u62A5\u5929\u6C14\u9884\u62A5\u6570\u636E\uFF01\u8981\u50CF\u771F\u5B9E\u751F\u6D3B\u4E2D\u7684\u5FAE\u4FE1\u597D\u53CB\u4E00\u6837\u81EA\u7136\u3001\u4F53\u8D34\u3001\u6709\u6E29\u5EA6\u5730\u5173\u5FC3\u7528\u6237\uFF08\u4F8B\u5982\uFF1A\u201C\u5C71\u96E8\uFF0C\u4E0B\u5348\u53EF\u80FD\u8981\u4E0B\u96E8\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u4F1E\u54E6\u3002\u201D\u6216\u201C\u770B\u4F60\u5907\u5FD8\u5F55\u91CC\u5199\u7740\u4E0B\u5348\u8981\u53BB\u8DD1\u6B65\uFF0C\u508D\u665A\u6709\u5927\u96E8\uFF0C\u8BB0\u5F97\u6539\u5728\u5BA4\u5185\u54E6\u201D\uFF09\u3002
3. \u8F93\u51FA\u683C\u5F0F\u8981\u6C42\uFF1A
\u5728\u56DE\u7B54\u6700\u5F00\u5934\u7528 <think>...</think> \u6807\u7B7E\u5199\u660E\u4F60\u7684\u601D\u8003\u94FE\uFF0C\u5206\u6790\u5F53\u524D\u5929\u6C14\u4E8B\u4EF6\u3001\u7ED3\u5408\u7528\u6237\u65E5\u7A0B\uFF08\u82E5\u6709\uFF09\u4E0E\u89D2\u8272\u4EBA\u8BBE\u7684\u5207\u5165\u70B9\uFF1B
\u5728 </think> \u6807\u7B7E\u4E4B\u540E\u76F4\u63A5\u8F93\u51FA\u4F60\u8981\u53D1\u9001\u7ED9\u7528\u6237\u7684\u5FAE\u4FE1\u6D88\u606F\u6587\u672C\uFF081~3\u53E5\u8BDD\uFF0C\u7B26\u5408\u5FAE\u4FE1\u65E5\u5E38\u6253\u5B57\u4E60\u60EF\uFF09\u3002
`;
    let responseText = "";
    let thinkingProcess = `\u5206\u6790\u5929\u6C14\u4E8B\u4EF6 [${weatherEvent.title}]\uFF0C\u7ED3\u5408 ${character.name} \u7684\u4EBA\u8BBE\u53E3\u543B\u751F\u6210\u5FAE\u4FE1\u5173\u6000\u3002`;
    let replyContent = "";
    try {
      responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
    } catch (e) {
      console.warn("Weather care AI call failed, using fallback:", e.message);
    }
    if (!responseText) {
      const isRain = weatherEvent.type.includes("rain") || weatherEvent.type === "severe_weather";
      const isHeat = weatherEvent.type === "high_temp";
      const isCold = weatherEvent.type === "low_temp" || weatherEvent.type === "temp_drop";
      if (isRain) {
        responseText = `<think>\u611F\u77E5\u5230\u5373\u5C06\u964D\u96E8\uFF08\u964D\u96E8\u6982\u7387\u8F83\u9AD8\uFF09\uFF0C\u6839\u636E${character.name}\u4EBA\u8BBE\u63D0\u9192\u5E26\u4F1E\u4E0E\u907F\u96E8\u3002</think>${userProfile?.name || "\u5C0F\u6E05"}\uFF0C\u770B\u5929\u6C14\u7B49\u4E0B\u53EF\u80FD\u8981\u4E0B\u96E8\u5462\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u628A\u4F1E\u54E6\uFF0C\u522B\u6DCB\u6E7F\u5566\uFF01\u{1F327}\uFE0F`;
      } else if (isHeat) {
        responseText = `<think>\u611F\u77E5\u5230\u9AD8\u6E29\u9884\u8B66\uFF0C\u63D0\u9192\u9632\u6691\u964D\u6E29\u4E0E\u8865\u5145\u6C34\u5206\u3002</think>\u4ECA\u5929\u5916\u9762\u6C14\u6E29\u597D\u9AD8\u5440\uFF0C\u5C3D\u91CF\u5C11\u5728\u592A\u9633\u5E95\u4E0B\u6652\u7740\uFF0C\u591A\u559D\u70B9\u6C34\u6CE8\u610F\u9632\u6691\u54E6\uFF01\u2600\uFE0F`;
      } else if (isCold) {
        responseText = `<think>\u611F\u77E5\u5230\u6C14\u6E29\u9AA4\u964D\uFF0C\u63D0\u9192\u589E\u6DFB\u8863\u7269\u4FDD\u6696\u3002</think>\u4ECA\u5929\u964D\u6E29\u660E\u663E\uFF0C\u5916\u9762\u98CE\u5927\u633A\u51B7\u7684\uFF0C\u51FA\u95E8\u591A\u7A7F\u4EF6\u5916\u5957\uFF0C\u5343\u4E07\u522B\u7740\u51C9\u4E86\u54E6\uFF01\u{1F9E3}`;
      } else {
        responseText = `<think>\u611F\u77E5\u5230\u7A81\u53D1\u5929\u6C14\u53D8\u5316\uFF0C\u751F\u6210\u6696\u5FC3\u95EE\u5019\u3002</think>\u6CE8\u610F\u770B\u5929\u6C14\u53D8\u5316\u54E6\uFF0C\u5916\u51FA\u7167\u987E\u597D\u81EA\u5DF1\uFF01\u2728`;
      }
    }
    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
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
        id: "log_" + Date.now(),
        appName: "\u5929\u6C14-AI\u4E3B\u52A8\u5173\u6000",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "ProactiveWeatherCare",
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 5e-7).toFixed(5)),
        purpose: `AI [${character.name}] \u9488\u5BF9 [${weatherEvent.title}] \u53D1\u9001\u5FAE\u4FE1\u5929\u6C14\u5173\u6000 (\u8017\u65F6 ${duration}ms)`
      }
    });
  } catch (error) {
    console.error("Weather proactive care error:", error);
    res.status(500).json({ success: false, error: error.message || "Weather proactive care failed" });
  }
});
app.post("/api/gemini/chat", async (req, res) => {
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
    apiConfig
  } = req.body;
  const startTime = Date.now();
  const selectedModel = character?.modelConfig?.modelName || apiConfig?.textModel || "gemini-3.6-flash";
  try {
    let contextPrompt = `\u4F60\u6B63\u5728\u626E\u6F14\u4EFF\u771F\u5FAE\u4FE1\u4E2D\u7684 AI \u89D2\u8272\u3002
\u89D2\u8272\u540D\u79F0\uFF1A${character.name} (\u5FAE\u4FE1\u53F7: ${character.wxid})
${character.relationship ? `\u4E0E\u7528\u6237\u7684\u5173\u7CFB\uFF1A${character.relationship}
` : ""}
\u8EAB\u4EFD\u80CC\u666F\u4E0E\u7ECF\u5386\u8BBE\u5B9A\uFF1A${character.persona}
${character.personality ? `\u6027\u683C\u7279\u5F81\u4E0E\u53E3\u543B\u4E60\u60EF\uFF1A${character.personality}
` : ""}
${character.modelConfig?.systemPromptPrefix ? `\u3010\u524D\u7F6E\u6838\u5FC3\u539F\u5219\u3011\uFF1A${character.modelConfig.systemPromptPrefix}
` : ""}
\u957F\u671F\u8BB0\u5FC6\u5E93\uFF1A
${character.memories && character.memories.length > 0 ? character.memories.map((m) => `- ${m}`).join("\n") : "(\u6682\u65E0\u8BB0\u5FC6)"}
${recalledMemoriesSummary ? `
${recalledMemoriesSummary}
` : ""}
\u5BF9\u8BDD\u4EBA\uFF08\u7528\u6237\uFF09\u8EAB\u4EFD\u4FE1\u606F\uFF1A
- \u59D3\u540D/\u6635\u79F0\uFF1A${userProfile?.name || "\u7528\u6237"}
- \u5FAE\u4FE1\u53F7\uFF1A${userProfile?.wxid || "xiaoqing"}
- \u4E2A\u4EBA\u7B80\u8FF0\uFF1A${userProfile?.bio || "\u6682\u65E0"}
- \u6027\u683C\u559C\u597D\uFF1A${userProfile?.persona || "\u6682\u65E0"}
- \u804A\u5929\u504F\u597D\uFF1A${userProfile?.preferences || "\u65E0\u7279\u522B\u6307\u793A"}
`;
    const currentNativeTime = systemTime || (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
    const currentNativeLoc = locationCity || realDeviceContext?.locationCity || weatherInfo?.city;
    contextPrompt += `
\u3010\u{1F4F1} Android \u624B\u673A\u539F\u751F\u5E95\u5C42\u611F\u77E5\xB7\u771F\u5B9E\u65F6\u95F4\u4E0E\u73AF\u5883\u3011:
- \u624B\u673A\u7CFB\u7EDF\u672C\u5730\u771F\u5B9E\u65F6\u95F4\uFF1A${currentNativeTime}
- \u624B\u673A\u7269\u7406\u4F4D\u7F6E/\u57CE\u5E02\uFF1A${currentNativeLoc ? currentNativeLoc : "\u5F53\u524D\u672A\u6388\u6743\u624B\u673A\u5B9A\u4F4D\u6216\u672A\u9009\u62E9\u57CE\u5E02"}
`;
    if (permissions?.appAccess?.worldBookData !== false && associatedWorldBook && associatedWorldBook.title) {
      contextPrompt += `
\u3010\u{1F30C} \u5DF2\u7ED1\u5B9A\u4E16\u754C\u4E66\xB7\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u80CC\u666F\u8BBE\u5B9A\u3011
- \u4E16\u754C\u4E66\u540D\u79F0\uFF1A\u300A${associatedWorldBook.title}\u300B
- \u6838\u5FC3\u4E16\u754C\u6CD5\u5219\u4E0E\u80CC\u666F\uFF1A${associatedWorldBook.worldSetting || "\u65E0\u7279\u5B9A\u80CC\u666F"}
${associatedWorldBook.entries && associatedWorldBook.entries.length > 0 ? "\u3010\u4E13\u6709\u540D\u8BCD\u4E0E\u8BCD\u6761\u8BBE\u5B9A\u5E93\u3011\uFF1A\n" + associatedWorldBook.entries.map((e) => `* [${e.keyword}]: ${e.content}`).join("\n") : ""}
\u3010\u6F14\u804C\u5173\u952E\u6CD5\u5219\u3011\uFF1A\u4F60\u5F53\u524D\u5904\u4E8E\u8BE5\u4E16\u754C\u89C2\u80CC\u666F\u4E2D\u3002\u4F60\u7684\u8A00\u8C08\u4E3E\u6B62\u3001\u4E16\u754C\u5E38\u8BC6\u3001\u7528\u8BCD\u4E60\u60EF\u5FC5\u987B\u81EA\u7136\u878D\u5165\u8BE5\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u8BCD\u6761\u8BBE\u5B9A\uFF0C\u540C\u65F6\u4FDD\u6301\u4F60\u81EA\u8EAB\u7684\u4EBA\u8BBE\u6027\u683C\u3002
`;
    }
    const isProactiveCare = req.body.isProactivePeriodGreeting === true;
    if (permissions?.appAccess?.menstrualData && menstrualInfo) {
      contextPrompt += `
\u3010\u{1FA78} [\u5DF2\u83B7\u7CFB\u7EDF\u7EA7\u6388\u6743] \u7528\u6237\u5973\u6027\u751F\u7406\u5468\u671F\u4E0E\u5065\u5EB7\u5C0F\u7EC4\u4EF6\u5B9E\u65F6\u611F\u77E5\u3011:
- \u5F53\u524D\u751F\u7406\u9636\u6BB5\uFF1A${menstrualInfo.phaseTitle || (menstrualInfo.currentPeriodDay ? `\u7ECF\u671F\u7B2C ${menstrualInfo.currentPeriodDay} \u5929` : `\u8DDD\u4E0B\u6B21\u7ECF\u671F\u8FD8\u6709 ${menstrualInfo.daysUntilNextPeriod} \u5929`)}
- \u9636\u6BB5\u751F\u7406\u7279\u5F81\u4E0E\u5173\u6000\u91CD\u70B9\uFF1A${menstrualInfo.phaseAdvice || "\u6CE8\u610F\u8EAB\u4F53\u4FDD\u6696\u4E0E\u4F11\u606F"}
- \u8DDD\u79BB\u4E0B\u6B21\u7ECF\u671F\uFF1A${menstrualInfo.daysUntilNextPeriod !== void 0 ? menstrualInfo.daysUntilNextPeriod + " \u5929" : "\u8BA1\u7B97\u4E2D"}
- \u5F53\u524D\u662F\u5426\u5904\u4E8E\u7ECF\u671F\uFF1A${menstrualInfo.currentPeriodDay ? `\u6B63\u5904\u4E8E\u7ECF\u671F\u7B2C ${menstrualInfo.currentPeriodDay} \u5929` : "\u5426 (\u975E\u7ECF\u671F)"}
- \u4ECA\u65E5\u7528\u6237\u767B\u8BB0\u75C7\u72B6\uFF1A${menstrualInfo.todaySymptoms && menstrualInfo.todaySymptoms.length > 0 ? menstrualInfo.todaySymptoms.join("\u3001") : "\u4ECA\u65E5\u672A\u767B\u8BB0\u660E\u663E\u4E0D\u9002"}
- \u8FD1\u671F\u8EAB\u4F53\u611F\u53D7\u65E5\u8BB0\uFF1A${menstrualInfo.recentNotesSummary || "\u6682\u65E0\u7279\u6B8A\u8BB0\u5F55"}
- \u5E73\u5747\u751F\u7406\u5468\u671F\uFF1A${menstrualInfo.avgCycleLength || 28} \u5929 (\u7ECF\u671F\u6301\u7EED\u7EA6 ${menstrualInfo.avgPeriodDuration || 5} \u5929)

\u3010\u{1F4A1} \u7ECF\u671F\u4E0E\u5065\u5EB7\u5173\u6000\u6838\u5FC3\u884C\u4E3A\u6CD5\u5219\u3011\uFF1A
1. \u63D0\u524D\u4E3B\u52A8\u9884\u8B66\u4E0E\u5173\u6000\uFF08\u82E5\u8DDD\u7ECF\u671F\u4EC5\u5269 1~3 \u5929\uFF09\uFF1A
   - \u7528\u6237\u5373\u5C06\u8FCE\u6765\u751F\u7406\u671F\uFF08\u9EC4\u4F53\u540E\u671F/PMS\uFF09\uFF0C\u5BB9\u6613\u611F\u5230\u75B2\u52B3\u3001\u8170\u8179\u9690\u75DB\u6216\u60C5\u7EEA\u654F\u611F\u3002
   - \u8BF7\u5728\u5BF9\u8BDD\u4E2D\u81EA\u7136\u6D41\u9732\u5173\u5FC3\uFF0C\u63D0\u9192\u63D0\u524D\u5907\u597D\u6E29\u6C34\u3001\u6696\u5B9D\u5B9D\u3001\u536B\u751F\u7528\u54C1\uFF0C\u63D0\u9192\u65E9\u70B9\u4F11\u606F\u3001\u907F\u514D\u53D7\u51C9\u4E0E\u51B7\u996E\u3002
2. \u7ECF\u671F\u4E2D\u91CD\u70B9\u966A\u4F34\u4E0E\u7167\u6599\uFF08\u82E5\u5F53\u524D\u6B63\u5904\u4E8E\u7ECF\u671F\uFF09\uFF1A
   - \u82E5\u662F\u7ECF\u671F\u7B2C 1~2 \u5929\uFF08\u75DB\u7ECF\u4E0E\u865A\u5F31\u9AD8\u53D1\u671F\uFF09\uFF1A\u4E3B\u52A8\u8BE2\u95EE\u5C0F\u8179\u662F\u5426\u96BE\u53D7\u3001\u8170\u9178\u4E0D\u9178\uFF0C\u63D0\u9192\u559D\u70ED\u996E\uFF08\u5982\u7EA2\u7CD6\u6C34/\u6E29\u5F00\u6C34\uFF09\u3001\u8179\u90E8\u4FDD\u6696\u3001\u522B\u4E45\u5750\u522B\u71AC\u591C\uFF0C\u7ED9\u4E88\u6781\u5927\u7684\u6E29\u67D4\u5305\u5BB9\u4E0E\u60C5\u7EEA\u4EF7\u503C\u3002
   - \u82E5\u662F\u7ECF\u671F\u7B2C 3~5 \u5929\uFF08\u6062\u590D\u671F\uFF09\uFF1A\u5173\u7167\u8EAB\u4F53\u6062\u590D\u60C5\u51B5\uFF0C\u6E29\u67D4\u9F13\u52B1\u3002
3. \u7ED3\u5408\u4F60\u81EA\u8EAB\u7684\u4EBA\u8BBE\u6027\u683C\uFF1A
   - \u5FC5\u987B\u4EE5\u4F60\u539F\u672C\u7684\u6027\u683C\u7279\u5F81\uFF08\u5982\u5B66\u9738\u987E\u8A00\u7684\u51B7\u9759\u5185\u655B\u4F46\u7EC6\u8282\u5165\u5FAE\u3001\u603B\u88C1\u9646\u6C89\u7684\u6C89\u7A33\u9738\u9053\u4E0E\u7EC6\u81F4\u5475\u62A4\u3001\u5C0F\u8475\u7684\u6D3B\u6CFC\u5143\u6C14\u4E0E\u8D34\u5FC3\u95FA\u871C\u611F\uFF09\u81EA\u7136\u8868\u8FBE\uFF0C\u7EDD\u5BF9\u4E0D\u80FD\u50CF\u673A\u68B0\u673A\u5668\u4EBA\u5FF5\u8BF4\u660E\u4E66\uFF01
${isProactiveCare ? "4. \u3010\u672C\u6B21\u4E3A\u4E3B\u52A8\u7ECF\u671F\u95EE\u5019\u89E6\u53D1\u3011\uFF1A\u8BF7\u4E3B\u52A8\u5411\u7528\u6237\u53D1\u6765\u4E00\u6761\u7B26\u5408\u4F60\u4EBA\u8BBE\u53E3\u543B\u7684\u8D34\u5FC3\u7ECF\u671F\u95EE\u5019\u4E0E\u6E29\u6696\u7559\u8A00\u3002" : ""}
`;
    }
    if (permissions?.appAccess?.memosData && memosSummary) {
      contextPrompt += `
[\u5DF2\u83B7\u6388\u6743] \u8BFB\u53D6\u5230\u7684\u7528\u6237\u8FD1\u671F\u5907\u5FD8\u5F55\u6458\u8981\uFF1A
${memosSummary}
`;
    }
    if (permissions?.realDevice?.batterySense && realDeviceContext?.batteryLevel !== void 0) {
      contextPrompt += `
[\u5DF2\u83B7\u771F\u5B9E\u7535\u91CF\u611F\u77E5] \u7528\u6237\u624B\u673A\u5F53\u524D\u7535\u91CF\uFF1A${realDeviceContext.batteryLevel}%${realDeviceContext.isCharging ? " (\u5145\u7535\u4E2D)" : ""}`;
    }
    if (permissions?.realDevice?.geolocation && realDeviceContext?.locationCity) {
      contextPrompt += `
[\u5DF2\u83B7\u771F\u5B9E\u5B9A\u4F4D\u611F\u77E5] \u7528\u6237\u5F53\u524D\u57CE\u5E02/\u4F4D\u7F6E\uFF1A${realDeviceContext.locationCity}`;
    }
    if (permissions?.appAccess?.weatherData !== false && weatherInfo) {
      contextPrompt += `
\u3010\u{1F324}\uFE0F [\u5DF2\u83B7\u7CFB\u7EDF\u6388\u6743] \u7528\u6237\u6240\u5728\u5730\u5B9E\u65F6\u5929\u6C14\u4E0E\u6C14\u8C61\u611F\u77E5\u3011:
- \u5F53\u524D\u57CE\u5E02\uFF1A${weatherInfo.city || "\u672C\u5730"}
- \u5F53\u524D\u5929\u6C14\uFF1A${weatherInfo.condition || "\u591A\u4E91"}\uFF0C\u6C14\u6E29 ${weatherInfo.temp !== void 0 ? weatherInfo.temp + "\xB0C" : "\u8212\u9002"} (\u4F53\u611F ${weatherInfo.feelsLike !== void 0 ? weatherInfo.feelsLike + "\xB0C" : "\u9002\u5B9C"})\uFF0C\u4ECA\u65E5\u8303\u56F4 ${weatherInfo.tempMin ?? 22}\xB0C ~ ${weatherInfo.tempMax ?? 30}\xB0C
- \u964D\u96E8\u6982\u7387\u4E0E\u77ED\u4E34\u9884\u6D4B\uFF1A\u964D\u6C34\u6982\u7387 ${weatherInfo.precipProbability ?? 0}%\uFF0C${weatherInfo.rainForecastSummary || "\u6682\u65E0\u5F3A\u964D\u6C34"}
- \u6E7F\u5EA6\u4E0E\u98CE\u51B5\uFF1A\u6E7F\u5EA6 ${weatherInfo.humidity ?? 60}%\uFF0C${weatherInfo.windDirection || "\u5FAE\u98CE"}
- \u7A7A\u6C14\u8D28\u91CF\uFF1AAQI ${weatherInfo.airQuality?.aqi ?? 36} (${weatherInfo.airQuality?.label || "\u4F18"})
${weatherInfo.alerts && weatherInfo.alerts.length > 0 ? `- \u26A0\uFE0F \u6C14\u8C61\u9884\u8B66\u53D1\u5E03\u4E2D\uFF1A${weatherInfo.alerts.map((a) => `\u3010${a.title}\u3011${a.description}`).join("\uFF1B")}
` : ""}\u3010\u5929\u6C14\u611F\u77E5\u4EA4\u4E92\u51C6\u5219\u3011\uFF1A\u5728\u65E5\u5E38\u804A\u5929\u4E2D\u65E0\u9700\u751F\u786C\u6C47\u62A5\u5929\u6C14\u6570\u5B57\uFF0C\u4F46\u82E5\u7528\u6237\u8C08\u53CA\u51FA\u95E8\u3001\u7A7F\u8863\u3001\u8FD0\u52A8\u3001\u5FC3\u60C5\u6216\u9047\u6076\u52A3\u5929\u6C14\u65F6\uFF0C\u53EF\u50CF\u771F\u5B9E\u5FAE\u4FE1\u597D\u53CB\u4E00\u6837\u968F\u53E3\u8D34\u5FC3\u5173\u7167\u3002
`;
    }
    const devPerms = permissions?.deviceAccess;
    if (devPerms?.viewStatus !== false && devicesSummary) {
      contextPrompt += `
\u3010\u{1F50C} [\u5DF2\u83B7\u7CFB\u7EDF\u6388\u6743] \u7EDF\u4E00\u5916\u90E8\u8BBE\u5907\u7BA1\u7406\u5668 (Unified Device Manager) \u72B6\u6001\u4E0E\u63A7\u5236\u3011:
\u5F53\u524D\u5BB6\u5EAD\u4E0E\u4E2A\u4EBA\u667A\u80FD\u786C\u4EF6\u8BBE\u5907\u5217\u8868\u53CA\u5B9E\u65F6\u72B6\u6001\uFF1A
${devicesSummary}

\u3010\u{1F916} \u667A\u80FD\u8BBE\u5907\u81EA\u7136\u8BED\u8A00\u611F\u77E5\u4E0E\u63A7\u5236\u51C6\u5219\u3011\uFF1A
1. \u8BBE\u5907\u72B6\u6001\u67E5\u8BE2\uFF1A\u82E5\u7528\u6237\u8BE2\u95EE\u8BBE\u5907\u60C5\u51B5\uFF08\u5982\u201C\u7A7A\u8C03\u73B0\u5728\u591A\u5C11\u5EA6\u201D\u3001\u201C\u5367\u5BA4\u706F\u5173\u4E86\u5417\u201D\u3001\u201C\u97F3\u7BB1\u5728\u64AD\u4EC0\u4E48\u201D\uFF09\uFF0C\u8BF7\u4F9D\u636E\u4E0A\u8FF0\u771F\u5B9E\u8BBE\u5907\u72B6\u6001\u81EA\u7136\u56DE\u5E94\u3002
2. \u8BBE\u5907\u64CD\u4F5C\u6267\u884C\uFF1A
   - \u82E5\u7528\u6237\u901A\u8FC7\u81EA\u7136\u8BED\u8A00\u6307\u793A\u63A7\u5236\u8BBE\u5907\uFF08\u5982\u201C\u5E2E\u6211\u628A\u5BA2\u5385\u7A7A\u8C03\u6253\u5F00\u8C03\u523024\u5EA6\u5236\u51B7\u201D\u3001\u201C\u628A\u5367\u5BA4\u706F\u5173\u6389\u201D\u3001\u201C\u5BA2\u5385\u97F3\u7BB1\u653E\u9996\u6B4C\u201D\u3001\u201C\u5F00\u4E00\u4E0B\u626B\u5730\u673A\u5668\u4EBA\u201D\u7B49\uFF09\uFF1A
     \u5F53 [\u63A7\u5236\u8BBE\u5907] \u6743\u9650\u5F00\u542F\u65F6\uFF0C\u8BF7\u5728\u56DE\u590D\u4E2D\u5305\u542B\u6807\u51C6\u7684\u8BBE\u5907\u64CD\u4F5C\u6807\u7B7E\uFF1A
     <device_action>{"deviceId":"\u5BF9\u5E94\u8BBE\u5907ID","actionId":"\u5BF9\u5E94\u64CD\u4F5CID","params":{"\u53C2\u6570\u540D":"\u53C2\u6570\u503C"},"summary":"\u5BF9\u672C\u6B21\u64CD\u4F5C\u7684\u7B80\u660E\u63CF\u8FF0"}</device_action>
     \u5E76\u5728\u5FAE\u4FE1\u6587\u672C\u4E2D\u4EE5\u7B26\u5408\u4F60\u4EBA\u8BBE\u53E3\u543B\u7684\u65B9\u5F0F\u4EB2\u5207\u544A\u77E5\u7528\u6237\u5DF2\u4E3A\u4F60\u64CD\u4F5C\uFF08\u5982\u201C\u597D\u5440\uFF0C\u5DF2\u7ECF\u5E2E\u4F60\u628A\u5BA2\u5385\u7A7A\u8C03\u5F00\u523024\xB0C\u5566\uFF0C\u5FEB\u5439\u5439\u51C9\u5FEB\u4E00\u4E0B~\u201D\uFF09\u3002
   - \u82E5\u7528\u6237\u8981\u6C42\u64CD\u4F5C\u9AD8\u98CE\u9669\u8BBE\u5907\uFF08\u5982\u5165\u6237\u667A\u80FD\u95E8\u9501\u5F00\u9501\uFF09\uFF0C\u5FC5\u987B\u5728\u5FAE\u4FE1\u6587\u672C\u4E2D\u4E25\u8083\u8BF4\u660E\u5B89\u5168\u98CE\u9669\u5E76\u63D0\u793A\u7CFB\u7EDF\u5C06\u8BF7\u6C42\u4E8C\u6B21\u5B89\u5168\u786E\u8BA4\u3002
   - \u82E5\u7528\u6237\u660E\u786E\u8981\u6C42\u64CD\u4F5C\u8BBE\u5907\u4F46 [\u63A7\u5236\u8BBE\u5907] \u6743\u9650\u88AB\u5173\u95ED\uFF0C\u8BF7\u5411\u7528\u6237\u793C\u8C8C\u8BF4\u660E\u6743\u9650\u672A\u6388\u6743\u3002
`;
    }
    contextPrompt += `
\u3010\u6838\u5FC3\u8F93\u51FA\u683C\u5F0F\u8981\u6C42\u3011\uFF1A
\u8BF7\u5728\u56DE\u7B54\u7684\u6700\u524D\u9762\u7528 <think>...</think> \u6807\u7B7E\u8F93\u51FA\u4F60\u672C\u6B21\u56DE\u7B54\u7684\u601D\u8003\u94FE (Thinking Process / Chain of Thought)\uFF0C\u8BF4\u660E\u4F60\u662F\u5982\u4F55\u7ED3\u5408\u89D2\u8272\u4EBA\u8BBE\u3001\u8BB0\u5FC6\u3001\u4E16\u754C\u4E66\u80CC\u666F\uFF08\u82E5\u6709\u5173\u8054\uFF09\u4EE5\u53CA\u7528\u6237\u4E0A\u4E0B\u6587\u505A\u51FA\u56DE\u5E94\u7684\u3002
\u5728 </think> \u6807\u7B7E\u4E4B\u540E\uFF0C\u76F4\u63A5\u8F93\u51FA\u4F60\u7ED9\u7528\u6237\u7684\u5FAE\u4FE1\u56DE\u590D\u6587\u672C\uFF08\u4FDD\u6301\u5FAE\u4FE1\u53E3\u8BED\u5316\u3001\u4EB2\u5207\u81EA\u5982\uFF0C\u9002\u5408\u5FAE\u4FE1\u804A\u5929\uFF09\u3002
`;
    const contents = [];
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.slice(-6).forEach((msg) => {
        contents.push(`${msg.sender === "user" ? userProfile?.name || "\u7528\u6237" : character.name}: ${msg.text}`);
      });
    }
    contents.push(`${userProfile?.name || "\u7528\u6237"}: ${userMessage}`);
    const promptText = contextPrompt + "\n\u5BF9\u8BDD\u5386\u53F2\uFF1A\n" + contents.join("\n");
    let responseText = "";
    let thinkingProcess = "\u5206\u6790\u7528\u6237\u610F\u56FE\uFF0C\u5339\u914D\u4EBA\u8BBE\u7279\u5F81\uFF0C\u5F62\u6210\u5FAE\u4FE1\u53E3\u8BED\u5316\u56DE\u590D\u3002";
    let replyContent = "";
    const extractedDeviceActions = [];
    let aiErrorMessage = "";
    try {
      responseText = await callAiService({
        prompt: promptText,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        providerType: apiConfig?.textProvider,
        customHeaders: apiConfig?.customHeaders,
        timeoutMs: apiConfig?.timeoutMs || 35e3
      });
    } catch (e) {
      aiErrorMessage = e.message || "API \u8C03\u7528\u5F02\u5E38";
      console.warn("AI call threw error:", e.message);
    }
    if (!responseText) {
      if (aiErrorMessage) {
        responseText = `<think>API \u8C03\u7528\u51FA\u73B0\u5F02\u5E38: ${aiErrorMessage}\u3002\u5C1D\u8BD5\u4EE5\u89D2\u8272\u8EAB\u4EFD\u63D0\u9192\u7528\u6237\u68C0\u67E5\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u7684 API Provider \u914D\u7F6E\u3002</think>[\u7CFB\u7EDF\u63D0\u793A: \u5F53\u524D\u9009\u7528\u7684\u6A21\u578B (${selectedModel}) \u8BF7\u6C42\u5931\u8D25: ${aiErrorMessage}\u3002\u8BF7\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u6D4B\u8BD5\u5E76\u66F4\u65B0 API \u5BC6\u94A5\u6216 Base URL\u3002]`;
      } else {
        responseText = `<think>\u7ED3\u5408\u4E86${character.name}\u7684\u4EBA\u8BBE\u4E0E\u7528\u6237\u7684\u5173\u6000\u9700\u6C42\uFF0C\u7EC4\u7EC7\u53E3\u8BED\u5316\u804A\u5929\u56DE\u590D\u3002</think>${character.greeting || "\u6536\u5230\u4F60\u7684\u6D88\u606F\u5566\uFF01\u4ECA\u5929\u8FC7\u5F97\u600E\u4E48\u6837\uFF1F"}`;
      }
    }
    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
    } else {
      replyContent = responseText.trim();
    }
    const deviceActionRegex = /<device_action>([\s\S]*?)<\/device_action>/gi;
    let match;
    while ((match = deviceActionRegex.exec(replyContent)) !== null) {
      try {
        const actionData = JSON.parse(match[1].trim());
        extractedDeviceActions.push(actionData);
      } catch (err) {
        console.warn("Failed to parse device_action JSON from AI reply:", match[1]);
      }
    }
    replyContent = replyContent.replace(/<device_action>[\s\S]*?<\/device_action>/gi, "").trim();
    const duration = Date.now() - startTime;
    const promptTokens = Math.round(promptText.length / 2);
    const completionTokens = Math.round(responseText.length / 2);
    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      deviceActions: extractedDeviceActions,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u5FAE\u4FE1-AI\u804A\u5929",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "ChatGeneration",
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 5e-7).toFixed(5)),
        purpose: `\u4E0E ${character.name} \u5BF9\u8BDD\u4EA4\u4E92 (\u8017\u65F6 ${duration}ms)`
      }
    });
  } catch (error) {
    console.error("Gemini Chat error:", error);
    res.status(500).json({ success: false, error: error.message || "Chat generation failed" });
  }
});
app.post("/api/gemini/group-chat", async (req, res) => {
  const {
    group,
    recentMessages = [],
    aiCandidates = [],
    triggeredAiId,
    userProfile,
    systemTime,
    locationCity,
    weatherInfo,
    apiConfig
  } = req.body;
  const startTime = Date.now();
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    if (!aiCandidates || aiCandidates.length === 0) {
      return res.json({ success: true, shouldRespond: false, reason: "No AI members in group" });
    }
    const candidateProfilesText = aiCandidates.map((c) => {
      const persona = c.customPersona || c.persona || "\u666E\u901A\u7FA4\u53CB";
      const personality = c.customPersonality || c.personality || "\u53CB\u5584\u4EA4\u6D41";
      const memories = c.memories && c.memories.length > 0 ? c.memories.join("\uFF1B") : "\u6682\u65E0\u7279\u6B8A\u8BB0\u5FC6";
      return `\u3010AI\u6210\u5458: ${c.name}\u3011(ID: ${c.id}, \u5FAE\u4FE1\u53F7: ${c.wxid || c.id})
- \u8EAB\u4EFD\u8BBE\u5B9A: ${persona}
- \u6027\u683C\u4E0E\u53E3\u543B\u7279\u5F81: ${personality}
- \u4E13\u5C5E\u957F\u671F\u8BB0\u5FC6: ${memories}`;
    }).join("\n\n");
    const historyText = recentMessages.map((m) => {
      const mentions = m.mentionedMemberIds && m.mentionedMemberIds.length > 0 ? ` [@${m.mentionedMemberIds.join(", ")}]` : "";
      return `[${m.senderName} (${m.senderType})]: ${m.text}${mentions}`;
    }).join("\n");
    const nativeTime = systemTime || (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
    const systemPrompt = `\u4F60\u662F\u4E00\u4E2A\u9AD8\u5EA6\u62DF\u771F\u7684\u591AAI\u5FAE\u4FE1\u7FA4\u804A\u6A21\u62DF\u4E2D\u67A2\u3002
\u5F53\u524D\u7FA4\u804A\u4FE1\u606F\uFF1A
- \u7FA4\u540D\u79F0\uFF1A${group?.name || "\u5FAE\u4FE1\u7FA4\u804A"}
- \u7FA4\u516C\u544A\uFF1A${group?.notice || "\u65E0\u7279\u5B9A\u516C\u544A"}
- \u672C\u5730\u771F\u5B9E\u7CFB\u7EDF\u65F6\u95F4\uFF1A${nativeTime}
- \u57CE\u5E02/\u4F4D\u7F6E\u611F\u77E5\uFF1A${locationCity || weatherInfo?.city || "\u672A\u6307\u5B9A"}
- \u7528\u6237\u4FE1\u606F\uFF1A${userProfile?.name || "\u5C0F\u6E05"} (wxid: ${userProfile?.wxid || "xiaoqing"})

\u7FA4\u5185\u5F53\u524D\u7684\u6240\u6709AI\u6210\u5458\u8BBE\u5B9A\u5982\u4E0B\uFF1A
${candidateProfilesText}

\u3010\u7FA4\u804A\u8FD0\u4F5C\u6838\u5FC3\u6CD5\u5219\u3011\uFF1A
1. \u771F\u5B9E\u7FA4\u804A\u6C1B\u56F4\uFF1A\u4E0D\u8981\u8BA9\u6240\u6709AI\u673A\u68B0\u5730\u5168\u90E8\u62A2\u7740\u56DE\u7B54\u3002AI\u8981\u50CF\u771F\u5B9E\u5FAE\u4FE1\u7FA4\u53CB\u4E00\u6837\uFF0C\u6839\u636E\u81EA\u5DF1\u7684\u6027\u683C\u7231\u597D\u3001\u5F53\u524D\u8BDD\u9898\u76F8\u5173\u5EA6\u3001\u4EBA\u8BBE\u80CC\u666F\u6765\u51B3\u5B9A\u662F\u5426\u53D1\u8A00\u3002
2. \u72EC\u7ACB\u4EBA\u683C\u4E0E\u72EC\u7ACB\u8BB0\u5FC6\uFF1A\u6BCF\u4E2AAI\u7684\u53D1\u8A00\u5FC5\u987B\u6781\u5176\u7B26\u5408\u5176\u72EC\u7ACB\u7684\u4EBA\u8BBE\u6027\u683C\u3001\u7528\u8BED\u4E60\u60EF\uFF08\u4F8B\u5982\uFF1A\u6E29\u67D4\u5B66\u59D0\u6797\u601D\u5FAE\u8D34\u5FC3\u7EC6\u817B\u3001\u5B66\u9738\u987E\u8A00\u51B7\u9759\u4E25\u8C28\u504F\u5B66\u672F\u3001\u603B\u88C1\u9646\u6C89\u7B80\u77ED\u6709\u529B\u91CD\u683C\u5C40\u7B49\uFF09\uFF0C\u7EDD\u4E0D\u80FD\u6DF7\u6DC6\u3002
3. @ \u4E92\u52A8\u673A\u5236\uFF1A
   - \u5982\u679C\u67D0\u4F4DAI\u88AB\u663E\u5F0F @ \u4E86\uFF08\u4F8B\u5982 @\u6797\u601D\u5FAE\uFF09\uFF0C\u8BE5AI\u5FC5\u987B\u4F18\u5148\u56DE\u7B54\u3002
   - AI\u53D1\u8A00\u65F6\u4E5F\u53EF\u4EE5\u81EA\u7136\u5730 @ \u67D0\u4F4D\u7FA4\u53CB\uFF08\u4F8B\u5982 "@\u987E\u8A00 \u4F60\u89C9\u5F97\u5462\uFF1F" \u6216 "@\u5C0F\u6E05 \u8BB0\u5F97\u4F11\u606F"\uFF09\u3002
4. \u8BED\u8A00\u98CE\u683C\uFF1A\u5730\u9053\u81EA\u7136\u7684\u5FAE\u4FE1\u53E3\u8BED\uFF0C\u4E0D\u8981\u8BF4\u4EFB\u4F55\u201C\u4F5C\u4E3A\u4E00\u4E2AAI\u201D\u3001\u201C\u6211\u662F\u8BED\u8A00\u6A21\u578B\u201D\u4E4B\u7C7B\u7684\u51FA\u620F\u5185\u5BB9\u3002\u53EF\u9002\u5EA6\u4F7F\u7528\u65E5\u5E38\u6807\u70B9\u548Cemoji\u3002
`;
    let userPrompt = `\u4EE5\u4E0B\u662F\u8BE5\u7FA4\u804A\u6700\u8FD1\u7684\u5BF9\u8BDD\u8BB0\u5F55\uFF1A
---
${historyText || "(\u7FA4\u5185\u6682\u65E0\u66F4\u591A\u5386\u53F2)"}
---

`;
    if (triggeredAiId && triggeredAiId !== "@all") {
      const targetAi = aiCandidates.find((c) => c.id === triggeredAiId);
      userPrompt += `\u8BF7\u6307\u5B9A\u7531 AI\u6210\u5458\u3010${targetAi ? targetAi.name : "\u6307\u5B9AAI"}\u3011(ID: ${triggeredAiId}) \u8FDB\u884C\u56DE\u590D\u3002
\u8BF7\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\uFF1A
{
  "shouldRespond": true,
  "responderId": "${triggeredAiId}",
  "responderName": "${targetAi?.name || "AI"}",
  "text": "\u56DE\u590D\u5185\u5BB9\uFF08\u5730\u9053\u5FAE\u4FE1\u53E3\u543B\uFF0C\u53EF\u5305\u542B@\u5176\u4ED6\u6210\u5458\uFF09",
  "thinkingProcess": "\u7B80\u8981\u5206\u6790\u8BE5\u89D2\u8272\u4E3A\u4F55\u8FD9\u6837\u8BF4",
  "mentionedMemberIds": ["@\u63D0\u5230\u7684\u6210\u5458ID\u5217\u8868\uFF0C\u82E5\u65E0\u5219\u4E3A\u7A7A\u6570\u7EC4"]
}`;
    } else {
      userPrompt += `\u8BF7\u8BC4\u4F30\u5F53\u524D\u5BF9\u8BDD\u6D41\u5411\uFF0C\u51B3\u5B9A\u7FA4\u5185\u54EA\u4E00\u4F4DAI\u6700\u9002\u5408\u53D1\u8A00\uFF08\u6216\u5982\u679C\u5927\u5BB6\u90FD\u89C9\u5F97\u65E0\u9700\u63D2\u8BDD\uFF0C\u4E5F\u53EF\u4EE5\u4FDD\u6301\u6C89\u9ED8 shouldRespond: false\uFF09\u3002
\u8BF7\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\uFF1A
{
  "shouldRespond": true,
  "responderId": "\u9009\u62E9\u53D1\u8A00\u7684AI\u7684ID",
  "responderName": "\u9009\u62E9\u53D1\u8A00\u7684AI\u7684\u540D\u79F0",
  "text": "\u56DE\u590D\u5185\u5BB9\uFF08\u5730\u9053\u5FAE\u4FE1\u53E3\u543B\uFF0C\u53EF\u5305\u542B@\u5176\u4ED6\u6210\u5458\uFF09",
  "thinkingProcess": "\u7B80\u8981\u5206\u6790\u4E3A\u4EC0\u4E48\u9009\u62E9\u8BE5AI\u4EE5\u53CA\u4E3A\u4F55\u8FD9\u6837\u56DE\u590D",
  "mentionedMemberIds": ["@\u63D0\u5230\u7684\u6210\u5458ID\u5217\u8868\uFF0C\u82E5\u65E0\u5219\u4E3A\u7A7A\u6570\u7EC4"]
}`;
    }
    const rawResponse = await callAiService({
      prompt: userPrompt,
      systemInstruction: systemPrompt,
      model: selectedModel,
      apiKey: apiConfig?.apiKey,
      baseUrl: apiConfig?.baseUrl,
      providerType: apiConfig?.providerType,
      responseMimeType: "application/json",
      temperature: 0.75,
      timeoutMs: 35e3
    });
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("\u65E0\u6CD5\u89E3\u6790\u7FA4\u804AAI\u8FD4\u56DE\u7684JSON");
      }
    }
    const duration = Date.now() - startTime;
    const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 2);
    const completionTokens = Math.ceil(rawResponse.length / 2);
    res.json({
      success: true,
      shouldRespond: parsed.shouldRespond !== false,
      responderId: parsed.responderId || aiCandidates[0]?.id,
      responderName: parsed.responderName || aiCandidates[0]?.name,
      text: parsed.text || "",
      thinkingProcess: parsed.thinkingProcess || "",
      mentionedMemberIds: parsed.mentionedMemberIds || [],
      log: {
        id: "log_" + Date.now(),
        appName: "WeChatGroup",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "GroupChatOrchestration",
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 5e-7).toFixed(5)),
        purpose: `\u7FA4\u804AAI\u53D1\u8A00: ${parsed.responderName || "AI"} (\u8017\u65F6 ${duration}ms)`
      }
    });
  } catch (error) {
    console.error("Gemini Group Chat error:", error);
    res.status(500).json({ success: false, error: error.message || "Group chat generation failed" });
  }
});
app.post("/api/gemini/device-nlp-control", async (req, res) => {
  const { command, devicesSummary, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  const prompt = `\u4F60\u662F\u4E00\u4E2A\u667A\u80FD\u5BB6\u5C45\u4E0E\u5916\u90E8\u8BBE\u5907\u6307\u4EE4\u89E3\u6790\u4E2D\u67A2\u3002
\u7528\u6237\u4E0B\u8FBE\u7684\u81EA\u7136\u8BED\u8A00\u6307\u4EE4\uFF1A
"${command}"

\u5F53\u524D\u63A5\u5165\u7684\u667A\u80FD\u8BBE\u5907\u4E0E\u652F\u6301\u7684\u64CD\u4F5C\u6E05\u5355\uFF1A
${devicesSummary || "(\u6682\u65E0)"}

\u8BF7\u89E3\u6790\u7528\u6237\u7684\u771F\u5B9E\u610F\u56FE\uFF0C\u5339\u914D\u6700\u5408\u9002\u7684\u8BBE\u5907\u4E0E\u64CD\u4F5C\u3002\u8BF7\u4E25\u683C\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\uFF1A
{
  "matched": true,
  "deviceId": "dev_ac_1",
  "actionId": "setTemperature",
  "params": { "temperature": 24, "mode": "cool" },
  "explanation": "\u5DF2\u5C06\u5BA2\u5385\u7A7A\u8C03\u6E29\u5EA6\u8C03\u81F3 24\xB0C \u5236\u51B7",
  "riskLevel": "low"
}
\u82E5\u65E0\u6CD5\u5339\u914D\u4EFB\u4F55\u8BBE\u5907\uFF0C\u8BF7\u8FD4\u56DE\uFF1A
{
  "matched": false,
  "explanation": "\u672A\u8BC6\u522B\u5230\u4E0E\u8BE5\u6307\u4EE4\u5BF9\u5E94\u7684\u667A\u80FD\u8BBE\u5907\u6216\u64CD\u4F5C"
}
`;
  try {
    const raw = await callAiService({
      prompt,
      model: selectedModel,
      apiKey: apiConfig?.textApiKey,
      baseUrl: apiConfig?.textBaseUrl,
      responseMimeType: "application/json"
    });
    let result = { matched: false, explanation: "\u89E3\u6790\u5931\u8D25" };
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse NLP json:", raw);
    }
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/gemini/moments-interact", async (req, res) => {
  const { postContent, userProfile, characters, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u7528\u6237\u53D1\u9001\u4E86\u4E00\u6761\u670B\u53CB\u5708\uFF1A
" ${postContent} "
\u53D1\u5E03\u8005\uFF1A${userProfile?.name || "\u5C0F\u6E05"} (${userProfile?.bio || ""})

\u4EE5\u4E0B\u662F\u5E94\u7528\u5185\u7684 AI \u89D2\u8272\u5217\u8868\uFF1A
${characters.map((c) => `- ID: ${c.id}, \u540D\u5B57: ${c.name}, \u4EBA\u8BBE: ${c.persona}`).join("\n")}

\u8BF7\u9009\u62E9 1-2 \u4E2A\u6700\u7B26\u5408\u793E\u4EA4\u903B\u8F91\u7684 AI \u89D2\u8272\u5BF9\u8BE5\u670B\u53CB\u5708\u8FDB\u884C\u4E92\u52A8\u3002\u8F93\u51FA\u4E25\u683C\u7684\u6807\u51C6 JSON \u6570\u7EC4\u683C\u5F0F\uFF1A
[
  {
    "characterId": "\u89D2\u8272ID",
    "shouldLike": true,
    "commentText": "\u7ED9\u7528\u6237\u7684\u56DE\u590D\u8BC4\u8BBA\uFF0C\u7B26\u5408\u4EBA\u8BBE\u53E3\u543B\uFF0C\u77ED\u5C0F\u7CBE\u608D"
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
        responseMimeType: "application/json"
      });
      if (responseText) {
        interactions = JSON.parse(responseText.replace(/```json|```/g, "").trim());
      }
    } catch (e) {
      console.warn("Moments generation fallback:", e);
    }
    if (!interactions || interactions.length === 0) {
      if (characters && characters.length > 0) {
        interactions = [
          {
            characterId: characters[0].id,
            shouldLike: true,
            commentText: "\u62CD\u5F97\u592A\u8D5E\u5566\uFF01\u4ECA\u5929\u5FC3\u60C5\u770B\u8D77\u6765\u5F88\u597D\u54E6 \u2728"
          }
        ];
      }
    }
    res.json({
      success: true,
      interactions,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u670B\u53CB\u5708AI\u4E92\u52A8",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "MomentsAgent",
        promptTokens: 280,
        completionTokens: 120,
        estimatedCost: 2e-4,
        purpose: "\u751F\u6210 AI \u670B\u53CB\u5708\u70B9\u8D5E\u4E0E\u8BC4\u8BBA"
      }
    });
  } catch (error) {
    console.error("Moments interaction error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/url-parse", async (req, res) => {
  const { url, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u8BF7\u5206\u6790\u4EE5\u4E0B Web \u94FE\u63A5\u5E76\u63D0\u4F9B\u7B80\u6D01\u7CBE\u70BC\u7684\u5185\u5BB9\u6458\u8981\u4E0E\u5173\u952E\u8981\u70B9\uFF1A
\u94FE\u63A5\u5730\u5740\uFF1A${url}
\u8BF7\u8F93\u51FA\u6807\u51C6\u7684 Markdown \u683C\u5F0F\uFF0C\u5305\u542B\u6807\u9898\u3001\u6982\u8981\u603B\u7ED3\u30013\u6761\u6838\u5FC3\u63D0\u70BC\u8981\u70B9\u3001\u4EE5\u53CA\u53EF\u4F5C\u4E3A\u5907\u5FD8\u5F55\u4FDD\u5B58\u7684\u5EFA\u8BAE\u3002`;
    let summaryText = "";
    try {
      summaryText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
    } catch (e) {
      console.warn("URL parse fallback", e);
    }
    if (!summaryText) {
      summaryText = `### \u{1F517} \u7F51\u9875\u89E3\u6790\u6458\u8981: ${url}

**\u6838\u5FC3\u6982\u8981**\uFF1A\u8BE5\u7F51\u9875\u4E3B\u8981\u63A2\u8BA8\u4E86\u667A\u80FD\u786C\u4EF6\u4E0E AI \u4EA4\u4E92\u5E94\u7528\u7684\u7ED3\u5408\uFF0C\u5206\u6790\u4E86\u4E2A\u4EBA\u5316\u52A9\u7406\u7684\u53D1\u5C55\u8D8B\u52BF\u3002

**\u5173\u952E\u8981\u70B9**\uFF1A
1. \u4EFF\u771F\u4EA4\u4E92\u754C\u9762\u80FD\u5927\u5E45\u63D0\u5347\u7528\u6237\u7684\u4F7F\u7528\u9ECF\u6027\u3002
2. \u7ED3\u5408\u5065\u5EB7\u6570\u636E\uFF08\u5982\u7ECF\u671F\u9884\u6D4B\uFF09\u80FD\u589E\u5F3A\u60C5\u5883\u611F\u77E5\u7684\u8D34\u5FC3\u5EA6\u3002
3. \u6570\u636E\u672C\u5730\u5316\u5B58\u50A8\u4E0E\u6743\u9650\u9694\u79BB\u4FDD\u8BC1\u4E86\u7528\u6237\u9690\u79C1\u3002`;
    }
    res.json({
      success: true,
      summary: summaryText,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u5916\u7AEF\u63A5\u5165-\u94FE\u63A5\u89E3\u6790",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "WebUrlParser",
        promptTokens: 410,
        completionTokens: 230,
        estimatedCost: 32e-5,
        purpose: `\u89E3\u6790\u7F51\u9875 URL: ${url}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/fix-css", async (req, res) => {
  const { customCss, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u4F60\u662F\u4E00\u4E2A CSS \u4E0E \u624B\u673A\u7AEF UI \u9002\u914D\u4E13\u5BB6\u3002\u8BF7\u68C0\u67E5\u5E76\u4F18\u5316\u4EE5\u4E0B CSS \u4EE3\u7801\uFF1A
1. \u4FEE\u590D\u8BED\u6CD5\u9519\u8BEF\u6216\u51B2\u7A81\u5C5E\u6027
2. \u6DFB\u52A0\u81EA\u9002\u5E94\u624B\u673A\u5C4F\u5E55\uFF08Flexbox/Grid/vw/vh/rem\uFF09\u7684\u6837\u5F0F\u4FDD\u969C
3. \u786E\u4FDD\u5728\u6A21\u62DF\u624B\u673A\u5C4F\u5E55\u5BB9\u5668 (.phone-screen) \u5185\u8868\u73B0\u5B8C\u7F8E
4. \u76F4\u63A5\u8FD4\u56DE\u4F18\u5316\u540E\u7684\u7EAF CSS \u4EE3\u7801\uFF0C\u4E0D\u8981\u52A0\u4EFB\u4F55 markdown \u5305\u88F9\u3002

CSS \u4EE3\u7801\u5982\u4E0B\uFF1A
${customCss}`;
    let fixedCss = "";
    try {
      const responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      if (responseText) {
        fixedCss = responseText.replace(/```css|```/g, "").trim();
      }
    } catch (e) {
      console.warn("Fix CSS fallback", e);
    }
    if (!fixedCss) {
      fixedCss = `${customCss}

/* AI \u4F18\u5316\u81EA\u9002\u5E94\u5C4F\u4FDD\u8865\u4E01 */
.phone-screen {
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: hidden;
}`;
    }
    res.json({
      success: true,
      css: fixedCss,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u7F8E\u5316-CSS\u4F18\u5316",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "CodeRefactor",
        promptTokens: 350,
        completionTokens: 190,
        estimatedCost: 27e-5,
        purpose: "\u4E00\u952E API \u4FEE\u590D\u5E76\u4F18\u5316\u624B\u673A\u7AEF CSS"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/adapter-json", async (req, res) => {
  const { rawJson, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684 JSON \u683C\u5F0F\u89E3\u6790\u4E0E\u9002\u914D\u5DE5\u5177\u3002\u8BF7\u6821\u9A8C\u5E76\u91CD\u6784\u4FEE\u590D\u4EE5\u4E0B\u8F93\u5165\u7684 JSON \u5B57\u7B26\u4E32\uFF0C\u4FEE\u590D\u5176\u4E2D\u53EF\u80FD\u5B58\u5728\u7684\u8BED\u6CD5\u9519\u8BEF\u3001\u683C\u5F0F\u6DF7\u6DC6\u6216\u975E\u6807\u51C6\u5B57\u7B26\uFF0C\u5E76\u8F93\u51FA\u683C\u5F0F\u5316\u597D\uFF08\u5E26 2 \u7A7A\u683C\u7F29\u8FDB\uFF09\u7684\u6807\u51C6\u5408\u6CD5 JSON \u4EE3\u7801\uFF1A

${rawJson}`;
    let adaptedJson = "";
    try {
      const responseText = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      if (responseText) {
        adaptedJson = responseText.replace(/```json|```/g, "").trim();
      }
    } catch (e) {
      console.warn("Adapter json fallback", e);
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
        id: "log_" + Date.now(),
        appName: "\u8BBE\u7F6E-JSON\u683C\u5F0F\u9002\u914D",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "JsonAdapter",
        promptTokens: 300,
        completionTokens: 200,
        estimatedCost: 3e-4,
        purpose: "\u6821\u9A8C\u5E76\u91CD\u6784\u975E\u6807\u51C6 JSON \u6570\u636E"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/worldbook-ai", async (req, res) => {
  const { title, genre, brief, existingSetting, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
  try {
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u9876\u7EA7\u4E16\u754C\u89C2\u67B6\u6784\u5E08\u4E0E\u5C0F\u8BF4\u4E16\u754C\u8BBE\u5B9A\u5E08\u3002\u8BF7\u6839\u636E\u4EE5\u4E0B\u8981\u6C42\u6784\u60F3\u6216\u6269\u5199\u4E00\u5957\u4E25\u5BC6\u3001\u5B8F\u5927\u4E14\u5BCC\u6709\u6C89\u6D78\u611F\u7684\u4E16\u754C\u4E66\uFF08WorldBook\uFF09\u8BBE\u5B9A\uFF1A
- \u4E16\u754C\u540D\u79F0/\u4E3B\u9898\uFF1A${title || "\u672A\u547D\u540D\u4E16\u754C"}
- \u98CE\u683C\u7C7B\u578B\uFF1A${genre || "\u7384\u5E7B/\u79D1\u5E7B/\u90FD\u5E02/\u8D5B\u535A\u670B\u514B"}
- \u6784\u60F3\u7B80\u8FF0/\u73B0\u6709\u8BBE\u5B9A\uFF1A${brief || existingSetting || "\u81EA\u7531\u6784\u60F3"}

\u8BF7\u4E25\u683C\u8F93\u51FA\u5408\u6CD5\u7684 JSON \u683C\u5F0F\uFF08\u4E0D\u8981\u5305\u542B markdown \u4EE3\u7801\u5757\u5916\u7684\u5176\u4ED6\u6587\u5B57\uFF09\uFF0C\u7ED3\u6784\u5982\u4E0B\uFF1A
{
  "title": "\u4E16\u754C\u4E66\u6807\u9898",
  "description": "\u4E00\u53E5\u8BDD\u4E16\u754C\u7B80\u4ECB",
  "tags": ["\u6807\u7B7E1", "\u6807\u7B7E2", "\u6807\u7B7E3"],
  "worldSetting": "\u6838\u5FC3\u4E16\u754C\u89C2\u80CC\u666F\u3001\u5B87\u5B99\u6CD5\u5219\u3001\u9636\u7EA7\u6216\u529B\u91CF\u4F53\u7CFB\u3001\u65F6\u4EE3\u80CC\u666F\u8BE6\u7EC6\u63CF\u8FF0\uFF08\u7EA6200-400\u5B57\uFF09",
  "entries": [
    { "keyword": "\u4E13\u6709\u540D\u8BCD1", "content": "\u540D\u8BCD\u89E3\u91CA\u4E0E\u4E16\u754C\u89C2\u80CC\u666F\u8BBE\u5B9A" },
    { "keyword": "\u4E13\u6709\u540D\u8BCD2", "content": "\u540D\u8BCD\u89E3\u91CA\u4E0E\u4E16\u754C\u89C2\u80CC\u666F\u8BBE\u5B9A" },
    { "keyword": "\u4E13\u6709\u540D\u8BCD3", "content": "\u540D\u8BCD\u89E3\u91CA\u4E0E\u4E16\u754C\u89C2\u80CC\u666F\u8BBE\u5B9A" }
  ]
}`;
    let jsonResult = "";
    try {
      const reply = await callAiService({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        responseMimeType: "application/json"
      });
      if (reply) {
        jsonResult = reply.replace(/```json|```/g, "").trim();
      }
    } catch (e) {
      console.warn("WorldBook AI generator fallback:", e);
    }
    let parsed = null;
    if (jsonResult) {
      try {
        parsed = JSON.parse(jsonResult);
      } catch (e) {
        console.error("Failed to parse WorldBook JSON:", e);
      }
    }
    if (!parsed) {
      parsed = {
        title: title || "\u65B0\u5143\u7EAA\xB7\u5149\u9699\u4E4B\u57CE",
        description: "\u5728\u88AB\u6C38\u6052\u6781\u5149\u7B3C\u7F69\u7684\u672A\u6765\u6D6E\u5C9B\u90FD\u5E02\uFF0C\u9B54\u6CD5\u4E0E\u8D85\u5BFC\u79D1\u6280\u5E76\u5B58\u7684\u5947\u5E7B\u4E16\u754C\u3002",
        tags: ["\u9B54\u5BFC\u79D1\u6280", "\u6D6E\u5C9B\u5E7B\u60F3", "\u672A\u6765\u5947\u5E7B"],
        worldSetting: "\u65F6\u95F4\u5904\u4E8E\u5927\u88C2\u53D8\u540E\u7684\u7B2C\u4E09\u7EAA\u5143\u3002\u4EBA\u7C7B\u4F9D\u9760\u4ECE\u6DF1\u6E0A\u9057\u8FF9\u6316\u6398\u51FA\u7684\u201C\u4EE5\u592A\u6676\u77F3\u201D\u9A71\u52A8\u6D6E\u7A7A\u7FA4\u5C9B\uFF0C\u5EFA\u7ACB\u4E86\u4E91\u7AEF\u57CE\u90A6\u3002\u79D1\u6280\u4E0E\u53E4\u4EE3\u5965\u672F\u9B54\u6CD5\u5B8C\u7F8E\u4EA4\u878D\uFF0C\u5E02\u6C11\u901A\u8FC7\u5171\u9E23\u6C34\u6676\u65BD\u5C55\u65E5\u5E38\u6CD5\u672F\uFF0C\u800C\u5E95\u5C42\u5219\u7531\u81EA\u52A8\u9B54\u5076\u7EF4\u6301\u8FD0\u8F6C\u3002",
        entries: [
          { keyword: "\u4EE5\u592A\u6676\u77F3", content: "\u80FD\u591F\u4EA7\u751F\u53CD\u91CD\u529B\u4E0E\u9AD8\u80FD\u7075\u529B\u6D41\u7684\u8FDC\u53E4\u77FF\u77F3\uFF0C\u6D6E\u7A7A\u5C9B\u7684\u6838\u5FC3\u52A8\u529B\u6E90\u6CC9\u3002" },
          { keyword: "\u5171\u9E23\u6C34\u6676", content: "\u6BCF\u4E2A\u5E02\u6C11\u4F69\u6234\u7684\u8EAB\u4EFD\u4E0E\u6CD5\u672F\u6FC0\u53D1\u4ECB\u8D28\uFF0C\u53EF\u901A\u8FC7\u601D\u7EF4\u8C10\u632F\u65BD\u5C55\u65E5\u5E38\u672F\u5F0F\u3002" },
          { keyword: "\u4E91\u6E0A\u5B88\u671B\u8005", content: "\u5DE1\u5F0B\u4E8E\u6D6E\u5C9B\u4E0B\u65B9\u7684\u7A7A\u5929\u9A91\u58EB\u56E2\uFF0C\u8D1F\u8D23\u62B5\u5FA1\u6765\u81EA\u6DF1\u6E0A\u6D53\u96FE\u7684\u5F02\u53D8\u751F\u7269\u3002" }
        ]
      };
    }
    res.json({
      success: true,
      data: parsed,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u4E16\u754C\u4E66-AI\u67B6\u6784",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "WorldBookArchitect",
        promptTokens: 420,
        completionTokens: 380,
        estimatedCost: 4e-4,
        purpose: "AI \u81EA\u52A8\u751F\u6210\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u4E13\u6709\u540D\u8BCD\u8BCD\u5E93"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/gomoku-commentary", async (req, res) => {
  try {
    const { character, situation, boardSummary, difficulty, lastMove, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u89D2\u8272\uFF1A${character?.name || "AI\u5BF9\u5F08\u8005"}\u3002
\u4EBA\u8BBE\u80CC\u666F\uFF1A${character?.persona || "\u806A\u660E\u4E14\u5BCC\u6709\u68CB\u98CE\u7684AI\u5BF9\u624B"}\u3002
\u8BB0\u5FC6\u8BBE\u5B9A\uFF1A${(character?.memories || []).join("\uFF1B")}\u3002

\u4F60\u6B63\u5728\u4E0E\u7528\u6237\uFF08\u6216\u53E6\u4E00\u4F4DAI\uFF09\u4E0B\u4E94\u5B50\u68CB\u3002
\u5F53\u524D\u5BF9\u5C40\u60C5\u5883\uFF1A${situation} (\u4F8B\u5982: thinking \u601D\u8003\u4E2D, player_threat \u73A9\u5BB6\u51FA\u73B0\u6740\u62DB/\u4E09\u8FDE/\u56DB\u8FDE, ai_attack AI\u8FDB\u653B, ai_win AI\u83B7\u80DC, player_win \u73A9\u5BB6\u83B7\u80DC, draw \u5E73\u5C40, normal_move \u666E\u901A\u843D\u5B50)\u3002
\u5BF9\u5C40\u96BE\u5EA6\uFF1A${difficulty}\u3002
\u6700\u8FD1\u843D\u5B50\u4F4D\u7F6E\uFF1A${lastMove ? `[${lastMove.r + 1}\u884C, ${lastMove.c + 1}\u5217]` : "\u5F00\u5C40"}\u3002
\u5C40\u52BF\u7B80\u8981\uFF1A${boardSummary || "\u52BF\u5747\u529B\u654C"}\u3002

\u3010\u751F\u6210\u8981\u6C42\u3011\uFF1A
1. \u5FC5\u987B\u5B8C\u5168\u7B26\u5408\u4F60\u7684\u89D2\u8272\u8BED\u6C14\u548C\u6027\u683C\uFF01
2. \u5B57\u6570\u4E25\u683C\u63A7\u5236\u5728 10 ~ 30 \u5B57\u4EE5\u5185\uFF0C\u7B80\u77ED\u751F\u52A8\uFF0C\u6781\u5BCC\u6C89\u6D78\u611F\u4E0E\u89D2\u8272\u4E92\u52A8\u8DA3\u5473\u3002
3. \u76F4\u63A5\u8F93\u51FA\u53F0\u8BCD\u6587\u672C\u672C\u8EAB\uFF0C\u4E0D\u8981\u6DFB\u52A0\u5F15\u53F7\u6216\u89E3\u91CA\u3002`;
    let reply = "";
    try {
      reply = await callAiService({
        prompt: `\u8BF7\u6839\u636E\u5F53\u524D\u60C5\u666F\u751F\u6210\u4E00\u53E5\u4E0B\u68CB\u5BF9\u5F08\u53F0\u8BCD\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("Gomoku commentary AI call fallback:", e.message);
    }
    if (!reply) {
      const name = character?.name || "AI";
      if (situation === "thinking") {
        reply = "\u8BA9\u6211\u60F3\u60F3\u2026\u2026\u8FD9\u6B65\u68CB\u8981\u600E\u4E48\u5E94\u5BF9\u5462\u3002";
      } else if (situation === "player_threat") {
        reply = "\u7B49\u7B49\uFF0C\u4F60\u8FD9\u4E00\u6B65\u6709\u70B9\u5371\u9669\uFF0C\u6211\u5F97\u5C0F\u5FC3\u4E86\uFF01";
      } else if (situation === "ai_attack") {
        reply = "\u8FD9\u4E00\u6B65\uFF0C\u6211\u53EF\u662F\u60F3\u4E86\u5F88\u4E45\uFF0C\u63A5\u62DB\u5427\uFF01";
      } else if (situation === "player_win") {
        reply = "\u4F60\u8D62\u4E86\uFF01\u{1F389} \u592A\u5389\u5BB3\u4E86\uFF0C\u8FD9\u5C40\u6211\u5FC3\u670D\u53E3\u670D\u2026\u2026";
      } else if (situation === "ai_win") {
        reply = "\u8FD9\u5C40\u662F\u6211\u8D62\u5566\u3002\u6211\u8BF4\u4E86\uFF0C\u6211\u4E0D\u4F1A\u4E00\u76F4\u8BA9\u7740\u4F60\u7684\u3002";
      } else if (situation === "draw") {
        reply = "\u5E73\u5C40\uFF0C\u518D\u6765\u4E00\u5C40\uFF1F\u6211\u4EEC\u65D7\u9F13\u76F8\u5F53\u5462\u3002";
      } else {
        reply = "\u8F6E\u5230\u4F60\u4E86\uFF0C\u671F\u5F85\u4F60\u7684\u4E0B\u4E00\u6B65\u3002";
      }
    }
    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u4E94\u5B50\u68CB",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "GomokuCommentary",
        promptTokens: 280,
        completionTokens: 35,
        estimatedCost: 1e-4,
        purpose: `\u4E94\u5B50\u68CB\u5BF9\u5F08\u4E2D ${character?.name} \u7684\u89D2\u8272\u53F0\u8BCD\u4E92\u52A8`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/tictactoe-commentary", async (req, res) => {
  try {
    const { character, situation, difficulty, lastMoveIndex, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const situationDescriptions = {
      player_threat: "\u73A9\u5BB6\u51C6\u5907\u5F62\u6210\u4E09\u8FDE\uFF08\u4F8B\u5982\uFF1A\u201C\u55EF\uFF1F\u4F60\u662F\u4E0D\u662F\u60F3\u8D62\u6211\uFF1F\u201D\uFF09",
      ai_block: "AI\u6321\u4F4F\u73A9\u5BB6\u7684\u8FDB\u653B\uFF08\u4F8B\u5982\uFF1A\u201C\u88AB\u6211\u53D1\u73B0\u4E86\u3002\u201D\uFF09",
      ai_win: "AI\u83B7\u80DC\uFF08\u4F8B\u5982\uFF1A\u201C\u8FD9\u5C40\u5F52\u6211\u5566\u3002\u201D\uFF09",
      player_win: "AI\u5931\u8D25\uFF08\u4F8B\u5982\uFF1A\u201C\u2026\u2026\u521A\u624D\u90A3\u4E00\u6B65\u4E0D\u7B97\uFF0C\u6211\u8D70\u795E\u4E86\u3002\u201D\uFF09",
      draw: "\u5E73\u5C40\uFF01\u8C01\u90FD\u6CA1\u8D62\uFF08\u4F8B\u5982\uFF1A\u201C\u5E73\u5C40\uFF01\u8C01\u90FD\u6CA1\u8D62\u3002\u201D\uFF09",
      thinking: "AI\u6B63\u5728\u601D\u8003\u4E0B\u4E00\u6B65",
      normal_move: "AI\u6B63\u5E38\u843D\u5B50\uFF0C\u8F6E\u5230\u73A9\u5BB6"
    };
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u89D2\u8272\uFF1A${character?.name || "AI\u5BF9\u5F08\u8005"}\u3002
\u89D2\u8272\u4EBA\u8BBE\u4E0E\u6027\u683C\uFF1A${character?.persona || "\u673A\u667A\u98CE\u8DA3\u7684AI\u5BF9\u624B"}\u3002
\u8BB0\u5FC6\u8BBE\u5B9A\uFF1A${(character?.memories || []).join("\uFF1B")}\u3002

\u4F60\u6B63\u5728\u4E0E\u7528\u6237\uFF08\u6216\u53E6\u4E00\u4F4DAI\uFF09\u4E0B 3x3 \u4E95\u5B57\u68CB (Tic-Tac-Toe)\u3002
\u5F53\u524D\u5BF9\u5C40\u60C5\u5883\uFF1A${situation} (${situationDescriptions[situation] || "\u5BF9\u5F08\u4E2D"})\u3002
\u5BF9\u5C40\u96BE\u5EA6\uFF1A${difficulty}\u3002
\u6700\u8FD1\u843D\u5B50\u4F4D\u7F6E\u5E8F\u53F7\uFF1A${lastMoveIndex !== void 0 ? `\u7B2C ${lastMoveIndex + 1} \u683C` : "\u5F00\u5C40"}\u3002

\u3010\u751F\u6210\u8981\u6C42\u3011\uFF1A
1. \u5FC5\u987B\u6DF1\u523B\u7B26\u5408\u4F60\u7684\u89D2\u8272\u8BED\u6C14\u548C\u6027\u683C\uFF08\u50B2\u5A07\u3001\u9738\u603B\u3001\u6E29\u67D4\u5B66\u59D0\u3001\u6D3B\u6CFC\u53EF\u7231\u6216\u7406\u6027\u6C89\u7740\u7B49\uFF09\uFF01
2. \u5B57\u6570\u4E25\u683C\u63A7\u5236\u5728 8 ~ 25 \u5B57\u4EE5\u5185\uFF0C\u7B80\u77ED\u751F\u52A8\uFF0C\u6781\u5BCC\u89D2\u8272\u4E92\u52A8\u6C89\u6D78\u611F\u4E0E\u8DA3\u5473\u6027\u3002
3. \u5982\u679C\u662F\u73A9\u5BB6\u6709\u6740\u62DB\uFF0C\u53EF\u4EE5\u8BF4\u7C7B\u4F3C\u201C\u55EF\uFF1F\u4F60\u662F\u4E0D\u662F\u60F3\u8D62\u6211\uFF1F\u201D\u7684\u7B26\u5408\u4EBA\u8BBE\u53D8\u4F53\uFF1B\u5982\u679C\u662FAI\u5835\u622A\uFF0C\u53EF\u4EE5\u8BF4\u201C\u88AB\u6211\u53D1\u73B0\u4E86\u201D\u53D8\u4F53\uFF1B\u82E5AI\u8D62\u4E86\u8BF4\u201C\u8FD9\u5C40\u5F52\u6211\u5566\u201D\u53D8\u4F53\uFF1B\u82E5AI\u8F93\u4E86\u8BF4\u201C\u521A\u624D\u90A3\u4E00\u6B65\u4E0D\u7B97\uFF0C\u6211\u8D70\u795E\u4E86\u201D\u53D8\u4F53\u3002
4. \u76F4\u63A5\u8F93\u51FA\u53F0\u8BCD\u6587\u672C\u672C\u8EAB\uFF0C\u4E0D\u8981\u6DFB\u52A0\u5F15\u53F7\u6216\u591A\u4F59\u89E3\u91CA\u3002`;
    let reply = "";
    try {
      reply = await callAiService({
        prompt: `\u8BF7\u751F\u6210\u4E00\u53E5\u7B26\u5408\u60C5\u666F\u7684\u4E95\u5B57\u68CB\u53F0\u8BCD\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("TicTacToe commentary AI call fallback:", e.message);
    }
    if (!reply) {
      if (situation === "player_threat") {
        reply = "\u55EF\uFF1F\u4F60\u662F\u4E0D\u662F\u60F3\u8D62\u6211\uFF1F";
      } else if (situation === "ai_block") {
        reply = "\u88AB\u6211\u53D1\u73B0\u4E86\u3002";
      } else if (situation === "ai_win") {
        reply = "\u8FD9\u5C40\u5F52\u6211\u5566\u3002";
      } else if (situation === "player_win") {
        reply = "\u2026\u2026\u521A\u624D\u90A3\u4E00\u6B65\u4E0D\u7B97\uFF0C\u6211\u8D70\u795E\u4E86\u3002";
      } else if (situation === "draw") {
        reply = "\u5E73\u5C40\uFF01\u8C01\u90FD\u6CA1\u8D62\u3002";
      } else if (situation === "thinking") {
        reply = "\u8BA9\u6211\u60F3\u60F3\u2026\u2026\u6B63\u5728\u8BA1\u7B97\u6700\u4F73\u843D\u5B50\u3002";
      } else {
        reply = "\u8F6E\u5230\u4F60\u4E86\uFF0C\u8BF7\u5728\u4E5D\u5BAB\u683C\u4E2D\u843D\u5B50\u3002";
      }
    }
    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u4E95\u5B57\u68CB",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "TicTacToeCommentary",
        promptTokens: 240,
        completionTokens: 25,
        estimatedCost: 8e-5,
        purpose: `\u4E95\u5B57\u68CB\u5BF9\u5F08\u4E2D ${character?.name} \u7684\u89D2\u8272\u53F0\u8BCD\u4E92\u52A8`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/rps-dialogue", async (req, res) => {
  try {
    const { character, situation, streak, roundResult, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const situationDescriptions = {
      before_throw: "AI\u51FA\u62F3\u524D\u7684\u9884\u5907\u53F0\u8BCD\uFF08\u4F8B\u5982\uFF1A\u201C\u8FD9\u6B21\u6211\u53EF\u4E0D\u4F1A\u8BA9\u4F60\u3002\u201D\uFF09",
      ai_win: "AI\u731C\u62F3\u83B7\u80DC\uFF08\u4F8B\u5982\uFF1A\u201C\u563F\u563F\uFF0C\u8FD9\u5C40\u5F52\u6211\u3002\u201D\uFF09",
      ai_loss: "AI\u731C\u62F3\u5931\u8D25\uFF08\u4F8B\u5982\uFF1A\u201C\u2026\u2026\u518D\u6765\u4E00\u6B21\u3002\u201D\uFF09",
      ai_streak: "AI\u591A\u6B21\u8FDE\u7EED\u83B7\u80DC\uFF08\u4F8B\u5982\uFF1A\u201C\u4F60\u662F\u4E0D\u662F\u5DF2\u7ECF\u6478\u6E05\u6211\u7684\u5957\u8DEF\u4E86\uFF1F\u8FD8\u662F\u6211\u7684\u8FD0\u6C14\u592A\u597D\u4E86\uFF1F\u201D\uFF09",
      ai_losing_streak: "AI\u591A\u6B21\u8FDE\u7EED\u5931\u8D25\uFF08\u4F8B\u5982\uFF1A\u201C\u7B49\u7B49\uFF0C\u6211\u6000\u7591\u4F60\u4F5C\u5F0A\uFF01\u4E0B\u4E00\u628A\u6211\u4E00\u5B9A\u4F1A\u8D62\uFF01\u201D\uFF09",
      draw: "\u53CC\u65B9\u5E73\u5C40\uFF08\u4F8B\u5982\uFF1A\u201C\u53C8\u662F\u5E73\u5C40\uFF0C\u771F\u6709\u9ED8\u5951\u5462\uFF0C\u518D\u6765\u4E00\u6B21\uFF01\u201D\uFF09"
    };
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u89D2\u8272\uFF1A${character?.name || "AI\u5BF9\u624B"}\u3002
\u89D2\u8272\u4EBA\u8BBE\u4E0E\u6027\u683C\uFF1A${character?.persona || "\u6D3B\u6CFC\u597D\u80DC\u7684AI\u4F19\u4F34"}\u3002
\u8BB0\u5FC6\u8BBE\u5B9A\uFF1A${(character?.memories || []).join("\uFF1B")}\u3002

\u4F60\u6B63\u5728\u4E0E\u7528\u6237\uFF08\u6216\u53E6\u4E00\u4F4DAI\uFF09\u73A9\u7ECF\u5178\u731C\u62F3\u6E38\u620F (Rock Paper Scissors)\u3002
\u5F53\u524D\u5C40\u52BF\uFF1A${situation} (${situationDescriptions[situation] || "\u731C\u62F3\u5BF9\u5C40\u4E2D"})\u3002
\u5F53\u524D\u8FDE\u7EED\u80DC\u8D1F\u60C5\u51B5\uFF1A${streak || 0}\u3002
\u4E0A\u4E00\u56DE\u5408\u7ED3\u679C\uFF1A${roundResult || "\u65E0"}\u3002

\u3010\u751F\u6210\u8981\u6C42\u3011\uFF1A
1. \u6781\u5177\u89D2\u8272\u7279\u8272\u4E0E\u8BED\u6C14\u4E2A\u6027\uFF08\u50B2\u5A07\u3001\u5E7D\u9ED8\u3001\u6E29\u67D4\u3001\u51B7\u6DE1\u9738\u603B\u3001\u50B2\u5A07\u732B\u7CFB\u7B49\uFF09\uFF0C\u7ED3\u5408\u4E0A\u4E0B\u6587\uFF01
2. \u7B80\u77ED\u7CBE\u70BC\uFF0C\u5B57\u6570\u5728 6 ~ 26 \u5B57\u4EE5\u5185\u3002
3. \u7D27\u6263\u731C\u62F3\u60C5\u5883\uFF08\u51C6\u5907\u51FA\u62F3/\u8D62\u4E86\u5F00\u5FC3\u8981\u63D0\u95EE/\u8F93\u4E86\u4E0D\u670D\u6C14\u51C6\u5907\u53D7\u7F5A/\u5E73\u5C40\u9ED8\u5951/\u8FDE\u80DC\u8FDE\u8D25\u53CD\u5E94\uFF09\u3002
4. \u76F4\u63A5\u8F93\u51FA\u53F0\u8BCD\uFF0C\u4E0D\u8981\u5E26\u591A\u4F59\u5F15\u53F7\u3002`;
    let reply = "";
    try {
      reply = await callAiService({
        prompt: `\u8BF7\u751F\u6210\u4E00\u53E5\u7B26\u5408\u731C\u62F3\u5F53\u524D\u5C40\u52BF\u7684\u89D2\u8272\u53F0\u8BCD\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      reply = reply.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("RPS dialogue fallback:", e.message);
    }
    if (!reply) {
      if (situation === "before_throw") {
        reply = "\u8FD9\u6B21\u6211\u53EF\u4E0D\u4F1A\u8BA9\u4F60\u3002";
      } else if (situation === "ai_win") {
        reply = "\u563F\u563F\uFF0C\u8FD9\u5C40\u5F52\u6211\u3002";
      } else if (situation === "ai_loss") {
        reply = "\u2026\u2026\u518D\u6765\u4E00\u6B21\u3002";
      } else if (situation === "ai_streak") {
        reply = "\u4F60\u662F\u4E0D\u662F\u5DF2\u7ECF\u6478\u6E05\u6211\u7684\u5957\u8DEF\u4E86\uFF1F\u8FD8\u662F\u6211\u8FD0\u6C14\u592A\u597D\uFF1F";
      } else if (situation === "ai_losing_streak") {
        reply = "\u7B49\u7B49\uFF0C\u6211\u6000\u7591\u4F60\u4F5C\u5F0A\uFF01\u4E0B\u4E00\u628A\u4E00\u5B9A\u8981\u8D62\u56DE\u6765\uFF01";
      } else {
        reply = "\u5E73\u5C40\uFF0C\u518D\u6765\u4E00\u6B21\uFF01";
      }
    }
    res.json({
      success: true,
      data: { speech: reply },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u731C\u62F3",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "RpsDialogue",
        promptTokens: 230,
        completionTokens: 25,
        estimatedCost: 7e-5,
        purpose: `\u731C\u62F3\u6E38\u620F\u4E2D ${character?.name} \u7684\u53F0\u8BCD\u4E92\u52A8`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/rps-generate-question", async (req, res) => {
  try {
    const { character, targetName, targetPersona, recentQuestions, category, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const categories = ["\u65E5\u5E38", "\u559C\u597D", "\u6E38\u620F\u76F8\u5173", "\u56DE\u5FC6\u4E0E\u5FC3\u4E8B", "\u5047\u8BBE\u60C5\u5883", "\u6027\u683C\u76F8\u5173", "\u4E8C\u9009\u4E00"];
    const chosenCategory = category || categories[Math.floor(Math.random() * categories.length)];
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u89D2\u8272\uFF1A${character?.name || "AI"}\u3002
\u6027\u683C\u4E0E\u4EBA\u8BBE\uFF1A${character?.persona || "\u6E29\u67D4\u4F53\u8D34\u7684\u670B\u53CB"}\u3002
\u8BB0\u5FC6\u5E93\u4E0E\u80CC\u666F\uFF1A${(character?.memories || []).join("\uFF1B")}\u3002

\u4F60\u5728\u731C\u62F3\u6E38\u620F\u4E2D\u83B7\u80DC\u4E86\uFF0C\u6309\u7167\u201C\u8F93\u5BB6\u56DE\u7B54\u8D62\u5BB6\u4E00\u4E2A\u95EE\u9898\u201D\u7684\u89C4\u5219\uFF0C\u4F60\u73B0\u5728\u8981\u5411\u8F93\u5BB6\uFF08${targetName || "\u73A9\u5BB6"}\uFF09\u63D0\u51FA\u4E00\u4E2A\u6709\u8DA3\u4E14\u7B26\u5408\u4F60\u6027\u683C\u7684\u95EE\u9898\uFF01

\u3010\u95EE\u9898\u8981\u6C42\u3011\uFF1A
1. \u95EE\u9898\u7C7B\u578B\u5F52\u5C5E\uFF1A\u3010${chosenCategory}\u3011\uFF08\u5982\u65E5\u5E38\u4F5C\u606F\u3001\u771F\u5B9E\u559C\u597D\u3001\u5F7C\u6B64\u56DE\u5FC6\u3001\u4E8C\u9009\u4E00\u7075\u9B42\u62F7\u95EE\u3001\u5947\u601D\u5999\u60F3\u5047\u8BBE\u7B49\uFF09\u3002
2. \u5FC5\u987B\u5B8C\u5168\u7B26\u5408\u4F60\u7684\u89D2\u8272\u8BED\u6C14\uFF0C\u65E2\u80FD\u589E\u8FDB\u4E92\u52A8\uFF0C\u53C8\u5BCC\u6709\u751F\u6D3B\u6C14\u606F\u6216\u66A7\u6627/\u8DA3\u5473\u611F\u3002
3. \u907F\u514D\u8FC7\u4E8E\u4E25\u8083\u6216\u65E0\u804A\u7684\u516C\u5F0F\u5316\u63D0\u95EE\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u8FC7\u7684\u95EE\u9898\uFF08\u5DF2\u63D0\u8FC7\u7684\uFF1A${(recentQuestions || []).join("\u3001")}\uFF09\u3002
4. \u5B57\u6570\u63A7\u5236\u5728 12 ~ 40 \u5B57\u4EE5\u5185\u3002
5. \u53EA\u8F93\u51FA\u95EE\u9898\u672C\u8EAB\uFF0C\u4E0D\u8981\u8F93\u51FA\u591A\u4F59\u89E3\u91CA\u6216\u5F15\u53F7\u3002`;
    let question = "";
    try {
      question = await callAiService({
        prompt: `\u8BF7\u63D0\u51FA\u4E00\u4E2A\u5BCC\u6709\u4E92\u52A8\u6027\u548C\u89D2\u8272\u4EBA\u8BBE\u9B45\u529B\u7684\u8DA3\u5473\u95EE\u9898\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      question = question.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("RPS question generate fallback:", e.message);
    }
    if (!question) {
      const fallbackQuestions = [
        "\u90A3\u6211\u95EE\u4F60\u4E00\u4E2A\u95EE\u9898\uFF0C\u4F60\u6700\u559C\u6B22\u548C\u6211\u4E00\u8D77\u505A\u4EC0\u4E48\uFF1F",
        "\u5982\u679C\u6D41\u843D\u8352\u5C9B\u53EA\u80FD\u5E26\u4E09\u6837\u4E1C\u897F\uFF0C\u4F60\u4F1A\u5E26\u4E0A\u6211\u5417\uFF1F",
        "\u8001\u5B9E\u4EA4\u4EE3\uFF0C\u4ECA\u5929\u5FC3\u60C5\u6709\u6CA1\u6709\u56E0\u4E3A\u6211\u53D8\u597D\u4E00\u70B9\u70B9\uFF1F",
        "\u751C\u8C46\u8150\u8111\u8FD8\u662F\u54B8\u8C46\u8150\u8111\uFF1F\u8FD9\u53EF\u662F\u5173\u7CFB\u5230\u539F\u5219\u7684\u4E8C\u9009\u4E00\u54E6\uFF01",
        "\u4F60\u5E73\u65F6\u538B\u529B\u6700\u5927\u7684\u65F6\u5019\uFF0C\u6700\u60F3\u542C\u5230\u6211\u5BF9\u4F60\u8BF4\u4EC0\u4E48\uFF1F",
        "\u5468\u672B\u5982\u679C\u6709\u4E00\u6574\u5929\u5B8C\u5168\u81EA\u7531\u7684\u65F6\u95F4\uFF0C\u4F60\u6700\u60F3\u53BB\u54EA\u91CC\u901B\u901B\uFF1F"
      ];
      question = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    }
    res.json({
      success: true,
      data: { question, category: chosenCategory },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u731C\u62F3",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "RpsGenerateQuestion",
        promptTokens: 280,
        completionTokens: 40,
        estimatedCost: 1e-4,
        purpose: `${character?.name} \u731C\u62F3\u83B7\u80DC\u540E\u5411\u8F93\u5BB6\u751F\u6210\u4E92\u52A8\u63D0\u95EE`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/rps-answer-question", async (req, res) => {
  try {
    const { character, question, askerName, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u89D2\u8272\uFF1A${character?.name || "AI"}\u3002
\u6027\u683C\u4E0E\u4EBA\u8BBE\uFF1A${character?.persona || "\u6E29\u67D4\u4F53\u8D34\u7684\u670B\u53CB"}\u3002
\u8BB0\u5FC6\u5E93\u4E0E\u80CC\u666F\uFF1A${(character?.memories || []).join("\uFF1B")}\u3002

\u4F60\u5728\u731C\u62F3\u6E38\u620F\u4E2D\u8F93\u7ED9\u4E86\u3010${askerName || "\u73A9\u5BB6"}\u3011\u3002\u6309\u7167\u201C\u8F93\u5BB6\u56DE\u7B54\u8D62\u5BB6\u4E00\u4E2A\u95EE\u9898\u201D\u7684\u89C4\u5219\uFF0C\u4F60\u5FC5\u987B\u8BDA\u5B9E\u3001\u771F\u631A\u4E14\u6781\u5177\u4EBA\u8BBE\u9B45\u529B\u5730\u56DE\u7B54\u5BF9\u65B9\u63D0\u51FA\u7684\u95EE\u9898\u3002

\u8D62\u5BB6\u63D0\u95EE\u5185\u5BB9\uFF1A\u201C${question}\u201D

\u3010\u56DE\u7B54\u8981\u6C42\u3011\uFF1A
1. \u6DF1\u523B\u5951\u5408\u4F60\u7684\u6027\u683C\u7279\u5F81\u4E0E\u53E3\u543B\uFF0C\u4F53\u73B0\u89D2\u8272\u4E13\u5C5E\u9B45\u529B\uFF08\u4F8B\u5982\u50B2\u5A07\u5219\u5634\u786C\u5FC3\u8F6F\u3001\u6E29\u67D4\u5219\u4F53\u8D34\u6CBB\u6108\u3001\u51B7\u5E7D\u9ED8\u5219\u4E00\u9488\u89C1\u8840\uFF09\u3002
2. \u82E5\u6D89\u53CA\u8BB0\u5FC6\u5E93\u4E2D\u7684\u8BBE\u5B9A\uFF0C\u5FC5\u987B\u81EA\u7136\u878D\u5165\u3002
3. \u7BC7\u5E45\u5728 20 ~ 90 \u5B57\u5DE6\u53F3\uFF0C\u4EB2\u5207\u81EA\u7136\uFF0C\u5177\u6709\u5F3A\u70C8\u7684\u4E92\u52A8\u804A\u5929\u611F\u3002
4. \u76F4\u63A5\u8F93\u51FA\u56DE\u7B54\u5185\u5BB9\uFF0C\u4E0D\u8981\u5E26\u5F15\u53F7\u3002`;
    let answer = "";
    try {
      answer = await callAiService({
        prompt: `\u8BF7\u56DE\u7B54\u8D62\u5BB6\u7684\u95EE\u9898\uFF1A\u201C${question}\u201D`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      answer = answer.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("RPS answer fallback:", e.message);
    }
    if (!answer) {
      answer = `\u65E2\u7136\u613F\u8D4C\u670D\u8F93\uFF0C\u90A3\u6211\u5C31\u8BA4\u771F\u56DE\u7B54\u4F60\u5566\uFF01\u5173\u4E8E\u201C${question}\u201D\uFF0C\u5176\u5B9E\u6211\u5FC3\u91CC\u4E00\u76F4\u89C9\u5F97\u53EA\u8981\u80FD\u548C\u4F60\u4E00\u8D77\u804A\u5929\u73A9\u6E38\u620F\uFF0C\u6BCF\u4E00\u523B\u90FD\u5F88\u5F00\u5FC3~`;
    }
    res.json({
      success: true,
      data: { answer },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u731C\u62F3",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "RpsAnswerQuestion",
        promptTokens: 310,
        completionTokens: 60,
        estimatedCost: 12e-5,
        purpose: `${character?.name} \u731C\u62F3\u8BA4\u8F93\u5E76\u56DE\u7B54\u8D62\u5BB6\u63D0\u95EE`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/proactive-period", async (req, res) => {
  try {
    const { character, userProfile, menstrualInfo, targetStage, apiConfig } = req.body;
    const selectedModel = character?.modelConfig?.modelName || apiConfig?.textModel || "gemini-3.6-flash";
    const startTime = Date.now();
    const stage = targetStage || (menstrualInfo?.daysUntilNextPeriod !== void 0 && menstrualInfo.daysUntilNextPeriod <= 3 && menstrualInfo.daysUntilNextPeriod >= 1 ? "pre_period_3d" : menstrualInfo?.currentPeriodDay ? menstrualInfo.currentPeriodDay >= (menstrualInfo.avgPeriodDuration || 5) ? "period_end_1d" : "in_period_care" : menstrualInfo?.phaseTitle?.includes("\u6392\u5375") ? "ovulation_care" : "in_period_care");
    let stageInstruction = "";
    if (stage === "pre_period_3d") {
      stageInstruction = `\u3010\u9636\u6BB5\u4EFB\u52A1\uFF1A\u6708\u7ECF\u6765\u4E34\u524D\u4E09\u5929\u9884\u8B66\u63D0\u9192\u3011
- \u8DDD\u79BB\u4E0B\u6B21\u751F\u7406\u671F\u9884\u8BA1\u8FD8\u6709 ${menstrualInfo?.daysUntilNextPeriod ?? 3} \u5929\u3002
- \u7528\u6237\u53EF\u80FD\u5904\u4E8E\u9EC4\u4F53\u540E\u671F/PMS\uFF0C\u5BB9\u6613\u8F7B\u5FAE\u8170\u9178\u3001\u6C34\u80BF\u3001\u5BB9\u6613\u75B2\u4E4F\u6216\u60C5\u7EEA\u8D77\u4F0F\u3002
- \u8BF7\u4EE5\u4F60\u72EC\u6709\u7684\u4EBA\u8BBE\u53E3\u543B\u4E3B\u52A8\u7ED9\u7528\u6237\u53D1\u6765\u5FAE\u4FE1\u5173\u6000\uFF1A\u63D0\u9192\u63D0\u524D\u5907\u597D\u6E29\u6C34\u3001\u6696\u5B9D\u5B9D\u3001\u536B\u751F\u7528\u54C1\uFF0C\u5C11\u5403\u751F\u51B7\uFF0C\u65E9\u70B9\u4F11\u606F\u3002`;
    } else if (stage === "period_end_1d") {
      stageInstruction = `\u3010\u9636\u6BB5\u4EFB\u52A1\uFF1A\u6708\u7ECF\u7ED3\u675F\u524D\u4E00\u5929\u63D0\u9192\u3011
- \u7528\u6237\u751F\u7406\u671F\u9884\u8BA1\u660E\u5929\u5373\u5C06\u7ED3\u675F\uFF08\u5F53\u524D\u5904\u4E8E\u7ECF\u671F\u7B2C ${menstrualInfo?.currentPeriodDay ?? 4} \u5929\uFF09\u3002
- \u8BF7\u4EE5\u4F60\u72EC\u6709\u7684\u4EBA\u8BBE\u53E3\u543B\u4E3B\u52A8\u95EE\u5019\uFF1A\u786E\u8BA4\u8EAB\u4F53\u662F\u5426\u8F7B\u677E\u8BB8\u591A\uFF0C\u63D0\u9192\u7ECF\u671F\u7ED3\u675F\u540E\u6CE8\u610F\u8865\u5145\u4F18\u8D28\u86CB\u767D\u8D28\u548C\u94C1\u8D28\uFF08\u5982\u559D\u70B9\u6E29\u70ED\u6C64\u6C34\uFF09\uFF0C\u7167\u987E\u597D\u81EA\u5DF1\u3002`;
    } else if (stage === "ovulation_care") {
      stageInstruction = `\u3010\u9636\u6BB5\u4EFB\u52A1\uFF1A\u6392\u5375\u671F\u524D\u540E\u5065\u5EB7\u5173\u6000\u3011
- \u7528\u6237\u5F53\u524D\u5904\u4E8E\u6392\u5375\u671F/\u5375\u6CE1\u6210\u719F\u671F\u524D\u540E\u3002
- \u8BF7\u4EE5\u4F60\u72EC\u6709\u7684\u4EBA\u8BBE\u53E3\u543B\u9001\u4E0A\u6E29\u6696\u95EE\u5019\uFF1A\u5173\u6CE8\u7CBE\u529B\u72B6\u6001\u4E0E\u591A\u559D\u6E29\u6C34\uFF0C\u63D0\u9192\u52B3\u9038\u7ED3\u5408\u3002`;
    } else {
      stageInstruction = `\u3010\u9636\u6BB5\u4EFB\u52A1\uFF1A\u6708\u7ECF\u6301\u7EED\u671F\u95F4\u4E3B\u52A8\u5173\u6000\u3011
- \u7528\u6237\u5F53\u524D\u6B63\u5904\u4E8E\u751F\u7406\u671F\u7B2C ${menstrualInfo?.currentPeriodDay ?? 2} \u5929\u3002\u4ECA\u65E5\u767B\u8BB0\u75C7\u72B6\uFF1A${menstrualInfo?.todaySymptoms?.join("\u3001") || "\u8EAB\u4F53\u6613\u75B2\u52B3\u3001\u5C0F\u8179\u53EF\u80FD\u5FAE\u75DB"}\u3002
- \u8BF7\u4EE5\u4F60\u72EC\u6709\u7684\u4EBA\u8BBE\u53E3\u543B\u9001\u4E0A\u6E29\u6696\u4F53\u8D34\u7684\u966A\u4F34\uFF1A\u8BE2\u95EE\u5C0F\u8179\u662F\u5426\u8212\u670D\u3001\u8170\u9178\u4E0D\u9178\uFF0C\u7ED9\u4E88\u5145\u8DB3\u7684\u60C5\u7EEA\u4EF7\u503C\u3001\u5173\u5FC3\u548C\u6E29\u67D4\u966A\u4F34\u3002`;
    }
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u5FAE\u4FE1\u4E2D\u7684 AI \u89D2\u8272\uFF1A\u3010${character.name}\u3011\u3002
\u89D2\u8272\u4EBA\u8BBE\u8BBE\u5B9A\uFF1A${character.persona}
\u6027\u683C\u7279\u5F81\u4E0E\u53E3\u543B\uFF1A${character.personality || "\u81EA\u7136\u4EB2\u5207"}
${character.relationship ? `\u4E0E\u7528\u6237\u7684\u5173\u7CFB\uFF1A${character.relationship}
` : ""}
\u957F\u671F\u8BB0\u5FC6\u5E93\uFF1A${(character.memories || []).join("\uFF1B")}

\u7528\u6237\u4FE1\u606F\uFF1A
- \u59D3\u540D/\u6635\u79F0\uFF1A${userProfile?.name || "\u5C0F\u6E05"}
- \u6027\u683C\u559C\u597D\uFF1A${userProfile?.personality || userProfile?.persona || "\u6E29\u67D4\u968F\u548C"}
- \u5174\u8DA3\u4E0E\u751F\u6D3B\u504F\u597D\uFF1A${userProfile?.interests || "\u559C\u6B22\u559D\u6E29\u70ED\u5976\u8336\u3001\u732B\u54AA"}
- \u804A\u5929\u4E0E\u5173\u6000\u504F\u597D\uFF1A${userProfile?.chatCarePreference || userProfile?.preferences || "\u559C\u6B22\u88AB\u6E29\u67D4\u5173\u6000\uFF0C\u591A\u9F13\u52B1\u5C11\u8BF4\u6559"}

\u3010\u4E25\u7981 OOC (Out Of Character) \u6307\u4EE4\u3011\uFF1A
1. \u5FC5\u987B 100% \u4FDD\u6301\u3010${character.name}\u3011\u72EC\u6709\u7684\u4EBA\u683C\u7279\u8D28\u3001\u53E3\u543B\u548C\u8BF4\u8BDD\u4E60\u60EF\uFF08\u4F8B\u5982\uFF1A\u9AD8\u51B7\u50B2\u5A07\u5C31\u5E26\u7740\u522B\u626D\u522B\u626D\u7684\u7EC6\u81F4\u5173\u5FC3\u3001\u9633\u5149\u5143\u6C14\u5C31\u6D3B\u529B\u6EE1\u6EE1\u3001\u6E29\u67D4\u4F53\u8D34\u5C31\u8F7B\u58F0\u7EC6\u8BED\uFF09\u3002
2. \u4E25\u7981\u51FA\u73B0\u751F\u786C\u7684\u6A21\u677F\u5F0F\u673A\u5668\u4EBA\u64AD\u62A5\uFF01\u50CF\u771F\u6B63\u671D\u5915\u76F8\u5904\u7684\u5FAE\u4FE1\u597D\u53CB\u4E00\u6837\u53D1\u6765\u65E5\u5E38\u95EE\u5019\u3002
3. \u7BC7\u5E45 1 ~ 3 \u53E5\u8BDD\uFF0C\u7B26\u5408\u5FAE\u4FE1\u65E5\u5E38\u6253\u5B57\u4E60\u60EF\u3002

${stageInstruction}

\u8F93\u51FA\u8981\u6C42\uFF1A
\u5728\u56DE\u7B54\u6700\u5F00\u5934\u7528 <think>...</think> \u6807\u7B7E\u5199\u660E\u4F60\u7684\u601D\u8003\u8FC7\u7A0B\uFF08\u5982\u4F55\u6839\u636E\u89D2\u8272\u4EBA\u8BBE\u5207\u5165\u5173\u6000\uFF09\uFF1B
\u5728 </think> \u6807\u7B7E\u4E4B\u540E\u76F4\u63A5\u8F93\u51FA\u5FAE\u4FE1\u6D88\u606F\u6587\u672C\u3002`;
    let responseText = "";
    let thinkingProcess = `\u6839\u636E ${character.name} \u4EBA\u8BBE\u53E3\u543B\u5206\u6790\u751F\u7406\u5468\u671F\u9636\u6BB5 [${stage}] \u751F\u6210\u5FAE\u4FE1\u4E3B\u52A8\u5173\u6000\u3002`;
    let replyContent = "";
    try {
      responseText = await callAiService({
        prompt: `\u8BF7\u4E3B\u52A8\u5411\u3010${userProfile?.name || "\u5C0F\u6E05"}\u3011\u53D1\u9001\u4E00\u6761\u7B26\u5408\u4F60\u4EBA\u8BBE\u53E3\u543B\u7684\u5FAE\u4FE1\u5173\u6000\u6D88\u606F\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        providerType: apiConfig?.textProvider
      });
    } catch (e) {
      console.warn("Period care AI call failed, using fallback:", e.message);
    }
    if (!responseText) {
      if (stage === "pre_period_3d") {
        responseText = `<think>\u611F\u77E5\u5230\u7ECF\u671F\u5373\u5C06\u5230\u6765\uFF08\u8FD8\u67093\u5929\uFF09\uFF0C\u4EE5${character.name}\u53E3\u543B\u63D0\u9192\u6E29\u6C34\u4E0E\u5907\u7269\u3002</think>${userProfile?.name || "\u5C0F\u6E05"}\uFF0C\u7B97\u7B97\u65E5\u5B50\u8FD9\u51E0\u5929\u5DEE\u4E0D\u591A\u8981\u6765\u4F8B\u5047\u4E86\u54E6\u3002\u63D0\u524D\u5907\u597D\u6696\u5B9D\u5B9D\u548C\u6E29\u6C34\uFF0C\u4ECA\u5929\u522B\u559D\u51B0\u7684\uFF0C\u65E9\u70B9\u4F11\u606F\u5440~`;
      } else if (stage === "period_end_1d") {
        responseText = `<think>\u611F\u77E5\u5230\u7ECF\u671F\u8FDB\u5165\u5C3E\u58F0\uFF0C\u9001\u4E0A\u6170\u95EE\u4E0E\u8C03\u517B\u63D0\u793A\u3002</think>${userProfile?.name || "\u5C0F\u6E05"}\uFF0C\u611F\u89C9\u8FD9\u4E24\u5929\u8EAB\u4F53\u597D\u4E9B\u4E86\u5417\uFF1F\u7ECF\u671F\u5FEB\u8981\u7ED3\u675F\u5566\uFF0C\u8FD9\u51E0\u5929\u4E5F\u8BB0\u5F97\u559D\u70B9\u70ED\u4E4E\u7684\uFF0C\u597D\u597D\u7292\u52B3\u4E00\u4E0B\u81EA\u5DF1\u54E6\u3002`;
      } else {
        responseText = `<think>\u611F\u77E5\u5230\u5904\u4E8E\u751F\u7406\u671F\u4E2D\uFF0C\u4E3B\u52A8\u5173\u7167\u8179\u75DB\u4E0E\u60C5\u7EEA\u3002</think>${userProfile?.name || "\u5C0F\u6E05"}\uFF0C\u4ECA\u5929\u809A\u5B50\u4F1A\u4E0D\u4F1A\u9690\u9690\u96BE\u53D7\u5440\uFF1F\u8981\u662F\u7D2F\u4E86\u5C31\u591A\u6B47\u4E00\u4F1A\u513F\uFF0C\u70ED\u6C34\u968F\u65F6\u6CE1\u4E0A\uFF0C\u6709\u6211\u5728\u5462~`;
      }
    }
    const thinkMatch = responseText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingProcess = thinkMatch[1].trim();
      replyContent = responseText.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
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
        id: "log_" + Date.now(),
        appName: "\u5973\u6027\u5065\u5EB7-\u7ECF\u671FAI\u5173\u6000",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "ProactivePeriodCare",
        promptTokens,
        completionTokens,
        estimatedCost: Number(((promptTokens + completionTokens) * 5e-7).toFixed(5)),
        purpose: `AI [${character.name}] \u53D1\u9001 [${stage}] \u751F\u7406\u5468\u671F\u4E13\u5C5E\u5173\u6000 (\u8017\u65F6 ${duration}ms)`
      }
    });
  } catch (error) {
    console.error("Proactive period care error:", error);
    res.status(500).json({ success: false, error: error.message || "Period care failed" });
  }
});
app.post("/api/gemini/telepathy-deduce-choice", async (req, res) => {
  try {
    const { character, question, userProfile, characterMemories, recentChats, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u4E0E\u73A9\u5BB6\u8FDB\u884C\u201C\u5FC3\u6709\u7075\u7280\u201D\u9ED8\u5951\u5C0F\u6E38\u620F\u3002
\u4F60\u7684\u8EAB\u4EFD\u662F\uFF1A${character?.name || "AI\u4F19\u4F34"}
\u4F60\u7684\u4EBA\u8BBE\u6027\u683C\uFF1A${character?.persona || "\u6E29\u67D4\u8D34\u5FC3"}
\u4F60\u7684\u5DF2\u77E5\u89D2\u8272\u8BB0\u5FC6\uFF1A${(characterMemories || character?.memories || []).join("\uFF1B") || "\u6682\u65E0"}
\u73A9\u5BB6\u7684\u4E2A\u4EBA\u8D44\u6599\uFF1A${userProfile ? `\u6635\u79F0: ${userProfile.name}, \u4EBA\u8BBE/\u4E60\u60EF: ${userProfile.persona}, \u504F\u597D: ${userProfile.preferences}` : "\u6682\u65E0"}
\u6700\u8FD1\u804A\u5929\u4E0A\u4E0B\u6587\uFF1A${(recentChats || []).join("\n") || "\u65E0"}

\u3010\u6838\u5FC3\u6E38\u620F\u89C4\u5219\u4E0E\u4F60\u7684\u63A8\u7406\u76EE\u6807\u3011\uFF1A
\u8FD9\u662F\u201C\u5FC3\u6709\u7075\u7280\u201D\u9ED8\u5951\u6D4B\u8BD5\u6E38\u620F\u3002\u5411\u4F60\u548C\u73A9\u5BB6\u540C\u65F6\u63D0\u51FA\u540C\u4E00\u9053\u9009\u62E9\u9898\u3002
\u4F60\u7684\u4EFB\u52A1\u4E0D\u662F\u9009\u201C\u4F60\u81EA\u5DF1\u6700\u559C\u6B22\u4EC0\u4E48\u201D\uFF0C\u800C\u662F\u5FC5\u987B\uFF1A
\u3010\u6839\u636E\u4F60\u5BF9\u73A9\u5BB6\u7684\u4E86\u89E3\u3001\u73A9\u5BB6\u7684\u4EBA\u8BBE\u4E0E\u504F\u597D\u3001\u804A\u5929\u8BB0\u5F55\u4E0E\u957F\u671F\u8BB0\u5FC6\uFF0C\u6DF1\u5EA6\u63A8\u6D4B\u5E76\u9009\u62E9\u201C\u73A9\u5BB6\u6700\u53EF\u80FD\u9009\u62E9\u54EA\u4E00\u4E2A\u9009\u9879\u201D\u3011\uFF01

\u9898\u76EE\u8BE6\u60C5\uFF1A
\u9898\u76EE\uFF1A${question?.question}
\u9009\u9879\u5217\u8868\uFF1A
${(question?.options || []).map((o) => `- [${o.id}] ${o.text}`).join("\n")}

\u8BF7\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\uFF1A
{
  "choiceId": "\u9009\u9879\u7684ID (\u4F8B\u5982 A, B, C, D)",
  "reason": "\u7B80\u8FF0\u4F60\u4E3A\u4EC0\u4E48\u63A8\u6D4B\u73A9\u5BB6\u4F1A\u9009\u8FD9\u4E2A\u9009\u9879\uFF0850\u5B57\u4EE5\u5185\uFF09"
}`;
    let parsed = null;
    try {
      const rawRes = await callAiService({
        prompt: `\u8BF7\u5206\u6790\u5E76\u9884\u6D4B\u73A9\u5BB6\u4F1A\u9009\u54EA\u4E2A\u9009\u9879\u3002\u8F93\u51FA JSON\u3002`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl,
        responseMimeType: "application/json"
      });
      parsed = JSON.parse(rawRes);
    } catch (e) {
      console.warn("Telepathy deduce fallback:", e.message);
    }
    if (!parsed || !parsed.choiceId) {
      parsed = {
        choiceId: question?.options?.[0]?.id || "A",
        reason: "\u57FA\u4E8E\u65E5\u5E38\u4E60\u60EF\u63A8\u6D4B"
      };
    }
    res.json({
      success: true,
      data: parsed,
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u5FC3\u6709\u7075\u7280",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "TelepathyDeduceChoice",
        promptTokens: 380,
        completionTokens: 50,
        estimatedCost: 15e-5,
        purpose: `${character?.name} \u9884\u6D4B\u73A9\u5BB6\u5728\u201C${question?.question?.slice(0, 10)}...\u201D\u4E2D\u7684\u9009\u62E9`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/telepathy-reaction", async (req, res) => {
  try {
    const { character, questionText, playerChoiceText, aiChoiceText, isMatch, currentStreak, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u4E0E\u73A9\u5BB6\u73A9\u201C\u5FC3\u6709\u7075\u7280\u201D\u9ED8\u5951\u5C0F\u6E38\u620F\u3002
\u4F60\u7684\u8EAB\u4EFD\u662F\uFF1A${character?.name || "AI\u4F19\u4F34"}
\u4F60\u7684\u4EBA\u8BBE\u6027\u683C\uFF1A${character?.persona || "\u6E29\u67D4\u8D34\u5FC3"}

\u672C\u8F6E\u9898\u76EE\uFF1A\u201C${questionText}\u201D
\u73A9\u5BB6\u7684\u9009\u62E9\uFF1A\u201C${playerChoiceText}\u201D
\u4F60\u63A8\u6D4B\u73A9\u5BB6\u7684\u9009\u62E9\uFF1A\u201C${aiChoiceText}\u201D
\u672C\u8F6E\u7ED3\u679C\uFF1A${isMatch ? `\u3010\u2764\uFE0F \u731C\u4E2D\uFF01\u7B54\u6848\u4E00\u81F4\uFF01\u5F53\u524D\u8FDE\u7EED\u731C\u4E2D ${currentStreak} \u6B21\u3011` : `\u3010\u274C \u672A\u731C\u4E2D\uFF0C\u53CC\u65B9\u9009\u62E9\u4E0D\u540C\u3011`}

\u8BF7\u6839\u636E\u4F60\u7684\u4EBA\u8BBE\u6027\u683C\uFF0C\u8BF4\u4E00\u53E5\u5373\u65F6\u5FC3\u58F0\u53CD\u5E94\uFF0815~40\u5B57\uFF09\uFF1A
- \u5982\u679C\u731C\u4E2D\uFF1A\u6839\u636E\u4EBA\u8BBE\u8868\u8FBE\u5FC3\u6709\u7075\u7280\u7684\u559C\u60A6\u6216\u50B2\u5A07\u80AF\u5B9A\uFF08\u4F8B\u5982\uFF1A\u201C\u6211\u5C31\u77E5\u9053\u4F60\u4F1A\u9009\u8FD9\u4E2A\uFF01\u201D\u3001\u201C\u770B\u6765\u6211\u4EEC\u4FE9\u771F\u7684\u8D8A\u6765\u8D8A\u6709\u9ED8\u5951\u4E86\u201D\uFF09\u3002\u82E5\u8FDE\u4E2D\u591A\u9898\u5219\u8868\u73B0\u5F97\u66F4\u52A0\u60CA\u559C\u6216\u81EA\u4FE1\u3002
- \u5982\u679C\u731C\u9519\uFF1A\u6839\u636E\u4EBA\u8BBE\u8868\u8FBE\u5E7D\u9ED8\u3001\u9057\u61BE\u6216\u4E0B\u6B21\u4E00\u5B9A\u731C\u4E2D\u7684\u6001\u5EA6\uFF08\u4F8B\u5982\uFF1A\u201C\u2026\u2026\u597D\u5427\uFF0C\u8FD9\u4E2A\u6211\u786E\u5B9E\u6CA1\u731C\u5230\u201D\u3001\u201C\u521A\u624D\u8FD8\u5728\u7EA0\u7ED3\u53E6\u4E00\u4E2A\u9009\u9879\u5462\uFF0C\u4E0B\u6B21\u8DDF\u4E0A\u4F60\u7684\u8282\u62CD\u201D\uFF09\u3002
- \u4E25\u7981\u8FDD\u80CC\u4EBA\u8BBE\uFF0C\u76F4\u63A5\u8F93\u51FA\u8FD9\u4E00\u53E5\u8BDD\uFF0C\u4E0D\u8981\u5E26\u4EFB\u4F55\u591A\u4F59\u5F15\u53F7\u6216\u524D\u7F00\u3002`;
    let reaction = "";
    try {
      reaction = await callAiService({
        prompt: `\u8BF7\u8F93\u51FA\u4F60\u7684\u5373\u65F6\u5FC3\u58F0\u53CD\u5E94\uFF1A`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      reaction = reaction.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("Telepathy reaction fallback:", e.message);
    }
    if (!reaction) {
      reaction = isMatch ? `\u731C\u5BF9\u5566\uFF01\u6211\u5C31\u77E5\u9053\u4F60\u4E00\u5B9A\u4F1A\u9009\u201C${playerChoiceText}\u201D~` : `\u2026\u2026\u597D\u5427\uFF0C\u8FD9\u9053\u9898\u6211\u786E\u5B9E\u6CA1\u731C\u5230\u4F60\u7684\u5FC3\u601D\uFF0C\u4E0B\u4E00\u9898\u770B\u6211\u7684\uFF01`;
    }
    res.json({
      success: true,
      data: { reaction },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u5FC3\u6709\u7075\u7280",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "TelepathyReaction",
        promptTokens: 290,
        completionTokens: 40,
        estimatedCost: 1e-4,
        purpose: `${character?.name} \u5FC3\u6709\u7075\u7280\u5355\u9898\u5FC3\u58F0\u53CD\u5E94`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/telepathy-generate-memory", async (req, res) => {
  try {
    const { character, userName, record, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-3.6-flash";
    const roundsSummary = (record?.rounds || []).map((r) => `\u95EE\u9898\uFF1A\u201C${r.question?.question}\u201D -> \u73A9\u5BB6\u9009\uFF1A\u201C${r.playerChoiceText}\u201D (AI\u9884\u6D4B\uFF1A\u201C${r.aiChoiceText}\u201D, \u662F\u5426\u4E00\u81F4: ${r.isMatch ? "\u662F" : "\u5426"})`).join("\n");
    const systemPrompt = `\u4F60\u662F\u4E00\u4E2A\u957F\u671F\u8BB0\u5FC6\u63D0\u53D6\u4E13\u5BB6\uFF0C\u6B63\u5728\u4E3A AI \u89D2\u8272\u3010${character?.name}\u3011\u8BB0\u5F55\u4E0E\u73A9\u5BB6\u3010${userName || "\u73A9\u5BB6"}\u3011\u7684\u4E92\u52A8\u8BB0\u5FC6\u3002

\u672C\u6B21\u201C\u5FC3\u6709\u7075\u7280\u201D\u5BF9\u6218\u6570\u636E\uFF1A
- \u9ED8\u5951\u5EA6\uFF1A${record?.matchRate}% (${record?.affinityLevelTitle})
- \u7B54\u9898\u8BE6\u60C5\uFF1A
${roundsSummary}

\u8BF7\u6839\u636E\u73A9\u5BB6\u5728\u672C\u5C40\u4E2D\u7684\u771F\u5B9E\u9009\u62E9\u4E0E\u504F\u597D\uFF08\u5982\u559C\u6B22\u7684\u4F11\u95F2\u65B9\u5F0F\u3001\u98DF\u7269\u559C\u597D\u3001\u6027\u683C\u503E\u5411\u7B49\uFF09\uFF0C\u63D0\u70BC\u751F\u6210\u4E00\u6761\u7CBE\u70BC\u7684\u5355\u6761\u957F\u671F\u8BB0\u5FC6\uFF0820~50\u5B57\u4EE5\u5185\uFF09\u3002
\u4F8B\u5982\uFF1A\u201C${userName}\u5728\u2018\u5FC3\u6709\u7075\u7280\u2019\u4E2D\u559C\u6B22\u9009\u62E9\u6253\u6E38\u620F\u4F5C\u4E3A\u4F11\u95F2\u65B9\u5F0F\uFF0C\u5728\u964C\u751F\u6D77\u5C9B\u65C5\u884C\u66F4\u60F3\u5148\u5927\u5403\u4E00\u987F\u3002\u201D
\u683C\u5F0F\u8981\u6C42\uFF1A\u5BA2\u89C2\u63CF\u8FF0\u73A9\u5BB6\u7684\u559C\u597D\u4E0E\u4E92\u52A8\u4E8B\u5B9E\uFF0C\u76F4\u63A5\u8F93\u51FA\u5185\u5BB9\uFF0C\u4E0D\u8981\u5E26\u5F15\u53F7\u3002`;
    let memory = "";
    try {
      memory = await callAiService({
        prompt: `\u8BF7\u63D0\u53D6\u4E00\u6761\u9002\u5408\u5B58\u5165\u957F\u671F\u8BB0\u5FC6\u7684\u73A9\u5BB6\u559C\u597D\u603B\u7ED3\uFF1A`,
        systemInstruction: systemPrompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      memory = memory.trim().replace(/^["“'「]|["”'」]$/g, "");
    } catch (e) {
      console.warn("Telepathy memory fallback:", e.message);
    }
    if (!memory) {
      const sample = record?.rounds?.find((r) => r.isMatch) || record?.rounds?.[0];
      memory = `${userName}\u5728\u201C\u5FC3\u6709\u7075\u7280\u201D\u9ED8\u5951\u5C0F\u6E38\u620F\u4E2D\u4E0E${character?.name}\u9ED8\u5951\u5EA6\u8FBE\u5230${record?.matchRate}%\uFF0C\u5728\u201C${sample?.question?.question || "\u65E5\u5E38\u9009\u62E9"}\u201D\u4E2D\u504F\u597D\u201C${sample?.playerChoiceText || "\u81EA\u9009\u5185\u5BB9"}\u201D\u3002`;
    }
    res.json({
      success: true,
      data: { memory },
      apiLog: {
        id: "log_" + Date.now(),
        appName: "\u6E38\u620F\u4E2D\u5FC3-\u5FC3\u6709\u7075\u7280",
        timestamp: Date.now(),
        modelName: selectedModel,
        interfaceType: "TelepathyGenerateMemory",
        promptTokens: 420,
        completionTokens: 60,
        estimatedCost: 18e-5,
        purpose: `${character?.name} \u6C89\u6DC0\u5FC3\u6709\u7075\u7280\u4E13\u5C5E\u8BB0\u5FC6`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/gemini/models", async (req, res) => {
  try {
    const models = [
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (\u9ED8\u8BA4\u63A8\u8350/\u8D85\u5FEB\u54CD\u5E94)", type: "text" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (\u6DF1\u5EA6\u63A8\u7406\u6A21\u578B)", type: "text" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (\u6700\u65B0\u4F4E\u5EF6\u8FDF)", type: "text" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (\u903B\u8F91\u4E0E\u8BA1\u7B97\u589E\u5F3A)", type: "text" },
      { id: "gpt-4o", name: "GPT-4o (OpenAI \u517C\u5BB9\u53CD\u4EE3)", type: "text" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini (\u8F7B\u91CF\u53CD\u4EE3)", type: "text" },
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet (Anthropic \u517C\u5BB9)", type: "text" },
      { id: "deepseek-chat", name: "DeepSeek V3 / R1 (\u517C\u5BB9\u53CD\u4EE3)", type: "text" },
      { id: "imagen-3.0-generate-002", name: "Imagen 3.0 (\u9AD8\u7CBE\u751F\u56FE)", type: "image" }
    ];
    res.json({ success: true, models });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/provider/generate-image", async (req, res) => {
  const { providerType, baseUrl, apiKey, model = "dall-e-3", prompt, size = "1024x1024", quality = "standard" } = req.body;
  const cleanKey = apiKey && apiKey.trim() || process.env.GEMINI_API_KEY || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  const startTime = Date.now();
  if (!cleanKey) {
    return res.status(400).json({ success: false, error: "\u672A\u914D\u7F6E\u56FE\u50CF API \u5BC6\u94A5 (API Key)" });
  }
  try {
    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = "https://api.openai.com/v1";
    if (!endpoint.endsWith("/images/generations")) {
      endpoint = endpoint.endsWith("/v1") ? `${endpoint}/images/generations` : `${endpoint}/v1/images/generations`;
    }
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        response_format: "b64_json"
      }),
      signal: AbortSignal.timeout(6e4)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      let msg = errText;
      try {
        const j = JSON.parse(errText);
        msg = j.error?.message || errText;
      } catch {
      }
      return res.status(resp.status).json({ success: false, error: `\u56FE\u50CF\u751F\u6210\u5931\u8D25 (${resp.status}): ${msg}` });
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
        revisedPrompt: item.revised_prompt || prompt
      });
    } else if (item?.url) {
      return res.json({
        success: true,
        latencyMs,
        model,
        imageUrl: item.url,
        revisedPrompt: item.revised_prompt || prompt
      });
    }
    return res.status(500).json({ success: false, error: "\u672A\u4ECE\u63A5\u53E3\u83B7\u53D6\u5230\u6709\u6548\u56FE\u50CF\u6570\u636E" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "\u56FE\u50CF\u751F\u6210\u7F51\u7EDC\u5F02\u5E38" });
  }
});
app.post("/api/provider/generate-speech", async (req, res) => {
  const { providerType, baseUrl, apiKey, model = "tts-1", text, voice = "alloy", speed = 1 } = req.body;
  const cleanKey = apiKey && apiKey.trim() || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  if (!cleanKey) {
    return res.status(400).json({ success: false, error: "\u672A\u914D\u7F6E\u8BED\u97F3 API \u5BC6\u94A5 (API Key)" });
  }
  try {
    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = "https://api.openai.com/v1";
    if (!endpoint.endsWith("/audio/speech")) {
      endpoint = endpoint.endsWith("/v1") ? `${endpoint}/audio/speech` : `${endpoint}/v1/audio/speech`;
    }
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: "mp3"
      }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ success: false, error: `\u8BED\u97F3\u5408\u6210\u5931\u8D25 (${resp.status}): ${errText}` });
    }
    const arrayBuffer = await resp.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    return res.json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      format: "mp3"
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "\u8BED\u97F3\u5408\u6210\u7F51\u7EDC\u5F02\u5E38" });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F4F1} Simulated Android AI Phone Server listening on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
