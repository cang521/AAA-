import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { pingBackendHealth } from '../../lib/localBackend';
import {
  ProviderType,
  RemoteModelItem,
  ConnectionTestResult,
  ModelFetchResult,
  ModelTestResult,
  ThinkingDiagnosticResult,
  ThinkingOutputMode,
  ReasoningEffortLevel,
  ThinkingOutputSettings,
} from '../../types';
import {
  ApiSettings,
  ApiConnectionConfig,
} from '../../lib/apiConfigStore';
import {
  ApiCapabilityCategory,
  CAPABILITY_LABELS,
  CapabilityPresetDefinition,
  getPresetsByCategory,
  maskApiKey,
  sanitizeSensitiveText,
  parseCustomThinkingParamsJson,
} from '../../lib/apiCapabilities';
import {
  testImageGenerationConnection,
  testImageRecognitionConnection,
  ImageGenerationTestResult,
  ImageRecognitionTestResult,
} from '../../lib/image/imageCapabilitiesService';
import { compressImage } from '../../lib/imageCompressor';
import {
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Plus,
  Image as ImageIcon,
  ScanSearch,
  Upload,
  Clock,
  Loader2,
  Sparkles,
  Info,
  Brain,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { StableTextInput } from '../common/StableTextInput';

export type TopLevelApiGroup = 'text' | 'image' | 'voice' | 'recognition';
export type RecognitionSubTab = 'image' | 'speech';

export interface ProviderPreset {
  id: ProviderType;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  badge: string;
  description: string;
}

export interface CustomPresetItem {
  id: string;
  category: ApiCapabilityCategory;
  name: string;
  provider?: string;
  apiProtocol?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  createdAt: number;
}

const STORAGE_KEY_CUSTOM_PRESETS_LEGACY = 'phone_user_custom_api_presets';
const STORAGE_KEY_CUSTOM_PRESETS_V2 = 'phone_user_custom_api_presets_v2';

function loadSavedCustomPresets(): CustomPresetItem[] {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (Array.isArray(parsed)) return parsed;
    }
    // Non-destructive one-time read of legacy presets (migrated to text_generation)
    const rawLegacy = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS_LEGACY);
    if (rawLegacy) {
      const parsedLegacy = JSON.parse(rawLegacy);
      if (Array.isArray(parsedLegacy)) {
        return parsedLegacy.map((item: any) => ({
          id: String(item.id || 'custom_' + Date.now()),
          category: (item.category as ApiCapabilityCategory) || 'text_generation',
          name: String(item.name || '自定义预设'),
          provider: item.provider || 'custom',
          apiProtocol: item.apiProtocol || 'openai_compatible',
          baseUrl: String(item.baseUrl || ''),
          apiKey: item.apiKey || '',
          model: String(item.model || ''),
          createdAt: Number(item.createdAt || Date.now()),
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

function persistCustomPresets(items: CustomPresetItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS_V2, JSON.stringify(items));
  } catch (e) {
    console.error('[ApiSettingsPanel] Failed to save custom presets:', e);
  }
}

export function resolveActiveSlot(
  group: TopLevelApiGroup,
  recSubTab: RecognitionSubTab
): ApiCapabilityCategory {
  if (group === 'text') return 'text_generation';
  if (group === 'image') return 'image_generation';
  if (group === 'voice') return 'speech_generation';
  return recSubTab === 'speech' ? 'speech_recognition' : 'image_recognition';
}

export function readSlotConfig(settings: ApiSettings, slot: ApiCapabilityCategory): ApiConnectionConfig {
  switch (slot) {
    case 'text_generation':
      return settings.textGeneration || settings.text;
    case 'image_generation':
      return settings.imageGeneration || settings.image;
    case 'speech_generation':
      return settings.speechGeneration || settings.voice;
    case 'image_recognition':
      return settings.recognition.image;
    case 'speech_recognition':
      return settings.recognition.speech;
  }
}

export function updateSlotConfig(
  prev: ApiSettings,
  slot: ApiCapabilityCategory,
  patch: Partial<ApiConnectionConfig>
): ApiSettings {
  const current = readSlotConfig(prev, slot);
  const nextConn: ApiConnectionConfig = { ...current, ...patch };

  switch (slot) {
    case 'text_generation':
      return {
        ...prev,
        textGeneration: nextConn,
        text: { ...nextConn },
      };
    case 'image_generation':
      return {
        ...prev,
        imageGeneration: nextConn,
        image: { ...nextConn },
      };
    case 'speech_generation':
      return {
        ...prev,
        speechGeneration: nextConn,
        voice: { ...nextConn },
      };
    case 'image_recognition':
      return {
        ...prev,
        recognition: {
          ...prev.recognition,
          image: nextConn,
        },
      };
    case 'speech_recognition':
      return {
        ...prev,
        recognition: {
          ...prev.recognition,
          speech: nextConn,
        },
      };
  }
}

export interface ApiSettingsPanelProps {
  settings: ApiSettings;
  setSettings: React.Dispatch<React.SetStateAction<ApiSettings>>;
  activeCategory: TopLevelApiGroup;
  setActiveCategory: (cat: TopLevelApiGroup) => void;
  recognitionSubTab: RecognitionSubTab;
  setRecognitionSubTab: (sub: RecognitionSubTab) => void;

  fetchedModelsMap: Record<ApiCapabilityCategory, RemoteModelItem[]>;
  isTestingConnection: boolean;
  connectionResult: ConnectionTestResult | null;
  handleTestConnection: () => Promise<void>;

  isFetchingModels: boolean;
  modelFetchResult: ModelFetchResult | null;
  handleFetchModels: () => Promise<void>;

  isTestingModel: boolean;
  modelTestResult: ModelTestResult | null;
  handleTestSelectedModel: () => Promise<void>;

  isTestingThinking?: boolean;
  thinkingDiagnostic?: ThinkingDiagnosticResult | null;
  handleTestThinking?: () => Promise<void>;

  handleGlobalSave: () => void;
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({
  settings,
  setSettings,
  activeCategory,
  setActiveCategory,
  recognitionSubTab,
  setRecognitionSubTab,
  fetchedModelsMap,
  isTestingConnection,
  connectionResult,
  handleTestConnection,
  isFetchingModels,
  modelFetchResult,
  handleFetchModels,
  isTestingModel,
  modelTestResult,
  handleTestSelectedModel,
  isTestingThinking = false,
  thinkingDiagnostic = null,
  handleTestThinking,
  handleGlobalSave,
}) => {
  const activeSlot = resolveActiveSlot(activeCategory, recognitionSubTab);
  const currentConfig = readSlotConfig(settings, activeSlot);
  const builtInPresets = getPresetsByCategory(activeSlot);
  const isComingSoonSlot = activeSlot === 'speech_generation' || activeSlot === 'speech_recognition';

  // Key visibility per slot
  const [showKeyMap, setShowKeyMap] = useState<Record<ApiCapabilityCategory, boolean>>({
    text_generation: false,
    image_generation: false,
    speech_generation: false,
    image_recognition: false,
    speech_recognition: false,
  });

  // Custom presets state
  const [customPresets, setCustomPresets] = useState<CustomPresetItem[]>(loadSavedCustomPresets);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Backend health status
  const [liveHealth, setLiveHealth] = useState<string>('');

  // Real Image Generation Test state
  const [isTestingImageGen, setIsTestingImageGen] = useState(false);
  const [imageGenTestResult, setImageGenTestResult] = useState<ImageGenerationTestResult | null>(null);
  const [imageGenRenderState, setImageGenRenderState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  // Real Image Recognition Test state
  const recFileInputRef = useRef<HTMLInputElement | null>(null);
  const [testRecImageUrl, setTestRecImageUrl] = useState<string>('');
  const [testRecFileName, setTestRecFileName] = useState<string>('');
  const [isTestingImageRec, setIsTestingImageRec] = useState(false);
  const [imageRecTestResult, setImageRecTestResult] = useState<ImageRecognitionTestResult | null>(null);
  const [showRawSchemaJson, setShowRawSchemaJson] = useState(false);

  useEffect(() => {
    persistCustomPresets(customPresets);
  }, [customPresets]);

  useEffect(() => {
    let mounted = true;
    if (Capacitor.isNativePlatform()) {
      pingBackendHealth()
        .then((ok) => {
          if (mounted) {
            setLiveHealth(ok ? '本地后端在线 (127.0.0.1:3000)' : '本地后端待唤醒 (将在请求时自动启动)');
          }
        })
        .catch(() => {
          if (mounted) setLiveHealth('本地后端待唤醒');
        });
    }
    return () => {
      mounted = false;
    };
  }, []);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 2600);
  };

  const patchCurrent = (patch: Partial<ApiConnectionConfig>) => {
    setSettings((prev) => updateSlotConfig(prev, activeSlot, patch));
  };

  const slotCustomPresets = customPresets.filter((p) => p.category === activeSlot);

  const handleSelectPresetValue = (value: string) => {
    if (!value || value === '__manual__') {
      patchCurrent({ presetId: '' });
      return;
    }

    const builtIn = builtInPresets.find((p) => p.id === value);
    if (builtIn) {
      patchCurrent({
        provider: builtIn.provider,
        apiProtocol: builtIn.apiProtocol,
        baseUrl: builtIn.defaultBaseUrl,
        model: builtIn.defaultModel,
        presetId: builtIn.id,
        // Preserve existing non-empty apiKey!
      });
      showNotice(`已应用预设：${builtIn.name}（已保留你的密钥）`);
      return;
    }

    const custom = slotCustomPresets.find((p) => p.id === value);
    if (custom) {
      patchCurrent({
        provider: custom.provider || 'custom',
        apiProtocol: custom.apiProtocol || currentConfig.apiProtocol || 'openai_compatible',
        baseUrl: custom.baseUrl,
        model: custom.model,
        apiKey: custom.apiKey ? custom.apiKey : currentConfig.apiKey,
        presetId: custom.id,
      });
      showNotice(`已切换到自定义预设：${custom.name}`);
    }
  };

  const handleSaveAsCustomPreset = () => {
    const name = newPresetName.trim() || `${CAPABILITY_LABELS[activeSlot]}预设 ${slotCustomPresets.length + 1}`;
    const item: CustomPresetItem = {
      id: `custom_${activeSlot}_${Date.now()}`,
      category: activeSlot,
      name,
      provider: currentConfig.provider || 'custom',
      apiProtocol: currentConfig.apiProtocol || 'openai_compatible',
      baseUrl: currentConfig.baseUrl || '',
      apiKey: currentConfig.apiKey || '',
      model: currentConfig.model || '',
      createdAt: Date.now(),
    };
    setCustomPresets((prev) => [...prev, item]);
    patchCurrent({ presetId: item.id });
    setNewPresetName('');
    showNotice(`已保存预设：“${name}”`);
  };

  const handleDeleteCustomPreset = (id: string) => {
    setCustomPresets((prev) => prev.filter((p) => p.id !== id));
    if (currentConfig.presetId === id) {
      patchCurrent({ presetId: '' });
    }
    showNotice('已删除自定义预设');
  };

  // Real Image Generation Test
  const handleRunImageGenerationTest = async () => {
    if (isTestingImageGen) return;
    setIsTestingImageGen(true);
    setImageGenTestResult(null);
    setImageGenRenderState('idle');

    try {
      const result = await testImageGenerationConnection(currentConfig);
      setImageGenTestResult(result);
      if (result.success && result.imageUrl) {
        setImageGenRenderState('loading');
      }
    } finally {
      setIsTestingImageGen(false);
    }
  };

  // Handle test image selection for Image Recognition Test
  const handlePickRecognitionTestFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageRecTestResult(null);
    try {
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        maxFileSizeBytes: 380 * 1024,
      });
      setTestRecImageUrl(compressed.dataUrl);
      setTestRecFileName(file.name);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setTestRecImageUrl(reader.result);
          setTestRecFileName(file.name);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      e.target.value = '';
    }
  };

  // Real Image Recognition Test
  const handleRunImageRecognitionTest = async () => {
    if (isTestingImageRec) return;
    setIsTestingImageRec(true);
    setImageRecTestResult(null);
    try {
      const result = await testImageRecognitionConnection(currentConfig, testRecImageUrl);
      setImageRecTestResult(result);
    } finally {
      setIsTestingImageRec(false);
    }
  };

  // Group models by capability for the current slot without hiding ANY model
  const rawModels = fetchedModelsMap[activeSlot] || [];
  const recommendedModels = rawModels.filter((m) => {
    if (Array.isArray(m.supportedCapabilities) && m.supportedCapabilities.length > 0) {
      return m.confidence !== 'unknown' && m.supportedCapabilities.includes(activeSlot);
    }
    if (m.capabilityCategory) {
      return m.capabilityCategory === activeSlot;
    }
    return true;
  });
  const recommendedIdSet = new Set(recommendedModels.map((m) => m.id));
  const otherModels = rawModels.filter((m) => !recommendedIdSet.has(m.id));

  const slotTitleMap: Record<ApiCapabilityCategory, { title: string; subtitle: string; basePlaceholder: string; modelPlaceholder: string }> = {
    text_generation: {
      title: 'API连接（语言生成）',
      subtitle: '用于微信私聊、群聊、线下模式、记忆提取等文本对话能力',
      basePlaceholder: 'https://generativelanguage.googleapis.com 或 https://api.openai.com/v1',
      modelPlaceholder: '如：gemini-4-hydrogen、gpt-4o、deepseek-chat',
    },
    image_generation: {
      title: '图像API连接（图像生成）',
      subtitle: '独立配置生图接口，支持 Google 原生生图与 OpenAI /v1/images/generations 协议',
      basePlaceholder: 'https://generativelanguage.googleapis.com 或 https://api.openai.com/v1',
      modelPlaceholder: '如：gemini-3.1-flash-lite-image、imagen-3.0-generate-002、dall-e-3、flux-schnell',
    },
    speech_generation: {
      title: '语音API连接（语音生成）',
      subtitle: '独立预留 TTS 语音合成配置框架（不影响语言/图像配置）',
      basePlaceholder: 'https://api.openai.com/v1 或自定义语音反代地址',
      modelPlaceholder: '如：tts-1、gemini-3.8-flash-lite-tts',
    },
    image_recognition: {
      title: '识别API — 图像识别',
      subtitle: '独立配置视觉理解模型，严格与「图像生成」配置隔离，绝不混用密钥或模型',
      basePlaceholder: 'https://generativelanguage.googleapis.com 或 https://api.openai.com/v1',
      modelPlaceholder: '如：gemini-4-hydrogen、gpt-4o-mini、qwen2.5-vl-72b',
    },
    speech_recognition: {
      title: '识别API — 语音识别',
      subtitle: '独立预留 STT 语音转文字配置框架（不影响图像识别配置）',
      basePlaceholder: 'https://api.openai.com/v1 或自定义转写反代地址',
      modelPlaceholder: '如：whisper-1、gemini-3.5-transcribe',
    },
  };

  const slotMeta = slotTitleMap[activeSlot];
  const isKeyShown = showKeyMap[activeSlot];
  const activeKey = currentConfig.apiKey || '';
  const activeBaseUrl = currentConfig.baseUrl || '';
  const activeModel = currentConfig.model || '';
  const activeProtocol = currentConfig.apiProtocol || 'google_native';

  const thinkingCfg: ThinkingOutputSettings = currentConfig.thinkingConfig || {
    mode: 'auto',
    useStreaming: false,
  };
  const customJsonValidation =
    thinkingCfg.mode === 'custom'
      ? parseCustomThinkingParamsJson(thinkingCfg.customParamsJson)
      : { ok: true };

  const patchThinkingConfig = (patch: Partial<ThinkingOutputSettings>) => {
    patchCurrent({
      thinkingConfig: {
        ...thinkingCfg,
        ...patch,
      },
    });
  };

  return (
    <div className="api-settings-panel-root settings-section-card rounded-2xl bg-zinc-950 border border-zinc-850 p-4 sm:p-5 space-y-4 text-zinc-200">
      {/* 4 Top-Level Groups */}
      <div className="api-category-tabs grid grid-cols-4 gap-1 p-1 bg-zinc-900/90 rounded-xl border border-zinc-800">
        {(
          [
            { id: 'text', label: 'API连接', sub: '语言生成' },
            { id: 'image', label: '图像API', sub: '图像生成' },
            { id: 'voice', label: '语音API', sub: '语音生成' },
            { id: 'recognition', label: '识别API', sub: '图像/语音' },
          ] as Array<{ id: TopLevelApiGroup; label: string; sub: string }>
        ).map((tab) => {
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`py-2 px-1.5 rounded-lg text-center transition cursor-pointer ${
                active
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <div className="text-[11px] font-semibold leading-tight truncate">{tab.label}</div>
              <div className="text-[9px] text-zinc-500 leading-tight mt-0.5 truncate">{tab.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Recognition API Sub-Tabs (Image Recognition / Speech Recognition) */}
      {activeCategory === 'recognition' && (
        <div className="flex items-center gap-2 p-1 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
          <button
            type="button"
            onClick={() => setRecognitionSubTab('image')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
              recognitionSubTab === 'image'
                ? 'bg-indigo-600/90 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ScanSearch className="w-3.5 h-3.5" />
            <span>图像识别</span>
          </button>
          <button
            type="button"
            onClick={() => setRecognitionSubTab('speech')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
              recognitionSubTab === 'speech'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>语音识别</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">待接入</span>
          </button>
        </div>
      )}

      {/* Group Header */}
      <div className="flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
            <span>{slotMeta.title}</span>
            {isComingSoonSlot && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300">
                功能待后续完整接入
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{slotMeta.subtitle}</p>
        </div>
        {liveHealth && (
          <span className="text-[10px] text-zinc-500 font-mono shrink-0">{liveHealth}</span>
        )}
      </div>

      {/* Honest Coming-Soon Banner for Speech Generation / Speech Recognition */}
      {isComingSoonSlot && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/90 flex items-start gap-2 leading-relaxed">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-200">
              {activeSlot === 'speech_generation' ? '语音生成' : '语音识别'}功能待后续完整接入
            </p>
            <p className="text-amber-200/80 mt-0.5">
              本阶段已建立独立数据结构、兼容迁移与持久化保存框架，你可以提前填写并保存配置，系统不会显示虚假的“已连接/可用”状态。
            </p>
          </div>
        </div>
      )}

      {/* Action Feedback Toast */}
      {actionNotice && (
        <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ================= Independent Slot Form Fields ================= */}
      <div className="space-y-4">
        {/* 1. 反代地址 */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-300 font-medium block">
            1. 反代地址 (Proxy / Base URL)
          </label>
          <StableTextInput
            key={`base_${activeSlot}`}
            type="text"
            placeholder={slotMeta.basePlaceholder}
            value={activeBaseUrl}
            onValueChange={(val) => patchCurrent({ baseUrl: val })}
            onBlur={(e) => {
              if (e.target.value !== activeBaseUrl) {
                patchCurrent({ baseUrl: e.target.value });
              }
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
          />
        </div>

        {/* 2. 密钥 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-300 font-medium">
              2. 密钥 (API Key)
            </label>
            {activeKey ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 font-mono">
                  已配置 ({maskApiKey(activeKey)})
                </span>
                <button
                  type="button"
                  onClick={() => patchCurrent({ apiKey: '' })}
                  className="text-[11px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2 cursor-pointer"
                >
                  清除
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-zinc-500">未配置</span>
            )}
          </div>
          <div className="relative">
            <StableTextInput
              key={`key_${activeSlot}`}
              type={isKeyShown ? 'text' : 'password'}
              placeholder="输入当前能力专用 API Key（本地加密隔离保存）"
              value={activeKey}
              onValueChange={(val) => patchCurrent({ apiKey: val })}
              onBlur={(e) => {
                if (e.target.value !== activeKey) {
                  patchCurrent({ apiKey: e.target.value });
                }
              }}
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
            />
            <button
              type="button"
              onClick={() =>
                setShowKeyMap((prev) => ({ ...prev, [activeSlot]: !prev[activeSlot] }))
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 transition cursor-pointer"
              title={isKeyShown ? '隐藏密钥' : '显示密钥'}
            >
              {isKeyShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 3. 协议适配 */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-300 font-medium block">
            3. 接口协议
          </label>
          <select
            value={activeProtocol}
            onChange={(e) => {
              const proto = e.target.value;
              patchCurrent({
                apiProtocol: proto,
                provider:
                  proto === 'google_native'
                    ? 'google_gemini'
                    : proto === 'anthropic'
                    ? 'anthropic'
                    : currentConfig.provider === 'google_gemini'
                    ? 'openai_compatible'
                    : currentConfig.provider || 'openai_compatible',
              });
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-zinc-500"
          >
            <option value="google_native">Google 原生协议 (Gemini / Imagen 原生与兼容反代)</option>
            <option value="openai_compatible">OpenAI 兼容协议 (/v1/chat/completions 或 /v1/images/generations)</option>
            {activeSlot === 'text_generation' && (
              <option value="anthropic">Anthropic 原生协议 (/v1/messages)</option>
            )}
          </select>
        </div>

        {/* 4. 模型选择（能力分组提示 + 保留全部未标注模型 + 手动输入） */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-300 font-medium">
              4. 模型选择
            </label>
            <span className="text-[10px] text-zinc-500">支持下拉选择与手动输入任意模型 ID</span>
          </div>

          {rawModels.length > 0 && (
            <select
              value={rawModels.some((m) => m.id === activeModel) ? activeModel : ''}
              onChange={(e) => {
                if (e.target.value) {
                  patchCurrent({ model: e.target.value });
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500"
            >
              <option value="">-- 选择已拉取 / 推荐模型（也可下方手动输入） --</option>
              {recommendedModels.length > 0 && (
                <optgroup label={`推荐 · ${CAPABILITY_LABELS[activeSlot]}模型 (${recommendedModels.length})`}>
                  {recommendedModels.map((m) => (
                    <option key={`rec_${m.id}`} value={m.id}>
                      {m.id}
                      {m.capabilityHint ? ` · ${m.capabilityHint}` : m.name && m.name !== m.id ? ` (${m.name})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherModels.length > 0 && (
                <optgroup label={`其他 / 未明确标注能力模型 (${otherModels.length}，均可选用)`}>
                  {otherModels.map((m) => (
                    <option key={`other_${m.id}`} value={m.id}>
                      {m.id}
                      {m.capabilityHint ? ` · ${m.capabilityHint}` : ' · 能力未明确标注，以实际测试为准'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}

          <StableTextInput
            key={`model_${activeSlot}`}
            type="text"
            placeholder={slotMeta.modelPlaceholder}
            value={activeModel}
            onValueChange={(val) => patchCurrent({ model: val })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
          />
        </div>

        {/* 5. 预设配置（独立分组预设 + 自定义预设管理，无伪造密钥） */}
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-300 font-medium block">
            5. 预设配置
          </label>
          <div className="flex gap-2">
            <select
              value={currentConfig.presetId || '__manual__'}
              onChange={(e) => handleSelectPresetValue(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-zinc-500 font-medium truncate"
            >
              <option value="__manual__">-- 手动自定义配置 --</option>
              <optgroup label="内置标准预设（不含密钥）">
                {builtInPresets.map((p: CapabilityPresetDefinition) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {slotCustomPresets.length > 0 && (
                <optgroup label="我保存的自定义预设">
                  {slotCustomPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              type="button"
              onClick={() => setShowPresetManager(true)}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition active:scale-95 shrink-0 cursor-pointer"
            >
              管理
            </button>
          </div>
        </div>

        {/* ================= 6. 思考输出设置 (仅 text_generation) ================= */}
        {activeSlot === 'text_generation' && (
          <div className="settings-sub-card p-3.5 rounded-xl bg-zinc-900/75 border border-zinc-800 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                  <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>6. 思考输出设置</span>
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
                  可选请求参数控制，默认“自动检测”仅接收上游原生返回，不会强行注入厂商私有字段。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'auto', label: '自动检测' },
                  { id: 'on', label: '开启' },
                  { id: 'off', label: '关闭' },
                  { id: 'custom', label: '自定义JSON' },
                ] as Array<{ id: ThinkingOutputMode; label: string }>
              ).map((opt) => {
                const selected = thinkingCfg.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchThinkingConfig({ mode: opt.id })}
                    className={`settings-option-btn py-1.5 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                      selected
                        ? 'settings-option-btn--active bg-zinc-800 border-amber-500/60 text-amber-300'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {thinkingCfg.mode === 'on' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 block">推理强度 (Effort / Level)</label>
                  <select
                    value={thinkingCfg.reasoningEffort || 'medium'}
                    onChange={(e) =>
                      patchThinkingConfig({
                        reasoningEffort: e.target.value as ReasoningEffortLevel,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-zinc-500"
                  >
                    <option value="minimal">Minimal (极简)</option>
                    <option value="low">Low (低)</option>
                    <option value="medium">Medium (中)</option>
                    <option value="high">High (高)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 block">
                    思考预算 Tokens (可选，Gemini 4 自动使用 ThinkingLevel)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={65536}
                    step={256}
                    placeholder="如 4096（留空由模型决定）"
                    value={
                      typeof thinkingCfg.thinkingBudget === 'number'
                        ? String(thinkingCfg.thinkingBudget)
                        : ''
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        patchThinkingConfig({ thinkingBudget: undefined });
                      } else {
                        const num = parseInt(raw, 10);
                        if (Number.isFinite(num) && num >= 0) {
                          patchThinkingConfig({ thinkingBudget: num });
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            )}

            {thinkingCfg.mode === 'custom' && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-zinc-400">
                    自定义思考参数 (仅发送合法 JSON 对象键值)
                  </label>
                  <span
                    className={`text-[10px] ${
                      customJsonValidation.ok ? 'settings-status-ok text-emerald-400' : 'settings-status-err text-rose-400'
                    }`}
                  >
                    {customJsonValidation.ok ? 'JSON 格式有效' : '格式错误'}
                  </span>
                </div>

                <textarea
                  rows={3}
                  value={thinkingCfg.customParamsJson || ''}
                  onChange={(e) => patchThinkingConfig({ customParamsJson: e.target.value })}
                  placeholder='例如: {"reasoning_effort": "high"} 或 {"enable_thinking": true}'
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 select-text"
                />

                {!customJsonValidation.ok && customJsonValidation.error && (
                  <p className="text-[10px] text-rose-400">{customJsonValidation.error}</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'reasoning_effort', json: '{"reasoning_effort": "high"}' },
                    { label: 'enable_thinking', json: '{"enable_thinking": true}' },
                    {
                      label: 'Gemini includeThoughts',
                      json: '{"thinkingConfig": {"includeThoughts": true, "thinkingBudget": 4096}}',
                    },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => patchThinkingConfig({ customParamsJson: chip.json })}
                      className="settings-option-btn px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-300 transition cursor-pointer"
                    >
                      + {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/80 settings-card-divider cursor-pointer">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-zinc-200">
                  优先使用流式 (SSE) 接收思考过程
                </div>
                <div className="text-[10px] text-zinc-500">
                  部分中转站或推理模型仅在 stream=true 时透传 delta 思考字段
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(thinkingCfg.useStreaming)}
                onChange={(e) => patchThinkingConfig({ useStreaming: e.target.checked })}
                className="w-4 h-4 rounded accent-sky-500 shrink-0"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-zinc-800/80 settings-card-divider">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-zinc-200">
                  单次请求超时上限
                </div>
                <div className="text-[10px] text-zinc-500">
                  长上下文或深度推理建议 120 秒以上，避免上游生成中提前断开
                </div>
              </div>
              <select
                value={String(currentConfig.timeoutMs || 120000)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (Number.isFinite(val)) {
                    patchCurrent({ timeoutMs: val });
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500 shrink-0"
              >
                <option value="30000">30 秒</option>
                <option value="60000">60 秒</option>
                <option value="120000">120 秒 (默认)</option>
                <option value="180000">180 秒</option>
                <option value="300000">300 秒</option>
              </select>
            </div>
          </div>
        )}

        {/* ================= Real Image Recognition Test Picker (Only in recognition.image) ================= */}
        {activeSlot === 'image_recognition' && (
          <div className="p-3.5 rounded-xl bg-zinc-900/75 border border-indigo-500/25 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <ScanSearch className="w-4 h-4" />
                <span>真实图像识别测试</span>
              </div>
              <span className="text-[10px] text-zinc-500">仅读取「图像识别」当前配置</span>
            </div>

            <input
              ref={recFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handlePickRecognitionTestFile}
              className="hidden"
            />

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => recFileInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{testRecImageUrl ? '更换测试图片' : '选择测试图片'}</span>
              </button>

              {testRecImageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setTestRecImageUrl('');
                    setTestRecFileName('');
                    setImageRecTestResult(null);
                  }}
                  className="px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition cursor-pointer"
                >
                  清除
                </button>
              )}

              {testRecFileName && (
                <span className="text-[11px] text-zinc-400 truncate flex-1">{testRecFileName}</span>
              )}
            </div>

            {testRecImageUrl && (
              <div className="flex items-start gap-3">
                <img
                  src={testRecImageUrl}
                  alt="测试图片预览"
                  className="w-20 h-20 rounded-lg object-cover border border-zinc-700 shrink-0 bg-black"
                />
                <div className="flex-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleRunImageRecognitionTest}
                    disabled={isTestingImageRec}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {isTestingImageRec ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isTestingImageRec ? '正在真实识别图片...' : '发起真实识别测试'}</span>
                  </button>
                  <p className="text-[10px] text-zinc-500">
                    将使用你选择的图片真实调用当前图像识别模型并返回结构化识别结果。
                  </p>
                </div>
              </div>
            )}

            {imageRecTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  imageRecTestResult.success
                    ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-100'
                    : 'bg-rose-950/30 border-rose-500/35 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {imageRecTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{imageRecTestResult.success ? '图像识别测试成功' : '图像识别测试失败'}</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-80">
                    {imageRecTestResult.latencyMs}ms
                  </span>
                </div>

                {imageRecTestResult.success ? (
                  <div className="space-y-1 text-[11px] leading-relaxed">
                    <p>
                      <span className="text-zinc-400">识别描述：</span>
                      {imageRecTestResult.description}
                    </p>
                    {imageRecTestResult.detectedText && (
                      <p>
                        <span className="text-zinc-400">图中文字：</span>
                        {imageRecTestResult.detectedText}
                      </p>
                    )}
                    {imageRecTestResult.scene && (
                      <p>
                        <span className="text-zinc-400">画面场景：</span>
                        {imageRecTestResult.scene}
                      </p>
                    )}
                    {imageRecTestResult.objects && imageRecTestResult.objects.length > 0 && (
                      <p>
                        <span className="text-zinc-400">识别元素：</span>
                        {imageRecTestResult.objects.join('、')}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-zinc-400 pt-1">
                      模型：{imageRecTestResult.model || activeModel} · 协议：{imageRecTestResult.protocol || activeProtocol}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] break-words">
                    {sanitizeSensitiveText(imageRecTestResult.error || '未能完成图像识别')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= Action Buttons Row ================= */}
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {/* Test Button varies honestly by capability */}
            {activeSlot === 'text_generation' && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isTestingConnection ? '测试中...' : '测试连接'}</span>
              </button>
            )}

            {activeSlot === 'image_generation' && (
              <button
                type="button"
                onClick={handleRunImageGenerationTest}
                disabled={isTestingImageGen}
                className="py-2.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isTestingImageGen ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                <span>{isTestingImageGen ? '真实生图中...' : '测试生图'}</span>
              </button>
            )}

            {activeSlot === 'image_recognition' && (
              <button
                type="button"
                onClick={() => {
                  if (!testRecImageUrl) {
                    recFileInputRef.current?.click();
                  } else {
                    void handleRunImageRecognitionTest();
                  }
                }}
                disabled={isTestingImageRec}
                className="py-2.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isTestingImageRec ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="w-3.5 h-3.5" />
                )}
                <span>{isTestingImageRec ? '识别中...' : testRecImageUrl ? '测试识别' : '选图测试'}</span>
              </button>
            )}

            {isComingSoonSlot && (
              <button
                type="button"
                disabled
                className="py-2.5 px-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-500 font-medium text-[11px] flex items-center justify-center gap-1 cursor-not-allowed"
                title="语音能力待后续完整接入，当前不做虚假测试"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>待接入测试</span>
              </button>
            )}

            {/* Fetch Models */}
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={isFetchingModels}
              className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isFetchingModels ? 'animate-spin' : ''}`} />
              <span>{isFetchingModels ? '拉取中...' : '拉取模型'}</span>
            </button>

            {/* Save Config */}
            <button
              type="button"
              onClick={handleGlobalSave}
              className="py-2.5 px-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-zinc-950" />
              <span>保存配置</span>
            </button>
          </div>

          {activeSlot === 'text_generation' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {handleTestThinking && (
                <button
                  type="button"
                  onClick={() => {
                    setShowRawSchemaJson(false);
                    void handleTestThinking();
                  }}
                  disabled={isTestingThinking}
                  className="settings-option-btn w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/35 text-amber-300 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isTestingThinking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Brain className="w-3.5 h-3.5" />
                  )}
                  <span>{isTestingThinking ? '检测思考输出中...' : '检测思考输出'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleTestSelectedModel()}
                disabled={isTestingModel || !activeModel.trim()}
                className="settings-option-btn w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isTestingModel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>{isTestingModel ? '发送实测请求中...' : '实测当前对话模型'}</span>
              </button>
            </div>
          )}

          {/* Real Image Generation Test Result Card (with real <img> decode verification!) */}
          {activeSlot === 'image_generation' && imageGenTestResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                imageGenTestResult.success && imageGenRenderState === 'loaded'
                  ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-100'
                  : imageGenTestResult.success && imageGenRenderState === 'loading'
                  ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                  : 'bg-rose-950/30 border-rose-500/35 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  {imageGenTestResult.success && imageGenRenderState === 'loaded' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : imageGenTestResult.success && imageGenRenderState === 'loading' ? (
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>
                    {imageGenTestResult.success && imageGenRenderState === 'loaded'
                      ? '图像生成测试成功（真实图片已加载）'
                      : imageGenTestResult.success && imageGenRenderState === 'loading'
                      ? '接口已返回图片，正在校验图片解码渲染...'
                      : imageGenTestResult.success && imageGenRenderState === 'error'
                      ? '接口返回成功，但图片资源无法解码渲染'
                      : '图像生成测试失败'}
                  </span>
                </div>
                <span className="text-[10px] font-mono opacity-80 shrink-0">
                  {imageGenTestResult.latencyMs}ms
                </span>
              </div>

              {imageGenTestResult.success && imageGenTestResult.imageUrl && (
                <div className="space-y-2">
                  <div className="rounded-xl overflow-hidden border border-zinc-700/80 bg-zinc-900 flex items-center justify-center max-h-56">
                    <img
                      src={imageGenTestResult.imageUrl}
                      alt="测试生成结果：一颗蓝色星星"
                      className="max-h-52 object-contain"
                      onLoad={() => setImageGenRenderState('loaded')}
                      onError={() => setImageGenRenderState('error')}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-400 space-y-0.5">
                    <div>
                      模型：{imageGenTestResult.model || activeModel} · 协议：{imageGenTestResult.protocol || activeProtocol}
                    </div>
                    {imageGenTestResult.revisedPrompt && (
                      <div className="text-zinc-300 font-sans">
                        修订提示词：{imageGenTestResult.revisedPrompt}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!imageGenTestResult.success && (
                <p className="text-[11px] break-words leading-relaxed">
                  {sanitizeSensitiveText(imageGenTestResult.error || '未能生成有效图片')}
                </p>
              )}
            </div>
          )}

          {/* Text Connection Test Result */}
          {activeSlot === 'text_generation' && connectionResult && (
            <div
              className={`api-diag-status-box p-3 rounded-xl border text-xs flex items-center justify-between ${
                connectionResult.success
                  ? 'api-diag-status-box--ok bg-zinc-900/90 border-emerald-500/30 text-zinc-200'
                  : 'api-diag-status-box--err bg-zinc-900/90 border-rose-500/35 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {connectionResult.success ? (
                  <CheckCircle2 className="api-diag-ok w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="api-diag-err w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="break-words [overflow-wrap:anywhere]">
                  {sanitizeSensitiveText(
                    connectionResult.message || (connectionResult.success ? '连接成功 (HTTP 200)' : '连接失败')
                  )}
                </span>
              </div>
              <span className="api-diag-muted font-mono text-[11px] text-zinc-400 shrink-0 ml-2">
                {connectionResult.latencyMs}ms
              </span>
            </div>
          )}

          {/* Selected Model Live Chat Probe Result */}
          {activeSlot === 'text_generation' && modelTestResult && (
            <div
              className={`api-diag-status-box p-3 rounded-xl border text-xs space-y-1.5 ${
                modelTestResult.success
                  ? 'api-diag-status-box--ok bg-zinc-900/90 border-emerald-500/30 text-zinc-200'
                  : 'api-diag-status-box--err bg-zinc-900/90 border-rose-500/35 text-rose-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold min-w-0">
                  {modelTestResult.success ? (
                    <CheckCircle2 className="api-diag-ok w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="api-diag-err w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {modelTestResult.success
                      ? `模型实测成功 (${modelTestResult.model || activeModel})`
                      : `模型实测失败 (${modelTestResult.model || activeModel})`}
                  </span>
                </div>
                <span className="api-diag-muted font-mono text-[11px] text-zinc-400 shrink-0">
                  {modelTestResult.latencyMs}ms
                </span>
              </div>
              {modelTestResult.success ? (
                <p className="text-[11px] text-zinc-300 break-words leading-relaxed">
                  返回预览：{sanitizeSensitiveText(modelTestResult.reply || '已成功收到响应')}
                </p>
              ) : (
                <p className="text-[11px] break-words leading-relaxed">
                  {sanitizeSensitiveText(modelTestResult.error || '实测请求失败')}
                </p>
              )}
            </div>
          )}

          {/* Thinking Output Diagnostic Panel */}
          {activeSlot === 'text_generation' && thinkingDiagnostic && (
            <div className="api-diagnostic-panel p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3 text-xs">
              <div className="api-diagnostic-header flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Brain className="api-diagnostic-title w-4 h-4 text-amber-400 shrink-0" />
                  <span>思考输出诊断结果</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {thinkingDiagnostic.latencyMs}ms · {thinkingDiagnostic.apiProtocol || activeProtocol}
                </span>
              </div>

              {!thinkingDiagnostic.success ? (
                <div className="api-diag-status-box api-diag-status-box--err p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/35 text-rose-200 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="break-words">
                    {sanitizeSensitiveText(thinkingDiagnostic.error || '连接或思考输出探测失败')}
                  </span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="api-diagnostic-card p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-400">最终回答</span>
                      <span
                        className={
                          thinkingDiagnostic.answerOk ?? thinkingDiagnostic.answerReturned
                            ? 'settings-status-ok text-emerald-400 font-semibold'
                            : 'settings-status-err text-rose-400 font-semibold'
                        }
                      >
                        {thinkingDiagnostic.answerOk ?? thinkingDiagnostic.answerReturned ? '已返回' : '未返回'}
                      </span>
                    </div>
                    <div className="api-diagnostic-card p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-400">思考输出</span>
                      <span
                        className={
                          thinkingDiagnostic.reasoningAvailable
                            ? 'settings-status-ok text-emerald-400 font-semibold'
                            : 'settings-status-warn text-amber-400 font-semibold'
                        }
                      >
                        {thinkingDiagnostic.reasoningAvailable
                          ? `已返回 (${thinkingDiagnostic.reasoningCharCount ?? thinkingDiagnostic.thinkingCharCount ?? 0} 字)`
                          : '未返回'}
                      </span>
                    </div>
                    <div className="api-diagnostic-card p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-400">非流式</span>
                      <span className="font-mono text-zinc-200">
                        {thinkingDiagnostic.nonStreamingSupported ? '支持' : '未通过'}
                        {thinkingDiagnostic.nonStreamingReasoningAvailable ? ' · 含思考' : ''}
                      </span>
                    </div>
                    <div className="api-diagnostic-card p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-400">流式 SSE</span>
                      <span className="font-mono text-zinc-200">
                        {thinkingDiagnostic.streamingSupported ? '支持' : '未通过'}
                        {thinkingDiagnostic.streamingReasoningAvailable ? ' · 含思考' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="api-diagnostic-card p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">识别来源:</span>
                      <span className="font-mono text-zinc-200">
                        {thinkingDiagnostic.reasoningSource || 'none'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-zinc-400 shrink-0">命中字段:</span>
                      <span className="font-mono text-zinc-300 text-right break-all">
                        {thinkingDiagnostic.detectedFields?.length
                          ? thinkingDiagnostic.detectedFields.join(', ')
                          : '无'}
                      </span>
                    </div>
                  </div>

                  {thinkingDiagnostic.hasThoughtSignatureOnly && !thinkingDiagnostic.reasoningAvailable && (
                    <div className="api-diag-status-box api-diag-status-box--warn p-2.5 rounded-lg bg-amber-950/25 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed">
                      检测到上游仅返回了加密的 thoughtSignature 元数据，未返回可读明文思考内容。
                    </div>
                  )}

                  {(thinkingDiagnostic.likelyUpstreamStripped || thinkingDiagnostic.noticeMessage) && (
                    <div className="api-diag-status-box api-diag-status-box--warn p-2.5 rounded-lg bg-amber-950/25 border border-amber-500/35 text-amber-200 text-[11px] flex items-start gap-2 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        {thinkingDiagnostic.noticeMessage ||
                          '当前接口只返回最终答案，小手机无法恢复被上游删除的思考内容。请更换支持reasoning透传的模型或API站，或查询站点所需的思考参数。'}
                      </span>
                    </div>
                  )}

                  {(thinkingDiagnostic.reasoningPreview || thinkingDiagnostic.thinkingPreview) && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-400 block">思考内容预览 (已截断):</span>
                      <div className="settings-code-block p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-amber-200/90 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {thinkingDiagnostic.reasoningPreview || thinkingDiagnostic.thinkingPreview}
                      </div>
                    </div>
                  )}

                  {thinkingDiagnostic.answerPreview && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-400 block">最终回答预览:</span>
                      <div className="api-diagnostic-card p-2 rounded-lg bg-zinc-950/70 border border-zinc-800 text-[11px] text-zinc-200 whitespace-pre-wrap">
                        {thinkingDiagnostic.answerPreview}
                      </div>
                    </div>
                  )}

                  {thinkingDiagnostic.sanitizedResponseStructure && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowRawSchemaJson((v) => !v)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                      >
                        {showRawSchemaJson ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        <span>{showRawSchemaJson ? '收起脱敏响应结构 (JSON)' : '查看脱敏响应结构 (JSON)'}</span>
                      </button>
                      {showRawSchemaJson && (
                        <pre className="settings-code-block mt-1.5 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(thinkingDiagnostic.sanitizedResponseStructure, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fetch Models Status */}
          {modelFetchResult && (
            <div
              className={`api-diag-status-box p-3 rounded-xl border text-xs flex items-center gap-2 ${
                modelFetchResult.success
                  ? 'api-diag-status-box--ok bg-zinc-900/90 border-zinc-800 text-zinc-200'
                  : 'api-diag-status-box--warn bg-zinc-900/90 border-amber-500/30 text-amber-300'
              }`}
            >
              {modelFetchResult.success ? (
                <CheckCircle2 className="api-diag-ok w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="api-diag-warn w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="break-words [overflow-wrap:anywhere]">
                {sanitizeSensitiveText(modelFetchResult.message || modelFetchResult.error || '')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Custom Preset Manager Modal */}
      {showPresetManager && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowPresetManager(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-4 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">
                管理「{CAPABILITY_LABELS[activeSlot]}」自定义预设
              </span>
              <button
                type="button"
                onClick={() => setShowPresetManager(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] text-zinc-400 block">
                将当前「{CAPABILITY_LABELS[activeSlot]}」配置另存为预设
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="输入预设名称..."
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAsCustomPreset}
                  className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>保存</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {slotCustomPresets.length === 0 ? (
                <p className="text-[11px] text-zinc-500 text-center py-4">
                  当前分组尚无已保存的自定义预设
                </p>
              ) : (
                slotCustomPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectPresetValue(preset.id);
                        setShowPresetManager(false);
                      }}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="text-xs font-medium text-zinc-100 truncate">{preset.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">
                        {preset.model || '未填模型'} · {preset.baseUrl || '默认地址'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomPreset(preset.id)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition shrink-0 cursor-pointer"
                      title="删除预设"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
