import React, { useState, useEffect } from 'react';
import {
  ApiConfig,
  ProviderType,
  RemoteModelItem,
  ConnectionTestResult,
  ModelFetchResult,
  ModelTestResult,
} from '../../types';
import {
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Check,
  CheckCircle2,
  AlertCircle,
  Sliders,
  ChevronDown,
  Play,
  X,
  Settings2,
  Trash2,
  Plus,
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
  config: ApiConfig;
  setConfig: React.Dispatch<React.SetStateAction<ApiConfig>>;
  activeCategory: 'text' | 'image' | 'voice';
  setActiveCategory: (cat: 'text' | 'image' | 'voice') => void;

  // Key inputs & visibility
  textApiKeyInput: string;
  setTextApiKeyInput: (val: string) => void;
  showTextKey: boolean;
  setShowTextKey: (show: boolean) => void;

  imageApiKeyInput: string;
  setImageApiKeyInput: (val: string) => void;
  showImageKey: boolean;
  setShowImageKey: (show: boolean) => void;

  voiceApiKeyInput: string;
  setVoiceApiKeyInput: (val: string) => void;
  showVoiceKey: boolean;
  setShowVoiceKey: (show: boolean) => void;

  // Saved key getters & clearers
  getSavedTextKey: () => string;
  getSavedImageKey: () => string;
  getSavedVoiceKey: () => string;
  explicitlyClearedTextKey: boolean;
  setExplicitlyClearedTextKey: (val: boolean) => void;
  explicitlyClearedImageKey: boolean;
  setExplicitlyClearedImageKey: (val: boolean) => void;
  explicitlyClearedVoiceKey: boolean;
  setExplicitlyClearedVoiceKey: (val: boolean) => void;
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
}

