import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Smartphone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Battery,
  BatteryCharging,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Eye,
  MessageSquare,
  Flame,
  Layers,
  Terminal,
} from 'lucide-react';
import {
  AgentEvent,
  AgentEventType,
  AgentDecisionTrace,
  SceneId,
  AgentActionType,
} from '../../lib/agent/types';
import { eventManager } from '../../lib/agent/EventManager';
import { localRuleEngine } from '../../lib/agent/LocalRuleEngine';
import { deviceContextManager } from '../../lib/agent/DeviceContextManager';
import { permissionManager } from '../../lib/agent/PermissionManager';
import { agentOrchestrator } from '../../lib/agent/AgentOrchestrator';
import { loadCharacters } from '../../lib/storage';
import { AiCharacter } from '../../types';

interface AgentSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToWechat?: (characterId?: string) => void;
}

const PRESET_APPS: { name: string; sceneId: SceneId; icon: string }[] = [
  { name: '抖音 (短视频)', sceneId: 'short_video', icon: '🎵' },
  { name: '原神 (游戏)', sceneId: 'gaming', icon: '🎮' },
  { name: '小红书 (社交浏览)', sceneId: 'social', icon: '📕' },
  { name: 'Chrome 浏览器', sceneId: 'browser', icon: '🌐' },
  { name: '招商银行 (金融支付)', sceneId: 'finance_payment', icon: '💳' },
  { name: '系统锁屏密码验证', sceneId: 'password_auth', icon: '🔒' },
  { name: '微信 (聊天)', sceneId: 'social', icon: '💬' },
];

