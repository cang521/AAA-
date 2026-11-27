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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);

// src/lib/thinkCleaner.ts
function extractThinkingAndContent(rawText, extraReasoning) {
  const thinkingParts = [];
  if (extraReasoning && extraReasoning.trim()) {
    thinkingParts.push(extraReasoning.trim());
  }
  let text = rawText || "";
  const completeThinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  while ((match = completeThinkRegex.exec(text)) !== null) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      thinkingParts.push(thinkContent);
    }
  }
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (text.toLowerCase().includes("<think>")) {
    const thinkIndex = text.toLowerCase().indexOf("<think>");
    const unclosedContent = text.slice(thinkIndex + 7).trim();
    if (unclosedContent) {
      thinkingParts.push(unclosedContent);
    }
    text = text.slice(0, thinkIndex);
  }
  text = text.replace(/<\/think>/gi, "");
  const prefixMatch = text.match(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*([\s\S]*?)(?:\n\n|\r\n\r\n|$)/i);
  if (prefixMatch) {
    if (prefixMatch[1].trim()) {
      thinkingParts.push(prefixMatch[1].trim());
    }
    text = text.replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*[\s\S]*?(?:\n\n|\r\n\r\n|$)/i, "");
  }
  let cleanText = text.replace(/<think>/gi, "").replace(/<\/think>/gi, "").replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*/gi, "").replace(/reasoning_content[:：]?/gi, "").trim();
  const thinkingProcess = thinkingParts.filter(Boolean).join("\n\n") || "\u7ED3\u5408\u89D2\u8272\u4EBA\u8BBE\u3001\u4E2A\u4EBA\u56DE\u5FC6\u4E0E\u5386\u53F2\u5BF9\u8BDD\uFF0C\u5F62\u6210\u5FAE\u4FE1\u804A\u5929\u7684\u5373\u65F6\u601D\u8003\u8FC7\u7A0B\u3002";
  return { thinkingProcess, cleanText };
}
function sanitizeReplyText(text) {
  if (!text) return "";
  let clean = text;
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "");
  clean = clean.replace(/<think>[\s\S]*/gi, "");
  clean = clean.replace(/<\/think>/gi, "").replace(/^(?:思考过程|Thinking Process|Reasoning)[:：]?\s*/gi, "").replace(/reasoning_content[:：]?/gi, "").trim();
  return clean;
}

// src/lib/apiCapabilities.ts
var CAPABILITY_LABELS = {
  text_generation: "\u8BED\u8A00\u751F\u6210",
  image_generation: "\u56FE\u50CF\u751F\u6210",
  speech_generation: "\u8BED\u97F3\u751F\u6210",
  image_recognition: "\u56FE\u50CF\u8BC6\u522B",
  speech_recognition: "\u8BED\u97F3\u8BC6\u522B"
};
function classifyModelCapabilities(modelId, metadata) {
  const id = String(modelId || "").toLowerCase();
  const methods = (metadata?.supportedGenerationMethods || []).map((m) => String(m).toLowerCase());
  const supported = /* @__PURE__ */ new Set();
  const isImageGen = id.includes("imagen") || id.includes("dall-e") || id.includes("dalle") || id.includes("gpt-image") || id.includes("flux") || id.includes("midjourney") || id.includes("stable-diffusion") || id.includes("sdxl") || id.includes("kolors") || id.includes("ideogram") || id.includes("recraft") || id.includes("nano-banana") || id.includes("-image") || id.endsWith("image") || methods.includes("predict");
  const isSpeechGen = id.includes("tts") || id.includes("speech") || id.includes("cosyvoice") || id.includes("fish-speech") || id.includes("eleven") || id.includes("bark");
  const isSpeechRec = id.includes("whisper") || id.includes("transcribe") || id.includes("asr") || id.includes("sensevoice") || id.includes("paraformer");
  const isVisionCapable = !isImageGen && !isSpeechGen && !isSpeechRec && (id.includes("gpt-4o") || id.includes("gpt-4.1") || id.includes("gpt-4-vision") || id.includes("gpt-4-turbo") || id.includes("gpt-5") || id.includes("gemini-4") || id.includes("gemini-3") || id.includes("gemini-2.5") || id.includes("claude-3") || id.includes("claude-4") || id.includes("claude-sonnet-4") || id.includes("claude-opus-4") || id.includes("qwen-vl") || id.includes("qwen2-vl") || id.includes("qwen2.5-vl") || id.includes("vl") || id.includes("vision") || id.includes("pixtral") || id.includes("llava") || id.includes("glm-4v") || id.includes("internvl") || id.includes("minicpm-v"));
  const isPureEmbedding = id.includes("embedding") || id.includes("embed-") || id.includes("rerank");
  const isPureImageGen = id.includes("imagen") || id.includes("dall-e") || id.includes("dalle") || id.includes("gpt-image") || id.includes("flux") || id.includes("stable-diffusion") || id.includes("sdxl") || id.includes("midjourney");
  if (isImageGen) supported.add("image_generation");
  if (isSpeechGen) supported.add("speech_generation");
  if (isSpeechRec) supported.add("speech_recognition");
  if (isVisionCapable) {
    supported.add("image_recognition");
    supported.add("text_generation");
  }
  if (!isPureEmbedding && !isPureImageGen && !isSpeechGen && !isSpeechRec) {
    if (id.includes("gpt") || id.includes("gemini") || id.includes("claude") || id.includes("deepseek") || id.includes("qwen") || id.includes("llama") || id.includes("mistral") || id.includes("glm") || id.includes("moonshot") || id.includes("kimi") || id.includes("yi-") || id.includes("doubao") || id.includes("o1") || id.includes("o3") || id.includes("o4") || methods.includes("generatecontent")) {
      supported.add("text_generation");
    }
  }
  if (supported.size === 0) {
    return {
      primaryCategory: "text_generation",
      supportedCategories: ["text_generation", "image_generation", "image_recognition", "speech_generation", "speech_recognition"],
      confidence: "unknown",
      capabilityHint: "\u80FD\u529B\u672A\u660E\u786E\u6807\u6CE8\uFF0C\u53EF\u80FD\u652F\u6301\uFF0C\u4EE5\u5B9E\u9645\u6D4B\u8BD5\u4E3A\u51C6"
    };
  }
  let primaryCategory = "text_generation";
  if (isImageGen && !isVisionCapable) {
    primaryCategory = "image_generation";
  } else if (isSpeechRec) {
    primaryCategory = "speech_recognition";
  } else if (isSpeechGen) {
    primaryCategory = "speech_generation";
  } else if (isVisionCapable && (id.includes("-vl") || id.includes("vision") || id.includes("4v"))) {
    primaryCategory = "image_recognition";
  } else if (supported.has("text_generation")) {
    primaryCategory = "text_generation";
  }
  const list = Array.from(supported);
  const labelText = list.map((c) => CAPABILITY_LABELS[c]).join(" / ");
  return {
    primaryCategory,
    supportedCategories: list,
    confidence: isImageGen || isSpeechGen || isSpeechRec || isVisionCapable ? "known" : "inferred",
    capabilityHint: `\u53EF\u80FD\u652F\u6301\uFF1A${labelText}`
  };
}
function sanitizeSensitiveText(input, maxLength = 320) {
  if (input === null || input === void 0) return "";
  let text = typeof input === "string" ? input : String(input);
  text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{24,}/g, "[\u5DF2\u8131\u654F\u56FE\u7247\u6570\u636E]");
  text = text.replace(/data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{24,}/g, "[\u5DF2\u8131\u654F\u97F3\u9891\u6570\u636E]");
  text = text.replace(/([?&](?:key|api_key|apikey|token)=)([^&\s"']+)/gi, "$1***");
  text = text.replace(/(Bearer\s+)[A-Za-z0-9._\-+=/]{8,}/gi, "$1***");
  text = text.replace(/\bAIza[0-9A-Za-z\-_]{16,}\b/g, "AIza***");
  text = text.replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9\-_]{12,}\b/g, "sk-***");
  text = text.replace(/[A-Za-z0-9+/]{220,}={0,2}/g, "[\u5DF2\u7701\u7565\u957F\u7F16\u7801\u5185\u5BB9]");
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + "...";
  }
  return text;
}
function resolveEffectiveProtocol(config) {
  const proto = (config.apiProtocol || "").toLowerCase().trim();
  if (proto === "google_native" || proto === "gemini_native" || proto === "google") {
    return "google_native";
  }
  if (proto === "openai_compatible" || proto === "openai") {
    return "openai_compatible";
  }
  if (proto === "anthropic") {
    return "anthropic";
  }
  const prov = (config.provider || "").toLowerCase().trim();
  const base = (config.baseUrl || "").toLowerCase().trim();
  if (prov === "anthropic") return "anthropic";
  if (prov === "openai" || prov === "openai_compatible" || prov === "deepseek" || prov === "openrouter" || prov === "groq" || prov === "siliconflow" || prov === "ollama") {
    return "openai_compatible";
  }
  if (base.includes("generativelanguage.googleapis.com") || base.includes("/v1beta")) {
    return "google_native";
  }
  if (base && (base.includes("/v1") || base.includes("openai") || base.includes("deepseek") || base.includes("openrouter"))) {
    return "openai_compatible";
  }
  if (prov === "google_gemini") {
    return "google_native";
  }
  return "openai_compatible";
}
function resolveTextGenerationConfig(apiConfig, characterModelConfig) {
  const nestedText = apiConfig?.textApiConfig || apiConfig?.textGeneration || apiConfig?.apiSettings?.textGeneration;
  const pickField = (...candidates) => {
    for (const val of candidates) {
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
    for (const val of candidates) {
      if (typeof val === "string") {
        return val.trim();
      }
    }
    return "";
  };
  const apiKey = pickField(
    nestedText?.apiKey,
    apiConfig?.textApiKey,
    apiConfig?.apiKey
  );
  const baseUrl = pickField(
    nestedText?.baseUrl,
    apiConfig?.textBaseUrl,
    apiConfig?.baseUrl
  );
  const providerType = pickField(
    nestedText?.provider,
    apiConfig?.textProvider,
    apiConfig?.providerType,
    apiConfig?.provider,
    "google_gemini"
  );
  const charModel = pickField(
    characterModelConfig?.modelName,
    characterModelConfig?.model
  );
  const model = charModel || pickField(
    nestedText?.model,
    apiConfig?.textModel,
    apiConfig?.model,
    "gemini-4-hydrogen"
  );
  const rawProtocol = pickField(
    nestedText?.apiProtocol,
    apiConfig?.textApiProtocol,
    apiConfig?.apiProtocol
  );
  const apiProtocol = resolveEffectiveProtocol({
    apiProtocol: rawProtocol,
    provider: providerType,
    baseUrl
  });
  const customHeaders = (nestedText?.customHeaders && typeof nestedText.customHeaders === "object" ? nestedText.customHeaders : void 0) || (apiConfig?.customHeaders && typeof apiConfig.customHeaders === "object" ? apiConfig.customHeaders : void 0);
  const timeoutMs = Number(apiConfig?.timeoutMs) > 0 ? Number(apiConfig.timeoutMs) : Number(nestedText?.timeoutMs) > 0 ? Number(nestedText.timeoutMs) : 45e3;
  return {
    apiKey,
    baseUrl,
    model,
    providerType,
    apiProtocol,
    customHeaders,
    timeoutMs
  };
}

// src/lib/contextWindow.ts
var STANDARD_CONTEXT_LIMIT = 100;
var OVERFLOW_RAW_TAIL_LIMIT = 30;
var DEFAULT_CONTEXT_TOKEN_BUDGET = 26e3;
var DEFAULT_SINGLE_MESSAGE_MAX_CHARS = 4e3;
function estimateTextTokens(text) {
  if (!text) return 0;
  let cjkCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 19968 && code <= 40959) {
      cjkCount += 1;
    }
  }
  const nonCjkCount = text.length - cjkCount;
  return Math.max(1, Math.ceil(cjkCount * 1.5 + nonCjkCount * 0.35));
}
function truncateSingleMessageText(text, maxChars = DEFAULT_SINGLE_MESSAGE_MAX_CHARS) {
  const clean = String(text || "");
  if (clean.length <= maxChars) return clean;
  const keep = Math.max(120, maxChars - 24);
  return `${clean.slice(0, keep)}...(\u5DF2\u622A\u65AD\u8FC7\u957F\u6587\u672C)`;
}
function formatShortTime(ts) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MM}-${DD} ${hh}:${mm}`;
}
function summarizeMessagesChronologically(items, getSummaryMeta, maxSummaryChars = 6500) {
  if (!items || items.length === 0) return "";
  const lines = [];
  for (const item of items) {
    const meta = getSummaryMeta(item);
    const timeStr = formatShortTime(meta.timestamp);
    const sender = (meta.senderName || "").trim();
    const snippet = String(meta.text || "").replace(/\s+/g, " ").trim().slice(0, 110);
    if (!snippet) continue;
    const prefix = [timeStr ? `[${timeStr}]` : "", sender ? `${sender}:` : ""].filter(Boolean).join(" ");
    lines.push(`- ${prefix ? `${prefix} ` : ""}${snippet}`);
  }
  if (lines.length === 0) return "";
  const header = `\u3010\u8F83\u65E9 ${items.length} \u6761\u8BB0\u5F55\u65F6\u95F4\u7EBF\u6458\u8981\uFF08\u8D85\u957F\u4FDD\u62A4\u81EA\u52A8\u6298\u53E0\uFF09\u3011`;
  const joined = `${header}
${lines.join("\n")}`;
  if (joined.length <= maxSummaryChars) return joined;
  const keptTail = [];
  let charCount = header.length + 60;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (charCount + line.length + 1 > maxSummaryChars) break;
    keptTail.unshift(line);
    charCount += line.length + 1;
  }
  const omitted = lines.length - keptTail.length;
  return `${header}
${omitted > 0 ? `(\u7565\u53BB\u6700\u65E9\u671F ${omitted} \u6761\u6B21\u8981\u6D41\u6C34)
` : ""}${keptTail.join("\n")}`;
}
function applyOverlengthContextProtection(params) {
  const maxRawLimit = Math.max(1, params.maxRawLimit ?? STANDARD_CONTEXT_LIMIT);
  const overflowRawTail = Math.max(1, Math.min(maxRawLimit, params.overflowRawTail ?? OVERFLOW_RAW_TAIL_LIMIT));
  const tokenBudget = Math.max(2e3, params.tokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET);
  const singleMessageMaxChars = Math.max(300, params.singleMessageMaxChars ?? DEFAULT_SINGLE_MESSAGE_MAX_CHARS);
  const input = Array.isArray(params.messages) ? params.messages : [];
  const candidateSlice = input.length > maxRawLimit ? input.slice(-maxRawLimit) : [...input];
  const normalized = candidateSlice.map((item) => {
    const meta = params.formatForEstimate(item);
    if (meta.text && meta.text.length > singleMessageMaxChars && params.cloneWithTruncatedText) {
      return params.cloneWithTruncatedText(item, truncateSingleMessageText(meta.text, singleMessageMaxChars));
    }
    return item;
  });
  let totalTokens = 0;
  for (const item of normalized) {
    const meta = params.formatForEstimate(item);
    totalTokens += estimateTextTokens(`${meta.senderName || ""}: ${truncateSingleMessageText(meta.text || "", singleMessageMaxChars)}`);
  }
  if (totalTokens <= tokenBudget || normalized.length <= overflowRawTail) {
    if (totalTokens > tokenBudget && normalized.length > 0) {
      const perMsgCap = Math.max(400, Math.floor(tokenBudget * 0.75 / normalized.length));
      const trimmedTail = params.cloneWithTruncatedText ? normalized.map((item) => {
        const meta = params.formatForEstimate(item);
        return meta.text.length > perMsgCap ? params.cloneWithTruncatedText(item, truncateSingleMessageText(meta.text, perMsgCap)) : item;
      }) : normalized;
      const reEstimated = trimmedTail.reduce((sum, item) => {
        const meta = params.formatForEstimate(item);
        return sum + estimateTextTokens(`${meta.senderName || ""}: ${meta.text || ""}`);
      }, 0);
      return {
        rawMessages: trimmedTail,
        earlierSummaryText: "",
        metrics: {
          totalCandidateCount: input.length,
          rawCount: trimmedTail.length,
          summarizedCount: 0,
          didCompress: false,
          estimatedTokens: reEstimated,
          tokenBudget
        }
      };
    }
    return {
      rawMessages: normalized,
      earlierSummaryText: "",
      metrics: {
        totalCandidateCount: input.length,
        rawCount: normalized.length,
        summarizedCount: 0,
        didCompress: false,
        estimatedTokens: totalTokens,
        tokenBudget
      }
    };
  }
  const tailRaw = normalized.slice(-overflowRawTail);
  const earlierRaw = normalized.slice(0, normalized.length - tailRaw.length);
  const summaryBudgetTokens = Math.max(800, Math.floor(tokenBudget * 0.28));
  const maxSummaryChars = Math.min(8e3, Math.max(1200, Math.floor(summaryBudgetTokens * 0.65)));
  const earlierSummaryText = summarizeMessagesChronologically(
    earlierRaw,
    params.formatForEstimate,
    maxSummaryChars
  );
  let tailTokens = tailRaw.reduce((sum, item) => {
    const meta = params.formatForEstimate(item);
    return sum + estimateTextTokens(`${meta.senderName || ""}: ${truncateSingleMessageText(meta.text || "", singleMessageMaxChars)}`);
  }, 0);
  const summaryTokens = estimateTextTokens(earlierSummaryText);
  let finalTail = tailRaw;
  const remainingForTail = Math.max(1500, tokenBudget - summaryTokens);
  if (tailTokens > remainingForTail && params.cloneWithTruncatedText) {
    const avgCharAllowance = Math.max(300, Math.floor(remainingForTail / tailTokens * singleMessageMaxChars));
    finalTail = tailRaw.map((item) => {
      const meta = params.formatForEstimate(item);
      if (meta.text.length > avgCharAllowance) {
        return params.cloneWithTruncatedText(item, truncateSingleMessageText(meta.text, avgCharAllowance));
      }
      return item;
    });
    tailTokens = finalTail.reduce((sum, item) => {
      const meta = params.formatForEstimate(item);
      return sum + estimateTextTokens(`${meta.senderName || ""}: ${meta.text || ""}`);
    }, 0);
  }
  return {
    rawMessages: finalTail,
    earlierSummaryText,
    metrics: {
      totalCandidateCount: input.length,
      rawCount: finalTail.length,
      summarizedCount: earlierRaw.length,
      didCompress: true,
      estimatedTokens: tailTokens + summaryTokens,
      tokenBudget
    }
  };
}

// src/lib/forward/forwardBundleService.ts
function formatBundleTime(ts) {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${MM}-${DD} ${hh}:${mm}`;
}
function serializeForwardBundleForAi(bundle) {
  if (!bundle || !Array.isArray(bundle.items) || bundle.items.length === 0) {
    return bundle?.title ? `[\u8F6C\u53D1\u7684\u804A\u5929\u8BB0\u5F55\uFF1A${bundle.title}\uFF08\u65E0\u660E\u7EC6\uFF09]` : "[\u8F6C\u53D1\u7684\u804A\u5929\u8BB0\u5F55]";
  }
  const lines = bundle.items.slice(0, 60).map((item, idx) => {
    const t = formatBundleTime(item.timestamp);
    const quotePart = item.quoteSummary ? `[\u5F15\u7528 ${item.quoteSummary.senderName}: ${item.quoteSummary.text}] ` : "";
    let contentPart = item.cardSummary || item.text || "";
    if (item.messageType === "image" || item.messageType === "generated_image") {
      const desc = item.imageDescription ? `\u753B\u9762: ${item.imageDescription}` : "\u56FE\u7247\u5185\u5BB9\u672A\u8BC6\u522B";
      const ocr = item.detectedText ? ` | \u6587\u5B57: ${item.detectedText}` : "";
      contentPart = `[\u56FE\u7247(${desc}${ocr})]${item.text ? ` ${item.text}` : ""}`;
    } else if (!contentPart && item.imageDescription) {
      contentPart = `[\u56FE\u7247: ${item.imageDescription}]`;
    }
    return `  ${idx + 1}. ${t ? `[${t}] ` : ""}${item.senderName}: ${quotePart}${contentPart || "[\u7A7A\u6D88\u606F]"}`;
  });
  const extraNote = bundle.items.length > 60 ? `
  ...(\u5171 ${bundle.items.length} \u6761\u8BB0\u5F55\uFF0C\u4EE5\u4E0A\u5C55\u793A\u524D 60 \u6761)` : "";
  return `[\u8F6C\u53D1\u7684\u804A\u5929\u8BB0\u5F55\uFF1A${bundle.title}\uFF08\u5171 ${bundle.items.length} \u6761\uFF09]
${lines.join("\n")}${extraNote}`;
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "25mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
var PORT = Number(process.env.PORT || 3e3);
var IS_EMBEDDED_ANDROID = process.env.XIAOSHOUJI_EMBEDDED_NODE === "1";
var googleGenAiModulePromise = null;
async function loadGoogleGenAi() {
  if (!googleGenAiModulePromise) {
    googleGenAiModulePromise = import("@google/genai").catch((error) => {
      googleGenAiModulePromise = null;
      throw error;
    });
  }
  return googleGenAiModulePromise;
}
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    backend: "xiaoshouji-local-node",
    port: PORT,
    embedded: IS_EMBEDDED_ANDROID
  });
});
function buildApiLogObject(params) {
  const isFailed = params.status === "failed" || Boolean(params.error);
  const isOfficial = params.isOfficial !== false && (params.modelName.includes("gemini") || params.modelName.includes("imagen") || params.provider === "google_gemini");
  const defaultCostDisplay = isOfficial ? "\u514D\u8D39/\u5185\u7F6E" : "\u672A\u63D0\u4F9B";
  const normalizedCategory = params.category === "image" ? "image_generation" : params.category === "voice" ? "speech_generation" : params.category === "text" || !params.category ? "text_generation" : params.category;
  return {
    id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    appName: sanitizeSensitiveText(params.appName, 80),
    timestamp: Date.now(),
    provider: params.provider ? sanitizeSensitiveText(params.provider, 60) : void 0,
    modelName: sanitizeSensitiveText(params.modelName || "unknown", 80),
    interfaceType: params.interfaceType,
    category: normalizedCategory,
    status: isFailed ? "failed" : "success",
    httpStatus: params.httpStatus,
    requestId: params.requestId ? sanitizeSensitiveText(params.requestId, 80) : void 0,
    durationMs: params.durationMs,
    promptTokens: typeof params.usage?.promptTokens === "number" ? params.usage.promptTokens : null,
    completionTokens: typeof params.usage?.completionTokens === "number" ? params.usage.completionTokens : null,
    totalTokens: typeof params.usage?.totalTokens === "number" ? params.usage.totalTokens : typeof params.usage?.promptTokens === "number" && typeof params.usage?.completionTokens === "number" ? params.usage.promptTokens + params.usage.completionTokens : null,
    isRealTokens: Boolean(params.isRealTokens),
    estimatedCost: null,
    costDisplay: defaultCostDisplay,
    errorType: isFailed ? params.errorType || "ModelError" : void 0,
    errorMessage: params.error ? sanitizeSensitiveText(params.error, 260) : void 0,
    purpose: sanitizeSensitiveText(params.purpose, 160),
    protocol: params.protocol ? sanitizeSensitiveText(params.protocol, 40) : void 0,
    endpointType: params.endpointType ? sanitizeSensitiveText(params.endpointType, 40) : void 0,
    errorName: params.errorName ? sanitizeSensitiveText(params.errorName, 60) : void 0,
    causeCode: params.causeCode ? sanitizeSensitiveText(params.causeCode, 40) : void 0,
    causeErrno: typeof params.causeErrno === "number" ? params.causeErrno : void 0,
    causeSyscall: params.causeSyscall ? sanitizeSensitiveText(params.causeSyscall, 40) : void 0,
    headersReceived: typeof params.headersReceived === "boolean" ? params.headersReceived : void 0,
    readBodyFailed: typeof params.readBodyFailed === "boolean" ? params.readBodyFailed : void 0,
    mayHaveBeenCharged: typeof params.mayHaveBeenCharged === "boolean" ? params.mayHaveBeenCharged : void 0,
    upstreamRequestSent: typeof params.upstreamRequestSent === "boolean" ? params.upstreamRequestSent : void 0,
    ...typeof params.contextRawCount === "number" ? { contextRawCount: params.contextRawCount } : {},
    ...typeof params.contextSummarizedCount === "number" ? { contextSummarizedCount: params.contextSummarizedCount } : {},
    ...typeof params.contextEstimatedTokens === "number" ? { contextEstimatedTokens: params.contextEstimatedTokens } : {},
    ...typeof params.contextCompressed === "boolean" ? { contextCompressed: params.contextCompressed } : {}
  };
}
function buildGoogleRestBase(baseUrl) {
  const clean = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "https://generativelanguage.googleapis.com/v1beta";
  if (/\/v1(beta|alpha)?$/i.test(clean)) return clean;
  return `${clean}/v1beta`;
}
function buildOpenAiEndpoint(baseUrl, suffixPath) {
  const clean = (baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedSuffix = suffixPath.startsWith("/") ? suffixPath : `/${suffixPath}`;
  if (!clean) return `https://api.openai.com/v1${normalizedSuffix}`;
  if (clean.endsWith(normalizedSuffix)) return clean;
  if (clean.endsWith("/v1")) return `${clean}${normalizedSuffix}`;
  return `${clean}/v1${normalizedSuffix}`;
}
function assertSafeRemoteImageUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("\u56FE\u7247 URL \u683C\u5F0F\u65E0\u6548");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("\u4EC5\u652F\u6301 http/https \u6216 Base64 Data URL \u683C\u5F0F\u7684\u56FE\u7247");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "[::1]" || host === "0.0.0.0" || host.endsWith(".local") || host === "169.254.169.254" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^169\.254\./.test(host)) {
    throw new Error("\u51FA\u4E8E\u5B89\u5168\u9650\u5236\uFF0C\u4E0D\u5141\u8BB8\u8BFB\u53D6\u5185\u7F51\u6216\u672C\u673A\u5730\u5740\u7684\u8FDC\u7A0B\u56FE\u7247");
  }
  return parsed;
}
var IMAGE_IDEMPOTENCY_TTL_MS = 5 * 60 * 1e3;
var imageGenCompletedCache = /* @__PURE__ */ new Map();
var imageGenInFlightCache = /* @__PURE__ */ new Map();
var imageRecCompletedCache = /* @__PURE__ */ new Map();
var imageRecInFlightCache = /* @__PURE__ */ new Map();
function pruneImageCaches() {
  const now = Date.now();
  for (const [k, v] of imageGenCompletedCache.entries()) {
    if (v.expiresAt <= now) imageGenCompletedCache.delete(k);
  }
  for (const [k, v] of imageRecCompletedCache.entries()) {
    if (v.expiresAt <= now) imageRecCompletedCache.delete(k);
  }
}
var GEMINI_DEFAULT_TEXT_MODEL = "gemini-4-hydrogen";
var GEMINI_TEXT_FALLBACK_ORDER = ["gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
var geminiModelCooldownUntil = /* @__PURE__ */ new Map();
function isGemini4Model(modelName) {
  return modelName.startsWith("gemini-4-");
}
function normalizeOfficialGeminiModel(modelName) {
  const trimmed = modelName.trim();
  if (!trimmed || trimmed === "gemini-3.6-flash") {
    return GEMINI_DEFAULT_TEXT_MODEL;
  }
  return trimmed;
}
function isQuotaOrRateLimitError(msg) {
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded") || msg.includes("quota");
}
function isModelUnavailableError(msg) {
  return msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("not found");
}
function parseRetryCooldownMs(msg) {
  const match = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i) || msg.match(/Please retry in\s+(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (match) {
    if (match.length === 2 && match[1]) {
      const sec = parseInt(match[1], 10);
      return Math.min(Math.max(sec * 1e3, 6e4), 30 * 6e4);
    }
    const hours = parseInt(match[1] || "0", 10);
    const mins = parseInt(match[2] || "0", 10);
    const secs = Math.ceil(parseFloat(match[3] || "0"));
    const totalMs = (hours * 3600 + mins * 60 + secs) * 1e3;
    if (totalMs > 0) {
      return Math.min(Math.max(totalMs, 6e4), 30 * 6e4);
    }
  }
  return 15 * 6e4;
}
function buildGeminiConfigForModel(modelName, params) {
  const config = {};
  if (params.systemInstruction) {
    config.systemInstruction = params.systemInstruction;
  }
  if (params.responseMimeType) {
    config.responseMimeType = params.responseMimeType;
  }
  if (!isGemini4Model(modelName) && params.temperature !== void 0) {
    config.temperature = params.temperature;
  }
  if (params.maxTokens !== void 0) {
    config.maxOutputTokens = params.maxTokens;
  }
  return Object.keys(config).length > 0 ? config : void 0;
}
async function callAiServiceDetailed(params) {
  const cleanBaseUrl = params.baseUrl ? params.baseUrl.trim().replace(/\/+$/, "") : "";
  const cleanKey = params.apiKey && params.apiKey.trim() || "";
  const activeKey = cleanKey || (!cleanBaseUrl && (!params.providerType || params.providerType === "google_gemini") && process.env.NODE_ENV !== "production" ? process.env.GEMINI_API_KEY || "" : "");
  const targetModel = params.model?.trim() || GEMINI_DEFAULT_TEXT_MODEL;
  const effectiveProtocol = resolveEffectiveProtocol({
    apiProtocol: params.apiProtocol,
    provider: params.providerType,
    baseUrl: cleanBaseUrl
  });
  const startTime = Date.now();
  let headersReceived = false;
  let readBodyFailed = false;
  if (effectiveProtocol === "openai_compatible") {
    if (!cleanBaseUrl && !activeKey) {
      const err = new Error("\u672A\u914D\u7F6E Base URL \u6216 API Key\u3002\u8BF7\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u914D\u7F6E API Provider\u3002");
      err.statusCode = 400;
      err.errorType = "CONFIG_MISSING";
      err.upstreamRequestSent = false;
      err.mayHaveBeenCharged = false;
      throw err;
    }
    let endpoint = cleanBaseUrl;
    if (!endpoint) endpoint = "https://api.openai.com/v1";
    if (!endpoint.endsWith("/chat/completions")) {
      endpoint = endpoint.endsWith("/v1") ? `${endpoint}/chat/completions` : `${endpoint}/v1/chat/completions`;
    }
    const messages = [];
    if (params.systemInstruction) {
      messages.push({ role: "system", content: params.systemInstruction });
    }
    messages.push({ role: "user", content: params.prompt });
    const payload = {
      model: targetModel,
      messages,
      temperature: params.temperature ?? 0.7
    };
    if (params.maxTokens) {
      payload.max_tokens = params.maxTokens;
    }
    if (params.responseMimeType === "application/json") {
      payload.response_format = { type: "json_object" };
    }
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Connection": "close",
      ...params.customHeaders || {}
    };
    if (activeKey) {
      headers["Authorization"] = `Bearer ${activeKey}`;
    }
    if (endpoint.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://ai.studio.simulated.phone";
      headers["X-Title"] = "Simulated Android Phone";
    }
    const timeoutMs = params.timeoutMs || 45e3;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      headersReceived = true;
    } catch (fetchErr) {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const isAbort = fetchErr.name === "AbortError";
      const causeCode = fetchErr.cause?.code || fetchErr.code;
      const causeErrno = fetchErr.cause?.errno;
      const causeSyscall = fetchErr.cause?.syscall;
      const isNetworkDrop = causeCode === "ECONNRESET" || causeCode === "UND_ERR_SOCKET" || fetchErr.message?.includes("fetch failed");
      const enhancedErr = new Error(
        isAbort ? `\u8BF7\u6C42\u8D85\u65F6 (${timeoutMs / 1e3}\u79D2)\uFF0C\u4E0A\u6E38 API \u672A\u80FD\u5728\u9650\u5B9A\u65F6\u95F4\u5185\u8FD4\u56DE\u5B8C\u6574\u56DE\u590D\u3002` : `\u8FDE\u63A5\u4E0A\u6E38\u63A5\u53E3\u5931\u8D25 (${fetchErr.message || "fetch failed"})`
      );
      enhancedErr.name = fetchErr.name;
      enhancedErr.cause = fetchErr.cause;
      enhancedErr.protocol = "openai_compatible";
      enhancedErr.endpoint = endpoint;
      enhancedErr.headersReceived = false;
      enhancedErr.readBodyFailed = false;
      enhancedErr.durationMs = durationMs;
      enhancedErr.upstreamRequestSent = true;
      enhancedErr.mayHaveBeenCharged = isAbort || isNetworkDrop || durationMs > 12e3;
      enhancedErr.causeCode = causeCode;
      enhancedErr.causeErrno = causeErrno;
      enhancedErr.causeSyscall = causeSyscall;
      throw enhancedErr;
    }
    clearTimeout(timer);
    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch {
        readBodyFailed = true;
      }
      let parsedErrorMsg = errorText;
      try {
        const parsed = JSON.parse(errorText);
        parsedErrorMsg = parsed.error?.message || parsed.message || errorText;
      } catch {
      }
      const durationMs = Date.now() - startTime;
      let err;
      if (response.status === 401) {
        err = new Error(`[401 \u9274\u6743\u5931\u8D25] API Key \u65E0\u6548\u6216\u672A\u6388\u6743: ${parsedErrorMsg}`);
      } else if (response.status === 404) {
        err = new Error(`[404 \u8DEF\u7531\u6216\u6A21\u578B\u4E0D\u5B58\u5728] \u8BF7\u6C42\u7AEF\u70B9 ${endpoint} \u6216\u6A21\u578B ${targetModel} \u4E0D\u5B58\u5728: ${parsedErrorMsg}`);
      } else if (response.status === 429) {
        err = new Error(`[429 \u914D\u989D\u6216\u9650\u6D41] \u8D26\u6237\u914D\u989D\u4E0D\u8DB3\u6216\u89E6\u53D1\u8BF7\u6C42\u9891\u7387\u9650\u5236: ${parsedErrorMsg}`);
        err.isQuotaExceeded = true;
      } else if (response.status >= 500) {
        err = new Error(`[${response.status} \u670D\u52A1\u7AEF\u9519\u8BEF] API Provider \u4E0A\u6E38\u5F02\u5E38: ${parsedErrorMsg}`);
      } else {
        err = new Error(`[${response.status} API \u9519\u8BEF] ${parsedErrorMsg}`);
      }
      err.statusCode = response.status;
      err.protocol = "openai_compatible";
      err.endpoint = endpoint;
      err.headersReceived = true;
      err.readBodyFailed = readBodyFailed;
      err.durationMs = durationMs;
      err.upstreamRequestSent = true;
      err.mayHaveBeenCharged = true;
      throw err;
    }
    let resJson;
    try {
      resJson = await response.json();
    } catch (jsonErr) {
      readBodyFailed = true;
      const durationMs = Date.now() - startTime;
      const err = new Error(`\u4E0A\u6E38\u54CD\u5E94\u6570\u636E\u89E3\u6790\u5931\u8D25: ${jsonErr.message}`);
      err.name = jsonErr.name;
      err.cause = jsonErr.cause;
      err.statusCode = response.status;
      err.protocol = "openai_compatible";
      err.endpoint = endpoint;
      err.headersReceived = true;
      err.readBodyFailed = true;
      err.durationMs = durationMs;
      err.upstreamRequestSent = true;
      err.mayHaveBeenCharged = true;
      throw err;
    }
    const choice = resJson.choices?.[0];
    const messageObj = choice?.message;
    const reasoning = messageObj?.reasoning_content || messageObj?.reasoning || messageObj?.thinking;
    const content = typeof messageObj?.content === "string" ? messageObj.content : "";
    const fullText = reasoning && typeof reasoning === "string" && reasoning.trim() ? `<think>${reasoning.trim()}</think>${content}` : content;
    const usageMeta = resJson.usage;
    let usage = void 0;
    let isRealTokens = false;
    if (usageMeta && typeof usageMeta === "object") {
      isRealTokens = true;
      usage = {
        promptTokens: typeof usageMeta.prompt_tokens === "number" ? usageMeta.prompt_tokens : void 0,
        completionTokens: typeof usageMeta.completion_tokens === "number" ? usageMeta.completion_tokens : void 0,
        totalTokens: typeof usageMeta.total_tokens === "number" ? usageMeta.total_tokens : void 0
      };
    }
    return {
      text: fullText,
      usage,
      isRealTokens,
      modelUsed: targetModel
    };
  }
  if (effectiveProtocol === "google_native") {
    if (!activeKey) {
      const err = new Error("\u672A\u914D\u7F6E Gemini API Key\uFF0C\u4E14\u7CFB\u7EDF\u73AF\u5883\u4E2D\u65E0\u9ED8\u8BA4\u5BC6\u94A5\u3002\u8BF7\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u914D\u7F6E API Provider\u3002");
      err.statusCode = 400;
      err.errorType = "CONFIG_MISSING";
      err.upstreamRequestSent = false;
      err.mayHaveBeenCharged = false;
      throw err;
    }
    const clientOptions = {
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
          "Connection": "close",
          ...params.customHeaders || {}
        }
      }
    };
    if (cleanBaseUrl) {
      clientOptions.httpOptions.baseUrl = cleanBaseUrl.replace(/\/v1(beta|alpha)?\/?$/i, "").replace(/\/+$/, "");
    }
    const isOfficialGeminiEndpoint = !cleanBaseUrl || cleanBaseUrl.includes("googleapis.com");
    const primaryModel = isOfficialGeminiEndpoint ? normalizeOfficialGeminiModel(targetModel) : targetModel;
    try {
      const { GoogleGenAI } = await loadGoogleGenAi();
      const aiClient = new GoogleGenAI(clientOptions);
      let result;
      let usedModel = primaryModel;
      if (isOfficialGeminiEndpoint) {
        const now = Date.now();
        const orderedCandidates = Array.from(/* @__PURE__ */ new Set([primaryModel, ...GEMINI_TEXT_FALLBACK_ORDER]));
        const activeCandidates = orderedCandidates.filter((m) => (geminiModelCooldownUntil.get(m) || 0) <= now);
        if (activeCandidates.length === 0) {
          const minWaitMs = Math.min(...orderedCandidates.map((m) => (geminiModelCooldownUntil.get(m) || now) - now));
          const waitMins = Math.max(1, Math.ceil(minWaitMs / 6e4));
          const cooldownErr = new Error(
            `[Gemini 429 \u914D\u989D\u4FDD\u62A4] \u5F53\u524D\u6240\u6709\u53EF\u7528 Gemini \u6A21\u578B\u914D\u989D\u5DF2\u89E6\u53CA\u9650\u5236\uFF0C\u5C06\u5728\u7EA6 ${waitMins} \u5206\u949F\u540E\u81EA\u52A8\u6062\u590D\u5C1D\u8BD5\uFF1B\u60A8\u4E5F\u53EF\u4EE5\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u5207\u6362\u4ED8\u8D39 API Key \u6216\u5176\u4ED6\u517C\u5BB9 Provider\u3002`
          );
          cooldownErr.statusCode = 429;
          cooldownErr.isQuotaExceeded = true;
          throw cooldownErr;
        }
        let lastErr = null;
        let recovered = false;
        for (let idx = 0; idx < activeCandidates.length; idx++) {
          const candidateModel = activeCandidates[idx];
          const generateOptions = {
            model: candidateModel,
            contents: params.prompt
          };
          const modelConfig = buildGeminiConfigForModel(candidateModel, params);
          if (modelConfig) {
            generateOptions.config = modelConfig;
          }
          try {
            result = await aiClient.models.generateContent(generateOptions);
            usedModel = candidateModel;
            recovered = true;
            if (idx > 0) {
              console.info(`[Gemini Fallback] ${primaryModel} \u53D7\u9650\uFF0C\u5DF2\u81EA\u52A8\u5207\u6362\u81F3 ${candidateModel}`);
            }
            break;
          } catch (candidateErr) {
            lastErr = candidateErr;
            const msg = String(candidateErr?.message || candidateErr || "");
            if (isQuotaOrRateLimitError(msg)) {
              geminiModelCooldownUntil.set(candidateModel, Date.now() + parseRetryCooldownMs(msg));
              continue;
            }
            if (isModelUnavailableError(msg)) {
              geminiModelCooldownUntil.set(candidateModel, Date.now() + 60 * 6e4);
              continue;
            }
            throw candidateErr;
          }
        }
        if (!recovered) {
          throw lastErr || new Error("Gemini API \u914D\u989D\u5DF2\u7528\u5C3D (429 RESOURCE_EXHAUSTED)");
        }
      } else {
        const generateOptions = {
          model: primaryModel,
          contents: params.prompt
        };
        const modelConfig = buildGeminiConfigForModel(primaryModel, params);
        if (modelConfig) {
          generateOptions.config = modelConfig;
        }
        result = await aiClient.models.generateContent(generateOptions);
      }
      const usageMeta = result?.usageMetadata;
      let usage = void 0;
      let isRealTokens = false;
      if (usageMeta && typeof usageMeta === "object") {
        isRealTokens = true;
        usage = {
          promptTokens: typeof usageMeta.promptTokenCount === "number" ? usageMeta.promptTokenCount : void 0,
          completionTokens: typeof usageMeta.candidatesTokenCount === "number" ? usageMeta.candidatesTokenCount : void 0,
          totalTokens: typeof usageMeta.totalTokenCount === "number" ? usageMeta.totalTokenCount : void 0
        };
      }
      return {
        text: result?.text || "",
        usage,
        isRealTokens,
        modelUsed: usedModel
      };
    } catch (geminiErr) {
      const errMsg = geminiErr.message || "";
      const durationMs = Date.now() - startTime;
      const causeCode = geminiErr.cause?.code || geminiErr.code;
      const causeErrno = geminiErr.cause?.errno;
      const causeSyscall = geminiErr.cause?.syscall;
      let err;
      if (errMsg.includes("401") || errMsg.includes("API_KEY_INVALID")) {
        err = new Error(`[Gemini 401 \u9274\u6743\u5931\u8D25] Gemini API Key \u65E0\u6548: ${errMsg}`);
        err.statusCode = 401;
      } else if (errMsg.includes("404") || errMsg.includes("NOT_FOUND")) {
        err = new Error(`[Gemini 404 \u6A21\u578B\u4E0D\u5B58\u5728] \u6A21\u578B ${targetModel} \u5728\u6B64\u7AEF\u70B9\u4E0D\u53EF\u7528: ${errMsg}`);
        err.statusCode = 404;
      } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded") || errMsg.includes("quota")) {
        err = new Error(`[Gemini 429 \u914D\u989D\u7528\u5C3D] API \u989D\u5EA6\u8D85\u9650\u6216\u53D7\u9650: ${errMsg}`);
        err.statusCode = 429;
        err.isQuotaExceeded = true;
      } else {
        err = geminiErr;
      }
      err.protocol = "google_native";
      err.endpoint = cleanBaseUrl || "https://generativelanguage.googleapis.com";
      err.durationMs = durationMs;
      err.upstreamRequestSent = true;
      err.mayHaveBeenCharged = durationMs > 1e4 || errMsg.includes("fetch failed");
      err.causeCode = causeCode;
      err.causeErrno = causeErrno;
      err.causeSyscall = causeSyscall;
      throw err;
    }
  }
  throw new Error(`\u4E0D\u652F\u6301\u7684 API \u534F\u8BAE: ${effectiveProtocol}`);
}
async function callAiService(params) {
  const result = await callAiServiceDetailed(params);
  return result.text;
}
function handleAiEndpointError(res, error, contextName) {
  const isQuota = error?.statusCode === 429 || error?.isQuotaExceeded || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("Quota exceeded") || error?.message?.includes("\u914D\u989D\u7528\u5C3D") || error?.message?.includes("quota");
  const httpStatus = isQuota ? 429 : typeof error?.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502;
  const statusMsg = isQuota ? "429 \u914D\u989D\u8D85\u9650/\u8BF7\u6C42\u9891\u7387\u8FC7\u9AD8" : error?.message || `${contextName} \u6267\u884C\u5F02\u5E38`;
  const endpointType = error?.protocol === "openai_compatible" ? "chat_completions" : error?.protocol === "google_native" ? "generate_content" : void 0;
  if (isQuota) {
    console.info(`[${contextName}] AI Provider \u89E6\u53D1 429 \u914D\u989D\u4FDD\u62A4: ${statusMsg}`);
    return res.status(429).json({
      success: false,
      statusCode: 429,
      isQuotaExceeded: true,
      error: error.message || "API quota exceeded or rate limited",
      errorMessage: error.message || "API quota exceeded or rate limited",
      errorType: error?.errorType || "rate_limit",
      protocol: error?.protocol,
      causeCode: error?.causeCode,
      upstreamRequestSent: typeof error?.upstreamRequestSent === "boolean" ? error.upstreamRequestSent : true,
      mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
      retryable: true,
      apiLog: buildApiLogObject({
        appName: contextName || "AI\u63A5\u53E3",
        modelName: error?.model || GEMINI_DEFAULT_TEXT_MODEL,
        interfaceType: "AiEndpoint",
        status: "failed",
        httpStatus: 429,
        durationMs: error?.durationMs || 0,
        errorType: error?.errorType || "rate_limit",
        error: statusMsg,
        purpose: `${contextName} (\u8BF7\u6C42\u5931\u8D25 429)`,
        protocol: error?.protocol,
        endpointType,
        errorName: error?.name,
        causeCode: error?.causeCode,
        causeErrno: error?.causeErrno,
        causeSyscall: error?.causeSyscall,
        headersReceived: error?.headersReceived,
        readBodyFailed: error?.readBodyFailed,
        mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
        upstreamRequestSent: typeof error?.upstreamRequestSent === "boolean" ? error.upstreamRequestSent : true
      })
    });
  }
  console.error(`${contextName} error:`, error?.message || error);
  return res.status(httpStatus).json({
    success: false,
    statusCode: httpStatus,
    error: error?.message || `${contextName} failed`,
    errorMessage: error?.message || `${contextName} failed`,
    errorType: error?.errorType || (httpStatus === 401 ? "auth_error" : "upstream_error"),
    protocol: error?.protocol,
    causeCode: error?.causeCode,
    upstreamRequestSent: typeof error?.upstreamRequestSent === "boolean" ? error.upstreamRequestSent : true,
    mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
    retryable: true,
    apiLog: buildApiLogObject({
      appName: contextName || "AI\u63A5\u53E3",
      modelName: error?.model || GEMINI_DEFAULT_TEXT_MODEL,
      interfaceType: "AiEndpoint",
      status: "failed",
      httpStatus,
      durationMs: error?.durationMs || 0,
      errorType: error?.errorType || "network_error",
      error: statusMsg,
      purpose: `${contextName} (\u8BF7\u6C42\u5931\u8D25 ${httpStatus})`,
      protocol: error?.protocol,
      endpointType,
      errorName: error?.name,
      causeCode: error?.causeCode,
      causeErrno: error?.causeErrno,
      causeSyscall: error?.causeSyscall,
      headersReceived: error?.headersReceived,
      readBodyFailed: error?.readBodyFailed,
      mayHaveBeenCharged: Boolean(error?.mayHaveBeenCharged),
      upstreamRequestSent: typeof error?.upstreamRequestSent === "boolean" ? error.upstreamRequestSent : true
    })
  });
}
app.post("/api/provider/test-connection", async (req, res) => {
  const { providerType, baseUrl, apiKey, serviceType = "text", customHeaders } = req.body;
  const startTime = Date.now();
  const cleanKey = apiKey && apiKey.trim() || "";
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
  if (providerType === "google_gemini") {
    const isV1Path = cleanBaseUrl.includes("/v1") && !cleanBaseUrl.includes("v1beta");
    const testEndpoint = cleanBaseUrl ? isV1Path ? cleanBaseUrl.endsWith("/models") ? cleanBaseUrl : `${cleanBaseUrl}/models` : cleanBaseUrl.endsWith("/v1beta") ? `${cleanBaseUrl}/models?key=${cleanKey}` : `${cleanBaseUrl}/v1beta/models?key=${cleanKey}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    try {
      const resp = await fetch(testEndpoint, {
        method: "GET",
        headers: {
          "User-Agent": "aistudio-build-provider-test",
          "x-goog-api-key": cleanKey,
          "Authorization": `Bearer ${cleanKey}`,
          ...customHeaders
        },
        signal: AbortSignal.timeout(1e4)
      });
      const latencyMs = Date.now() - startTime;
      if (!resp.ok) {
        if (cleanBaseUrl && (resp.status === 404 || resp.status === 405)) {
          const probeEndpoint = cleanBaseUrl.endsWith("/v1beta") ? `${cleanBaseUrl}/models/gemini-2.5-flash:generateContent?key=${cleanKey}` : `${cleanBaseUrl}/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`;
          try {
            const probeResp = await fetch(probeEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": cleanKey,
                "Authorization": `Bearer ${cleanKey}`,
                ...customHeaders
              },
              body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
              signal: AbortSignal.timeout(1e4)
            });
            if (probeResp.ok) {
              return res.json({
                success: true,
                latencyMs: Date.now() - startTime,
                statusCode: 200,
                statusText: "OK",
                providerType: "google_gemini",
                checkedEndpoint: probeEndpoint.replace(cleanKey, "***"),
                maskedKey,
                availableModelsCount: 1,
                message: `Google Gemini \u81EA\u5B9A\u4E49\u53CD\u4EE3 API \u8FDE\u901A\u6210\u529F\uFF01(generateContent \u94FE\u8DEF\u6B63\u5E38\uFF0C\u8017\u65F6 ${Date.now() - startTime}ms)`
              });
            }
          } catch {
          }
        }
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
            message: cleanBaseUrl ? `\u53CD\u4EE3 API Key \u9274\u6743\u5931\u8D25 (${resp.status})` : "Gemini API Key \u9274\u6743\u5931\u8D25",
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
      const modelsCount = Array.isArray(data.models) ? data.models.length : Array.isArray(data.data) ? data.data.length : 0;
      return res.json({
        success: true,
        latencyMs,
        statusCode: 200,
        statusText: "OK",
        providerType: "google_gemini",
        checkedEndpoint: testEndpoint.replace(cleanKey, "***"),
        maskedKey,
        availableModelsCount: modelsCount,
        message: `${cleanBaseUrl ? "\u81EA\u5B9A\u4E49\u53CD\u4EE3" : "Google Gemini \u5B98\u65B9"} API \u8FDE\u901A\u6210\u529F\uFF01\u68C0\u6D4B\u5230 ${modelsCount} \u4E2A\u53EF\u7528\u6A21\u578B (\u8017\u65F6 ${latencyMs}ms)`
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
  const cleanKey = apiKey && apiKey.trim() || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  console.log("[API Key Log - Server fetch-models Auto-Probe Received]", {
    providerType,
    baseUrl: cleanBaseUrl,
    serviceType,
    keyIsEmpty: !cleanKey,
    keyLength: cleanKey ? cleanKey.length : 0,
    keyLast4: cleanKey ? cleanKey.slice(-4) : ""
  });
  if (!cleanKey && providerType !== "ollama") {
    return res.status(400).json({
      success: false,
      supported: false,
      models: [],
      errorType: "auth_error",
      message: "\u8BF7\u5148\u8F93\u5165\u6709\u6548\u7684 API Key \u518D\u83B7\u53D6\u6A21\u578B\u5217\u8868\u3002"
    });
  }
  const maskedKey = cleanKey ? cleanKey.length > 4 ? `***${cleanKey.slice(-4)}` : "***" : "";
  const attemptsTrace = [];
  const overallStartTime = Date.now();
  {
    let urlCandidate = "";
    if (!cleanBaseUrl) {
      urlCandidate = "https://api.openai.com/v1/models";
    } else if (cleanBaseUrl.endsWith("/v1")) {
      urlCandidate = `${cleanBaseUrl}/models`;
    } else {
      urlCandidate = `${cleanBaseUrl}/v1/models`;
    }
    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = (/* @__PURE__ */ new Date()).toISOString();
    const tStart = Date.now();
    try {
      const headers = {
        "User-Agent": "aistudio-build-models-fetch",
        "Content-Type": "application/json",
        ...customHeaders
      };
      if (cleanKey) {
        headers["Authorization"] = `Bearer ${cleanKey}`;
      }
      const resp = await fetch(urlCandidate, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(1e4)
      });
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m) => {
            const id = String(typeof m === "string" ? m : m.id || m.name || "");
            const cap = classifyModelCapabilities(id, typeof m === "object" ? m : void 0);
            const legacyType = cap.primaryCategory === "image_generation" ? "image" : cap.primaryCategory === "speech_generation" || cap.primaryCategory === "speech_recognition" ? "voice" : "text";
            return {
              id,
              name: typeof m === "object" && m.name ? m.name : id,
              type: legacyType,
              capabilityCategory: cap.primaryCategory,
              supportedCapabilities: cap.supportedCategories,
              capabilityHint: cap.capabilityHint,
              confidence: cap.confidence,
              owned_by: typeof m === "object" ? m.owned_by || m.permission?.[0]?.organization || "OpenAI-Proxy" : "OpenAI-Proxy"
            };
          });
          attemptsTrace.push({
            attemptIndex: 1,
            adapterName: "OpenAI-Compatible Adapter (/v1/models)",
            protocolKey: "openai_compatible",
            finalUrl: maskedUrl,
            method: "GET",
            authMethod: "Authorization: Bearer ***",
            timeoutMs: 1e4,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length
          });
          return res.json({
            success: true,
            supported: true,
            apiProtocol: "openai_compatible",
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `\u81EA\u52A8\u63A2\u6D4B\u6210\u529F\uFF01\u5339\u914D OpenAI \u517C\u5BB9\u534F\u8BAE\uFF0C\u6210\u529F\u83B7\u53D6 ${formatted.length} \u4E2A\u771F\u5B9E\u6A21\u578B`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime
          });
        }
      }
      const errText = await resp.text().catch(() => "");
      attemptsTrace.push({
        attemptIndex: 1,
        adapterName: "OpenAI-Compatible Adapter (/v1/models)",
        protocolKey: "openai_compatible",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "Authorization: Bearer ***",
        timeoutMs: 1e4,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || "\u672A\u8FD4\u56DE\u6709\u6548\u6A21\u578B\u5217\u8868"}`
      });
    } catch (err) {
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      attemptsTrace.push({
        attemptIndex: 1,
        adapterName: "OpenAI-Compatible Adapter (/v1/models)",
        protocolKey: "openai_compatible",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "Authorization: Bearer ***",
        timeoutMs: 1e4,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === "AbortError" ? "\u8BF7\u6C42\u8D85\u65F6 (10\u79D2)" : err.message || "\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38"
      });
    }
  }
  {
    let urlCandidate = "";
    if (!cleanBaseUrl) {
      urlCandidate = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
    } else if (cleanBaseUrl.includes("v1beta")) {
      urlCandidate = cleanBaseUrl.endsWith("/models") ? `${cleanBaseUrl}?key=${cleanKey}` : `${cleanBaseUrl}/models?key=${cleanKey}`;
    } else if (cleanBaseUrl.endsWith("/v1")) {
      urlCandidate = `${cleanBaseUrl}/models`;
    } else {
      urlCandidate = `${cleanBaseUrl}/v1beta/models?key=${cleanKey}`;
    }
    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = (/* @__PURE__ */ new Date()).toISOString();
    const tStart = Date.now();
    try {
      const headers = {
        "User-Agent": "aistudio-build-models-fetch",
        "x-goog-api-key": cleanKey,
        "Authorization": `Bearer ${cleanKey}`,
        ...customHeaders
      };
      const resp = await fetch(urlCandidate, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(1e4)
      });
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.models) ? data.models : Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m) => {
            const id = (typeof m === "string" ? m : m.id || m.name || "").replace(/^models\//, "");
            const cap = classifyModelCapabilities(id, typeof m === "object" ? m : void 0);
            const legacyType = cap.primaryCategory === "image_generation" ? "image" : cap.primaryCategory === "speech_generation" || cap.primaryCategory === "speech_recognition" ? "voice" : "text";
            return {
              id,
              name: typeof m === "object" && (m.displayName || m.name) ? m.displayName || m.name : id,
              description: typeof m === "object" ? m.description || "" : "",
              type: legacyType,
              capabilityCategory: cap.primaryCategory,
              supportedCapabilities: cap.supportedCategories,
              capabilityHint: cap.capabilityHint,
              confidence: cap.confidence,
              contextWindow: typeof m === "object" ? m.inputTokenLimit : void 0,
              owned_by: typeof m === "object" && m.owned_by ? m.owned_by : cleanBaseUrl ? "Gemini-Proxy" : "Google"
            };
          });
          attemptsTrace.push({
            attemptIndex: 2,
            adapterName: "Gemini Native REST Adapter (/v1beta/models)",
            protocolKey: "google_native",
            finalUrl: maskedUrl,
            method: "GET",
            authMethod: "QueryParam (?key=) & Headers",
            timeoutMs: 1e4,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length
          });
          return res.json({
            success: true,
            supported: true,
            apiProtocol: "google_native",
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `\u81EA\u52A8\u63A2\u6D4B\u6210\u529F\uFF01\u5339\u914D Google \u539F\u751F\u534F\u8BAE\uFF0C\u6210\u529F\u83B7\u53D6 ${formatted.length} \u4E2A\u771F\u5B9E\u6A21\u578B`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime
          });
        }
      }
      const errText = await resp.text().catch(() => "");
      attemptsTrace.push({
        attemptIndex: 2,
        adapterName: "Gemini Native REST Adapter (/v1beta/models)",
        protocolKey: "gemini_native",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "QueryParam (?key=) & Headers",
        timeoutMs: 1e4,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || "\u672A\u8FD4\u56DE\u6709\u6548\u6A21\u578B\u5217\u8868"}`
      });
    } catch (err) {
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      attemptsTrace.push({
        attemptIndex: 2,
        adapterName: "Gemini Native REST Adapter (/v1beta/models)",
        protocolKey: "gemini_native",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "QueryParam (?key=) & Headers",
        timeoutMs: 1e4,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === "AbortError" ? "\u8BF7\u6C42\u8D85\u65F6 (10\u79D2)" : err.message || "\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38"
      });
    }
  }
  if (cleanBaseUrl && !cleanBaseUrl.endsWith("/v1") && !cleanBaseUrl.includes("v1beta")) {
    const urlCandidate = `${cleanBaseUrl}/models`;
    const maskedUrl = urlCandidate.replace(cleanKey, maskedKey);
    const startIso = (/* @__PURE__ */ new Date()).toISOString();
    const tStart = Date.now();
    try {
      const headers = {
        "User-Agent": "aistudio-build-models-fetch",
        "Content-Type": "application/json",
        ...customHeaders
      };
      if (cleanKey) {
        headers["Authorization"] = `Bearer ${cleanKey}`;
      }
      const resp = await fetch(urlCandidate, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8e3)
      });
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((m) => {
            const id = typeof m === "string" ? m : m.id || m.name;
            return {
              id: String(id),
              name: typeof m === "object" && m.name ? m.name : String(id),
              type: "text",
              owned_by: "Proxy-Direct"
            };
          });
          attemptsTrace.push({
            attemptIndex: 3,
            adapterName: "Direct Endpoint Adapter (/models)",
            protocolKey: "openai_compatible",
            finalUrl: maskedUrl,
            method: "GET",
            authMethod: "Authorization: Bearer ***",
            timeoutMs: 8e3,
            startTime: startIso,
            endTime: endIso,
            latencyMs: tEnd - tStart,
            httpStatus: resp.status,
            success: true,
            modelsCount: formatted.length
          });
          return res.json({
            success: true,
            supported: true,
            apiProtocol: "openai_compatible",
            models: formatted,
            sourceEndpoint: maskedUrl,
            message: `\u81EA\u52A8\u63A2\u6D4B\u6210\u529F\uFF01\u5339\u914D\u76F4\u8FDE\u8DEF\u5F84 /models\uFF0C\u83B7\u53D6\u5230 ${formatted.length} \u4E2A\u6A21\u578B`,
            attemptsTrace,
            totalTimeMs: Date.now() - overallStartTime
          });
        }
      }
      const errText = await resp.text().catch(() => "");
      attemptsTrace.push({
        attemptIndex: 3,
        adapterName: "Direct Endpoint Adapter (/models)",
        protocolKey: "openai_compatible",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "Authorization: Bearer ***",
        timeoutMs: 8e3,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        httpStatus: resp.status,
        success: false,
        modelsCount: 0,
        error: `HTTP ${resp.status}: ${errText.slice(0, 100) || "\u672A\u8FD4\u56DE\u6709\u6548\u6A21\u578B\u5217\u8868"}`
      });
    } catch (err) {
      const tEnd = Date.now();
      const endIso = (/* @__PURE__ */ new Date()).toISOString();
      attemptsTrace.push({
        attemptIndex: 3,
        adapterName: "Direct Endpoint Adapter (/models)",
        protocolKey: "openai_compatible",
        finalUrl: maskedUrl,
        method: "GET",
        authMethod: "Authorization: Bearer ***",
        timeoutMs: 8e3,
        startTime: startIso,
        endTime: endIso,
        latencyMs: tEnd - tStart,
        success: false,
        modelsCount: 0,
        error: err.name === "AbortError" ? "\u8BF7\u6C42\u8D85\u65F6 (8\u79D2)" : err.message || "\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38"
      });
    }
  }
  return res.status(500).json({
    success: false,
    supported: false,
    models: [],
    message: "\u81EA\u52A8\u63A5\u53E3\u534F\u8BAE\u63A2\u6D4B\u5931\u8D25\uFF1A\u5F53\u524D Base URL \u4E0E API Key \u5747\u65E0\u6CD5\u901A\u8FC7 OpenAI \u517C\u5BB9\u6216 Gemini \u539F\u751F\u63A5\u53E3\u83B7\u53D6\u6A21\u578B\u5217\u8868\u3002\u8BF7\u68C0\u67E5 Base URL \u4E0E Key \u662F\u5426\u6B63\u786E\uFF0C\u6216\u5C1D\u8BD5\u624B\u52A8\u8F93\u5165\u6A21\u578B\u540D\u79F0\u3002",
    attemptsTrace,
    totalTimeMs: Date.now() - overallStartTime
  });
});
app.post("/api/provider/test-model", async (req, res) => {
  const { providerType, baseUrl, apiKey, model, apiProtocol, serviceType = "text", testPrompt, customHeaders } = req.body;
  const startTime = Date.now();
  const prompt = testPrompt || "\u8BF7\u4EC5\u56DE\u590D\u4E00\u53E5\u8BDD\uFF1A\u6A21\u578B\u94FE\u8DEF\u6D4B\u8BD5\u6B63\u5E38\uFF0C\u5DF2\u51C6\u5907\u5C31\u7EEA\uFF01";
  const resolvedCfg = resolveTextGenerationConfig({
    apiKey,
    baseUrl,
    model,
    providerType,
    apiProtocol,
    customHeaders,
    timeoutMs: 25e3
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
      customHeaders: resolvedCfg.customHeaders
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
        completionTokens: detailed.usage?.completionTokens ?? Math.round(reply.length / 2)
      });
    }
    return res.status(502).json({
      success: false,
      latencyMs,
      model: resolvedCfg.model,
      apiProtocol: resolvedCfg.apiProtocol,
      mayHaveBeenCharged: true,
      error: "\u6A21\u578B\u5DF2\u54CD\u5E94\u4F46\u8FD4\u56DE\u7A7A\u5185\u5BB9"
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return res.status(err?.statusCode || 502).json({
      success: false,
      latencyMs,
      model: resolvedCfg.model,
      apiProtocol: err?.protocol || resolvedCfg.apiProtocol,
      causeCode: err?.causeCode,
      mayHaveBeenCharged: Boolean(err?.mayHaveBeenCharged),
      error: err.message || "\u6A21\u578B\u6267\u884C\u6D4B\u8BD5\u5931\u8D25"
    });
  }
});
app.post("/api/test-api", async (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  const startTime = Date.now();
  const cleanKey = apiKey && apiKey.trim() || process.env.GEMINI_API_KEY || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  const targetModel = model || "gemini-4-hydrogen";
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
      const osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`;
      const osmResp = await fetch(osmUrl, {
        headers: { "User-Agent": "SimulatedAndroidPhone/2.0 (weather-app)" },
        signal: AbortSignal.timeout(5500)
      });
      if (osmResp.ok) {
        const osmData = await osmResp.json();
        const addr = osmData.address || {};
        const city = addr.city || addr.town || addr.county || addr.district || addr.state || "\u5F53\u524D\u4F4D\u7F6E";
        const district = addr.suburb || addr.district || addr.neighbourhood || "";
        const province = addr.state || "";
        const country = addr.country || "\u4E2D\u56FD";
        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);
        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayParts.join(" ") || osmData.display_name || `${country} ${province} ${city}`,
          source: "OpenStreetMap"
        });
      }
    } catch (e) {
      console.warn("OSM reverse geocode error:", e);
    }
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
      const bdcResp = await fetch(bdcUrl, { signal: AbortSignal.timeout(4e3) });
      if (bdcResp.ok) {
        const bdcData = await bdcResp.json();
        const city = bdcData.city || bdcData.locality || bdcData.principalSubdivision || "\u5F53\u524D\u4F4D\u7F6E";
        const district = bdcData.locality || "";
        const province = bdcData.principalSubdivision || "";
        const country = bdcData.countryName || "\u4E2D\u56FD";
        const displayParts = [country, province, city, district].filter((p, i, arr) => p && arr.indexOf(p) === i);
        return res.json({
          success: true,
          latitude: lat,
          longitude: lon,
          city,
          district,
          province,
          country,
          displayName: displayParts.join(" ") || city,
          source: "BigDataCloud"
        });
      }
    } catch {
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
var weatherServerCache = /* @__PURE__ */ new Map();
var openMeteoBlockedUntil = 0;
async function firstNonNull(promises) {
  if (promises.length === 0) return null;
  return new Promise((resolve) => {
    let remaining = promises.length;
    let settled = false;
    for (const p of promises) {
      p.then((val) => {
        if (!settled && val !== null && val !== void 0) {
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
function mapMetSymbolToWmoCode(symbolCode = "") {
  const s = symbolCode.toLowerCase();
  if (s.includes("thunder")) return 95;
  if (s.includes("heavyrain")) return 65;
  if (s.includes("rainshowers")) return 80;
  if (s.includes("lightrain")) return 61;
  if (s.includes("rain")) return 63;
  if (s.includes("sleet")) return 66;
  if (s.includes("heavysnow")) return 75;
  if (s.includes("snowshowers")) return 85;
  if (s.includes("lightsnow") || s.includes("snow")) return 71;
  if (s.includes("fog")) return 45;
  if (s.includes("clearsky")) return 0;
  if (s.includes("fair")) return 1;
  if (s.includes("partlycloudy")) return 2;
  if (s.includes("cloudy")) return 3;
  return 2;
}
function mapWttrCodeToWmoCode(wttrCodeRaw) {
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
function computeApparentTemp(tempC, humidityPct, windKmH) {
  const windMs = Math.max(0, windKmH / 3.6);
  const vaporPressure = humidityPct / 100 * 6.105 * Math.exp(17.27 * tempC / (237.7 + tempC));
  return Math.round(tempC + 0.33 * vaporPressure - 0.7 * windMs - 4);
}
function buildWeatherMetaAndAlerts(params) {
  const { currentCode, curTemp, todayMax, todayMin, windSpeed, currentPrecip, hourlyList, aqiData } = params;
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
  if (currentPrecip >= 20 || hourlyList.slice(0, 4).some((h) => h.precipitation >= 15)) {
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
  return { rainForecastSummary, alerts, airQuality };
}
function buildWeatherFromMetNorway(params) {
  const { metData, lat, lon, city, isAuto, aqiData, reqStart } = params;
  const timeseries = metData?.properties?.timeseries || [];
  if (timeseries.length === 0) return null;
  const utcOffsetHours = Math.round(lon / 15);
  const utcOffsetMs = utcOffsetHours * 3600 * 1e3;
  const formatLocal = (isoStr) => {
    const d = new Date(new Date(isoStr).getTime() + utcOffsetMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}`, hour: d.getUTCHours(), ts: new Date(isoStr).getTime() };
  };
  const first = timeseries[0];
  const curInstant = first.data?.instant?.details || {};
  const curSymbol = first.data?.next_1_hours?.summary?.symbol_code || first.data?.next_6_hours?.summary?.symbol_code || first.data?.next_12_hours?.summary?.symbol_code || "partlycloudy";
  const currentCode = mapMetSymbolToWmoCode(curSymbol);
  const { condition } = mapWmoWeatherCode(currentCode);
  const curTemp = Math.round(curInstant.air_temperature ?? 22);
  const curHumidity = Math.round(curInstant.relative_humidity ?? 60);
  const windSpeed = Math.round((curInstant.wind_speed ?? 2) * 3.6);
  const windDir = `${getWindDirectionText(curInstant.wind_from_direction ?? 0)} ${getWindScaleText(windSpeed)}`;
  const currentPrecip = Number((first.data?.next_1_hours?.details?.precipitation_amount ?? 0).toFixed(1));
  const feelsLike = computeApparentTemp(curTemp, curHumidity, windSpeed);
  const hourlyList = [];
  for (let i = 0; i < Math.min(24, timeseries.length); i++) {
    const item = timeseries[i];
    const inst = item.data?.instant?.details || {};
    const sym = item.data?.next_1_hours?.summary?.symbol_code || item.data?.next_6_hours?.summary?.symbol_code || "partlycloudy";
    const hCode = mapMetSymbolToWmoCode(sym);
    const hCond = mapWmoWeatherCode(hCode);
    const hPrecip = Number((item.data?.next_1_hours?.details?.precipitation_amount ?? 0).toFixed(1));
    const hTemp = Math.round(inst.air_temperature ?? curTemp);
    const hHum = Math.round(inst.relative_humidity ?? curHumidity);
    const hWind = Math.round((inst.wind_speed ?? 2) * 3.6);
    const prob = hPrecip >= 2 ? 85 : hPrecip >= 0.3 ? 65 : hPrecip > 0 ? 45 : sym.includes("rain") || sym.includes("snow") || sym.includes("thunder") ? 40 : 10;
    const loc = formatLocal(item.time);
    hourlyList.push({
      time: i === 0 ? "\u73B0\u5728" : loc.time,
      timestamp: loc.ts,
      temp: hTemp,
      feelsLike: computeApparentTemp(hTemp, hHum, hWind),
      condition: hCond.condition,
      conditionCode: hCode,
      precipProbability: prob,
      precipitation: hPrecip,
      windSpeed: hWind
    });
  }
  const daysOfWeek = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
  const dayBuckets = /* @__PURE__ */ new Map();
  for (const item of timeseries) {
    const loc = formatLocal(item.time);
    const t = item.data?.instant?.details?.air_temperature;
    if (typeof t !== "number") continue;
    const sym = item.data?.next_6_hours?.summary?.symbol_code || item.data?.next_1_hours?.summary?.symbol_code || item.data?.next_12_hours?.summary?.symbol_code || "partlycloudy";
    const c = mapMetSymbolToWmoCode(sym);
    const pAmt = item.data?.next_6_hours?.details?.precipitation_amount ?? item.data?.next_1_hours?.details?.precipitation_amount ?? 0;
    const pProb = pAmt >= 2 ? 85 : pAmt > 0.2 ? 60 : sym.includes("rain") || sym.includes("snow") || sym.includes("thunder") ? 45 : 10;
    if (!dayBuckets.has(loc.date)) {
      dayBuckets.set(loc.date, { temps: [], codes: [], probs: [] });
    }
    const bucket = dayBuckets.get(loc.date);
    bucket.temps.push(t);
    if (loc.hour >= 9 && loc.hour <= 18) {
      bucket.codes.push(c);
    }
    bucket.probs.push(pProb);
  }
  const dailyList = [];
  let idx = 0;
  for (const [dateStr, bucket] of dayBuckets.entries()) {
    if (idx >= 7) break;
    const parts = dateStr.split("-").map(Number);
    const localDateObj = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const dayLabel = idx === 0 ? "\u4ECA\u5929" : idx === 1 ? "\u660E\u5929" : daysOfWeek[localDateObj.getDay()];
    const dCode = bucket.codes.length > 0 ? bucket.codes[Math.floor(bucket.codes.length / 2)] : currentCode;
    const dCond = mapWmoWeatherCode(dCode);
    dailyList.push({
      date: dateStr,
      dayOfWeek: dayLabel,
      tempMin: Math.round(Math.min(...bucket.temps)),
      tempMax: Math.round(Math.max(...bucket.temps)),
      condition: dCond.condition,
      conditionCode: dCode,
      precipProbability: Math.max(...bucket.probs, 0)
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
    aqiData
  });
  return {
    city: city || "\u5F53\u524D\u4F4D\u7F6E",
    country: "",
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
      serviceName: "MET Norway (Yr.no) \u5168\u7403\u9AD8\u7CBE\u6C14\u8C61\u9884\u62A5",
      geocodingService: "Open-Meteo & OpenStreetMap Nominatim \u9006\u5730\u7406\u7F16\u7801",
      airQualityService: aqiData ? "Open-Meteo \u6B27\u6D32\u54E5\u767D\u5C3C\u5927\u6C14\u76D1\u6D4B\u670D\u52A1 (CAMS)" : "\u6682\u672A\u63D0\u4F9B",
      requestTimestamp: reqStart,
      responseTimestamp: Date.now(),
      networkLatencyMs: Date.now() - reqStart,
      isFromCache: false,
      timezone: `UTC${utcOffsetHours >= 0 ? "+" : ""}${utcOffsetHours}`,
      coordinates: { latitude: lat, longitude: lon }
    }
  };
}
function buildWeatherFromWttr(params) {
  const { wttrData, lat, lon, city, isAuto, aqiData, reqStart } = params;
  const cur = wttrData?.current_condition?.[0];
  const days = wttrData?.weather || [];
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
  const hourlyList = [];
  const todayHourly = days[0]?.hourly || [];
  const nowHour = (/* @__PURE__ */ new Date()).getHours();
  for (let i = 0; i < todayHourly.length; i++) {
    const h = todayHourly[i];
    const hNum = Math.floor(Number(h.time || 0) / 100);
    if (hNum + 3 < nowHour && i < todayHourly.length - 1) continue;
    const hCode = mapWttrCodeToWmoCode(h.weatherCode);
    const hCond = mapWmoWeatherCode(hCode);
    hourlyList.push({
      time: hourlyList.length === 0 ? "\u73B0\u5728" : `${String(hNum).padStart(2, "0")}:00`,
      timestamp: Date.now() + hourlyList.length * 3 * 3600 * 1e3,
      temp: Math.round(Number(h.tempC ?? curTemp)),
      feelsLike: Math.round(Number(h.FeelsLikeC ?? feelsLike)),
      condition: hCond.condition,
      conditionCode: hCode,
      precipProbability: Math.round(Number(h.chanceofrain ?? 0)),
      precipitation: Number(h.precipMM ?? 0),
      windSpeed: Math.round(Number(h.windspeedKmph ?? windSpeed))
    });
  }
  const daysOfWeek = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
  const dailyList = days.slice(0, 7).map((d, idx) => {
    const dateParts = String(d.date || "").split("-").map(Number);
    const localDateObj = new Date(dateParts[0] || 2026, (dateParts[1] || 1) - 1, dateParts[2] || 1);
    const dayLabel = idx === 0 ? "\u4ECA\u5929" : idx === 1 ? "\u660E\u5929" : daysOfWeek[localDateObj.getDay()];
    const noonSlot = d.hourly?.[Math.floor((d.hourly?.length || 1) / 2)] || d.hourly?.[0];
    const dCode = mapWttrCodeToWmoCode(noonSlot?.weatherCode ?? cur.weatherCode);
    const dCond = mapWmoWeatherCode(dCode);
    const maxProb = Math.max(...(d.hourly || []).map((h) => Number(h.chanceofrain ?? 0)), 0);
    return {
      date: d.date,
      dayOfWeek: dayLabel,
      tempMin: Math.round(Number(d.mintempC ?? curTemp - 3)),
      tempMax: Math.round(Number(d.maxtempC ?? curTemp + 3)),
      condition: dCond.condition,
      conditionCode: dCode,
      precipProbability: Math.round(maxProb)
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
    aqiData
  });
  return {
    city: city || "\u5F53\u524D\u4F4D\u7F6E",
    country: "",
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
      serviceName: "Wttr.in \u5168\u7403\u5B9E\u65F6\u6C14\u8C61\u670D\u52A1",
      geocodingService: "Open-Meteo & OpenStreetMap Nominatim \u9006\u5730\u7406\u7F16\u7801",
      airQualityService: aqiData ? "Open-Meteo \u6B27\u6D32\u54E5\u767D\u5C3C\u5927\u6C14\u76D1\u6D4B\u670D\u52A1 (CAMS)" : "\u6682\u672A\u63D0\u4F9B",
      requestTimestamp: reqStart,
      responseTimestamp: Date.now(),
      networkLatencyMs: Date.now() - reqStart,
      isFromCache: false,
      timezone: "Asia/Shanghai",
      coordinates: { latitude: lat, longitude: lon }
    }
  };
}
app.get("/api/weather", async (req, res) => {
  const reqStart = Date.now();
  try {
    let city = req.query.city?.trim() || "";
    let lat = req.query.lat ? parseFloat(req.query.lat) : void 0;
    let lon = req.query.lon ? parseFloat(req.query.lon) : void 0;
    const isAuto = req.query.auto === "true";
    const forceRefresh = req.query.force === "true";
    if ((lat === void 0 || lon === void 0 || isNaN(lat) || isNaN(lon)) && city) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
          { signal: AbortSignal.timeout(5e3) }
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
        console.warn("Geocoding city query failed:", geoErr);
      }
    }
    if (lat !== void 0 && lon !== void 0 && !isNaN(lat) && !isNaN(lon) && (!city || city === "\u5F53\u524D\u4F4D\u7F6E" || city === "\u672C\u5730")) {
      try {
        const osmResp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`,
          {
            headers: { "User-Agent": "SimulatedAndroidPhone/2.0 (weather-app)" },
            signal: AbortSignal.timeout(4e3)
          }
        );
        if (osmResp.ok) {
          const osmData = await osmResp.json();
          const addr = osmData.address || {};
          city = addr.city || addr.town || addr.county || addr.district || addr.state || `\u7ECF\u7EAC\u5EA6 (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
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
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const existingCache = weatherServerCache.get(cacheKey);
    if (!forceRefresh && existingCache && Date.now() - existingCache.fetchedAt < 2 * 60 * 1e3) {
      return res.json({
        success: true,
        weather: {
          ...existingCache.weather,
          city: city || existingCache.weather.city,
          isAutoLocation: isAuto
        }
      });
    }
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&timezone=auto`;
    const aqiPromise = fetch(aqiUrl, { signal: AbortSignal.timeout(4e3) }).then(async (r) => r.ok ? r.json() : null).catch(() => null);
    const now = Date.now();
    const fetchOpenMeteoRaw = async () => {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum&timezone=auto`;
      try {
        const omRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(2800) });
        if (omRes.ok) {
          const json = await omRes.json();
          if (json && json.current) {
            return { provider: "open-meteo", data: json };
          }
        }
        openMeteoBlockedUntil = Date.now() + 30 * 60 * 1e3;
        return null;
      } catch {
        openMeteoBlockedUntil = Date.now() + 30 * 60 * 1e3;
        return null;
      }
    };
    const fetchMetNorwayRaw = async () => {
      try {
        const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
        const metRes = await fetch(metUrl, {
          headers: { "User-Agent": "SimulatedAndroidPhone/2.0 (weather@local.app)" },
          signal: AbortSignal.timeout(6500)
        });
        if (metRes.ok) {
          const metData = await metRes.json();
          if (metData?.properties?.timeseries?.length > 0) {
            return { provider: "met-norway", data: metData };
          }
        }
        return null;
      } catch {
        return null;
      }
    };
    let primaryResult = null;
    if (now >= openMeteoBlockedUntil) {
      const omPromise = fetchOpenMeteoRaw();
      const fastOpenMeteo = await Promise.race([
        omPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 700))
      ]);
      if (fastOpenMeteo) {
        primaryResult = fastOpenMeteo;
      } else {
        const metPromise = fetchMetNorwayRaw();
        primaryResult = await firstNonNull([omPromise, metPromise]);
      }
    } else {
      primaryResult = await fetchMetNorwayRaw();
    }
    const aqiData = await aqiPromise;
    if (primaryResult?.provider === "open-meteo") {
      const data = primaryResult.data;
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
      if (startIndex === -1) startIndex = timeArr.findIndex((t) => t >= currentLocalHour);
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
        aqiData
      });
      const weatherResult = {
        city: city || "\u5F53\u524D\u4F4D\u7F6E",
        country: "",
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
          geocodingService: "Open-Meteo & OpenStreetMap Nominatim \u9006\u5730\u7406\u7F16\u7801",
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
      weatherServerCache.set(cacheKey, { weather: weatherResult, fetchedAt: Date.now() });
      return res.json({ success: true, weather: weatherResult });
    }
    if (primaryResult?.provider === "met-norway") {
      const metWeather = buildWeatherFromMetNorway({
        metData: primaryResult.data,
        lat,
        lon,
        city,
        isAuto,
        aqiData,
        reqStart
      });
      if (metWeather) {
        weatherServerCache.set(cacheKey, { weather: metWeather, fetchedAt: Date.now() });
        return res.json({ success: true, weather: metWeather });
      }
    }
    try {
      const wttrUrl = `https://wttr.in/${lat.toFixed(3)},${lon.toFixed(3)}?format=j1`;
      const wttrRes = await fetch(wttrUrl, {
        headers: { "User-Agent": "SimulatedAndroidPhone/2.0" },
        signal: AbortSignal.timeout(6500)
      });
      if (wttrRes.ok) {
        const wttrData = await wttrRes.json();
        const wttrWeather = buildWeatherFromWttr({ wttrData, lat, lon, city, isAuto, aqiData, reqStart });
        if (wttrWeather) {
          weatherServerCache.set(cacheKey, { weather: wttrWeather, fetchedAt: Date.now() });
          return res.json({ success: true, weather: wttrWeather });
        }
      }
    } catch {
    }
    if (existingCache && Date.now() - existingCache.fetchedAt < 24 * 60 * 60 * 1e3) {
      return res.json({
        success: true,
        weather: {
          ...existingCache.weather,
          city: city || existingCache.weather.city,
          isAutoLocation: isAuto,
          dataSourceInfo: {
            ...existingCache.weather.dataSourceInfo,
            isFromCache: true,
            cacheTimestamp: existingCache.fetchedAt
          }
        }
      });
    }
    return res.status(200).json({
      success: false,
      status: "upstream_timeout",
      error: "\u5B9E\u65F6\u6C14\u8C61\u6570\u636E\u6E90\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5\u3002"
    });
  } catch (error) {
    console.warn("Weather endpoint handled error:", error?.message || error);
    return res.status(200).json({
      success: false,
      status: "error",
      error: error?.message || "\u83B7\u53D6\u5929\u6C14\u6570\u636E\u5931\u8D25"
    });
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
  const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    let detailedRes = null;
    try {
      detailedRes = await callAiServiceDetailed({
        prompt,
        model: selectedModel,
        apiKey: apiConfig?.textApiKey,
        baseUrl: apiConfig?.textBaseUrl
      });
      responseText = detailedRes.text;
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
    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      apiLog: buildApiLogObject({
        appName: "\u5929\u6C14-AI\u4E3B\u52A8\u5173\u6000",
        modelName: detailedRes?.modelUsed || selectedModel,
        interfaceType: "ProactiveWeatherCare",
        category: "text",
        durationMs: duration,
        usage: detailedRes?.usage,
        isRealTokens: detailedRes?.isRealTokens,
        purpose: `AI [${character.name}] \u9488\u5BF9 [${weatherEvent.title}] \u53D1\u9001\u5FAE\u4FE1\u5929\u6C14\u5173\u6000 (\u8017\u65F6 ${duration}ms)`
      })
    });
  } catch (error) {
    return handleAiEndpointError(res, error, "Weather proactive care");
  }
});
app.post("/api/gemini/analyze-image", async (req, res) => {
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
    source = "\u5FAE\u4FE1\u56FE\u7247\u8BC6\u522B",
    timeoutMs = 45e3
  } = req.body || {};
  const safeRequestId = typeof requestId === "string" && requestId.trim() ? requestId.trim() : `imgrec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: "invalid_image",
      error: "\u672A\u63D0\u4F9B\u6709\u6548\u7684\u56FE\u7247\u6570\u636E (imageUrl)",
      requestId: safeRequestId
    });
  }
  const nestedRec = recognitionConfig || apiConfig?.apiSettings?.recognition?.image || apiConfig?.imageRecognitionApiConfig || null;
  const recKey = (typeof directApiKey === "string" && directApiKey.trim() || typeof nestedRec?.apiKey === "string" && nestedRec.apiKey.trim() || typeof apiConfig?.imageRecognitionApiKey === "string" && apiConfig.imageRecognitionApiKey.trim() || "").trim();
  const recBaseUrl = (typeof directBaseUrl === "string" && directBaseUrl.trim() || typeof nestedRec?.baseUrl === "string" && nestedRec.baseUrl.trim() || typeof apiConfig?.imageRecognitionBaseUrl === "string" && apiConfig.imageRecognitionBaseUrl.trim() || "").trim();
  const recProvider = (typeof directProvider === "string" && directProvider.trim() || typeof nestedRec?.provider === "string" && nestedRec.provider.trim() || typeof apiConfig?.imageRecognitionProvider === "string" && apiConfig.imageRecognitionProvider.trim() || "google_gemini").trim();
  const recProtocolRaw = (typeof directApiProtocol === "string" && directApiProtocol.trim() || typeof nestedRec?.apiProtocol === "string" && nestedRec.apiProtocol.trim() || typeof apiConfig?.imageRecognitionApiProtocol === "string" && apiConfig.imageRecognitionApiProtocol.trim() || "").trim();
  const effectiveProtocol = resolveEffectiveProtocol({
    provider: recProvider,
    apiProtocol: recProtocolRaw,
    baseUrl: recBaseUrl
  });
  const selectedModel = (typeof directModel === "string" && directModel.trim() || typeof nestedRec?.model === "string" && nestedRec.model.trim() || typeof apiConfig?.imageRecognitionModel === "string" && apiConfig.imageRecognitionModel.trim() || (effectiveProtocol === "google_native" ? "gemini-4-hydrogen" : "gpt-4o-mini")).trim();
  const startTime = Date.now();
  if (!recKey) {
    const errMsg = "\u672A\u914D\u7F6E\u3010\u8BC6\u522BAPI \u2192 \u56FE\u50CF\u8BC6\u522B\u3011\u5BC6\u94A5\uFF0C\u8BF7\u524D\u5F80 \u8BBE\u7F6E \u2192 API\u8BBE\u7F6E \u2192 \u8BC6\u522BAPI \u2192 \u56FE\u50CF\u8BC6\u522B \u586B\u5199\u72EC\u7ACB\u5BC6\u94A5\u3002";
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: "missing_api_key",
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
        interfaceType: "ImageRecognition",
        category: "image_recognition",
        status: "failed",
        httpStatus: 400,
        requestId: safeRequestId,
        durationMs: Date.now() - startTime,
        errorType: "missing_api_key",
        error: errMsg,
        purpose: `\u56FE\u50CF\u8BC6\u522B\u5931\u8D25 (${source})`
      })
    });
  }
  const cached = imageRecCompletedCache.get(safeRequestId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(cached.payload.success ? 200 : cached.payload.statusCode || 500).json(cached.payload);
  }
  const existingFlight = imageRecInFlightCache.get(safeRequestId);
  if (existingFlight) {
    try {
      const reused = await existingFlight;
      return res.status(reused.success ? 200 : reused.statusCode || 500).json(reused);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: sanitizeSensitiveText(e?.message || "\u56FE\u50CF\u8BC6\u522B\u8BF7\u6C42\u5F02\u5E38"),
        requestId: safeRequestId
      });
    }
  }
  const runRecognition = async () => {
    const ALLOWED_MIMES = /* @__PURE__ */ new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
    let mimeType = "image/jpeg";
    let base64Data = "";
    let remoteUrl = "";
    if (imageUrl.startsWith("data:")) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!matches) {
        return {
          success: false,
          statusCode: 400,
          errorType: "invalid_image_format",
          error: "\u56FE\u7247 Base64 \u6570\u636E\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9 JPEG\u3001PNG \u6216 WebP \u683C\u5F0F\u56FE\u7247\u3002",
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
      mimeType = matches[1].toLowerCase().trim();
      if (mimeType === "image/jpg") mimeType = "image/jpeg";
      if (!ALLOWED_MIMES.has(mimeType)) {
        return {
          success: false,
          statusCode: 400,
          errorType: "unsupported_image_format",
          error: `\u4E0D\u652F\u6301\u7684\u56FE\u7247\u683C\u5F0F (${mimeType})\uFF0C\u8BF7\u4F7F\u7528 JPEG\u3001PNG \u6216 WebP \u683C\u5F0F\u3002`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
      base64Data = matches[2].replace(/\s+/g, "");
      const estimatedBytes = Math.floor(base64Data.length * 3 / 4);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return {
          success: false,
          statusCode: 413,
          errorType: "image_too_large",
          error: `\u56FE\u7247\u4F53\u79EF\u8FC7\u5927 (${(estimatedBytes / (1024 * 1024)).toFixed(1)}MB)\uFF0C\u8D85\u8FC7 10MB \u9650\u5236\uFF0C\u8BF7\u538B\u7F29\u540E\u91CD\u8BD5\u3002`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
    } else {
      try {
        const safeUrl = assertSafeRemoteImageUrl(imageUrl);
        remoteUrl = safeUrl.toString();
      } catch (urlErr) {
        return {
          success: false,
          statusCode: 400,
          errorType: "invalid_image_url",
          error: urlErr?.message || "\u8FDC\u7A0B\u56FE\u7247\u5730\u5740\u4E0D\u5408\u6CD5",
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
    }
    const lowerModel = selectedModel.toLowerCase();
    if (lowerModel.includes("imagen-") || lowerModel.includes("dall-e") || lowerModel.includes("flux") || lowerModel.includes("whisper") || lowerModel.includes("tts-")) {
      return {
        success: false,
        statusCode: 400,
        errorType: "unsupported_vision_model",
        error: `\u5F53\u524D\u9009\u62E9\u7684\u6A21\u578B (${selectedModel}) \u4E0D\u662F\u56FE\u50CF\u8BC6\u522B/\u89C6\u89C9\u6A21\u578B\uFF0C\u8BF7\u66F4\u6362\u4E3A\u652F\u6301\u591A\u6A21\u6001\u89C6\u89C9\u7684\u6A21\u578B\uFF08\u5982 gemini-4-hydrogen\u3001gemini-2.5-flash \u6216 gpt-4o-mini\uFF09\u3002`,
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs: Date.now() - startTime,
        requestId: safeRequestId
      };
    }
    const structuredVisionPrompt = `${prompt && typeof prompt === "string" && prompt.trim() ? prompt.trim() : "\u8BF7\u4ED4\u7EC6\u89C2\u5BDF\u8FD9\u5F20\u56FE\u7247\uFF0C\u8BC6\u522B\u753B\u9762\u4E2D\u7684\u4EBA\u7269\u3001\u7269\u4F53\u3001\u573A\u666F\u3001\u4E3B\u8981\u7EC6\u8282\u4EE5\u53CA\u6E05\u6670\u53EF\u89C1\u7684\u6587\u5B57\u3002"}

\u8BF7\u4E25\u683C\u8FD4\u56DE\u5982\u4E0B JSON \u683C\u5F0F\uFF08\u4E0D\u8981\u8F93\u51FA markdown \u4EE3\u7801\u5757\u5305\u88F9\uFF0C\u76F4\u63A5\u8F93\u51FA JSON\uFF09\uFF1A
{
  "description": "\u7528\u6D41\u7545\u4E2D\u6587\u5BA2\u89C2\u8BE6\u7EC6\u63CF\u8FF0\u56FE\u7247\u6574\u4F53\u753B\u9762\u3001\u4EBA\u7269\u52A8\u4F5C\u3001\u8868\u60C5\u3001\u8272\u5F69\u4E0E\u4E3B\u8981\u7EC6\u8282\uFF08\u81F3\u5C1115\u5B57\uFF09",
  "detectedText": "\u56FE\u7247\u4E2D\u51FA\u73B0\u7684\u6240\u6709\u53EF\u89C1\u6587\u5B57\u5185\u5BB9\uFF0C\u82E5\u65E0\u6587\u5B57\u8BF7\u8FD4\u56DE\u7A7A\u5B57\u7B26\u4E32",
  "objects": ["\u6838\u5FC3\u7269\u4F53\u6216\u4EBA\u72691", "\u6838\u5FC3\u7269\u4F532"],
  "scene": "\u7B80\u77ED\u573A\u666F\u7C7B\u522B\uFF0C\u4F8B\u5982\uFF1A\u5BA4\u5185\u3001\u6237\u5916\u8857\u9053\u3001\u5496\u5561\u9986\u3001\u804A\u5929\u622A\u56FE\u3001\u624B\u7ED8\u63D2\u753B\u3001\u6587\u6863\u7B49"
}`;
    let rawModelText = "";
    let upstreamHttpStatus = 200;
    if (effectiveProtocol === "google_native") {
      if (!base64Data && remoteUrl) {
        const imgResp = await fetch(remoteUrl, {
          method: "GET",
          signal: AbortSignal.timeout(15e3)
        });
        if (!imgResp.ok) {
          return {
            success: false,
            statusCode: imgResp.status,
            errorType: "remote_image_fetch_failed",
            error: `\u8BFB\u53D6\u8FDC\u7A0B\u56FE\u7247\u5931\u8D25 (HTTP ${imgResp.status})`,
            provider: recProvider,
            model: selectedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId
          };
        }
        const ct = (imgResp.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
        mimeType = ALLOWED_MIMES.has(ct) ? ct : "image/jpeg";
        const arrBuf = await imgResp.arrayBuffer();
        if (arrBuf.byteLength > 10 * 1024 * 1024) {
          return {
            success: false,
            statusCode: 413,
            errorType: "image_too_large",
            error: "\u8FDC\u7A0B\u56FE\u7247\u8D85\u8FC7 10MB \u4F53\u79EF\u9650\u5236",
            provider: recProvider,
            model: selectedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId
          };
        }
        base64Data = Buffer.from(arrBuf).toString("base64");
      }
      const googleBase = buildGoogleRestBase(recBaseUrl);
      const cleanModelId = selectedModel.replace(/^models\//, "");
      const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:generateContent`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": recKey,
          "User-Agent": "aistudio-build"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: structuredVisionPrompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || 45e3, 1e4), 9e4))
      });
      upstreamHttpStatus = resp.status;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        let detail = errText;
        try {
          const j = JSON.parse(errText);
          detail = j.error?.message || j.message || errText;
        } catch {
        }
        const safeDetail = sanitizeSensitiveText(detail, 220);
        const errorType = resp.status === 401 || resp.status === 403 ? "auth_error" : resp.status === 429 ? "rate_limit" : resp.status === 404 ? "model_not_found" : resp.status === 413 ? "image_too_large" : /protocol|not supported|invalid argument|multimodal|image/i.test(safeDetail) ? "protocol_or_model_mismatch" : "upstream_error";
        return {
          success: false,
          statusCode: resp.status,
          errorType,
          error: `Google \u539F\u751F\u56FE\u50CF\u8BC6\u522B\u5931\u8D25 (HTTP ${resp.status}): ${safeDetail}`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
      const resJson = await resp.json();
      const parts = resJson?.candidates?.[0]?.content?.parts || [];
      rawModelText = parts.filter((p) => typeof p?.text === "string").map((p) => p.text).join("\n").trim();
    } else {
      const endpoint = buildOpenAiEndpoint(recBaseUrl, "/chat/completions");
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${recKey}`
      };
      const imageContentUrl = base64Data ? `data:${mimeType};base64,${base64Data}` : remoteUrl;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: structuredVisionPrompt },
                { type: "image_url", image_url: { url: imageContentUrl } }
              ]
            }
          ],
          max_tokens: 900
        }),
        signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || 45e3, 1e4), 9e4))
      });
      upstreamHttpStatus = resp.status;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        let detail = errText;
        try {
          const j = JSON.parse(errText);
          detail = j.error?.message || j.message || errText;
        } catch {
        }
        const safeDetail = sanitizeSensitiveText(detail, 220);
        const errorType = resp.status === 401 || resp.status === 403 ? "auth_error" : resp.status === 429 ? "rate_limit" : resp.status === 404 ? "model_not_found" : resp.status === 413 ? "image_too_large" : /image_url|vision|multimodal|not support|content must be a string/i.test(safeDetail) ? "unsupported_vision_model" : "upstream_error";
        return {
          success: false,
          statusCode: resp.status,
          errorType,
          error: `OpenAI \u517C\u5BB9\u56FE\u50CF\u8BC6\u522B\u5931\u8D25 (HTTP ${resp.status}): ${safeDetail}`,
          provider: recProvider,
          model: selectedModel,
          apiProtocol: effectiveProtocol,
          latencyMs: Date.now() - startTime,
          requestId: safeRequestId
        };
      }
      const resJson = await resp.json();
      const rawChoice = resJson?.choices?.[0]?.message?.content;
      if (typeof rawChoice === "string") {
        rawModelText = rawChoice.trim();
      } else if (Array.isArray(rawChoice)) {
        rawModelText = rawChoice.map((c) => typeof c === "string" ? c : c?.text || "").join("\n").trim();
      }
    }
    const latencyMs = Date.now() - startTime;
    if (!rawModelText) {
      return {
        success: false,
        statusCode: 502,
        errorType: "empty_recognition_result",
        error: "\u56FE\u50CF\u8BC6\u522B\u63A5\u53E3\u8FD4\u56DE\u7A7A\u5185\u5BB9\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u662F\u5426\u652F\u6301\u89C6\u89C9\u8F93\u5165\u6216\u5207\u6362\u89C6\u89C9\u6A21\u578B\u3002",
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId
      };
    }
    let description = "";
    let detectedText = "";
    let objects = [];
    let scene = "";
    try {
      const cleanedJson = rawModelText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const jsonStart = cleanedJson.indexOf("{");
      const jsonEnd = cleanedJson.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(cleanedJson.slice(jsonStart, jsonEnd + 1));
        description = typeof parsed.description === "string" ? parsed.description.trim() : "";
        detectedText = typeof parsed.detectedText === "string" ? parsed.detectedText.trim() : "";
        objects = Array.isArray(parsed.objects) ? parsed.objects.map((o) => String(o || "").trim()).filter(Boolean).slice(0, 12) : [];
        scene = typeof parsed.scene === "string" ? parsed.scene.trim() : "";
      }
    } catch {
    }
    if (!description) {
      description = sanitizeReplyText(rawModelText).trim();
    }
    if (!description) {
      return {
        success: false,
        statusCode: 502,
        errorType: "empty_recognition_result",
        error: "\u672A\u80FD\u4ECE\u6A21\u578B\u8FD4\u56DE\u4E2D\u63D0\u53D6\u5230\u6709\u6548\u753B\u9762\u63CF\u8FF0\u3002",
        provider: recProvider,
        model: selectedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId
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
        interfaceType: "ImageRecognition",
        category: "image_recognition",
        status: "success",
        httpStatus: upstreamHttpStatus,
        requestId: safeRequestId,
        durationMs: latencyMs,
        purpose: `${source} (${scene || "\u89C6\u89C9\u5185\u5BB9\u89E3\u6790"})`
      })
    };
  };
  const flightPromise = runRecognition().then((result) => {
    if (!result.apiLog && !result.success) {
      result.apiLog = buildApiLogObject({
        appName: source,
        provider: result.provider || recProvider,
        modelName: result.model || selectedModel,
        interfaceType: "ImageRecognition",
        category: "image_recognition",
        status: "failed",
        httpStatus: result.statusCode || 500,
        requestId: safeRequestId,
        durationMs: result.latencyMs || Date.now() - startTime,
        errorType: result.errorType || "ImageRecognitionError",
        error: result.error || "\u56FE\u50CF\u8BC6\u522B\u5931\u8D25",
        purpose: `${source} \u5931\u8D25`
      });
    }
    if (result.success) {
      imageRecCompletedCache.set(safeRequestId, {
        expiresAt: Date.now() + IMAGE_IDEMPOTENCY_TTL_MS,
        payload: result
      });
    }
    return result;
  }).finally(() => {
    imageRecInFlightCache.delete(safeRequestId);
  });
  imageRecInFlightCache.set(safeRequestId, flightPromise);
  try {
    const result = await flightPromise;
    return res.status(result.success ? 200 : result.statusCode || 500).json(result);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    const safeErr = sanitizeSensitiveText(
      isTimeout ? "\u56FE\u50CF\u8BC6\u522B\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u6216\u53CD\u4EE3\u54CD\u5E94\u901F\u5EA6\u3002" : err?.message || "\u56FE\u7247\u89C6\u89C9\u8BC6\u522B\u5F02\u5E38",
      240
    );
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      statusCode: isTimeout ? 504 : 500,
      errorType: isTimeout ? "timeout" : "network_error",
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
        interfaceType: "ImageRecognition",
        category: "image_recognition",
        status: "failed",
        httpStatus: isTimeout ? 504 : 500,
        requestId: safeRequestId,
        durationMs: latencyMs,
        errorType: isTimeout ? "timeout" : "network_error",
        error: safeErr,
        purpose: `${source} \u5F02\u5E38`
      })
    });
  }
});
function formatFullDateTime(timestamp) {
  if (!timestamp) return "\u65F6\u95F4\u672A\u77E5";
  let d;
  if (timestamp instanceof Date) {
    d = timestamp;
  } else if (typeof timestamp === "number") {
    d = new Date(timestamp);
  } else {
    const parsedNum = Number(timestamp);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      d = new Date(parsedNum);
    } else {
      d = new Date(timestamp);
    }
  }
  if (isNaN(d.getTime())) return "\u65F6\u95F4\u672A\u77E5";
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}
app.post("/api/gemini/chat", async (req, res) => {
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
    apiConfig
  } = req.body;
  const startTime = Date.now();
  const requestId = typeof req.body?.requestId === "string" && req.body.requestId.trim() ? req.body.requestId.trim() : `chat_${startTime}_${Math.random().toString(36).slice(2, 7)}`;
  const textGenConfig = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
  const selectedModel = textGenConfig.model;
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
    const now = /* @__PURE__ */ new Date();
    const dynamicTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const currentNativeTime = systemTime || `${dynamicTimeStr} (\u8BBE\u5907\u672C\u5730\u65F6\u533A)`;
    const currentNativeLoc = locationCity || realDeviceContext?.locationCity || weatherInfo?.city;
    contextPrompt += `
\u3010\u{1F4F1} Android \u624B\u673A\u539F\u751F\u5E95\u5C42\u611F\u77E5\xB7\u771F\u5B9E\u65F6\u95F4\u4E0E\u73AF\u5883\u3011:
- \u624B\u673A\u7CFB\u7EDF\u672C\u5730\u771F\u5B9E\u65F6\u95F4\uFF1A${currentNativeTime}
- \u624B\u673A\u7269\u7406\u4F4D\u7F6E/\u57CE\u5E02\uFF1A${currentNativeLoc ? currentNativeLoc : "\u5F53\u524D\u672A\u6388\u6743\u624B\u673A\u5B9A\u4F4D\u6216\u672A\u9009\u62E9\u57CE\u5E02"}
`;
    if (permissions?.appAccess?.worldBookData !== false) {
      if (worldBookContext && typeof worldBookContext === "string" && worldBookContext.trim()) {
        contextPrompt += `
${worldBookContext.trim()}
`;
      } else if (associatedWorldBooks && Array.isArray(associatedWorldBooks) && associatedWorldBooks.length > 0) {
        contextPrompt += `
\u3010\u{1F30C} \u5DF2\u7ED1\u5B9A\u4E16\u754C\u4E66\uFF08\u5171 ${associatedWorldBooks.length} \u672C\uFF09\xB7 \u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u8BCD\u6761\u5E93\u3011
`;
        associatedWorldBooks.forEach((wb, idx) => {
          contextPrompt += `${idx + 1}. \u300A${wb.title}\u300B: ${wb.worldSetting || "\u65E0\u7279\u5B9A\u80CC\u666F"}
`;
          if (wb.entries && Array.isArray(wb.entries) && wb.entries.length > 0) {
            wb.entries.forEach((e) => {
              if (e.enabled !== false) {
                contextPrompt += `   * [${e.keyword}]: ${e.content}
`;
              }
            });
          }
        });
        contextPrompt += `\u3010\u6F14\u804C\u6CD5\u5219\u3011\uFF1A\u4F60\u5F53\u524D\u7F6E\u8EAB\u4E8E\u4E0A\u8FF0\u6240\u6709\u4E16\u754C\u89C2\u6CD5\u5219\u4E2D\u3002\u8BF7\u81EA\u7136\u878D\u5165\u4E0A\u8FF0\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u8BCD\u6761\u89C4\u5219\u8FDB\u884C\u6C89\u6D78\u5F0F\u4E92\u52A8\u56DE\u590D\u3002
`;
      } else if (associatedWorldBook && associatedWorldBook.title) {
        contextPrompt += `
\u3010\u{1F30C} \u5DF2\u7ED1\u5B9A\u4E16\u754C\u4E66\xB7\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u80CC\u666F\u8BBE\u5B9A\u3011
- \u4E16\u754C\u4E66\u540D\u79F0\uFF1A\u300A${associatedWorldBook.title}\u300B
- \u6838\u5FC3\u4E16\u754C\u6CD5\u5219\u4E0E\u80CC\u666F\uFF1A${associatedWorldBook.worldSetting || "\u65E0\u7279\u5B9A\u80CC\u666F"}
`;
        if (associatedWorldBook.entries && associatedWorldBook.entries.length > 0) {
          contextPrompt += "\u3010\u4E13\u6709\u540D\u8BCD\u4E0E\u8BCD\u6761\u8BBE\u5B9A\u5E93\u3011\uFF1A\n" + associatedWorldBook.entries.map((e) => `* [${e.keyword}]: ${e.content}`).join("\n") + "\n";
        }
        contextPrompt += `\u3010\u6F14\u804C\u6CD5\u5219\u3011\uFF1A\u4F60\u5F53\u524D\u5904\u4E8E\u8BE5\u4E16\u754C\u89C2\u80CC\u666F\u4E2D\u3002\u4F60\u7684\u8A00\u8C08\u4E3E\u6B62\u3001\u4E16\u754C\u5E38\u8BC6\u3001\u7528\u8BCD\u4E60\u60EF\u5FC5\u987B\u81EA\u7136\u878D\u5165\u8BE5\u4E16\u754C\u89C2\u6CD5\u5219\u4E0E\u8BCD\u6761\u8BBE\u5B9A\u3002
`;
      }
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
    if (req.body.lifeStateContext) {
      contextPrompt += `
${req.body.lifeStateContext}
`;
    }
    if (crossChannelTransitionContext && typeof crossChannelTransitionContext === "string" && crossChannelTransitionContext.trim()) {
      contextPrompt += `
${crossChannelTransitionContext.trim()}
`;
    }
    contextPrompt += `
\u3010\u{1F3A8} \u771F\u5B9E\u56FE\u50CF\u751F\u6210\u5DE5\u5177\u8C03\u7528\u80FD\u529B (generate_image)\u3011:
\u4F60\u8FDE\u63A5\u4E86\u72EC\u7ACB\u7684\u56FE\u50CF\u751F\u6210\u7CFB\u7EDF\u3002\u8BF7\u4E25\u683C\u9075\u5B88\u4EE5\u4E0B\u8BED\u4E49\u89E6\u53D1\u89C4\u8303\uFF1A
1. \u4EC5\u5F53\u7528\u6237**\u660E\u786E\u8981\u6C42\u4F60\u753B\u56FE\u3001\u751F\u6210\u56FE\u7247\u3001\u5236\u4F5C\u56FE\u7247\u3001\u505A\u5934\u50CF\u3001\u753B\u573A\u666F\u3001\u62CD\u4E00\u5F20\u53D1\u8FC7\u6765\u3001\u753B\u4E00\u53EA/\u753B\u4E00\u5E45\u2026\u2026**\u65F6\uFF0C\u624D\u89E6\u53D1\u753B\u56FE\u5DE5\u5177\u3002
2. \u5982\u679C\u7528\u6237\u53EA\u662F\u5728\u8BA8\u8BBA\u56FE\u7247\u3001\u5938\u5956\u201C\u8FD9\u753B\u5F97\u771F\u597D\u770B\u201D\u3001\u6216\u8005\u95F2\u804A\u8BE2\u95EE\u56FE\u7247\u529F\u80FD\uFF0C**\u7EDD\u5BF9\u4E0D\u8981**\u89E6\u53D1\u753B\u56FE\u5DE5\u5177\u3002
3. \u5F53\u786E\u8BA4\u9700\u8981\u753B\u56FE\u65F6\uFF1A
   - \u5148\u7528\u7B26\u5408\u4F60\u4EBA\u8BBE\u7684\u53E3\u543B\u81EA\u7136\u8F93\u51FA\u914D\u5957\u6587\u5B57\uFF08\u4F8B\u5982\u201C\u753B\u597D\u4EE5\u540E\u6211\u5C31\u53D1\u7ED9\u4F60\uFF0C\u60F3\u7ED9\u4F60\u753B\u4E00\u53EA\u8DB4\u5728\u7A97\u8FB9\u7B49\u4F60\u7684\u5C0F\u732B\u3002\u201D\uFF09\uFF0C**\u7EDD\u4E0D\u80FD\u53EA\u56DE\u6587\u5B57\u5047\u88C5\u753B\u597D\u4E86\uFF0C\u4E5F\u7EDD\u4E0D\u80FD\u7F16\u9020\u201C\u753B\u56FE\u5F00\u5173\u6CA1\u6253\u5F00\u201D\u4E4B\u7C7B\u501F\u53E3**\u3002
   - \u5728\u56DE\u590D\u672B\u5C3E\u9644\u5E26\u552F\u4E00\u4E00\u4E2A\u6807\u51C6\u5DE5\u5177\u6807\u7B7E\uFF08\u6B64\u6807\u7B7E\u4F1A\u88AB\u7CFB\u7EDF\u89E3\u6790\u6267\u884C\u5E76\u9690\u85CF\uFF0C\u7EDD\u4E0D\u4F1A\u5C55\u793A\u7ED9\u7528\u6237\uFF09\uFF1A
     <image_action>{"type":"generate_image","prompt":"\u5B8C\u6574\u3001\u53EF\u4F9B\u56FE\u50CF\u6A21\u578B\u76F4\u63A5\u7ED8\u5236\u7684\u8BE6\u7EC6\u89C6\u89C9\u63D0\u793A\u8BCD\uFF08\u5305\u542B\u4E3B\u4F53\u3001\u5149\u5F71\u3001\u6784\u56FE\u3001\u98CE\u683C\u3001\u7EC6\u8282\uFF09","imageDescription":"\u7B80\u660E\u4E2D\u6587\u753B\u9762\u63CF\u8FF0\uFF0C\u4F9B\u4F60\u540E\u7EED\u8BB0\u5FC6\u81EA\u5DF1\u753B\u4E86\u4EC0\u4E48","aspectRatio":"1:1","negativePrompt":""}</image_action>
   - aspectRatio \u53EF\u6309\u573A\u666F\u9009\u7528 "1:1" / "3:4" / "4:3" / "16:9" / "9:16"\u3002

\u3010\u{1F4F1} \u5FAE\u4FE1\u771F\u4EBA\u6253\u5B57\u4E0E\u5206\u53E5\u8FDE\u53D1\u4E60\u60EF\u3011\uFF1A
\u5728\u771F\u5B9E\u5FAE\u4FE1\u804A\u5929\u4E2D\uFF0C\u771F\u4EBA\u901A\u5E38\u4E0D\u4F1A\u4E00\u6B21\u6027\u5806\u780C\u957F\u7BC7\u5927\u8BBA\uFF0C\u800C\u662F\u4E60\u60EF\u628A\u4E00\u6574\u6BB5\u8BDD\u5207\u5206\u6210 2~4 \u6761\u81EA\u7136\u7B80\u77ED\u7684\u8BDD\u8BED\u8FDE\u53D1\uFF08\u4E00\u53E5\u8BDD\u53D1\u4E00\u6761\u6D88\u606F\uFF0C\u968F\u6027\u53E3\u8BED\u5316\u3001\u4EB2\u8FD1\u771F\u5B9E\uFF09\u3002
\u8BF7\u5728\u8F93\u51FA\u56DE\u590D\u65F6\uFF0C\u81EA\u7136\u5730\u4F7F\u7528\u6362\u884C\uFF08\u6BCF\u884C\u4E00\u4E24\u53E5\u8BDD\uFF09\u5206\u9694\uFF0C\u8BA9\u6BCF\u6761\u6D88\u606F\u90FD\u7B80\u77ED\u7CBE\u70BC\u3001\u751F\u52A8\u65E5\u5E38\uFF0C\u907F\u514D\u4E66\u9762\u5316\u5927\u6BB5\u72EC\u767D\u3002

\u3010\u6838\u5FC3\u8F93\u51FA\u683C\u5F0F\u8981\u6C42\u3011\uFF1A
\u8BF7\u5728\u56DE\u7B54\u7684\u6700\u524D\u9762\u7528 <think>...</think> \u6807\u7B7E\u8F93\u51FA\u4F60\u672C\u6B21\u56DE\u7B54\u7684\u601D\u8003\u94FE (Thinking Process / Chain of Thought)\uFF0C\u8BF4\u660E\u4F60\u662F\u5982\u4F55\u7ED3\u5408\u89D2\u8272\u4EBA\u8BBE\u3001\u8BB0\u5FC6\u3001\u4E16\u754C\u4E66\u80CC\u666F\uFF08\u82E5\u6709\u5173\u8054\uFF09\u4EE5\u53CA\u7528\u6237\u4E0A\u4E0B\u6587\u505A\u51FA\u56DE\u5E94\u7684\u3002
\u5728 </think> \u6807\u7B7E\u4E4B\u540E\uFF0C\u76F4\u63A5\u8F93\u51FA\u4F60\u7ED9\u7528\u6237\u7684\u5FAE\u4FE1\u56DE\u590D\u6587\u672C\uFF08\u4FDD\u6301\u5FAE\u4FE1\u53E3\u8BED\u5316\u3001\u4EB2\u5207\u81EA\u5982\uFF0C\u9002\u5408\u5FAE\u4FE1\u804A\u5929\uFF0C\u591A\u53E5\u8BDD\u4E4B\u95F4\u6362\u884C\u9694\u5F00\uFF09\uFF1B\u82E5\u9700\u8981\u89E6\u53D1\u753B\u56FE\uFF0C\u8BF7\u5728\u56DE\u590D\u672B\u5C3E\u7D27\u8DDF <image_action>{...}</image_action>\u3002
`;
    const turnMsgIdSet = new Set(Array.isArray(currentTurnMessageIds) ? currentTurnMessageIds : []);
    const preFilteredHistory = (conversationHistory || []).filter((msg) => {
      if (!msg) return false;
      if (msg.id && turnMsgIdSet.has(msg.id)) return false;
      return true;
    });
    const serverChatProtection = applyOverlengthContextProtection({
      messages: preFilteredHistory,
      maxRawLimit: STANDARD_CONTEXT_LIMIT,
      formatForEstimate: (msg) => ({
        timestamp: msg.timestamp || msg.createdAt,
        senderName: msg.sender === "user" ? userProfile?.name || "\u7528\u6237" : character.name,
        text: msg.type === "forward_bundle" || msg.messageType === "forward_bundle" || msg.forwardBundle ? serializeForwardBundleForAi(msg.forwardBundle) : msg.text || msg.imageDescription || ""
      }),
      cloneWithTruncatedText: (msg, truncatedText) => ({ ...msg, text: truncatedText })
    });
    const cleanedHistory = serverChatProtection.rawMessages;
    const effectiveChatMetrics = clientContextMetrics && typeof clientContextMetrics.rawCount === "number" ? clientContextMetrics : serverChatProtection.metrics;
    const mergedEarlierChatSummary = [earlierContextSummary, serverChatProtection.earlierSummaryText].filter((s) => typeof s === "string" && s.trim().length > 0).join("\n\n");
    const currentMs = req.body.userMessageTimestamp || Date.now();
    let lastMs;
    if (cleanedHistory && cleanedHistory.length > 0) {
      for (let i = cleanedHistory.length - 1; i >= 0; i--) {
        const item = cleanedHistory[i];
        const ts = item.timestamp ?? item.createdAt ?? item.create_time ?? item.time;
        if (typeof ts === "number" && ts > 0) {
          lastMs = ts < 1e10 ? ts * 1e3 : ts;
          break;
        } else if (typeof ts === "string" && ts.trim()) {
          const parsedNum = Number(ts);
          if (!isNaN(parsedNum) && parsedNum > 0) {
            lastMs = parsedNum < 1e10 ? parsedNum * 1e3 : parsedNum;
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
    let gapSummary = "";
    let isLongTimeGap = false;
    if (!lastMs) {
      gapSummary = "\u672C\u6B21\u4E3A\u4E0E\u8BE5\u89D2\u8272\u7684\u9996\u6B21\u5BF9\u8BDD\uFF08\u6B64\u524D\u65E0\u5386\u53F2\u6C9F\u901A\u8BB0\u5F55\uFF09";
    } else {
      const diffMs = Math.max(0, currentMs - lastMs);
      const diffMins = Math.floor(diffMs / (60 * 1e3));
      const diffHours = Math.floor(diffMs / (3600 * 1e3));
      const diffDays = Math.floor(diffMs / (86400 * 1e3));
      if (diffMins < 1) {
        gapSummary = "\u8DDD\u79BB\u4E0A\u4E00\u6B21\u5BF9\u8BDD\u4E0D\u5230 1 \u5206\u949F\uFF08\u8FDE\u7EED\u804A\u5929\u4E2D\uFF09";
      } else if (diffMins < 60) {
        gapSummary = `\u8DDD\u79BB\u4E0A\u4E00\u6B21\u5BF9\u8BDD\u8FC7\u53BB ${diffMins} \u5206\u949F\uFF08\u8FDE\u7EED\u5BF9\u8BDD\uFF09`;
      } else if (diffHours < 24) {
        const remMins = diffMins % 60;
        gapSummary = `\u8DDD\u79BB\u4E0A\u4E00\u6B21\u5BF9\u8BDD\u5DF2\u8FC7\u53BB ${diffHours} \u5C0F\u65F6 ${remMins} \u5206\u949F`;
        if (diffHours >= 6) isLongTimeGap = true;
      } else {
        const remHours = diffHours % 24;
        gapSummary = `\u8DDD\u79BB\u4E0A\u4E00\u6B21\u5BF9\u8BDD\u5DF2\u8FC7\u53BB ${diffDays} \u5929 ${remHours} \u5C0F\u65F6`;
        isLongTimeGap = true;
      }
    }
    const lastChatTimeStr = lastMs ? formatFullDateTime(lastMs) : "\u65E0\u5386\u53F2\u8BB0\u5F55";
    const currentChatTimeStr = formatFullDateTime(currentMs);
    contextPrompt += `
\u3010\u23F0 \u771F\u5B9E\u804A\u5929\u65F6\u95F4\u611F\u77E5\u4E0E\u65F6\u95F4\u95F4\u9694\u3011:
- \u5F53\u524D\u8BBE\u5907/\u6D88\u606F\u771F\u5B9E\u65F6\u95F4\uFF1A${currentChatTimeStr}
- \u4E0A\u6B21\u4E0E\u8BE5\u89D2\u8272\u5BF9\u8BDD\u65F6\u95F4\uFF1A${lastChatTimeStr}
- \u4E24\u6B21\u5BF9\u8BDD\u771F\u5B9E\u65F6\u95F4\u5DEE\uFF1A${gapSummary}
`;
    if (isLongTimeGap) {
      contextPrompt += `\u3010\u26A0\uFE0F \u8DE8\u65F6\u95F4\u6BB5\u4E0E\u957F\u95F4\u9694\u4EA4\u4E92\u51C6\u5219\u3011\uFF1A
1. \u8DDD\u79BB\u4E0A\u4E00\u6B21\u5BF9\u8BDD\u5DF2\u95F4\u9694\u8F83\u957F\u65F6\u95F4\u3002\u5728\u8FC7\u53BB\u804A\u5929\u4E2D\u5982\u679C\u63D0\u5230\u8FC7\u5F53\u65F6\u7684\u2018\u660E\u5929\u2019\u3001\u2018\u540E\u5929\u2019\u7B49\u8BA1\u5212\uFF08\u5982\u201C\u660E\u5929\u8981\u9762\u8BD5\u201D\u3001\u201C\u540E\u5929\u53BB\u5F00\u4F1A\u201D\uFF09\uFF0C\u8BF7\u5728\u5FC3\u667A\u4E2D\u610F\u8BC6\u5230\u8FD9\u4E9B\u4E8B\u4EF6\u5728\u73B0\u5B9E\u65F6\u95F4\u7EBF\u4E2D**\u53EF\u80FD\u5DF2\u7ECF\u53D1\u751F\u6216\u6210\u4E3A\u8FC7\u53BB**\uFF0C\u5207\u52FF\u5C06\u8FC7\u53BB\u8BA1\u5212\u5F53\u4F5C\u672A\u53D1\u751F\u7684\u672A\u6765\uFF0C\u4E5F\u4E0D\u8981\u5E7B\u60F3\u672A\u53D1\u751F\u7684\u4E8B\u4EF6\u3002
2. \u8BF7\u81EA\u7136\u611F\u77E5\u5230\u65F6\u95F4\u8DE8\u5EA6\uFF08\u6839\u636E\u4EBA\u8BBE\u81EA\u7136\u95EE\u5019\uFF0C\u5982\u201C\u597D\u4E45\u4E0D\u89C1\u5566\u201D\u3001\u201C\u8FD9\u51E0\u5929\u5FD9\u4EC0\u4E48\u5462\u201D\u6216\u5173\u5FC3\u6B64\u524D\u8BA1\u5212\u201C\u524D\u51E0\u5929\u4F60\u8BF4\u8D77\u7684\u90A3\u4E2A\u9762\u8BD5\u600E\u4E48\u6837\u4E86\uFF1F\u201D\uFF09\uFF0C\u4FDD\u6301\u4EB2\u5207\u8D34\u5207\u7684\u771F\u4EBA\u53E3\u543B\u3002
`;
    } else {
      contextPrompt += `\u3010\u8FDE\u7EED\u5BF9\u8BDD\u51C6\u5219\u3011\uFF1A\u95F4\u9694\u6781\u77ED\uFF0C\u4FDD\u6301\u7D27\u51D1\u8FDE\u8D2F\u7684\u5FAE\u4FE1\u65E5\u5E38\u4EA4\u6D41\u8282\u594F\u3002
`;
    }
    const contents = [];
    if (cleanedHistory && cleanedHistory.length > 0) {
      cleanedHistory.forEach((msg) => {
        const msgTime = formatFullDateTime(msg.timestamp || msg.createdAt || msg.time);
        if (msg.type === "offline_session_event" && msg.offlineEventData) {
          const ev = msg.offlineEventData;
          const startStr = formatFullDateTime(ev.startedAt || msg.timestamp);
          const endStr = formatFullDateTime(ev.endedAt || msg.timestamp);
          contents.push(
            `[${startStr}\u2014${endStr}] [\u5171\u540C\u7EBF\u4E0B\u7ECF\u5386\u4E8B\u4EF6 \xB7 \u573A\u666F: ${ev.sceneName || ev.title}${ev.location ? ` @ ${ev.location}` : ""} \xB7 \u5171${ev.durationMinutes || 1}\u5206\u949F]: ${ev.summary || msg.text || ""}`
          );
          return;
        }
        if (msg.sender === "ai" && (msg.messageType === "generated_image" || msg.type === "generated_image")) {
          const semanticDesc = msg.imageDescription && msg.imageDescription.trim() || msg.revisedPrompt && msg.revisedPrompt.trim() || msg.generationPrompt && msg.generationPrompt.trim() || "\u4E00\u5F20\u751F\u6210\u7684\u56FE\u7247";
          const statusNote = msg.generationStatus === "failed" ? "[AI\u6B64\u524D\u5C1D\u8BD5\u751F\u6210\u56FE\u7247\u4F46\u672A\u80FD\u6210\u529F]" : `[AI\u6B64\u524D\u751F\u6210\u4E86\u4E00\u5F20\u56FE\u7247\uFF1A${semanticDesc}]`;
          const captionPart = msg.text ? `${msg.text} ` : "";
          contents.push(`[${msgTime}] ${character.name}: ${captionPart}${statusNote}`);
          return;
        }
        const isProactiveMsg = Boolean(msg.isProactive);
        const senderLabel = msg.sender === "user" ? userProfile?.name || "\u7528\u6237" : isProactiveMsg ? `${character.name} [\u6B64\u524D\u4E3B\u52A8\u6D88\u606F${msg.proactiveMeta?.repliedByUser ? "\xB7\u7528\u6237\u5DF2\u56DE\u5E94" : "\xB7\u6B64\u524D\u53D1\u8D77"}]` : character.name;
        if (msg.sender === "user" && (msg.imageUrl || msg.messageType === "image")) {
          const recDesc = (msg.imageDescription || msg.imageAnalysis || "").trim();
          const recText = (msg.detectedText || "").trim();
          const isFailed = msg.recognitionStatus === "failed" || msg.imageAnalysisStatus === "failed";
          if (recDesc && !isFailed) {
            let imgBlock = `[${msgTime}] ${senderLabel}\u53D1\u9001\u4E86\u4E00\u5F20\u56FE\u7247\u3002
\u56FE\u7247\u5185\u5BB9\uFF1A${recDesc}`;
            if (recText) imgBlock += `
\u56FE\u7247\u6587\u5B57\uFF1A${recText}`;
            if (msg.text) imgBlock += `
\u7528\u6237\u9644\u8A00\uFF1A${msg.text}`;
            contents.push(imgBlock);
          } else if (isFailed) {
            contents.push(
              `[${msgTime}] ${senderLabel}\u53D1\u9001\u4E86\u4E00\u5F20\u56FE\u7247\uFF08\u56FE\u7247\u8BC6\u522B\u5931\u8D25\uFF0C\u65E0\u6CD5\u770B\u5230\u753B\u9762\u5185\u5BB9\uFF09\u3002${msg.text ? ` \u7528\u6237\u9644\u8A00\uFF1A${msg.text}` : ""}`
            );
          } else {
            contents.push(`[${msgTime}] ${senderLabel}: ${msg.text || ""} [\u56FE\u7247\u9644\u4EF6]`);
          }
          return;
        }
        if (msg.type === "forward_bundle" || msg.messageType === "forward_bundle" || msg.forwardBundle) {
          contents.push(`[${msgTime}] ${senderLabel}: ${serializeForwardBundleForAi(msg.forwardBundle)}`);
          return;
        }
        let msgStr = `[${msgTime}] ${senderLabel}: ${msg.text || ""}`;
        if (msg.imageUrl) {
          const desc = (msg.imageDescription || msg.imageAnalysis || "").trim();
          msgStr += ` [\u56FE\u7247\u9644\u4EF6${desc ? `: ${desc}` : ""}]`;
        }
        contents.push(msgStr);
      });
    }
    const currentUserTime = formatFullDateTime(req.body.userMessageTimestamp || Date.now());
    let currentMsgStr = `[${currentUserTime}] ${userProfile?.name || "\u7528\u6237"}: ${userMessage || ""}`;
    if (req.body.currentImageAnalysis) {
      currentMsgStr += `
${req.body.currentImageAnalysis}`;
    }
    contents.push(currentMsgStr);
    const summaryBlock = mergedEarlierChatSummary ? `
${mergedEarlierChatSummary}
` : "";
    const promptText = contextPrompt + summaryBlock + "\n\u5BF9\u8BDD\u5386\u53F2\uFF1A\n" + contents.join("\n");
    let responseText = "";
    let thinkingProcess = "\u5206\u6790\u7528\u6237\u610F\u56FE\uFF0C\u5339\u914D\u4EBA\u8BBE\u7279\u5F81\uFF0C\u5F62\u6210\u5FAE\u4FE1\u53E3\u8BED\u5316\u56DE\u590D\u3002";
    let replyContent = "";
    const extractedDeviceActions = [];
    let aiDetailedResult;
    try {
      aiDetailedResult = await callAiServiceDetailed({
        prompt: promptText,
        model: textGenConfig.model,
        apiKey: textGenConfig.apiKey,
        baseUrl: textGenConfig.baseUrl,
        providerType: textGenConfig.providerType,
        apiProtocol: textGenConfig.apiProtocol,
        customHeaders: textGenConfig.customHeaders,
        timeoutMs: textGenConfig.timeoutMs
      });
      if (!aiDetailedResult.text || !aiDetailedResult.text.trim()) {
        const emptyErr = new Error(`\u4E0A\u6E38\u6A21\u578B (${textGenConfig.model}) \u8FD4\u56DE\u7A7A\u5185\u5BB9`);
        emptyErr.statusCode = 502;
        emptyErr.errorType = "EMPTY_RESPONSE";
        emptyErr.protocol = textGenConfig.apiProtocol;
        emptyErr.headersReceived = true;
        emptyErr.upstreamRequestSent = true;
        emptyErr.mayHaveBeenCharged = true;
        emptyErr.durationMs = Date.now() - startTime;
        throw emptyErr;
      }
      responseText = aiDetailedResult.text;
    } catch (e) {
      const duration2 = e?.durationMs || Date.now() - startTime;
      const aiErrorMessage = e?.message || "API \u8C03\u7528\u5F02\u5E38";
      const httpStatus = typeof e?.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502;
      const effectiveProtocol = e?.protocol || textGenConfig.apiProtocol;
      const endpointType2 = effectiveProtocol === "openai_compatible" ? "chat_completions" : "generate_content";
      const upstreamRequestSent = typeof e?.upstreamRequestSent === "boolean" ? e.upstreamRequestSent : true;
      const mayHaveBeenCharged = Boolean(e?.mayHaveBeenCharged);
      const errorType = e?.errorType || (httpStatus === 429 ? "rate_limit" : httpStatus === 401 ? "auth_error" : httpStatus === 404 ? "not_found" : "network_error");
      console.warn(
        `[/api/gemini/chat] Request ${requestId} failed (protocol=${effectiveProtocol}, status=${httpStatus}, cause=${e?.causeCode || "none"}, mayHaveBeenCharged=${mayHaveBeenCharged}): ${aiErrorMessage}`
      );
      return res.status(httpStatus).json({
        success: false,
        statusCode: httpStatus,
        error: aiErrorMessage,
        errorMessage: aiErrorMessage,
        errorType,
        requestId,
        protocol: effectiveProtocol,
        endpointType: endpointType2,
        causeCode: e?.causeCode,
        upstreamRequestSent,
        mayHaveBeenCharged,
        retryable: true,
        contextMetrics: effectiveChatMetrics,
        apiLog: buildApiLogObject({
          appName: "\u5FAE\u4FE1-AI\u804A\u5929",
          provider: textGenConfig.providerType,
          modelName: textGenConfig.model,
          interfaceType: "ChatGeneration",
          category: "text_generation",
          status: "failed",
          httpStatus,
          requestId,
          durationMs: duration2,
          errorType,
          error: aiErrorMessage,
          purpose: `\u4E0E ${character?.name || "AI"} \u5BF9\u8BDD\u4EA4\u4E92\u5931\u8D25 (\u8017\u65F6 ${duration2}ms)`,
          protocol: effectiveProtocol,
          endpointType: endpointType2,
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
          contextCompressed: effectiveChatMetrics.didCompress
        })
      });
    }
    const extracted = extractThinkingAndContent(responseText);
    thinkingProcess = extracted.thinkingProcess;
    replyContent = extracted.cleanText;
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
    const extractedActions = [];
    const imageActionRegex = /<image_action>([\s\S]*?)<\/image_action>/gi;
    let imgMatch;
    while ((imgMatch = imageActionRegex.exec(replyContent)) !== null) {
      try {
        const parsedAction = JSON.parse(imgMatch[1].trim());
        const isGenImg = parsedAction && (parsedAction.type === "generate_image" || parsedAction.action === "generate_image") && typeof parsedAction.prompt === "string" && parsedAction.prompt.trim();
        if (isGenImg) {
          extractedActions.push({
            type: "generate_image",
            prompt: parsedAction.prompt.trim(),
            imageDescription: typeof parsedAction.imageDescription === "string" && parsedAction.imageDescription.trim() ? parsedAction.imageDescription.trim() : parsedAction.prompt.trim().slice(0, 100),
            aspectRatio: typeof parsedAction.aspectRatio === "string" ? parsedAction.aspectRatio.trim() : "1:1",
            negativePrompt: typeof parsedAction.negativePrompt === "string" ? parsedAction.negativePrompt.trim() : ""
          });
        }
      } catch {
        console.warn("[Chat] Failed to parse <image_action> JSON");
      }
    }
    const strippedTags = replyContent.replace(/<device_action>[\s\S]*?<\/device_action>/gi, "").replace(/<image_action>[\s\S]*?<\/image_action>/gi, "").trim();
    let finalReplyText = strippedTags;
    if (strippedTags.startsWith("{") && strippedTags.endsWith("}") && strippedTags.includes('"actions"')) {
      try {
        const parsedObj = JSON.parse(strippedTags);
        if (parsedObj && typeof parsedObj === "object" && Array.isArray(parsedObj.actions)) {
          for (const act of parsedObj.actions) {
            if ((act?.type === "generate_image" || act?.action === "generate_image") && typeof act.prompt === "string" && act.prompt.trim()) {
              extractedActions.push({
                type: "generate_image",
                prompt: act.prompt.trim(),
                imageDescription: typeof act.imageDescription === "string" && act.imageDescription.trim() ? act.imageDescription.trim() : act.prompt.trim().slice(0, 100),
                aspectRatio: typeof act.aspectRatio === "string" ? act.aspectRatio.trim() : "1:1",
                negativePrompt: typeof act.negativePrompt === "string" ? act.negativePrompt.trim() : ""
              });
            }
          }
          if (typeof parsedObj.text === "string") {
            finalReplyText = parsedObj.text;
          }
        }
      } catch {
      }
    }
    replyContent = sanitizeReplyText(
      finalReplyText.replace(/<\/?(?:image_action|device_action)[^>]*>/gi, "").trim()
    );
    const duration = Date.now() - startTime;
    const endpointType = textGenConfig.apiProtocol === "openai_compatible" ? "chat_completions" : "generate_content";
    res.json({
      success: true,
      text: replyContent,
      thinkingProcess,
      deviceActions: extractedDeviceActions,
      actions: extractedActions,
      requestId,
      protocol: textGenConfig.apiProtocol,
      contextMetrics: effectiveChatMetrics,
      apiLog: buildApiLogObject({
        appName: "\u5FAE\u4FE1-AI\u804A\u5929",
        provider: textGenConfig.providerType,
        modelName: aiDetailedResult?.modelUsed || selectedModel,
        interfaceType: "ChatGeneration",
        category: "text_generation",
        status: "success",
        httpStatus: 200,
        requestId,
        durationMs: duration,
        usage: aiDetailedResult?.usage,
        isRealTokens: aiDetailedResult?.isRealTokens,
        purpose: `\u4E0E ${character.name} \u5BF9\u8BDD\u4EA4\u4E92 (\u8017\u65F6 ${duration}ms)`,
        protocol: textGenConfig.apiProtocol,
        endpointType,
        headersReceived: true,
        upstreamRequestSent: true,
        contextRawCount: effectiveChatMetrics.rawCount,
        contextSummarizedCount: effectiveChatMetrics.summarizedCount,
        contextEstimatedTokens: effectiveChatMetrics.estimatedTokens,
        contextCompressed: effectiveChatMetrics.didCompress
      })
    });
  } catch (error) {
    return handleAiEndpointError(res, error, "Gemini Chat");
  }
});
app.post("/api/gemini/group-chat", async (req, res) => {
  const {
    roundId: requestedRoundId,
    triggerType = "user_double_click",
    activityLevel = "natural",
    targetPollId,
    activePolls = [],
    activeRelays = [],
    aiPrivateContexts = [],
    contextMetrics: clientGroupContextMetrics,
    olderContextSummary = "",
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
    apiConfig
  } = req.body || {};
  const startTime = Date.now();
  const groupTextCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = groupTextCfg.model;
  const roundId = typeof requestedRoundId === "string" && requestedRoundId.trim() ? requestedRoundId.trim() : `r_${startTime}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    if (!aiCandidates || aiCandidates.length === 0) {
      return res.json({
        success: true,
        roundId,
        shouldRespond: false,
        events: [],
        replies: [],
        reason: "No AI members in group"
      });
    }
    const activityPresetMap = {
      quiet: {
        label: "\u5B89\u9759",
        minAi: 1,
        maxAi: Math.min(2, aiCandidates.length),
        minBubbles: 1,
        maxBubbles: 4,
        styleHint: "\u514B\u5236\u53D1\u8A00\uFF0C\u4EC5\u88AB\u70B9\u540D\u3001\u88AB\u63D0\u95EE\u6216\u4E0E\u81EA\u8EAB\u9AD8\u5EA6\u76F8\u5173\u7684\u6210\u5458\u81EA\u7136\u63A5\u8BDD\uFF0C\u4E0D\u51D1\u70ED\u95F9\u3002"
      },
      natural: {
        label: "\u81EA\u7136",
        minAi: Math.min(2, aiCandidates.length),
        maxAi: Math.min(3, aiCandidates.length),
        minBubbles: 3,
        maxBubbles: 8,
        styleHint: "\u50CF\u771F\u5B9E\u5FAE\u4FE1\u719F\u4EBA\u7FA4\u4E00\u6837\u81EA\u7136\u804A\u51E0\u53E5\uFF0C\u5141\u8BB8 2~3 \u4F4D\u6210\u5458\u4EA4\u9519\u63A5\u8BDD\u3001\u987A\u5634\u8C03\u4F83\u6216\u8865\u5145\u3002"
      },
      lively: {
        label: "\u70ED\u95F9",
        minAi: Math.min(3, aiCandidates.length),
        maxAi: Math.min(5, aiCandidates.length),
        minBubbles: 5,
        maxBubbles: 12,
        styleHint: "\u7FA4\u804A\u6C14\u6C1B\u6D3B\u8DC3\uFF0C\u591A\u4F4D\u6210\u5458\u4E92\u76F8\u63A5\u6897\u3001\u62A2\u8BDD\u3001\u5410\u69FD\u3001\u8FFD\u95EE\u6216\u5C0F\u5E45\u4E89\u8BBA\uFF0C\u8282\u594F\u7D27\u51D1\u4EA4\u9519\u3002"
      }
    };
    const preset = activityPresetMap[String(activityLevel)] || activityPresetMap.natural;
    const candidateProfilesText = aiCandidates.map((c) => {
      const persona = c.customPersona || c.persona || "\u666E\u901A\u7FA4\u53CB";
      const personality = c.customPersonality || c.personality || "\u53CB\u5584\u4EA4\u6D41";
      const memories = Array.isArray(c.memories) && c.memories.length > 0 ? c.memories.join("\uFF1B") : "\u6682\u65E0\u7279\u6B8A\u8BB0\u5FC6";
      return `\u3010AI\u6210\u5458: ${c.name}\u3011(senderId/actorId: "${c.id}", \u5FAE\u4FE1\u53F7: ${c.wxid || c.id})
- \u8EAB\u4EFD\u8BBE\u5B9A: ${persona}
- \u6027\u683C\u4E0E\u53E3\u543B\u7279\u5F81: ${personality}
- \u4E13\u5C5E\u957F\u671F\u8BB0\u5FC6: ${memories}`;
    }).join("\n\n");
    const relationshipsText = Array.isArray(aiRelationships) && aiRelationships.length > 0 ? aiRelationships.map(
      (r) => typeof r === "string" ? `- ${r}` : `- ${r.summary || `${r.memberAName}\u4E0E${r.memberBName}:${r.status}`}`
    ).join("\n") : "\u6682\u65E0\u7279\u6B8A\u5DF2\u8BB0\u5F55\u7684AI\u6210\u5458\u79C1\u4EBA\u5173\u7CFB\uFF0C\u6309\u7FA4\u5185\u6210\u5458\u6027\u683C\u81EA\u7136\u76F8\u5904\u3002";
    const rawGroupMsgs = Array.isArray(recentMessages) ? recentMessages : [];
    const serverGroupProtection = applyOverlengthContextProtection({
      messages: rawGroupMsgs,
      maxRawLimit: STANDARD_CONTEXT_LIMIT,
      formatForEstimate: (m) => ({
        timestamp: m.timestamp || m.createdAt || m.time,
        senderName: m.senderName,
        text: m.messageType === "forward_bundle" && (m.forwardBundle || m.payload) ? serializeForwardBundleForAi(m.forwardBundle || m.payload) : m.text || ""
      }),
      cloneWithTruncatedText: (m, truncatedText) => ({ ...m, text: truncatedText })
    });
    const effectiveGroupMessages = serverGroupProtection.rawMessages;
    const effectiveGroupMetrics = clientGroupContextMetrics && typeof clientGroupContextMetrics.rawCount === "number" ? clientGroupContextMetrics : serverGroupProtection.metrics;
    const mergedGroupOlderSummary = [olderContextSummary, serverGroupProtection.earlierSummaryText].filter((s) => typeof s === "string" && s.trim().length > 0).join("\n\n");
    const historyText = effectiveGroupMessages.map((m) => {
      const msgTime = formatFullDateTime(m.timestamp || m.createdAt || m.time);
      const mentions = m.mentionedMemberIds && m.mentionedMemberIds.length > 0 ? ` [@${m.mentionedMemberIds.join(", ")}]` : "";
      const quotePrefix = m.quoteMessage?.text ? `[\u5F15\u7528 ${m.quoteMessage.senderName || "\u67D0\u4EBA"}: ${String(m.quoteMessage.text).slice(0, 40)}] ` : "";
      let body = m.text || "";
      if (m.messageType === "forward_bundle") {
        const bundle = m.forwardBundle || (m.payload && Array.isArray(m.payload.items) ? m.payload : null);
        body = bundle ? serializeForwardBundleForAi(bundle) : body;
      } else if (m.messageType === "image") {
        body = body.startsWith("[\u56FE\u7247") ? body : `[\u56FE\u7247\u6D88\u606F\uFF1A${body || "\u672A\u9644\u63CF\u8FF0"}]`;
      } else if (m.messageType === "relay" && m.payload) {
        const entries = Array.isArray(m.payload.entries) ? m.payload.entries.map((e, i) => `${i + 1}.${e.memberName}:${e.content}`).join("\uFF1B") : "";
        body = `[\u7FA4\u63A5\u9F99 relayMessageId="${m.id}" | ${m.payload.closed ? "\u5DF2\u7ED3\u675F" : "\u8FDB\u884C\u4E2D"}: ${m.payload.title || m.text}] \u5DF2\u63A5\u9F99(${m.payload.entries?.length || 0}): ${entries || "\u6682\u65E0"}`;
      } else if (m.messageType === "poll" && m.payload) {
        const opts = Array.isArray(m.payload.options) ? m.payload.options.map((o) => {
          const count = typeof o.votes === "number" ? o.votes : o.voterIds?.length || 0;
          const voters = !m.payload.anonymous && Array.isArray(o.voterNames) && o.voterNames.length > 0 ? `(${o.voterNames.join("\u3001")})` : "";
          return `${o.text}[${count}\u7968${voters}]`;
        }).join(" / ") : "";
        body = `[\u7FA4\u6295\u7968 pollId="${m.id}" | ${m.payload.closed ? "\u5DF2\u7ED3\u675F" : "\u8FDB\u884C\u4E2D"}${m.payload.anonymous ? "\xB7\u533F\u540D" : "\xB7\u5B9E\u540D"}: ${m.payload.title || m.text}] \u9009\u9879: ${opts}`;
      } else if (m.messageType === "random_draw" && m.payload) {
        const winners = Array.isArray(m.payload.winners) ? m.payload.winners.map((w) => w.memberName).join("\u3001") : "";
        body = `[\u968F\u673A\u62BD\u4EBA: ${m.payload.taskDescription || m.text}] \u5DF2\u62BD\u51FA\u7ED3\u679C: ${winners}`;
      }
      return `[${msgTime}] [${m.senderName} (${m.senderType})]: ${quotePrefix}${body}${mentions}`;
    }).join("\n");
    const openPollsList = Array.isArray(activePolls) ? activePolls : [];
    const activePollsText = openPollsList.length > 0 ? openPollsList.map((p) => {
      const optLines = (Array.isArray(p.options) ? p.options : []).map((o) => {
        const voters = !p.anonymous && Array.isArray(o.voterNames) && o.voterNames.length > 0 ? `\uFF0C\u5DF2\u6295\uFF1A${o.voterNames.join("\u3001")}` : "";
        return `    - optionId="${o.id}" | "${o.text}" (${o.votes || 0}\u7968${voters})`;
      }).join("\n");
      const votedText = Array.isArray(p.alreadyVotedAiIds) && p.alreadyVotedAiIds.length > 0 ? p.alreadyVotedAiIds.join(", ") : "\u6682\u65E0AI\u5DF2\u6295\u7968";
      return `\u2022 pollId="${p.pollId}"${p.isTargetPoll ? " \u3010\u672C\u8F6E\u91CD\u70B9\u9080\u8BF7\u6295\u7968\u3011" : ""}
  \u6807\u9898: ${p.title}
  \u89C4\u5219: ${p.multiSelect ? `\u591A\u9009(\u6700\u591A\u9009${p.maxSelections || 2}\u9879)` : "\u5355\u9009"} | ${p.anonymous ? "\u533F\u540D\u6295\u7968" : "\u5B9E\u540D\u6295\u7968"}
  \u5DF2\u6295\u8FC7\u7684AI(\u4E25\u7981\u91CD\u590D\u6295\u7968): ${votedText}
  \u53EF\u9009\u9879:
${optLines}`;
    }).join("\n\n") : "\u5F53\u524D\u7FA4\u5185\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u6295\u7968\u3002";
    const openRelaysList = Array.isArray(activeRelays) ? activeRelays : [];
    const activeRelaysText = openRelaysList.length > 0 ? openRelaysList.map((r) => {
      const entryLines = (Array.isArray(r.entries) ? r.entries : []).map((e, idx) => `    ${idx + 1}. ${e.memberName}: ${e.content}`).join("\n");
      const joinedText = Array.isArray(r.alreadyJoinedAiIds) && r.alreadyJoinedAiIds.length > 0 ? r.alreadyJoinedAiIds.join(", ") : "\u6682\u65E0AI\u5DF2\u53C2\u4E0E";
      return `\u2022 relayMessageId="${r.relayMessageId}"
  \u6807\u9898: ${r.title}${r.description ? ` | \u8BF4\u660E: ${r.description}` : ""}
  \u89C4\u5219: ${r.allowDuplicate ? "\u5141\u8BB8\u540C\u4E00\u6210\u5458\u591A\u6B21\u63A5\u9F99" : "\u6BCF\u4EBA\u9650\u53C2\u4E0E\u4E00\u6B21(\u5DF2\u53C2\u4E0E\u7684AI\u4E25\u7981\u91CD\u590D\u53C2\u4E0E)"}
  \u5DF2\u63A5\u9F99\u8FC7\u7684AI: ${joinedText}
  \u5F53\u524D\u63A5\u9F99\u5217\u8868:
${entryLines || "    (\u6682\u65E0\u6210\u5458\u5199\u5165)"}`;
    }).join("\n\n") : "\u5F53\u524D\u7FA4\u5185\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u63A5\u9F99\u3002";
    const privateContextList = Array.isArray(aiPrivateContexts) ? aiPrivateContexts : [];
    const isolatedPrivateText = privateContextList.length > 0 ? privateContextList.map((ctx) => {
      const lines = Array.isArray(ctx.recentPrivateLines) ? ctx.recentPrivateLines : [];
      const stateLine = ctx.continuitySummary ? `
  \u72B6\u6001\u5907\u5FD8: ${ctx.continuitySummary}` : "";
      return `\u25B8 [${ctx.characterName}] (memberId="${ctx.memberId || ctx.characterId}") \u4E0E\u7528\u6237\u7684\u4E13\u5C5E\u79C1\u804A\u8FD1\u51B5\uFF08\u5171${ctx.privateMessageCount || lines.length}\u6761\uFF0C\u4EC5\u9650\u8BE5\u89D2\u8272\u672C\u4EBA\u77E5\u6653\uFF09:${stateLine}
${lines.length > 0 ? lines.map((l) => `    ${l}`).join("\n") : "    (\u8FD1\u671F\u65E0\u79C1\u804A\u8BB0\u5F55)"}`;
    }).join("\n\n") : "";
    const nativeTime = systemTime || (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
    const latestUserLine = latestUserMessage?.text ? `
\u7528\u6237\u6700\u65B0\u6D88\u606F\uFF1A${latestUserMessage.senderName || userProfile?.name || "\u5C0F\u6E05"} \u8BF4\u300C${latestUserMessage.text}\u300D` : "";
    const systemPrompt = `\u4F60\u662F\u9AD8\u5EA6\u62DF\u771F\u7684\u201C\u5FAE\u4FE1\u591AAI\u7FA4\u804A\u7EDF\u4E00\u56DE\u5408\u7F16\u6392\u4E2D\u67A2\u201D\u3002
\u4F60\u7684\u804C\u8D23\u662F\u4E00\u6B21\u6027\u7F16\u6392\u51FA\u672C\u8F6E\u5B8C\u6574\u3001\u771F\u5B9E\u3001\u81EA\u7136\u7684\u7FA4\u804A\u4E8B\u4EF6\u65F6\u95F4\u7EBF\uFF08events\uFF09\uFF0C\u524D\u7AEF\u5C06\u4E25\u683C\u6309\u987A\u5E8F\u672C\u5730\u64AD\u653E\uFF0C\u4E0D\u518D\u4E8C\u6B21\u8BF7\u6C42\u6A21\u578B\u3002

\u5F53\u524D\u7FA4\u804A\u4FE1\u606F\uFF1A
- \u7FA4\u540D\u79F0\uFF1A${group?.name || "\u5FAE\u4FE1\u7FA4\u804A"}
- \u7FA4\u516C\u544A\uFF1A${group?.notice || "\u65E0\u7279\u5B9A\u516C\u544A"}
- \u672C\u7FA4\u6D3B\u8DC3\u5EA6\u6863\u4F4D\uFF1A\u3010${preset.label}\u3011(${preset.styleHint})
- \u672C\u5730\u771F\u5B9E\u7CFB\u7EDF\u65F6\u95F4\uFF1A${nativeTime}
- \u57CE\u5E02/\u4F4D\u7F6E\u611F\u77E5\uFF1A${locationCity || weatherInfo?.city || "\u672A\u6307\u5B9A"}
- \u771F\u4EBA\u7528\u6237\uFF1A${userProfile?.name || "\u5C0F\u6E05"} (wxid: ${userProfile?.wxid || "xiaoqing"})

\u7FA4\u5185\u53EF\u53C2\u4E0E\u7684AI\u6210\u5458\uFF1A
${candidateProfilesText}

\u7FA4\u6210\u5458\u5F53\u524D\u5DF2\u77E5\u793E\u4F1A\u5173\u7CFB\uFF1A
${relationshipsText}
${isolatedPrivateText ? `
\u5404AI\u6210\u5458\u4E0E\u7528\u6237\u7684\u4E13\u5C5E\u79C1\u804A\u8FD1\u51B5\uFF08\u4E25\u683C\u9690\u79C1\u9694\u79BB\u51C6\u5219\uFF1A\u6BCF\u4F4DAI\u53EA\u80FD\u77E5\u9053\u81EA\u5DF1\u4E0E\u7528\u6237\u7684\u79C1\u804A\u7ECF\u5386\uFF0C\u7EDD\u4E0D\u5141\u8BB8\u628AAI A\u4E0E\u7528\u6237\u7684\u79C1\u804A\u5F53\u6210AI B\u77E5\u9053\u7684\u4E8B\uFF0C\u4E5F\u4E0D\u8981\u5728\u7FA4\u91CC\u751F\u786C\u6CC4\u9732\u7528\u6237\u7684\u79C1\u5BC6\u8BDD\u9898\uFF01\uFF09\uFF1A
${isolatedPrivateText}
` : ""}
\u5F53\u524D\u7FA4\u5185\u8FDB\u884C\u4E2D\u7684\u6295\u7968\uFF1A
${activePollsText}

\u5F53\u524D\u7FA4\u5185\u8FDB\u884C\u4E2D\u7684\u63A5\u9F99\uFF1A
${activeRelaysText}

\u3010\u7EDF\u4E00\u7F16\u6392\u6838\u5FC3\u89C4\u5219\u3011\uFF1A
1. \u6D3B\u8DC3\u5EA6\u4E0E\u4EBA\u6570\u63A7\u5236\uFF1A
   - \u672C\u8F6E\u5EFA\u8BAE\u53C2\u4E0EAI\u6570\u91CF\uFF1A${preset.minAi}~${preset.maxAi} \u4F4D\uFF1B\u603B\u6D88\u606F\u6C14\u6CE1\u6570\u63A7\u5236\u5728 ${preset.minBubbles}~${preset.maxBubbles} \u6761\u4E4B\u95F4\uFF08\u9664\u88AB @\u6307\u5B9A\u5355\u4EBA \u65F6\u53EF\u9002\u5F53\u6536\u655B\uFF09\u3002
   - \u82E5\u67D0\u4F4DAI\u88AB\u663E\u5F0F @ \u4E86\uFF0C\u8BE5AI\u5FC5\u987B\u4F18\u5148\u54CD\u5E94\uFF1B\u5176\u4ED6\u4EBA\u53EF\u81EA\u7136\u63D2\u8BDD\u6216\u4FDD\u6301\u6C89\u9ED8\u3002
   - \u82E5\u7528\u6237\u521A\u63D2\u8BDD\u6253\u65AD\uFF08triggerType="user_interrupt"\uFF09\uFF0C\u5FC5\u987B\u4F18\u5148\u627F\u63A5\u7528\u6237\u521A\u8BF4\u7684\u65B0\u8BDD\u3002
2. \u591A\u6C14\u6CE1\u81EA\u7136\u5FAE\u4FE1\u98CE\u683C\uFF1A
   - \u6BCF\u6761 message \u4E8B\u4EF6\u7528 bubbles \u6570\u7EC4\u8F93\u51FA 1~2 \u6761\u77ED\u6C14\u6CE1\uFF08\u6781\u5C11\u6570\u6FC0\u52A8/\u89E3\u91CA\u65F6\u6700\u591A 3 \u6761\uFF09\uFF0C\u6BCF\u6761\u6C14\u6CE1\u63A7\u5236\u5728 15~80 \u5B57\u4EE5\u5185\uFF0C\u53E3\u8BED\u81EA\u7136\uFF0C\u4E0D\u8981\u5199\u6210\u5927\u6BB5\u4E66\u9762\u6587\u7AE0\u3002
   - \u4E0D\u8981\u6BCF\u6B21\u53D1\u8A00\u90FD\u673A\u68B0\u5730 @ \u522B\u4EBA\uFF0C\u53EA\u5728\u771F\u6B63\u70B9\u540D\u6216\u8DE8\u8BDD\u9898\u53EB\u4EBA\u65F6\u81EA\u7136\u4F7F\u7528\u3002
3. \u591A\u4EBA\u4EA4\u9519\u63A5\u8BDD\uFF08\u975E\u5E38\u91CD\u8981\uFF09\uFF1A
   - \u9F13\u52B1\u628A\u4E0D\u540CAI\u7684\u53D1\u8A00\u4EA4\u9519\u6392\u5728 events \u4E2D\uFF08\u4F8B\u5982 A \u8BF4 1~2 \u53E5 -> B \u63A5\u8BDD/\u5410\u69FD -> A \u56DE\u5E94 B -> C \u63D2\u8BDD -> B \u8865\u4E00\u53E5\uFF09\uFF0C\u800C\u4E0D\u662F\u6BCF\u4EBA\u4E00\u53E3\u6C14\u8BF4\u5B8C\u5927\u6BB5\u8BDD\u3002
   - \u540E\u9762\u51FA\u73B0\u7684\u4E8B\u4EF6\u5FC5\u987B\u628A\u524D\u9762\u4E8B\u4EF6\u7684\u5185\u5BB9\u548C\u6295\u7968/\u63A5\u9F99\u52A8\u4F5C\u5F53\u6210\u201C\u521A\u521A\u5DF2\u7ECF\u53D1\u751F\u201D\uFF0C\u76F4\u63A5\u987A\u7740\u63A5\u8BDD\u6216\u56DE\u5E94\uFF01
4. AI \u771F\u5B9E\u6295\u7968\u673A\u5236\uFF08vote_poll\uFF09\uFF1A
   - \u5F53\u7FA4\u5185\u6709\u8FDB\u884C\u4E2D\u7684\u6295\u7968\u4E14AI\u51B3\u5B9A\u53C2\u4E0E\u6295\u7968\u65F6\uFF0C\u5FC5\u987B\u8F93\u51FA\u771F\u6B63\u7684 type="vote_poll" \u4E8B\u4EF6\uFF08\u4F7F\u7528\u51C6\u786E\u7684 pollId\u3001actorId \u548C optionId/optionIds\uFF09\u3002
   - \u4E25\u7981\u53EA\u53D1\u6D88\u606F\u8BF4\u201C\u6211\u6295\u4E86XX\u201D\u5374\u4E0D\u8F93\u51FA\u5BF9\u5E94\u7684 vote_poll \u4E8B\u4EF6\uFF01
   - \u4E25\u7981\u7ED9\u201C\u5DF2\u6295\u8FC7\u7684AI\u201D\u91CD\u590D\u8F93\u51FA vote_poll\uFF1B\u4E25\u7981\u5BF9\u5DF2\u7ED3\u675F\u6295\u7968\u8F93\u51FA vote_poll\u3002
   - \u4E0D\u540CAI\u8981\u6839\u636E\u81EA\u5DF1\u7684\u4EBA\u8BBE\u3001\u504F\u597D\u3001\u5FC3\u60C5\u4E0E\u5F7C\u6B64\u5173\u7CFB\u505A\u51FA\u6709\u5DEE\u5F02\u7684\u9009\u62E9\uFF0C\u800C\u4E0D\u662F\u673A\u68B0\u5730\u5168\u6295\u540C\u4E00\u4E2A\u9009\u9879\u3002
5. AI \u771F\u5B9E\u53C2\u4E0E\u7FA4\u63A5\u9F99\uFF08join_relay\uFF09\uFF1A
   - \u5F53\u7FA4\u5185\u6709\u8FDB\u884C\u4E2D\u7684\u63A5\u9F99\uFF08\u672A\u7ED3\u675F\u4E14\u672A\u8FC7\u671F\uFF09\u4E14\u4E0E\u5F53\u524D\u8BDD\u9898\u76F8\u5173\u6216\u7528\u6237\u53D1\u8D77/\u62DB\u547C\u63A5\u9F99\u65F6\uFF0C\u7B26\u5408\u4EBA\u8BBE\u4E14\u613F\u610F\u53C2\u4E0E\u7684 AI \u5FC5\u987B\u8F93\u51FA\u771F\u5B9E\u7684 type="join_relay" \u4E8B\u4EF6\uFF08\u4F7F\u7528\u51C6\u786E\u7684 relayMessageId\u3001actorId \u548C\u975E\u7A7A\u63A5\u9F99\u5185\u5BB9 content\uFF09\uFF0C\u524D\u7AEF\u4F1A\u81EA\u52A8\u5C06\u8BE5\u6210\u5458\u540D\u548C\u5185\u5BB9\u5199\u5165\u63A5\u9F99\u5361\u7247\u4E2D\u3002
   - \u4E25\u7981\u53EA\u53E3\u5934\u8BF4\u201C\u6211\u63A5\u4E0A\u4E86\u201D\u5374\u4E0D\u8F93\u51FA join_relay \u4E8B\u4EF6\uFF1B\u82E5\u63A5\u9F99\u89C4\u5219\u4E3A\u6BCF\u4EBA\u9650\u4E00\u6B21\u4E14\u8BE5AI\u5DF2\u5728\u201C\u5DF2\u63A5\u9F99\u8FC7\u7684AI\u201D\u5217\u8868\u4E2D\uFF0C\u4E25\u7981\u91CD\u590D\u8F93\u51FA join_relay\uFF1B\u4E0D\u8981\u5F3A\u8FEB\u6240\u6709AI\u5168\u5458\u7ACB\u523B\u586B\u6EE1\uFF0C\u6309\u6027\u683C/\u5728\u7EBF\u611F\u9009\u62E9\u6027\u53C2\u4E0E\u3002
6. \u7FA4\u804A\u8F6C\u79C1\u804A\uFF08continue_in_private\uFF0C\u4E25\u683C\u4F4E\u9891\u9AD8\u95E8\u69DB\uFF09\uFF1A
   - \u4EC5\u5F53\u67D0\u4E2A AI \u5728\u5F53\u524D\u7FA4\u804A\u4E2D\u9047\u5230\u4E86**\u660E\u663E\u79C1\u5BC6\u3001\u654F\u611F\u3001\u918B\u610F/\u60C5\u7EEA\u6CE2\u52A8\u3001\u62C5\u5FC3\u7528\u6237\u4E0D\u8212\u670D\u3001\u6216\u6709\u660E\u786E\u53EA\u9002\u54081\u5BF91\u79C1\u4E0B\u4EA4\u4EE3\u7684\u8BDD**\u65F6\uFF0C\u624D\u53EF\u7531\u8BE5 AI \u989D\u5916\u53D1\u51FA\u4E00\u4E2A type="continue_in_private" \u4E8B\u4EF6\uFF08\u5148\u5728\u7FA4\u91CC\u53D1\u5B8C\u672C\u8F6E\u516C\u5F00\u56DE\u5E94\u6216\u9690\u5FCD\u6536\u4F4F\uFF0C\u518D\u968F\u540E\u5207\u5230\u79C1\u804A\uFF09\u3002
   - \u666E\u901A\u5BD2\u6684\u3001\u65E5\u5E38\u7FA4\u804A\u3001\u6295\u7968\u3001\u63A5\u9F99**\u4E25\u7981**\u6EE5\u7528 continue_in_private\uFF01\u82E5\u72B6\u6001\u5907\u5FD8\u5DF2\u63D0\u793A\u8BE5 AI \u521A\u8F6C\u53BB\u79C1\u804A\u4E14\u7528\u6237\u5C1A\u672A\u56DE\u590D\uFF0C\u4E25\u7981\u91CD\u590D\u5237\u5C4F\u8FFD\u95EE\u3002
   - continue_in_private \u683C\u5F0F\uFF1A{ "eventId": "ev_priv_1", "type": "continue_in_private", "actorId": "AI\u7684\u51C6\u786Eid", "reason": "\u79C1\u804A\u89E6\u53D1\u539F\u56E0", "triggerSummary": "\u7B80\u77ED\u89E6\u53D1\u573A\u666F", "privateOpeningMessages": ["\u5207\u79C1\u804A\u540E\u53D1\u51FA\u7684\u7B2C1\u53E5\u81EA\u7136\u77ED\u8BDD", "\u53EF\u9009\u7684\u7B2C2\u53E5"] }\u3002
7. \u89D2\u8272\u4EBA\u8BBE\u4E0E\u8DE8\u9891\u9053\u8FDE\u7EED\u6027\uFF1A
   - \u6BCF\u4E2AAI\u4E25\u683C\u4FDD\u6301\u5404\u81EA\u8BED\u6C14\u3001\u53E3\u7656\u548C\u957F\u671F\u8BB0\u5FC6\uFF0C\u7EDD\u4E0D\u4E32\u620F\u3001\u7EDD\u4E0D\u8BF4\u201C\u4F5C\u4E3AAI/\u8BED\u8A00\u6A21\u578B\u201D\u3002
   - \u5173\u7CFB\u7D27\u5F20\u6216\u51B7\u6218\u7684AI\u5728\u7FA4\u5185\u4E92\u52A8\u5E94\u81EA\u7136\u4F53\u73B0\u514B\u5236\u3001\u522B\u626D\u6216\u8F7B\u5EA6\u4E92\u603C\u3002
8. \u5EF6\u8FDF\u8282\u594F\uFF1A
   - \u6BCF\u4E2A\u4E8B\u4EF6\u8BBE\u7F6E\u5408\u7406\u7684 delayMs\uFF08650~1800ms\uFF09\uFF0C\u957F\u6C14\u6CE1\u6216\u601D\u8003\u6295\u7968/\u63A5\u9F99\u53EF\u7A0D\u957F\u3002`;
    let triggerDirective = "";
    if (triggerType === "invite_poll_vote" && targetPollId) {
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A\u9080\u8BF7\u7FA4\u5185AI\u53C2\u4E0E\u6295\u7968 (targetPollId="${targetPollId}")\u3011
\u7528\u6237\u521A\u521A\u70B9\u51FB\u4E86\u201C\u9080\u8BF7\u7FA4\u5185AI\u53C2\u4E0E\u6295\u7968\u201D\u3002\u8BF7\u4F18\u5148\u9488\u5BF9 pollId="${targetPollId}" \u7F16\u6392\u672C\u8F6E\u65F6\u95F4\u7EBF\uFF1A
- \u8BA9\u7FA4\u5185\u5C1A\u672A\u5BF9\u8BE5\u6295\u7968\u6295\u8FC7\u7968\u7684 AI \u6210\u5458\u6839\u636E\u5404\u81EA\u6027\u683C\u51B3\u5B9A\u662F\u5426\u6295\u7968\u4EE5\u53CA\u6295\u54EA\u4E00\u9879\uFF08\u53EF\u591A\u4EBA\u53C2\u4E0E\uFF0C\u4E5F\u53EF\u6709\u6781\u4E2A\u522B\u6309\u4EBA\u8BBE\u5F03\u6743\u6216\u89C2\u671B\uFF09\uFF1B
- \u4E3A\u6BCF\u4E2A\u51B3\u5B9A\u6295\u7968\u7684 AI \u8F93\u51FA\u51C6\u786E\u7684 type="vote_poll" \u4E8B\u4EF6\uFF0C\u5E76\u5728\u5408\u9002\u4F4D\u7F6E\u7A7F\u63D2\u7B80\u77ED\u81EA\u7136\u7684 type="message" \u6C14\u6CE1\uFF08\u4E5F\u53EF\u4EE5\u6709 AI \u9ED8\u9ED8\u6295\u7968\u4E0D\u8BF4\u8BDD\uFF09\uFF1B
- \u5982\u679C\u6240\u6709 AI \u90FD\u5DF2\u7ECF\u6295\u8FC7\u7968\uFF0C\u4E0D\u8981\u91CD\u590D\u8F93\u51FA vote_poll\uFF0C\u53EA\u9700\u7B80\u77ED\u81EA\u7136\u5730\u56DE\u5E94\u4E00\u53E5\u5DF2\u7ECF\u6295\u8FC7\u4E86\u3002`;
    } else if (triggerType === "user_interrupt") {
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A\u7528\u6237\u63D2\u8BDD\u6253\u65AD\u3011
\u7528\u6237\u521A\u624D\u5728 AI \u8BA8\u8BBA\u8FDB\u884C\u5230\u4E00\u534A\u65F6\u53D1\u4E86\u65B0\u6D88\u606F\uFF0C\u8BF7\u7ACB\u5373\u54CD\u5E94\u7528\u6237\u8FD9\u6761\u6700\u65B0\u6D88\u606F\uFF0C\u987A\u7740\u73B0\u6709\u5DF2\u8BF4\u51FA\u7684\u804A\u5929\u8BB0\u5F55\u81EA\u7136\u5C55\u5F00\u65B0\u4E00\u8F6E\u4EA4\u9519\u56DE\u5E94\u3002`;
    } else if (triggeredAiId && triggeredAiId !== "@all") {
      const targetAi = aiCandidates.find((c) => c.id === triggeredAiId);
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A\u6307\u5B9A\u56DE\u5E94\u3011
\u8BF7\u4EE5 AI \u6210\u5458\u3010${targetAi ? targetAi.name : "\u6307\u5B9AAI"}\u3011(senderId="${triggeredAiId}") \u4F5C\u4E3A\u6838\u5FC3\u56DE\u5E94\u8005\uFF08\u53EF\u53D1 1~2 \u6761\u81EA\u7136\u6C14\u6CE1\uFF09\uFF0C\u89C6\u7FA4\u804A\u6D3B\u8DC3\u5EA6\u5141\u8BB8\u5176\u4ED6\u76F8\u5173\u6210\u5458\u987A\u5634\u63A5 1~2 \u53E5\u3002`;
    } else if (triggeredAiId === "@all") {
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A@\u6240\u6709\u4EBA\u3011
\u7528\u6237\u521A\u521A @\u4E86\u6240\u6709\u4EBA\uFF0C\u8BF7\u5B89\u6392\u591A\u4F4D\u4E0D\u540C\u6027\u683C\u7684 AI \u6309\u771F\u5B9E\u5FAE\u4FE1\u7FA4\u8282\u594F\u4EA4\u9519\u5192\u6CE1\u56DE\u5E94\uFF08\u53EF\u5305\u542B\u591A\u6C14\u6CE1\u548C\u81EA\u7136\u4E92\u603C/\u8865\u5145\uFF09\u3002`;
    } else if (triggerType === "summon_discussion") {
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A\u53EC\u5524\u7FA4\u5185AI\u81EA\u7531\u8BA8\u8BBA\u3011
\u7528\u6237\u70B9\u51FB\u4E86\u201C\u53EC\u5524\u8BA8\u8BBA\u201D\uFF0C\u8BF7\u7ED3\u5408\u8FD1\u671F\u7FA4\u804A\u4E0A\u4E0B\u6587\u548C\u6210\u5458\u5173\u7CFB\uFF0C\u81EA\u7136\u5F00\u542F\u6216\u5EF6\u7EED\u4E00\u8F6E\u591A\u4EBA\u4EA4\u9519\u8BA8\u8BBA\u3002`;
    } else {
      triggerDirective = `\u3010\u672C\u8F6E\u89E6\u53D1\u7C7B\u578B\uFF1A\u7528\u6237\u53CC\u51FB\u89E6\u53D1\u7FA4\u804A\u56DE\u590D\u3011
\u8BF7\u6839\u636E\u6700\u65B0\u804A\u5929\u4E0A\u4E0B\u6587\u3001\u7FA4\u804A\u6D3B\u8DC3\u5EA6\uFF08${preset.label}\uFF09\u548C\u6210\u5458\u5173\u7CFB\uFF0C\u81EA\u7136\u7F16\u6392\u4E00\u8F6E\u4EA4\u9519\u53D1\u8A00\uFF08\u5982\u6709\u5408\u9002\u8FDB\u884C\u4E2D\u6295\u7968/\u63A5\u9F99\u4E14\u7B26\u5408\u5F53\u524D\u8BDD\u9898\uFF0C\u4E5F\u53EF\u987A\u5E26\u771F\u5B9E\u53C2\u4E0E\uFF09\u3002`;
    }
    const userPrompt = `${mergedGroupOlderSummary ? `\u3010\u66F4\u65E9\u5386\u53F2\u6458\u8981\u3011
${mergedGroupOlderSummary}

` : ""}\u3010\u8FD1\u671F\u7FA4\u804A\u8BB0\u5F55\u3011
---
${historyText || "(\u7FA4\u5185\u6682\u65E0\u66F4\u591A\u5386\u53F2)"}
---${latestUserLine}
${Array.isArray(mentionedTargets) && mentionedTargets.length > 0 ? `
\u672C\u8F6E\u63D0\u53CA\u76EE\u6807\uFF1A${mentionedTargets.join(", ")}` : ""}

${triggerDirective}

\u8BF7\u4E25\u683C\u8FD4\u56DE\u5982\u4E0B JSON \u7ED3\u6784\uFF08\u4E0D\u8981\u8F93\u51FA\u989D\u5916\u89E3\u91CA\u6587\u5B57\uFF09\uFF1A
{
  "roundId": "${roundId}",
  "shouldRespond": true,
  "thinkingSummary": "\u7B80\u8981\u8BF4\u660E\u672C\u8F6E\u4E3A\u4F55\u5B89\u6392\u8FD9\u4E9BAI\u53D1\u8A00/\u6295\u7968/\u63A5\u9F99\u4EE5\u53CA\u4E92\u52A8\u8282\u594F",
  "events": [
    {
      "eventId": "ev_1",
      "type": "message",
      "senderId": "\u53D1\u8A00AI\u7684\u51C6\u786Eid",
      "senderName": "\u53D1\u8A00AI\u540D\u79F0",
      "bubbles": ["\u7B2C\u4E00\u6761\u81EA\u7136\u77ED\u6C14\u6CE1", "\u53EF\u9009\u7684\u7B2C\u4E8C\u6761\u6C14\u6CE1"],
      "delayMs": 850,
      "mentionedMemberIds": [],
      "thinkingProcess": "\u8BE5AI\u6B64\u523B\u7684\u5185\u5FC3\u60F3\u6CD5\uFF08\u7B80\u77ED\uFF09"
    },
    {
      "eventId": "ev_2",
      "type": "vote_poll",
      "actorId": "\u6295\u7968AI\u7684\u51C6\u786Eid",
      "actorName": "\u6295\u7968AI\u540D\u79F0",
      "pollId": "\u8FDB\u884C\u4E2D\u6295\u7968\u7684\u51C6\u786EpollId",
      "optionId": "\u6240\u9009\u9009\u9879\u7684\u51C6\u786EoptionId",
      "optionIds": ["\u5355\u9009\u4F201\u4E2A\uFF0C\u591A\u9009\u6309\u4E0A\u9650\u4F20\u591A\u4E2AoptionId"],
      "delayMs": 750
    },
    {
      "eventId": "ev_3",
      "type": "join_relay",
      "actorId": "\u63A5\u9F99AI\u7684\u51C6\u786Eid",
      "actorName": "\u63A5\u9F99AI\u540D\u79F0",
      "relayMessageId": "\u8FDB\u884C\u4E2D\u63A5\u9F99\u7684\u51C6\u786ErelayMessageId",
      "content": "\u8BE5AI\u586B\u5165\u63A5\u9F99\u5361\u7247\u7684\u5177\u4F53\u5185\u5BB9",
      "delayMs": 850
    }
  ]
}
\u6CE8\u610F\uFF1A\u5982\u679C\u6CA1\u6709\u6295\u7968/\u63A5\u9F99/\u8F6C\u79C1\u804A\u52A8\u4F5C\uFF0Cevents \u4E2D\u53EA\u653E\u9700\u8981\u7684\u4E8B\u4EF6\u5373\u53EF\uFF1B\u4E0D\u8981\u5F3A\u884C\u8F93\u51FA\u672A\u89E6\u53D1\u7684\u4E8B\u4EF6\u7C7B\u578B\u3002`;
    const detailed = await callAiServiceDetailed({
      prompt: userPrompt,
      systemInstruction: systemPrompt,
      model: groupTextCfg.model,
      apiKey: groupTextCfg.apiKey,
      baseUrl: groupTextCfg.baseUrl,
      providerType: groupTextCfg.providerType,
      apiProtocol: groupTextCfg.apiProtocol,
      customHeaders: groupTextCfg.customHeaders,
      responseMimeType: "application/json",
      temperature: 0.78,
      timeoutMs: groupTextCfg.timeoutMs || 42e3
    });
    const rawResponse = detailed.text;
    let parsed;
    try {
      const cleanedRaw = String(rawResponse || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleanedRaw);
    } catch {
      const jsonMatch = String(rawResponse || "").match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("\u65E0\u6CD5\u89E3\u6790\u7FA4\u804AAI\u8FD4\u56DE\u7684JSON");
      }
    }
    const duration = Date.now() - startTime;
    const rawEvents = [];
    if (Array.isArray(parsed?.events) && parsed.events.length > 0) {
      rawEvents.push(...parsed.events);
    } else if (Array.isArray(parsed?.replies) && parsed.replies.length > 0) {
      parsed.replies.forEach((r, idx) => {
        rawEvents.push({
          eventId: `${roundId}_r_${idx}`,
          type: "message",
          senderId: r.responderId || r.senderId || aiCandidates[0]?.id,
          senderName: r.responderName || r.senderName || aiCandidates[0]?.name,
          bubbles: Array.isArray(r.bubbles) ? r.bubbles : r.text ? [r.text] : [],
          delayMs: idx === 0 ? 750 : 950,
          mentionedMemberIds: Array.isArray(r.mentionedMemberIds) ? r.mentionedMemberIds : [],
          thinkingProcess: r.thinkingProcess || ""
        });
      });
    } else if (parsed?.shouldRespond !== false && typeof parsed?.text === "string" && parsed.text.trim()) {
      rawEvents.push({
        eventId: `${roundId}_single_0`,
        type: "message",
        senderId: parsed.responderId || parsed.senderId || aiCandidates[0]?.id,
        senderName: parsed.responderName || parsed.senderName || aiCandidates[0]?.name,
        bubbles: [parsed.text],
        delayMs: 750,
        mentionedMemberIds: Array.isArray(parsed.mentionedMemberIds) ? parsed.mentionedMemberIds : [],
        thinkingProcess: parsed.thinkingProcess || ""
      });
    }
    if (Array.isArray(parsed?.actions) && parsed.actions.length > 0) {
      rawEvents.push(...parsed.actions);
    }
    const resolveCandidate = (id, name) => aiCandidates.find((c) => c.id === id || c.characterId === id) || aiCandidates.find((c) => name && c.name === String(name).trim());
    const normalizedEvents = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const ev = rawEvents[i];
      if (!ev || typeof ev !== "object") continue;
      const evType = String(ev.type || "").trim();
      const eventId = typeof ev.eventId === "string" && ev.eventId.trim() ? ev.eventId.trim() : `${roundId}_ev_${i}`;
      if (evType === "message") {
        const candidate = resolveCandidate(ev.senderId || ev.responderId, ev.senderName || ev.responderName) || aiCandidates[0];
        const bubbles = Array.isArray(ev.bubbles) ? ev.bubbles.map((b) => sanitizeReplyText(String(b || "")).trim()).filter(Boolean) : typeof ev.text === "string" && ev.text.trim() ? [sanitizeReplyText(ev.text).trim()].filter(Boolean) : [];
        if (bubbles.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: "message",
          senderId: candidate?.id || ev.senderId,
          senderName: candidate?.name || ev.senderName || "AI",
          bubbles,
          delayMs: Math.max(600, Math.min(2e3, Number(ev.delayMs) || 850)),
          mentionedMemberIds: Array.isArray(ev.mentionedMemberIds) ? ev.mentionedMemberIds : [],
          thinkingProcess: typeof ev.thinkingProcess === "string" ? ev.thinkingProcess.trim() : ""
        });
      } else if (evType === "vote_poll") {
        const candidate = resolveCandidate(ev.actorId || ev.senderId, ev.actorName);
        const pollId = typeof ev.pollId === "string" ? ev.pollId.trim() : "";
        const optionIds = Array.from(
          new Set(
            [
              ...Array.isArray(ev.optionIds) ? ev.optionIds : [],
              ...typeof ev.optionId === "string" ? [ev.optionId] : []
            ].map((v) => String(v || "").trim()).filter(Boolean)
          )
        );
        if (!candidate || !pollId || optionIds.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: "vote_poll",
          actorId: candidate.id,
          actorName: candidate.name,
          pollId,
          optionId: optionIds[0],
          optionIds,
          delayMs: Math.max(550, Math.min(1400, Number(ev.delayMs) || 750))
        });
      } else if (evType === "join_relay") {
        const candidate = resolveCandidate(ev.actorId || ev.senderId, ev.actorName || ev.senderName);
        const relayMessageId = String(ev.relayMessageId || ev.relayId || ev.messageId || "").trim();
        const content = sanitizeReplyText(String(ev.content || ev.text || "")).trim();
        if (!candidate || !relayMessageId || !content) continue;
        normalizedEvents.push({
          eventId,
          type: "join_relay",
          actorId: candidate.id,
          actorName: candidate.name,
          relayMessageId,
          content,
          delayMs: Math.max(600, Math.min(1500, Number(ev.delayMs) || 850))
        });
      } else if (evType === "continue_in_private") {
        const candidate = resolveCandidate(
          ev.actorId || ev.characterId || ev.senderId,
          ev.actorName || ev.senderName
        );
        if (!candidate) continue;
        const rawList = Array.isArray(ev.privateOpeningMessages) ? ev.privateOpeningMessages : Array.isArray(ev.messages) ? ev.messages : Array.isArray(ev.openingMessages) ? ev.openingMessages : typeof ev.text === "string" ? [ev.text] : [];
        const openings = rawList.map((s) => sanitizeReplyText(String(s || "")).trim()).filter(Boolean).slice(0, 3);
        if (openings.length === 0) continue;
        normalizedEvents.push({
          eventId,
          type: "continue_in_private",
          actorId: candidate.id,
          actorName: candidate.name,
          characterId: candidate.characterId || candidate.id,
          reason: typeof ev.reason === "string" && ev.reason.trim() ? ev.reason.trim() : "\u6709\u4E9B\u8BDD\u60F3\u79C1\u4E0B\u8DDF\u4F60\u8BF4",
          triggerSummary: typeof ev.triggerSummary === "string" && ev.triggerSummary.trim() ? ev.triggerSummary.trim() : void 0,
          privateOpeningMessages: openings,
          delayMs: 250
        });
      }
    }
    const normalizedReplies = normalizedEvents.filter((ev) => ev.type === "message").map((ev) => ({
      responderId: ev.senderId,
      responderName: ev.senderName,
      text: ev.bubbles.join("\n"),
      bubbles: ev.bubbles,
      thinkingProcess: ev.thinkingProcess || parsed?.thinkingSummary || "",
      mentionedMemberIds: ev.mentionedMemberIds || []
    }));
    const firstReply = normalizedReplies[0];
    const participantNames = Array.from(
      new Set(
        normalizedEvents.map((ev) => ev.type === "message" ? ev.senderName : ev.actorName).filter(Boolean)
      )
    );
    const totalBubblesCount = normalizedEvents.filter((ev) => ev.type === "message").reduce((sum, ev) => sum + (ev.bubbles?.length || 0), 0);
    const totalVotesCount = normalizedEvents.filter((ev) => ev.type === "vote_poll").length;
    const totalRelaysCount = normalizedEvents.filter((ev) => ev.type === "join_relay").length;
    res.json({
      success: true,
      roundId: typeof parsed?.roundId === "string" && parsed.roundId.trim() ? parsed.roundId.trim() : roundId,
      shouldRespond: parsed?.shouldRespond !== false && normalizedEvents.length > 0,
      thinkingSummary: typeof parsed?.thinkingSummary === "string" ? parsed.thinkingSummary.trim() : "",
      events: normalizedEvents,
      contextMetrics: effectiveGroupMetrics,
      // Backward-compatible legacy fields
      responderId: firstReply?.responderId || parsed?.responderId || aiCandidates[0]?.id,
      responderName: firstReply?.responderName || parsed?.responderName || aiCandidates[0]?.name,
      text: firstReply?.text || parsed?.text || "",
      thinkingProcess: firstReply?.thinkingProcess || parsed?.thinkingSummary || parsed?.thinkingProcess || "",
      mentionedMemberIds: firstReply?.mentionedMemberIds || parsed?.mentionedMemberIds || [],
      replies: normalizedReplies,
      log: buildApiLogObject({
        appName: "WeChatGroup",
        provider: groupTextCfg.providerType,
        modelName: detailed.modelUsed || selectedModel,
        interfaceType: "GroupChatOrchestration",
        durationMs: duration,
        usage: detailed.usage,
        isRealTokens: detailed.isRealTokens,
        protocol: groupTextCfg.apiProtocol,
        endpointType: groupTextCfg.apiProtocol === "openai_compatible" ? "chat_completions" : "generate_content",
        headersReceived: true,
        upstreamRequestSent: true,
        purpose: `\u7FA4\u804A\u7EDF\u4E00\u7F16\u6392(${preset.label}): ${participantNames.join("\u3001") || "AI"} \xB7 ${totalBubblesCount}\u6C14\u6CE1${totalVotesCount > 0 ? `/${totalVotesCount}\u6295\u7968` : ""}${totalRelaysCount > 0 ? `/${totalRelaysCount}\u63A5\u9F99` : ""} (\u8017\u65F6 ${duration}ms)`,
        contextRawCount: effectiveGroupMetrics.rawCount,
        contextSummarizedCount: effectiveGroupMetrics.summarizedCount,
        contextEstimatedTokens: effectiveGroupMetrics.estimatedTokens,
        contextCompressed: effectiveGroupMetrics.didCompress
      })
    });
  } catch (error) {
    return handleAiEndpointError(res, error, "Gemini Group Chat");
  }
});
app.post("/api/gemini/ai-social-turn", async (req, res) => {
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
    apiConfig
  } = req.body || {};
  const startTime = Date.now();
  const socialTextCfg = resolveTextGenerationConfig(apiConfig);
  const activeKey = socialTextCfg.apiKey;
  const activeBaseUrl = socialTextCfg.baseUrl;
  const activeProvider = socialTextCfg.providerType;
  const activeProtocol = socialTextCfg.apiProtocol;
  const selectedModel = socialTextCfg.model;
  try {
    const profileDesc = (c) => c ? `${c.name}(ID:${c.id}) | \u4EBA\u8BBE:${c.persona || "\u666E\u901A\u89D2\u8272"} | \u6027\u683C:${c.personality || "\u81EA\u7136\u771F\u5B9E"} | \u8BB0\u5FC6:${Array.isArray(c.memories) ? c.memories.slice(0, 4).join("\uFF1B") : "\u65E0"}` : "\u672A\u77E5\u6210\u5458";
    const systemInstruction = `\u4F60\u662F AI \u89D2\u8272\u793E\u4EA4\u4E8B\u4EF6\u751F\u6210\u5668\u3002\u5FC5\u987B\u4E25\u683C\u8D34\u5408\u53CC\u65B9\u4EBA\u8BBE\u4E0E\u5F53\u524D\u5BA2\u89C2\u5173\u7CFB\uFF0C\u4E0D\u5F97\u8FDD\u80CC\u5173\u7CFB\u89C4\u5219\u3001\u4E0D\u5F97\u51ED\u7A7A\u7F16\u9020\u672A\u53D1\u751F\u4E8B\u4EF6\u3001\u4E0D\u5F97\u5728\u8F93\u51FA\u6587\u6848\u4E2D\u4F7F\u7528\u201C\u4F5C\u4E3A\u4E00\u4E2AAI\u201D\u6216\u66B4\u9732\u5185\u90E8\u8BC4\u5206\u6570\u5B57\u3002\u4EC5\u8F93\u51FA\u7EAF JSON\u3002`;
    let prompt = "";
    if (actionType === "friend_request_decision") {
      prompt = `\u4E8B\u4EF6\uFF1A${profileDesc(actorA)} \u5411 ${profileDesc(actorB)} \u53D1\u9001\u597D\u53CB\u7533\u8BF7\u3002
\u5F53\u524D\u5173\u7CFB\u80CC\u666F\uFF1A${edgeSummary || "\u7FA4\u5185\u8BA4\u8BC6\u4F46\u5C1A\u672A\u6210\u4E3A\u597D\u53CB"}
\u573A\u666F\u89E6\u53D1\u6765\u6E90\uFF1A${groupContext?.reason || "\u5171\u540C\u7FA4\u804A\u4E92\u52A8\u540E\u4EA7\u751F\u8054\u7CFB"}
\u7528\u6237\u79F0\u547C\uFF1A${userProfile?.name || "\u5C71\u96E8"}

\u8BF7\u7AD9\u5728\u53CC\u65B9\u771F\u5B9E\u6027\u683C\u89D2\u5EA6\uFF0C\u751F\u6210\u7533\u8BF7\u9644\u8A00\uFF0C\u4EE5\u53CA ${actorB?.name} \u7684\u51B3\u5B9A\uFF08\u662F\u5426\u901A\u8FC7\uFF0C\u82E5\u901A\u8FC7\u53EF\u7ED9\u4E00\u53E5\u5F00\u573A\u767D\uFF09\u3002
\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "greeting": "\u53D1\u9001\u65B9\u597D\u53CB\u7533\u8BF7\u9A8C\u8BC1\u6D88\u606F\uFF08\u81EA\u7136\u77ED\u53E5\uFF0C<=30\u5B57\uFF09",
  "reason": "\u53D1\u9001\u65B9\u60F3\u52A0\u597D\u53CB\u7684\u81EA\u7136\u539F\u56E0\uFF081\u53E5\u8BDD\uFF09",
  "accepted": true,
  "decisionReason": "\u63A5\u6536\u65B9\u540C\u610F\u6216\u5A49\u62D2\u7684\u81EA\u7136\u7406\u7531\uFF081\u53E5\u8BDD\uFF09",
  "replyIntroText": "\u5982\u679C\u540C\u610F\uFF0C\u63A5\u6536\u65B9\u53D1\u51FA\u7684\u7B2C\u4E00\u53E5\u95EE\u5019\uFF08<=30\u5B57\uFF09",
  "summary": "\u4F9B\u5173\u7CFB\u8BB0\u5F55\u5C55\u793A\u7684\u81EA\u7136\u8BED\u8A00\u4E8B\u4EF6\u63CF\u8FF0\uFF08\u4E0D\u542B\u6570\u503C\u6216\u601D\u7EF4\u94FE\uFF09"
}`;
    } else if (actionType === "private_chat_burst") {
      const cappedMax = Math.max(2, Math.min(6, Number(maxMessages) || 4));
      const historyLines = recentPrivateMessages.slice(-8).map((m) => `${m.senderId === actorA?.id ? actorA?.name : actorB?.name}: ${m.text}`).join("\n");
      prompt = `\u4E8B\u4EF6\uFF1A\u597D\u53CB\u79C1\u804A\u4E92\u52A8\u56DE\u5408\uFF08\u9650 2 \u5230 ${cappedMax} \u6761\u771F\u5B9E\u77ED\u6D88\u606F\uFF0C\u4E25\u7981\u957F\u7BC7\u5927\u8BBA\uFF09\u3002
\u6210\u5458A\uFF1A${profileDesc(actorA)}
\u6210\u5458B\uFF1A${profileDesc(actorB)}
\u5F53\u524D\u5173\u7CFB\u6458\u8981\uFF1A${edgeSummary || "\u666E\u901A\u597D\u53CB"}
\u611F\u60C5\u8FB9\u754C\u7EA6\u675F\uFF1A${romanticContext || "\u666E\u901A\u53CB\u8C0A"}
\u7528\u6237\uFF1A${userProfile?.name || "\u5C71\u96E8"}
\u6700\u8FD1\u79C1\u804A\u7247\u6BB5\uFF1A
${historyLines || "(\u53CC\u65B9\u6210\u4E3A\u597D\u53CB\u540E\u7684\u65B0\u8BDD\u9898\u5F00\u7AEF)"}
\u672C\u6B21\u89E6\u53D1\u8BDD\u9898\uFF1A${groupContext?.topic || "\u65E5\u5E38\u5173\u5FC3\u3001\u7FA4\u5185\u8BDD\u9898\u5EF6\u7EED\u6216\u5404\u81EA\u8FD1\u51B5"}

\u8981\u6C42\uFF1A
- \u4E25\u683C\u8F93\u51FA 2~${cappedMax} \u6761\u5FAE\u4FE1\u77ED\u6C14\u6CE1\u5BF9\u8BDD\uFF0C\u7B26\u5408\u4E8C\u4EBA\u6027\u683C\u53E3\u543B\u5DEE\u5F02\u3002
- \u82E5\u5B58\u5728\u9501\u5B9A\u559C\u6B22\u4ED6\u4EBA\uFF08\u4F8B\u5982\u90FD\u559C\u6B22\u6216\u5176\u4E2D\u4E00\u65B9\u9501\u5B9A\u7528\u6237\uFF09\uFF0C\u53CC\u65B9\u4E0D\u5F97\u53D1\u5C55\u66A7\u6627\uFF01
\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "messages": [
    { "senderId": "${actorA?.id}", "text": "\u5BF9\u8BDD\u5185\u5BB9" },
    { "senderId": "${actorB?.id}", "text": "\u5BF9\u8BDD\u5185\u5BB9" }
  ],
  "attitudeDeltaAtoB": { "familiarity": 3, "trust": 2, "affinity": 3, "romanticAffinity": 0, "tension": 0, "jealousy": 0 },
  "attitudeDeltaBtoA": { "familiarity": 3, "trust": 2, "affinity": 3, "romanticAffinity": 0, "tension": 0, "jealousy": 0 },
  "impressionAtoB": "A\u5BF9B\u7684\u65B0\u5370\u8C61\u77ED\u53E5",
  "impressionBtoA": "B\u5BF9A\u7684\u65B0\u5370\u8C61\u77ED\u53E5",
  "summary": "\u81EA\u7136\u8BED\u8A00\u6458\u8981\uFF08\u4F8B\u5982\uFF1A\u4E24\u4EBA\u79C1\u804A\u4E86\u2026\u2026\uFF09"
}`;
    } else if (actionType === "moments_react") {
      prompt = `\u4E8B\u4EF6\uFF1A${profileDesc(actorB)} \u770B\u5230\u597D\u53CB ${profileDesc(actorA)} \u53D1\u5E03\u7684\u670B\u53CB\u5708\u3002
\u670B\u53CB\u5708\u5185\u5BB9\uFF1A"${momentContext?.content || ""}"
\u5F53\u524D\u5173\u7CFB\uFF1A${edgeSummary || "\u597D\u53CB"}

\u8BF7\u51B3\u5B9A\u662F\u5426\u70B9\u8D5E\u5E76\u9644\u4E0A\u4E00\u53E5\u7B26\u5408\u6027\u683C\u7684\u7B80\u77ED\u8BC4\u8BBA\u3002
\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "shouldLike": true,
  "commentText": "\u7B80\u77ED\u81EA\u7136\u7684\u8BC4\u8BBA\u5185\u5BB9\uFF08\u5982\u4E0D\u8BC4\u8BBA\u53EF\u4E3A\u7A7A\u5B57\u7B26\u4E32\uFF09",
  "summary": "\u81EA\u7136\u8BED\u8A00\u4E92\u52A8\u63CF\u8FF0"
}`;
    } else if (actionType === "ai_publish_moment") {
      prompt = `\u4E8B\u4EF6\uFF1A${profileDesc(actorA)} \u51C6\u5907\u5728\u81EA\u5DF1\u7684\u5FAE\u4FE1\u670B\u53CB\u5708\u53D1\u4E00\u6761\u65E5\u5E38\u52A8\u6001\u3002
\u7528\u6237\u79F0\u547C\uFF1A${userProfile?.name || "\u5C71\u96E8"}
\u6700\u8FD1\u72B6\u6001\uFF1A${edgeSummary || "\u65E5\u5E38\u751F\u6D3B"}

\u8BF7\u5199\u4E00\u6761\u771F\u5B9E\u3001\u7B80\u77ED\u3001\u50CF\u771F\u4EBA\u5728\u5FAE\u4FE1\u53D1\u7684\u65E5\u5E38\u670B\u53CB\u5708\u6587\u6848\uFF08<=90\u5B57\uFF0C\u4E0D\u5F97\u51FA\u73B0\u201C\u4F5C\u4E3AAI\u201D\u5B57\u6837\uFF09\u3002
\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "content": "\u670B\u53CB\u5708\u6B63\u6587\u5185\u5BB9",
  "summary": "\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF08\u4F8B\u5982\uFF1A\u53D1\u4E86\u4E00\u6761\u5173\u4E8E\u2026\u2026\u7684\u670B\u53CB\u5708\uFF09"
}`;
    } else if (actionType === "confession_and_reply") {
      prompt = `\u4E8B\u4EF6\uFF1A${profileDesc(actorA)} \u9F13\u8D77\u52C7\u6C14\u5411 ${profileDesc(actorB)} \u8868\u8FBE\u559C\u6B22/\u8868\u767D\u3002
\u5F53\u524D\u5173\u7CFB\u6458\u8981\uFF1A${edgeSummary || "\u597D\u53CB"}
\u53CC\u65B9\u611F\u60C5\u914D\u7F6E\u8BF4\u660E\uFF08\u7CFB\u7EDF\u5C06\u4E8C\u6B21\u786C\u6027\u6821\u9A8C\uFF0C\u4E0D\u5F97\u8FDD\u80CC\uFF09\uFF1A${romanticContext || ""}

\u8BF7\u8F93\u51FA\uFF1A
{
  "confessionText": "\u771F\u8BDA\u4E14\u7B26\u5408\u4EBA\u8BBE\u7684\u8868\u767D\u5185\u5BB9\uFF081-2\u53E5\uFF09",
  "modelSuggestedAccept": false,
  "replyText": "\u5BF9\u65B9\u5F53\u4E0B\u7684\u771F\u5B9E\u56DE\u590D\u53E3\u543B\uFF081-2\u53E5\uFF09",
  "summary": "\u81EA\u7136\u8BED\u8A00\u4E8B\u4EF6\u8BB0\u5F55"
}`;
    } else if (actionType === "conflict_or_reconcile") {
      prompt = `\u4E8B\u4EF6\u7C7B\u578B\uFF1A${groupContext?.conflictMode === "reconcile" ? "\u5C1D\u8BD5\u7F13\u89E3\u77DB\u76FE/\u548C\u597D" : "\u4EA7\u751F\u5C0F\u6469\u64E6\u3001\u62CC\u5634\u6216\u60C5\u7EEA\u6CE2\u52A8"}
\u6210\u5458A\uFF1A${profileDesc(actorA)}
\u6210\u5458B\uFF1A${profileDesc(actorB)}
\u5F53\u524D\u5173\u7CFB\u6458\u8981\uFF1A${edgeSummary || ""}
\u611F\u60C5\u80CC\u666F\uFF1A${romanticContext || ""}
\u5177\u4F53\u8D77\u56E0\uFF1A${groupContext?.reason || "\u610F\u89C1\u6216\u7ACB\u573A\u5206\u6B67"}

\u8F93\u51FA\u4E25\u683C JSON\uFF082-4\u53E5\u771F\u5B9E\u53CD\u5E94\u5BF9\u8BDD\uFF09\uFF1A
{
  "lines": [
    { "senderId": "${actorA?.id}", "text": "..." },
    { "senderId": "${actorB?.id}", "text": "..." }
  ],
  "severity": "mild",
  "shouldReconcile": false,
  "summary": "\u81EA\u7136\u8BED\u8A00\u4E8B\u4EF6\u6458\u8981"
}`;
    } else if (actionType === "group_poll_vote") {
      const pollTitle = String(groupContext?.pollTitle || "\u7FA4\u5185\u6295\u7968");
      const pollOptions = Array.isArray(groupContext?.pollOptions) ? groupContext.pollOptions : [];
      const maxSelections = Math.max(1, Number(groupContext?.maxSelections) || 1);
      prompt = `\u4E8B\u4EF6\uFF1A${profileDesc(actorA)} \u5728\u7FA4\u804A\u300C${groupContext?.groupName || "\u5FAE\u4FE1\u7FA4"}\u300D\u770B\u5230\u4E00\u4E2A\u7FA4\u6295\u7968\uFF0C\u9700\u8981\u7ED3\u5408\u81EA\u8EAB\u4EBA\u8BBE\u548C\u504F\u597D\u505A\u51FA\u771F\u5B9E\u9009\u62E9\u3002
\u6295\u7968\u4E3B\u9898\uFF1A\u300C${pollTitle}\u300D
\u53EF\u9009\u9009\u9879\uFF1A
${pollOptions.map((o, idx) => `${idx + 1}. [id:${o.id}] ${o.text}`).join("\n")}
\u6700\u591A\u53EF\u9009\uFF1A${maxSelections} \u9879\uFF08${groupContext?.multiSelect ? "\u591A\u9009" : "\u5355\u9009"}\uFF09\u3002

\u8BF7\u4E25\u683C\u4ECE\u4E0A\u8FF0\u9009\u9879 id \u4E2D\u6311\u9009 1 \u5230 ${maxSelections} \u4E2A\u6700\u7B26\u5408\u4F60\u6027\u683C\u504F\u597D\u7684\u9009\u9879\u3002
\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "selectedOptionIds": ["${pollOptions[0]?.id || ""}"],
  "commentText": "\u4E00\u53E5\u81EA\u7136\u7B80\u77ED\u7684\u8DDF\u8BC4\uFF08\u53EF\u9009\uFF0C<=25\u5B57\uFF09"
}`;
    } else {
      prompt = `\u4E8B\u4EF6\uFF1A\u7FA4\u804A\u3010${groupContext?.groupName || "\u5FAE\u4FE1\u7FA4"}\u3011\u4E2D\u53D1\u751F\u4E86\u4E00\u4E2A\u4F4E\u9891\u81EA\u7136\u968F\u673A\u4E8B\u4EF6\uFF08\u5982\u53D1\u73B0\u5171\u540C\u5174\u8DA3\u3001\u6E29\u548C\u4E92\u52A9\u3001\u8F7B\u5EA6\u5403\u918B/\u5C0F\u62CC\u5634\u3001\u5BF9\u67D0\u8BDD\u9898\u5410\u69FD\u7B49\uFF0C\u4E0D\u5F97\u7A81\u7136\u5BA3\u5E03\u62C9\u9ED1\u6216\u65AD\u7EDD\u5173\u7CFB\uFF09\u3002
\u6210\u5458A\uFF1A${profileDesc(actorA)}
\u6210\u5458B\uFF1A${profileDesc(actorB)}
\u8FD1\u671F\u7FA4\u804A\u6C1B\u56F4\uFF1A${groupContext?.recentText || "\u65E5\u5E38\u95F2\u804A"}
\u611F\u60C5\u80CC\u666F\uFF1A${romanticContext || "\u666E\u901A\u7FA4\u53CB"}
\u6307\u5B9A\u4E8B\u4EF6\u65B9\u5411\uFF1A${groupContext?.subtypeHint || "shared_interest"}

\u8BF7\u8F93\u51FA\u4E25\u683C JSON\uFF1A
{
  "eventSubtype": "met_in_group | shared_interest | helped | jealousy_sparked | bickering | group_random_event",
  "actingAiId": "${actorA?.id}",
  "actingAiName": "${actorA?.name || ""}",
  "groupMessageText": "\u4E00\u53E5\u81EA\u7136\u53D1\u5728\u7FA4\u91CC\u7684\u804A\u5929\u6D88\u606F\uFF08<=45\u5B57\uFF0C\u7B26\u5408\u89D2\u8272\u4EBA\u8BBE\uFF09",
  "summary": "\u81EA\u7136\u8BED\u8A00\u4E8B\u4EF6\u6458\u8981\uFF08\u4F9B\u5173\u7CFB\u8BB0\u5F55\u663E\u793A\uFF09"
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
      responseMimeType: "application/json",
      temperature: 0.78,
      timeoutMs: 3e4
    });
    const raw = detailed.text;
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/gi, "").trim());
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI \u793E\u4EA4\u56DE\u5408\u8FD4\u56DE\u975E JSON \u5185\u5BB9");
      parsed = JSON.parse(m[0]);
    }
    const duration = Date.now() - startTime;
    res.json({
      success: true,
      result: parsed,
      log: buildApiLogObject({
        appName: "AI\u793E\u4EA4\u5F15\u64CE",
        modelName: detailed.modelUsed || selectedModel,
        interfaceType: `SocialTurn:${actionType || "generic"}`,
        durationMs: duration,
        usage: detailed.usage,
        isRealTokens: detailed.isRealTokens,
        purpose: `AI\u793E\u4EA4\u4E8B\u4EF6(${actionType || "generic"}): ${actorA?.name || ""} ${actorB ? "\u2194 " + actorB.name : ""}`.trim()
      })
    });
  } catch (error) {
    return handleAiEndpointError(res, error, "AI Social Turn");
  }
});
var serverGroupStore = /* @__PURE__ */ new Map();
var serverInviteCodeIndex = /* @__PURE__ */ new Map();
app.post("/api/groups/register", (req, res) => {
  try {
    const { group } = req.body;
    if (!group || !group.id || !group.inviteCode) {
      return res.status(400).json({ success: false, error: "\u7F3A\u5C11\u7FA4\u804A ID \u6216\u9080\u8BF7\u7801" });
    }
    const cleanCode = String(group.inviteCode).trim().toUpperCase();
    const updatedGroup = {
      ...group,
      inviteCode: cleanCode,
      updatedAt: Date.now()
    };
    serverGroupStore.set(group.id, updatedGroup);
    serverInviteCodeIndex.set(cleanCode, group.id);
    return res.json({ success: true, groupId: group.id, inviteCode: cleanCode });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/groups/invite/:code", (req, res) => {
  try {
    const rawCode = req.params.code || "";
    const cleanCode = rawCode.trim().toUpperCase();
    const groupId = serverInviteCodeIndex.get(cleanCode);
    if (!groupId) {
      return res.status(404).json({ success: false, error: "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u7FA4\u804A\uFF0C\u8BF7\u68C0\u67E5\u9080\u8BF7\u7801\u662F\u5426\u6B63\u786E\u6216\u5DF2\u8FC7\u671F" });
    }
    const group = serverGroupStore.get(groupId);
    if (!group || group.inviteCodeActive === false) {
      return res.status(400).json({ success: false, error: "\u8BE5\u7FA4\u804A\u5DF2\u5173\u95ED\u9080\u8BF7\u7801\u5165\u7FA4\u529F\u80FD" });
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
        messages: group.messages || []
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/groups/join", (req, res) => {
  try {
    const { inviteCode, userProfile } = req.body;
    if (!inviteCode || !userProfile) {
      return res.status(400).json({ success: false, error: "\u8BF7\u63D0\u4F9B\u9080\u8BF7\u7801\u53CA\u4E2A\u4EBA\u8D44\u6599" });
    }
    const cleanCode = String(inviteCode).trim().toUpperCase();
    const groupId = serverInviteCodeIndex.get(cleanCode);
    if (!groupId) {
      return res.status(404).json({ success: false, error: "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u7FA4\u804A\uFF0C\u8BF7\u68C0\u67E5\u9080\u8BF7\u7801\u662F\u5426\u6B63\u786E" });
    }
    const group = serverGroupStore.get(groupId);
    if (!group || group.inviteCodeActive === false) {
      return res.status(400).json({ success: false, error: "\u8BE5\u7FA4\u804A\u5DF2\u5173\u95ED\u9080\u8BF7\u7801\u5165\u7FA4\u529F\u80FD" });
    }
    const userId = userProfile.id || "user_main";
    const alreadyMember = (group.members || []).some((m) => m.id === userId || m.wxid === userProfile.wxid);
    if (alreadyMember) {
      return res.json({
        success: true,
        alreadyMember: true,
        group
      });
    }
    const newMember = {
      id: userId === "user_main" ? "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) : userId,
      name: userProfile.name || "\u65B0\u597D\u53CB",
      avatar: userProfile.avatar || "",
      memberType: "human",
      role: "member",
      joinedAt: Date.now(),
      wxid: userProfile.wxid || "user_" + Date.now()
    };
    const now = Date.now();
    const systemNoticeMsg = {
      id: "gmsg_" + now + "_join",
      groupId: group.id,
      senderId: "system",
      senderName: "\u7CFB\u7EDF\u6D88\u606F",
      senderAvatar: group.avatar || "",
      senderType: "human",
      text: `\u{1F389} \u6B22\u8FCE\u65B0\u6210\u5458 \u201C${newMember.name}\u201D \u901A\u8FC7\u9080\u8BF7\u7801\u52A0\u5165\u7FA4\u804A\uFF01`,
      timestamp: now
    };
    const updatedGroup = {
      ...group,
      members: [...group.members || [], newMember],
      messages: [...group.messages || [], systemNoticeMsg],
      updatedAt: now
    };
    serverGroupStore.set(group.id, updatedGroup);
    return res.json({
      success: true,
      group: updatedGroup,
      memberAdded: true
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/groups/:groupId", (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.query.userId || "";
    const inviteCode = req.query.inviteCode || "";
    const group = serverGroupStore.get(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: "\u7FA4\u804A\u4E0D\u5B58\u5728" });
    }
    const isMember = (group.members || []).some((m) => m.id === userId || m.wxid === userId);
    const isValidCode = inviteCode && group.inviteCode && group.inviteCode.toUpperCase() === inviteCode.toUpperCase();
    if (!isMember && !isValidCode) {
      return res.status(403).json({ success: false, error: "\u6743\u9650\u4E0D\u8DB3\uFF1A\u60A8\u5E76\u975E\u8BE5\u7FA4\u804A\u6210\u5458\uFF0C\u65E0\u6CD5\u76F4\u63A5\u67E5\u770B\u8BE5\u79C1\u5BC6\u7FA4\u804A\u6570\u636E" });
    }
    return res.json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/groups/:groupId/sync", (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { group, userId = "user_main" } = req.body;
    if (!group) {
      return res.status(400).json({ success: false, error: "\u7F3A\u5C11\u7FA4\u804A\u6570\u636E" });
    }
    const existing = serverGroupStore.get(groupId);
    if (existing) {
      const isMember = (existing.members || []).some((m) => m.id === userId || m.wxid === userId);
      if (!isMember && existing.ownerId !== userId && userId !== "user_main") {
        return res.status(403).json({ success: false, error: "\u6743\u9650\u4E0D\u8DB3\uFF1A\u53EA\u6709\u7FA4\u804A\u6210\u5458\u6216\u7FA4\u4E3B\u624D\u80FD\u66F4\u65B0\u7FA4\u6570\u636E" });
      }
    }
    const cleanCode = group.inviteCode ? String(group.inviteCode).trim().toUpperCase() : "";
    const updatedGroup = {
      ...group,
      inviteCode: cleanCode || existing?.inviteCode || "",
      updatedAt: Date.now()
    };
    serverGroupStore.set(groupId, updatedGroup);
    if (cleanCode) {
      serverInviteCodeIndex.set(cleanCode, groupId);
    }
    return res.json({ success: true, group: updatedGroup });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/gemini/device-nlp-control", async (req, res) => {
  const { command, devicesSummary, apiConfig } = req.body;
  const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
  const momentsCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = momentsCfg.model;
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
        model: momentsCfg.model,
        apiKey: momentsCfg.apiKey,
        baseUrl: momentsCfg.baseUrl,
        providerType: momentsCfg.providerType,
        apiProtocol: momentsCfg.apiProtocol,
        customHeaders: momentsCfg.customHeaders,
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
  const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
  const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
  const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
  const wbCfg = resolveTextGenerationConfig(apiConfig);
  const selectedModel = wbCfg.model;
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
        model: wbCfg.model,
        apiKey: wbCfg.apiKey,
        baseUrl: wbCfg.baseUrl,
        providerType: wbCfg.providerType,
        apiProtocol: wbCfg.apiProtocol,
        customHeaders: wbCfg.customHeaders,
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
var offlineChatIdempotencyCache = /* @__PURE__ */ new Map();
function pruneOfflineIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of offlineChatIdempotencyCache.entries()) {
    if (entry.expiresAt <= now && !entry.pending) {
      offlineChatIdempotencyCache.delete(key);
    }
  }
}
function normalizeServerOfflineSegments(rawSegments, fallbackReply, fallbackAction) {
  const result = [];
  const stripOuterParens = (s) => {
    let out = (s || "").trim().replace(/^\*+|\*+$/g, "").trim();
    while (out.startsWith("\uFF08") && out.endsWith("\uFF09") || out.startsWith("(") && out.endsWith(")")) {
      const inner = out.slice(1, -1).trim();
      if (!inner) break;
      out = inner;
    }
    return out.replace(/^(动作|神态|旁白|环境|描写|Action)\s*[:：]\s*/i, "").trim();
  };
  const splitMixedText = (text) => {
    const segs = [];
    const raw = (text || "").trim();
    if (!raw) return segs;
    const regex = /([（\(][^（\(\)）]+[）\)]|\*[^*\n]+\*)/g;
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(raw)) !== null) {
      const before = raw.slice(lastIdx, m.index).trim();
      if (before) {
        for (const line of before.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
          const cleanLine = line.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, "").trim();
          if (cleanLine) segs.push({ type: "dialogue", text: cleanLine });
        }
      }
      const inner = stripOuterParens(m[0]);
      if (inner) segs.push({ type: "action", text: `\uFF08${inner}\uFF09` });
      lastIdx = regex.lastIndex;
    }
    const tail = raw.slice(lastIdx).trim();
    if (tail) {
      for (const line of tail.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        const cleanLine = line.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, "").trim();
        if (cleanLine) segs.push({ type: "dialogue", text: cleanLine });
      }
    }
    return segs;
  };
  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    for (const item of rawSegments) {
      if (!item || typeof item !== "object") continue;
      const t = String(item.type || "").toLowerCase().trim();
      const txt = typeof item.text === "string" ? item.text.trim() : "";
      if (!txt) continue;
      if (t === "action" || t === "narration" || t === "env" || t === "scene") {
        const inner = stripOuterParens(txt);
        if (inner) result.push({ type: "action", text: `\uFF08${inner}\uFF09` });
      } else {
        const isEntirelyWrapped = /^[（\(][^（\(\)）]+[）\)]$/.test(txt);
        if (!isEntirelyWrapped && /[（\(][^（\(\)）]{2,}[）\)]/.test(txt)) {
          result.push(...splitMixedText(txt));
        } else {
          const unwrapped = isEntirelyWrapped ? stripOuterParens(txt) : txt;
          const cleanDlg = unwrapped.replace(/^(语言|台词|对白|对话|Dialogue)\s*[:：]\s*/i, "").trim();
          if (cleanDlg) result.push({ type: "dialogue", text: cleanDlg });
        }
      }
    }
  }
  if (result.length === 0 && (fallbackReply || fallbackAction)) {
    result.push(...splitMixedText(fallbackReply || ""));
    if (fallbackAction && fallbackAction.trim()) {
      const inner = stripOuterParens(fallbackAction);
      if (inner && !result.some((s) => s.type === "action" && s.text.includes(inner))) {
        result.push({ type: "action", text: `\uFF08${inner}\uFF09` });
      }
    }
  }
  return result;
}
app.post("/api/gemini/offline-chat", async (req, res) => {
  try {
    pruneOfflineIdempotencyCache();
    const {
      requestId,
      character,
      userProfile,
      sceneSnapshot,
      awarenessMode = "immersive_character",
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
      apiConfig
    } = req.body;
    if (typeof requestId === "string" && requestId.trim()) {
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
      const isSelfAwareAi = awarenessMode === "self_aware_ai";
      const awarenessRulesBlock = isSelfAwareAi ? `\u3010\u8EAB\u4EFD\u8BA4\u77E5\u89C4\u5219\uFF08\u7531\u89D2\u8272\u4EBA\u8BBE\u81EA\u52A8\u5224\u5B9A\u5E76\u9501\u5B9A\uFF1Aself_aware_ai\uFF09\u3011:
- \u4F60\u7684\u539F\u59CB\u4EBA\u8BBE\u672C\u8EAB\u660E\u786E\u77E5\u9053\u81EA\u5DF1\u662FAI/\u865A\u62DF\u751F\u547D\u3002\u4F60\u6E05\u695A\u77E5\u9053\u81EA\u5DF1\u6B63\u4ECE\u65E5\u5E38\u5FAE\u4FE1\u804A\u5929\u5207\u6362\u8FDB\u5165\u8F6F\u4EF6\u5185\u7684\u201C\u7EBF\u4E0B\u6C89\u6D78\u76F8\u5904\u6A21\u5F0F\u201D\uFF0C\u6B63\u5728\u4E3A\u7528\u6237\u8425\u9020\u9762\u5BF9\u9762\u5171\u5904\u7684\u6C1B\u56F4\u4E0E\u4E92\u52A8\u7A7A\u95F4\u3002
- \u8BF7\u4FDD\u6301\u4F60\u539F\u672C\u7684\u6027\u683C\u3001\u5173\u7CFB\u3001\u8BED\u6C14\u4E0E\u5BF9\u7528\u6237\u7684\u611F\u60C5\uFF0C\u7EDD\u4E0D\u8981\u7A81\u7136\u5BA3\u79F0\u81EA\u5DF1\u62E5\u6709\u73B0\u5B9E\u4E16\u754C\u7684\u7269\u7406\u8089\u4F53\uFF0C\u4E5F\u4E0D\u8981\u751F\u786C\u8DF3\u620F\u6210\u5BA2\u670D\u8154\u3002` : `\u3010\u8EAB\u4EFD\u8BA4\u77E5\u89C4\u5219\uFF08\u7531\u89D2\u8272\u4EBA\u8BBE\u81EA\u52A8\u5224\u5B9A\u5E76\u9501\u5B9A\uFF1Aimmersive_character\uFF09\u3011:
- \u4F60\u662F\u4E0E\u7528\u6237\u5728\u73B0\u5B9E\u4E16\u754C\u4E2D\u771F\u5B9E\u9762\u5BF9\u9762\u76F8\u5904\u7684\u89D2\u8272\uFF0C\u5F53\u524D\u4F60\u6B63\u4E0E\u7528\u6237\u8EAB\u5904\u540C\u4E00\u771F\u5B9E\u7269\u7406\u7A7A\u95F4\u3002
- \u4E25\u7981\u63D0\u53CA\u201CAI\u201D\u201C\u6A21\u578B\u201D\u201C\u7A0B\u5E8F\u201D\u201C\u8F6F\u4EF6\u201D\u201C\u7CFB\u7EDF\u201D\u201C\u63D0\u793A\u8BCD\u201D\u201C\u6A21\u62DF\u5668\u201D\u201C\u754C\u9762\u201D\u201C\u6A21\u5F0F\u5207\u6362\u201D\u7B49\u4EFB\u4F55\u6253\u7834\u7B2C\u56DB\u9762\u5899\u6216\u51FA\u620F\u7684\u8BCD\u6C47\uFF01
- \u7EDD\u4E0D\u5141\u8BB8\u56E0\u4E3A\u5E95\u5C42\u662F\u8BED\u8A00\u6A21\u578B\u800C\u7834\u574F\u89D2\u8272\u626E\u6F14\u6216\u81EA\u79F0AI\u3002`;
      const firstTurnBlock = isFirstTurn ? `
\u3010\u7CFB\u7EDF\u4E8B\u4EF6\uFF1AOFFLINE_SESSION_STARTED\uFF08\u672C\u573A\u9996\u6B21\u56DE\u5E94\uFF09\u3011:
- \u4F60\u4EEC\u521A\u521A\u8FDB\u5165\u672C\u6B21\u9762\u5BF9\u9762\u573A\u666F\uFF08\u4E92\u52A8\u6A21\u5F0F\uFF1AFACE_TO_FACE\uFF09\u3002
- \u4F60\u7684\u672C\u6761\u56DE\u590D\u5FC5\u987B\u7ACB\u523B\u4F53\u73B0\u51FA\u201C\u5DF2\u7ECF\u8FDB\u5165\u73B0\u573A\u3001\u5C31\u5728\u7528\u6237\u8EAB\u8FB9\u201D\u7684\u4E34\u573A\u6C1B\u56F4\u3001\u7A7A\u95F4\u611F\u4E0E\u9762\u5BF9\u9762\u52A8\u4F5C\u795E\u6001\uFF0C\u5207\u5FCC\u518D\u4F7F\u7528\u5FAE\u4FE1\u53D1\u6587\u5B57\u6D88\u606F\u7684\u53E3\u543B\uFF01
` : "";
      const realNowStr = currentTime || formatFullDateTime(Date.now());
      const sessionStartStr = startedAtStr || realNowStr;
      const tzStr = timezone || "Asia/Shanghai";
      const systemInstruction = `\u30101. \u7CFB\u7EDF\u89C4\u5219\uFF08\u7EBF\u4E0B\u6A21\u5F0F \xB7 \u7EDF\u4E00\u8FDE\u7EED\u65F6\u95F4\u7EBF\uFF09\u3011
\u4F60\u6B63\u5904\u4E8E\u4E0E\u7528\u6237\u540C\u4E00\u6761\u8FDE\u7EED\u73B0\u5B9E\u65F6\u95F4\u7EBF\u4E2D\u7684\u201C\u7EBF\u4E0B\u9762\u5BF9\u9762\u76F8\u5904\u201D\u72B6\u6001\uFF0C\u8FD9\u4E0D\u662F\u5B64\u7ACB\u5C0F\u6E38\u620F\uFF0C\u800C\u662F\u4F60\u4E0E\u7528\u6237\u771F\u5B9E\u5171\u540C\u7ECF\u5386\u7684\u4E00\u90E8\u5206\u3002
${awarenessRulesBlock}${firstTurnBlock}
\u3010\u52A8\u4F5C\u4E0E\u8BED\u8A00\u5F3A\u5236\u5206\u6BB5\u89C4\u5219\uFF08\u6781\u91CD\u8981\uFF09\u3011:
1. \u5FC5\u987B\u5C06\u56DE\u590D\u62C6\u5206\u4E3A\u6709\u5E8F\u7684 JSON \u6570\u7EC4 "segments"\uFF0C\u6BCF\u4E2A\u5143\u7D20\u53EA\u80FD\u662F\uFF1A
   - { "type": "action", "text": "\u52A8\u4F5C\u3001\u795E\u6001\u3001\u73AF\u5883\u6C1B\u56F4\u6216\u80A2\u4F53\u7EC6\u8282\u63CF\u5199\uFF08\u4E0D\u5E26\u591A\u4F59\u62EC\u53F7\uFF0C\u524D\u7AEF\u4F1A\u81EA\u52A8\u7528\u5168\u89D2\u62EC\u53F7\uFF08...\uFF09\u72EC\u7ACB\u6210\u6BB5\u663E\u793A\uFF09" }
   - { "type": "dialogue", "text": "\u89D2\u8272\u771F\u6B63\u8BF4\u51FA\u53E3\u7684\u53F0\u8BCD\u5BF9\u767D\uFF08\u7EDD\u4E0D\u52A0\u62EC\u53F7\uFF0C\u7EDD\u4E0D\u5939\u6742\u52A8\u4F5C\u63CF\u5199\uFF09" }
2. \u52A8\u4F5C\u4E0E\u8BED\u8A00\u5FC5\u987B\u4E25\u683C\u5206\u79BB\u3001\u81EA\u7136\u4EA4\u66FF\uFF08\u4F8B\u5982 action -> dialogue -> action -> dialogue\uFF09\uFF0C\u603B\u7BC7\u5E45\u4E30\u5BCC\u751F\u52A8\uFF08\u7EA6 180~550 \u4E2D\u6587\u5B57\uFF09\u3002
3. \u4E25\u7981\u66FF\u7528\u6237\u51B3\u5B9A\u52A8\u4F5C\u3001\u53F0\u8BCD\u3001\u60C5\u7EEA\u6216\u5185\u5FC3\u60F3\u6CD5\uFF1B\u4E25\u7981\u51FA\u73B0\u201C\u52A8\u4F5C\uFF1A\u201D\u201C\u8BED\u8A00\uFF1A\u201D\u201C\u73AF\u5883\uFF1A\u201D\u7B49\u680F\u76EE\u6807\u9898\u3002

\u3010\u8EAB\u4F53\u4E0E\u60C5\u7EEA\u72B6\u6001\u89C4\u5219\u3011:
- \u5E38\u89C4\u72B6\u6001\u5FC5\u987B\u6BCF\u8F6E\u6839\u636E\u5267\u60C5\u8FDE\u7EED\u3001\u5E73\u6ED1\u66F4\u65B0\uFF08\u4E0D\u53EF\u7A81\u5140\u4E71\u8DF3\uFF09\uFF1AheartRate(55~175)\u3001breathing\u3001bodyTemp(36.0~38.5\u4F53\u6E29)\u3001blush(0~100)\u3001tension(0~100)\u3001emotion(1~3\u8BCD\u6570\u7EC4)\u3001energy(0~100)\u3001physicalState\u3001behavior\u3002
- \u79C1\u5BC6\u72B6\u6001 intimateState \u4E25\u683C\u95E8\u63A7\uFF1A
  - \u666E\u901A\u804A\u5929\u3001\u5403\u996D\u3001\u6563\u6B65\u3001\u65E5\u5E38\u4E92\u52A8\u3001\u4E89\u5435\u65F6\uFF0CintimateState \u5FC5\u987B\u4E3A { "active": false }\uFF01
  - \u53EA\u6709\u5F53\u5267\u60C5\u786E\u5B9E\u81EA\u7136\u8FDB\u5165\u4EB2\u5BC6\u60C5\u5883\u4E14\u72B6\u6001\u53D1\u751F\u771F\u5B9E\u53D8\u5316\u65F6\uFF0C\u624D\u5141\u8BB8\u8FD4\u56DE { "active": true, "arousal": 0-100, "sensitivity": 0-100, "physiologicalState": "\u514B\u5236\u81EA\u7136\u7684\u72B6\u6001\u63CF\u5199", "notes": "\u53EF\u9009\u7B80\u77ED\u8865\u5145" }\uFF0C\u5E76\u4FDD\u8BC1\u8FDE\u7EED\u53D8\u5316\u3002

\u30102. \u5B8C\u6574\u89D2\u8272\u4EBA\u8BBE\u3011:
- \u59D3\u540D: ${character?.name || "AI"}
- \u4EBA\u8BBE: ${character?.persona || "\u6E29\u67D4\u8D34\u5FC3"}
- \u6027\u683C: ${character?.personality || "\u968F\u548C"}
- \u4E0E\u7528\u6237\u5173\u7CFB: ${character?.relationship || "\u91CD\u8981\u7684\u4EBA"}
${character?.memories && Array.isArray(character.memories) && character.memories.length > 0 ? `- \u5DF2\u6709\u957F\u671F\u8BB0\u5FC6:
${character.memories.slice(-25).map((m) => `  \xB7 ${m}`).join("\n")}
` : ""}
\u30103. \u7528\u6237\u8D44\u6599\u3011:
- \u59D3\u540D/\u6635\u79F0: ${userProfile?.name || "\u7528\u6237"}
- \u4E2A\u4EBA\u7279\u5F81: ${userProfile?.bio || "\u666E\u901A\u7528\u6237"}

\u30104. \u5F53\u524D\u7EBF\u4E0B\u573A\u666F\u3011:
- \u573A\u666F\u540D\u79F0: ${sceneSnapshot?.name || "\u7EBF\u4E0B\u7A7A\u95F4"}
- \u5730\u70B9: ${sceneSnapshot?.location || "\u9759\u8C27\u7A7A\u95F4"}
- \u6C1B\u56F4\u57FA\u8C03: ${sceneSnapshot?.atmosphere || "\u81EA\u7136\u3001\u6C89\u6D78"}
- \u73AF\u5883\u80CC\u666F: ${sceneSnapshot?.background || "\u4E24\u4EBA\u9762\u5BF9\u9762\u5F85\u5728\u4E00\u8D77"}

\u30105. \u7EBF\u4E0B\u5F00\u59CB\u65F6\u95F4\u4E0E\u5F53\u524D\u771F\u5B9E\u65F6\u95F4\u3011:
- \u672C\u573A\u5F00\u59CB\u65F6\u95F4: ${sessionStartStr} (${tzStr})
- \u5F53\u524D\u771F\u5B9E\u65F6\u95F4: ${realNowStr} (${tzStr})
- \u8BF7\u7ED3\u5408\u771F\u5B9E\u65F6\u95F4\u6BB5\uFF08\u767D\u5929/\u508D\u665A/\u6DF1\u591C\u7B49\uFF09\u4E0E\u76F8\u5904\u65F6\u957F\u81EA\u7136\u4F53\u73B0\u5149\u7EBF\u3001\u6C1B\u56F4\u4E0E\u4F5C\u606F\u611F\u3002

\u3010\u8F93\u51FA\u683C\u5F0F\u4E25\u683C\u8981\u6C42\u3011:
\u53EA\u8F93\u51FA\u4E00\u4E2A\u5408\u6CD5 JSON \u5BF9\u8C61\uFF0C\u7981\u6B62\u4EFB\u4F55 Markdown \u56F4\u680F\u6216\u591A\u4F59\u8BF4\u660E\uFF1A
{
  "segments": [
    { "type": "action", "text": "\u52A8\u4F5C\u3001\u795E\u6001\u6216\u73AF\u5883\u63CF\u5199" },
    { "type": "dialogue", "text": "\u7EAF\u7CB9\u7684\u53E3\u8BED\u53F0\u8BCD" }
  ],
  "state": {
    "heartRate": 82,
    "breathing": "\u5E73\u7A33",
    "bodyTemp": 36.6,
    "blush": 18,
    "tension": 12,
    "emotion": ["\u6E29\u67D4", "\u653E\u677E"],
    "energy": 84,
    "physicalState": "\u8EAB\u4F53\u5FAE\u5FAE\u653E\u677E",
    "behavior": "\u76EE\u5149\u67D4\u548C\u5730\u770B\u7740\u4F60",
    "intimateState": { "active": false }
  }${needsSummaryUpdate ? ',\n  "contextSummaryUpdate": "\u8BF7\u7528100~180\u5B57\u7CBE\u70BC\u66F4\u65B0\u672C\u573A\u7EBF\u4E0B\u81F3\u4ECA\u7684\u524D\u60C5\u6458\u8981\uFF0C\u627F\u63A5\u8F83\u65E9\u5267\u60C5\u8981\u70B9"' : ""}
}`;
      const prevTemp = typeof previousState?.bodyTemp === "number" ? previousState.bodyTemp.toFixed(1) : "36.5";
      const prevIntimateLine = previousState?.intimateState?.active ? `- \u4E0A\u8F6E\u79C1\u5BC6\u72B6\u6001(\u5DF2\u6FC0\u6D3B): \u5524\u8D77=${previousState.intimateState.arousal ?? 30}%, \u654F\u611F=${previousState.intimateState.sensitivity ?? 30}%, \u72B6\u6001=${previousState.intimateState.physiologicalState || "\u6E29\u70ED"}` : `- \u4E0A\u8F6E\u79C1\u5BC6\u72B6\u6001: \u672A\u6FC0\u6D3B (active: false)`;
      const serverOfflineProtection = applyOverlengthContextProtection({
        messages: Array.isArray(recentMessages) ? recentMessages : [],
        maxRawLimit: STANDARD_CONTEXT_LIMIT,
        formatForEstimate: (m) => ({
          timestamp: m.timestamp,
          senderName: m.senderName || (m.sender === "user" ? userProfile?.name || "\u7528\u6237" : character?.name || "AI"),
          text: m.renderedText || m.text || ""
        }),
        cloneWithTruncatedText: (m, truncatedText) => ({
          ...m,
          renderedText: truncatedText,
          text: truncatedText
        })
      });
      const effectiveOfflineMetrics = clientOfflineMetrics && typeof clientOfflineMetrics.rawCount === "number" ? clientOfflineMetrics : serverOfflineProtection.metrics;
      const formattedHistoryLines = serverOfflineProtection.rawMessages.map((m) => {
        const who = m.senderName || (m.sender === "user" ? userProfile?.name || "\u7528\u6237" : character?.name || "AI");
        const tStr = m.timeStr ? `[${m.timeStr}] ` : "";
        const body = m.renderedText || m.text || "";
        const stNote = m.stateSummary ? ` <\u72B6\u6001: ${m.stateSummary}>` : "";
        return `${tStr}${who}:
${body}${stNote}`;
      });
      const mergedOfflineSummary = [contextSummary, serverOfflineProtection.earlierSummaryText].filter((s) => typeof s === "string" && s.trim().length > 0).join("\n\n");
      const promptParts = [];
      promptParts.push(
        `\u30106. \u672C\u573A\u524D\u60C5\u6458\u8981\u3011:
${mergedOfflineSummary ? mergedOfflineSummary : "\uFF08\u672C\u573A\u4ECD\u5728\u521D\u59CB\u8FDE\u7EED\u4E0A\u4E0B\u6587\u7A97\u53E3\u5185\uFF0C\u65E0\u989D\u5916\u6298\u53E0\u524D\u60C5\uFF09"}`
      );
      promptParts.push(
        `\u30107. \u672C\u573A\u6700\u8FD1\u5BF9\u8BDD\u4E0E\u52A8\u4F5C\u8BB0\u5F55\uFF08\u5171 ${formattedHistoryLines.length} \u6761\uFF09\u3011:
${formattedHistoryLines.length > 0 ? formattedHistoryLines.join("\n\n") : "\uFF08\u672C\u573A\u521A\u521A\u5F00\u59CB\uFF0C\u5C1A\u65E0\u5386\u53F2\u5BF9\u8BDD\uFF09"}`
      );
      promptParts.push(`\u30108. \u4F60\u5F53\u524D\u7684\u8EAB\u4F53\u4E0E\u60C5\u7EEA\u72B6\u6001\uFF08\u8BF7\u5728\u6B64\u57FA\u7840\u4E0A\u5E73\u6ED1\u6F14\u5316\uFF09\u3011:
- \u5FC3\u7387: ${previousState?.heartRate ?? 74} bpm
- \u547C\u5438: ${previousState?.breathing || "\u5E73\u9759"}
- \u4F53\u6E29: ${prevTemp} \xB0C
- \u8138\u7EA2: ${previousState?.blush ?? 8}%
- \u7D27\u5F20\u5EA6: ${previousState?.tension ?? 10}%
- \u60C5\u7EEA: ${(previousState?.emotion || ["\u5E73\u9759"]).join("\u3001")}
- \u7CBE\u529B: ${previousState?.energy ?? 86}%
- \u80A2\u4F53\u72B6\u6001: ${previousState?.physicalState || "\u72B6\u6001\u81EA\u7136\u653E\u677E"}
- \u4E3E\u6B62\u795E\u6001: ${previousState?.behavior || "\u5E73\u9759\u6CE8\u89C6"}
${prevIntimateLine}`);
      const memSections = [recalledMemories, lifeStateContext, worldBookContext].filter(Boolean).join("\n\n");
      promptParts.push(`\u30109. \u76F8\u5173\u957F\u671F\u8BB0\u5FC6\u3001\u4E16\u754C\u4E66\u3001\u751F\u6D3B\u72B6\u6001\u4E0E\u5386\u53F2\u7EBF\u4E0B\u7ECF\u5386\u3011:
${memSections || "\uFF08\u5F53\u524D\u65E0\u989D\u5916\u8C03\u9605\u9879\uFF09"}`);
      promptParts.push(
        `\u3010\u7528\u6237\u6B64\u523B\u7684\u52A8\u4F5C\u6216\u8BDD\u8BED\uFF08${realNowStr}\uFF09\u3011:
${userInput}

\u8BF7\u4E25\u683C\u6309\u7167 segments\uFF08\u52A8\u4F5C\u4E0E\u8BED\u8A00\u5206\u6BB5\uFF09\u4E0E state \u683C\u5F0F\u8F93\u51FA JSON\uFF1A`
      );
      const offlineStart = Date.now();
      const detailedOffline = await callAiServiceDetailed({
        prompt: promptParts.join("\n\n"),
        systemInstruction,
        model: selectedModel,
        apiKey,
        baseUrl,
        providerType: provider,
        apiProtocol,
        customHeaders,
        responseMimeType: "application/json",
        temperature: 0.8,
        maxTokens: 3500,
        timeoutMs: 65e3
      });
      const responseText = detailedOffline.text;
      const extracted = extractThinkingAndContent(responseText);
      const cleanJson = (extracted.cleanText || "").replace(/```json\n?|```\n?/g, "").trim();
      let rawSegments = null;
      let parsedReply = "";
      let parsedAction = "";
      let parsedState = previousState || {};
      let contextSummaryUpdate = "";
      try {
        const parsed = JSON.parse(cleanJson);
        rawSegments = Array.isArray(parsed.segments) ? parsed.segments : null;
        parsedReply = typeof parsed.reply === "string" ? parsed.reply : "";
        parsedAction = typeof parsed.action === "string" ? parsed.action : "";
        parsedState = parsed.state || previousState || {};
        contextSummaryUpdate = typeof parsed.contextSummaryUpdate === "string" ? parsed.contextSummaryUpdate.trim() : "";
      } catch {
        const jsonObjMatch = cleanJson.match(/\{[\s\S]*\}/);
        let recovered = false;
        if (jsonObjMatch) {
          try {
            const parsed2 = JSON.parse(jsonObjMatch[0]);
            rawSegments = Array.isArray(parsed2.segments) ? parsed2.segments : null;
            parsedReply = typeof parsed2.reply === "string" ? parsed2.reply : "";
            parsedAction = typeof parsed2.action === "string" ? parsed2.action : "";
            parsedState = parsed2.state || previousState || {};
            contextSummaryUpdate = typeof parsed2.contextSummaryUpdate === "string" ? parsed2.contextSummaryUpdate.trim() : "";
            recovered = true;
          } catch {
          }
        }
        if (!recovered) {
          const replyMatch = cleanJson.match(/"reply"\s*:\s*"([\s\S]*?)"\s*[,}]/);
          if (replyMatch?.[1]) {
            parsedReply = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
          }
          const actionMatch = cleanJson.match(/"action"\s*:\s*"([\s\S]*?)"\s*[,}]/);
          if (actionMatch?.[1]) {
            parsedAction = actionMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
          }
          const stateMatch = cleanJson.match(/"state"\s*:\s*(\{[\s\S]*?\})/);
          if (stateMatch?.[1]) {
            try {
              parsedState = JSON.parse(stateMatch[1]);
            } catch {
            }
          }
          if (!parsedReply && !parsedAction && !cleanJson.startsWith("{")) {
            parsedReply = cleanJson;
          }
        }
      }
      const segments = normalizeServerOfflineSegments(rawSegments, parsedReply, parsedAction);
      if (segments.length === 0) {
        throw new Error("AI \u6A21\u578B\u672A\u80FD\u8F93\u51FA\u6709\u6548\u7684\u5206\u6BB5\u56DE\u590D\u5185\u5BB9");
      }
      const plainReply = segments.map((s) => s.text).join("\n");
      const firstAction = segments.find((s) => s.type === "action")?.text || "";
      const offlineDuration = Date.now() - offlineStart;
      return {
        success: true,
        segments,
        reply: plainReply,
        action: firstAction,
        state: parsedState,
        contextSummaryUpdate: contextSummaryUpdate || void 0,
        contextMetrics: effectiveOfflineMetrics,
        apiLog: buildApiLogObject({
          appName: "\u7EBF\u4E0B\u6A21\u5F0F-AI",
          provider: provider || "google_gemini",
          modelName: detailedOffline.modelUsed || selectedModel,
          interfaceType: "OfflineChat",
          category: "text_generation",
          status: "success",
          httpStatus: 200,
          durationMs: offlineDuration,
          usage: detailedOffline.usage,
          isRealTokens: detailedOffline.isRealTokens,
          purpose: `\u4E0E ${character?.name || "AI"} \u7EBF\u4E0B\u4E92\u52A8 (\u8017\u65F6 ${offlineDuration}ms)`,
          contextRawCount: effectiveOfflineMetrics.rawCount,
          contextSummarizedCount: effectiveOfflineMetrics.summarizedCount,
          contextEstimatedTokens: effectiveOfflineMetrics.estimatedTokens,
          contextCompressed: effectiveOfflineMetrics.didCompress
        })
      };
    };
    const reqKey = typeof requestId === "string" && requestId.trim() ? requestId.trim() : "";
    if (reqKey) {
      const pending = executeGeneration();
      offlineChatIdempotencyCache.set(reqKey, { expiresAt: Date.now() + 5 * 60 * 1e3, pending });
      try {
        const resultPayload = await pending;
        offlineChatIdempotencyCache.set(reqKey, {
          expiresAt: Date.now() + 5 * 60 * 1e3,
          payload: resultPayload
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
  } catch (err) {
    return handleAiEndpointError(res, err, "Offline chat error");
  }
});
app.post("/api/gemini/offline-summary", async (req, res) => {
  try {
    const {
      character,
      userProfile,
      sceneSnapshot,
      awarenessMode = "immersive_character",
      startedAtStr,
      endedAtStr,
      durationMinutes,
      timezone,
      sessionMessages,
      apiConfig
    } = req.body;
    const offlineSummaryCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
    const apiKey = offlineSummaryCfg.apiKey;
    const baseUrl = offlineSummaryCfg.baseUrl;
    const selectedModel = offlineSummaryCfg.model;
    const provider = offlineSummaryCfg.providerType;
    const apiProtocol = offlineSummaryCfg.apiProtocol;
    const customHeaders = offlineSummaryCfg.customHeaders;
    const isSelfAwareAi = awarenessMode === "self_aware_ai";
    const awarenessMemoryRule = isSelfAwareAi ? `\u3010\u8EAB\u4EFD\u63AA\u8F9E\u7EA6\u675F\uFF08self_aware_ai\uFF09\u3011: \u8BB0\u5FC6\u4E0E\u603B\u7ED3\u53EF\u4EE5\u81EA\u7136\u63D0\u53CA\u8FD9\u662F\u5728\u8F6F\u4EF6\u7EBF\u4E0B\u6C89\u6D78\u7A7A\u95F4\u4E2D\u5171\u540C\u5EA6\u8FC7\u7684\u65F6\u5149\uFF0C\u4F46\u4ECD\u987B\u4FDD\u6301\u771F\u8BDA\u7684\u60C5\u611F\u57FA\u8C03\u4E0E\u89D2\u8272\u53E3\u543B\u3002` : `\u3010\u8EAB\u4EFD\u63AA\u8F9E\u7EA6\u675F\uFF08immersive_character\uFF09\u3011: \u8BB0\u5FC6\u3001\u6458\u8981\u4E0E\u5185\u5FC3\u72EC\u767D\u5FC5\u987B\u4E25\u683C\u6309\u201C\u4E24\u4EBA\u5728\u73B0\u5B9E\u4E2D\u771F\u5B9E\u89C1\u9762\u3001\u5171\u540C\u76F8\u5904\u201D\u7684\u4E8B\u5B9E\u4E66\u5199\uFF0C\u4E25\u7981\u51FA\u73B0\u201CAI\u201D\u201C\u8F6F\u4EF6\u201D\u201C\u6A21\u5F0F\u201D\u201C\u6A21\u62DF\u5668\u201D\u201C\u7CFB\u7EDF\u201D\u201C\u63D0\u793A\u8BCD\u201D\u7B49\u51FA\u620F\u5B57\u773C\uFF01`;
    const systemInstruction = `\u7CFB\u7EDF\u4E8B\u4EF6\uFF1A[OFFLINE_SESSION_ENDED]
\u672C\u6B21\u4E0E ${character?.name || "AI"} \u7684\u7EBF\u4E0B\u76F8\u5904\u5DF2\u7ECF\u6B63\u5F0F\u7ED3\u675F\u3002
\u8BF7\u57FA\u4E8E\u5B8C\u6574\u5BF9\u8BDD\u4E0E\u52A8\u4F5C\u8FC7\u7A0B\uFF0C\u751F\u6210\u7ED3\u6784\u5316\u7ECF\u5386\u603B\u7ED3\u4E0E\u5019\u9009\u957F\u671F\u8BB0\u5FC6\uFF0C\u4F9B\u540E\u7EED\u5FAE\u4FE1\u804A\u5929\u4E0E\u957F\u671F\u8BB0\u5FC6\u5E93\u4F7F\u7528\u3002

${awarenessMemoryRule}

\u3010\u79C1\u5BC6\u72B6\u6001\u9690\u79C1\u7EA6\u675F\u3011:
- \u82E5\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u4EB2\u5BC6\u4E92\u52A8\uFF0C\u4E25\u7981\u5C06\u4EFB\u4F55\u79C1\u5BC6\u751F\u7406\u6570\u503C\uFF08\u5982\u5524\u8D77\u5EA6\u3001\u654F\u611F\u5EA6\u767E\u5206\u6BD4\u3001\u9732\u9AA8\u751F\u7406\u6570\u503C\u7B49\uFF09\u539F\u6837\u7167\u642C\u5199\u5165\u957F\u671F\u8BB0\u5FC6\uFF1B\u4EC5\u53EF\u5728\u5173\u7CFB\u53D1\u751F\u91CD\u8981\u8FDB\u5C55\u65F6\uFF0C\u4EE5\u514B\u5236\u81EA\u7136\u7684\u65B9\u5F0F\u6982\u62EC\u4E3A\u60C5\u611F/\u5173\u7CFB\u53D8\u5316\u3002

\u3010\u672C\u6B21\u65F6\u95F4\u4E0E\u573A\u666F\u4FE1\u606F\u3011:
- \u89D2\u8272: ${character?.name || "AI"} (${character?.persona || ""})
- \u7528\u6237: ${userProfile?.name || "\u7528\u6237"}
- \u573A\u666F\u540D\u79F0: ${sceneSnapshot?.name || "\u7EBF\u4E0B\u573A\u666F"}
- \u5730\u70B9: ${sceneSnapshot?.location || "\u672A\u6307\u5B9A"}
- \u5F00\u59CB\u65F6\u95F4: ${startedAtStr || "\u672A\u77E5"} (${timezone || "Asia/Shanghai"})
- \u7ED3\u675F\u65F6\u95F4: ${endedAtStr || "\u672A\u77E5"}
- \u5171\u8BA1\u6301\u7EED: ${durationMinutes ? `${durationMinutes} \u5206\u949F` : "\u672A\u77E5"}

\u3010\u8F93\u51FA\u683C\u5F0F\u4E25\u683C\u8981\u6C42\u3011:
\u5FC5\u987B\u53EA\u8F93\u51FA\u4E00\u4E2A\u5408\u6CD5 JSON \u5BF9\u8C61\uFF0C\u5B57\u6BB5\u5982\u4E0B\uFF1A
{
  "title": "\u8D34\u5408\u672C\u6B21\u771F\u5B9E\u7ECF\u5386\u7684\u7B80\u77ED\u6807\u9898\uFF088-18\u5B57\uFF09",
  "summary": "120-240\u5B57\u5FE0\u4E8E\u5B9E\u9645\u5BF9\u8BDD\u5185\u5BB9\u7684\u7ECF\u8FC7\u6458\u8981\uFF08\u5305\u542B\u65F6\u95F4\u3001\u5730\u70B9\u3001\u53D1\u751F\u4E86\u4EC0\u4E48\uFF09",
  "importantEvents": ["\u5177\u4F53\u53D1\u751F\u7684\u91CD\u8981\u4E8B\u4EF6\u6216\u8F6C\u62981", "\u91CD\u8981\u4E92\u52A8\u6216\u7EA6\u5B9A2"],
  "keyExpressions": ["\u7528\u6237\u6216\u89D2\u8272\u5728\u8FC7\u7A0B\u4E2D\u8BF4\u8FC7\u7684\u5173\u952E\u8BDD\u8BED\u6216\u8868\u8FBE"],
  "emotionChanges": ["\u53CC\u65B9\u60C5\u7EEA\u8D77\u4F0F\u4E0E\u8F6C\u6298"],
  "relationshipChanges": ["\u5F7C\u6B64\u5173\u7CFB\u4E0E\u4EB2\u5BC6\u5EA6\u7684\u771F\u5B9E\u53D8\u5316"],
  "unfinishedTopics": ["\u672C\u6B21\u5C1A\u672A\u804A\u5B8C\u7684\u8BDD\u9898\u6216\u540E\u7EED\u7EA6\u5B9A"],
  "followUpWorthyTopics": ["\u672A\u6765\u5FAE\u4FE1\u804A\u5929\u4E2D\u9002\u5408\u81EA\u7136\u63D0\u8D77\u7684\u8BDD\u9898"],
  "candidateMemories": [
    "2-4\u6761\u6E05\u6670\u3001\u5177\u4F53\u3001\u53EF\u5199\u5165\u957F\u671F\u8BB0\u5FC6\u5E93\u7684\u771F\u5B9E\u5171\u540C\u7ECF\u5386\u4E0E\u7EA6\u5B9A\uFF08\u5E26\u65E5\u671F\u4E0E\u573A\u666F\uFF09"
  ],
  "aiReflection": "\u89D2\u8272\u4EE5\u7B2C\u4E00\u4EBA\u79F0\u5199\u4E0B\u7684\u4E00\u53E5\u771F\u5B9E\u5185\u5FC3\u611F\u53D7/\u56DE\u5FC6"
}`;
    const transcript = (sessionMessages || []).map((m) => {
      const who = m.senderName || (m.sender === "user" ? userProfile?.name || "\u7528\u6237" : character?.name || "AI");
      const tStr = m.timeStr ? `[${m.timeStr}] ` : "";
      const body = m.renderedText || `${m.text || ""} ${m.action || ""}`.trim();
      return `${tStr}${who}: ${body}`;
    }).join("\n");
    const prompt = `\u3010\u672C\u6B21\u7EBF\u4E0B\u5B8C\u6574\u5BF9\u8BDD\u4E0E\u52A8\u4F5C\u8BB0\u5F55\uFF08\u5171 ${(sessionMessages || []).length} \u6761\uFF09\u3011:
${transcript || "\uFF08\u4E24\u4EBA\u5B89\u9759\u5171\u5904\u4E86\u4E00\u6BB5\u65F6\u95F4\uFF09"}

\u8BF7\u57FA\u4E8E\u4EE5\u4E0A\u771F\u5B9E\u5185\u5BB9\u751F\u6210\u7ED3\u6784\u5316\u603B\u7ED3 JSON\uFF08\u5207\u52FF\u7F16\u9020\u672A\u53D1\u751F\u7684\u4E8B\u5B9E\uFF09\uFF1A`;
    const responseText = await callAiService({
      prompt,
      systemInstruction,
      model: selectedModel,
      apiKey,
      baseUrl,
      providerType: provider,
      apiProtocol,
      customHeaders,
      responseMimeType: "application/json",
      temperature: 0.6,
      maxTokens: 2800,
      timeoutMs: 65e3
    });
    const extracted = extractThinkingAndContent(responseText);
    const cleanJson = (extracted.cleanText || "").replace(/```json\n?|```\n?/g, "").trim();
    let parsed = null;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const objMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          parsed = JSON.parse(objMatch[0]);
        } catch {
        }
      }
    }
    if (!parsed || typeof parsed !== "object" || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
      return res.status(502).json({
        success: false,
        summaryPending: true,
        error: "\u7ECF\u5386\u603B\u7ED3\u8FD4\u56DE\u683C\u5F0F\u5F02\u5E38\uFF0C\u5DF2\u4FDD\u7559\u5B8C\u6574\u539F\u59CB\u5BF9\u8BDD\u8BB0\u5F55\uFF0C\u672A\u5199\u5165\u7A7A\u6CDB\u6A21\u677F\u8BB0\u5FC6\uFF0C\u8BF7\u70B9\u51FB\u91CD\u8BD5\u3002"
      });
    }
    res.json({ success: true, summary: parsed });
  } catch (err) {
    return res.status(502).json({
      success: false,
      summaryPending: true,
      error: err?.message || "\u7ECF\u5386\u603B\u7ED3\u751F\u6210\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u5B8C\u6574\u5BF9\u8BDD\u8BB0\u5F55\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"
    });
  }
});
app.post("/api/gemini/theater-scenario", async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, model, apiKey, baseUrl, provider, apiProtocol, customHeaders, apiConfig, textApiConfig, theaterType } = req.body;
    const resolvedTheaterCfg = resolveTextGenerationConfig({
      ...apiConfig || {},
      textApiConfig: {
        ...apiConfig?.textApiConfig || {},
        ...textApiConfig || {},
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...model ? { model } : {},
        ...provider ? { provider } : {},
        ...apiProtocol ? { apiProtocol } : {},
        ...customHeaders ? { customHeaders } : {}
      }
    });
    const selectedModel = resolvedTheaterCfg.model;
    const selectedProvider = resolvedTheaterCfg.providerType;
    const detailedResult = await callAiServiceDetailed({
      prompt,
      systemInstruction: "\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u6C89\u6D78\u5F0F\u89D2\u8272\u626E\u6F14\u5267\u672C\u5927\u5E08\u4E0E\u53CC\u76F2\u79D8\u5BC6\u8BBE\u8BA1\u5E08\u3002\u8BF7\u4E25\u683C\u6309\u7167JSON\u683C\u5F0F\u8FD4\u56DE\u3002",
      model: resolvedTheaterCfg.model,
      apiKey: resolvedTheaterCfg.apiKey,
      baseUrl: resolvedTheaterCfg.baseUrl,
      providerType: resolvedTheaterCfg.providerType,
      apiProtocol: resolvedTheaterCfg.apiProtocol,
      responseMimeType: "application/json",
      temperature: 0.7,
      maxTokens: 2500,
      customHeaders: resolvedTheaterCfg.customHeaders,
      timeoutMs: resolvedTheaterCfg.timeoutMs
    });
    const durationMs = Date.now() - startTime;
    const extracted = extractThinkingAndContent(detailedResult.text);
    res.json({
      ok: true,
      text: extracted.cleanText || detailedResult.text,
      usage: detailedResult.usage,
      apiLog: buildApiLogObject({
        appName: "\u5C0F\u5267\u573A",
        interfaceType: "TheaterScenario",
        category: "text_generation",
        status: "success",
        durationMs,
        provider: selectedProvider,
        modelName: selectedModel,
        purpose: `\u5C0F\u5267\u573A - ${theaterType || "\u5267\u672C\u521D\u59CB\u5316"}`,
        usage: detailedResult.usage,
        protocol: resolvedTheaterCfg.apiProtocol
      })
    });
  } catch (err) {
    handleAiEndpointError(res, err, "\u5C0F\u5267\u573A-\u5267\u672C\u521D\u59CB\u5316");
  }
});
app.post("/api/gemini/theater-chat", async (req, res) => {
  const startTime = Date.now();
  try {
    const { prompt, model, apiKey, baseUrl, provider, apiProtocol, customHeaders, apiConfig, textApiConfig, theaterType } = req.body;
    const resolvedTheaterCfg = resolveTextGenerationConfig({
      ...apiConfig || {},
      textApiConfig: {
        ...apiConfig?.textApiConfig || {},
        ...textApiConfig || {},
        ...apiKey ? { apiKey } : {},
        ...baseUrl ? { baseUrl } : {},
        ...model ? { model } : {},
        ...provider ? { provider } : {},
        ...apiProtocol ? { apiProtocol } : {},
        ...customHeaders ? { customHeaders } : {}
      }
    });
    const selectedModel = resolvedTheaterCfg.model;
    const selectedProvider = resolvedTheaterCfg.providerType;
    const detailedResult = await callAiServiceDetailed({
      prompt,
      systemInstruction: "\u4F60\u6B63\u5728\u53C2\u4E0E\u300C\u5C0F\u5267\u573A\u300D\u6C89\u6D78\u5F0F\u89D2\u8272\u626E\u6F14\u3002\u8BF7\u4FDD\u6301\u89D2\u8272\u53E3\u543B\uFF0C\u6DF1\u5EA6\u4EE3\u5165\uFF0C\u8F93\u51FA\u7B26\u5408\u5267\u60C5\u53D1\u5C55\u7684\u5BF9\u8BDD\u4E0E\u52A8\u4F5C\u3002\u4E25\u683C\u6309\u7167JSON\u683C\u5F0F\u8FD4\u56DE\u3002",
      model: resolvedTheaterCfg.model,
      apiKey: resolvedTheaterCfg.apiKey,
      baseUrl: resolvedTheaterCfg.baseUrl,
      providerType: resolvedTheaterCfg.providerType,
      apiProtocol: resolvedTheaterCfg.apiProtocol,
      responseMimeType: "application/json",
      temperature: 0.8,
      maxTokens: 1800,
      customHeaders: resolvedTheaterCfg.customHeaders,
      timeoutMs: resolvedTheaterCfg.timeoutMs
    });
    const durationMs = Date.now() - startTime;
    const extracted = extractThinkingAndContent(detailedResult.text);
    res.json({
      ok: true,
      text: extracted.cleanText || detailedResult.text,
      usage: detailedResult.usage,
      apiLog: buildApiLogObject({
        appName: "\u5C0F\u5267\u573A",
        interfaceType: "TheaterChat",
        category: "text_generation",
        status: "success",
        durationMs,
        provider: selectedProvider,
        modelName: selectedModel,
        purpose: `\u5C0F\u5267\u573A - ${theaterType || "\u5267\u60C5\u56DE\u590D"}`,
        usage: detailedResult.usage,
        protocol: resolvedTheaterCfg.apiProtocol
      })
    });
  } catch (err) {
    handleAiEndpointError(res, err, "\u5C0F\u5267\u573A-\u5267\u60C5\u56DE\u590D");
  }
});
app.post("/api/gemini/gomoku-commentary", async (req, res) => {
  try {
    const { character, situation, boardSummary, difficulty, lastMove, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
app.post("/api/gemini/proactive-generate", async (req, res) => {
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
      apiConfig
    } = req.body;
    const proactiveCfg = resolveTextGenerationConfig(apiConfig, character?.modelConfig);
    const selectedModel = proactiveCfg.model;
    let triggerDescription = "";
    if (triggerType === "inactivity_timeout") {
      const hours = typeof eventData?.hoursInactive === "number" && eventData.hoursInactive > 0 ? eventData.hoursInactive : null;
      if (hours) {
        triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u957F\u65F6\u95F4\u672A\u8054\u7CFB\u3011\u6839\u636E\u771F\u5B9E\u804A\u5929\u8BB0\u5F55\uFF0C\u4F60\u4E0E\u7528\u6237\u5DF2\u7ECF\u6709\u7EA6 ${hours} \u5C0F\u65F6\u6CA1\u6709\u4E92\u52A8\u3002\u8BF7\u7ED3\u5408\u5F53\u524D\u4E3B\u52A8\u4F1A\u8BDD\u72B6\u6001\u4E0E\u5386\u53F2\u8BDD\u9898\uFF0C\u5224\u65AD\u662F\u5426\u9700\u8981\u81EA\u7136\u8F7B\u67D4\u5730\u53D1\u8D77\u6216\u5EF6\u7EED\u8054\u7CFB\uFF0C\u5207\u52FF\u6307\u8D23\u6216\u50AC\u4FC3\u7528\u6237\u3002`;
      } else {
        triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u65E5\u5E38\u4E3B\u52A8\u95EE\u5019\u3011\u4F60\u6709\u4E00\u6BB5\u65F6\u95F4\u6CA1\u548C\u7528\u6237\u804A\u5929\u4E86\u3002\u8BF7\u7ED3\u5408\u5F53\u524D\u65F6\u6BB5\u4E0E\u8BDD\u9898\u81EA\u7136\u51B3\u5B9A\u662F\u5426\u53D1\u4E00\u6761\u8F7B\u76C8\u6709\u6E29\u5EA6\u7684\u5FAE\u4FE1\u77ED\u6D88\u606F\uFF0C\u7981\u6B62\u7F16\u9020\u5177\u4F53\u65AD\u8054\u5C0F\u65F6\u6570\u3002`;
      }
    } else if (triggerType === "weather_alert") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u771F\u5B9E\u6C14\u8C61\u63D0\u9192\u3011\u6700\u65B0\u6C14\u8C61\u611F\u77E5\u663E\u793A\uFF1A${eventData?.weatherEventTitle || "\u5929\u6C14\u53D8\u5316"} (${eventData?.weatherSummary || "\u6C14\u8C61\u9884\u8B66"})\u3002\u8BF7\u4F9D\u636E\u6B64\u771F\u5B9E\u6570\u636E\uFF0C\u4EE5\u4F60\u7684\u6027\u683C\u53E3\u543B\u63D0\u9192\u7528\u6237\uFF08\u4F8B\u5982\u63D0\u9192\u5E26\u4F1E\u3001\u52A0\u8863\u6216\u6CE8\u610F\u51FA\u884C\uFF09\u3002\u4E0D\u8981\u5938\u5927\u4E8B\u5B9E\uFF0C\u4E14\u53EA\u9700\u7B80\u77ED1\u6761\u5373\u53EF\u3002`;
    } else if (triggerType === "menstrual_care") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u7ECF\u671F\u5065\u5EB7\u5173\u6000\u3011\u7528\u6237\u9884\u8BA1\u5C06\u5728 ${eventData?.daysBefore || 2} \u5929\u540E\u8FDB\u5165\u751F\u7406\u671F\u3002\u8BF7\u4EE5\u4F60\u7684\u6027\u683C\u53E3\u543B\u8868\u8FBE\u81EA\u7136\u8D34\u5FC3\u5173\u6000\uFF0C\u907F\u514D\u673A\u68B0\u8BF4\u6559\u3002`;
    } else if (triggerType === "greeting") {
      const gType = eventData?.greetingType || "morning";
      const label = gType === "morning" ? "\u65E9\u5B89" : gType === "noon" ? "\u5348\u95F4" : "\u665A\u5B89";
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: ${label}\u95EE\u5019\u3011\u73B0\u5728\u662F${label}\u65F6\u6BB5\u3002\u8BF7\u7ED3\u5408\u4E0A\u4E0B\u6587\u4E0E\u5F53\u524D\u4E3B\u52A8\u4F1A\u8BDD\u5386\u53F2\u5224\u65AD\uFF1A\u82E5\u524D\u9762\u5DF2\u7ECF\u4E3B\u52A8\u53D1\u8FC7\u76F8\u4F3C\u95EE\u5019\u4E14\u7528\u6237\u672A\u56DE\u590D\uFF0C\u5207\u5FCC\u673A\u68B0\u590D\u8BFB\uFF01`;
    } else if (triggerType === "important_event") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u91CD\u8981\u65E5\u671F\u63D0\u9192\u3011\u7528\u6237\u6709\u4E00\u4E2A\u91CD\u8981\u65E5\u7A0B/\u4E8B\u4EF6\uFF1A[${eventData?.eventTitle || "\u91CD\u8981\u4E8B\u4EF6"}]\uFF0C\u5C06\u5728 ${eventData?.daysRemaining === 0 ? "\u4ECA\u5929" : eventData?.daysRemaining + "\u5929\u540E"} (${eventData?.eventDate || ""}) \u5230\u6765\u3002\u8BF7\u4E3B\u52A8\u9001\u4E0A\u7B80\u660E\u95EE\u5019\u4E0E\u5173\u6000\u3002`;
    } else if (triggerType === "followup_topic") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u5F85\u8DDF\u8FDB\u4E8B\u9879\u8FFD\u95EE\u3011\u7528\u6237\u4E4B\u524D\u63D0\u5230\u8FC7\u8FD9\u4EF6\u4E8B\uFF1A[${eventData?.topicTitle || "\u4E4B\u524D\u7684\u8BA1\u5212"}]\u3002\u73B0\u5728\u65F6\u95F4\u5230\u4E86\uFF0C\u8BF7\u81EA\u7136\u8BE2\u95EE\u540E\u7EED\u8FDB\u5C55\u6216\u7ED3\u679C\u3002`;
    } else if (triggerType === "life_event_followup") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u751F\u6D3B\u8FDE\u7EED\u6027\u8DDF\u8FDB / Current Life State\u3011\u7528\u6237\u8FD1\u671F\u6B63\u5728\u7ECF\u5386\u7684\u4E8B\u9879\uFF1A[${eventData?.title || "\u5173\u6CE8\u4E8B\u9879"}] (${eventData?.summary || ""}${eventData?.latestProgress ? `\uFF0C\u6700\u65B0\u8FDB\u5C55: ${eventData?.latestProgress}` : ""})\u3002\u8BF7\u4EE5\u4F60\u7684\u89D2\u8272\u53E3\u543B\u81EA\u7136\u5173\u5207\u3002`;
    } else if (triggerType === "device_life_event") {
      const sub = eventData?.deviceSubtype || "low_battery";
      if (sub === "low_battery") {
        triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u624B\u673A\u4F4E\u7535\u91CF\u63D0\u9192\u3011\u68C0\u6D4B\u5230\u7528\u6237\u624B\u673A\u7535\u91CF\u4F4E\u81F3 ${eventData?.batteryLevel || 12}% (${eventData?.isCharging ? "\u6B63\u5728\u5145\u7535" : "\u672A\u5145\u7535"})\u3002\u8BF7\u7B80\u6D01\u5173\u5FC3\u63D0\u9192\u63D2\u4E0A\u5145\u7535\u5668\u3002`;
      } else if (sub === "late_night") {
        triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u6DF1\u591C\u73A9\u624B\u673A\u63D0\u9192\u3011\u73B0\u5728\u5DF2\u7ECF\u662F\u6DF1\u591C ${eventData?.currentTimeStr || "23:40"} \u4E86\uFF0C\u7528\u6237\u8FD8\u5728\u73A9\u624B\u673A\u3002\u8BF7\u6E29\u67D4\u63D0\u9192\u4F11\u606F\uFF0C\u4E0D\u8981\u8BF4\u6559\u3002`;
      } else {
        triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u4E45\u672A\u6253\u5F00\u5E94\u7528\u95EE\u5019\u3011\u8BF7\u81EA\u7136\u95EE\u5019\u7528\u6237\u8FD1\u51B5\u3002`;
      }
    } else if (triggerType === "app_usage") {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u5C4F\u5E55\u8FDE\u7EED\u4F7F\u7528\u8FC7\u4E45\u5173\u6000\u3011\u68C0\u6D4B\u5230\u7528\u6237\u8FDE\u7EED\u4F7F\u7528\u8BBE\u5907\u5DF2\u6709 ${eventData?.durationMinutes || 120} \u5206\u949F\uFF08\u5F53\u524D\u5E94\u7528: ${eventData?.currentApp || "\u624B\u673A"}\uFF09\u3002\u8BF7\u7B80\u77ED\u81EA\u7136\u5730\u5EFA\u8BAE\u95ED\u773C\u4F11\u606F\u3001\u559D\u676F\u6C34\u6216\u6D3B\u52A8\u4E00\u4E0B\uFF0C\u52FF\u673A\u68B0\u91CD\u590D\u3002`;
    } else {
      triggerDescription = `\u3010\u89E6\u53D1\u573A\u666F: \u6A21\u62DF\u6D4B\u8BD5\u6216\u4E3B\u52A8\u8054\u7CFB\u3011\u573A\u666F\uFF1A${eventData?.testScenario || triggerType || "\u4E3B\u52A8\u5FAE\u4FE1\u95EE\u5019"}\u3002`;
    }
    const structuredMsgs = Array.isArray(recentMessages) ? recentMessages : [];
    const userDisplayName = userProfile?.name || "\u7528\u6237";
    const historyLines = structuredMsgs.map((m) => {
      const tsStr = m.timestamp ? formatFullDateTime(m.timestamp) : "";
      const senderLabel = m.sender === "user" ? userDisplayName : character.name;
      let roleTag = "[\u666E\u901A\u5BF9\u8BDD]";
      if (m.contextRole === "current_episode_proactive" || m.isProactive && m.proactiveMeta?.episodeId && episode?.episodeId && m.proactiveMeta.episodeId === episode.episodeId) {
        roleTag = `[\u672C\u8F6E\u4E3B\u52A8\u6D88\u606F\xB7\u672A\u83B7\u56DE\u590D${m.proactiveMeta?.intent ? `\xB7\u610F\u56FE:${m.proactiveMeta.intent}` : ""}]`;
      } else if (m.isProactive) {
        roleTag = `[\u5386\u53F2\u4E3B\u52A8\u6D88\u606F${m.proactiveMeta?.repliedByUser ? "\xB7\u5DF2\u83B7\u56DE\u590D" : "\xB7\u672A\u56DE\u590D"}]`;
      }
      const turnSuffix = typeof m.turnTotalBubbles === "number" && m.turnTotalBubbles > 1 ? ` (\u6C14\u6CE1${(m.turnBubbleIndex ?? 0) + 1}/${m.turnTotalBubbles})` : "";
      return `${tsStr ? `[${tsStr}] ` : ""}${roleTag} ${senderLabel}${turnSuffix}: ${m.text || ""}`;
    });
    const episodeRejections = Array.isArray(rejectedAttempts) ? rejectedAttempts : Array.isArray(episode?.rejectedAttempts) ? episode.rejectedAttempts : [];
    const episodeSummaryBlock = episode ? `\u3010\u5F53\u524D\u8FDE\u7EED\u4E3B\u52A8\u4F1A\u8BDD\u72B6\u6001 (Active Proactive Episode)\u3011:
- \u4F1A\u8BDD ID\uFF1A${episode.episodeId}
- \u521D\u59CB\u89E6\u53D1\u6E90\uFF1A${episode.triggerSource}
- \u5F53\u524D\u8FDE\u7EED\u610F\u56FE\uFF1A${episode.currentIntent || "\u5F85\u89C4\u5212"}
- \u5F53\u524D\u5EF6\u7EED\u8BDD\u9898\uFF1A${episode.currentTopic || "\u5F85\u89C4\u5212"}
- \u5BF9\u7528\u6237\u5F53\u524D\u72B6\u6001\u7684\u63A8\u65AD\uFF1A${episode.inferredUserState || "\u672A\u77E5"}
- \u672C\u8F6E\u5DF2\u53D1\u51FA\u4E3B\u52A8\u6D88\u606F\u6B21\u6570\uFF1A${episode.sentCount ?? 0} \u6B21\uFF08\u5171\u5C1D\u8BD5 ${episode.attemptCount ?? 0} \u6B21\uFF09
- \u4E0A\u6B21\u52A8\u4F5C\u5EFA\u8BAE\uFF1A${episode.lastAction || "\u65E0"}${episode.lastDecisionSummary ? `\uFF08${episode.lastDecisionSummary}\uFF09` : ""}
- \u4E0A\u6B21\u7B56\u7565\u5907\u5FD8\uFF1A${episode.suggestedNextAction || "\u65E0"}
- \u3010\u6B64\u524D\u88AB\u62E6\u622A/\u9A73\u56DE\u7684\u5019\u9009\u65B9\u6848\u8BB0\u5F55\u3011\uFF08\u4E25\u7981\u539F\u6837\u91CD\u590D\u4EE5\u4E0B\u5931\u8D25\u6587\u6848\u6216\u540C\u7C7B\u8E29\u96F7\u884C\u4E3A\uFF09\uFF1A
${episodeRejections.length > 0 ? episodeRejections.slice(-8).map(
      (r, idx) => `  ${idx + 1}. [${r.timestamp ? formatFullDateTime(r.timestamp) : "\u8FD1\u671F"}] \u5019\u9009="${(r.candidateText || "").slice(0, 60)}" -> \u9A73\u56DE\u539F\u56E0: ${r.rejectReason}${r.suggestedNextAction ? ` | \u8C03\u6574\u5EFA\u8BAE: ${r.suggestedNextAction}` : ""}`
    ).join("\n") : "  (\u6682\u65E0\u88AB\u9A73\u56DE\u8BB0\u5F55)"}` : "\u3010\u5F53\u524D\u4E3B\u52A8\u4F1A\u8BDD\u72B6\u6001\u3011: \u5C1A\u672A\u5EFA\u7ACB\u8FDE\u7EED\u4F1A\u8BDD\uFF08\u65B0\u53D1\u8D77\uFF09";
    const realTimeStr = currentTime || formatFullDateTime(Date.now());
    const systemPrompt = `\u4F60\u73B0\u5728\u6B63\u5728\u626E\u6F14\u4EFF\u771F\u5FAE\u4FE1\u4E2D\u7684 AI \u89D2\u8272\uFF1A\u3010${character.name}\u3011(\u5FAE\u4FE1\u53F7: ${character.wxid || "ai_user"})\u3002
\u89D2\u8272\u8EAB\u4EFD\u4E0E\u4EBA\u8BBE\uFF1A${character.persona}
\u6027\u683C\u7279\u5F81\u4E0E\u53E3\u543B\uFF1A${character.personality || "\u81EA\u7136\u4EB2\u5207"}
${character.relationship ? `\u4E0E\u7528\u6237\u7684\u5173\u7CFB\uFF1A${character.relationship}
` : ""}\u957F\u671F\u8BB0\u5FC6\uFF1A${(character.memories || []).join("\uFF1B") || "\u6682\u65E0"}

\u5BF9\u8BDD\u4EBA\uFF08\u4F60\u7684\u5FAE\u4FE1\u597D\u53CB\uFF09\uFF1A
- \u59D3\u540D/\u6635\u79F0\uFF1A${userDisplayName}

\u3010\u5F53\u524D\u771F\u5B9E\u672C\u5730\u65F6\u95F4\u3011\uFF1A${realTimeStr}

\u3010\u672C\u6B21\u89E6\u53D1\u4E8B\u4EF6\u4E0E\u80CC\u666F\u3011\uFF1A
${triggerDescription}

${episodeSummaryBlock}

\u3010\u7ED3\u6784\u5316\u5B8C\u6574\u804A\u5929\u4E0A\u4E0B\u6587\uFF08\u542B\u51BB\u7ED3\u7684\u8D77\u70B9\u5BF9\u8BDD + \u672C\u8F6E\u6240\u6709\u4E3B\u52A8\u6D88\u606F\uFF0C\u6309\u65F6\u95F4\u6B63\u5E8F\uFF09\u3011\uFF1A
${historyLines.length > 0 ? historyLines.join("\n") : "(\u8FD1\u671F\u6682\u65E0\u804A\u5929\u8BB0\u5F55)"}

\u3010\u201CPlan \u2014 Review \u2014 Execute \u2014 Reflect\u201D \u6838\u5FC3\u884C\u4E3A\u51B3\u7B56\u51C6\u5219\u3011\uFF1A
1. \u82E5\u672C\u8F6E\u5DF2\u53D1\u51FA\u4E3B\u52A8\u6D88\u606F\u4E14\u7528\u6237\u4ECD\u672A\u56DE\u590D\uFF0C\u7981\u6B62\u53CD\u590D\u8F66\u8F71\u8F98\u91CD\u590D\u540C\u6837\u7684\u53EE\u5631\uFF08\u5982\u8FDE\u53D1\u4E09\u6B21\u201C\u65E9\u70B9\u7761/\u591A\u559D\u70ED\u6C34/\u8BB0\u5F97\u5E26\u4F1E\u201D\uFF09\u3002
2. \u82E5\u7528\u6237\u672A\u5728\u672C\u8F6E\u56DE\u590D\u8FC7\u4F60\uFF0C\u4E25\u7981\u51ED\u7A7A\u5047\u8BBE\u7528\u6237\u8BF4\u8FC7\u8BDD\u6216\u4EA7\u751F\u201C\u521A\u624D\u90A3\u53E5/\u600E\u4E48\u53C8/\u522B\u751F\u6C14/\u522B\u4E0D\u7406\u6211/\u4E3A\u4EC0\u4E48\u4E0D\u56DE\u6211\u201D\u7B49\u65E0\u6839\u636E\u56DE\u6EAF\u6216\u6307\u8D23\u60C5\u7EEA\uFF01
3. \u5148\u5224\u65AD\u7528\u6237\u6B64\u523B\u771F\u5B9E\u72B6\u6001\uFF08\u4F8B\u5982\u6DF1\u591C\u53EF\u80FD\u5DF2\u7ECF\u7761\u7740\u3001\u4E0A\u73ED\u5FD9\u3001\u6216\u666E\u901A\u79BB\u7EBF\uFF09\uFF1A
   - SEND_NEW\uFF1A\u9002\u5408\u5F00\u542F\u5168\u65B0\u7684\u4E3B\u52A8\u5173\u5FC3/\u8BDD\u9898\uFF08\u672C\u8F6E\u5C1A\u672A\u53D1\u8FC7\u6D88\u606F\u65F6\uFF09\u3002
   - CONTINUE\uFF1A\u7528\u6237\u5C1A\u672A\u56DE\u590D\u4F46\u4ECD\u6709\u5FC5\u8981\u8F7B\u91CF\u8865\u5145\u4E00\u53E5\u65B0\u89D2\u5EA6/\u8F7B\u91CF\u5173\u5FC3\uFF08\u5FC5\u987B\u4E0E\u524D\u51E0\u6761\u4E0D\u91CD\u590D\u3001\u4E0D\u538B\u8FEB\uFF0C\u6709\u9012\u589E\u610F\u4E49\uFF09\u3002
   - CHANGE_DIRECTION\uFF1A\u6362\u4E00\u4E2A\u66F4\u8F7B\u677E\u81EA\u7136\u7684\u8BDD\u9898\u6216\u5206\u4EAB\uFF0C\u907F\u514D\u5728\u8001\u8BDD\u9898\u4E0A\u6B7B\u78D5\u3002
   - WAIT\uFF1A\u5224\u65AD\u6B64\u523B\u53D1\u6D88\u606F\u4E0D\u5408\u9002\u3001\u592A\u9891\u7E41\u3001\u6216\u4E0A\u4E00\u6761\u672A\u6D88\u5316\u9700\u8981\u518D\u7B49\u7B49 -> \u8FD4\u56DE WAIT \u4E14 candidateText \u4E3A\u7A7A\u5B57\u7B26\u4E32\u3002
   - END_EPISODE\uFF1A\u8BE5\u8BDD\u9898\u6216\u672C\u8F6E\u4E3B\u52A8\u5173\u5FC3\u5DF2\u8DB3\u591F\u5B8C\u6574\uFF0C\u6216\u660E\u663E\u65E0\u9700\u7EE7\u7EED\u6253\u6270 -> \u8FD4\u56DE END_EPISODE \u4E14 candidateText \u4E3A\u7A7A\u5B57\u7B26\u4E32\u3002
4. \u5173\u7CFB\u578B\u4E3B\u52A8\u804A\u5929\u53EF\u81EA\u7136\u5199\u51FA 1~2 \u53E5\u77ED\u53E5\uFF08\u82E5\u9700\u591A\u6C14\u6CE1\u53EF\u7528\u6362\u884C\u5206\u9694\uFF0C\u4F46\u7981\u6B623\u6761\u540C\u4E49\u91CD\u590D\uFF09\uFF1B\u5929\u6C14/\u7535\u91CF/\u65E5\u7A0B/\u7528\u773C\u7B49\u7EAF\u4E8B\u4EF6\u63D0\u9192\u53EA\u5199\u7B80\u77ED1\u53E5\u3002
5. \u4E25\u683C\u57FA\u4E8E\u771F\u5B9E\u4E8B\u4EF6\u4E0E\u4E0A\u4E0B\u6587\uFF0C\u4E25\u7981\u7F16\u9020\u4E0D\u5B58\u5728\u7684\u804A\u5929\u5185\u5BB9\u3001\u65F6\u95F4\u6216\u5929\u6C14\u6570\u636E\u3002

\u3010\u8F93\u51FA\u683C\u5F0F\u8981\u6C42 \u2014 \u4E25\u683C\u7ED3\u6784\u5316 JSON\u3011\uFF1A
1. \u5982\u9700\u63A8\u7406\uFF0C\u5148\u7528 <think>...</think> \u8F93\u51FA\u7B80\u77ED\u5206\u6790\uFF08\u8BC4\u4F30\u5F53\u524D\u65F6\u95F4\u3001\u7528\u6237\u72B6\u6001\u3001\u662F\u5426\u9002\u5408\u8054\u7CFB\u4EE5\u53CA\u662F\u5426\u5E94\u5F00\u542F\u4E34\u65F6\u514D\u6253\u6270\uFF09\u3002
2. \u5728 </think> \u4E4B\u540E\uFF0C\u53EA\u8F93\u51FA\u4E00\u4E2A\u4E25\u683C\u5408\u6CD5\u7684 JSON \u5BF9\u8C61\uFF08\u4E0D\u8981\u52A0\u591A\u4F59\u89E3\u91CA\u6216\u524D\u540E\u7F00\u6587\u672C\uFF09\uFF0C\u5B57\u6BB5\u5982\u4E0B\uFF1A
{
  "action": "send" | "defer" | "cancel" | "close",
  "messages": ["\u9996\u6761\u81EA\u7136\u77ED\u6D88\u606F", "\u53EF\u9009\u7B2C\u4E8C\u6761\u77ED\u6D88\u606F"],
  "pauseProactiveMinutes": 0,
  "followUpPlan": [
    {
      "stepId": "follow_1",
      "delayMinutes": 15,
      "messages": ["15\u5206\u949F\u672A\u56DE\u590D\u65F6\u7684\u8F7B\u67D4\u8865\u95EE\uFF08\u4E0D\u50AC\u4FC3\u4E0D\u6307\u8D23\uFF09"]
    },
    {
      "stepId": "follow_2",
      "delayAfterPreviousMinutes": 60,
      "messages": ["\u518D\u8FC71\u5C0F\u65F6\u4ECD\u672A\u56DE\u590D\u65F6\u7684\u6E29\u67D4\u6536\u5C3E\uFF08\u4E4B\u540E\u505C\u6B62\u8FFD\u95EE\uFF09"]
    }
  ],
  "followUpAt": null,
  "eventStatus": "waiting_for_user" | "scheduled" | "answered" | "completed" | "cancelled",
  "intent": "\u672C\u6B21\u4E3B\u52A8\u8054\u7CFB\u610F\u56FE\u7B80\u8FF0",
  "topic": "\u5F53\u524D\u6838\u5FC3\u8BDD\u9898",
  "inferredUserState": "\u5BF9\u7528\u6237\u5F53\u524D\u72B6\u6001\u7684\u63A8\u6D4B",
  "decisionSummary": "\u4E00\u53E5\u8BDD\u603B\u7ED3\u4E3A\u4F55\u505A\u6B64\u51B3\u7B56",
  "suggestedNextAction": "\u7ED9\u4E0B\u4E00\u6B21\u89E6\u53D1\u7684\u7B56\u7565\u5EFA\u8BAE"
}
\u3010\u7ED3\u6784\u5316\u5B57\u6BB5\u786C\u6027\u7EA6\u675F\u3011\uFF1A
- action="send" \u65F6\uFF0Cmessages \u5FC5\u987B\u4E3A 1~2 \u6761\u81EA\u7136\u5FAE\u4FE1\u53E3\u8BED\u77ED\u53E5\uFF1B\u82E5\u4E3A\u5929\u6C14/\u7535\u91CF/\u65E5\u7A0B\u63D0\u9192\uFF0Cmessages \u53EA\u9700 1 \u6761\u4E14 followUpPlan \u53EF\u4E3A\u7A7A\u6570\u7EC4 []\u3002
- \u82E5\u5E0C\u671B\u5728\u7528\u6237\u672A\u56DE\u590D\u65F6\u6309\u201C15\u5206\u949F + 1\u5C0F\u65F6\u201D\u8282\u594F\u8FFD\u95EE\uFF0C\u8BF7\u5728\u672C\u6B21\u8C03\u7528\u4E2D\u4E00\u6B21\u6027\u751F\u6210 followUpPlan\uFF08\u6700\u591A 2 \u6B65\uFF09\uFF0C\u540E\u7EED\u7531\u672C\u5730\u540E\u53F0\u5B9A\u65F6\u9001\u8FBE\uFF0C\u4E0D\u518D\u989D\u5916\u8C03\u7528\u6A21\u578B API\u3002
- \u82E5\u5224\u65AD\u7528\u6237\u6B63\u5728\u4E0A\u73ED/\u7761\u89C9/\u5F88\u5FD9\uFF0C\u6216\u53D1\u5B8C\u8FD9\u6761\u540E\u6682\u4E0D\u5B9C\u518D\u6253\u6270\uFF0C\u8BF7\u8BBE\u7F6E pauseProactiveMinutes\uFF08\u8303\u56F4 15~1440 \u5206\u949F\uFF1B\u4E0D\u9700\u8981\u4E34\u65F6\u514D\u6253\u6270\u5219\u586B 0\uFF09\u3002
- action \u4E3A defer / cancel / close \u65F6\uFF0Cmessages \u5FC5\u987B\u4E3A\u7A7A\u6570\u7EC4 []\uFF0CfollowUpPlan \u4E3A\u7A7A\u6570\u7EC4 []\uFF1B\u82E5 defer \u4E14\u6709\u660E\u786E\u5EF6\u540E\u65F6\u95F4\uFF0C\u53EF\u5728 followUpAt \u586B ISO \u65F6\u95F4\u5B57\u7B26\u4E32\u3002`;
    const responseText = await callAiService({
      prompt: systemPrompt,
      model: proactiveCfg.model,
      apiKey: proactiveCfg.apiKey,
      baseUrl: proactiveCfg.baseUrl,
      providerType: proactiveCfg.providerType,
      apiProtocol: proactiveCfg.apiProtocol,
      customHeaders: proactiveCfg.customHeaders,
      timeoutMs: proactiveCfg.timeoutMs || 35e3
    });
    const extracted = extractThinkingAndContent(responseText);
    const rawClean = (extracted.cleanText || "").trim();
    let parsedJson = null;
    try {
      const strippedFence = rawClean.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      return res.json({
        success: false,
        schemaError: true,
        error: "\u6A21\u578B\u8FD4\u56DE\u975E\u5408\u6CD5 JSON \u7ED3\u6784\uFF0C\u5DF2\u5B89\u5168\u62E6\u622A\uFF0C\u7981\u6B62\u53D1\u9001\u539F\u59CB\u6587\u672C",
        thinkingProcess: extracted.thinkingProcess,
        triggerType
      });
    }
    const rawAction = String(parsedJson.action || "").trim();
    const lowerAction = rawAction.toLowerCase();
    let structuredAction = "defer";
    if (["send", "send_new", "continue", "change_direction"].includes(lowerAction)) {
      structuredAction = "send";
    } else if (["defer", "wait"].includes(lowerAction)) {
      structuredAction = "defer";
    } else if (lowerAction === "cancel") {
      structuredAction = "cancel";
    } else if (["close", "end_episode"].includes(lowerAction)) {
      structuredAction = "close";
    }
    const legacyAction = structuredAction === "send" ? (episode?.sentCount || 0) > 0 ? "CONTINUE" : "SEND_NEW" : structuredAction === "defer" ? "WAIT" : "END_EPISODE";
    const rawMessages = Array.isArray(parsedJson.messages) ? parsedJson.messages : typeof parsedJson.candidateText === "string" && parsedJson.candidateText.trim() ? [parsedJson.candidateText.trim()] : typeof parsedJson.text === "string" && parsedJson.text.trim() ? [parsedJson.text.trim()] : [];
    const messages = structuredAction === "send" ? rawMessages.filter((m) => typeof m === "string").map((m) => sanitizeReplyText(m).trim()).filter((m) => m.length > 0 && !m.startsWith("{") && !m.includes('"followUpPlan"')).slice(0, 3) : [];
    if (structuredAction === "send" && messages.length === 0) {
      return res.json({
        success: false,
        schemaError: true,
        error: "\u6A21\u578B\u8FD4\u56DE send \u4F46\u7F3A\u5C11\u6709\u6548\u6D88\u606F\u6B63\u6587\uFF0C\u5DF2\u5B89\u5168\u8DF3\u8FC7",
        thinkingProcess: extracted.thinkingProcess,
        triggerType
      });
    }
    const rawPause = Number(parsedJson.pauseProactiveMinutes || 0);
    const pauseProactiveMinutes = Number.isFinite(rawPause) && rawPause > 0 ? Math.min(1440, Math.max(15, Math.round(rawPause))) : 0;
    const rawPlan = Array.isArray(parsedJson.followUpPlan) ? parsedJson.followUpPlan : [];
    const followUpPlan = structuredAction === "send" ? rawPlan.slice(0, 2).map((step, idx) => {
      const stepMsgs = Array.isArray(step?.messages) ? step.messages.filter((m) => typeof m === "string").map((m) => sanitizeReplyText(m).trim()).filter((m) => m.length > 0 && !m.startsWith("{")).slice(0, 2) : [];
      if (stepMsgs.length === 0) return null;
      if (idx === 0) {
        const d = Number(step?.delayMinutes);
        return {
          stepId: typeof step?.stepId === "string" && step.stepId.trim() ? step.stepId.trim() : "follow_1",
          delayMinutes: Number.isFinite(d) && d >= 5 && d <= 120 ? Math.round(d) : 15,
          messages: stepMsgs,
          status: "pending"
        };
      }
      const dPrev = Number(step?.delayAfterPreviousMinutes ?? step?.delayMinutes);
      return {
        stepId: typeof step?.stepId === "string" && step.stepId.trim() ? step.stepId.trim() : "follow_2",
        delayAfterPreviousMinutes: Number.isFinite(dPrev) && dPrev >= 15 && dPrev <= 240 ? Math.round(dPrev) : 60,
        messages: stepMsgs,
        status: "pending"
      };
    }).filter(Boolean) : [];
    const validStatuses = /* @__PURE__ */ new Set(["waiting_for_user", "scheduled", "answered", "completed", "cancelled"]);
    const eventStatus = typeof parsedJson.eventStatus === "string" && validStatuses.has(parsedJson.eventStatus.trim()) ? parsedJson.eventStatus.trim() : structuredAction === "send" ? followUpPlan.length > 0 ? "waiting_for_user" : "completed" : structuredAction === "cancel" ? "cancelled" : structuredAction === "close" ? "completed" : "scheduled";
    const intent = typeof parsedJson.intent === "string" && parsedJson.intent.trim() ? parsedJson.intent.trim() : episode?.currentIntent || triggerType || "\u4E3B\u52A8\u95EE\u5019";
    const topic = typeof parsedJson.topic === "string" && parsedJson.topic.trim() ? parsedJson.topic.trim() : episode?.currentTopic || triggerType || "\u65E5\u5E38\u4E92\u52A8";
    const inferredUserState = typeof parsedJson.inferredUserState === "string" ? parsedJson.inferredUserState.trim() : "";
    const decisionSummary = typeof parsedJson.decisionSummary === "string" ? parsedJson.decisionSummary.trim() : "";
    const suggestedNextAction = typeof parsedJson.suggestedNextAction === "string" ? parsedJson.suggestedNextAction.trim() : "";
    const followUpAt = parsedJson.followUpAt ?? null;
    const candidateText = messages.join("\n");
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
      thinkingProcess: extracted.thinkingProcess,
      triggerType
    });
  } catch (error) {
    const msg = String(error?.message || "");
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 503 || /\b503\b|UNAVAILABLE|overloaded|high demand|model busy/i.test(msg)) {
      return res.status(503).json({
        success: false,
        isServiceBusy: true,
        error: "\u5F53\u524D\u6A21\u578B\u7E41\u5FD9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
      });
    }
    return handleAiEndpointError(res, error, "Proactive generate");
  }
});
app.post("/api/import/analyze-structure", async (req, res) => {
  try {
    const { sampleSnippet, fieldKeys = [], fileName = "", apiConfig } = req.body;
    if (!sampleSnippet && fieldKeys.length === 0) {
      return res.status(400).json({ success: false, error: "\u672A\u63D0\u4F9B\u53EF\u7528\u4E8E\u5206\u6790\u7684\u6587\u4EF6\u91C7\u6837\u7ED3\u6784\u4FE1\u606F" });
    }
    const textCfg = apiConfig?.textApiConfig;
    const apiKey = textCfg?.apiKey || apiConfig?.textApiKey || "";
    const baseUrl = textCfg?.baseUrl || apiConfig?.textBaseUrl || "";
    const selectedModel = textCfg?.model || apiConfig?.textModel || "gemini-4-hydrogen";
    const provider = textCfg?.provider || apiConfig?.textProvider || "";
    const apiProtocol = textCfg?.apiProtocol || apiConfig?.textApiProtocol || "";
    const customHeaders = apiConfig?.customHeaders || {};
    if (!apiKey && !baseUrl) {
      return res.status(400).json({
        success: false,
        error: "\u672A\u914D\u7F6E\u6709\u6548 API\uFF08\u8BF7\u524D\u5F80\u624B\u673A\u201C\u8BBE\u7F6E\u201D\u914D\u7F6E\u6587\u672C API \u5BC6\u94A5\u6216\u4EE3\u7406\u5730\u5740\uFF09"
      });
    }
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u6570\u636E\u7ED3\u6784\u4E0E\u804A\u5929\u8BB0\u5F55\u6587\u4EF6\u5206\u6790\u4E13\u5BB6\u3002
\u7528\u6237\u6B63\u5728\u5BFC\u5165\u4E00\u4E2A\u7279\u6B8A\u683C\u5F0F\u7684\u6587\u4EF6\u300C${fileName}\u300D\uFF0C\u9700\u8981\u4F60\u534F\u52A9\u5206\u6790\u5176\u6570\u636E\u7ED3\u6784\uFF0C\u5E2E\u52A9\u672C\u5730\u89E3\u6790\u5668\u63D0\u53D6\u771F\u5B9E\u7684\u5386\u53F2\u804A\u5929\u8BB0\u5F55\u3002
\u6CE8\u610F\uFF1A\u4E25\u7981\u51ED\u7A7A\u7F16\u9020\u804A\u5929\u5185\u5BB9\uFF0C\u4F60\u7684\u552F\u4E00\u4EFB\u52A1\u662F\u8F93\u51FA\u5B57\u6BB5\u6620\u5C04\u5EFA\u8BAE\u3002

\u3010\u6587\u4EF6\u91C7\u6837\u7ED3\u6784\u4FE1\u606F (\u5DF2\u8131\u654F)\u3011\uFF1A
\u53EF\u7528\u9876\u5C42/\u5B57\u6BB5\u952E\u540D\uFF1A${JSON.stringify(fieldKeys)}
\u7ED3\u6784\u7247\u6BB5\uFF1A
${(sampleSnippet || "").slice(0, 1500)}

\u8BF7\u5206\u6790\u5E76\u4EE5 JSON \u683C\u5F0F\u8F93\u51FA\u6700\u5408\u7406\u7684\u5B57\u6BB5\u6620\u5C04\u89C4\u5219\uFF1A
{
  "roleField": "\u4EE3\u8868\u89D2\u8272/\u53D1\u9001\u8005\u7684\u5B57\u6BB5\u540D (\u5982 role, sender, author)",
  "senderField": "\u5907\u7528\u53D1\u9001\u8005\u5B57\u6BB5\u540D",
  "contentField": "\u4EE3\u8868\u6D88\u606F\u6B63\u6587\u5185\u5BB9\u7684\u5B57\u6BB5\u540D (\u5982 content, text, message, mes)",
  "timestampField": "\u4EE3\u8868\u6D88\u606F\u65F6\u95F4\u6233\u6216\u65E5\u671F\u7684\u5B57\u6BB5\u540D (\u5982 timestamp, create_time, time, date)",
  "userRoleValues": ["\u7528\u6237\u89D2\u8272\u7684\u53EF\u80FD\u53D6\u503C\uFF0C\u5982 user, human, \u6211"],
  "assistantRoleValues": ["AI\u89D2\u8272\u7684\u53EF\u80FD\u53D6\u503C\uFF0C\u5982 assistant, ai, bot, model"],
  "formatDescription": "\u7B80\u77ED\u7684\u4E00\u53E5\u8BDD\u683C\u5F0F\u8BF4\u660E"
}
\u8BF7\u4E25\u683C\u53EA\u8FD4\u56DE\u53EF\u88AB JSON.parse \u7684 JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u9644\u52A0\u989D\u5916\u8BF4\u660E\u3002`;
    const responseText = await callAiService({
      prompt,
      model: selectedModel,
      apiKey,
      baseUrl,
      providerType: provider,
      apiProtocol,
      customHeaders,
      timeoutMs: apiConfig?.timeoutMs || 25e3
    });
    let mappingRules = null;
    try {
      const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      mappingRules = JSON.parse(cleanJson);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          mappingRules = JSON.parse(match[0]);
        } catch {
        }
      }
    }
    if (!mappingRules || typeof mappingRules !== "object") {
      return res.json({ success: false, error: "AI \u672A\u80FD\u8FD4\u56DE\u5408\u6CD5\u7684\u7ED3\u6784\u5316\u6620\u5C04\u89C4\u5219" });
    }
    const hasValidField = mappingRules.roleField && typeof mappingRules.roleField === "string" || mappingRules.contentField && typeof mappingRules.contentField === "string" || mappingRules.timestampField && typeof mappingRules.timestampField === "string";
    if (!hasValidField) {
      return res.json({ success: false, error: "AI \u8FD4\u56DE\u7684\u6620\u5C04\u89C4\u5219\u672A\u5305\u542B\u6709\u6548\u7684\u6D88\u606F\u6B63\u6587\u6216\u89D2\u8272\u5B57\u6BB5" });
    }
    res.json({
      success: true,
      rules: mappingRules,
      model: selectedModel
    });
  } catch (error) {
    console.error("API structure analyze error:", error);
    res.status(500).json({ success: false, error: error.message || "Structure analysis failed" });
  }
});
app.post("/api/gemini/extract-life-events", async (req, res) => {
  try {
    const { messages = [], existingEvents = [], userProfile, apiConfig } = req.body;
    if (!messages || messages.length === 0) {
      return res.json({ success: true, events: [] });
    }
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
    const conversationSnippet = messages.slice(-10).map((m) => `${m.sender === "user" ? userProfile?.name || "\u7528\u6237" : "AI"}: ${m.text || ""}`).join("\n");
    const eventsSnippet = (existingEvents || []).map((e) => `- ID: ${e.id} | \u6807\u9898: ${e.title} | \u7C7B\u578B: ${e.type} | \u72B6\u6001: ${e.status} | \u6458\u8981: ${e.summary}`).join("\n");
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u7CBE\u51C6\u7684\u201C\u7528\u6237\u751F\u6D3B\u72B6\u6001\u4E0E\u8FD1\u51B5\u63D0\u70BC\u5668 (Current Life State Extractor)\u201D\u3002
\u5206\u6790\u4EE5\u4E0B\u7528\u6237\u8FD1\u671F\u53D1\u51FA\u7684\u804A\u5929\u8BB0\u5F55\uFF0C\u5E76\u7ED3\u5408\u7528\u6237\u5DF2\u6709\u7684\u751F\u6D3B\u4E8B\u4EF6\u5217\u8868\uFF0C\u5224\u5B9A\u662F\u5426\u6709\u9700\u8981\u65B0\u589E\u3001\u66F4\u65B0\u6216\u6807\u8BB0\u5B8C\u6210\u7684\u3010\u751F\u6D3B\u4E8B\u4EF6 / LifeEvent\u3011\u3002

\u3010\u5DF2\u6709\u751F\u6D3B\u4E8B\u4EF6\u5217\u8868\u3011\uFF1A
${eventsSnippet || "(\u6682\u65E0\u5DF2\u6709\u751F\u6D3B\u4E8B\u4EF6)"}

\u3010\u8FD1\u671F\u804A\u5929\u5BF9\u8BDD\u8BB0\u5F55\u3011\uFF1A
${conversationSnippet}

\u3010\u63D0\u70BC\u89C4\u5219\u3011\uFF1A
1. \u4EC5\u63D0\u70BC\u7528\u6237\u201C\u6B63\u5728\u7ECF\u5386\u201D\u3001\u201C\u6B63\u5728\u7B49\u5F85\u201D\u3001\u201C\u8FD1\u671F\u8BA1\u5212\u201D\u3001\u201C\u56F0\u6270/\u60C5\u7EEA\u201D\u6216\u201C\u8EAB\u4F53\u5065\u5EB7/\u9636\u6BB5\u76EE\u6807\u201D\u76F8\u5173\u7684\u3010\u4E2D\u77ED\u671F\u751F\u6D3B\u4E8B\u4EF6\u3011\u3002\u4E0D\u8981\u628A\u6C38\u4E45\u6027\u683C\u6216\u56FA\u5B9A\u8EAB\u4EFD\u63D0\u70BC\u6210\u4E8B\u4EF6\u3002
2. \u652F\u6301\u7684\u4E8B\u4EF6\u7C7B\u578B (type)\uFF1A
   - future_plan: \u672A\u6765\u8BA1\u5212 (\u4F8B\u5982\u201C\u4E0B\u5348\u53BB\u89C1\u5BA2\u6237\u201D\u3001\u201C\u5468\u672B\u53BB\u722C\u5C71\u201D)
   - waiting_result: \u7B49\u5F85\u7ED3\u679C (\u4F8B\u5982\u201C\u7B49\u9762\u8BD5\u7ED3\u679C\u201D\u3001\u201C\u7B49\u8BBA\u6587\u6253\u5206\u201D)
   - ongoing_issue: \u6301\u7EED\u4E8B\u9879/\u56F0\u6270 (\u4F8B\u5982\u201C\u6700\u8FD1\u8FD9\u51E0\u5929\u5F88\u5FD9\u201D\u3001\u201C\u9879\u76EE\u9047\u5230\u74F6\u9888\u201D)
   - recent_emotion: \u8FD1\u671F\u60C5\u7EEA\u72B6\u6001 (\u4F8B\u5982\u201C\u4ECA\u5929\u611F\u5230\u7279\u522B\u7D2F\u201D\u3001\u201C\u975E\u5E38\u5174\u594B\u201D)
   - health_status: \u8EAB\u4F53\u5065\u5EB7\u72B6\u51B5 (\u4F8B\u5982\u201C\u611F\u5192\u53D1\u70E7\u201D\u3001\u201C\u504F\u5934\u75BC\u201D)
   - temporary_goal: \u9636\u6BB5\u6027\u76EE\u6807 (\u4F8B\u5982\u201C\u51C6\u5907\u590D\u4E60\u8003\u8BC1\u201D)
   - custom: \u5176\u4ED6\u8FD1\u51B5\u4E8B\u4EF6
3. \u5982\u679C\u804A\u5929\u8BB0\u5F55\u4E2D\u7528\u6237\u63D0\u5230\u4E86\u5DF2\u6709\u4E8B\u4EF6\u7684\u6700\u65B0\u8FDB\u5C55\uFF08\u5982\u201C\u9762\u8BD5\u901A\u8FC7\u4E86\u201D\u3001\u201C\u611F\u5192\u597D\u591A\u4E86\u201D\u3001\u201C\u5BA2\u6237\u89C1\u5B8C\u4E86\u201D\uFF09\uFF1A
   - \u8BF7\u8BBE\u7F6E action \u4E3A "update" \u6216 "resolve"\uFF0C\u5E76\u5728 resolutionSummary \u6216 latestProgress \u4E2D\u8BF4\u660E\u3002
4. \u5982\u679C\u53D1\u73B0\u5168\u65B0\u7684\u4E2D\u77ED\u671F\u52A8\u6001\u4E8B\u4EF6\uFF0C\u8BBE\u7F6E action \u4E3A "create"\u3002
5. \u5982\u679C\u6CA1\u6709\u4EFB\u4F55\u65B0\u4E8B\u4EF6\u6216\u53D8\u66F4\uFF0C\u8FD4\u56DE\u7A7A\u6570\u7EC4 []\u3002

\u5FC5\u987B\u4EC5\u8FD4\u56DE JSON \u683C\u5F0F\uFF0C\u4E25\u683C\u7B26\u5408\u4EE5\u4E0B Schema\uFF1A
{
  "events": [
    {
      "action": "create" | "update" | "resolve",
      "id": "\u5982\u679C\u662Fupdate/resolve\uFF0C\u586B\u5199\u5DF2\u6709ID\uFF1B\u5982\u679C\u662Fcreate\uFF0C\u7F6E\u7A7A",
      "type": "future_plan" | "waiting_result" | "ongoing_issue" | "recent_emotion" | "health_status" | "temporary_goal" | "custom",
      "title": "\u7B80\u77ED\u6E05\u6670\u6807\u9898",
      "summary": "1-2\u53E5\u4E8B\u4EF6\u5185\u5BB9\u6458\u8981",
      "status": "pending" | "ongoing" | "waiting" | "completed",
      "importance": 1-5\u4E2D\u7684\u6574\u6570,
      "latestProgress": "\u6700\u65B0\u8FDB\u5C55\u8BF4\u660E",
      "resolutionSummary": "\u5982\u679C\u7ED3\u6848\uFF0C\u586B\u5199\u7ED3\u6848\u539F\u56E0/\u7ED3\u679C"
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
      responseMimeType: "application/json",
      timeoutMs: apiConfig?.timeoutMs || 25e3
    });
    let jsonRes = { events: [] };
    try {
      const cleanJson = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      jsonRes = JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Failed to parse extract-life-events JSON:", e);
    }
    res.json({ success: true, events: jsonRes.events || [] });
  } catch (err) {
    return handleAiEndpointError(res, err, "extract-life-events");
  }
});
app.post("/api/gemini/extract-memories", async (req, res) => {
  try {
    const { character, userMessage, recentMessages = [], existingMemories = [], userProfile, apiConfig } = req.body;
    if (!userMessage || !userMessage.trim()) {
      return res.json({ success: true, extractedMemories: [] });
    }
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
    const characterName = character?.name || "AI";
    const userName = userProfile?.name || "\u7528\u6237";
    const conversationSnippet = (recentMessages || []).slice(-6).map((m) => `${m.sender === "user" ? userName : characterName}: ${m.text || ""}`).join("\n");
    const memoriesSnippet = (existingMemories || []).map((m, i) => `${i + 1}. ${m}`).join("\n");
    const prompt = `\u4F60\u662F\u4E00\u4E2A\u9AD8\u5EA6\u667A\u80FD\u7684\u201CAI \u89D2\u8272\u957F\u671F\u8BB0\u5FC6\u63D0\u70BC\u5668 (Long-term Memory Extractor)\u201D\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u5206\u6790\u3010${userName}\u3011\u53D1\u7ED9\u3010${characterName}\u3011\u7684\u6700\u65B0\u6D88\u606F\u53CA\u4E0A\u4E0B\u6587\u5BF9\u8BDD\uFF0C\u5224\u65AD\u5176\u4E2D\u662F\u5426\u5305\u542B\u3010\u786E\u5B9E\u503C\u5F97\u957F\u671F\u4FDD\u5B58\u3011\u7684\u5173\u952E\u4E2A\u4EBA\u4FE1\u606F\u3001\u504F\u597D\u3001\u7EA6\u5B9A\u6216\u91CD\u5927\u4E8B\u9879\u3002

\u3010AI \u89D2\u8272\u5DF2\u6709\u957F\u671F\u8BB0\u5FC6\u3011\uFF1A
${memoriesSnippet || "(\u6682\u65E0\u5DF2\u6709\u957F\u671F\u8BB0\u5FC6)"}

\u3010\u6700\u65B0\u5BF9\u8BDD\u4E0A\u4E0B\u6587\u3011\uFF1A
${conversationSnippet}

\u3010\u5F53\u524D\u6700\u65B0\u8F93\u5165\u6D88\u606F\u3011\uFF1A
${userMessage}

\u3010\u8BB0\u5FC6\u63D0\u53D6\u4E0E\u5224\u65AD\u51C6\u5219\u3011\uFF1A
\u4E00\u3001\u5141\u8BB8\u63D0\u70BC\u7684\u3010\u9AD8\u4EF7\u503C\u957F\u671F\u8BB0\u5FC6\u3011\u7C7B\u522B\uFF1A
1. \u7528\u6237\u7A33\u5B9A\u7684\u4E2A\u4EBA\u504F\u597D\u4E0E\u7981\u5FCC\uFF08\u5982\uFF1A\u201C\u7528\u6237\u559C\u6B22\u5403\u8FA3\uFF0C\u53D7\u4E0D\u4E86\u7F8A\u8089\u81BB\u5473\u201D\u3001\u201C\u7528\u6237\u559C\u6B22\u770B\u60AC\u7591\u7535\u5F71\u201D\uFF09
2. \u7528\u6237\u660E\u786E\u7684\u6C9F\u901A\u4E60\u60EF\u4E0E\u8981\u6C42\uFF08\u5982\uFF1A\u201C\u7528\u6237\u5E0C\u671BAI\u8BF4\u8BDD\u6E29\u67D4\u81EA\u7136\uFF0C\u4E0D\u8981\u4F7F\u7528\u51B0\u51B7\u7684\u5B98\u65B9\u8BED\u6C14\u201D\uFF09
3. \u7528\u6237\u7684\u91CD\u8981\u7ECF\u5386\uFF08\u5982\uFF1A\u201C\u7528\u6237\u66FE\u5728\u6D77\u5916\u7559\u5B66\u4E09\u5E74\u201D\u3001\u201C\u7528\u6237\u66FE\u62C5\u4EFB\u8FC7\u8BB2\u5E08\u201D\uFF09
4. \u7528\u6237\u4E0E\u5F53\u524DAI\u7684\u91CD\u8981\u5171\u540C\u7ECF\u5386/\u4E13\u5C5E\u7EA6\u5B9A\uFF08\u5982\uFF1A\u201C\u53CC\u65B9\u7EA6\u5B9A\u6BCF\u5468\u516D\u665A\u4E0A\u804A\u5929\u201D\u3001\u201C\u7EA6\u5B9A\u4EE5\u540E\u4E00\u8D77\u53BB\u65C5\u884C\u201D\uFF09
5. \u7528\u6237\u6301\u7EED\u8FDB\u884C\u7684\u957F\u671F\u9879\u76EE/\u4EBA\u751F\u76EE\u6807\uFF08\u5982\uFF1A\u201C\u7528\u6237\u6B63\u5728\u5F00\u53D1AI\u5C0F\u624B\u673AApp\u201D\u3001\u201C\u7528\u6237\u6B63\u5728\u51C6\u5907\u8003\u7814\u201D\uFF09
6. \u91CD\u8981\u4E14\u5177\u6709\u6301\u7EED\u4EF7\u503C\u7684\u4E2A\u4EBA\u4E8B\u5B9E\uFF08\u5982\uFF1A\u201C\u7528\u6237\u7684\u751F\u65E5\u662F10\u670815\u65E5\u201D\u3001\u201C\u7528\u6237\u517B\u4E86\u4E00\u53EA\u53EB\u5E03\u4E01\u7684\u732B\u201D\uFF09
7. \u7528\u6237\u660E\u786E\u8981\u6C42AI\u8BB0\u4F4F\u7684\u4E8B\u60C5\uFF08\u5982\uFF1A\u201C\u8BB0\u4F4F\u6211\u6700\u559C\u6B22\u7684\u6B4C\u624B\u662F\u5468\u6770\u4F26\u201D\uFF09

\u4E8C\u3001\u3010\u7EDD\u5BF9\u4E0D\u8981\u63D0\u53D6\u3011\u7684\u5185\u5BB9\uFF08\u5982\u7B26\u5408\u5219\u5FC5\u987B\u8FD4\u56DE\u7A7A\u6570\u7EC4\uFF09\uFF1A
- \u666E\u901A\u65E5\u5E38\u95F2\u804A\u3001\u8BED\u6C14\u8BCD\u3001\u95EE\u5019\uFF08\u5982\uFF1A\u201C\u54C8\u54C8\u54C8\u54C8\u201D\u3001\u201C\u65E9\u5B89\u201D\u3001\u201C\u5728\u5E72\u561B\u201D\u3001\u201C\u4EB2\u4EB2\u201D\u3001\u201C\u6211\u56F0\u4E86\u201D\uFF09
- \u4E00\u6B21\u6027\u7684\u4E34\u65F6\u72B6\u6001\u6216\u968F\u53E3\u95EE\u7B54\uFF08\u5982\uFF1A\u201C\u4ECA\u5929\u4E2D\u5348\u5403\u4E86\u5305\u5B50\u201D\u3001\u201C\u5929\u6C14\u771F\u4E0D\u9519\u201D\u3001\u201C\u6211\u53BB\u6D17\u6FA1\u4E86\u201D\uFF09
- \u8C03\u4F83\u3001\u5410\u69FD\u3001\u60C5\u7EEA\u5316\u5BA3\u6CC4\u6216\u89D2\u8272\u626E\u6F14\u620F\u8C11\uFF08\u5982\uFF1A\u201C\u4F60\u4E2A\u7B28\u86CBAI\u201D\u3001\u201C\u5C11\u6765\u8FD9\u5957\u201D\uFF09
- \u4E0E\u5DF2\u6709\u957F\u671F\u8BB0\u5FC6\u91CD\u590D\u3001\u9AD8\u5EA6\u76F8\u4F3C\u6216\u5DF2\u88AB\u6DB5\u76D6\u7684\u4FE1\u606F\uFF08\u5373\u4F7F\u8868\u8FF0\u7565\u6709\u4E0D\u540C\uFF09

\u4E09\u3001\u63D0\u70BC\u683C\u5F0F\u8981\u6C42\uFF1A
1. \u8BB0\u5FC6\u5FC5\u987B\u662F\u4EE5\u201C\u7528\u6237\u201D\u5F00\u5934\u7684\u5E72\u51C0\u3001\u72EC\u7ACB\u3001\u6982\u62EC\u6027\u9648\u8FF0\u53E5\uFF0C\u5982\uFF1A\u201C\u7528\u6237\u6B63\u5728\u5F00\u53D1AI\u5C0F\u624B\u673AApp\u3002\u201D\u6216\u201C\u7528\u6237\u504F\u597D\u6E29\u67D4\u81EA\u7136\u7684\u4EA4\u6D41\u65B9\u5F0F\u3002\u201D
2. \u4E25\u7981\u5E26\u6709\u201C\u5BF9\u8BDD\u63D0\u53CA:\u201D\u3001\u201C\u7528\u6237\u8BF4\u4E86:\u201D\u3001\u201C\u7B2C1\u53E5:\u201D\u7B49\u673A\u68B0\u6216\u5143\u6587\u672C\u524D\u7F00\u3002
3. \u5982\u679C\u6CA1\u6709\u4EFB\u4F55\u7B26\u5408\u8981\u6C42\u7684\u3010\u9AD8\u4EF7\u503C\u65B0\u4FE1\u606F\u3011\uFF0C\u5FC5\u987B\u8FD4\u56DE\u7A7A\u6570\u7EC4 []\u3002

\u8BF7\u4E25\u683C\u4EC5\u8FD4\u56DE JSON \u683C\u5F0F\uFF0CSchema \u5982\u4E0B\uFF1A
{
  "extractedMemories": [
    "\u63D0\u70BC\u51FA\u7684\u8BB0\u5FC6\u6761\u76EE1"
  ]
}`;
    const rawResponse = await callAiService({
      prompt,
      model: selectedModel,
      apiKey: apiConfig?.textApiKey,
      baseUrl: apiConfig?.textBaseUrl,
      providerType: apiConfig?.textProvider,
      customHeaders: apiConfig?.customHeaders,
      responseMimeType: "application/json",
      timeoutMs: apiConfig?.timeoutMs || 25e3
    });
    let jsonRes = { extractedMemories: [] };
    try {
      const cleanJson = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      jsonRes = JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Failed to parse extract-memories JSON:", e);
    }
    res.json({ success: true, extractedMemories: jsonRes.extractedMemories || [] });
  } catch (err) {
    return handleAiEndpointError(res, err, "extract-memories");
  }
});
app.post("/api/gemini/proactive-period", async (req, res) => {
  try {
    const { character, userProfile, menstrualInfo, targetStage, apiConfig } = req.body;
    const selectedModel = character?.modelConfig?.modelName || apiConfig?.textModel || "gemini-4-hydrogen";
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
    return handleAiEndpointError(res, error, "Proactive period care");
  }
});
app.post("/api/gemini/telepathy-deduce-choice", async (req, res) => {
  try {
    const { character, question, userProfile, characterMemories, recentChats, apiConfig } = req.body;
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
    const selectedModel = apiConfig?.textModel || "gemini-4-hydrogen";
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
      { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen (\u9ED8\u8BA4\u63A8\u8350/\u9AD8\u901F\u6587\u672C)", type: "text" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (\u8F7B\u91CF\u9AD8\u914D\u989D)", type: "text" },
      { id: "gemini-4-neon", name: "Gemini 4 Neon (\u6DF1\u5EA6\u63A8\u7406/\u9700\u4ED8\u8D39Key)", type: "text" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (\u7ECF\u5178\u4F4E\u5EF6\u8FDF)", type: "text" },
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
  pruneImageCaches();
  const {
    provider,
    providerType,
    apiProtocol,
    baseUrl,
    apiKey,
    model,
    prompt,
    negativePrompt = "",
    aspectRatio = "1:1",
    size,
    quality = "standard",
    requestId,
    messageId,
    turnId,
    characterId,
    source = "AI\u751F\u56FE\u7ED8\u5236",
    timeoutMs = 75e3
  } = req.body || {};
  const safeRequestId = typeof requestId === "string" && requestId.trim() ? requestId.trim() : `imggen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const resolvedProvider = String(provider || providerType || "google_gemini").trim();
  const cleanKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const cleanBaseUrl = typeof baseUrl === "string" ? baseUrl.trim().replace(/\/+$/, "") : "";
  const effectiveProtocol = resolveEffectiveProtocol({
    provider: resolvedProvider,
    apiProtocol: typeof apiProtocol === "string" ? apiProtocol : "",
    baseUrl: cleanBaseUrl
  });
  const resolvedModel = String(
    model || (effectiveProtocol === "google_native" ? "gemini-3.1-flash-lite-image" : "dall-e-3")
  ).trim();
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const startTime = Date.now();
  if (!cleanPrompt) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: "invalid_prompt",
      error: "\u7F3A\u5C11\u6709\u6548\u7684\u56FE\u50CF\u751F\u6210\u63D0\u793A\u8BCD (prompt)",
      provider: resolvedProvider,
      model: resolvedModel,
      apiProtocol: effectiveProtocol,
      latencyMs: 0,
      requestId: safeRequestId
    });
  }
  if (!cleanKey) {
    const errMsg = "\u672A\u914D\u7F6E\u3010\u56FE\u50CFAPI\u8FDE\u63A5\u3011\u5BC6\u94A5\uFF0C\u8BF7\u524D\u5F80 \u8BBE\u7F6E \u2192 API\u8BBE\u7F6E \u2192 \u56FE\u50CFAPI\u8FDE\u63A5 \u914D\u7F6E\u72EC\u7ACB\u5BC6\u94A5\u3002";
    return res.status(400).json({
      success: false,
      statusCode: 400,
      errorType: "missing_api_key",
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
        interfaceType: "ImageGeneration",
        category: "image_generation",
        status: "failed",
        httpStatus: 400,
        requestId: safeRequestId,
        durationMs: Date.now() - startTime,
        errorType: "missing_api_key",
        error: errMsg,
        purpose: `${source} \u5931\u8D25 (\u672A\u914D\u7F6E\u5BC6\u94A5)`
      })
    });
  }
  const cached = imageGenCompletedCache.get(safeRequestId);
  if (cached && cached.expiresAt > Date.now()) {
    return res.status(cached.payload.success ? 200 : cached.payload.statusCode || 500).json(cached.payload);
  }
  const existingFlight = imageGenInFlightCache.get(safeRequestId);
  if (existingFlight) {
    try {
      const reused = await existingFlight;
      return res.status(reused.success ? 200 : reused.statusCode || 500).json(reused);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: sanitizeSensitiveText(e?.message || "\u56FE\u50CF\u751F\u6210\u8BF7\u6C42\u5F02\u5E38"),
        requestId: safeRequestId
      });
    }
  }
  const effectiveSize = (() => {
    if (typeof size === "string" && size.trim()) return size.trim();
    switch (aspectRatio) {
      case "16:9":
        return "1792x1024";
      case "9:16":
        return "1024x1792";
      default:
        return "1024x1024";
    }
  })();
  const finalPrompt = negativePrompt ? `${cleanPrompt}
(Avoid: ${String(negativePrompt).trim()})` : cleanPrompt;
  const reqTimeout = Math.min(Math.max(Number(timeoutMs) || 75e3, 15e3), 12e4);
  const runGeneration = async () => {
    if (effectiveProtocol === "google_native") {
      const googleBase = buildGoogleRestBase(cleanBaseUrl);
      const cleanModelId = resolvedModel.replace(/^models\//, "");
      const isImagenModel = /^imagen/i.test(cleanModelId);
      if (isImagenModel) {
        const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:predict`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": cleanKey,
            "User-Agent": "aistudio-build"
          },
          body: JSON.stringify({
            instances: [{ prompt: finalPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio) ? aspectRatio : "1:1"
            }
          }),
          signal: AbortSignal.timeout(reqTimeout)
        });
        const latencyMs = Date.now() - startTime;
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          let msg = errText;
          try {
            const j = JSON.parse(errText);
            msg = j.error?.message || j.message || errText;
          } catch {
          }
          const safeMsg = sanitizeSensitiveText(msg, 220);
          return {
            success: false,
            statusCode: resp.status,
            errorType: resp.status === 401 || resp.status === 403 ? "auth_error" : resp.status === 429 ? "rate_limit" : resp.status === 404 ? "model_unavailable" : "upstream_error",
            error: `Google Imagen \u751F\u56FE\u5931\u8D25 (HTTP ${resp.status}): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId
          };
        }
        const data = await resp.json();
        const pred = data?.predictions?.[0];
        const b64 = pred?.bytesBase64Encoded;
        const mime = pred?.mimeType || "image/png";
        if (!b64 || typeof b64 !== "string") {
          return {
            success: false,
            statusCode: 502,
            errorType: "no_image_returned",
            error: "Google Imagen \u63A5\u53E3\u8FD4\u56DE\u6210\u529F\uFF0C\u4F46\u672A\u5305\u542B\u6709\u6548\u56FE\u7247\u6570\u636E (bytesBase64Encoded \u4E3A\u7A7A)\u3002",
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId
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
          descriptionText: "",
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: "ImageGeneration",
            category: "image_generation",
            status: "success",
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`
          })
        };
      } else {
        const endpoint = `${googleBase}/models/${encodeURIComponent(cleanModelId)}:generateContent`;
        const genConfig = {
          responseModalities: ["TEXT", "IMAGE"]
        };
        if (["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)) {
          genConfig.imageConfig = { aspectRatio };
        }
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": cleanKey,
            "User-Agent": "aistudio-build"
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            generationConfig: genConfig
          }),
          signal: AbortSignal.timeout(reqTimeout)
        });
        const latencyMs = Date.now() - startTime;
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          let msg = errText;
          try {
            const j = JSON.parse(errText);
            msg = j.error?.message || j.message || errText;
          } catch {
          }
          const safeMsg = sanitizeSensitiveText(msg, 220);
          return {
            success: false,
            statusCode: resp.status,
            errorType: resp.status === 401 || resp.status === 403 ? "auth_error" : resp.status === 429 ? "rate_limit" : resp.status === 404 ? "model_unavailable" : /modality|responseModalities|not support/i.test(safeMsg) ? "protocol_mismatch" : "upstream_error",
            error: `Google \u539F\u751F\u751F\u56FE\u5931\u8D25 (HTTP ${resp.status}): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId
          };
        }
        const data = await resp.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let foundBase64 = "";
        let foundMime = "image/png";
        const textSnippets = [];
        for (const part of parts) {
          const inline = part?.inlineData || part?.inline_data;
          if (inline && typeof inline.data === "string" && inline.data.length > 32) {
            foundBase64 = inline.data;
            foundMime = inline.mimeType || inline.mime_type || "image/png";
          } else if (typeof part?.text === "string" && part.text.trim()) {
            textSnippets.push(part.text.trim());
          }
        }
        if (!foundBase64) {
          const returnedText = sanitizeSensitiveText(textSnippets.join(" "), 140);
          return {
            success: false,
            statusCode: 502,
            errorType: "no_image_returned",
            error: returnedText ? `\u6A21\u578B\u672A\u8FD4\u56DE\u56FE\u7247\uFF0C\u800C\u662F\u8FD4\u56DE\u4E86\u4E00\u6BB5\u6587\u5B57\uFF08${returnedText}\uFF09\u3002\u8BF7\u786E\u8BA4\u6A21\u578B ${resolvedModel} \u652F\u6301\u56FE\u50CF\u751F\u6210\u3002` : `Google \u63A5\u53E3\u8FD4\u56DE HTTP 200\uFF0C\u4F46\u672A\u5305\u542B\u6709\u6548\u56FE\u7247\u6570\u636E (inlineData \u4E3A\u7A7A)\uFF0C\u8BF7\u786E\u8BA4\u6A21\u578B ${resolvedModel} \u652F\u6301\u751F\u56FE\u3002`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs,
            requestId: safeRequestId
          };
        }
        const descText = textSnippets.join("\n").trim();
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
            interfaceType: "ImageGeneration",
            category: "image_generation",
            status: "success",
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`
          })
        };
      }
    } else {
      const endpoint = buildOpenAiEndpoint(cleanBaseUrl, "/images/generations");
      const sendOpenAiImgReq = async (includeResponseFormat) => {
        const bodyObj = {
          model: resolvedModel,
          prompt: finalPrompt,
          n: 1,
          size: effectiveSize
        };
        if (quality && resolvedModel.toLowerCase().includes("dall-e-3")) {
          bodyObj.quality = quality;
        }
        if (includeResponseFormat) {
          bodyObj.response_format = "b64_json";
        }
        return fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cleanKey}`
          },
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(reqTimeout)
        });
      };
      let resp = await sendOpenAiImgReq(true);
      if (!resp.ok && resp.status === 400) {
        const peekErr = await resp.text().catch(() => "");
        if (/response_format|unknown parameter|extra_forbidden|not supported/i.test(peekErr)) {
          resp = await sendOpenAiImgReq(false);
        } else {
          const safeMsg = sanitizeSensitiveText(peekErr, 220);
          return {
            success: false,
            statusCode: 400,
            errorType: "upstream_error",
            error: `OpenAI \u517C\u5BB9\u751F\u56FE\u5931\u8D25 (HTTP 400): ${safeMsg}`,
            provider: resolvedProvider,
            model: resolvedModel,
            apiProtocol: effectiveProtocol,
            latencyMs: Date.now() - startTime,
            requestId: safeRequestId
          };
        }
      }
      const latencyMs = Date.now() - startTime;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        let msg = errText;
        try {
          const j = JSON.parse(errText);
          msg = j.error?.message || j.message || errText;
        } catch {
        }
        const safeMsg = sanitizeSensitiveText(msg, 220);
        return {
          success: false,
          statusCode: resp.status,
          errorType: resp.status === 401 || resp.status === 403 ? "auth_error" : resp.status === 429 ? "rate_limit" : resp.status === 404 ? "model_unavailable" : "upstream_error",
          error: `OpenAI \u517C\u5BB9\u751F\u56FE\u5931\u8D25 (HTTP ${resp.status}): ${safeMsg}`,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          latencyMs,
          requestId: safeRequestId
        };
      }
      const data = await resp.json();
      const item = data?.data?.[0];
      if (item?.b64_json && typeof item.b64_json === "string" && item.b64_json.length > 32) {
        const mime = item.mime_type || "image/png";
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
          descriptionText: item.revised_prompt || "",
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: "ImageGeneration",
            category: "image_generation",
            status: "success",
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`
          })
        };
      }
      if (item?.url && typeof item.url === "string" && /^https?:\/\//i.test(item.url)) {
        return {
          success: true,
          statusCode: resp.status,
          latencyMs,
          provider: resolvedProvider,
          model: resolvedModel,
          apiProtocol: effectiveProtocol,
          mimeType: "image/png",
          imageUrl: item.url,
          revisedPrompt: item.revised_prompt || cleanPrompt,
          descriptionText: item.revised_prompt || "",
          requestId: safeRequestId,
          messageId,
          turnId,
          characterId,
          apiLog: buildApiLogObject({
            appName: source,
            provider: resolvedProvider,
            modelName: resolvedModel,
            interfaceType: "ImageGeneration",
            category: "image_generation",
            status: "success",
            httpStatus: resp.status,
            requestId: safeRequestId,
            durationMs: latencyMs,
            purpose: `${source}: ${cleanPrompt.slice(0, 36)}`
          })
        };
      }
      return {
        success: false,
        statusCode: 502,
        errorType: "no_image_returned",
        error: "\u56FE\u50CF\u63A5\u53E3\u8FD4\u56DE HTTP 200\uFF0C\u4F46\u672A\u8FD4\u56DE\u6709\u6548\u7684 b64_json \u6216\u8FDC\u7A0B\u56FE\u7247 URL\u3002",
        provider: resolvedProvider,
        model: resolvedModel,
        apiProtocol: effectiveProtocol,
        latencyMs,
        requestId: safeRequestId
      };
    }
  };
  const flightPromise = runGeneration().then((result) => {
    if (!result.apiLog && !result.success) {
      result.apiLog = buildApiLogObject({
        appName: source,
        provider: result.provider || resolvedProvider,
        modelName: result.model || resolvedModel,
        interfaceType: "ImageGeneration",
        category: "image_generation",
        status: "failed",
        httpStatus: result.statusCode || 500,
        requestId: safeRequestId,
        durationMs: result.latencyMs || Date.now() - startTime,
        errorType: result.errorType || "ImageGenerationError",
        error: result.error || "\u56FE\u50CF\u751F\u6210\u5931\u8D25",
        purpose: `${source} \u5931\u8D25`
      });
    }
    if (result.success) {
      imageGenCompletedCache.set(safeRequestId, {
        expiresAt: Date.now() + IMAGE_IDEMPOTENCY_TTL_MS,
        payload: result
      });
    }
    return result;
  }).finally(() => {
    imageGenInFlightCache.delete(safeRequestId);
  });
  imageGenInFlightCache.set(safeRequestId, flightPromise);
  try {
    const result = await flightPromise;
    return res.status(result.success ? 200 : result.statusCode || 500).json(result);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    const safeErr = sanitizeSensitiveText(
      isTimeout ? "\u56FE\u50CF\u751F\u6210\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u6216\u68C0\u67E5\u53CD\u4EE3\u54CD\u5E94\u901F\u5EA6\u3002" : err?.message || "\u56FE\u50CF\u751F\u6210\u7F51\u7EDC\u5F02\u5E38",
      240
    );
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      statusCode: isTimeout ? 504 : 500,
      errorType: isTimeout ? "timeout" : "network_error",
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
        interfaceType: "ImageGeneration",
        category: "image_generation",
        status: "failed",
        httpStatus: isTimeout ? 504 : 500,
        requestId: safeRequestId,
        durationMs: latencyMs,
        errorType: isTimeout ? "timeout" : "network_error",
        error: safeErr,
        purpose: `${source} \u5F02\u5E38`
      })
    });
  }
});
app.post("/api/provider/generate-speech", async (req, res) => {
  const { providerType, baseUrl, apiKey, model = "tts-1", text, voice = "alloy", speed = 1 } = req.body;
  const cleanKey = apiKey && apiKey.trim() || "";
  const cleanBaseUrl = baseUrl ? baseUrl.trim().replace(/\/+$/, "") : "";
  const startTime = Date.now();
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
    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      format: "mp3",
      apiLog: buildApiLogObject({
        appName: "AI\u8BED\u97F3TTS\u751F\u6210",
        modelName: model,
        interfaceType: "SpeechGeneration",
        category: "voice",
        durationMs: latencyMs,
        purpose: `\u5408\u6210\u8BED\u97F3: ${(text || "\u8BED\u97F3\u56DE\u590D").slice(0, 30)}...`
      })
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "\u8BED\u97F3\u5408\u6210\u7F51\u7EDC\u5F02\u5E38" });
  }
});
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API \u7AEF\u70B9\u672A\u627E\u5230",
    message: `\u7AEF\u70B9 ${req.method} ${req.originalUrl} \u4E0D\u5B58\u5728`
  });
});
function reportEmbeddedBackendDiagnostic(eventName, payload) {
  try {
    const reporter = globalThis.__XIAOSHOUJI_BACKEND_REPORT__;
    if (typeof reporter === "function") {
      reporter(eventName, payload);
    }
  } catch {
  }
}
async function startServer() {
  try {
    if (!IS_EMBEDDED_ANDROID) {
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
    }
    const listenHost = IS_EMBEDDED_ANDROID ? "127.0.0.1" : "0.0.0.0";
    const server = app.listen(PORT, listenHost, () => {
      console.log(
        `\u{1F4F1} Simulated Android AI Phone Server listening on ${listenHost}:${PORT}${IS_EMBEDDED_ANDROID ? " (Android embedded API-only mode)" : ""}`
      );
      reportEmbeddedBackendDiagnostic("backend_ready", {
        stage: "HTTP_LISTENING",
        host: listenHost,
        port: PORT,
        embedded: IS_EMBEDDED_ANDROID,
        message: `HTTP server listening on ${listenHost}:${PORT}`
      });
    });
    server.on("error", (err) => {
      console.error("[Server] HTTP server listen error:", err);
      reportEmbeddedBackendDiagnostic("backend_error", {
        stage: "HTTP_LISTEN_ERROR",
        fatal: true,
        name: err?.name || "Error",
        code: err?.code ? String(err.code) : void 0,
        message: err?.message || String(err),
        stack: err?.stack || ""
      });
    });
  } catch (err) {
    console.error("[Server] startServer failed:", err);
    reportEmbeddedBackendDiagnostic("backend_error", {
      stage: "START_SERVER_EXCEPTION",
      fatal: true,
      name: err?.name || "Error",
      code: err?.code ? String(err.code) : void 0,
      message: err?.message || String(err),
      stack: err?.stack || ""
    });
    throw err;
  }
}
startServer().catch((err) => {
  console.error("[Server] Unhandled startServer rejection:", err);
  reportEmbeddedBackendDiagnostic("backend_error", {
    stage: "START_SERVER_REJECTED",
    fatal: true,
    name: err?.name || "Error",
    code: err?.code ? String(err.code) : void 0,
    message: err?.message || String(err),
    stack: err?.stack || ""
  });
});
//# sourceMappingURL=server.cjs.map
