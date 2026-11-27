/**
 * apiConfigStore.ts
 * Unified 4-group / 5-config API settings store with non-destructive v1 -> v2 migration.
 *
 * Groups:
 * 1. textGeneration   (API连接 - 语言生成)
 * 2. imageGeneration  (图像API连接 - 图像生成)
 * 3. speechGeneration (语音API连接 - 语音生成)
 * 4. recognition:
 *    - recognition.image  (识别API - 图像识别)
 *    - recognition.speech (识别API - 语音识别)
 *
 * Strictly guarantees:
 * - Non-destructive migration from legacy { text, image, voice } structure.
 * - Never overwrites non-empty user fields.
 * - imageGeneration and recognition.image are 100% independent and NEVER share or overwrite each other.
 * - Backward-compatible aliases (text/image/voice) remain synced for legacy callers.
 */

import { resolveEffectiveProtocol } from './apiCapabilities';
import { ThinkingOutputSettings } from '../types';

export interface ApiConnectionConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiProtocol: string;
  presetId?: string;
  thinkingConfig?: ThinkingOutputSettings;
  customHeaders?: Record<string, string>;
}

export interface RecognitionApiSettings {
  image: ApiConnectionConfig;
  speech: ApiConnectionConfig;
}

export interface ApiSettings {
  schemaVersion?: number;
  textGeneration: ApiConnectionConfig;
  imageGeneration: ApiConnectionConfig;
  speechGeneration: ApiConnectionConfig;
  recognition: RecognitionApiSettings;
  // Legacy compatibility mirrors (read-synced with textGeneration / imageGeneration / speechGeneration)
  text: ApiConnectionConfig;
  image: ApiConnectionConfig;
  voice: ApiConnectionConfig;
}

export const STORAGE_KEY_API_SETTINGS_V1 = 'ai_phone_api_settings_v1';
export const CURRENT_API_SETTINGS_SCHEMA_VERSION = 2;

export const DEFAULT_TEXT_GENERATION_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-4-hydrogen',
  apiProtocol: 'google_native',
  presetId: 'google_text_native',
};

export const DEFAULT_IMAGE_GENERATION_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.1-flash-lite-image',
  apiProtocol: 'google_native',
  presetId: 'google_image_native',
};

export const DEFAULT_SPEECH_GENERATION_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.8-flash-lite-tts',
  apiProtocol: 'google_native',
  presetId: 'google_speech_gen_placeholder',
};

export const DEFAULT_IMAGE_RECOGNITION_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-4-hydrogen',
  apiProtocol: 'google_native',
  presetId: 'google_vision_native',
};

export const DEFAULT_SPEECH_RECOGNITION_CONNECTION: ApiConnectionConfig = {
  provider: 'openai_compatible',
  baseUrl: '',
  apiKey: '',
  model: 'whisper-1',
  apiProtocol: 'openai_compatible',
  presetId: 'openai_stt_placeholder',
};

// Backward-compatible constant exports
export const DEFAULT_TEXT_CONNECTION = DEFAULT_TEXT_GENERATION_CONNECTION;
export const DEFAULT_IMAGE_CONNECTION = DEFAULT_IMAGE_GENERATION_CONNECTION;
export const DEFAULT_VOICE_CONNECTION = DEFAULT_SPEECH_GENERATION_CONNECTION;

function sanitizeThinkingConfig(raw: any): ThinkingOutputSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const mode = ['auto', 'on', 'off', 'custom'].includes(raw.mode) ? raw.mode : 'auto';
  const out: ThinkingOutputSettings = {
    mode,
  };
  if (['minimal', 'low', 'medium', 'high'].includes(raw.reasoningEffort)) {
    out.reasoningEffort = raw.reasoningEffort;
  }
  if (typeof raw.thinkingBudget === 'number' && Number.isFinite(raw.thinkingBudget)) {
    out.thinkingBudget = Math.max(0, Math.round(raw.thinkingBudget));
  }
  if (typeof raw.customParamsJson === 'string') {
    out.customParamsJson = raw.customParamsJson;
  }
  if (typeof raw.useStreaming === 'boolean') {
    out.useStreaming = raw.useStreaming;
  }
  return out;
}

function cloneConn(c: ApiConnectionConfig): ApiConnectionConfig {
  return {
    provider: c.provider,
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    apiProtocol: c.apiProtocol,
    ...(c.presetId ? { presetId: c.presetId } : {}),
    ...(c.thinkingConfig ? { thinkingConfig: { ...c.thinkingConfig } } : {}),
    ...(c.customHeaders ? { customHeaders: { ...c.customHeaders } } : {}),
  };
}

