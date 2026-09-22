import React, { useState, useEffect } from 'react';
import { apiFetch, pingBackendHealth } from '../../lib/localBackend';
import { Capacitor } from '@capacitor/core';
import {
  AiControls,
  ApiLog,
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
  ChevronDown,
  Check,
  Sliders,
  X,
} from 'lucide-react';
import { DataManagementModal } from '../data/DataManagementModal';
import { clearAllChatMessages } from '../../lib/chatDb';
import { clearAllAiMemoryVaults } from '../../lib/aiMemoryVaultDb';
import { resetStorageToFactoryDefaults } from '../../lib/storage';
import {
  getUpgradeProtectionLogs,
  CURRENT_APP_DATA_VERSION,
  CURRENT_APP_VERSION_CODE,
  CURRENT_APP_VERSION_NAME,
  UpgradeProtectionLog,
} from '../../lib/dataMigration';
import { ApiSettingsPanel, ProviderPreset } from './ApiSettingsPanel';
import {
  ApiSettings,
  loadApiSettings,
  saveApiSettings,
  getApiConfigForEngine,
} from '../../lib/apiConfigStore';
import {
  addDiagnosticLog,
  getNextSettingsAppRenderIndex,
} from '../../lib/inputTracker';

interface SettingsAppProps {
  onBackToLauncher: () => void;
  aiControls: AiControls;
  onSaveAiControls: (controls: AiControls) => void;
  onClearChats?: () => void;
  onExportData: () => void;
  onImportData: (jsonStr: string) => void;
  onAddApiLog: (log: ApiLog) => void;
  onDataChanged?: () => void;
}

