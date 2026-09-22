export interface ApiConnectionConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiProtocol?: string;
}

export interface ApiSettings {
  text: ApiConnectionConfig;
  image: ApiConnectionConfig;
  voice: ApiConnectionConfig;
}

export const STORAGE_KEY_API_SETTINGS_V1 = 'ai_phone_api_settings_v1';

export const DEFAULT_TEXT_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-3.6-flash',
};

export const DEFAULT_IMAGE_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'imagen-3.0-generate-002',
};

export const DEFAULT_VOICE_CONNECTION: ApiConnectionConfig = {
  provider: 'google_gemini',
  baseUrl: '',
  apiKey: '',
  model: 'gemini-2.5-flash',
};

export const DEFAULT_API_SETTINGS: ApiSettings = {
  text: DEFAULT_TEXT_CONNECTION,
  image: DEFAULT_IMAGE_CONNECTION,
  voice: DEFAULT_VOICE_CONNECTION,
};

export function loadApiSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_API_SETTINGS_V1);
    if (!raw) {
      return JSON.parse(JSON.stringify(DEFAULT_API_SETTINGS));
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_API_SETTINGS));
    }

    const parseSection = (section: any, defaultConn: ApiConnectionConfig): ApiConnectionConfig => {
      if (!section || typeof section !== 'object') {
        return { ...defaultConn };
      }
      return {
        provider: typeof section.provider === 'string' ? section.provider : defaultConn.provider,
        baseUrl: typeof section.baseUrl === 'string' ? section.baseUrl : defaultConn.baseUrl,
        apiKey: typeof section.apiKey === 'string' ? section.apiKey : defaultConn.apiKey,
        model: typeof section.model === 'string' ? section.model : defaultConn.model,
        apiProtocol: typeof section.apiProtocol === 'string' ? section.apiProtocol : undefined,
      };
    };

    return {
      text: parseSection(parsed.text, DEFAULT_TEXT_CONNECTION),
      image: parseSection(parsed.image, DEFAULT_IMAGE_CONNECTION),
      voice: parseSection(parsed.voice, DEFAULT_VOICE_CONNECTION),
    };
  } catch (e) {
    console.error('Failed to load api settings', e);
    return JSON.parse(JSON.stringify(DEFAULT_API_SETTINGS));
  }
}

export function saveApiSettings(settings: ApiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_API_SETTINGS_V1, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save api settings', e);
  }
}

export function clearApiSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_API_SETTINGS_V1);
  } catch (e) {
    console.error('Failed to clear api settings', e);
  }
}

/**
 * 供系统 AI 聊天/应用引擎等底层发送请求时直接读取最新配置
 */
export function getApiConfigForEngine() {
  const s = loadApiSettings();
  return {
    textApiConfig: s.text,
    imageApiConfig: s.image,
    voiceApiConfig: s.voice,
    textApiKey: s.text.apiKey,
    textBaseUrl: s.text.baseUrl,
    textModel: s.text.model,
    textProvider: s.text.provider,
    textApiProtocol: s.text.apiProtocol,
    imageApiKey: s.image.apiKey,
    imageBaseUrl: s.image.baseUrl,
    imageModel: s.image.model,
    imageProvider: s.image.provider,
    imageApiProtocol: s.image.apiProtocol,
    voiceApiKey: s.voice.apiKey,
    voiceBaseUrl: s.voice.baseUrl,
    voiceModel: s.voice.model,
    voiceProvider: s.voice.provider,
    voiceApiProtocol: s.voice.apiProtocol,
  };
}