export const AgentSimulatorModal: React.FC<AgentSimulatorModalProps> = ({
  isOpen,
  onClose,
  onNavigateToWechat,
}) => {
  const [characters, setCharacters] = useState<AiCharacter[]>([]);
  const [selectedAiId, setSelectedAiId] = useState<string>('');

  // Simulation controls state
  const [currentApp, setCurrentApp] = useState<string>('抖音 (短视频)');
  const [currentScene, setCurrentScene] = useState<SceneId>('short_video');
  const [usageDuration, setUsageDuration] = useState<number>(25); // Minutes
  const [batteryLevel, setBatteryLevel] = useState<number>(18);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [simulatedHour, setSimulatedHour] = useState<number>(23);
  const [bypassCooldown, setBypassCooldown] = useState<boolean>(true);

  // Live decision traces
  const [traces, setTraces] = useState<AgentDecisionTrace[]>([]);
  const [activeTab, setActiveTab] = useState<'controls' | 'traces'>('controls');
  const [selectedTrace, setSelectedTrace] = useState<AgentDecisionTrace | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  useEffect(() => {
    const chars = loadCharacters();
    setCharacters(chars);
    if (chars.length > 0) {
      setSelectedAiId(chars[0].id);
    }
    setTraces(agentOrchestrator.getRecentTraces());

    const unsub = agentOrchestrator.subscribeTraces((newTraces) => {
      setTraces(newTraces);
    });

    localRuleEngine.setSimulationBypassCooldown(bypassCooldown);

    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleAppChange = (appObj: typeof PRESET_APPS[0]) => {
    setCurrentApp(appObj.name);
    setCurrentScene(appObj.sceneId);
    permissionManager.setCurrentScene(appObj.sceneId);
    deviceContextManager.setForegroundApp(appObj.name);
  };

  const handleApplyState = () => {
    permissionManager.setCurrentScene(currentScene);
    deviceContextManager.setForegroundApp(currentApp);
  };

  const handleResetCooldown = () => {
    localRuleEngine.resetAllCooldowns();
    alert('已清除所有 AI 的冷却时间');
  };

  const handleToggleBypass = (val: boolean) => {
    setBypassCooldown(val);
    localRuleEngine.setSimulationBypassCooldown(val);
  };

  // 1. Simulate App Usage Tick
  const simulateAppUsageTrigger = async () => {
    setIsExecuting(true);
    handleApplyState();

    const evt = eventManager.emit(
      'APP_USAGE_TICK',
      {
        appName: currentApp,
        sceneId: currentScene,
        durationMinutes: usageDuration,
      },
      `前台应用 [${currentApp}] 持续使用已达 ${usageDuration} 分钟 (场景: ${currentScene})`
    );

    const trace = await agentOrchestrator.handleIncomingEvent(evt, selectedAiId);
    setSelectedTrace(trace);
    setActiveTab('traces');
    setIsExecuting(false);
  };

  // 2. Simulate Low Battery
  const simulateBatteryTrigger = async () => {
    setIsExecuting(true);
    handleApplyState();

    const evt = eventManager.emit(
      'BATTERY_CHANGED',
      {
        level: batteryLevel,
        isCharging,
      },
      `电池电量变更通知: ${batteryLevel}% ${isCharging ? '(充电中)' : '(放电中)'}`
    );

    const trace = await agentOrchestrator.handleIncomingEvent(evt, selectedAiId);
    setSelectedTrace(trace);
    setActiveTab('traces');
    setIsExecuting(false);
  };

  // 3. Simulate Night Time (23:30)
  const simulateNightTrigger = async () => {
    setIsExecuting(true);
    handleApplyState();

    const evt = eventManager.emit(
      'TIME_PERIOD_CHANGED',
      {
        hour: simulatedHour,
        minute: 30,
        periodName: simulatedHour >= 23 || simulatedHour < 6 ? '深夜' : '白昼',
      },
      `时间段进入: ${simulatedHour >= 23 || simulatedHour < 6 ? '深夜作息时段' : '日常时段'} (${simulatedHour}:30)`
    );

    const trace = await agentOrchestrator.handleIncomingEvent(evt, selectedAiId);
    setSelectedTrace(trace);
    setActiveTab('traces');
    setIsExecuting(false);
  };

  // 4. Force AI Proactive Chat
  const forceAiProactiveChat = async () => {
    setIsExecuting(true);
    handleApplyState();

    const char = characters.find((c) => c.id === selectedAiId) || characters[0];
    const evt = eventManager.emit(
      'MANUAL_TRIGGER',
      {
        actionType: 'proactive_chat',
        actionTitle: `${char.name} 主动关怀`,
        messageText: `${char.name}从手机感知到你在使用【${currentApp}】，特意发来问候：“注意适当休息眼睛哦！”`,
        reason: '模拟测试台手动发起主动发信',
      },
      `人工指令：要求 [${char.name}] 主动发送关怀消息`
    );

    const trace = await agentOrchestrator.handleIncomingEvent(evt, selectedAiId);
    setSelectedTrace(trace);
    setActiveTab('traces');
    setIsExecuting(false);
  };

  // 5. Force Screen View
  const forceScreenView = async () => {
    setIsExecuting(true);
    handleApplyState();

    const char = characters.find((c) => c.id === selectedAiId) || characters[0];
    const evt = eventManager.emit(
      'MANUAL_TRIGGER',
      {
        actionType: 'screen_view',
        actionTitle: `${char.name} 查看屏幕`,
        reason: '模拟测试台手动发起查看屏幕测试',
      },
      `人工指令：测试 [${char.name}] 请求查看当前屏幕`
    );

    const trace = await agentOrchestrator.handleIncomingEvent(evt, selectedAiId);
    setSelectedTrace(trace);
    setActiveTab('traces');
    setIsExecuting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none">
      <div className="w-full max-w-lg h-[92vh] max-h-[820px] rounded-3xl bg-zinc-950 border border-indigo-500/40 flex flex-col shadow-2xl overflow-hidden text-xs text-white">
        {/* Top Header */}
        <div className="h-14 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                <span>AI 手机代理决策模拟台</span>
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[9px] border border-indigo-500/30 font-mono">
                  Phase 2
                </span>
              </h2>
              <p className="text-[10px] text-zinc-400">
                端到端决策推演 · 四层穿透校验 · 实时入库验证
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="h-10 px-4 bg-zinc-900/60 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('controls')}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition ${activeTab === 'controls' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Sliders className="w-3.5 h-3.5 inline mr-1" />
              模拟控制与触发
            </button>
            <button
              onClick={() => setActiveTab('traces')}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition ${activeTab === 'traces' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Terminal className="w-3.5 h-3.5 inline mr-1" />
              决策流水线链路 ({traces.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassCooldown}
                onChange={(e) => handleToggleBypass(e.target.checked)}
                className="rounded accent-indigo-600"
              />
              <span>忽略冷却 (测试专用)</span>
            </label>
            <button
              onClick={handleResetCooldown}
              className="p-1 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 text-[10px] flex items-center gap-0.5"
              title="重置冷却时间"
            >
              <RotateCcw className="w-3 h-3" />
              <span>清冷却</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Controls & Triggers */}
        {activeTab === 'controls' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-zinc-300">
            {/* Target AI Selection */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  指定目标 AI 角色：
                </span>
                <span className="text-[10px] text-zinc-500">
                  各 AI 权限独立，互不通用
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedAiId(c.id)}
                    className={`p-2 rounded-xl border flex items-center gap-2 text-left transition ${selectedAiId === c.id ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                  >
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-6 h-6 rounded-lg object-cover"
                    />
                    <div className="truncate">
                      <div className="text-xs font-medium text-zinc-200 truncate">{c.name}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">{c.id}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 1. App Foreground & Duration Simulation */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                  1. 模拟前台运行应用 & 场景
                </span>
                <span className="text-[10px] text-indigo-400 font-medium">
                  当前场景: 【{currentScene}】
                </span>
              </div>

              {/* Preset App Buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_APPS.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleAppChange(item)}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 transition ${currentApp === item.name ? 'bg-indigo-600/20 border-indigo-500 text-zinc-100' : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'}`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="text-[11px] truncate font-medium">{item.name}</span>
                  </button>
                ))}
              </div>

              {/* Usage Duration Slider */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">持续使用时长：</span>
                  <span className="font-mono font-bold text-indigo-400">
                    {usageDuration} 分钟
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="5"
                  value={usageDuration}
                  onChange={(e) => setUsageDuration(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>0分 (刚打开)</span>
                  <span>20分 (护眼阈值)</span>
                  <span>45分 (关怀)</span>
                  <span>60分+ (沉迷)</span>
                </div>
              </div>

              <button
                disabled={isExecuting}
                onClick={simulateAppUsageTrigger}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-indigo-600/20"
              >
                <Play className="w-3.5 h-3.5" />
                <span>运行前台时长评估测试 (短视频/游戏规则)</span>
              </button>
            </div>

            {/* 2. Battery & Night Mode Simulations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Battery Card */}
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Battery className="w-3.5 h-3.5 text-amber-400" />
                    2. 模拟电量变化
                  </span>
                  <span className="text-[10px] font-mono text-amber-300 font-bold">
                    {batteryLevel}%
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="100"
                  value={batteryLevel}
                  onChange={(e) => setBatteryLevel(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />

                <div className="flex items-center justify-between text-[10px]">
                  <label className="flex items-center gap-1 text-zinc-400">
                    <input
                      type="checkbox"
                      checked={isCharging}
                      onChange={(e) => setIsCharging(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>充电中</span>
                  </label>
                  <span className="text-[9px] text-zinc-500">阈值: ≤20% 且未充电</span>
                </div>

                <button
                  disabled={isExecuting}
                  onClick={simulateBatteryTrigger}
                  className="w-full py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-medium text-xs flex items-center justify-center gap-1 transition"
                >
                  <Play className="w-3 h-3" />
                  <span>触发低电量评估</span>
                </button>
              </div>

              {/* Night Mode Card */}
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    3. 模拟时段变化
                  </span>
                  <span className="text-[10px] font-mono text-purple-300 font-bold">
                    {simulatedHour}:30
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="23"
                  value={simulatedHour}
                  onChange={(e) => setSimulatedHour(Number(e.target.value))}
                  className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />

                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>07:30 (清晨)</span>
                  <span>14:30 (午后)</span>
                  <span>23:30 (深夜)</span>
                </div>

                <button
                  disabled={isExecuting}
                  onClick={simulateNightTrigger}
                  className="w-full py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-medium text-xs flex items-center justify-center gap-1 transition"
                >
                  <Play className="w-3 h-3" />
                  <span>触发时段评估</span>
                </button>
              </div>
            </div>

            {/* 3. Direct Action Verification Buttons */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                4. 动作级穿透安全测试 (Direct Actions)
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isExecuting}
                  onClick={forceAiProactiveChat}
                  className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>请求主动发送微信</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    若被允许将真实写入微信聊天库并弹顶端通知
                  </p>
                </button>

                <button
                  disabled={isExecuting}
                  onClick={forceScreenView}
                  className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 text-left transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 text-blue-400 font-medium text-xs">
                    <Eye className="w-3.5 h-3.5" />
                    <span>请求查看屏幕</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    测试密码场景/银行场景下的绝对阻断
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Live Decision Traces Pipeline */}
        {activeTab === 'traces' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-zinc-300">
            {traces.length === 0 ? (
              <div className="py-20 text-center space-y-2">
                <Terminal className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">暂无决策流记录</p>
                <p className="text-[10px] text-zinc-500">
                  请切换至「模拟控制」选项卡触发测试
                </p>
              </div>
            ) : (
              traces.map((trace) => {
                const isExpanded = selectedTrace?.id === trace.id;
                const timeStr = new Date(trace.timestamp).toLocaleTimeString();

                return (
                  <div
                    key={trace.id}
                    onClick={() => setSelectedTrace(isExpanded ? null : trace)}
                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 hover:border-zinc-700 transition cursor-pointer"
                  >
                    {/* Trace Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          {trace.candidate.targetAiName}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {trace.candidate.actionTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {trace.finalOutcome === 'ALLOW' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[9px] font-medium border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>允许执行</span>
                          </span>
                        ) : trace.finalOutcome === 'ASK' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[9px] font-medium border border-amber-500/30">
                            待用户确认
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[9px] font-medium border border-rose-500/30 flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-rose-400" />
                            <span>被拦截</span>
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {timeStr}
                        </span>
                      </div>
                    </div>

                    {/* Trigger Reason */}
                    <div className="text-[11px] text-zinc-400">
                      触发原因: <span className="text-zinc-200">{trace.candidate.triggerReason}</span>
                    </div>

                    {/* Step-by-step pipeline trace */}
                    <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5 text-[10px]">
                      {trace.stages.map((stage, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 border-b border-zinc-900 last:border-none pb-1"
                        >
                          <div className="flex items-center gap-1.5 font-medium text-zinc-300 shrink-0">
                            {stage.passed ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                            )}
                            <span>{stage.stageName}</span>
                          </div>
                          <span className="text-right text-zinc-400 text-[9px] truncate">
                            {stage.detail}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Link to WeChat if proactive message succeeded */}
                    {trace.finalOutcome === 'ALLOW' &&
                      trace.candidate.actionType === 'proactive_chat' &&
                      onNavigateToWechat && (
                        <div className="pt-1 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              onNavigateToWechat(trace.candidate.targetAiId);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-[10px] font-medium flex items-center gap-1 transition"
                          >
                            <span>前往微信查看该主动消息</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="h-10 px-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400 shrink-0">
          <span>AI行为原则: 系统权限 ≠ AI权限 · 决策全过程可审计</span>
          <button
            onClick={() => {
              handleApplyState();
              alert('当前模拟状态已生效到手机内核');
            }}
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            应用当前状态到系统
          </button>
        </div>
      </div>
    </div>
  );
};