export const ApiSettingsPanel: React.FC<ApiSettingsPanelProps> = ({
  config,
  setConfig,
  activeCategory,
  setActiveCategory,
  textApiKeyInput,
  setTextApiKeyInput,
  showTextKey,
  setShowTextKey,
  imageApiKeyInput,
  setImageApiKeyInput,
  showImageKey,
  setShowImageKey,
  voiceApiKeyInput,
  setVoiceApiKeyInput,
  showVoiceKey,
  setShowVoiceKey,
  getSavedTextKey,
  getSavedImageKey,
  getSavedVoiceKey,
  explicitlyClearedTextKey,
  setExplicitlyClearedTextKey,
  explicitlyClearedImageKey,
  setExplicitlyClearedImageKey,
  explicitlyClearedVoiceKey,
  setExplicitlyClearedVoiceKey,
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
  isTestingModel,
  modelTestResult,
  handleTestSelectedModel,
  handleGlobalSave,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);

  // 自定义配置列表状态
  const [customPresets, setCustomPresets] = useState<CustomPresetItem[]>(loadSavedPresets);
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
      setConfig((prev) => ({ ...prev, textProvider: 'custom' }));
      return;
    }
    const found = customPresets.find((p) => p.id === id);
    if (found) {
      setConfig((prev) => ({
        ...prev,
        textProvider: 'custom',
        textBaseUrl: found.baseUrl,
        textModel: found.model,
        ...(found.apiKey ? { textApiKey: found.apiKey } : {}),
      }));
      if (found.apiKey) {
        setTextApiKeyInput(found.apiKey);
        setExplicitlyClearedTextKey(false);
      }
      showNotice(`已切换到预设：${found.name}`);
    }
  };

  // 保存当前参数为新的自定义配置
  const handleSaveAsCustomPreset = () => {
    const name = newPresetName.trim() || `自定义配置 ${customPresets.length + 1}`;
    const newPreset: CustomPresetItem = {
      id: 'custom_' + Date.now(),
      name,
      baseUrl: config.textBaseUrl || '',
      apiKey: textApiKeyInput.trim() || getSavedTextKey() || '',
      model: config.textModel || '',
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
    setConfig((prev) => ({
      ...prev,
      textBaseUrl: '',
      textApiKey: '',
      textModel: '',
      textProvider: 'custom',
    }));
    setTextApiKeyInput('');
    setExplicitlyClearedTextKey(true);
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
              value={config.textBaseUrl || ''}
              onChange={(e) => setConfig({ ...config, textBaseUrl: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
            />
          </div>

          {/* 2. 密钥（Key / API Key） */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 密钥 (Key / API Key)
              </label>
              {getSavedTextKey() && !explicitlyClearedTextKey && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  已保存有效密钥 (••••{getSavedTextKey().slice(-4)})
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showTextKey ? 'text' : 'password'}
                placeholder={
                  getSavedTextKey() && !explicitlyClearedTextKey
                    ? '已保存有效密钥（留空保持不变；输入新 Key 覆盖）'
                    : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
                }
                value={textApiKeyInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setTextApiKeyInput(val);
                  setExplicitlyClearedTextKey(false);
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
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
                value={config.textModel || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setConfig((prev) => ({ ...prev, textModel: e.target.value }));
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
              value={config.textModel || ''}
              onChange={(e) => setConfig({ ...config, textModel: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
            />
          </div>

          {/* 4. 预设配置 (只有自定义，支持删除) */}
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

              {/* 若当前选中的是保存的自定义配置，提供快捷删除按钮 */}
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

          {/* 高级设置 (折叠区 - 仅放底层协议切换与单模型单次测试) */}
          <div className="pt-2 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition py-1"
            >
              <span className="font-medium flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                高级设置
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  showAdvanced ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="mt-3 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-medium block">底层 Provider 协议类型</label>
                  <select
                    value={config.textProvider || 'custom'}
                    onChange={(e) => {
                      const newP = e.target.value as ProviderType;
                      setConfig((prev) => ({ ...prev, textProvider: newP }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs focus:outline-none"
                  >
                    <option value="custom">自定义反代协议 (OpenAI /v1 规范)</option>
                    <option value="google_gemini">Google Gemini (原生 / 官方反代)</option>
                    <option value="openai_compatible">OpenAI Compatible (兼容协议)</option>
                    <option value="deepseek">DeepSeek 协议</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-zinc-400 font-medium block">单模型对话实时测试</label>
                  <button
                    type="button"
                    onClick={handleTestSelectedModel}
                    disabled={isTestingModel || !config.textModel}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-zinc-300" />
                    <span>{isTestingModel ? '测试中...' : `向 [${config.textModel || '当前模型'}] 发送测试问候`}</span>
                  </button>
                  {modelTestResult && (
                    <div className="p-3 rounded-xl bg-black/60 border border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
                        <span>{modelTestResult.success ? '✓ 响应成功' : '✕ 响应失败'}</span>
                        <span>{modelTestResult.latencyMs}ms</span>
                      </div>
                      {modelTestResult.reply && (
                        <p className="text-zinc-200 leading-relaxed">"{modelTestResult.reply}"</p>
                      )}
                      {modelTestResult.error && (
                        <p className="text-rose-400 font-mono text-[10px] break-all">{modelTestResult.error}</p>
                      )}
                    </div>
                  )}
                </div>

                {getSavedTextKey() && !explicitlyClearedTextKey && (
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-zinc-400">清除已保存密钥</span>
                    <button
                      type="button"
                      onClick={handleClearTextKey}
                      className="text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                    >
                      清除当前 Key
                    </button>
                  </div>
                )}
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
              value={config.imageBaseUrl || ''}
              onChange={(e) => setConfig({ ...config, imageBaseUrl: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 图像 API 密钥 (留空默认同主密钥)
              </label>
              {getSavedImageKey() && !explicitlyClearedImageKey && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  已保存有效密钥 (••••{getSavedImageKey().slice(-4)})
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showImageKey ? 'text' : 'password'}
                placeholder={
                  getSavedImageKey() && !explicitlyClearedImageKey
                    ? '已保存有效密钥（留空保持不变）'
                    : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
                }
                value={imageApiKeyInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setImageApiKeyInput(val);
                  setExplicitlyClearedImageKey(false);
                  setConfig((prev) => ({ ...prev, imageApiKey: val }));
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
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
              value={config.imageModel || 'dall-e-3'}
              onChange={(e) => setConfig({ ...config, imageModel: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-500 transition"
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
              value={config.voiceBaseUrl || ''}
              onChange={(e) => setConfig({ ...config, voiceBaseUrl: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-300 font-medium">
                2. 语音 API 密钥 (留空默认同主密钥)
              </label>
              {getSavedVoiceKey() && !explicitlyClearedVoiceKey && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  已保存有效密钥 (••••{getSavedVoiceKey().slice(-4)})
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showVoiceKey ? 'text' : 'password'}
                placeholder={
                  getSavedVoiceKey() && !explicitlyClearedVoiceKey
                    ? '已保存有效密钥（留空保持不变）'
                    : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
                }
                value={voiceApiKeyInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setVoiceApiKeyInput(val);
                  setExplicitlyClearedVoiceKey(false);
                  setConfig((prev) => ({ ...prev, voiceApiKey: val }));
                }}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-500 transition"
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
              value={config.voiceModel || 'tts-1'}
              onChange={(e) => setConfig({ ...config, voiceModel: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none focus:border-zinc-500 transition"
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
    </div>
  );
};