export function createDefaultApiSettings(): ApiSettings {
  const textGeneration = cloneConn(DEFAULT_TEXT_GENERATION_CONNECTION);
  const imageGeneration = cloneConn(DEFAULT_IMAGE_GENERATION_CONNECTION);
  const speechGeneration = cloneConn(DEFAULT_SPEECH_GENERATION_CONNECTION);
  const recImage = cloneConn(DEFAULT_IMAGE_RECOGNITION_CONNECTION);
  const recSpeech = cloneConn(DEFAULT_SPEECH_RECOGNITION_CONNECTION);
  return {
    schemaVersion: CURRENT_API_SETTINGS_SCHEMA_VERSION,
    textGeneration,
    imageGeneration,
    speechGeneration,
    recognition: {
      image: recImage,
      speech: recSpeech,
    },
    text: cloneConn(textGeneration),
    image: cloneConn(imageGeneration),
    voice: cloneConn(speechGeneration),
  };
}

export const DEFAULT_API_SETTINGS: ApiSettings = createDefaultApiSettings();

function sanitizeConnection(
  primary: any,
  legacyFallback: any,
  defaultConn: ApiConnectionConfig,
  options?: { upgradeOldGeminiTextAlias?: boolean }
): ApiConnectionConfig {
  const src = primary && typeof primary === 'object' ? primary : null;
  const leg = legacyFallback && typeof legacyFallback === 'object' ? legacyFallback : null;

  const pickNonEmptyString = (a: unknown, b: unknown, fallback: string): string => {
    if (typeof a === 'string' && a.trim().length > 0) return a;
    if (typeof b === 'string' && b.trim().length > 0) return b;
    if (typeof a === 'string') return a;
    if (typeof b === 'string') return b;
    return fallback;
  };

  // If primary object exists explicitly (v2), preserve intentional user edits (including explicit empty string)
  // while falling back to legacy ONLY when primary object was absent (first-time v1 -> v2 migration).
  const pickField = (field: keyof ApiConnectionConfig, fallback: string): string => {
    if (src) {
      if (typeof src[field] === 'string') return src[field];
      if (leg && typeof leg[field] === 'string') return leg[field];
      return fallback;
    }
    return pickNonEmptyString(undefined, leg?.[field], fallback);
  };

  const provider = pickField('provider', defaultConn.provider) || defaultConn.provider;
  const baseUrl = pickField('baseUrl', defaultConn.baseUrl);
  const apiKey = pickField('apiKey', defaultConn.apiKey);
  let model = pickField('model', defaultConn.model);
  const rawProtocol = pickField('apiProtocol', '');
  const apiProtocol = rawProtocol.trim()
    ? rawProtocol.trim()
    : resolveEffectiveProtocol({ provider, baseUrl });
  const presetId =
    typeof src?.presetId === 'string'
      ? src.presetId
      : typeof leg?.presetId === 'string'
      ? leg.presetId
      : defaultConn.presetId;

  if (options?.upgradeOldGeminiTextAlias) {
    const isOfficialGemini =
      provider === 'google_gemini' && (!baseUrl.trim() || baseUrl.includes('googleapis.com'));
    if (isOfficialGemini && (model === 'gemini-3.6-flash' || model === 'gemini-3.8-flash')) {
      model = 'gemini-4-hydrogen';
    }
  }

  const thinkingConfig =
    sanitizeThinkingConfig(src?.thinkingConfig) ??
    sanitizeThinkingConfig(leg?.thinkingConfig) ??
    (defaultConn.thinkingConfig ? { ...defaultConn.thinkingConfig } : undefined);

  const customHeaders =
    src?.customHeaders && typeof src.customHeaders === 'object' && !Array.isArray(src.customHeaders)
      ? { ...src.customHeaders }
      : leg?.customHeaders && typeof leg.customHeaders === 'object' && !Array.isArray(leg.customHeaders)
      ? { ...leg.customHeaders }
      : undefined;

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    apiProtocol,
    ...(presetId ? { presetId } : {}),
    ...(thinkingConfig ? { thinkingConfig } : {}),
    ...(customHeaders ? { customHeaders } : {}),
  };
}

/**
 * Pure migration/normalization function: transforms any v1 or partial v2 payload into
 * a complete, independent 5-config ApiSettings object without losing existing non-empty values.
 */
