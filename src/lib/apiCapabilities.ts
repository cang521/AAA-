/**
 * apiCapabilities.ts
 * Shared capability taxonomy, provider presets (zero fake keys),
 * model capability classifier, and sensitive log sanitizer.
 */

export type ApiCapabilityCategory =
  | 'text_generation'
  | 'image_generation'
  | 'speech_generation'
  | 'image_recognition'
  | 'speech_recognition';

export type ApiProtocolType = 'google_native' | 'openai_compatible' | 'anthropic';

export interface CapabilityPresetDefinition {
  id: string;
  category: ApiCapabilityCategory;
  name: string;
  provider: string;
  apiProtocol: ApiProtocolType;
  defaultBaseUrl: string;
  defaultModel: string;
  badge: string;
  description: string;
  comingSoon?: boolean;
}

export const CAPABILITY_LABELS: Record<ApiCapabilityCategory, string> = {
  text_generation: '语言生成',
  image_generation: '图像生成',
  speech_generation: '语音生成',
  image_recognition: '图像识别',
  speech_recognition: '语音识别',
};

export const PROTOCOL_LABELS: Record<ApiProtocolType, string> = {
  google_native: 'Google 原生协议',
  openai_compatible: 'OpenAI 兼容协议',
  anthropic: 'Anthropic 协议',
};

export const TEXT_GENERATION_PRESETS: CapabilityPresetDefinition[] = [
  {
    id: 'google_text_native',
    category: 'text_generation',
    name: 'Google Gemini 原生预设',
    provider: 'google_gemini',
    apiProtocol: 'google_native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-4-hydrogen',
    badge: '官方原生',
    description: '直连 Google Gemini 原生接口或兼容 Gemini 路径的反代地址',
  },
  {
    id: 'openai_text_compat',
    category: 'text_generation',
    name: 'OpenAI 兼容语言预设',
    provider: 'openai_compatible',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    badge: 'OpenAI 兼容',
    description: '适用于 OpenAI、DeepSeek、OpenRouter、OneAPI/NewAPI 等 /v1/chat/completions 网关',
  },
  {
    id: 'custom_text_proxy',
    category: 'text_generation',
    name: '自定义反代语言预设',
    provider: 'custom',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o-mini',
    badge: '自定义反代',
    description: '手动填写自定义反代地址、密钥、协议与模型 ID',
  },
];

export const IMAGE_GENERATION_PRESETS: CapabilityPresetDefinition[] = [
  {
    id: 'google_image_native',
    category: 'image_generation',
    name: 'Google 原生生图预设',
    provider: 'google_gemini',
    apiProtocol: 'google_native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.1-flash-lite-image',
    badge: 'Google 原生',
    description: '支持 Gemini 原生生图模型 (gemini-*-image) 与 Imagen 模型，支持官方及反代地址',
  },
  {
    id: 'openai_image_compat',
    category: 'image_generation',
    name: 'OpenAI 兼容生图预设',
    provider: 'openai_compatible',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'dall-e-3',
    badge: 'OpenAI 兼容',
    description: '支持 /v1/images/generations 协议 (DALL-E 3 / gpt-image-1 / FLUX 等)',
  },
  {
    id: 'custom_image_proxy',
    category: 'image_generation',
    name: '自定义反代生图预设',
    provider: 'custom',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: '',
    defaultModel: 'flux-schnell',
    badge: '自定义反代',
    description: '适配任意支持 OpenAI 或 Google 原生生图协议的自建/中转网关',
  },
];

export const SPEECH_GENERATION_PRESETS: CapabilityPresetDefinition[] = [
  {
    id: 'google_speech_gen_placeholder',
    category: 'speech_generation',
    name: 'Google 原生语音预设 (框架预留)',
    provider: 'google_gemini',
    apiProtocol: 'google_native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.8-flash-lite-tts',
    badge: '待完整接入',
    description: '仅保留数据结构与旧配置兼容，语音合成功能待后续阶段开发',
    comingSoon: true,
  },
  {
    id: 'openai_speech_gen_placeholder',
    category: 'speech_generation',
    name: 'OpenAI 兼容语音预设 (框架预留)',
    provider: 'openai_compatible',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'tts-1',
    badge: '待完整接入',
    description: '仅保留数据结构与旧配置兼容，语音合成功能待后续阶段开发',
    comingSoon: true,
  },
];

