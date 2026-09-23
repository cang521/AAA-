import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { pingBackendHealth } from '../../lib/localBackend';
import {
  ProviderType,
  RemoteModelItem,
  ConnectionTestResult,
  ModelFetchResult,
  ModelTestResult,
} from '../../types';
import {
  ApiSettings,
  loadApiSettings,
  saveApiSettings,
} from '../../lib/apiConfigStore';
import {
  addDiagnosticLog,
  subscribeDiagnosticLogs,
  getDiagnosticLogs,
  DiagnosticLogEvent,
} from '../../lib/inputTracker';
import {
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Settings2,
  Trash2,
  Plus,
  Bug,
} from 'lucide-react';

export interface ProviderPreset {
  id: ProviderType;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  badge: string;
  description: string;
}

export const TEXT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'google_gemini',
    name: 'Google Gemini (官方 / 原生)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3.6-flash',
    badge: '官方推荐',
    description: '支持 Gemini 3.6 Flash / 2.5 Pro 及自定义反代端点',
  },
  {
    id: 'custom',
    name: '自定义配置',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o',
    badge: '自定义',
    description: '任意符合规范的反代、自建网关或中转服务',
  },
];

export interface CustomPresetItem {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  createdAt: number;
}

const STORAGE_KEY_CUSTOM_PRESETS = 'phone_user_custom_api_presets';

const loadSavedPresets = (): CustomPresetItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistCustomPresets = (items: CustomPresetItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save custom presets to localStorage', e);
  }
};

export interface ApiSettingsPanelProps {
  settings: ApiSettings;
  setSettings: React.Dispatch<React.SetStateAction<ApiSettings>>;
  activeCategory: 'text' | 'image' | 'voice';
  setActiveCategory: (cat: 'text' | 'image' | 'voice') => void;

  showTextKey: boolean;
  setShowTextKey: (show: boolean) => void;
  showImageKey: boolean;
  setShowImageKey: (show: boolean) => void;
  showVoiceKey: boolean;
  setShowVoiceKey: (show: boolean) => void;

  handleClearTextKey: () => void;
  handleClearImageKey: () => void;
  handleClearVoiceKey: () => void;

  // Models & Test actions
  fetchedModels: RemoteModelItem[];
  isTestingConnection: boolean;
  connectionResult: ConnectionTestResult | null;
  handleTestConnection: () => Promise<void>;

  isFetchingModels: boolean;
  modelFetchResult: ModelFetchResult | null;
  handleFetchModels: () => Promise<void>;

  isTestingModel: boolean;
  modelTestResult: ModelTestResult | null;
  handleTestSelectedModel: () => Promise<void>;

