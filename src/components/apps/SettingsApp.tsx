import React, { useState, useEffect } from 'react';
import {
  ApiConfig,
  AiControls,
  ApiLog,
  ProviderType,
  RemoteModelItem,
  ConnectionTestResult,
  ModelFetchResult,
  ModelTestResult,
} from '../../types';
import {
  ArrowLeft,
  Settings,
  Key,
  Bot,
  Database,
  FileCode,
  Save,
  Trash2,
  Download,
  Upload,
  CheckCircle,
  Sparkles,
  Cpu,
  Globe,
  Radio,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Play,
  Layers,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  History,
  Archive,
  RotateCcw,
  AlertTriangle,
  Shield,
  FileCheck,
} from 'lucide-react';
import { DataManagementModal } from '../data/DataManagementModal';
import { clearAllChatMessages } from '../../lib/chatDb';
import { clearAllAiMemoryVaults } from '../../lib/aiMemoryVaultDb';
import { resetStorageToFactoryDefaults, loadApiConfig, saveApiConfig } from '../../lib/storage';
import {
  getUpgradeProtectionLogs,
  CURRENT_APP_DATA_VERSION,
  CURRENT_APP_VERSION_CODE,
  CURRENT_APP_VERSION_NAME,
  UpgradeProtectionLog,
} from '../../lib/dataMigration';

interface SettingsAppProps {
  onBackToLauncher: () => void;
  apiConfig: ApiConfig;
  aiControls: AiControls;
  onSaveApiConfig: (config: ApiConfig) => void;
  onSaveAiControls: (controls: AiControls) => void;
  onClearChats?: () => void;
  onExportData: () => void;
  onImportData: (jsonStr: string) => void;
  onAddApiLog: (log: ApiLog) => void;
  onDataChanged?: () => void;
}

interface ProviderPreset {
  id: ProviderType;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  badge: string;
  description: string;
}

const TEXT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'google_gemini',
    name: 'Google Gemini (官方 / 原生)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.6-flash',
    badge: '官方推荐',
    description: '支持 Gemini 3.6 Flash / 2.5 Pro 及自定义反代端点',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方 API',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    badge: 'OpenAI 兼容',
    description: '支持 DeepSeek V3、DeepSeek R1 推理模型',
  },
  {
    id: 'openai_compatible',
    name: 'OpenAI 官方 / 标准兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    badge: '标准协议',
    description: '支持 GPT-4o、GPT-4o Mini、OneAPI、NewAPI、反代网关',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (多模型聚合)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    badge: '全模型聚合',
    description: '聚合 Claude 3.5、Llama 3、Mistral、DeepSeek 等',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    badge: '国内高并发',
    description: '高可用 OpenAI 兼容中转加速服务',
  },
  {
    id: 'groq',
    name: 'Groq 高速推理',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    badge: '极速 LPU',
    description: '超低延迟 LLaMA 3.3 / Mixtral 推理',
  },
  {
    id: 'ollama',
    name: 'Ollama 本地私有化模型',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3:latest',
    badge: '本地离线',
    description: '连接局域网或本机 Ollama 服务',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI-compatible 反代',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o',
    badge: '自定义',
    description: '任意符合 OpenAI /v1 规范的反代、自建网关或中转服务',
  },
];