export const IMAGE_RECOGNITION_PRESETS: CapabilityPresetDefinition[] = [
  {
    id: 'google_vision_native',
    category: 'image_recognition',
    name: 'Google 原生视觉预设',
    provider: 'google_gemini',
    apiProtocol: 'google_native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-4-hydrogen',
    badge: 'Google 视觉',
    description: '使用 Google 原生多模态 generateContent 接口进行图像理解与文字识别',
  },
  {
    id: 'openai_vision_compat',
    category: 'image_recognition',
    name: 'OpenAI 兼容视觉预设',
    provider: 'openai_compatible',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    badge: 'OpenAI 视觉',
    description: '使用标准 OpenAI /v1/chat/completions 多模态 image_url 协议识别图片',
  },
  {
    id: 'custom_vision_proxy',
    category: 'image_recognition',
    name: '自定义反代视觉预设',
    provider: 'custom',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o',
    badge: '自定义反代',
    description: '使用自定义中转/反代网关进行图片视觉识别，可随时修改协议和模型',
  },
];

export const SPEECH_RECOGNITION_PRESETS: CapabilityPresetDefinition[] = [
  {
    id: 'openai_stt_placeholder',
    category: 'speech_recognition',
    name: 'OpenAI Whisper 预设 (框架预留)',
    provider: 'openai_compatible',
    apiProtocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
    badge: '待完整接入',
    description: '语音转文字框架已预留独立配置，具体识别链路待后续阶段完整接入',
    comingSoon: true,
  },
  {
    id: 'google_stt_placeholder',
    category: 'speech_recognition',
    name: 'Google 原生语音识别预设 (框架预留)',
    provider: 'google_gemini',
    apiProtocol: 'google_native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.5-transcribe',
    badge: '待完整接入',
    description: '语音识别框架已预留独立配置，具体识别链路待后续阶段完整接入',
    comingSoon: true,
  },
];

export function getPresetsByCategory(category: ApiCapabilityCategory): CapabilityPresetDefinition[] {
  switch (category) {
    case 'text_generation':
      return TEXT_GENERATION_PRESETS;
    case 'image_generation':
      return IMAGE_GENERATION_PRESETS;
    case 'speech_generation':
      return SPEECH_GENERATION_PRESETS;
    case 'image_recognition':
      return IMAGE_RECOGNITION_PRESETS;
    case 'speech_recognition':
      return SPEECH_RECOGNITION_PRESETS;
  }
}

export interface ModelCapabilityClassification {
  primaryCategory: ApiCapabilityCategory;
  supportedCategories: ApiCapabilityCategory[];
  confidence: 'known' | 'inferred' | 'unknown';
  capabilityHint: string;
}

/**
 * Classify a model ID into the 5 capability categories without hiding unknown models.
 */