  handleGlobalSave: () => void;
  applyTextPreset: (preset: ProviderPreset) => void;
  fetchDebugInfo?: {
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
    upstreamDiagnostics?: {
      upstreamProtocol?: string;
      finalUpstreamUrl?: string;
      httpMethod?: string;
      authMethod?: string;
      timeoutMs?: number;
      upstreamStartTime?: string;
      upstreamEndTime?: string;
    } | null;
    attemptsTrace?: Array<{
      attemptIndex: number;
      adapterName: string;
      protocolKey: string;
      finalUrl: string;
      method: string;
      authMethod: string;
      timeoutMs: number;
      startTime: string;
      endTime: string;
      latencyMs: number;
      httpStatus?: number;
      success: boolean;
      modelsCount: number;
      error?: string;
    }> | null;
  } | null;
  savedVerification?: ApiSettings | null;
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({
  settings,
  setSettings,
  activeCategory,
  setActiveCategory,
  showTextKey,
  setShowTextKey,
  showImageKey,
  setShowImageKey,
  showVoiceKey,
  setShowVoiceKey,
  handleClearTextKey,
  handleClearImageKey,
  handleClearVoiceKey,
  fetchedModels,
  isTestingConnection,
  connectionResult,
  handleTestConnection,
  isFetchingModels,
  modelFetchResult,
  handleFetchModels,
  handleGlobalSave,
  fetchDebugInfo,
  savedVerification,
}) => {
  const formatKeyInfo = (key?: string) => {
    if (!key || !key.trim()) {
      return <span className="text-rose-400 font-bold">[为空] len=0</span>;
    }
    const k = key.trim();
    return (
      <span className="text-emerald-400 font-medium">
        [有值] len={k.length} (末尾: ***{k.slice(-4)})
      </span>
    );
  };

  const formatKeyInfoFromFields = (isEmpty: boolean, length: number, last4: string) => {
    if (isEmpty || length === 0) {
      return <span className="text-rose-400 font-bold">[为空] len=0</span>;
    }
    return (
      <span className="text-emerald-400 font-medium">
        [有值] len={length} (末尾: ***{last4})
      </span>
    );
  };

  // Realtime Android native health check state
  const [liveHealth, setLiveHealth] = useState<string>('检测中...');

  useEffect(() => {
    let active = true;
    if (Capacitor.isNativePlatform()) {
      pingBackendHealth()
        .then((ok) => {
          if (active) {
            setLiveHealth(ok ? '健康 (127.0.0.1:3000 响应正常)' : '未连通 (127.0.0.1:3000 未启动或无响应)');
          }
        })
        .catch((e) => {
          if (active) {
            setLiveHealth(`检测异常: ${e?.message || '无法建立连接'}`);
          }
        });
    } else {
      setLiveHealth('Web 模式 (直连标准 API 路由)');
    }
    return () => {
      active = false;
    };
  }, []);

  // 实时诊断追踪日志状态与 render # 记录
  const [liveLogs, setLiveLogs] = useState<DiagnosticLogEvent[]>(getDiagnosticLogs());
  const panelRenderCount = React.useRef(0);
  panelRenderCount.current += 1;

  useEffect(() => {
    return subscribeDiagnosticLogs((logs) => {
      setLiveLogs([...logs]);
    });
  }, []);

  const currentCategoryConfig = settings[activeCategory];
  const currentTextKey = settings.text.apiKey || '';
  const currentTextBaseUrl = settings.text.baseUrl || '';
  const currentImageKey = settings.image.apiKey || '';
  const currentVoiceKey = settings.voice.apiKey || '';

  // 只读诊断：记录 DOM / State 比对
  addDiagnosticLog({
    tag: '[INPUT_STATE_COMPARE]',
    baseUrlLen: currentTextBaseUrl.length,
    baseUrlVal: currentTextBaseUrl,
    keyLen: currentTextKey.length,
    keyLast4: currentTextKey.slice(-4),
    details: `INPUT_STATE_COMPARE: text.baseUrl len=${currentTextBaseUrl.length}, text.apiKey len=${currentTextKey.length}`,
  });

  // 自定义配置列表状态
  const [customPresets, setCustomPresets] = useState<CustomPresetItem[]>(loadSavedPresets);
  const [showPresetManager, setShowPresetManager] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // 每次 customPresets 变更时同步保存
  useEffect(() => {
    persistCustomPresets(customPresets);
  }, [customPresets]);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice(null);
    }, 2500);
  };

  // 下拉切换预设配置
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    if (id === 'custom') {
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:PANEL_SELECT_PRESET_CUSTOM]',
        baseUrlLen: currentTextBaseUrl.length,
        baseUrlVal: currentTextBaseUrl,
        keyLen: currentTextKey.length,
        keyLast4: currentTextKey.slice(-4),
        details: 'select preset custom',
      });
      setSettings((prev) => ({
        ...prev,
        text: { ...prev.text, provider: 'custom' },
      }));
      return;
    }
    const found = customPresets.find((p) => p.id === id);
    if (found) {
      addDiagnosticLog({
        tag: '[SETTINGS_WRITE:PANEL_SELECT_PRESET_FOUND]',
        baseUrlLen: found.baseUrl?.length || 0,
        baseUrlVal: found.baseUrl || '',
        keyLen: (found.apiKey || currentTextKey).length,
        keyLast4: (found.apiKey || currentTextKey).slice(-4),
        details: `select custom preset: ${found.name}`,
      });
      setSettings((prev) => ({
        ...prev,
        text: {
          ...prev.text,
          provider: 'custom',
          baseUrl: found.baseUrl,
          apiKey: found.apiKey || prev.text.apiKey || '',
          model: found.model,
        },
      }));
      showNotice(`已切换到预设：${found.name}`);
    }
  };

  // 保存当前参数为新的自定义配置
  const handleSaveAsCustomPreset = () => {
    const name = newPresetName.trim() || `自定义配置 ${customPresets.length + 1}`;
    const newPreset: CustomPresetItem = {
      id: 'custom_' + Date.now(),
      name,
      baseUrl: settings.text.baseUrl || '',
      apiKey: currentTextKey,
      model: settings.text.model || '',
      createdAt: Date.now(),
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    setSelectedPresetId(newPreset.id);
    setNewPresetName('');
    showNotice(`已保存自定义配置：“${name}”`);
  };

  // 删除指定的自定义配置
  const handleDeleteCustomPreset = (id: string) => {
    const target = customPresets.find((p) => p.id === id);
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    if (selectedPresetId === id) {
      setSelectedPresetId('custom');
    }
    showNotice(`已删除自定义配置：${target ? target.name : ''}`);
  };

  // 清空 / 删除当前的自定义配置内容
  const handleClearCurrentConfig = () => {
    if (currentTextBaseUrl.length > 0 || currentTextKey.length > 0) {
      addDiagnosticLog({
        tag: '[CLEAR_DETECTED]',
        baseUrlLen: 0,
        baseUrlVal: '',
        keyLen: 0,
        keyLast4: '',
        details: `source: handleClearCurrentConfig button, previousBaseUrlLength: ${currentTextBaseUrl.length}, previousKeyLength: ${currentTextKey.length}`,
      });
    }
    addDiagnosticLog({
      tag: '[SETTINGS_WRITE:PANEL_CLEAR_CURRENT_CONFIG]',
      baseUrlLen: 0,
      baseUrlVal: '',
      keyLen: 0,
      keyLast4: '',
      details: 'CLEARED current config',
    });

    setSettings((prev) => ({
      ...prev,
      text: {
        provider: 'custom',
        baseUrl: '',
        apiKey: '',
        model: '',
      },
    }));
    setSelectedPresetId('custom');
    showNotice('已清空当前自定义配置');
  };

  return (
    <div className="rounded-2xl bg-zinc-950 border border-zinc-850 p-4 sm:p-5 space-y-5 text-zinc-200">
      {/* 标题分类切换: API连接 / 图像api连接 / 语音api连接 */}
      <div className="flex p-1 bg-zinc-900/90 rounded-xl border border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveCategory('text')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
            activeCategory === 'text'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          API连接
        </button>
        <button
          type="button"
          onClick={() => setActiveCategory('image')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
            activeCategory === 'image'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          图像api连接
        </button>
        <button
          type="button"
          onClick={() => setActiveCategory('voice')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
            activeCategory === 'voice'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          语音api连接
        </button>
      </div>

      {/* 提示消息 */}
      {actionNotice && (
        <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ================= 1. API 连接 (文本) ================= */}
      {activeCategory === 'text' && (
        <div className="space-y-4">
          {/* 1. 反代地址（Proxy / Base URL） */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              1. 反代地址 (Proxy / Base URL)
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1 或留空使用默认"
              value={currentTextBaseUrl}
              onInput={(e) => {
                const val = (e.currentTarget as HTMLInputElement).value;
                setSettings((prev) => ({
                  ...prev,
                  text: { ...prev.text, baseUrl: val },
                }));
              }}
              onChange={(e) => {
                const val = e.target.value;
                const now = new Date().toLocaleTimeString();

                addDiagnosticLog({
                  tag: '[BASE_INPUT_EVENT]',
                  baseUrlLen: val.length,
                  baseUrlVal: val,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `onChange triggered at ${now}, rawValue="${val}" (len=${val.length})`,
                });

                if (currentTextBaseUrl.length > 0 && val.length === 0) {
                  addDiagnosticLog({
                    tag: '[CLEAR_DETECTED]',
                    baseUrlLen: 0,
                    baseUrlVal: '',
                    keyLen: currentTextKey.length,
                    keyLast4: currentTextKey.slice(-4),
                    details: `source: Base URL input cleared, previousBaseUrlLength: ${currentTextBaseUrl.length}, nextBaseUrlLength: 0`,
                  });
                }

                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:BASE_INPUT]',
                  baseUrlLen: val.length,
                  baseUrlVal: val,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `[BASE_STATE_NEXT] baseLen: ${currentTextBaseUrl.length} -> ${val.length}`,
                });

                setSettings((prev) => ({
                  ...prev,
                  text: { ...prev.text, baseUrl: val },
                }));
              }}
              onBlur={(e) => {
                const val = e.target.value;
                if (val !== currentTextBaseUrl) {
                  setSettings((prev) => ({
                    ...prev,
                    text: { ...prev.text, baseUrl: val },
                  }));
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          {/* 2. 密钥（Key / API Key） */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 密钥 (Key / API Key)
              </label>
              {currentTextKey ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 font-mono">
                    已配置 (••••{currentTextKey.slice(-4)})
                  </span>
                  <button
                    type="button"
                    onClick={handleClearTextKey}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                  >
                    清除
                  </button>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <input
                type={showTextKey ? 'text' : 'password'}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={currentTextKey}
                onInput={(e) => {
                  const val = (e.currentTarget as HTMLInputElement).value;
                  setSettings((prev) => ({
                    ...prev,
                    text: { ...prev.text, apiKey: val },
                  }));
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  const now = new Date().toLocaleTimeString();
                  const last4 = val.slice(-4);

                  addDiagnosticLog({
                    tag: '[KEY_INPUT_EVENT]',
                    baseUrlLen: currentTextBaseUrl.length,
                    baseUrlVal: currentTextBaseUrl,
                    keyLen: val.length,
                    keyLast4: last4,
                    details: `onChange triggered at ${now}, keyLen=${val.length}, last4=${last4}`,
                  });

                  if (currentTextKey.length > 0 && val.length === 0) {
                    addDiagnosticLog({
                      tag: '[CLEAR_DETECTED]',
                      baseUrlLen: currentTextBaseUrl.length,
                      baseUrlVal: currentTextBaseUrl,
                      keyLen: 0,
                      keyLast4: '',
                      details: `source: API Key input cleared, previousKeyLength: ${currentTextKey.length}, nextKeyLength: 0`,
                    });
                  }

                  addDiagnosticLog({
                    tag: '[SETTINGS_WRITE:KEY_INPUT]',
                    baseUrlLen: currentTextBaseUrl.length,
                    baseUrlVal: currentTextBaseUrl,
                    keyLen: val.length,
                    keyLast4: last4,
                    details: `[KEY_STATE_NEXT] keyLen: ${currentTextKey.length} -> ${val.length}, last4=${last4}`,
                  });

                  setSettings((prev) => ({
                    ...prev,
                    text: { ...prev.text, apiKey: val },
                  }));
                }}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== currentTextKey) {
                    setSettings((prev) => ({
                      ...prev,
                      text: { ...prev.text, apiKey: val },
                    }));
                  }
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
              />
              <button
                type="button"
                onClick={() => setShowTextKey(!showTextKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 transition"
                title={showTextKey ? '隐藏密钥' : '显示密钥'}
              >
                {showTextKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 3. 模型选择 */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              3. 模型选择
            </label>
            {fetchedModels.length > 0 && (
              <select
                value={settings.text.model || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setSettings((prev) => {
                      const next = {
                        ...prev,
                        text: { ...prev.text, model: val },
                      };
                      saveApiSettings(next);
                      addDiagnosticLog({
                        tag: '[SETTINGS_WRITE:PANEL_TEXT_MODEL_SELECT]',
                        baseUrlLen: next.text.baseUrl?.length || 0,
                        baseUrlVal: next.text.baseUrl || '',
                        keyLen: next.text.apiKey?.length || 0,
                        keyLast4: (next.text.apiKey || '').slice(-4),
                        details: `model select val="${val}"`,
                      });
                      return next;
                    });
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-500 mb-1.5"
              >
                <option value="">-- 点击选择已拉取的模型 --</option>
                {fetchedModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} {m.name && m.name !== m.id ? `(${m.name})` : ''}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="手动输入模型名 (如: gemini-3.6-flash, deepseek-chat, gpt-4o)"
              value={settings.text.model || ''}
              onChange={(e) => {
                const val = e.target.value;
                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:PANEL_TEXT_MODEL_INPUT]',
                  baseUrlLen: currentTextBaseUrl.length,
                  baseUrlVal: currentTextBaseUrl,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `model input val="${val}"`,
                });
                setSettings((prev) => ({
                  ...prev,
                  text: { ...prev.text, model: val },
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          {/* 4. 预设配置 */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              4. 预设配置
            </label>
            <div className="flex gap-2">
              <select
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-zinc-500 font-medium truncate"
              >
                <option value="custom">-- 自定义配置 --</option>
                {customPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {selectedPresetId !== 'custom' && (
                <button
                  type="button"
                  onClick={() => handleDeleteCustomPreset(selectedPresetId)}
                  className="px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-900/50 text-rose-400 text-xs font-medium transition active:scale-95 shrink-0 flex items-center gap-1"
                  title="删除当前选中的自定义配置"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">删除</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPresetManager(true)}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition active:scale-95 shrink-0"
              >
                管理
              </button>
            </div>
          </div>

          {/* 5. 底部按钮 */}
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isTestingConnection ? '测试中...' : '测试连接'}</span>
              </button>

              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isFetchingModels ? 'animate-spin' : ''}`} />
                <span>{isFetchingModels ? '拉取中...' : '拉取模型'}</span>
              </button>

              <button
                type="button"
                onClick={handleGlobalSave}
                className="py-2.5 px-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-zinc-950" />
                <span>保存配置</span>
              </button>
            </div>

            {/* Status & Feedback */}
            {connectionResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  connectionResult.success
                    ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200'
                    : 'bg-zinc-900/90 border-zinc-800 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {connectionResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {connectionResult.message || (connectionResult.success ? '连接成功 (HTTP 200)' : '连接失败')}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-2">
                  {connectionResult.latencyMs}ms
                </span>
              </div>
            )}

            {modelFetchResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  modelFetchResult.success
                    ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200'
                    : 'bg-zinc-900/90 border-zinc-800 text-amber-300'
                }`}
              >
                {modelFetchResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="truncate">{modelFetchResult.message}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 2. 图像 API 连接 ================= */}
      {activeCategory === 'image' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              1. 图像 API 反代地址 (留空默认同主接口)
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={settings.image.baseUrl || ''}
              onChange={(e) => {
                const val = e.target.value;
                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:PANEL_IMAGE_BASE_URL_INPUT]',
                  baseUrlLen: currentTextBaseUrl.length,
                  baseUrlVal: currentTextBaseUrl,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `image.baseUrl changed to "${val}"`,
                });
                setSettings((prev) => ({
                  ...prev,
                  image: { ...prev.image, baseUrl: val },
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 图像 API 密钥 (留空默认同主密钥)
              </label>
              {currentImageKey ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 font-mono">
                    已配置 (••••{currentImageKey.slice(-4)})
                  </span>
                  <button
                    type="button"
                    onClick={handleClearImageKey}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                  >
                    清除
                  </button>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <input
                type={showImageKey ? 'text' : 'password'}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={currentImageKey}
                onChange={(e) => {
                  const val = e.target.value;
                  addDiagnosticLog({
                    tag: '[SETTINGS_WRITE:PANEL_IMAGE_KEY_INPUT]',
                    baseUrlLen: currentTextBaseUrl.length,
                    baseUrlVal: currentTextBaseUrl,
                    keyLen: currentTextKey.length,
                    keyLast4: currentTextKey.slice(-4),
                    details: `image.apiKey changed (len=${val.length})`,
                  });
                  setSettings((prev) => ({
                    ...prev,
                    image: { ...prev.image, apiKey: val },
                  }));
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
              />
              <button
                type="button"
                onClick={() => setShowImageKey(!showImageKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 transition"
              >
                {showImageKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              3. 图像模型选择
            </label>
            <input
              type="text"
              placeholder="dall-e-3, imagen-3.0-generate-002, flux-schnell..."
              value={settings.image.model || ''}
              onChange={(e) => {
                const val = e.target.value;
                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:PANEL_IMAGE_MODEL_INPUT]',
                  baseUrlLen: currentTextBaseUrl.length,
                  baseUrlVal: currentTextBaseUrl,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `image.model changed to "${val}"`,
                });
                setSettings((prev) => ({
                  ...prev,
                  image: { ...prev.image, model: val },
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isTestingConnection ? '测试中...' : '测试连接'}</span>
              </button>

              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isFetchingModels ? 'animate-spin' : ''}`} />
                <span>{isFetchingModels ? '拉取中...' : '拉取模型'}</span>
              </button>

              <button
                type="button"
                onClick={handleGlobalSave}
                className="py-2.5 px-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-zinc-950" />
                <span>保存配置</span>
              </button>
            </div>

            {connectionResult && (
              <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200">
                {connectionResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 3. 语音 API 连接 ================= */}
      {activeCategory === 'voice' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              1. 语音 API 反代地址 (留空默认同主接口)
            </label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={settings.voice.baseUrl || ''}
              onChange={(e) => {
                const val = e.target.value;
                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:PANEL_VOICE_BASE_URL_INPUT]',
                  baseUrlLen: currentTextBaseUrl.length,
                  baseUrlVal: currentTextBaseUrl,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `voice.baseUrl changed to "${val}"`,
                });
                setSettings((prev) => ({
                  ...prev,
                  voice: { ...prev.voice, baseUrl: val },
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 语音 API 密钥 (留空默认同主密钥)
              </label>
              {currentVoiceKey ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 font-mono">
                    已配置 (••••{currentVoiceKey.slice(-4)})
                  </span>
                  <button
                    type="button"
                    onClick={handleClearVoiceKey}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                  >
                    清除
                  </button>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <input
                type={showVoiceKey ? 'text' : 'password'}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={currentVoiceKey}
                onChange={(e) => {
                  const val = e.target.value;
                  addDiagnosticLog({
                    tag: '[SETTINGS_WRITE:PANEL_VOICE_KEY_INPUT]',
                    baseUrlLen: currentTextBaseUrl.length,
                    baseUrlVal: currentTextBaseUrl,
                    keyLen: currentTextKey.length,
                    keyLast4: currentTextKey.slice(-4),
                    details: `voice.apiKey changed (len=${val.length})`,
                  });
                  setSettings((prev) => ({
                    ...prev,
                    voice: { ...prev.voice, apiKey: val },
                  }));
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition select-text"
              />
              <button
                type="button"
                onClick={() => setShowVoiceKey(!showVoiceKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 transition"
              >
                {showVoiceKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium block">
              3. 语音模型选择
            </label>
            <input
              type="text"
              placeholder="tts-1, tts-1-hd, whisper-1..."
              value={settings.voice.model || ''}
              onChange={(e) => {
                const val = e.target.value;
                addDiagnosticLog({
                  tag: '[SETTINGS_WRITE:PANEL_VOICE_MODEL_INPUT]',
                  baseUrlLen: currentTextBaseUrl.length,
                  baseUrlVal: currentTextBaseUrl,
                  keyLen: currentTextKey.length,
                  keyLast4: currentTextKey.slice(-4),
                  details: `voice.model changed to "${val}"`,
                });
                setSettings((prev) => ({
                  ...prev,
                  voice: { ...prev.voice, model: val },
                }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-500 transition select-text"
            />
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isTestingConnection ? '测试中...' : '测试连接'}</span>
              </button>

              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isFetchingModels ? 'animate-spin' : ''}`} />
                <span>{isFetchingModels ? '拉取中...' : '拉取模型'}</span>
              </button>

              <button
                type="button"
                onClick={handleGlobalSave}
                className="py-2.5 px-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-zinc-950" />
                <span>保存配置</span>
              </button>
            </div>

            {connectionResult && (
              <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200">
                {connectionResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 预设管理 Modal (管理与删除自定义配置) */}
      {showPresetManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-100">管理自定义配置</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetManager(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. 保存当前参数为新自定义预设 */}
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <label className="text-xs text-zinc-300 font-medium block">
                将当前参数保存为新配置
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="配置名称 (如: 我的反向代理 / 公司中转)"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAsCustomPreset}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1 transition active:scale-95 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>保存</span>
                </button>
              </div>
            </div>

            {/* 2. 已保存的自定义预设列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">已保存的自定义配置 ({customPresets.length})</span>
              </div>

              <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                {customPresets.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-center text-xs text-zinc-500">
                    暂无已保存的自定义配置。可以在上方输入名称，将当前配置保存为新预设。
                  </div>
                ) : (
                  customPresets.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-zinc-900 border-zinc-600'
                            : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-xs text-zinc-100 truncate">{preset.name}</span>
                            {isSelected && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-medium">
                                使用中
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono truncate">
                            端点: {preset.baseUrl || '(默认)'}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono truncate">
                            模型: {preset.model || '(未指定)'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectPreset(preset.id);
                              setShowPresetManager(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
                          >
                            应用
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomPreset(preset.id)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 transition"
                            title="删除此自定义配置"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. 清空 / 删除当前配置内容 */}
            <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClearCurrentConfig}
                className="text-xs text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空当前配置参数</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPresetManager(false)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. 🔧 真机可视化 API 状态实时诊断看板 */}
      {/* ========================================================================= */}
      <div className="mt-5 p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3 font-mono text-[11px] text-zinc-300">
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
          <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs font-sans">
            <Bug className="w-4 h-4 text-amber-400" />
            Android APK 真机 API 状态与链路实时诊断看板
          </span>
          <span className="text-[10px] text-amber-300/60 font-sans">密钥脱敏保护中</span>
        </div>

        {/* 0. 输入事件实时追踪 */}
        <div className="space-y-1.5 bg-zinc-950/90 p-2.5 rounded-xl border border-amber-500/40">
          <div className="text-amber-300 font-bold flex items-center justify-between text-xs font-sans border-b border-amber-500/20 pb-1.5 mb-1.5">
            <span>【输入事件实时追踪 (最近 30 条)】</span>
            <span className="text-[10px] text-zinc-400 font-normal">捕获 Input 事件、State 写入与 Render 序号</span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-[10px] pr-1">
            {liveLogs.length === 0 ? (
              <div className="text-zinc-500 italic p-1">尚无输入事件记录</div>
            ) : (
              liveLogs.slice(0, 30).map((log) => (
                <div key={log.id} className="p-1.5 rounded bg-zinc-900/90 border border-zinc-800/80 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between font-bold">
                    <span className={log.tag.includes('INPUT') ? 'text-sky-300' : log.tag.includes('RENDER') ? 'text-emerald-400' : 'text-amber-400'}>
                      {log.tag}
                    </span>
                    <span className="text-zinc-500 text-[9px] font-normal">{log.timestamp}</span>
                  </div>
                  <div className="text-zinc-300 flex items-center gap-3">
                    <span>BaseURL len={log.baseUrlLen} {log.baseUrlVal ? `("${log.baseUrlVal.slice(0, 20)}")` : ''}</span>
                    <span>Key len={log.keyLen} {log.keyLast4 ? `(末尾:${log.keyLast4})` : ''}</span>
                  </div>
                  {log.details && <div className="text-zinc-400 text-[9px] truncate">{log.details}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 1. 当前 Input & State 状态 */}
        <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
          <div className="text-amber-300 font-semibold mb-1 text-[11px] font-sans">1. 当前 Input & State 内存状态：</div>
          <div>• Base URL: <span className="text-sky-300">{currentCategoryConfig.baseUrl ? `[有值] len=${currentCategoryConfig.baseUrl.length}` : '[为空] len=0'}</span></div>
          <div>• API Key: {formatKeyInfo(currentCategoryConfig.apiKey)}</div>
          <div>• Provider: <span className="text-sky-300 font-bold">{currentCategoryConfig.provider || 'google_gemini'}</span></div>
          <div>• Model: <span className="text-sky-300 font-bold">{currentCategoryConfig.model || 'gemini-3.6-flash'}</span></div>
        </div>

        {/* 2. ai_phone_api_settings_v1 校验 */}
        <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
          <div className="text-emerald-300 font-semibold mb-1 text-[11px] font-sans">2. localStorage [ai_phone_api_settings_v1] 校验：</div>
          {(() => {
            const saved = savedVerification || loadApiSettings();
            const savedCat = saved[activeCategory];
            return (
              <>
                <div>• 保存的 Base URL: <span className="text-sky-300">{savedCat?.baseUrl ? `[有值] len=${savedCat.baseUrl.length}` : '[为空] len=0'}</span></div>
                <div>• 保存的 API Key: {formatKeyInfo(savedCat?.apiKey)}</div>
                <div>• 保存的 Provider: <span className="text-sky-300">{savedCat?.provider}</span></div>
                <div>• 保存的 Model: <span className="text-sky-300">{savedCat?.model}</span></div>
              </>
            );
          })()}
        </div>

        {/* 3. 点击拉取模型时实际 Request Payload */}
        <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
          <div className="text-sky-300 font-semibold mb-1 text-[11px] font-sans">3. 点击「拉取模型」实际 Request Payload：</div>
          {fetchDebugInfo ? (
            <>
              <div>• 抓拍时间: <span className="text-zinc-400">{fetchDebugInfo.timestamp}</span></div>
              <div>• 实际发送 Base URL: <span className="text-sky-300">{fetchDebugInfo.baseUrl ? `[有值] len=${fetchDebugInfo.baseUrl.length}` : '[为空] len=0'}</span></div>
              <div>• 实际发送 API Key: {formatKeyInfoFromFields(fetchDebugInfo.keyIsEmpty, fetchDebugInfo.keyLength, fetchDebugInfo.keyLast4)}</div>
              <div>• 实际发送 Provider: <span className="text-amber-300">{fetchDebugInfo.providerType}</span></div>
            </>
          ) : (
            <div className="text-zinc-500 italic">尚未点击「拉取模型」按钮</div>
          )}
        </div>

        {/* 4. server.ts 接收与响应状态 */}
        <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
          <div className="text-purple-300 font-semibold mb-1 text-[11px] font-sans">4. server.ts 接收与响应状态：</div>
          <div>• HTTP Status: <span className={fetchDebugInfo?.httpStatus === 200 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{fetchDebugInfo?.httpStatus || '未发送'}</span></div>
          <div>• 到达 server.ts: <span className={fetchDebugInfo?.reachedServer ? 'text-emerald-400 font-bold' : fetchDebugInfo ? 'text-rose-400 font-bold' : 'text-zinc-500'}>{fetchDebugInfo ? (fetchDebugInfo.reachedServer ? '是 (Reached server.ts)' : '否 (未到达 / 离线代理拦截)') : '(等待点击)'}</span></div>
          {fetchDebugInfo?.responseMessage && (
            <div>• Response Message: <span className="text-amber-300">{fetchDebugInfo.responseMessage}</span></div>
          )}
          {fetchDebugInfo?.responseError && (
            <div>• Response Error: <span className="text-rose-300">{fetchDebugInfo.responseError}</span></div>
          )}
          {fetchDebugInfo?.failureStage && (
            <div>• 当前链路阶段: <span className="text-amber-300 font-bold">{fetchDebugInfo.failureStage}</span></div>
          )}
        </div>

        {/* 5. Android APK 特有 Node 后端链路 */}
        <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
          <div className="text-purple-300 font-semibold mb-1 text-[11px] font-sans">5. Android APK 特有网络与 Node 后端链路诊断：</div>
          <div>• 是否 Native 平台: <span className="text-amber-300 font-bold">{Capacitor.isNativePlatform() ? '是 (Native APK)' : '否 (Web/Preview)'}</span></div>
          <div>• Capacitor 平台: <span className="text-sky-300">{Capacitor.getPlatform()}</span></div>
          <div>• 127.0.0.1:3000 健康状态: <span className={liveHealth.includes('健康') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{liveHealth}</span></div>
        </div>

        {/* 6. 上游请求协议与多 Adapter 探测诊断 */}
        <div className="space-y-2 bg-zinc-950/90 p-2.5 rounded-xl border border-sky-500/30">
          <div className="text-sky-300 font-bold text-[11px] font-sans flex items-center justify-between">
            <span>6. 上游请求协议与多 Adapter 自动探测诊断：</span>
          </div>

          {fetchDebugInfo?.attemptsTrace && fetchDebugInfo.attemptsTrace.length > 0 ? (
            <div className="space-y-1.5 mt-1">
              <div className="text-[10px] text-zinc-400 font-semibold">探测历程 (共 {fetchDebugInfo.attemptsTrace.length} 次尝试)：</div>
              {fetchDebugInfo.attemptsTrace.map((att) => (
                <div
                  key={att.attemptIndex}
                  className={`p-2 rounded-lg text-[10px] font-mono border ${
                    att.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>
                      Attempt #{att.attemptIndex}: {att.adapterName}
                    </span>
                    <span className={att.success ? 'text-emerald-400' : 'text-rose-400'}>
                      {att.success ? `SUCCESS (获取 ${att.modelsCount} 个模型)` : `FAILED (${att.httpStatus || 'Timeout'})`}
                    </span>
                  </div>
                  <div className="mt-1 text-sky-300/80 break-all">• URL: {att.finalUrl}</div>
                  <div className="mt-0.5 text-zinc-400 flex flex-wrap gap-x-3">
                    <span>Auth: {att.authMethod}</span>
                    <span>耗时: {att.latencyMs}ms</span>
                    <span>超时限制: {att.timeoutMs}ms</span>
                  </div>
                  {att.error && <div className="mt-0.5 text-rose-300">• 错误信息: {att.error}</div>}
                </div>
              ))}
            </div>
          ) : fetchDebugInfo?.upstreamDiagnostics ? (
            <div className="space-y-0.5 text-[10px]">
              <div>• Upstream Protocol: <span className="text-amber-300 font-bold">{fetchDebugInfo.upstreamDiagnostics.upstreamProtocol}</span></div>
              <div>• Final Upstream URL: <span className="text-sky-300 break-all">{fetchDebugInfo.upstreamDiagnostics.finalUpstreamUrl}</span></div>
              <div>• HTTP Method: <span className="text-emerald-300 font-bold">{fetchDebugInfo.upstreamDiagnostics.httpMethod}</span></div>
              <div>• Auth Method: <span className="text-purple-300">{fetchDebugInfo.upstreamDiagnostics.authMethod}</span></div>
            </div>
          ) : (
            <div className="text-zinc-500 italic text-[10px]">
              点击「拉取模型」后，系统将自动发起多协议链路顺序探测并展示结果
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