export const SettingsApp: React.FC<SettingsAppProps> = ({
  onBackToLauncher,
  aiControls,
  onSaveAiControls,
  onClearChats,
  onExportData,
  onImportData,
  onAddApiLog,
  onDataChanged,
}) => {
  // 唯一 API 配置 State：从 apiConfigStore 初始化
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings());
  const [savedVerification, setSavedVerification] = useState<ApiSettings | null>(null);

  // 追踪 SettingsApp Render 序号与真实 State
  const settingsAppRenderCount = React.useRef(0);
  settingsAppRenderCount.current += 1;

  useEffect(() => {
    const renderIdx = settingsAppRenderCount.current;
    const baseLen = settings.text?.baseUrl?.length || 0;
    const keyLen = settings.text?.apiKey?.length || 0;
    const keyLast4 = (settings.text?.apiKey || '').slice(-4);

    addDiagnosticLog({
      tag: `[SETTINGSAPP_RENDER] #${renderIdx}`,
      baseUrlLen: baseLen,
      baseUrlVal: settings.text?.baseUrl || '',
      keyLen: keyLen,
      keyLast4: keyLast4,
      renderIndex: renderIdx,
      details: `SettingsApp state check: baseUrl len=${baseLen}, apiKey len=${keyLen} (last4=${keyLast4})`,
    });
  });

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
  const [fetchDebugInfo, setFetchDebugInfo] = useState<{
    timestamp: string;
    providerType: string;
    baseUrl: string;
    keyIsEmpty: boolean;
    keyLength: number;
    keyLast4: string;
    httpStatus?: number | string;
    reachedServer?: boolean;
    responseMessage?: string;
    responseError?: string;
    isNativePlatform?: boolean;
    capacitorPlatform?: string;
    targetUrl?: string;
    backendHealthOk?: boolean;
    failureStage?: string;
    upstreamDiagnostics?: any;
    attemptsTrace?: any;
  } | null>(null);

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

  // Factory Reset Modal states
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  const handleExecuteFactoryReset = async () => {
    setIsResetting(true);
    try {
      await clearAllChatMessages();
      await clearAllAiMemoryVaults();
      resetStorageToFactoryDefaults();

      setResetSuccessMessage('恢复出厂设置成功！系统即将重新加载...');

      if (onDataChanged) {
        onDataChanged();
      }

      setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (err) {
      console.error('Failed to execute factory reset:', err);
      resetStorageToFactoryDefaults();
      window.location.reload();
    }
  };

  // Auto load default baseline models
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

  const handleClearTextKey = () => {
    setSettings((prev) => {
      const prevBaseLen = prev.text?.baseUrl?.length || 0;
      const prevKeyLen = prev.text?.apiKey?.length || 0;
      const next = {
        ...prev,
        text: { ...prev.text, apiKey: '' },
      };
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_TEXT_KEY]',
        baseUrlLen: prevBaseLen,
        baseUrlVal: prev.text?.baseUrl || '',
        keyLen: 0,
        keyLast4: '',
        details: `CLEARED! apiKey len: ${prevKeyLen} -> 0`,
      });
      return next;
    });
  };

  const handleClearImageKey = () => {
    setSettings((prev) => {
      const next = {
        ...prev,
        image: { ...prev.image, apiKey: '' },
      };
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_IMAGE_KEY]',
        baseUrlLen: prev.text?.baseUrl?.length || 0,
        baseUrlVal: prev.text?.baseUrl || '',
        keyLen: prev.text?.apiKey?.length || 0,
        keyLast4: (prev.text?.apiKey || '').slice(-4),
        details: 'image.apiKey cleared',
      });
      return next;
    });
  };

  const handleClearVoiceKey = () => {
    setSettings((prev) => {
      const next = {
        ...prev,
        voice: { ...prev.voice, apiKey: '' },
      };
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_VOICE_KEY]',
        baseUrlLen: prev.text?.baseUrl?.length || 0,
        baseUrlVal: prev.text?.baseUrl || '',
        keyLen: prev.text?.apiKey?.length || 0,
        keyLast4: (prev.text?.apiKey || '').slice(-4),
        details: 'voice.apiKey cleared',
      });
      return next;
    });
  };

  const handleGlobalSave = () => {
    saveApiSettings(settings);
    const verify = loadApiSettings();
    setSavedVerification(verify);
    onSaveAiControls(controls);

    setSaveSuccessMsg('🎉 全局 API Provider 配置与系统设置已保存生效！');
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  // 1. Connection Test
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);
    setModelTestResult(null);

    const activeConfig = settings[activeCategory];
    const providerType = activeConfig.provider || 'google_gemini';
    const baseUrl = activeConfig.baseUrl || '';
    const apiKey = activeConfig.apiKey || '';

    try {
      const res = await apiFetch('/api/provider/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          serviceType: activeCategory,
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

  // 2. Real Models Fetching from Server (读取当前内存 state，完全绕过持久化/localStorage)
  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelFetchResult(null);

    // 直接使用点击这一刻的当前内存 state，禁止重新读取 localStorage
    const activeConfig = settings[activeCategory];
    const providerType = activeConfig.provider || 'google_gemini';
    const baseUrl = activeConfig.baseUrl || '';
    const apiKey = activeConfig.apiKey || '';

    const isNative = Capacitor.isNativePlatform();
    const capPlatform = Capacitor.getPlatform();
    const targetUrl = isNative ? 'http://127.0.0.1:3000/api/provider/fetch-models' : '/api/provider/fetch-models';
    const isBackendAlive = await pingBackendHealth().catch(() => false);

    let initialFailureStage = '';
    if (isNative && !isBackendAlive) {
      initialFailureStage = '阶段A: Android 内置 127.0.0.1:3000 健康检查未就绪 (Node Backend 尚未正常响应)';
    } else {
      initialFailureStage = '阶段B: 准备发起 apiFetch 网络请求';
    }

    const debugSnapshot = {
      timestamp: new Date().toLocaleTimeString(),
      providerType: providerType || 'custom',
      baseUrl,
      keyIsEmpty: !apiKey || !apiKey.trim(),
      keyLength: apiKey ? apiKey.trim().length : 0,
      keyLast4: apiKey && apiKey.trim() ? apiKey.trim().slice(-4) : '',
      httpStatus: '请求发送中...',
      reachedServer: false,
      responseMessage: '',
      responseError: '',
      isNativePlatform: isNative,
      capacitorPlatform: capPlatform,
      targetUrl,
      backendHealthOk: isBackendAlive,
      failureStage: initialFailureStage,
    };
    setFetchDebugInfo(debugSnapshot);

    try {
      const res = await apiFetch('/api/provider/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          serviceType: activeCategory,
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

      const isOfflineResponse = res.status === 503 || res.headers.get('X-Android-Backend-Status') === 'offline';
      const reachedServer = !isOfflineResponse;

      let stage = '';
      if (reachedServer) {
        stage = '阶段C: 请求已进入 server.ts 端点 (Server reached)';
      } else {
        stage = '阶段A-2: localBackend 拦截并返回 503 / 离线状态 (未到达 server.ts)';
      }

      setFetchDebugInfo({
        ...debugSnapshot,
        httpStatus: res.status,
        reachedServer,
        responseMessage: data.message || (data.success ? `成功获取 ${data.models?.length || 0} 个模型` : ''),
        responseError: data.error || '',
        failureStage: stage,
        upstreamDiagnostics: (data as any).upstreamDiagnostics || null,
        attemptsTrace: (data as any).attemptsTrace || null,
      });

      setModelFetchResult(data);

      if (data.success && data.models && data.models.length > 0) {
        setFetchedModels(data.models);

        // 自动将后端自动探测得出的 apiProtocol 回写并持久化写回 ai_phone_api_settings_v1
        const detectedProtocol = (data as any).apiProtocol;
        if (detectedProtocol) {
          setSettings((prev) => {
            const nextSettings = {
              ...prev,
              [activeCategory]: {
                ...prev[activeCategory],
                apiProtocol: detectedProtocol,
              },
            };
            saveApiSettings(nextSettings);
            addDiagnosticLog({
              tag: '[SETTINGS_WRITE:AUTO_PROTOCOL_PERSISTED]',
              baseUrlLen: nextSettings.text.baseUrl?.length || 0,
              baseUrlVal: nextSettings.text.baseUrl || '',
              keyLen: nextSettings.text.apiKey?.length || 0,
              keyLast4: (nextSettings.text.apiKey || '').slice(-4),
              details: `Auto-detected protocol [${detectedProtocol}] persisted for ${activeCategory}`,
            });
            return nextSettings;
          });
        }

        setSaveSuccessMsg(`🎉 探测成功！匹配 [${detectedProtocol || '通用协议'}]，获取到 ${data.models.length} 个真实模型！`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      const isOffline = (e.message || '').includes('Android 内置后端未启动') || (e.message || '').includes('Failed to fetch');
      setFetchDebugInfo({
        ...debugSnapshot,
        httpStatus: '网络异常',
        reachedServer: false,
        responseMessage: isOffline ? 'Android 内置后端未启动' : '网络请求失败',
        responseError: e.message || '网络请求错误',
        failureStage: `阶段-ERR: 客户端网络调用失败 (${e.name || 'Error'}: ${e.message || '未连接到目标接口'})`,
      });
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

  // 3. Test Selected Model
  const handleTestSelectedModel = async () => {
    setIsTestingModel(true);
    setModelTestResult(null);

    const activeConfig = settings[activeCategory];
    const providerType = activeConfig.provider || 'google_gemini';
    const baseUrl = activeConfig.baseUrl || '';
    const apiKey = activeConfig.apiKey || '';
    const model = activeConfig.model || '';
    const apiProtocol = activeConfig.apiProtocol || '';

    try {
      const res = await apiFetch('/api/provider/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: providerType || 'custom',
          baseUrl,
          apiKey,
          model,
          apiProtocol,
          serviceType: activeCategory,
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
          error: '后端响应异常或尚未启动。',
        };
      }

      setModelTestResult(data);
    } catch (e: any) {
      setModelTestResult({
        success: false,
        latencyMs: 0,
        model,
        reply: '',
        error: e.message || '网络请求失败',
      });
    } finally {
      setIsTestingModel(false);
    }
  };

  // Preset Selection
  const applyTextPreset = (preset: ProviderPreset) => {
    setSettings((prev) => {
      const prevBaseLen = prev.text?.baseUrl?.length || 0;
      const prevKeyLen = prev.text?.apiKey?.length || 0;
      const next = {
        ...prev,
        text: {
          ...prev.text,
          provider: preset.id,
          baseUrl: preset.defaultBaseUrl || prev.text.baseUrl || '',
          model: preset.defaultModel || prev.text.model || '',
          apiKey: prev.text.apiKey || '', // 保留当前 apiKey，禁止改为空
        },
      };
      const nextBaseLen = next.text.baseUrl?.length || 0;
      const nextKeyLen = next.text.apiKey?.length || 0;
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:SETTINGSAPP_APPLY_PRESET]',
        baseUrlLen: nextBaseLen,
        baseUrlVal: next.text.baseUrl || '',
        keyLen: nextKeyLen,
        keyLast4: (next.text.apiKey || '').slice(-4),
        details: `applyPreset ${preset.id}: baseLen ${prevBaseLen}->${nextBaseLen}, keyLen ${prevKeyLen}->${nextKeyLen}`,
      });
      return next;
    });

    setConnectionResult(null);
    setModelFetchResult(null);
  };

  // JSON Format Adapter
  const handleAdaptJsonConfig = async () => {
    if (!rawJsonInput.trim()) return;
    setIsAdaptingJson(true);
    try {
      const res = await apiFetch('/api/provider/adapt-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawJson: rawJsonInput, apiConfig: getApiConfigForEngine() }),
      });
      const data = await res.json();
      if (data.success && data.adaptedJson) {
        setAdaptedJsonOutput(JSON.stringify(data.adaptedJson, null, 2));
      } else {
        setAdaptedJsonOutput(JSON.stringify({ error: data.error || '适配解析失败' }, null, 2));
      }
    } catch (e: any) {
      setAdaptedJsonOutput(JSON.stringify({ error: e.message || '适配工具请求失败' }, null, 2));
    } finally {
      setIsAdaptingJson(false);
    }
  };

  const handleOpenUpgradeLogsModal = () => {
    setUpgradeLogs(getUpgradeProtectionLogs());
    setShowUpgradeLogsModal(true);
  };

  return (
    <div className="flex flex-col h-full bg-black text-zinc-100 font-sans select-none overflow-hidden">
      {/* 顶部导航 */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={() => {
            onBackToLauncher();
          }}
          className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回桌面</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-100">系统与 API 设置</span>
        </div>
        <button
          onClick={handleGlobalSave}
          className="flex items-center gap-1 text-xs text-zinc-950 font-bold px-3 py-1 rounded-xl bg-white hover:bg-zinc-200 transition active:scale-95 shadow-sm"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存</span>
        </button>
      </div>

      {/* 提示 Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-xs text-emerald-400 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="font-medium">{saveSuccessMsg}</span>
        </div>
      )}

      {/* 主面板内容滚动区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-12">
        {/* API Settings Section */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <Key className="w-3.5 h-3.5 text-zinc-400" />
            <span>核心 API Provider 连接设置</span>
          </div>

          <ApiSettingsPanel
            settings={settings}
            setSettings={setSettings}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            showTextKey={showTextKey}
            setShowTextKey={setShowTextKey}
            showImageKey={showImageKey}
            setShowImageKey={setShowImageKey}
            showVoiceKey={showVoiceKey}
            setShowVoiceKey={setShowVoiceKey}
            handleClearTextKey={handleClearTextKey}
            handleClearImageKey={handleClearImageKey}
            handleClearVoiceKey={handleClearVoiceKey}
            fetchedModels={fetchedModels}
            isTestingConnection={isTestingConnection}
            connectionResult={connectionResult}
            handleTestConnection={handleTestConnection}
            isFetchingModels={isFetchingModels}
            modelFetchResult={modelFetchResult}
            handleFetchModels={handleFetchModels}
            isTestingModel={isTestingModel}
            modelTestResult={modelTestResult}
            handleTestSelectedModel={handleTestSelectedModel}
            handleGlobalSave={handleGlobalSave}
            applyTextPreset={applyTextPreset}
            fetchDebugInfo={fetchDebugInfo}
            savedVerification={savedVerification}
          />
        </section>

        {/* 系统 AI 控制开关 */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <Bot className="w-3.5 h-3.5 text-zinc-400" />
            <span>AI 人格智能行为机制</span>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-200">启用 AI 后台思考与响应</div>
                <div className="text-[11px] text-zinc-500">允许 AI 角色根据对话上下文维持后台思考机制</div>
              </div>
              <input
                type="checkbox"
                checked={controls.backgroundActive ?? true}
                onChange={(e) => setControls({ ...controls, backgroundActive: e.target.checked })}
                className="w-4 h-4 accent-white rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between border-t border-zinc-850 pt-3">
              <div>
                <div className="text-xs font-semibold text-zinc-200">允许 AI 主动气泡与交互弹窗</div>
                <div className="text-[11px] text-zinc-500">允许 AI 角色发起主动提醒与气泡提示</div>
              </div>
              <input
                type="checkbox"
                checked={controls.proactivePopups ?? true}
                onChange={(e) => setControls({ ...controls, proactivePopups: e.target.checked })}
                className="w-4 h-4 accent-white rounded cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* 数据与备份管理 */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <Database className="w-3.5 h-3.5 text-zinc-400" />
            <span>系统数据管理与导入导出</span>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDataModalTab('export');
                  setShowDataModal(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>导出全量备份</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDataModalTab('import');
                  setShowDataModal(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>导入数据备份</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-850">
              <button
                type="button"
                onClick={handleOpenUpgradeLogsModal}
                className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-xs font-medium text-zinc-300 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>系统升级无损日志</span>
              </button>

              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="py-2.5 px-3 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-xs font-medium text-rose-300 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>恢复出厂设置</span>
              </button>
            </div>
          </div>
        </section>

        {/* JSON 规范适配适配器 */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <FileCode className="w-3.5 h-3.5 text-zinc-400" />
            <span>智能 JSON 结构兼容解析器</span>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-3">
            <textarea
              placeholder="粘贴包含配置的任意原始 JSON 文本..."
              value={rawJsonInput}
              onChange={(e) => setRawJsonInput(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />

            <button
              type="button"
              onClick={handleAdaptJsonConfig}
              disabled={isAdaptingJson || !rawJsonInput.trim()}
              className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAdaptingJson ? '解析适配中...' : '解析转换并标准化 JSON'}</span>
            </button>

            {adaptedJsonOutput && (
              <pre className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-40">
                {adaptedJsonOutput}
              </pre>
            )}
          </div>
        </section>

        {/* 版本信息 */}
        <div className="pt-4 pb-6 text-center text-xs text-zinc-600 space-y-1">
          <div>AI OS Phone Kernel v{CURRENT_APP_VERSION_NAME} (Build {CURRENT_APP_VERSION_CODE})</div>
          <div>Data Schema Specification v{CURRENT_APP_DATA_VERSION}</div>
        </div>
      </div>

      {/* 数据管理 Full Modal */}
      {showDataModal && (
        <DataManagementModal
          isOpen={showDataModal}
          onClose={() => setShowDataModal(false)}
          onDataChanged={onDataChanged || (() => {})}
          initialTab={dataModalTab}
        />
      )}

      {/* 恢复出厂设置确认 Modal */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-950 border border-rose-900/50 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>确认恢复出厂设置？</span>
            </div>

            <div className="text-xs text-zinc-300 space-y-2 leading-relaxed">
              <p>该操作将彻底清空以下本地数据：</p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400 font-mono text-[11px]">
                <li>所有聊天会话历史记录 (IndexedDB)</li>
                <li>AI 角色与独立记忆库 (Memory Vaults)</li>
                <li>自定义 API 配置与基础设定 (localStorage)</li>
              </ul>
              <p className="text-rose-400 font-medium pt-1">重置后系统将恢复至最初安装状态，且不可撤销。</p>
            </div>

            {resetSuccessMessage ? (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-400 text-xs font-semibold text-center animate-in fade-in">
                {resetSuccessMessage}
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(false)}
                  disabled={isResetting}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleExecuteFactoryReset}
                  disabled={isResetting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-rose-900/30"
                >
                  {isResetting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isResetting ? '清空中...' : '确定重置'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 系统无损升级日志 Modal */}
      {showUpgradeLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-100">系统升级无损防崩保护日志</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUpgradeLogsModal(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {upgradeLogs.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-500">
                  暂无数据迁移触发记录，当前系统为原生数据规格。
                </div>
              ) : (
                upgradeLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-bold">{log.summary || '版本兼容校验'}</span>
                      <span className="text-zinc-500 text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-zinc-500 text-[10px]">VersionCode: {log.fromVersionCode} → {log.toVersionCode}</div>
                    {log.items && log.items.map((item, idx) => (
                      <div key={idx} className="text-zinc-300 text-[10px]">• {item.name}: {item.detail}</div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-zinc-850 text-right">
              <button
                type="button"
                onClick={() => setShowUpgradeLogsModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
