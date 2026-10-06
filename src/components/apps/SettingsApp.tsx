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
import { resetStorageToFactoryDefaults, loadCharacters } from '../../lib/storage';
import {
  getAiArchiveConfig,
  saveAiArchiveConfig,
  performIncrementalArchive,
  getPendingMessageCount,
  AiArchiveConfig,
  subscribeArchiveDb,
} from '../../lib/chatArchiveDb';
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

  // Hydration Guard：确保仅在初次 mount/load 建立之后，settings 发生变化才自动写入 localStorage
  const isHydratedRef = React.useRef(false);

  useEffect(() => {
    isHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (isHydratedRef.current) {
      saveApiSettings(settings);
    }
  }, [settings]);

  // 追踪 SettingsApp Render 序号与真实 State
  const settingsAppRenderCount = React.useRef(0);
  settingsAppRenderCount.current += 1;

  const [controls, setControls] = useState<AiControls>(aiControls);

  // Active Provider Category Tab
  const [activeCategory, setActiveCategory] = useState<'text' | 'image' | 'voice'>('text');

  // Chat Archiving Settings States
  const [allCharacters] = useState(() => loadCharacters());
  const [selectedCharId, setSelectedCharId] = useState<string>(() => (loadCharacters()[0]?.id || 'char_1'));
  const [archiveConfig, setArchiveConfig] = useState<AiArchiveConfig | null>(null);
  const [contextCountInput, setContextCountInput] = useState<string>('100');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccessMsg, setArchiveSuccessMsg] = useState('');

  const loadArchiveConfigForChar = async (charId: string) => {
    const cfg = await getAiArchiveConfig(charId);
    const pending = await getPendingMessageCount(charId, cfg.lastArchivedTimestamp || 0);
    setArchiveConfig({
      ...cfg,
      pendingCount: pending,
    });
    setContextCountInput(String(cfg.contextMessageCount ?? 100));
  };

  useEffect(() => {
    if (selectedCharId) {
      loadArchiveConfigForChar(selectedCharId);
    }
  }, [selectedCharId]);

  useEffect(() => {
    const unsub = subscribeArchiveDb(() => {
      if (selectedCharId) {
        loadArchiveConfigForChar(selectedCharId);
      }
    });
    return unsub;
  }, [selectedCharId]);

  const handleUpdateFrequency = async (freq: 'off' | 'daily' | 'weekly' | 'monthly') => {
    if (!archiveConfig) return;
    const updated = { ...archiveConfig, autoArchiveFrequency: freq };
    setArchiveConfig(updated);
    await saveAiArchiveConfig(updated);
  };

  const handleUpdateSearchMode = async (mode: 'off' | 'auto' | 'deep') => {
    if (!archiveConfig) return;
    const updated = { ...archiveConfig, searchMode: mode };
    setArchiveConfig(updated);
    await saveAiArchiveConfig(updated);
  };

  const handleSaveContextCount = async () => {
    if (!archiveConfig) return;
    const count = parseInt(contextCountInput.trim(), 10);
    if (isNaN(count) || count <= 0) return;
    const updated = { ...archiveConfig, contextMessageCount: count };
    setArchiveConfig(updated);
    await saveAiArchiveConfig(updated);
  };

  const handleManualArchiveNow = async () => {
    if (!selectedCharId || isArchiving) return;
    setIsArchiving(true);
    setArchiveSuccessMsg('');

    try {
      const res = await performIncrementalArchive(selectedCharId, true);
      if (res.status === 'completed') {
        setArchiveSuccessMsg(`成功增量归档 ${res.archivedCount} 条聊天消息！`);
        setTimeout(() => setArchiveSuccessMsg(''), 4000);
      }
      await loadArchiveConfigForChar(selectedCharId);
    } catch (e: any) {
      console.error('Archive error:', e);
    } finally {
      setIsArchiving(false);
    }
  };

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
  const [fetchedModelsMap, setFetchedModelsMap] = useState<Record<'text' | 'image' | 'voice', RemoteModelItem[]>>({
    text: [
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (默认推荐/超快响应)', type: 'text', owned_by: 'Google' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (深度推理模型)', type: 'text', owned_by: 'Google' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (最新低延迟)', type: 'text', owned_by: 'Google' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (逻辑与计算增强)', type: 'text', owned_by: 'Google' },
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat 官方兼容)', type: 'text', owned_by: 'DeepSeek' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度推理模型)', type: 'text', owned_by: 'DeepSeek' },
      { id: 'gpt-4o', name: 'GPT-4o (OpenAI 官方/反代)', type: 'text', owned_by: 'OpenAI' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (轻量级高并发)', type: 'text', owned_by: 'OpenAI' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Anthropic)', type: 'text', owned_by: 'Anthropic' },
    ],
    image: [
      { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 (Google 官方/推荐)', type: 'image', owned_by: 'Google' },
      { id: 'dall-e-3', name: 'DALL-E 3 (OpenAI 官方/反代)', type: 'image', owned_by: 'OpenAI' },
      { id: 'dall-e-2', name: 'DALL-E 2 (OpenAI 经典图像模型)', type: 'image', owned_by: 'OpenAI' },
      { id: 'flux-schnell', name: 'FLUX.1 Schnell (极速生图)', type: 'image', owned_by: 'Black Forest Labs' },
      { id: 'flux-dev', name: 'FLUX.1 Dev (高质量细节增强)', type: 'image', owned_by: 'Black Forest Labs' },
    ],
    voice: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (语音/多模态支持)', type: 'voice', owned_by: 'Google' },
      { id: 'tts-1', name: 'TTS-1 (OpenAI 标准语音合成)', type: 'voice', owned_by: 'OpenAI' },
      { id: 'tts-1-hd', name: 'TTS-1 HD (OpenAI 高清音质合成)', type: 'voice', owned_by: 'OpenAI' },
      { id: 'whisper-1', name: 'Whisper 1 (OpenAI 语音识别/转写)', type: 'voice', owned_by: 'OpenAI' },
    ],
  });
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
    const prevBaseLen = settings.text?.baseUrl?.length || 0;
    const prevKeyLen = settings.text?.apiKey?.length || 0;
    if (prevKeyLen > 0) {
      addDiagnosticLog({
        tag: '[CLEAR_DETECTED]',
        baseUrlLen: prevBaseLen,
        baseUrlVal: settings.text?.baseUrl || '',
        keyLen: 0,
        keyLast4: '',
        details: `source: handleClearTextKey, previousKeyLength: ${prevKeyLen}, nextKeyLength: 0`,
      });
    }
    addDiagnosticLog({
      tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_TEXT_KEY]',
      baseUrlLen: prevBaseLen,
      baseUrlVal: settings.text?.baseUrl || '',
      keyLen: 0,
      keyLast4: '',
      details: `CLEARED! apiKey len: ${prevKeyLen} -> 0`,
    });

    setSettings((prev) => ({
      ...prev,
      text: { ...prev.text, apiKey: '' },
    }));
  };

  const handleClearImageKey = () => {
    addDiagnosticLog({
      tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_IMAGE_KEY]',
      baseUrlLen: settings.text?.baseUrl?.length || 0,
      baseUrlVal: settings.text?.baseUrl || '',
      keyLen: settings.text?.apiKey?.length || 0,
      keyLast4: (settings.text?.apiKey || '').slice(-4),
      details: 'image.apiKey cleared',
    });

    setSettings((prev) => ({
      ...prev,
      image: { ...prev.image, apiKey: '' },
    }));
  };

  const handleClearVoiceKey = () => {
    addDiagnosticLog({
      tag: '[SETTINGS_WRITE:SETTINGSAPP_CLEAR_VOICE_KEY]',
      baseUrlLen: settings.text?.baseUrl?.length || 0,
      baseUrlVal: settings.text?.baseUrl || '',
      keyLen: settings.text?.apiKey?.length || 0,
      keyLast4: (settings.text?.apiKey || '').slice(-4),
      details: 'voice.apiKey cleared',
    });

    setSettings((prev) => ({
      ...prev,
      voice: { ...prev.voice, apiKey: '' },
    }));
  };

  const handleGlobalSave = () => {
    onSaveAiControls(controls);

    const currentText = settings.text;
    const hasBaseUrl = Boolean(currentText && currentText.baseUrl && currentText.baseUrl.trim().length > 0);
    const hasApiKey = Boolean(currentText && currentText.apiKey && currentText.apiKey.trim().length > 0);

    if (!hasApiKey && !hasBaseUrl) {
      addDiagnosticLog({
        tag: '[SAVE_REJECTED]',
        baseUrlLen: 0,
        baseUrlVal: '',
        keyLen: 0,
        keyLast4: '',
        details: 'Save rejected: text.baseUrl and text.apiKey are both empty',
      });
      setSaveSuccessMsg('⚠️ 未检测到已配置的 Base URL 或 API Key，请先输入后再点击保存。');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      return;
    }

    saveApiSettings(settings);
    const verify = loadApiSettings();
    setSavedVerification(verify);

    const isBaseMatch = (verify.text?.baseUrl || '') === (settings.text?.baseUrl || '');
    const isKeyMatch = (verify.text?.apiKey || '') === (settings.text?.apiKey || '');

    if (isBaseMatch && isKeyMatch) {
      setSaveSuccessMsg('🎉 全局 API Provider 配置与系统设置已保存生效！');
    } else {
      setSaveSuccessMsg('⚠️ 保存校验异常：写入存储与内存 State 不完全匹配。');
    }
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
        setFetchedModelsMap((prev) => ({
          ...prev,
          [activeCategory]: data.models,
        }));

        // 自动将后端自动探测得出的 apiProtocol 回写
        const detectedProtocol = (data as any).apiProtocol;
        if (detectedProtocol) {
          addDiagnosticLog({
            tag: '[SETTINGS_WRITE:AUTO_PROTOCOL_PERSISTED]',
            baseUrlLen: settings.text.baseUrl?.length || 0,
            baseUrlVal: settings.text.baseUrl || '',
            keyLen: settings.text.apiKey?.length || 0,
            keyLast4: (settings.text.apiKey || '').slice(-4),
            details: `Auto-detected protocol [${detectedProtocol}] persisted for ${activeCategory}`,
          });

          setSettings((prev) => ({
            ...prev,
            [activeCategory]: {
              ...prev[activeCategory],
              apiProtocol: detectedProtocol,
            },
          }));
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
    const prevBaseLen = settings.text?.baseUrl?.length || 0;
    const prevKeyLen = settings.text?.apiKey?.length || 0;
    const nextBaseUrl = preset.defaultBaseUrl || settings.text.baseUrl || '';

    addDiagnosticLog({
      tag: '[SETTINGS_WRITE:SETTINGSAPP_APPLY_PRESET]',
      baseUrlLen: nextBaseUrl.length,
      baseUrlVal: nextBaseUrl,
      keyLen: prevKeyLen,
      keyLast4: (settings.text?.apiKey || '').slice(-4),
      details: `applyPreset ${preset.id}`,
    });

    setSettings((prev) => ({
      ...prev,
      text: {
        ...prev.text,
        provider: preset.id,
        baseUrl: preset.defaultBaseUrl || prev.text.baseUrl || '',
        model: preset.defaultModel || prev.text.model || '',
        apiKey: prev.text.apiKey || '',
      },
    }));

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
            fetchedModels={fetchedModelsMap[activeCategory] || fetchedModels}
            fetchedModelsMap={fetchedModelsMap}
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

        {/* AI 聊天记录本地归档与高效检索 */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
            <Archive className="w-3.5 h-3.5 text-sky-400" />
            <span>AI 聊天记录增量归档与检索设置</span>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-4">
            {/* AI 角色选择器 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">选择要设置的 AI 角色</label>
              <select
                value={selectedCharId}
                onChange={(e) => setSelectedCharId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
              >
                {allCharacters.length === 0 ? (
                  <option value="char_1">默认 AI 角色</option>
                ) : (
                  allCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 自动归档频率 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">自动归档周期</span>
                <span className="text-[11px] text-zinc-500">定时增量归档到本地</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(
                  [
                    { id: 'off', label: '关闭' },
                    { id: 'daily', label: '每天' },
                    { id: 'weekly', label: '每周' },
                    { id: 'monthly', label: '每月' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleUpdateFrequency(item.id)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-medium transition ${
                      archiveConfig?.autoArchiveFrequency === item.id
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-850 hover:bg-zinc-850'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 对话上下文消息数 */}
            <div className="space-y-1.5 border-t border-zinc-850 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">对话上下文消息数</span>
                <span className="text-[11px] text-zinc-500">发送给 AI 的历史消息条数</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min="1"
                  value={contextCountInput}
                  onChange={(e) => setContextCountInput(e.target.value)}
                  placeholder="100"
                  className="flex-1 bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleSaveContextCount}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-xl transition"
                >
                  确认
                </button>
              </div>
            </div>

            {/* 历史回忆检索模式 */}
            <div className="space-y-1.5 border-t border-zinc-850 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">AI 对话回忆检索模式</span>
                <span className="text-[11px] text-zinc-500">控制历史索引的使用范围</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {(
                  [
                    { id: 'off', label: '关闭检索', desc: '不查旧归档' },
                    { id: 'auto', label: '智能回忆', desc: '按需命中索引' },
                    { id: 'deep', label: '深度检索', desc: '扩大搜索深度' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleUpdateSearchMode(item.id)}
                    className={`p-2 rounded-xl text-xs text-left transition ${
                      archiveConfig?.searchMode === item.id
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-850 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">{item.label}</div>
                    <div className="text-[10px] text-zinc-500">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 状态卡片与手动归档按钮 */}
            <div className="bg-zinc-900/80 border border-zinc-850 rounded-xl p-3 space-y-2.5 text-xs text-zinc-300">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">上次归档时间:</span>
                <span className="font-mono text-zinc-300">
                  {archiveConfig?.lastArchivedAt
                    ? new Date(archiveConfig.lastArchivedAt).toLocaleString()
                    : '从未归档'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">归档游标状态:</span>
                <span className="font-medium text-sky-400">
                  {archiveConfig?.archiveStatus === 'running'
                    ? '⏳ 归档进行中...'
                    : archiveConfig?.archiveStatus === 'completed'
                    ? '✅ 已完成'
                    : archiveConfig?.archiveStatus === 'failed'
                    ? '❌ 归档失败'
                    : '就绪'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">待归档增量消息:</span>
                <span className="font-bold text-amber-400">{archiveConfig?.pendingCount ?? 0} 条</span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">归档库累计储存:</span>
                <span className="font-bold text-zinc-200">{archiveConfig?.archivedTotalCount ?? 0} 条</span>
              </div>

              {archiveConfig?.lastFailedError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/40 p-2 rounded-lg">
                  ❌ 归档失败信息: {archiveConfig.lastFailedError}
                </div>
              )}

              {archiveSuccessMsg && (
                <div className="text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 p-2 rounded-lg">
                  ✨ {archiveSuccessMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleManualArchiveNow}
                disabled={isArchiving}
                className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer mt-1"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{isArchiving ? '增量归档中...' : '立即增量归档'}</span>
              </button>
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