export function migrateApiSettingsObject(parsed: any): { settings: ApiSettings; didMigrate: boolean } {
  if (!parsed || typeof parsed !== 'object') {
    return { settings: createDefaultApiSettings(), didMigrate: false };
  }

  const isLegacyV1 =
    !parsed.textGeneration ||
    !parsed.imageGeneration ||
    !parsed.speechGeneration ||
    !parsed.recognition ||
    !parsed.recognition.image ||
    !parsed.recognition.speech ||
    Number(parsed.schemaVersion || 1) < CURRENT_API_SETTINGS_SCHEMA_VERSION;

  const textGeneration = sanitizeConnection(
    parsed.textGeneration,
    parsed.text,
    DEFAULT_TEXT_GENERATION_CONNECTION,
    { upgradeOldGeminiTextAlias: true }
  );

  const imageGeneration = sanitizeConnection(
    parsed.imageGeneration,
    parsed.image,
    DEFAULT_IMAGE_GENERATION_CONNECTION
  );

  const speechGeneration = sanitizeConnection(
    parsed.speechGeneration,
    parsed.voice,
    DEFAULT_SPEECH_GENERATION_CONNECTION
  );

  // IMPORTANT: recognition.image and recognition.speech MUST NEVER copy from imageGeneration/speechGeneration
  const recImage = sanitizeConnection(
    parsed.recognition?.image,
    parsed.imageRecognitionApiConfig,
    DEFAULT_IMAGE_RECOGNITION_CONNECTION
  );

  const recSpeech = sanitizeConnection(
    parsed.recognition?.speech,
    parsed.speechRecognitionApiConfig,
    DEFAULT_SPEECH_RECOGNITION_CONNECTION
  );

  const settings: ApiSettings = {
    schemaVersion: CURRENT_API_SETTINGS_SCHEMA_VERSION,
    textGeneration,
    imageGeneration,
    speechGeneration,
    recognition: {
      image: recImage,
      speech: recSpeech,
    },
    // Sync legacy mirrors cleanly
    text: cloneConn(textGeneration),
    image: cloneConn(imageGeneration),
    voice: cloneConn(speechGeneration),
  };

  return { settings, didMigrate: isLegacyV1 };
}

export function loadApiSettings(): ApiSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return createDefaultApiSettings();
    }
    const raw = localStorage.getItem(STORAGE_KEY_API_SETTINGS_V1);
    if (!raw) {
      return createDefaultApiSettings();
    }
    const parsed = JSON.parse(raw);
    const { settings, didMigrate } = migrateApiSettingsObject(parsed);

    // Non-destructively persist migrated v2 structure once so recognition.* exists on disk
    if (didMigrate) {
      try {
        localStorage.setItem(STORAGE_KEY_API_SETTINGS_V1, JSON.stringify(settings));
      } catch {
        // Ignore quota error during read migration
      }
    }

    return settings;
  } catch (e) {
    console.error('[apiConfigStore] Failed to load api settings:', e);
    return createDefaultApiSettings();
  }
}

export function saveApiSettings(input: Partial<ApiSettings>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!input || typeof input !== 'object') return;

    const existing = loadApiSettings();

    // Canonical v2 fields take priority; legacy text/image/voice supported only if caller didn't pass v2
    const nextText = sanitizeConnection(
      input.textGeneration ?? input.text,
      existing.textGeneration,
      DEFAULT_TEXT_GENERATION_CONNECTION
    );
    const nextImage = sanitizeConnection(
      input.imageGeneration ?? input.image,
      existing.imageGeneration,
      DEFAULT_IMAGE_GENERATION_CONNECTION
    );
    const nextSpeech = sanitizeConnection(
      input.speechGeneration ?? input.voice,
      existing.speechGeneration,
      DEFAULT_SPEECH_GENERATION_CONNECTION
    );
    const nextRecImage = sanitizeConnection(
      input.recognition?.image,
      existing.recognition.image,
      DEFAULT_IMAGE_RECOGNITION_CONNECTION
    );
    const nextRecSpeech = sanitizeConnection(
      input.recognition?.speech,
      existing.recognition.speech,
      DEFAULT_SPEECH_RECOGNITION_CONNECTION
    );

    const sanitized: ApiSettings = {
      schemaVersion: CURRENT_API_SETTINGS_SCHEMA_VERSION,
      textGeneration: nextText,
      imageGeneration: nextImage,
      speechGeneration: nextSpeech,
      recognition: {
        image: nextRecImage,
        speech: nextRecSpeech,
      },
      text: cloneConn(nextText),
      image: cloneConn(nextImage),
      voice: cloneConn(nextSpeech),
    };

    localStorage.setItem(STORAGE_KEY_API_SETTINGS_V1, JSON.stringify(sanitized));
  } catch (e) {
    console.error('[apiConfigStore] Failed to save api settings:', e);
  }
}

