import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Smartphone,
  Eye,
  Bell,
  Sliders,
  Sparkles,
  Info,
  X,
  Volume2,
  Camera,
  Mic,
  MapPin,
  Cpu,
  Layers,
  History,
  FileText,
  Lock,
} from 'lucide-react';
import {
  CapabilityStatus,
  SystemCapabilityId,
  SystemCapabilityDef,
  CapabilityDiagnosticResult,
  AiPermissionLevel,
  AiPermissionItemDef,
  SceneId,
  SceneRuleConfig,
  PermissionChangedEvent,
} from '../../lib/agent/types';
import {
  systemCapabilityManager,
  SYSTEM_CAPABILITIES_LIST,
} from '../../lib/agent/SystemCapabilityManager';
import {
  permissionManager,
  AI_PERMISSION_ITEMS,
} from '../../lib/agent/PermissionManager';
import { loadCharacters } from '../../lib/storage';
import { AiCharacter } from '../../types';

interface AiPermissionsAppProps {
  onBackToLauncher: () => void;
  onOpenActivityLogs?: () => void;
}

export const AiPermissionsApp: React.FC<AiPermissionsAppProps> = ({
  onBackToLauncher,
  onOpenActivityLogs,
}) => {
  // Tabs: 1. 系统权限, 2. AI权限, 3. 场景规则
  const [activeTab, setActiveTab] = useState<'system' | 'ai' | 'scene'>('system');

  // Master switch "今天别管我"
  const [dndToday, setDndToday] = useState(permissionManager.isDoNotDisturbToday());

  // System Capability state
  const [sysStatuses, setSysStatuses] = useState(systemCapabilityManager.getAllStatuses());
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [activeDiagnostic, setActiveDiagnostic] = useState<CapabilityDiagnosticResult | null>(null);
  const [fallbackModalCap, setFallbackModalCap] = useState<SystemCapabilityDef | null>(null);
  const [techExplainCap, setTechExplainCap] = useState<SystemCapabilityDef | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // AI independent permissions state
  const [characters, setCharacters] = useState<AiCharacter[]>([]);
  const [selectedAiId, setSelectedAiId] = useState<string>('');
  const [aiConfigs, setAiConfigs] = useState(permissionManager.getAllAiConfigs());
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Scene rules state
  const [sceneRules, setSceneRules] = useState(permissionManager.getAllSceneRules());
  const [selectedSceneId, setSelectedSceneId] = useState<SceneId>('short_video');

  // Subscribe to changes
  useEffect(() => {
    const chars = loadCharacters();
    setCharacters(chars);
    if (chars.length > 0) {
      setSelectedAiId(chars[0].id);
    }

    const unsubSys = systemCapabilityManager.subscribe(() => {
      setSysStatuses(systemCapabilityManager.getAllStatuses());
    });

    const unsubPerm = permissionManager.subscribe(() => {
      setAiConfigs(permissionManager.getAllAiConfigs());
      setSceneRules(permissionManager.getAllSceneRules());
      setDndToday(permissionManager.isDoNotDisturbToday());
    });

    // Auto-check real permissions on mount
    systemCapabilityManager.recheckAll();

    return () => {
      unsubSys();
      unsubPerm();
    };
  }, []);

  const triggerToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 3500);
  };

  const handleToggleDnd = () => {
    const next = !dndToday;
    permissionManager.setDoNotDisturbToday(next);
    setDndToday(next);
    triggerToast(next ? '已开启【今天别管我】静默模式' : '已关闭【今天别管我】，恢复原有权限');
  };

  const handleRecheckAll = async () => {
    setIsCheckingAll(true);
    triggerToast('正在重新检测全套 14 项系统能力...');
    await systemCapabilityManager.recheckAll();
    setIsCheckingAll(false);
    triggerToast('系统能力状态检测完成');
  };

  const counts = systemCapabilityManager.getCapabilityCounts();

  // Helper: render unified capability status badge
  const renderCapabilityStatusBadge = (status: CapabilityStatus) => {
    switch (status) {
      case 'GRANTED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            🟢 已授权
          </span>
        );
      case 'TEMPORARY':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            🟡 临时授权 / 使用时
          </span>
        );
      case 'DENIED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            🔴 未授权
          </span>
        );
      case 'REQUEST_FAILED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            🟠 获取失败
          </span>
        );
      case 'SETTINGS_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            🔵 需要系统设置
          </span>
        );
      case 'UNSUPPORTED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-400 border border-zinc-700/50 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            ⚫ 当前设备不支持
          </span>
        );
      case 'NOT_IMPLEMENTED':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[11px] font-medium flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            ⚪ 当前版本尚未实现
          </span>
        );
    }
  };

  const handleRequestCapability = async (id: SystemCapabilityId) => {
    const res = await systemCapabilityManager.requestCapability(id);
    if (res.success) {
      triggerToast('能力授权成功');
    } else {
      triggerToast(res.error || '获取未完成，可点击【再次获取】或【权限诊断】');
    }
  };

  const handleOpenDiagnostics = (id: SystemCapabilityId) => {
    const result = systemCapabilityManager.runDiagnostics(id);
    setActiveDiagnostic(result);
  };

  const handleOpenFallbackDrawer = (cap: SystemCapabilityDef) => {
    setFallbackModalCap(cap);
  };

  // Currently selected AI Character
  const currentAi = characters.find((c) => c.id === selectedAiId) || characters[0];
  const currentAiConfig = currentAi ? aiConfigs[currentAi.id] : null;

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Status Toast */}
      {statusMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-xs shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in duration-200 max-w-[90%] text-center">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="h-13 px-3 bg-zinc-900/95 border-b border-zinc-800/80 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white font-medium px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 transition active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>桌面</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-zinc-100 leading-tight">AI 权限</h2>
            <p className="text-[10px] text-zinc-400 leading-tight">四层权限安全调度中心</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenActivityLogs && (
            <button
              onClick={onOpenActivityLogs}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/80 transition"
              title="查看 AI 活动审计记录"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleRecheckAll}
            disabled={isCheckingAll}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/80 transition"
            title="重新检测系统能力"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingAll ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top Banner: Master Mute & One-Click Summary */}
      <div className="p-3 bg-zinc-900/60 border-b border-zinc-800/60 shrink-0 space-y-2.5">
        {/* "今天别管我" Master Mute Switch */}
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${dndToday ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-200">今天别管我</span>
                {dndToday && (
                  <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-medium border border-amber-500/30">
                    静默中
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                开启后暂停后台决策、主动消息与悬浮窗；用户主动聊天正常；不删除原有权限设置。
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={handleToggleDnd}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 cursor-pointer ${
              dndToday ? 'bg-amber-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                dndToday ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* One-Click Check System Capability Bar */}
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-zinc-900 border border-indigo-500/20">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                系统能力
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-mono font-bold">
                {counts.available} / {counts.total} 可用
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              已授权 {counts.granted} · 临时 {counts.temporary} · 尚未实现 {counts.notImplemented} · 未授权 {counts.denied}
            </p>
          </div>

          <button
            onClick={handleRecheckAll}
            disabled={isCheckingAll}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
            <span>一键全面检测</span>
          </button>
        </div>

        {/* 3 Main Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-900/90 border border-zinc-800">
          <button
            onClick={() => setActiveTab('system')}
            className={`py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'system'
                ? 'bg-zinc-800 text-indigo-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>1. 系统权限</span>
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'ai'
                ? 'bg-zinc-800 text-indigo-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>2. AI权限</span>
          </button>
          <button
            onClick={() => setActiveTab('scene')}
            className={`py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'scene'
                ? 'bg-zinc-800 text-indigo-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>3. 场景规则</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* ========================================== */}
        {/* TAB 1: 系统权限 (System Capabilities)       */}
        {/* ========================================== */}
        {activeTab === 'system' && (
          <div className="space-y-3">
            <div className="px-1 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Android 原生能力与宿主硬件环境对接清单</span>
              <span>14 项核心能力</span>
            </div>

            <div className="space-y-2.5">
              {SYSTEM_CAPABILITIES_LIST.map((cap) => {
                const status = sysStatuses[cap.id] || 'NOT_IMPLEMENTED';
                const isNotImplemented = status === 'NOT_IMPLEMENTED';
                const isFailed = status === 'REQUEST_FAILED';
                const isDenied = status === 'DENIED';
                const isGranted = status === 'GRANTED' || status === 'TEMPORARY';
                const isSettings = status === 'SETTINGS_REQUIRED';

                return (
                  <div
                    key={cap.id}
                    className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800/90 space-y-2.5 hover:border-zinc-700/80 transition"
                  >
                    {/* Title & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-semibold text-zinc-100">{cap.name}</h4>
                          {renderCapabilityStatusBadge(status)}
                        </div>
                        <p className="text-[10px] text-zinc-400 font-mono truncate">{cap.androidApiName}</p>
                      </div>

                      <button
                        onClick={() => handleOpenDiagnostics(cap.id)}
                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] font-medium border border-zinc-700/60 flex items-center gap-1 shrink-0 transition"
                        title="查看环境兼容性与底层诊断"
                      >
                        <Search className="w-3 h-3 text-indigo-400" />
                        <span>诊断</span>
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{cap.description}</p>
                    <div className="p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/70 text-[10px] text-zinc-400 flex items-start gap-1.5">
                      <Info className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{cap.whyNeeded}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-1 flex items-center justify-end gap-2 flex-wrap border-t border-zinc-800/60">
                      {isNotImplemented && (
                        <>
                          <span className="text-[10px] text-zinc-500 mr-auto flex items-center gap-1">
                            <Layers className="w-3 h-3 text-zinc-500" />
                            Phase 2 原生插件预留
                          </span>
                          <button
                            onClick={() => setTechExplainCap(cap)}
                            className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                          >
                            能力技术说明
                          </button>
                        </>
                      )}

                      {isDenied && (
                        <button
                          onClick={() => handleRequestCapability(cap.id)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition shadow-sm active:scale-95"
                        >
                          获取权限
                        </button>
                      )}

                      {isFailed && (
                        <>
                          {/* CRITICAL USER REQUIREMENT: 再次获取 is ALWAYS enabled and visible! */}
                          <button
                            onClick={() => handleRequestCapability(cap.id)}
                            className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-medium transition active:scale-95"
                          >
                            再次获取
                          </button>
                          <button
                            onClick={() => handleOpenFallbackDrawer(cap)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition"
                          >
                            自动寻找设置入口
                          </button>
                        </>
                      )}

                      {isGranted && (
                        <>
                          <button
                            onClick={() => handleRequestCapability(cap.id)}
                            className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition"
                          >
                            检查权限
                          </button>
                          <button
                            onClick={() => handleOpenFallbackDrawer(cap)}
                            className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition flex items-center gap-1"
                          >
                            <span>打开系统设置</span>
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </button>
                        </>
                      )}

                      {isSettings && (
                        <>
                          <button
                            onClick={() => handleOpenFallbackDrawer(cap)}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition"
                          >
                            前往设置
                          </button>
                          <button
                            onClick={async () => {
                              await systemCapabilityManager.recheckAll();
                              triggerToast('已重新检测该能力真实状态');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition"
                          >
                            我已经设置好了 · 重新检测
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: AI权限 (AI Independent Permissions)  */}
        {/* ========================================== */}
        {activeTab === 'ai' && (
          <div className="space-y-3.5">
            {/* AI Selector */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2.5">
              <label className="text-[11px] text-zinc-400 font-medium">选择需要配置独立权限的 AI 角色：</label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {characters.map((char) => {
                  const isSelected = char.id === selectedAiId;
                  return (
                    <button
                      key={char.id}
                      onClick={() => setSelectedAiId(char.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                          : 'bg-zinc-800/70 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <img
                        src={char.avatar}
                        alt={char.name}
                        className="w-6 h-6 rounded-full object-cover border border-zinc-700"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <span className="text-xs font-medium">{char.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Awareness Toggle for this AI */}
              {currentAiConfig && (
                <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      允许 AI 感知自己的权限变化
                    </span>
                    <p className="text-[10px] text-zinc-400">
                      开启后，权限被你调整时，AI 可在后续对话中感知到变化（但绝无法绕过新权限）。
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      permissionManager.setAllowAwarePermissionChanges(
                        currentAi.id,
                        !currentAiConfig.allowAwarePermissionChanges
                      )
                    }
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 p-0.5 ${
                      currentAiConfig.allowAwarePermissionChanges ? 'bg-indigo-600' : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        currentAiConfig.allowAwarePermissionChanges ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Link to AI Permission Change History */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-zinc-400 font-medium">7 大类独立能力细则</span>
              <button
                onClick={() => setShowHistoryModal(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
              >
                <History className="w-3.5 h-3.5" />
                <span>权限变更历史</span>
              </button>
            </div>

            {/* 7 Categories Listing */}
            {currentAiConfig && (
              <div className="space-y-3">
                {AI_PERMISSION_ITEMS.map((item) => {
                  const currentLevel = currentAiConfig.permissions[item.id] || 'DENY';
                  const sysCapStatus = item.requiredCapabilityId
                    ? sysStatuses[item.requiredCapabilityId]
                    : null;
                  const isSysGranted =
                    sysCapStatus === 'GRANTED' || sysCapStatus === 'TEMPORARY';

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-zinc-100">{item.name}</h4>
                            {item.isSensitive && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-300 text-[9px] border border-rose-500/30">
                                敏感权限
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{item.description}</p>
                        </div>

                        {/* System Capability Hint */}
                        {item.requiredCapabilityId && (
                          <div className="text-right shrink-0">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                isSysGranted
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}
                            >
                              系统能力: {isSysGranted ? '🟢 可用' : '🔴 未就绪'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 3-Level Permission Selector */}
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-950/80 border border-zinc-800">
                        <button
                          onClick={() =>
                            permissionManager.updateAiPermission(currentAi.id, item.id, 'DENY', 'USER')
                          }
                          className={`py-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 ${
                            currentLevel === 'DENY'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>禁止</span>
                        </button>
                        <button
                          onClick={() =>
                            permissionManager.updateAiPermission(currentAi.id, item.id, 'ASK', 'USER')
                          }
                          className={`py-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 ${
                            currentLevel === 'ASK'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>每次询问</span>
                        </button>
                        <button
                          onClick={() =>
                            permissionManager.updateAiPermission(currentAi.id, item.id, 'ALLOW', 'USER')
                          }
                          className={`py-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 ${
                            currentLevel === 'ALLOW'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>始终允许</span>
                        </button>
                      </div>

                      {/* Sub-note: System != AI */}
                      {item.requiredCapabilityId && !isSysGranted && currentLevel === 'ALLOW' && (
                        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>
                            你虽已设为【始终允许】，但底层系统能力尚未授权，AI 执行时仍会被系统层拦截。
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: 场景规则 (Scene Rules)               */}
        {/* ========================================== */}
        {activeTab === 'scene' && (
          <div className="space-y-3.5">
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
              <label className="text-[11px] text-zinc-400 font-medium">选择需要调整的场景情境：</label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(sceneRules).map((rule) => {
                  const isSelected = rule.sceneId === selectedSceneId;
                  return (
                    <button
                      key={rule.sceneId}
                      onClick={() => setSelectedSceneId(rule.sceneId)}
                      className={`p-2 rounded-xl border text-left transition ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm'
                          : 'bg-zinc-800/70 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <div className="text-xs font-semibold">{rule.sceneName}</div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{rule.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Scene Detailed Controls */}
            {sceneRules[selectedSceneId] && (
              <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="border-b border-zinc-800 pb-2">
                  <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    【{sceneRules[selectedSceneId].sceneName}】规则配置
                  </h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {sceneRules[selectedSceneId].description}
                  </p>
                </div>

                {/* Special Callouts for Gaming or Short Video */}
                {selectedSceneId === 'gaming' && (
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-200 space-y-1">
                    <div className="font-semibold flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      游戏默认保护规则：
                    </div>
                    <p className="text-[10px] text-blue-300/90 leading-relaxed">
                      允许感知正在游戏与使用时长；允许主动消息与通知；悬浮窗可配；严禁主动抢占前台与外部界面控制，防止对战被强退打断。
                    </p>
                  </div>
                )}

                {selectedSceneId === 'short_video' && (
                  <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-200 space-y-2">
                    <div className="font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-purple-400" />
                      短视频分阶段温和介入阈值规则预留：
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-purple-300">
                      <div className="p-2 rounded-lg bg-zinc-950/50 border border-purple-500/20">
                        20 分钟: 允许主动发消息
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-950/50 border border-purple-500/20">
                        30 分钟: 允许轻量悬浮提醒
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-950/50 border border-purple-500/20">
                        45 分钟: 允许请求打开小手机
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-950/50 border border-purple-500/20">
                        60 分钟: 允许尝试主动拉起
                      </div>
                    </div>
                    <p className="text-[9px] text-purple-400">
                      * Phase 1 数据结构已生效，底层无感记录；Phase 2 将与 Android 原生守护线程联动。
                    </p>
                  </div>
                )}

                {/* 8 Configurable Dimensions */}
                <div className="space-y-2 pt-1">
                  {[
                    { key: 'allowSense', label: '是否允许感知当前状态', desc: '感知进入此场景与已停留时长' },
                    { key: 'allowScreen', label: '是否允许查看当前屏幕', desc: '截图画面交由 AI 阅读理解' },
                    { key: 'allowProactiveMessage', label: '是否允许主动发送微信消息', desc: '在微信中主动发起新会话' },
                    { key: 'allowNotification', label: '是否允许推送系统通知', desc: '在通知栏展示提醒' },
                    { key: 'allowFloating', label: '是否允许弹出悬浮气泡', desc: '在其他应用上方轻量悬浮' },
                    { key: 'allowRequestOpenPhone', label: '是否允许请求打开小手机', desc: '弹出友好弹窗征求用户同意' },
                    { key: 'allowForceOpenPhone', label: '是否允许主动拉起小手机', desc: '直接将小手机切至前台' },
                    { key: 'allowExternalControl', label: '是否允许外部界面辅助控制', desc: '通过无障碍模拟点击' },
                  ].map((dim) => {
                    const rule = sceneRules[selectedSceneId];
                    const isChecked = Boolean((rule as any)[dim.key]);
                    return (
                      <div
                        key={dim.key}
                        className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80"
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-zinc-200">{dim.label}</div>
                          <div className="text-[10px] text-zinc-400">{dim.desc}</div>
                        </div>

                        <button
                          onClick={() => {
                            permissionManager.updateSceneRule(selectedSceneId, {
                              [dim.key]: !isChecked,
                            });
                          }}
                          className={`w-10 h-5 rounded-full transition-colors relative shrink-0 p-0.5 ${
                            isChecked ? 'bg-indigo-600' : 'bg-zinc-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              isChecked ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL 1: 权限诊断 (Capability Diagnostics)  */}
      {/* ========================================== */}
      {activeDiagnostic && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4 space-y-3.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                <Search className="w-4 h-4 text-indigo-400" />
                权限诊断报告
              </h3>
              <button
                onClick={() => setActiveDiagnostic(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-zinc-300 text-[11px]">
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">检测目标:</span>
                <span className="font-medium text-zinc-100">{activeDiagnostic.targetCapabilityName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">设备厂商:</span>
                <span className="font-medium text-indigo-300">{activeDiagnostic.vendor}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">OS 运行环境:</span>
                <span className="font-mono text-zinc-200">{activeDiagnostic.osVersion}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">当前判定状态:</span>
                <div>{renderCapabilityStatusBadge(activeDiagnostic.currentStatus)}</div>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">底层系统接口:</span>
                <span className={activeDiagnostic.nativeInterfaceExists ? 'text-emerald-400' : 'text-zinc-400'}>
                  {activeDiagnostic.nativeInterfaceExists ? '存在且可用' : '当前环境无原生守护'}
                </span>
              </div>

              {activeDiagnostic.notSupportedReason && (
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px]">
                  {activeDiagnostic.notSupportedReason}
                </div>
              )}

              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] space-y-1">
                <span className="text-zinc-400 block">建议下一步操作:</span>
                <p className="text-zinc-200 font-medium">{activeDiagnostic.recommendedAction}</p>
                <span className="text-[9px] text-zinc-500 font-mono">最接近入口: {activeDiagnostic.bestSettingsTarget}</span>
              </div>
            </div>

            <div className="pt-1 flex gap-2">
              <button
                onClick={() => {
                  systemCapabilityManager.openSettings(activeDiagnostic.targetCapabilityId);
                  triggerToast(`已请求唤起系统设置 (${activeDiagnostic.bestSettingsTarget})`);
                  setActiveDiagnostic(null);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition"
              >
                打开最接近的设置入口
              </button>
              <button
                onClick={() => setActiveDiagnostic(null)}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: 自动寻找设置入口 (Fallback Settings) */}
      {/* ========================================== */}
      {fallbackModalCap && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4 text-indigo-400" />
                自动寻找系统设置入口
              </h3>
              <button
                onClick={() => setFallbackModalCap(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-300">
              针对【{fallbackModalCap.name}】，系统将按以下优先级自动降级匹配最合适的目标路径：
            </p>

            {/* 5 Tier Fallback Steps */}
            <div className="space-y-1.5 text-[10px]">
              <div className="p-2 rounded-xl bg-zinc-950 border border-indigo-500/30 text-indigo-300 flex items-start gap-1.5">
                <span className="font-bold text-indigo-400">1. 精准权限页:</span>
                <span className="font-mono text-zinc-300 truncate">{fallbackModalCap.settingsPathTier1}</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 flex items-start gap-1.5">
                <span className="font-bold text-zinc-400">2. 特殊权限页:</span>
                <span className="font-mono text-zinc-400 truncate">{fallbackModalCap.settingsPathTier2}</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 flex items-start gap-1.5">
                <span className="font-bold text-zinc-400">3. 应用详情页:</span>
                <span className="font-mono text-zinc-400 truncate">{fallbackModalCap.settingsPathTier3}</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 flex items-start gap-1.5">
                <span className="font-bold text-zinc-400">4. 权限管理中心:</span>
                <span className="font-mono text-zinc-400 truncate">android.settings.PRIVACY_SETTINGS</span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 flex items-start gap-1.5">
                <span className="font-bold text-zinc-400">5. 系统设置主页:</span>
                <span className="font-mono text-zinc-400 truncate">android.settings.SETTINGS</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  systemCapabilityManager.openSettings(fallbackModalCap.id);
                  triggerToast(`已发起唤起请求: ${fallbackModalCap.settingsPathTier1}`);
                  setFallbackModalCap(null);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition"
              >
                立即唤起最匹配入口
              </button>
              <button
                onClick={() => setFallbackModalCap(null)}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: 能力技术说明 (Not Implemented Tech Info) */}
      {/* ========================================== */}
      {techExplainCap && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-400" />
                原生技术架构说明
              </h3>
              <button
                onClick={() => setTechExplainCap(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-zinc-300 text-[11px] leading-relaxed">
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 block text-[10px]">技术名称:</span>
                <span className="font-mono text-indigo-300 font-semibold">{techExplainCap.androidApiName}</span>
              </div>
              <p>
                当前小手机处于 <strong className="text-zinc-100">Phase 1 权限与基础设施阶段</strong>。
                本项目遵循工程诚实原则：<strong className="text-rose-400">严禁伪造已授权</strong>。
              </p>
              <p>
                该能力需要借助 Android 平台专门的后台 Service（例如无障碍辅助服务、通知监听服务或 UsageStatsManager）。在后续 Phase 2 编译原生 Android APK 并注册底层插件后即可直接对接使用。
              </p>
            </div>

            <button
              onClick={() => setTechExplainCap(null)}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 4: AI 权限变更历史                     */}
      {/* ========================================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-700 p-4 space-y-3 shadow-2xl text-xs max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 shrink-0">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-400" />
                {currentAi?.name} · 权限变更审计历史
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {permissionManager.getPermissionChangeEvents(currentAi?.id).length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  暂无权限变更记录，当前保持初始配置。
                </div>
              ) : (
                permissionManager.getPermissionChangeEvents(currentAi?.id).map((event) => (
                  <div
                    key={event.id}
                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-200">{event.permissionName}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-zinc-400">变更轨迹:</span>
                      <span className="font-mono text-rose-400">{event.oldValue}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="font-mono text-emerald-400">{event.newValue}</span>
                      <span className="ml-auto text-[9px] px-1 rounded bg-zinc-800 text-zinc-400">
                        {event.source === 'USER' ? '用户手动' : '系统规则'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition shrink-0"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
