import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Bell,
  Clock,
  CloudRain,
  Heart,
  Calendar,
  MessageSquare,
  Smartphone,
  Shield,
  Zap,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Sparkles,
  Users,
  Moon,
  Sun,
  X,
  Lock,
} from 'lucide-react';
import { ProactiveSettings, CustomProactiveEvent, FollowupTopicItem } from '../../types';
import {
  loadProactiveSettings,
  saveProactiveSettings,
} from '../../lib/proactive/proactiveStore';
import { proactiveEngine } from '../../lib/proactive/proactiveEngine';
import { chatMessageBridge } from '../../lib/agent/ChatMessageBridge';
import { proactiveGate } from '../../lib/proactive/ProactiveGate';
import { proactiveScheduler } from '../../lib/proactive/ProactiveScheduler';
import { loadCharacters, loadUserProfile, loadApiConfig } from '../../lib/storage';
import { LifeStatePanel } from './LifeStatePanel';

interface ProactiveSettingsPanelProps {
  onBack: () => void;
}

export const ProactiveSettingsPanel: React.FC<ProactiveSettingsPanelProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<ProactiveSettings>(() => loadProactiveSettings());
  const [characters, setCharacters] = useState(() => loadCharacters());
  const [activeTab, setActiveTab] = useState<'triggers' | 'life_state' | 'characters' | 'anti_harassment' | 'test'>('triggers');

  // Test Simulation Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testCharId, setTestCharId] = useState(characters[0]?.id || 'char_1');
  const [testTriggerType, setTestTriggerType] = useState<string>('inactivity_timeout');
  const [testResultText, setTestResultText] = useState<string | null>(null);
  const [testThinking, setTestThinking] = useState<string | null>(null);
  const [isTestGenerating, setIsTestGenerating] = useState(false);
  const [testModeSendToChat, setTestModeSendToChat] = useState(false);

  // Custom Event Form State
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventType, setNewEventType] = useState<'birthday' | 'anniversary' | 'exam' | 'date' | 'task' | 'custom'>('birthday');
  const [newEventRemindDays, setNewEventRemindDays] = useState(1);

  // Custom Followup Form State
  const [newFollowupTitle, setNewFollowupTitle] = useState('');
  const [newFollowupDate, setNewFollowupDate] = useState('');

  useEffect(() => {
    saveProactiveSettings(settings);
  }, [settings]);

  const handleSetTemporaryPause = (type: '1h' | 'tonight' | 'tomorrow' | 'resume') => {
    let targetTime: number | undefined;
    const now = new Date();

    if (type === '1h') {
      targetTime = Date.now() + 3600000;
    } else if (type === 'tonight') {
      const tonight = new Date();
      tonight.setHours(23, 0, 0, 0);
      if (tonight.getTime() <= Date.now()) {
        tonight.setDate(tonight.getDate() + 1);
      }
      targetTime = tonight.getTime();
    } else if (type === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      targetTime = tomorrow.getTime();
    } else {
      targetTime = undefined;
    }

    setSettings((prev) => ({ ...prev, pausedUntil: targetTime }));
  };

  const handleTogglePerAi = (charId: string, val: boolean) => {
    setSettings((prev) => {
      const existing = prev.perAiConfigs[charId] || { enabled: true };
      return {
        ...prev,
        perAiConfigs: {
          ...prev.perAiConfigs,
          [charId]: { ...existing, enabled: val },
        },
      };
    });
  };

  const handleAddCustomEvent = () => {
    if (!newEventTitle.trim() || !newEventDate) return;
    const newEvt: CustomProactiveEvent = {
      id: 'evt_' + Date.now(),
      title: newEventTitle.trim(),
      date: newEventDate,
      type: newEventType,
      remindBeforeDays: newEventRemindDays,
      allowFollowup: true,
    };
    setSettings((prev) => ({
      ...prev,
      importantEvents: {
        ...prev.importantEvents,
        customEvents: [...(prev.importantEvents.customEvents || []), newEvt],
      },
    }));
    setNewEventTitle('');
    setNewEventDate('');
    setShowAddEventModal(false);
  };

  const handleDeleteCustomEvent = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      importantEvents: {
        ...prev.importantEvents,
        customEvents: (prev.importantEvents.customEvents || []).filter((e) => e.id !== id),
      },
    }));
  };

  const handleAddFollowupTopic = () => {
    if (!newFollowupTitle.trim() || !newFollowupDate) return;
    const newItem: FollowupTopicItem = {
      id: 'fol_' + Date.now(),
      title: newFollowupTitle.trim(),
      targetDateStr: newFollowupDate,
      status: 'pending',
      hasFollowedUp: false,
      createdAt: Date.now(),
    };
    setSettings((prev) => ({
      ...prev,
      followupTopics: {
        ...prev.followupTopics,
        items: [...(prev.followupTopics.items || []), newItem],
      },
    }));
    setNewFollowupTitle('');
    setNewFollowupDate('');
  };

  const handleDeleteFollowup = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      followupTopics: {
        ...prev.followupTopics,
        items: (prev.followupTopics.items || []).filter((i) => i.id !== id),
      },
    }));
  };

  const handleRunTestSimulation = async () => {
    const targetChar = characters.find((c) => c.id === testCharId) || characters[0];
    if (!targetChar) return;

    setIsTestGenerating(true);
    setTestResultText(null);
    setTestThinking(null);

    try {
      const userProfile = loadUserProfile();
      const apiConfig = loadApiConfig();

      const candidate: any = {
        characterId: targetChar.id,
        triggerType: testTriggerType,
        priority: 'medium',
        eventId: 'test_sim_' + Date.now(),
        eventData: {
          hoursInactive: 12,
          weatherEventTitle: '暴雨预警与出行提醒',
          weatherSummary: '暴雨概率 85%，伴有雷暴大风',
          daysBefore: 2,
          greetingType: 'morning',
          eventTitle: '重要的阶段项目答辩',
          daysRemaining: 1,
          topicTitle: '之前提到的面试与汇报',
          batteryLevel: 12,
          isCharging: false,
          testScenario: '模拟测试主动微信关怀',
        },
      };

      const res = await proactiveEngine.generateProactiveMessage(targetChar, candidate, userProfile, apiConfig);
      setTestResultText(res.text);
      setTestThinking(res.thinkingProcess || '结合角色人设生成试发主动消息。');

      if (testModeSendToChat && res.text) {
        // Direct test send without re-evaluating real triggers or modifying event states
        await chatMessageBridge.postProactiveMessage(
          targetChar.id,
          res.text,
          `【试发测试模式】手动发送测试主动消息 (${testTriggerType})`
        );
      }
    } catch (e: any) {
      setTestResultText('测试生成失败: ' + (e.message || '网络或API异常'));
    } finally {
      setIsTestGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-100 select-none overflow-hidden font-sans">
      {/* Top Header */}
      <div className="h-12 px-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 -ml-1 text-zinc-400 hover:text-white transition flex items-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">AI 主动消息</h2>
              <p className="text-[10px] text-zinc-400">设置触发条件、免打扰与逐角色权限</p>
            </div>
          </div>
        </div>

        {/* Master Switch Toggle */}
        <div className="flex items-center gap-2 bg-zinc-800/80 px-2.5 py-1 rounded-full border border-zinc-700">
          <span className="text-[11px] font-medium text-zinc-300">
            {settings.enabled ? '已开启' : '已关闭'}
          </span>
          <button
            onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`w-9 h-5 rounded-full transition-colors relative focus:outline-none ${
              settings.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Temporary Pause Bar */}
      <div className="px-3 py-1.5 bg-zinc-850 border-b border-zinc-800 flex items-center justify-between text-xs shrink-0 gap-1">
        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>临时暂停:</span>
          {settings.pausedUntil && settings.pausedUntil > Date.now() ? (
            <span className="text-amber-400 font-bold">
              暂停至 {new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-zinc-500 font-normal">正常运行中</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {settings.pausedUntil && settings.pausedUntil > Date.now() ? (
            <button
              onClick={() => handleSetTemporaryPause('resume')}
              className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-semibold transition"
            >
              立即恢复
            </button>
          ) : (
            <>
              <button
                onClick={() => handleSetTemporaryPause('1h')}
                className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] transition"
              >
                暂停1小时
              </button>
              <button
                onClick={() => handleSetTemporaryPause('tonight')}
                className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] transition"
              >
                至今晚
              </button>
              <button
                onClick={() => handleSetTemporaryPause('tomorrow')}
                className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] transition"
              >
                至明早
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/90 text-xs shrink-0 px-2 pt-1 gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('triggers')}
          className={`flex-1 min-w-[70px] py-2 font-semibold text-center border-b-2 transition ${
            activeTab === 'triggers'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          触发条件
        </button>
        <button
          onClick={() => setActiveTab('life_state')}
          className={`flex-1 min-w-[75px] py-2 font-semibold text-center border-b-2 transition ${
            activeTab === 'life_state'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          生活状态
        </button>
        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 min-w-[70px] py-2 font-semibold text-center border-b-2 transition ${
            activeTab === 'characters'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          逐角色控制
        </button>
        <button
          onClick={() => setActiveTab('anti_harassment')}
          className={`flex-1 min-w-[80px] py-2 font-semibold text-center border-b-2 transition ${
            activeTab === 'anti_harassment'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          免打扰频次
        </button>
        <button
          onClick={() => setActiveTab('test')}
          className={`flex-1 min-w-[70px] py-2 font-semibold text-center border-b-2 transition ${
            activeTab === 'test'
              ? 'border-amber-400 text-amber-300'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ⚡ 试发测试
        </button>
      </div>

      {/* Main Panel Content Area */}
      {activeTab === 'life_state' ? (
        <div className="flex-1 overflow-hidden">
          <LifeStatePanel />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {!settings.enabled && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>提示：主动消息总开关当前已关闭。已有聊天记录保留，开启后恢复规则触发。</span>
          </div>
        )}

        {/* TAB 1: TRIGGER CONDITIONS */}
        {activeTab === 'triggers' && (
          <div className="space-y-3">
            {/* 1. Long Inactivity Timeout */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">1. 长时间未聊天</h3>
                    <p className="text-[10px] text-zinc-400">超过设定时长未联系时主动关怀问候</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      inactivity: { ...p.inactivity, enabled: !p.inactivity.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.inactivity.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.inactivity.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.inactivity.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">未聊时长阈值：</span>
                  <div className="flex gap-1">
                    {[2, 6, 12, 24].map((hr) => (
                      <button
                        key={hr}
                        onClick={() =>
                          setSettings((p) => ({
                            ...p,
                            inactivity: { ...p.inactivity, hours: hr },
                          }))
                        }
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                          settings.inactivity.hours === hr
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {hr}小时
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Weather Alert */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <CloudRain className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">2. 真实气象提醒</h3>
                    <p className="text-[10px] text-zinc-400">降雨、降雪、暴雨预警与加衣提醒</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      weather: { ...p.weather, enabled: !p.weather.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.weather.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.weather.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.weather.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.weather.rainSoon}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          weather: { ...p.weather, rainSoon: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>即将下雨提醒带伞</span>
                  </label>
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.weather.severeWeather}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          weather: { ...p.weather, severeWeather: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>暴雨暴雪预警 (高优先级)</span>
                  </label>
                </div>
              )}
            </div>

            {/* 3. Menstrual Health Care (Independent Privacy Toggle) */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-pink-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-zinc-100">3. 女性生理期关怀</h3>
                      <span className="px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 text-[9px] font-medium border border-pink-500/30">
                        隐私保护
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400">经期临近自然关怀，需明确共享授权</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      menstrual: { ...p.menstrual, enabled: !p.menstrual.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.menstrual.enabled ? 'bg-pink-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.menstrual.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.menstrual.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">提前提醒天数：</span>
                    <select
                      value={settings.menstrual.daysBefore}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          menstrual: { ...p.menstrual, daysBefore: Number(e.target.value) },
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                    >
                      <option value={3}>提前 3 天</option>
                      <option value={2}>提前 2 天</option>
                      <option value={1}>提前 1 天</option>
                      <option value={0}>经期当天</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    🔒 只向已授权健康的 AI 角色发送最少触发指令，不泄露全量日志表。
                  </p>
                </div>
              )}
            </div>

            {/* 4. Time Greetings */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">4. 时间问候</h3>
                    <p className="text-[10px] text-zinc-400">早安、午间与晚安自然聊天</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      greetings: { ...p.greetings, enabled: !p.greetings.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.greetings.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.greetings.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.greetings.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs gap-1">
                  <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.greetings.morning}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          greetings: { ...p.greetings, morning: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>早安问候</span>
                  </label>
                  <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.greetings.noon}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          greetings: { ...p.greetings, noon: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>午间问候</span>
                  </label>
                  <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.greetings.night}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          greetings: { ...p.greetings, night: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>晚安问候</span>
                  </label>
                </div>
              )}
            </div>

            {/* 5. Important Events & Dates */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">5. 重要日期与事件</h3>
                    <p className="text-[10px] text-zinc-400">生日、纪念日、考试、约会与任务</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      importantEvents: { ...p.importantEvents, enabled: !p.importantEvents.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.importantEvents.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.importantEvents.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.importantEvents.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">已添加重要事件 ({settings.importantEvents.customEvents?.length || 0})：</span>
                    <button
                      onClick={() => setShowAddEventModal(true)}
                      className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>添加事件</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {settings.importantEvents.customEvents?.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-2 rounded-xl bg-zinc-800 border border-zinc-750 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-100">{evt.title}</div>
                          <div className="text-[10px] text-zinc-400">
                            日期: {evt.date} (提前 {evt.remindBeforeDays} 天提醒)
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCustomEvent(evt.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Follow-up Topics */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">6. 待跟进事项追问</h3>
                    <p className="text-[10px] text-zinc-400">针对高置信度未来承诺与事项追问进展</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      followupTopics: { ...p.followupTopics, enabled: !p.followupTopics.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.followupTopics.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.followupTopics.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.followupTopics.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="跟进事项（如：明天面试）"
                      value={newFollowupTitle}
                      onChange={(e) => setNewFollowupTitle(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                    />
                    <input
                      type="date"
                      value={newFollowupDate}
                      onChange={(e) => setNewFollowupDate(e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                    />
                    <button
                      onClick={handleAddFollowupTopic}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shrink-0"
                    >
                      添加
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {settings.followupTopics.items?.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-xl bg-zinc-800 border border-zinc-750 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-zinc-100">{item.title}</div>
                          <div className="text-[10px] text-zinc-400">计划日期: {item.targetDateStr}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteFollowup(item.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 7. Life & Device Events */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">7. 生活与设备感知</h3>
                    <p className="text-[10px] text-zinc-400">低电量提醒、深夜玩手机关心</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      deviceEvents: { ...p.deviceEvents, enabled: !p.deviceEvents.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.deviceEvents.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.deviceEvents.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.deviceEvents.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-xs">
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.deviceEvents.lowBattery}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          deviceEvents: { ...p.deviceEvents, lowBattery: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>真实手机低电量提醒 (电量≤15%)</span>
                  </label>
                  <label className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.deviceEvents.lateNightUsage}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          deviceEvents: { ...p.deviceEvents, lateNightUsage: e.target.checked },
                        }))
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>深夜仍长时间使用提醒早睡 (23:30-04:00)</span>
                  </label>
                </div>
              )}
            </div>

            {/* 8. App Usage Proactive Care */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">8. App与小手机使用状态关心</h3>
                    <p className="text-[10px] text-zinc-400">长时间看短视频、打游戏或连续玩手机防沉迷关怀</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      appUsage: { enabled: !(p.appUsage?.enabled ?? true) },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    (settings.appUsage?.enabled ?? true) ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      (settings.appUsage?.enabled ?? true) ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PER-CHARACTER PERMISSIONS */}
        {activeTab === 'characters' && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-zinc-100">允许所有 AI 角色主动联系</h3>
                <p className="text-[10px] text-zinc-400">关闭后可针对以下各角色进行独立单独开关</p>
              </div>
              <button
                onClick={() =>
                  setSettings((p) => ({ ...p, allowAllCharacters: !p.allowAllCharacters }))
                }
                className={`w-8 h-4.5 rounded-full relative transition-colors ${
                  settings.allowAllCharacters ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    settings.allowAllCharacters ? 'translate-x-3.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 px-1">角色独立开关列表</h4>
              {characters.map((char) => {
                const perAi = settings.perAiConfigs[char.id];
                const isEnabled = perAi?.enabled !== undefined ? perAi.enabled : settings.allowAllCharacters;

                return (
                  <div
                    key={char.id}
                    className="p-3 rounded-2xl bg-zinc-850 border border-zinc-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={char.avatar}
                        alt=""
                        className="w-10 h-10 rounded-xl object-cover border border-zinc-700"
                      />
                      <div>
                        <h4 className="text-xs font-bold text-zinc-100">{char.name}</h4>
                        <p className="text-[10px] text-zinc-400">{char.relationship || '微信好友'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleTogglePerAi(char.id, !isEnabled)}
                      className={`w-8 h-4.5 rounded-full relative transition-colors ${
                        isEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-3.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ANTI-HARASSMENT & LIMITS */}
        {activeTab === 'anti_harassment' && (
          <div className="space-y-3 text-xs">
            {/* Quiet Hours */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-100">安静免打扰时段</h3>
                    <p className="text-[10px] text-zinc-400">设定时间段内拦截非紧急普通主动聊天</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...p,
                      quietHours: { ...p.quietHours, enabled: !p.quietHours.enabled },
                    }))
                  }
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    settings.quietHours.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      settings.quietHours.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.quietHours.enabled && (
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-zinc-400">安静时间范围：</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={settings.quietHours.startStr}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          quietHours: { ...p.quietHours, startStr: e.target.value },
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                    />
                    <span>至</span>
                    <input
                      type="time"
                      value={settings.quietHours.endStr}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          quietHours: { ...p.quietHours, endStr: e.target.value },
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Daily Cap & Cooldown */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200">每日主动消息上限：</span>
                <select
                  value={settings.dailyCap}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, dailyCap: Number(e.target.value) }))
                  }
                  className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                >
                  <option value={1}>1 条/天</option>
                  <option value={2}>2 条/天</option>
                  <option value={3}>3 条/天 (默认)</option>
                  <option value={5}>5 条/天</option>
                  <option value={10}>10 条/天</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                <span className="font-bold text-zinc-200">主动消息最短冷却间隔：</span>
                <select
                  value={settings.minCooldownMinutes}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, minCooldownMinutes: Number(e.target.value) }))
                  }
                  className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs"
                >
                  <option value={30}>30 分钟</option>
                  <option value={60}>1 小时</option>
                  <option value={120}>2 小时 (默认)</option>
                  <option value={240}>4 小时</option>
                  <option value={480}>8 小时</option>
                </select>
              </div>

              <label className="flex items-center gap-2 pt-2 border-t border-zinc-800/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowHighPriorityBypassQuiet}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, allowHighPriorityBypassQuiet: e.target.checked }))
                  }
                  className="rounded accent-emerald-500"
                />
                <span>允许高优先级极端气象突破冷却与安静时段</span>
              </label>
            </div>

            {/* Notification Mode */}
            <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-zinc-200">Android / 系统后台通知</h3>
                  <p className="text-[10px] text-zinc-400">收到主动消息时同步触发系统通知弹窗</p>
                </div>
              </div>
              <button
                onClick={() =>
                  setSettings((p) => ({
                    ...p,
                    systemNotificationsEnabled: !p.systemNotificationsEnabled,
                  }))
                }
                className={`w-8 h-4.5 rounded-full relative transition-colors ${
                  settings.systemNotificationsEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    settings.systemNotificationsEnabled ? 'translate-x-3.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: INTERACTIVE TEST SIMULATOR */}
        {activeTab === 'test' && (
          <div className="p-3.5 rounded-2xl bg-zinc-850 border border-amber-500/20 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>测试模拟主动消息生成</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              在此可选择 AI 角色与场景模拟一次主动消息触发。测试模式不修改真实的健康或天气数据。
            </p>

            <div className="space-y-2">
              <label className="block">
                <span className="text-zinc-400 font-medium">选择测试 AI 角色：</span>
                <select
                  value={testCharId}
                  onChange={(e) => setTestCharId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.relationship || '微信好友'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-zinc-400 font-medium">选择模拟触发场景：</span>
                <select
                  value={testTriggerType}
                  onChange={(e) => setTestTriggerType(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
                >
                  <option value="inactivity_timeout">12小时长时间未聊天问候</option>
                  <option value="life_event_followup">生活连续性事项跟进 (Current Life State)</option>
                  <option value="weather_alert">突发暴雨与出行气象关怀</option>
                  <option value="menstrual_care">经期前2天健康保暖提示</option>
                  <option value="greeting">早安自然问候</option>
                  <option value="important_event">重要事件/日程明天到期</option>
                  <option value="followup_topic">之前提过的面试/事情追问</option>
                  <option value="device_life_event">手机低电量 (12%) 提醒</option>
                </select>
              </label>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testModeSendToChat}
                  onChange={(e) => setTestModeSendToChat(e.target.value === 'true' || e.target.checked)}
                  className="rounded accent-amber-400"
                />
                <span className="text-amber-200">生成后同步写入真实聊天历史</span>
              </label>

              <button
                onClick={handleRunTestSimulation}
                disabled={isTestGenerating}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{isTestGenerating ? 'AI 正在生成模拟主动消息...' : '生成并模拟主动消息'}</span>
              </button>
            </div>

            {/* Test Result Display */}
            {testResultText && (
              <div className="p-3 rounded-xl bg-zinc-800 border border-amber-500/30 space-y-2 animate-in fade-in">
                <div className="font-bold text-amber-300 text-[11px] flex items-center justify-between">
                  <span>✨ 模拟主动消息输出：</span>
                  <span className="text-[10px] text-zinc-400 font-mono">Status: 200 OK</span>
                </div>

                {testThinking && (
                  <div className="p-2 rounded-lg bg-black/40 text-[10px] text-amber-200/80 font-mono whitespace-pre-wrap leading-relaxed">
                    💡 思考链: {testThinking}
                  </div>
                )}

                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 font-medium leading-relaxed whitespace-pre-wrap">
                  {testResultText}
                </div>
              </div>
            )}

            {/* System Diagnostics & Gate Debug Info */}
            <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>系统实时诊断与 ProactiveGate 状态</span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 grid grid-cols-2 gap-2 text-zinc-300 font-mono">
                <div>
                  <span className="text-zinc-500 block text-[10px]">主动总开关：</span>
                  <span className={settings.enabled ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {settings.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">临时暂停状态：</span>
                  <span className={settings.pausedUntil && settings.pausedUntil > Date.now() ? 'text-amber-400 font-bold' : 'text-zinc-300'}>
                    {settings.pausedUntil && settings.pausedUntil > Date.now() ? '⏸ PAUSED' : '🟢 RUNNING'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Scheduler 状态：</span>
                  <span className="text-emerald-400 font-bold">
                    {proactiveScheduler.isSchedulerActive() ? '⚡ ACTIVE (12m)' : '⚪ IDLE'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">最近一次巡检：</span>
                  <span>
                    {proactiveScheduler.getLastCheckTime()
                      ? new Date(proactiveScheduler.getLastCheckTime()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '等待首检'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] space-y-1">
                <span className="text-zinc-400 font-medium block">最近一次 ProactiveGate 网关判定：</span>
                <p className="text-amber-300 font-mono bg-black/40 p-1.5 rounded-lg border border-zinc-800">
                  {proactiveGate.getLastRejectReason()}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-[10px] text-blue-300 space-y-1">
                <span className="font-semibold block text-blue-200">📱 Android 运行边界与能力说明：</span>
                <p className="leading-relaxed text-zinc-400">
                  • 进程存活（前台/后台挂起）：Scheduler 12分钟周期与 Resume 触发正常运行。<br />
                  • 进程被系统强杀（Process Killed）：受原生 Android WebView 限制，进程杀死后无法在离线状态下自动请求网络生成 AI 消息。下次打开 App 时自动补检触发。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Add Custom Event Modal */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xs bg-zinc-850 border border-zinc-750 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between font-bold text-zinc-100">
              <span>添加重要日期/事件</span>
              <button onClick={() => setShowAddEventModal(false)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="事件名称（如：妈妈的生日）"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
            />

            <input
              type="date"
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
            />

            <div className="flex gap-2">
              <select
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value as any)}
                className="flex-1 px-2 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
              >
                <option value="birthday">生日</option>
                <option value="anniversary">纪念日</option>
                <option value="exam">考试/答辩</option>
                <option value="date">约会</option>
                <option value="task">重要任务</option>
                <option value="custom">自定义</option>
              </select>

              <select
                value={newEventRemindDays}
                onChange={(e) => setNewEventRemindDays(Number(e.target.value))}
                className="flex-1 px-2 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs"
              >
                <option value={1}>提前 1 天提醒</option>
                <option value={2}>提前 2 天提醒</option>
                <option value={3}>提前 3 天提醒</option>
              </select>
            </div>

            <button
              onClick={handleAddCustomEvent}
              className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              确定保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