/**
 * Merge imported API settings non-destructively:
 * - Preserves existing local non-empty API keys when imported keys are empty or redacted (*** / ••••)
 * - Imports all 5 independent configurations safely
 */
export function mergeImportedApiSettings(imported: any): ApiSettings {
  const existing = loadApiSettings();
  if (!imported || typeof imported !== 'object') return existing;

  const isRedactedKey = (val: unknown): boolean => {
    if (typeof val !== 'string') return true;
    const t = val.trim();
    if (!t) return true;
    if (t.includes('***') || t.includes('••••') || t === '[REDACTED]') return true;
    return false;
  };

  const mergeOne = (
    incoming: any,
    fallbackIncoming: any,
    current: ApiConnectionConfig,
    def: ApiConnectionConfig
  ): ApiConnectionConfig => {
    const src = incoming && typeof incoming === 'object' ? incoming : fallbackIncoming;
    if (!src || typeof src !== 'object') return cloneConn(current);

    const nextKey = !isRedactedKey(src.apiKey) ? String(src.apiKey) : current.apiKey;
    const nextBaseUrl =
      typeof src.baseUrl === 'string' && src.baseUrl.trim() ? src.baseUrl : current.baseUrl;
    const nextProvider =
      typeof src.provider === 'string' && src.provider.trim() ? src.provider : current.provider || def.provider;
    const nextModel =
      typeof src.model === 'string' && src.model.trim() ? src.model : current.model || def.model;
    const nextProtocol =
      typeof src.apiProtocol === 'string' && src.apiProtocol.trim()
        ? src.apiProtocol
        : current.apiProtocol || resolveEffectiveProtocol({ provider: nextProvider, baseUrl: nextBaseUrl });

    return {
      provider: nextProvider,
      baseUrl: nextBaseUrl,
      apiKey: nextKey,
      model: nextModel,
      apiProtocol: nextProtocol,
      presetId: typeof src.presetId === 'string' ? src.presetId : current.presetId,
      ...(sanitizeThinkingConfig(src.thinkingConfig) || current.thinkingConfig
        ? { thinkingConfig: sanitizeThinkingConfig(src.thinkingConfig) || current.thinkingConfig }
        : {}),
      ...(src.customHeaders && typeof src.customHeaders === 'object'
        ? { customHeaders: { ...src.customHeaders } }
        : current.customHeaders
        ? { customHeaders: { ...current.customHeaders } }
        : {}),
    };
  };

  // Support both ApiSettings (v2/v1) and ApiConfig (engine flat/nested) shapes
  const srcRoot = imported.apiSettings && typeof imported.apiSettings === 'object' ? imported.apiSettings : imported;

  const merged: ApiSettings = {
    schemaVersion: CURRENT_API_SETTINGS_SCHEMA_VERSION,
    textGeneration: mergeOne(
      srcRoot.textGeneration,
      srcRoot.text || imported.textApiConfig || (imported.textBaseUrl || imported.textModel || imported.textApiKey
        ? {
            provider: imported.textProvider,
            baseUrl: imported.textBaseUrl,
            apiKey: imported.textApiKey,
            model: imported.textModel,
            apiProtocol: imported.textApiProtocol,
          }
        : null),
      existing.textGeneration,
      DEFAULT_TEXT_GENERATION_CONNECTION
    ),
    imageGeneration: mergeOne(
      srcRoot.imageGeneration,
      srcRoot.image || imported.imageApiConfig || (imported.imageBaseUrl || imported.imageModel || imported.imageApiKey
        ? {
            provider: imported.imageProvider,
            baseUrl: imported.imageBaseUrl,
            apiKey: imported.imageApiKey,
            model: imported.imageModel,
            apiProtocol: imported.imageApiProtocol,
          }
        : null),
      existing.imageGeneration,
      DEFAULT_IMAGE_GENERATION_CONNECTION
    ),
    speechGeneration: mergeOne(
      srcRoot.speechGeneration,
      srcRoot.voice || imported.voiceApiConfig || (imported.voiceBaseUrl || imported.voiceModel || imported.voiceApiKey
        ? {
            provider: imported.voiceProvider,
            baseUrl: imported.voiceBaseUrl,
            apiKey: imported.voiceApiKey,
            model: imported.voiceModel,
            apiProtocol: imported.voiceApiProtocol,
          }
        : null),
      existing.speechGeneration,
      DEFAULT_SPEECH_GENERATION_CONNECTION
    ),
    recognition: {
      image: mergeOne(
        srcRoot.recognition?.image,
        imported.imageRecognitionApiConfig || (imported.imageRecognitionBaseUrl || imported.imageRecognitionModel || imported.imageRecognitionApiKey
          ? {
              provider: imported.imageRecognitionProvider,
              baseUrl: imported.imageRecognitionBaseUrl,
              apiKey: imported.imageRecognitionApiKey,
              model: imported.imageRecognitionModel,
              apiProtocol: imported.imageRecognitionApiProtocol,
            }
          : null),
        existing.recognition.image,
        DEFAULT_IMAGE_RECOGNITION_CONNECTION
      ),
      speech: mergeOne(
        srcRoot.recognition?.speech,
        imported.speechRecognitionApiConfig || (imported.speechRecognitionBaseUrl || imported.speechRecognitionModel || imported.speechRecognitionApiKey
          ? {
              provider: imported.speechRecognitionProvider,
              baseUrl: imported.speechRecognitionBaseUrl,
              apiKey: imported.speechRecognitionApiKey,
              model: imported.speechRecognitionModel,
              apiProtocol: imported.speechRecognitionApiProtocol,
            }
          : null),
        existing.recognition.speech,
        DEFAULT_SPEECH_RECOGNITION_CONNECTION
      ),
    },
    text: cloneConn(existing.textGeneration),
    image: cloneConn(existing.imageGeneration),
    voice: cloneConn(existing.speechGeneration),
  };

  merged.text = cloneConn(merged.textGeneration);
  merged.image = cloneConn(merged.imageGeneration);
  merged.voice = cloneConn(merged.speechGeneration);

  saveApiSettings(merged);
  return loadApiSettings();
}