export function classifyModelCapabilities(
  modelId: string,
  metadata?: { supportedGenerationMethods?: string[]; description?: string }
): ModelCapabilityClassification {
  const id = String(modelId || '').toLowerCase();
  const methods = (metadata?.supportedGenerationMethods || []).map((m) => String(m).toLowerCase());
  const supported = new Set<ApiCapabilityCategory>();

  // 1. Explicit Image Generation models
  const isImageGen =
    id.includes('imagen') ||
    id.includes('dall-e') ||
    id.includes('dalle') ||
    id.includes('gpt-image') ||
    id.includes('flux') ||
    id.includes('midjourney') ||
    id.includes('stable-diffusion') ||
    id.includes('sdxl') ||
    id.includes('kolors') ||
    id.includes('ideogram') ||
    id.includes('recraft') ||
    id.includes('nano-banana') ||
    id.includes('-image') ||
    id.endsWith('image') ||
    methods.includes('predict');

  // 2. Explicit Speech Generation (TTS) models
  const isSpeechGen =
    id.includes('tts') ||
    id.includes('speech') ||
    id.includes('cosyvoice') ||
    id.includes('fish-speech') ||
    id.includes('eleven') ||
    id.includes('bark');

  // 3. Explicit Speech Recognition (STT / Transcription) models
  const isSpeechRec =
    id.includes('whisper') ||
    id.includes('transcribe') ||
    id.includes('asr') ||
    id.includes('sensevoice') ||
    id.includes('paraformer');

  // 4. Multimodal Vision / Image Recognition models
  const isVisionCapable =
    !isImageGen &&
    !isSpeechGen &&
    !isSpeechRec &&
    (id.includes('gpt-4o') ||
      id.includes('gpt-4.1') ||
      id.includes('gpt-4-vision') ||
      id.includes('gpt-4-turbo') ||
      id.includes('gpt-5') ||
      id.includes('gemini-4') ||
      id.includes('gemini-3') ||
      id.includes('gemini-2.5') ||
      id.includes('claude-3') ||
      id.includes('claude-4') ||
      id.includes('claude-sonnet-4') ||
      id.includes('claude-opus-4') ||
      id.includes('qwen-vl') ||
      id.includes('qwen2-vl') ||
      id.includes('qwen2.5-vl') ||
      id.includes('vl') ||
      id.includes('vision') ||
      id.includes('pixtral') ||
      id.includes('llava') ||
      id.includes('glm-4v') ||
      id.includes('internvl') ||
      id.includes('minicpm-v'));

  // 5. Text Generation models (exclude pure embedding / pure image / pure speech)
  const isPureEmbedding = id.includes('embedding') || id.includes('embed-') || id.includes('rerank');
  const isPureImageGen =
    id.includes('imagen') ||
    id.includes('dall-e') ||
    id.includes('dalle') ||
    id.includes('gpt-image') ||
    id.includes('flux') ||
    id.includes('stable-diffusion') ||
    id.includes('sdxl') ||
    id.includes('midjourney');

  if (isImageGen) supported.add('image_generation');
  if (isSpeechGen) supported.add('speech_generation');
  if (isSpeechRec) supported.add('speech_recognition');
  if (isVisionCapable) {
    supported.add('image_recognition');
    supported.add('text_generation');
  }

  if (!isPureEmbedding && !isPureImageGen && !isSpeechGen && !isSpeechRec) {
    if (
      id.includes('gpt') ||
      id.includes('gemini') ||
      id.includes('claude') ||
      id.includes('deepseek') ||
      id.includes('qwen') ||
      id.includes('llama') ||
      id.includes('mistral') ||
      id.includes('glm') ||
      id.includes('moonshot') ||
      id.includes('kimi') ||
      id.includes('yi-') ||
      id.includes('doubao') ||
      id.includes('o1') ||
      id.includes('o3') ||
      id.includes('o4') ||
      methods.includes('generatecontent')
    ) {
      supported.add('text_generation');
    }
  }

  if (supported.size === 0) {
    return {
      primaryCategory: 'text_generation',
      supportedCategories: ['text_generation', 'image_generation', 'image_recognition', 'speech_generation', 'speech_recognition'],
      confidence: 'unknown',
      capabilityHint: '能力未明确标注，可能支持，以实际测试为准',
    };
  }

  let primaryCategory: ApiCapabilityCategory = 'text_generation';
  if (isImageGen && !isVisionCapable) {
    primaryCategory = 'image_generation';
  } else if (isSpeechRec) {
    primaryCategory = 'speech_recognition';
  } else if (isSpeechGen) {
    primaryCategory = 'speech_generation';
  } else if (isVisionCapable && (id.includes('-vl') || id.includes('vision') || id.includes('4v'))) {
    primaryCategory = 'image_recognition';
  } else if (supported.has('text_generation')) {
    primaryCategory = 'text_generation';
  }

  const list = Array.from(supported);
  const labelText = list.map((c) => CAPABILITY_LABELS[c]).join(' / ');
  return {
    primaryCategory,
    supportedCategories: list,
    confidence: isImageGen || isSpeechGen || isSpeechRec || isVisionCapable ? 'known' : 'inferred',
    capabilityHint: `可能支持：${labelText}`,
  };
}

/**
 * Redact API keys, Bearer tokens, query keys, and raw base64 data URIs from any log or error string.
 */
export function sanitizeSensitiveText(input: unknown, maxLength = 320): string {
  if (input === null || input === undefined) return '';
  let text = typeof input === 'string' ? input : String(input);

  // Strip base64 data URLs completely
  text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{24,}/g, '[已脱敏图片数据]');
  text = text.replace(/data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{24,}/g, '[已脱敏音频数据]');

  // Strip query string ?key=... or &key=...
  text = text.replace(/([?&](?:key|api_key|apikey|token)=)([^&\s"']+)/gi, '$1***');

  // Strip Bearer tokens
  text = text.replace(/(Bearer\s+)[A-Za-z0-9._\-+=/]{8,}/gi, '$1***');

  // Strip common provider keys (Google AIza..., OpenAI sk-..., Anthropic sk-ant-...)
  text = text.replace(/\bAIza[0-9A-Za-z\-_]{16,}\b/g, 'AIza***');
  text = text.replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9\-_]{12,}\b/g, 'sk-***');

  // Strip long opaque base64-like payloads (> 220 continuous base64 chars)
  text = text.replace(/[A-Za-z0-9+/]{220,}={0,2}/g, '[已省略长编码内容]');

  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '...';
  }
  return text;
}

