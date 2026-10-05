import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Activity,
  Heart,
  Target,
  HelpCircle,
  Edit3,
  Calendar,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  X,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  LifeEvent,
  LifeEventStatus,
  LifeEventType,
  ProactiveSettings,
} from '../../types';
import {
  getLifeEventsSync,
  saveLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  resolveLifeEvent,
  subscribeLifeEvents,
} from '../../lib/lifeState/lifeStateStore';
import { loadProactiveSettings, saveProactiveSettings } from '../../lib/proactive/proactiveStore';

interface LifeStatePanelProps {
  onBack?: () => void;
}

export const LifeStatePanel: React.FC<LifeStatePanelProps> = () => {
  const [events, setEvents] = useState<LifeEvent[]>(() => getLifeEventsSync());
  const [settings, setSettings] = useState<ProactiveSettings>(() => loadProactiveSettings());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  // Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<LifeEvent> | null>(null);

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressEventId, setProgressEventId] = useState<string | null>(null);
  const [progressInput, setProgressInput] = useState('');
  const [progressMarkResolve, setProgressMarkResolve] = useState(false);

  useEffect(() => {
    const unsub = subscribeLifeEvents(() => {
      setEvents(getLifeEventsSync());
    });
    return unsub;
  }, []);

  const handleToggleLifeState = (enabled: boolean) => {
    const updated = {
      ...settings,
      lifeState: {
        ...(settings.lifeState || {
          enabled: true,
          autoExtractFromChat: true,
          allowProactiveFollowup: true,
          sensitivity: 'medium',
        }),
        enabled,
      },
    };
    setSettings(updated);
    saveProactiveSettings(updated);
  };

  const handleToggleAutoExtract = (autoExtractFromChat: boolean) => {
    const updated = {
      ...settings,
      lifeState: {
        ...(settings.lifeState || {
          enabled: true,
          autoExtractFromChat: true,
          allowProactiveFollowup: true,
          sensitivity: 'medium',
        }),
        autoExtractFromChat,
      },
    };
    setSettings(updated);
    saveProactiveSettings(updated);
  };

  const handleToggleProactiveFollowup = (allowProactiveFollowup: boolean) => {
    const updated = {
      ...settings,
      lifeState: {
        ...(settings.lifeState || {
          enabled: true,
          autoExtractFromChat: true,
          allowProactiveFollowup: true,
          sensitivity: 'medium',
        }),
        allowProactiveFollowup,
      },
    };
    setSettings(updated);
    saveProactiveSettings(updated);
  };

  const handleSaveEvent = async () => {
    if (!editingEvent?.title?.trim()) return;
    await saveLifeEvent({
      ...editingEvent,
      title: editingEvent.title.trim(),
      type: editingEvent.type || 'custom',
      summary: editingEvent.summary || editingEvent.title.trim(),
      status: editingEvent.status || 'ongoing',
      importance: editingEvent.importance || 3,
      sourceType: editingEvent.sourceType || 'user_manual',
    } as any);
    setShowEditModal(false);
    setEditingEvent(null);
    setEvents(getLifeEventsSync());
  };

  const handleDeleteEvent = async (id: string) => {
    if (confirm('确定要删除这条生活事件吗？')) {
      await deleteLifeEvent(id);
      setEvents(getLifeEventsSync());
    }
  };

  const handleResolveEvent = async (id: string) => {
    await resolveLifeEvent(id, '手动结案完成');
    setEvents(getLifeEventsSync());
  };

  const handleSubmitProgress = async () => {
    if (!progressEventId || !progressInput.trim()) return;
    if (progressMarkResolve) {
      await resolveLifeEvent(progressEventId, progressInput.trim());
    } else {
      await updateLifeEvent(progressEventId, {
        latestProgress: progressInput.trim(),
        updatedAt: Date.now(),
      });
    }
    setShowProgressModal(false);
    setProgressEventId(null);
    setProgressInput('');
    setEvents(getLifeEventsSync());
  };

  // Filter logic
  const filteredEvents = events.filter((evt) => {
    if (filterStatus === 'active' && ['completed', 'cancelled'].includes(evt.status)) return false;
    if (filterStatus === 'completed' && !['completed', 'cancelled'].includes(evt.status)) return false;
    if (filterType !== 'all' && evt.type !== filterType) return false;
    return true;
  });

  const getTypeLabel = (type: LifeEventType) => {
    switch (type) {
      case 'future_plan': return '未来计划';
      case 'waiting_result': return '等待结果';
      case 'ongoing_issue': return '持续事项';
      case 'recent_emotion': return '近期情绪';
      case 'health_status': return '健康状况';
      case 'temporary_goal': return '阶段目标';
      default: return '近况事件';
    }
  };

  const getTypeIcon = (type: LifeEventType) => {
    switch (type) {
      case 'future_plan': return <Calendar className="w-3.5 h-3.5 text-blue-400" />;
      case 'waiting_result': return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'ongoing_issue': return <Activity className="w-3.5 h-3.5 text-purple-400" />;
      case 'recent_emotion': return <Heart className="w-3.5 h-3.5 text-rose-400" />;
      case 'health_status': return <Heart className="w-3.5 h-3.5 text-emerald-400" />;
      case 'temporary_goal': return <Target className="w-3.5 h-3.5 text-cyan-400" />;
      default: return <Sparkles className="w-3.5 h-3.5 text-amber-300" />;
    }
  };

  const getStatusBadge = (status: LifeEventStatus) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">未开始</span>;
      case 'ongoing':
        return <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">进行中</span>;
      case 'waiting':
        return <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px]">等待中</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded-md bg-zinc-700 text-zinc-400 text-[10px]">已完成</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-[10px]">已取消</span>;
    }
  };

  const lifeConfig = settings.lifeState || {
    enabled: true,
    autoExtractFromChat: true,
    allowProactiveFollowup: true,
    sensitivity: 'medium',
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-100 p-3 space-y-4 overflow-y-auto">
      {/* Master Toggle Card */}
      <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                生活连续性 (Current Life State)
              </h3>
              <p className="text-[11px] text-zinc-400">
                记录用户正在经历的事情与未完事项，让AI拥有连续生活感
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleLifeState(!lifeConfig.enabled)}
            className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
              lifeConfig.enabled ? 'bg-purple-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                lifeConfig.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Feature Switches */}
        {lifeConfig.enabled && (
          <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={lifeConfig.autoExtractFromChat}
                onChange={(e) => handleToggleAutoExtract(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-purple-500 focus:ring-0"
              />
              <span className="text-zinc-300">自动从聊天提炼事件</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={lifeConfig.allowProactiveFollowup}
                onChange={(e) => handleToggleProactiveFollowup(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-purple-500 focus:ring-0"
              />
              <span className="text-zinc-300">允许AI主动询问跟进</span>
            </label>
          </div>
        )}
      </div>

      {/* Control Bar & Filter */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-zinc-800/80 p-1 rounded-xl border border-zinc-750 text-xs">
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-2.5 py-1 rounded-lg transition ${
              filterStatus === 'active' ? 'bg-purple-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            进行中/未结案
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-2.5 py-1 rounded-lg transition ${
              filterStatus === 'completed' ? 'bg-purple-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            已完成/已结案
          </button>
        </div>

        <button
          onClick={() => {
            setEditingEvent({
              type: 'future_plan',
              status: 'ongoing',
              importance: 3,
            });
            setShowEditModal(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm active:scale-95 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>手动新增</span>
        </button>
      </div>

      {/* Events List */}
      <div className="space-y-2.5 pb-6">
        {filteredEvents.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-850/40 p-4">
            <Sparkles className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-400 font-medium">暂无相关的当前生活事件</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              用户在微信聊天中提及计划或困扰时，AI会自动记录；也可以点击顶部手动新增。
            </p>
          </div>
        ) : (
          filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-800 hover:border-zinc-700 transition space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-750">
                    {getTypeIcon(evt.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{evt.title}</h4>
                      {getStatusBadge(evt.status)}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{evt.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingEvent(evt);
                      setShowEditModal(true);
                    }}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-lg transition"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress & Metadata Bar */}
              {evt.latestProgress && (
                <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300 flex items-start gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-purple-300">最新进展：</span>
                    {evt.latestProgress}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <span>类型: {getTypeLabel(evt.type)}</span>
                  {evt.followUpCount > 0 && (
                    <span className="text-purple-400/90">已关怀跟进 {evt.followUpCount} 次</span>
                  )}
                </div>

                {['ongoing', 'waiting', 'pending'].includes(evt.status) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setProgressEventId(evt.id);
                        setProgressInput('');
                        setProgressMarkResolve(false);
                        setShowProgressModal(true);
                      }}
                      className="px-2 py-0.5 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-[10px] font-medium transition"
                    >
                      更新进展
                    </button>
                    <button
                      onClick={() => handleResolveEvent(evt.id)}
                      className="px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[10px] font-medium transition"
                    >
                      标记已结案
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Create / Edit Event */}
      {showEditModal && editingEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-850 border border-zinc-750 p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="text-sm font-bold text-white">
                {editingEvent.id ? '编辑生活事件' : '新增生活事件'}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">事件标题</label>
                <input
                  type="text"
                  placeholder="如：下午见关键客户、准备等考研复试"
                  value={editingEvent.title || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">事件类型</label>
                <select
                  value={editingEvent.type || 'future_plan'}
                  onChange={(e) => setEditingEvent({ ...editingEvent, type: e.target.value as LifeEventType })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="future_plan">未来计划 (如去见客户、周末去爬山)</option>
                  <option value="waiting_result">等待结果 (如等面试结果、等快递)</option>
                  <option value="ongoing_issue">持续事项/困扰 (如最近很忙、这几天牙痛)</option>
                  <option value="recent_emotion">近期情绪/状态 (如今天很烦、特别兴奋)</option>
                  <option value="health_status">身体健康状况 (如感冒发烧、偏头疼)</option>
                  <option value="temporary_goal">阶段目标 (如考证复习、健身计划)</option>
                  <option value="custom">其他近况事件</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">事件详细摘要</label>
                <textarea
                  rows={2}
                  placeholder="简要说明具体背景或事情原委..."
                  value={editingEvent.summary || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, summary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">状态</label>
                <select
                  value={editingEvent.status || 'ongoing'}
                  onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as LifeEventStatus })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="pending">尚未开始</option>
                  <option value="ongoing">正在进行</option>
                  <option value="waiting">等待结果/后续</option>
                  <option value="completed">已完成 / 结案</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">重要程度 (1 - 5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={editingEvent.importance || 3}
                  onChange={(e) => setEditingEvent({ ...editingEvent, importance: parseInt(e.target.value) || 3 })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleSaveEvent}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                保存事件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Progress Update */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-850 border border-zinc-750 p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="text-sm font-bold text-white">更新事件进展</h3>
              <button
                onClick={() => setShowProgressModal(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">最新进展说明</label>
                <textarea
                  rows={3}
                  placeholder="如：客户反馈良好、已提交第二轮材料..."
                  value={progressInput}
                  onChange={(e) => setProgressInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-750 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={progressMarkResolve}
                  onChange={(e) => setProgressMarkResolve(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0"
                />
                <span className="text-zinc-300 font-medium">同时将此事件标记为【已结案 / 已完成】</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => setShowProgressModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleSubmitProgress}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                提交更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