export function clearApiSettings(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_API_SETTINGS_V1);
  } catch (e) {
    console.error('[apiConfigStore] Failed to clear api settings:', e);
  }
}

/**
 * 供系统 AI 聊天 / 生图 / 识图 / 线下模式等引擎读取最新 5 套独立配置
 */
export function getApiConfigForEngine() {
  const s = loadApiSettings();
  return {
    apiSettings: s,
    textApiConfig: s.textGeneration,
    imageApiConfig: s.imageGeneration,
    voiceApiConfig: s.speechGeneration,
    imageRecognitionApiConfig: s.recognition.image,
    speechRecognitionApiConfig: s.recognition.speech,
    // Flat compatibility fields
    textApiKey: s.textGeneration.apiKey,
    textBaseUrl: s.textGeneration.baseUrl,
    textModel: s.textGeneration.model,
    textProvider: s.textGeneration.provider,
    textApiProtocol: s.textGeneration.apiProtocol,
    imageApiKey: s.imageGeneration.apiKey,
    imageBaseUrl: s.imageGeneration.baseUrl,
    imageModel: s.imageGeneration.model,
    imageProvider: s.imageGeneration.provider,
    imageApiProtocol: s.imageGeneration.apiProtocol,
    voiceApiKey: s.speechGeneration.apiKey,
    voiceBaseUrl: s.speechGeneration.baseUrl,
    voiceModel: s.speechGeneration.model,
    voiceProvider: s.speechGeneration.provider,
    voiceApiProtocol: s.speechGeneration.apiProtocol,
    imageRecognitionApiKey: s.recognition.image.apiKey,
    imageRecognitionBaseUrl: s.recognition.image.baseUrl,
    imageRecognitionModel: s.recognition.image.model,
    imageRecognitionProvider: s.recognition.image.provider,
    imageRecognitionApiProtocol: s.recognition.image.apiProtocol,
    speechRecognitionApiKey: s.recognition.speech.apiKey,
    speechRecognitionBaseUrl: s.recognition.speech.baseUrl,
    speechRecognitionModel: s.recognition.speech.model,
    speechRecognitionProvider: s.recognition.speech.provider,
    speechRecognitionApiProtocol: s.recognition.speech.apiProtocol,
  };
}