/**
 * Mask an API key safely for UI display (never returns full key).
 */
export function maskApiKey(key?: string): string {
  if (!key || !key.trim()) return '';
  const k = key.trim();
  if (k.length <= 6) return '***';
  return `••••${k.slice(-4)}`;
}

/**
 * Infer effective protocol from explicit apiProtocol, provider, and baseUrl.
 */
export function resolveEffectiveProtocol(config: {
  provider?: string;
  apiProtocol?: string;
  baseUrl?: string;
}): ApiProtocolType {
  const proto = (config.apiProtocol || '').toLowerCase().trim();
  if (proto === 'google_native' || proto === 'gemini_native' || proto === 'google') {
    return 'google_native';
  }
  if (proto === 'openai_compatible' || proto === 'openai') {
    return 'openai_compatible';
  }
  if (proto === 'anthropic') {
    return 'anthropic';
  }

  const prov = (config.provider || '').toLowerCase().trim();
  const base = (config.baseUrl || '').toLowerCase().trim();

  if (prov === 'anthropic') return 'anthropic';
  if (
    prov === 'openai' ||
    prov === 'openai_compatible' ||
    prov === 'deepseek' ||
    prov === 'openrouter' ||
    prov === 'groq' ||
    prov === 'siliconflow' ||
    prov === 'ollama'
  ) {
    return 'openai_compatible';
  }

  if (base.includes('generativelanguage.googleapis.com') || base.includes('/v1beta')) {
    return 'google_native';
  }
  if (base && (base.includes('/v1') || base.includes('openai') || base.includes('deepseek') || base.includes('openrouter'))) {
    return 'openai_compatible';
  }
  if (prov === 'google_gemini') {
    return 'google_native';
  }
  return 'openai_compatible';
}

export interface ResolvedTextGenerationConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerType: string;
  apiProtocol: ApiProtocolType;
  customHeaders?: Record<string, string>;
  timeoutMs: number;
}

/**
 * Unified text generation configuration resolution.
 * Prioritizes canonical textApiConfig / textGeneration object while falling back to legacy flat fields.
 * Respects character model override if specified.
 */
export function resolveTextGenerationConfig(
  apiConfig?: any,
  characterModelConfig?: any
): ResolvedTextGenerationConfig {
  const nestedText =
    apiConfig?.textApiConfig ||
    apiConfig?.textGeneration ||
    apiConfig?.apiSettings?.textGeneration;

  const pickField = (...candidates: any[]): string => {
    for (const val of candidates) {
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
    }
    for (const val of candidates) {
      if (typeof val === 'string') {
        return val.trim();
      }
    }
    return '';
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
    'google_gemini'
  );

  const charModel = pickField(
    characterModelConfig?.modelName,
    characterModelConfig?.model
  );

  const model =
    charModel ||
    pickField(
      nestedText?.model,
      apiConfig?.textModel,
      apiConfig?.model,
      'gemini-4-hydrogen'
    );

  const rawProtocol = pickField(
    nestedText?.apiProtocol,
    apiConfig?.textApiProtocol,
    apiConfig?.apiProtocol
  );

  const apiProtocol = resolveEffectiveProtocol({
    apiProtocol: rawProtocol,
    provider: providerType,
    baseUrl,
  });

  const customHeaders =
    (nestedText?.customHeaders && typeof nestedText.customHeaders === 'object'
      ? nestedText.customHeaders
      : undefined) ||
    (apiConfig?.customHeaders && typeof apiConfig.customHeaders === 'object'
      ? apiConfig.customHeaders
      : undefined);

  const timeoutMs =
    Number(apiConfig?.timeoutMs) > 0
      ? Number(apiConfig.timeoutMs)
      : Number(nestedText?.timeoutMs) > 0
      ? Number(nestedText.timeoutMs)
      : 45000;

  return {
    apiKey,
    baseUrl,
    model,
    providerType,
    apiProtocol,
    customHeaders,
    timeoutMs,
  };
}
