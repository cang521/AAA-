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
} from 'lucide-react';

interface SettingsAppProps {
  onBackToLauncher: () => void;
  apiConfig: ApiConfig;
  aiControls: AiControls;
  onSaveApiConfig: (config: ApiConfig) => void;
  onSaveAiControls: (controls: AiControls) => void;
  onClearChats: () => void;
  onExportData: () => void;
  onImportData: (jsonStr: string) => void;
  onAddApiLog: (log: ApiLog) => void;
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
}) => {
  const [config, setConfig] = useState<ApiConfig>(apiConfig);
  const [controls, setControls] = useState<AiControls>(aiControls);

  // Active Provider Category Tab
  const [activeCategory, setActiveCategory] = useState<'text' | 'image' | 'voice'>('text');

  // Key Visibility toggles
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showVoiceKey, setShowVoiceKey] = useState(false);

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

  const handleGlobalSave = () => {
    onSaveApiConfig(config);
    onSaveAiControls(controls);
    setSaveSuccessMsg('🎉 全局 API Provider 配置与系统设置已保存生效！');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // 1. Real Connection Test
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);
    setModelTestResult(null);

    const baseUrl = activeCategory === 'text' ? config.textBaseUrl : activeCategory === 'image' ? config.imageBaseUrl : config.voiceBaseUrl;
    const apiKey = activeCategory === 'text' ? config.textApiKey : activeCategory === 'image' ? config.imageApiKey : config.voiceApiKey;
    const providerType = activeCategory === 'text' ? config.textProvider : activeCategory === 'image' ? config.imageProvider : config.voiceProvider;

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

      const data: ConnectionTestResult = await res.json();
      setConnectionResult(data);

      if (data.success) {
        setSaveSuccessMsg(`⚡ 连接测试成功！HTTP 200 链路畅通 (延迟: ${data.latencyMs}ms)`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      setConnectionResult({
        success: false,
        latencyMs: 0,
        providerType: providerType || 'custom',
        checkedEndpoint: baseUrl || '未配置',
        errorType: 'network_error',
        message: '前端网络请求异常，无法连接后端代理服务',
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

    const baseUrl = activeCategory === 'text' ? config.textBaseUrl : activeCategory === 'image' ? config.imageBaseUrl : config.voiceBaseUrl;
    const apiKey = activeCategory === 'text' ? config.textApiKey : activeCategory === 'image' ? config.imageApiKey : config.voiceApiKey;
    const providerType = activeCategory === 'text' ? config.textProvider : activeCategory === 'image' ? config.imageProvider : config.voiceProvider;

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

      const data: ModelFetchResult = await res.json();
      setModelFetchResult(data);

      if (data.success && data.models && data.models.length > 0) {
        setFetchedModels(data.models);
        // If current model is not in list, auto suggest the first one or keep current
        setSaveSuccessMsg(`🎉 成功从 API 服务端获取到 ${data.models.length} 个真实模型！`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      setModelFetchResult({
        success: false,
        supported: false,
        models: [],
        message: '拉取模型列表失败',
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

    const baseUrl = activeCategory === 'text' ? config.textBaseUrl : activeCategory === 'image' ? config.imageBaseUrl : config.voiceBaseUrl;
    const apiKey = activeCategory === 'text' ? config.textApiKey : activeCategory === 'image' ? config.imageApiKey : config.voiceApiKey;
    const providerType = activeCategory === 'text' ? config.textProvider : activeCategory === 'image' ? config.imageProvider : config.voiceProvider;
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

      const data: ModelTestResult = await res.json();
      setModelTestResult(data);

      if (data.success) {
        setSaveSuccessMsg(`✨ 模型 [${model}] 真实调用测试成功！(耗时: ${data.latencyMs}ms)`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      setModelTestResult({
        success: false,
        latencyMs: 0,
        model,
        reply: '',
        error: e.message || '请求异常',
      });
    } finally {
      setIsTestingModel(false);
    }
  };

  // Quick Preset Selection
  const applyTextPreset = (preset: ProviderPreset) => {
    setConfig((prev) => ({
      ...prev,
      textProvider: preset.id,
      textBaseUrl: preset.defaultBaseUrl,
      textModel: preset.defaultModel,
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
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center justify-between">
                    <span>API 密钥 (API Key / Token)</span>
                    <span className="text-[10px] text-zinc-500">密钥绝不在前端明文暴露</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showTextKey ? 'text' : 'password'}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={config.textApiKey || ''}
                      onChange={(e) => setConfig({ ...config, textApiKey: e.target.value.trim() })}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition"
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
                  <label className="text-[11px] text-zinc-400 font-medium">图像 API Key (留空默认同主密钥)</label>
                  <div className="relative">
                    <input
                      type={showImageKey ? 'text' : 'password'}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={config.imageApiKey || ''}
                      onChange={(e) => setConfig({ ...config, imageApiKey: e.target.value.trim() })}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-pink-500"
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
                  <label className="text-[11px] text-zinc-400 font-medium">语音 API Key</label>
                  <div className="relative">
                    <input
                      type={showVoiceKey ? 'text' : 'password'}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={config.voiceApiKey || ''}
                      onChange={(e) => setConfig({ ...config, voiceApiKey: e.target.value.trim() })}
                      className="w-full px-3 py-2 pr-10 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500"
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
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-blue-400 flex items-center gap-2">
            <Database className="w-4 h-4" />
            4. 数据备份与管理
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExportData}
              className="p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 font-medium"
            >
              <Download className="w-5 h-5 text-emerald-400" />
              导出全部数据 (JSON)
            </button>

            <label className="p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 flex flex-col items-center justify-center gap-1 text-zinc-200 font-medium cursor-pointer">
              <Upload className="w-5 h-5 text-blue-400" />
              导入数据文件
              <input type="file" accept=".json" onChange={handleImportFileChange} className="hidden" />
            </label>
          </div>

          <button
            onClick={onClearChats}
            className="w-full py-2.5 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-semibold flex items-center justify-center gap-2 transition"
          >
            <Trash2 className="w-4 h-4" />
            一键清除全局聊天记录
          </button>
        </div>
      </div>

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