export const SettingsApp: React.FC<SettingsAppProps> = ({
  onBackToLauncher,
  apiConfig,
  aiControls,
  onSaveApiConfig,
  onSaveAiControls,
  onClearChats,
  onExportData,
  onImportData,
  onAddApiLog,
  onDataChanged,
}) => {
  const [config, setConfig] = useState<ApiConfig>(() => {
    const stored = loadApiConfig();
    return {
      ...stored,
      ...apiConfig,
      providers: {
        ...(stored.providers || {}),
        ...(apiConfig?.providers || {}),
      },
    };
  });
  const [controls, setControls] = useState<AiControls>(aiControls);

  // Active Provider Category Tab
  const [activeCategory, setActiveCategory] = useState<'text' | 'image' | 'voice'>('text');

  // Key Visibility toggles
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVoiceKey, setShowVoiceKey] = useState(false);

  // Active text provider
  const activeTextProvider = config.textProvider || 'google_gemini';

  // API Key text inputs for user typing
  const [textApiKeyInput, setTextApiKeyInput] = useState<string>(() => {
    return config.providers?.[activeTextProvider]?.apiKey || config.textApiKey || '';
  });
  const [imageApiKeyInput, setImageApiKeyInput] = useState<string>(() => config.imageApiKey || '');
  const [voiceApiKeyInput, setVoiceApiKeyInput] = useState<string>(() => config.voiceApiKey || '');

  // Explicit deletion tracking (Requirement 6: only user explicit click deletes a key)
  const [explicitlyClearedTextKey, setExplicitlyClearedTextKey] = useState(false);
  const [explicitlyClearedImageKey, setExplicitlyClearedImageKey] = useState(false);
  const [explicitlyClearedVoiceKey, setExplicitlyClearedVoiceKey] = useState(false);

  // Connection Test States
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);

  // Fetch Models States
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<RemoteModelItem[]>([]);
  const [modelFetchResult, setModelFetchResult] = useState<ModelFetchResult | null>(null);
  const [modelFilterQuery, setModelFilterQuery] = useState('');

  // Single Model Test States
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<ModelTestResult | null>(null);

  // JSON Format Adapter tool states
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [adaptedJsonOutput, setAdaptedJsonOutput] = useState('');
  const [isAdaptingJson, setIsAdaptingJson] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Data Management Full Modal states
  const [showDataModal, setShowDataModal] = useState(false);
  const [dataModalTab, setDataModalTab] = useState<'import' | 'export' | 'snapshots'>('import');

  // Upgrade Protection Logs Modal states
  const [showUpgradeLogsModal, setShowUpgradeLogsModal] = useState(false);
  const [upgradeLogs, setUpgradeLogs] = useState<UpgradeProtectionLog[]>([]);

  // Factory Reset (恢复出厂设置) Modal states
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  const handleExecuteFactoryReset = async () => {
    setIsResetting(true);
    try {
      // 1. Wipe IndexedDB chat messages
      await clearAllChatMessages();
      // 2. Wipe IndexedDB AI Memory Vaults, files and chunks
      await clearAllAiMemoryVaults();
      // 3. Reset localStorage to pristine default initial values
      resetStorageToFactoryDefaults();

      setResetSuccessMessage('恢复出厂设置成功！系统即将重新加载...');

      // Notify parent state if needed
      if (onDataChanged) {
        onDataChanged();
      }

      // Reload page to re-initialize all states from pristine default storage
      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (err) {
      console.error('Failed to execute factory reset:', err);
      // Fallback: still reset storage and reload
      resetStorageToFactoryDefaults();
      window.location.reload();
    }
  };

  // Auto load some initial baseline models if none loaded yet
  useEffect(() => {
    if (fetchedModels.length === 0) {
      setFetchedModels([
        { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (默认推荐/超快响应)', type: 'text', owned_by: 'Google' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (深度推理模型)', type: 'text', owned_by: 'Google' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (最新低延迟)', type: 'text', owned_by: 'Google' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (逻辑与计算增强)', type: 'text', owned_by: 'Google' },
        { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat 官方兼容)', type: 'text', owned_by: 'DeepSeek' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度推理模型)', type: 'text', owned_by: 'DeepSeek' },
        { id: 'gpt-4o', name: 'GPT-4o (OpenAI 官方/反代)', type: 'text', owned_by: 'OpenAI' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (轻量级高并发)', type: 'text', owned_by: 'OpenAI' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Anthropic)', type: 'text', owned_by: 'Anthropic' },
      ]);
    }
  }, []);

  // Helpers to get saved and effective keys
  const getSavedTextKey = () => {
    const activeProvider = config.textProvider || 'google_gemini';
    const inProviders = config.providers?.[activeProvider]?.apiKey;
    if (inProviders) return inProviders;
    if (config.textApiKey) return config.textApiKey;
    const stored = loadApiConfig();
    return stored.providers?.[activeProvider]?.apiKey || stored.textApiKey || '';
  };

  const getEffectiveTextApiKey = () => {
    if (explicitlyClearedTextKey) return '';
    if (textApiKeyInput.trim()) return textApiKeyInput.trim();
    return getSavedTextKey();
  };

  const getSavedImageKey = () => {
    if (config.imageApiKey) return config.imageApiKey;
    const stored = loadApiConfig();
    return stored.imageApiKey || '';
  };

  const getEffectiveImageApiKey = () => {
    if (explicitlyClearedImageKey) return '';
    if (imageApiKeyInput.trim()) return imageApiKeyInput.trim();
    return getSavedImageKey();
  };

  const getSavedVoiceKey = () => {
    if (config.voiceApiKey) return config.voiceApiKey;
    const stored = loadApiConfig();
    return stored.voiceApiKey || '';
  };

  const getEffectiveVoiceApiKey = () => {
    if (explicitlyClearedVoiceKey) return '';
    if (voiceApiKeyInput.trim()) return voiceApiKeyInput.trim();
    return getSavedVoiceKey();
  };

  const handleClearTextKey = () => {
    setExplicitlyClearedTextKey(true);
    setTextApiKeyInput('');
    const activeProvider = config.textProvider || 'google_gemini';
    setConfig((prev) => ({
      ...prev,
      textApiKey: '',
      providers: {
        ...(prev.providers || {}),
        [activeProvider]: {
          ...(prev.providers?.[activeProvider] || {
            provider: activeProvider,
            baseUrl: prev.textBaseUrl || '',
            model: prev.textModel || '',
          }),
          apiKey: '',
        },
      },
    }));
  };

  const handleClearImageKey = () => {
    setExplicitlyClearedImageKey(true);
    setImageApiKeyInput('');
    setConfig((prev) => ({ ...prev, imageApiKey: '' }));
  };

  const handleClearVoiceKey = () => {
    setExplicitlyClearedVoiceKey(true);
    setVoiceApiKeyInput('');
    setConfig((prev) => ({ ...prev, voiceApiKey: '' }));
  };

  const handleGlobalSave = () => {
    const activeProvider = config.textProvider || 'google_gemini';
    const effectiveTextKey = getEffectiveTextApiKey();
    const effectiveImageKey = getEffectiveImageApiKey();
    const effectiveVoiceKey = getEffectiveVoiceApiKey();

    const effectiveTextBaseUrl = config.textBaseUrl !== undefined ? config.textBaseUrl.trim() : (config.providers?.[activeProvider]?.baseUrl || '');
    const effectiveTextModel = config.textModel?.trim() || config.providers?.[activeProvider]?.model || 'gemini-3.6-flash';

    const updatedProviders = {
      ...(config.providers || {}),
      [activeProvider]: {
        provider: activeProvider,
        apiKey: effectiveTextKey,
        baseUrl: effectiveTextBaseUrl,
        model: effectiveTextModel,
      },
    };

    const finalConfig: ApiConfig = {
      ...config,
      textProvider: activeProvider,
      textApiKey: effectiveTextKey,
      textBaseUrl: effectiveTextBaseUrl,
      textModel: effectiveTextModel,
      imageApiKey: effectiveImageKey,
      imageBaseUrl: config.imageBaseUrl !== undefined ? config.imageBaseUrl.trim() : '',
      imageModel: config.imageModel?.trim() || 'dall-e-3',
      voiceApiKey: effectiveVoiceKey,
      voiceBaseUrl: config.voiceBaseUrl !== undefined ? config.voiceBaseUrl.trim() : '',
      voiceModel: config.voiceModel?.trim() || 'tts-1',
      providers: updatedProviders,
    };

    // 1. Direct persistence to storage
    saveApiConfig(finalConfig);

    // 2. Notify parent App.tsx state
    onSaveApiConfig(finalConfig);
    onSaveAiControls(controls);

    // 3. Update local component state
    setConfig(finalConfig);
    setTextApiKeyInput(effectiveTextKey);
    setImageApiKeyInput(effectiveImageKey);
    setVoiceApiKeyInput(effectiveVoiceKey);
    setExplicitlyClearedTextKey(false);
    setExplicitlyClearedImageKey(false);
    setExplicitlyClearedVoiceKey(false);

    setSaveSuccessMsg('🎉 全局 API Provider 配置与系统设置已保存生效！');
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  // 1. Real Connection Test
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);
    setModelTestResult(null);

    const activeProvider = config.textProvider || 'google_gemini';
    const effectiveTextKey = getEffectiveTextApiKey();
    const effectiveTextBaseUrl = config.textBaseUrl !== undefined ? config.textBaseUrl.trim() : (config.providers?.[activeProvider]?.baseUrl || '');

    const baseUrl = activeCategory === 'text'
      ? effectiveTextBaseUrl
      : activeCategory === 'image'
      ? (config.imageBaseUrl || '')
      : (config.voiceBaseUrl || '');

    const apiKey = activeCategory === 'text'
      ? effectiveTextKey
      : activeCategory === 'image'
      ? getEffectiveImageApiKey()
      : getEffectiveVoiceApiKey();

    const providerType = activeCategory === 'text'
      ? (config.textProvider || 'google_gemini')
      : activeCategory === 'image'
      ? (config.imageProvider || 'openai_compatible')
      : (config.voiceProvider || 'openai_compatible');

    try {
      const res = await fetch('/api/provider/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          serviceType: activeCategory,
          customHeaders: config.customHeaders,
        }),
      });

      const text = await res.text();
      let data: ConnectionTestResult;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          success: false,
          latencyMs: 0,
          providerType: providerType || 'custom',
          checkedEndpoint: baseUrl || '未配置',
          errorType: 'backend_offline',
          message: 'Android 内置后端未启动',
          error: '后端服务未就绪或未返回 JSON 响应。请确认应用完全初始化。',
        };
      }

      if (data.error === 'Android 内置后端未启动' || res.status === 503) {
        data.errorType = 'backend_offline';
        data.message = 'Android 内置后端未启动';
      }

      setConnectionResult(data);

      if (data.success) {
        setSaveSuccessMsg(`⚡ 连接测试成功！HTTP 200 链路畅通 (延迟: ${data.latencyMs}ms)`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      const isOffline = (e.message || '').includes('Android 内置后端未启动') || (e.message || '').includes('Failed to fetch');
      setConnectionResult({
        success: false,
        latencyMs: 0,
        providerType: providerType || 'custom',
        checkedEndpoint: baseUrl || '未配置',
        errorType: isOffline ? 'backend_offline' : 'network_error',
        message: isOffline ? 'Android 内置后端未启动' : '前端网络请求异常，无法连接后端代理服务',
        error: e.message || '网络请求错误',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // 2. Real Models Fetching from Server
  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelFetchResult(null);

    const activeProvider = config.textProvider || 'google_gemini';
    const effectiveTextKey = getEffectiveTextApiKey();
    const effectiveTextBaseUrl = config.textBaseUrl !== undefined ? config.textBaseUrl.trim() : (config.providers?.[activeProvider]?.baseUrl || '');

    const baseUrl = activeCategory === 'text'
      ? effectiveTextBaseUrl
      : activeCategory === 'image'
      ? (config.imageBaseUrl || '')
      : (config.voiceBaseUrl || '');

    const apiKey = activeCategory === 'text'
      ? effectiveTextKey
      : activeCategory === 'image'
      ? getEffectiveImageApiKey()
      : getEffectiveVoiceApiKey();

    const providerType = activeCategory === 'text'
      ? (config.textProvider || 'google_gemini')
      : activeCategory === 'image'
      ? (config.imageProvider || 'openai_compatible')
      : (config.voiceProvider || 'openai_compatible');

    try {
      const res = await fetch('/api/provider/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          serviceType: activeCategory,
          customHeaders: config.customHeaders,
        }),
      });

      const text = await res.text();
      let data: ModelFetchResult;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          success: false,
          supported: false,
          models: [],
          message: 'Android 内置后端未启动',
          error: '后端服务未就绪或未返回 JSON 响应。',
        };
      }

      if (data.message === 'Android 内置后端未启动' || res.status === 503) {
        data.message = 'Android 内置后端未启动';
      }

      setModelFetchResult(data);

      if (data.success && data.models && data.models.length > 0) {
        setFetchedModels(data.models);
        setSaveSuccessMsg(`🎉 成功从 API 服务端获取到 ${data.models.length} 个真实模型！`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      const isOffline = (e.message || '').includes('Android 内置后端未启动') || (e.message || '').includes('Failed to fetch');
      setModelFetchResult({
        success: false,
        supported: false,
        models: [],
        message: isOffline ? 'Android 内置后端未启动' : '拉取模型列表失败',
        error: e.message || '网络请求错误',
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  // 3. Real Single Model Execution Test
  const handleTestSelectedModel = async () => {
    setIsTestingModel(true);
    setModelTestResult(null);

    const activeProvider = config.textProvider || 'google_gemini';
    const effectiveTextKey = getEffectiveTextApiKey();
    const effectiveTextBaseUrl = config.textBaseUrl !== undefined ? config.textBaseUrl.trim() : (config.providers?.[activeProvider]?.baseUrl || '');

    const baseUrl = activeCategory === 'text'
      ? effectiveTextBaseUrl
      : activeCategory === 'image'
      ? (config.imageBaseUrl || '')
      : (config.voiceBaseUrl || '');

    const apiKey = activeCategory === 'text'
      ? effectiveTextKey
      : activeCategory === 'image'
      ? getEffectiveImageApiKey()
      : getEffectiveVoiceApiKey();

    const providerType = activeCategory === 'text'
      ? (config.textProvider || 'google_gemini')
      : activeCategory === 'image'
      ? (config.imageProvider || 'openai_compatible')
      : (config.voiceProvider || 'openai_compatible');

    const model = activeCategory === 'text' ? config.textModel : activeCategory === 'image' ? config.imageModel : config.voiceModel;

    try {
      const res = await fetch('/api/provider/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          model,
          serviceType: activeCategory,
          testPrompt: '请用一句话回答：当前 API Provider 与指定模型已成功连接，可以正常对话！',
          customHeaders: config.customHeaders,
        }),
      });

      const text = await res.text();
      let data: ModelTestResult;
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          success: false,
          latencyMs: 0,
          model,
          reply: '',
          error: 'Android 内置后端未启动：后端未就绪或未返回 JSON 响应。',
        };
      }

      setModelTestResult(data);

      if (data.success) {
        setSaveSuccessMsg(`✨ 模型 [${model}] 真实调用测试成功！(耗时: ${data.latencyMs}ms)`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      const isOffline = (e.message || '').includes('Android 内置后端未启动') || (e.message || '').includes('Failed to fetch');
      setModelTestResult({
        success: false,
        latencyMs: 0,
        model,
        reply: '',
        error: isOffline ? 'Android 内置后端未启动' : (e.message || '请求异常'),
      });
    } finally {
      setIsTestingModel(false);
    }
  };

  // Quick Preset Selection (with multi-provider preservation)
  const applyTextPreset = (preset: ProviderPreset) => {
    const currentProvider = config.textProvider || 'google_gemini';

    // Calculate current effective key for the provider we are leaving
    const currentSavedKey = config.providers?.[currentProvider]?.apiKey || config.textApiKey || '';
    const currentEffectiveKey = explicitlyClearedTextKey ? '' : (textApiKeyInput.trim() || currentSavedKey);
    const currentBaseUrl = config.textBaseUrl !== undefined ? config.textBaseUrl.trim() : '';
    const currentModel = config.textModel || '';

    // Snapshot current provider
    const updatedProviders = {
      ...(config.providers || {}),
      [currentProvider]: {
        provider: currentProvider,
        apiKey: currentEffectiveKey,
        baseUrl: currentBaseUrl,
        model: currentModel,
      },
    };

    // Load destination provider
    const target = updatedProviders[preset.id] || {
      provider: preset.id,
      apiKey: '',
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
    };

    const targetBaseUrl = target.baseUrl !== undefined && target.baseUrl !== '' ? target.baseUrl : preset.defaultBaseUrl;
    const targetModel = target.model || preset.defaultModel;
    const targetKey = target.apiKey || '';

    setTextApiKeyInput(targetKey);
    setExplicitlyClearedTextKey(false);

    setConfig((prev) => ({
      ...prev,
      textProvider: preset.id,
      textBaseUrl: targetBaseUrl,
      textModel: targetModel,
      textApiKey: targetKey,
      providers: updatedProviders,
    }));

    setConnectionResult(null);
    setModelFetchResult(null);
    setModelTestResult(null);
  };

  // JSON format adapter handler
  const handleAdapterJson = async () => {
    if (!rawJsonInput.trim()) return;
    setIsAdaptingJson(true);
    try {
      const res = await fetch('/api/gemini/adapter-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawJson: rawJsonInput, apiConfig: config }),
      });
      const data = await res.json();
      if (data.success) {
        setAdaptedJsonOutput(data.json);
        if (data.apiLog) onAddApiLog(data.apiLog);
      }
    } catch (e) {
      console.error('JSON adapter error', e);
    } finally {
      setIsAdaptingJson(false);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        onImportData(text);
      };
      reader.readAsText(file);
    }
  };

  const filteredModels = fetchedModels.filter((m) => {
    if (!modelFilterQuery.trim()) return true;
    const q = modelFilterQuery.toLowerCase();
    return (m.id || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q);
  });

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>⬅ 返回桌面</span>
        </button>
        <span className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-emerald-400" />
          API Provider & 系统设置
        </span>
        <div className="w-16" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 pb-28 text-xs">
        {saveSuccessMsg && (
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 font-medium animate-in fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="leading-snug">{saveSuccessMsg}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 1. API Provider Management Center */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">API Provider 管理系统</h3>
                <p className="text-[10px] text-zinc-400">配置服务商、Base URL、Key，真实测试网络与拉取模型</p>
              </div>
            </div>
          </div>

          {/* Provider Category Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-2xl border border-zinc-800/80">
            <button
              onClick={() => {
                setActiveCategory('text');
                setConnectionResult(null);
                setModelFetchResult(null);
                setModelTestResult(null);
              }}
              className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                activeCategory === 'text'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>💬 文本模型</span>
            </button>
            <button
              onClick={() => {
                setActiveCategory('image');
                setConnectionResult(null);
                setModelFetchResult(null);
                setModelTestResult(null);
              }}
              className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                activeCategory === 'image'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🎨 图像生图</span>
            </button>
            <button
              onClick={() => {
                setActiveCategory('voice');
                setConnectionResult(null);
                setModelFetchResult(null);
                setModelTestResult(null);
              }}
              className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                activeCategory === 'voice'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>🎙️ 语音合成</span>
            </button>
          </div>

          {/* ==================== 1.1 TEXT PROVIDER WORKFLOW ==================== */}
          {activeCategory === 'text' && (
            <div className="space-y-4">
              {/* Provider Fast Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-300 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    选择 API 服务商 (Provider) 预设
                  </span>
                  <span className="text-zinc-500 text-[10px]">点击一键填入端点格式</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {TEXT_PROVIDER_PRESETS.map((preset) => {
                    const isSelected =
                      config.textProvider === preset.id ||
                      (!config.textProvider && preset.id === 'google_gemini' && !config.textBaseUrl);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyTextPreset(preset)}
                        className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between gap-1 transition ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-sm ring-1 ring-cyan-500/30'
                            : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-[11px] truncate">{preset.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              isSelected
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {preset.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 line-clamp-1">{preset.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 1: Base URL & API Key */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 font-mono text-[10px] flex items-center justify-center">
                      1
                    </span>
                    配置 API 基础信息 (Base URL & Key)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {config.textBaseUrl ? '自定义反代模式' : 'Google 原生端点'}
                  </span>
                </div>

                {/* Base URL Input */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center justify-between">
                    <span>API Base URL / 接口根地址</span>
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, textBaseUrl: '' })}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      清空(使用默认)
                    </button>
                  </label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1 或 https://generativelanguage.googleapis.com"
                    value={config.textBaseUrl || ''}
                    onChange={(e) => setConfig({ ...config, textBaseUrl: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-cyan-300 font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>

                {/* API Key Input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-zinc-400 font-medium flex items-center gap-1.5">
                      <span>API 密钥 (API Key / Token)</span>
                      {getSavedTextKey() && !explicitlyClearedTextKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono">
                          ✓ 已安全保存 (•{getSavedTextKey().length > 8 ? getSavedTextKey().slice(-4) : '已存'})
                        </span>
                      )}
                    </label>
                    {getSavedTextKey() && !explicitlyClearedTextKey ? (
                      <button
                        type="button"
                        onClick={handleClearTextKey}
                        className="text-[10px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                      >
                        清除/删除Key
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-500">密钥绝不在前端明文暴露</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showTextKey ? 'text' : 'password'}
                      placeholder={getSavedTextKey() && !explicitlyClearedTextKey ? '已保存有效密钥（留空保持不变；输入新 Key 覆盖）' : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'}
                      value={textApiKeyInput}
                      onChange={(e) => {
                        setTextApiKeyInput(e.target.value);
                        setExplicitlyClearedTextKey(false);
                      }}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTextKey(!showTextKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                    >
                      {showTextKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Action Buttons (Test Connection & Fetch Models) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 font-mono text-[10px] flex items-center justify-center">
                      2
                    </span>
                    网络连通性验证与模型拉取
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Test Connection Button */}
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="py-2.5 px-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-bounce text-yellow-300' : ''}`} />
                    <span>{isTestingConnection ? '正在测试连接...' : '⚡ 测试连接 (Test)'}</span>
                  </button>

                  {/* Fetch Models Button */}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    <span>{isFetchingModels ? '正在拉取模型...' : '📋 获取模型列表'}</span>
                  </button>
                </div>

                {/* Connection Test Result Feedback Card */}
                {connectionResult && (
                  <div
                    className={`p-3 rounded-2xl border text-xs space-y-1.5 transition ${
                      connectionResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-1.5">
                        {connectionResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{connectionResult.success ? '连接测试通过 (HTTP 200)' : '连接测试失败'}</span>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-black/40">
                        {connectionResult.latencyMs}ms
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-300">{connectionResult.message}</p>

                    {connectionResult.checkedEndpoint && (
                      <div className="text-[10px] font-mono text-zinc-400 break-all bg-black/30 p-1.5 rounded-lg">
                        端点: {connectionResult.checkedEndpoint}
                      </div>
                    )}

                    {connectionResult.error && (
                      <div className="text-[10px] font-mono text-rose-300 break-all bg-rose-950/60 p-2 rounded-xl border border-rose-500/30">
                        错误详情: {connectionResult.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Model Fetch Result Feedback Banner */}
                {modelFetchResult && !modelFetchResult.success && (
                  <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>未能自动拉取模型列表</span>
                    </div>
                    <p className="text-[11px] text-amber-200">{modelFetchResult.message}</p>
                    {modelFetchResult.error && (
                      <p className="text-[10px] font-mono text-amber-300/80 break-all">{modelFetchResult.error}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Model Selection (Dropdown with Search & Manual Input) */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 font-mono text-[10px] flex items-center justify-center">
                      3
                    </span>
                    选择或指定模型 (Target Model)
                  </span>
                  <span className="text-[10px] text-cyan-400 font-medium">
                    当前: <span className="font-mono">{config.textModel}</span>
                  </span>
                </div>

                {/* Model Search & Select */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="🔍 搜索已获取的模型 ID..."
                      value={modelFilterQuery}
                      onChange={(e) => setModelFilterQuery(e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-[11px] placeholder-zinc-500"
                    />
                    <span className="text-[10px] text-zinc-500">共 {fetchedModels.length} 个模型</span>
                  </div>

                  <select
                    value={config.textModel}
                    onChange={(e) => {
                      setConfig({ ...config, textModel: e.target.value });
                      setModelTestResult(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500 transition"
                  >
                    {filteredModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} {m.name && m.name !== m.id ? `(${m.name})` : ''} {m.owned_by ? `[${m.owned_by}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Manual Model Override Input */}
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] text-zinc-400">或者手动自定义输入模型名称 (Model ID):</label>
                  <input
                    type="text"
                    placeholder="例如: gpt-4o, deepseek-chat, claude-3-5-sonnet, qwen-max..."
                    value={config.textModel}
                    onChange={(e) => setConfig({ ...config, textModel: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Step 4: Test Selected Model */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestSelectedModel}
                    disabled={isTestingModel || !config.textModel}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                  >
                    <Play className={`w-3.5 h-3.5 ${isTestingModel ? 'animate-spin' : ''}`} />
                    <span>{isTestingModel ? `正在向 [${config.textModel}] 发送单次测试...` : `🧪 真实测试当前选定模型 (${config.textModel})`}</span>
                  </button>

                  {/* Model Test Result Panel */}
                  {modelTestResult && (
                    <div
                      className={`mt-2.5 p-3 rounded-2xl border text-xs space-y-1.5 ${
                        modelTestResult.success
                          ? 'bg-purple-950/40 border-purple-500/50 text-purple-200'
                          : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <div className="flex items-center gap-1.5">
                          {modelTestResult.success ? (
                            <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span>模型响应测试 {modelTestResult.success ? '成功' : '失败'}</span>
                        </div>
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-black/40">
                          {modelTestResult.latencyMs}ms
                        </span>
                      </div>

                      {modelTestResult.reply && (
                        <div className="p-2.5 rounded-xl bg-black/50 border border-purple-500/30 text-purple-100 font-sans text-[11px] leading-relaxed">
                          💬 模型回复: "{modelTestResult.reply}"
                        </div>
                      )}

                      {modelTestResult.error && (
                        <div className="text-[10px] font-mono text-rose-300 break-all bg-rose-950/60 p-2 rounded-xl border border-rose-500/30">
                          {modelTestResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 1.2 IMAGE PROVIDER WORKFLOW ==================== */}
          {activeCategory === 'image' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-pink-400" />
                    图像生成 API (朋友圈配图 / 角色立绘)
                  </span>
                  <span className="text-[10px] text-pink-400 font-mono">DALL-E / Imagen / SD</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">图像 API Base URL (留空默认同主接口)</label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={config.imageBaseUrl || ''}
                    onChange={(e) => setConfig({ ...config, imageBaseUrl: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-pink-300 font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-zinc-400 font-medium flex items-center gap-1.5">
                      <span>图像 API Key (留空默认同主密钥)</span>
                      {getSavedImageKey() && !explicitlyClearedImageKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono">
                          ✓ 已保存 (•{getSavedImageKey().length > 8 ? getSavedImageKey().slice(-4) : '已存'})
                        </span>
                      )}
                    </label>
                    {getSavedImageKey() && !explicitlyClearedImageKey && (
                      <button
                        type="button"
                        onClick={handleClearImageKey}
                        className="text-[10px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                      >
                        清除Key
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showImageKey ? 'text' : 'password'}
                      placeholder={getSavedImageKey() && !explicitlyClearedImageKey ? '已保存有效密钥（留空保持不变；输入新 Key 覆盖）' : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'}
                      value={imageApiKeyInput}
                      onChange={(e) => {
                        setImageApiKeyInput(e.target.value);
                        setExplicitlyClearedImageKey(false);
                      }}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-500 focus:outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowImageKey(!showImageKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                    >
                      {showImageKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">图像模型 (Model)</label>
                  <input
                    type="text"
                    placeholder="dall-e-3, imagen-3.0-generate-002, flux-schnell..."
                    value={config.imageModel || 'dall-e-3'}
                    onChange={(e) => setConfig({ ...config, imageModel: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isTestingConnection ? '测试中...' : '测试图像连接'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>拉取图像模型</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 1.3 VOICE PROVIDER WORKFLOW ==================== */}
          {activeCategory === 'voice' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-amber-400" />
                    语音合成 / TTS API (消息语音朗读)
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">OpenAI TTS / Edge</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">语音 API Base URL</label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={config.voiceBaseUrl || ''}
                    onChange={(e) => setConfig({ ...config, voiceBaseUrl: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-300 font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-zinc-400 font-medium flex items-center gap-1.5">
                      <span>语音 API Key</span>
                      {getSavedVoiceKey() && !explicitlyClearedVoiceKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono">
                          ✓ 已保存 (•{getSavedVoiceKey().length > 8 ? getSavedVoiceKey().slice(-4) : '已存'})
                        </span>
                      )}
                    </label>
                    {getSavedVoiceKey() && !explicitlyClearedVoiceKey && (
                      <button
                        type="button"
                        onClick={handleClearVoiceKey}
                        className="text-[10px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                      >
                        清除Key
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showVoiceKey ? 'text' : 'password'}
                      placeholder={getSavedVoiceKey() && !explicitlyClearedVoiceKey ? '已保存有效密钥（留空保持不变；输入新 Key 覆盖）' : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'}
                      value={voiceApiKeyInput}
                      onChange={(e) => {
                        setVoiceApiKeyInput(e.target.value);
                        setExplicitlyClearedVoiceKey(false);
                      }}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVoiceKey(!showVoiceKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                    >
                      {showVoiceKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 font-medium">语音模型 (Model)</label>
                  <input
                    type="text"
                    placeholder="tts-1, tts-1-hd, whisper-1..."
                    value={config.voiceModel || 'tts-1'}
                    onChange={(e) => setConfig({ ...config, voiceModel: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. AI Behavior & System Permissions Controls */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-purple-400 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            2. AI 行为与智能感知
          </h3>

          <div className="flex items-center justify-between py-1">
            <div>
              <span className="block font-medium text-zinc-200">AI 后台静默感知活动</span>
              <span className="text-[10px] text-zinc-400">允许 AI 自动根据天气、日程与健康数据进行推演</span>
            </div>
            <input
              type="checkbox"
              checked={controls.backgroundActive}
              onChange={(e) => setControls({ ...controls, backgroundActive: e.target.checked })}
              className="w-5 h-5 accent-purple-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between py-1 border-t border-zinc-800">
            <div>
              <span className="block font-medium text-zinc-200">AI 主动关怀与通知弹窗</span>
              <span className="text-[10px] text-zinc-400">遇到突发降雨或特殊健康阶段时主动发来消息</span>
            </div>
            <input
              type="checkbox"
              checked={controls.proactivePopups}
              onChange={(e) => setControls({ ...controls, proactivePopups: e.target.checked })}
              className="w-5 h-5 accent-purple-500 cursor-pointer"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. JSON Format Adapter Tool */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            3. JSON 格式适配与校验工具
          </h3>
          <p className="text-[11px] text-zinc-400">
            粘贴非标准、乱序或语法错误的 raw JSON，一键调用配置的 API 校验并格式化为合法标准 JSON。
          </p>

          <textarea
            rows={3}
            placeholder="在此粘贴 raw / 混淆 JSON 字符串..."
            value={rawJsonInput}
            onChange={(e) => setRawJsonInput(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-mono text-[11px]"
          />

          <button
            onClick={handleAdapterJson}
            disabled={isAdaptingJson || !rawJsonInput.trim()}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-zinc-950 font-bold flex items-center justify-center gap-2 shadow-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isAdaptingJson ? 'API 自动解析校验 JSON 中...' : '一键调用 API 校验重构 JSON'}</span>
          </button>

          {adaptedJsonOutput && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <span className="block font-medium text-amber-300">重构标准 JSON 结果:</span>
              <pre className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-emerald-400 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {adaptedJsonOutput}
              </pre>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. Data Management & Backup */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-blue-400 flex items-center gap-2">
              <Database className="w-4 h-4" />
              4. 数据管理与备份回滚中心
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              本地安全解析
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            支持 ZIP、JSON、JSONL、TXT 多格式数据导入导出，自动识别 AI 角色/人设/聊天记录/长期记忆/群聊，智能去重合并与多重历史快照回滚。
          </p>

          {/* Primary Action Button */}
          <button
            onClick={() => {
              setDataModalTab('import');
              setShowDataModal(true);
            }}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <Database className="w-4 h-4" />
            <span>打开数据管理中心 (导入/导出/去重/回滚)</span>
          </button>

          {/* Quick Action Buttons Grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => {
                setDataModalTab('import');
                setShowDataModal(true);
              }}
              className="p-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 font-medium transition"
            >
              <Upload className="w-4 h-4 text-blue-400" />
              <span>导入数据</span>
              <span className="text-[9px] text-zinc-400">ZIP/JSON/TXT</span>
            </button>

            <button
              onClick={() => {
                setDataModalTab('export');
                setShowDataModal(true);
              }}
              className="p-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 font-medium transition"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>导出数据</span>
              <span className="text-[9px] text-zinc-400">4种格式可选</span>
            </button>

            <button
              onClick={() => {
                setDataModalTab('snapshots');
                setShowDataModal(true);
              }}
              className="p-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 font-medium transition"
            >
              <History className="w-4 h-4 text-purple-400" />
              <span>快照回滚</span>
              <span className="text-[9px] text-zinc-400">安全防误删</span>
            </button>
          </div>

          {/* Upgrade Protection & Version Status Card */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">安全增量升级 / 用户数据保护</h4>
                  <p className="text-[10px] text-zinc-400">覆盖安装与 APK 更新时 100% 保留所有聊天、角色与记忆</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                保护生效中
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-400 block">应用包名 (固定不变)</span>
                <span className="font-mono text-zinc-200 font-semibold truncate block">com.aistudio.aiphone</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-400 block">版本与模式结构</span>
                <span className="font-mono text-emerald-400 font-semibold block">
                  v{CURRENT_APP_VERSION_NAME} (code {CURRENT_APP_VERSION_CODE}) / schema v{CURRENT_APP_DATA_VERSION}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setUpgradeLogs(getUpgradeProtectionLogs());
                setShowUpgradeLogsModal(true);
              }}
              className="w-full py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99]"
            >
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>查看升级数据保护日志 (Migration Logs)</span>
            </button>
          </div>

          <button
            onClick={() => setShowResetConfirmModal(true)}
            className="w-full py-2.5 rounded-2xl bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 hover:text-rose-200 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            恢复出厂设置 (清空所有后加内容)
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Factory Reset (恢复出厂设置) */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-rose-500/30 rounded-3xl p-5 max-w-sm w-full shadow-2xl shadow-rose-950/40 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-950/50 border border-rose-500/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-8 h-8 text-rose-400 animate-pulse" />
            </div>

            <h3 className="text-base font-bold text-white mb-1.5">确认要恢复出厂设置吗？</h3>
            
            <p className="text-xs text-zinc-300 leading-relaxed mb-4 text-left bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
              ⚠️ <span className="font-semibold text-rose-300">警告：</span>点击确认后，将执行实打实的彻底清除：
              <br />• 清空所有后来添加的 AI 角色与自定义设定
              <br />• 清空所有聊天记录与 AI 独立记忆空间 (文件与知识切片)
              <br />• 清空所有动态、便签、世界书设定与游戏战绩
              <br />• 恢复系统默认壁纸、主题及初始状态
              <br /><span className="text-zinc-400 text-[11px] block mt-1">此操作无法撤销，请谨慎操作！</span>
            </p>

            {resetSuccessMessage ? (
              <div className="w-full py-2.5 px-3 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>{resetSuccessMessage}</span>
              </div>
            ) : (
              <div className="flex gap-2.5 w-full">
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => setShowResetConfirmModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handleExecuteFactoryReset}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-rose-600/30 disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在清空重置...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>确认恢复出厂</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Protection Logs Modal */}
      {showUpgradeLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-5 max-w-md w-full max-h-[85vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">升级数据保护日志</h3>
                  <p className="text-[10px] text-zinc-400">仅记录保护结果与补充项，不泄露任何私密内容或密钥</p>
                </div>
              </div>
              <button
                onClick={() => setShowUpgradeLogsModal(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {upgradeLogs.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  暂无升级日志记录（当前为初始版本或未发生跨版本迁移）
                </div>
              ) : (
                upgradeLogs.map((log, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-400">
                        从版本 {log.fromDataVersion} 升级至版本 {log.toDataVersion}
                      </span>
                      <span className="text-zinc-500 text-[10px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-[10px] text-zinc-400">
                      版本代码: versionCode {log.toVersionCode} (旧版: {log.fromVersionCode})
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-zinc-800/50">
                      {log.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="text-zinc-200 font-medium shrink-0">{item.name}:</span>
                          <span
                            className={`text-right leading-tight ${
                              item.status === 'preserved'
                                ? 'text-emerald-400'
                                : item.status === 'supplemented'
                                ? 'text-blue-400'
                                : 'text-zinc-400'
                            }`}
                          >
                            {item.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowUpgradeLogsModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-featured Data Management Modal */}
      <DataManagementModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        initialTab={dataModalTab}
        onDataChanged={() => {
          if (onDataChanged) onDataChanged();
        }}
      />

      {/* Sticky Bottom Save Settings Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3.5 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 z-30">
        <button
          onClick={handleGlobalSave}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-bold text-sm text-white shadow-lg shadow-emerald-500/25 active:scale-95 transition flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          保存全局系统设置 (Save Settings)
        </button>
      </div>
    </div>
  );
};
