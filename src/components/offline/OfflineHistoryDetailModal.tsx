import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Share2,
  Trash2,
  Heart,
  Clock,
  AlertTriangle,
  RotateCcw,
  Save,
  AlertCircle,
} from 'lucide-react';
import {
  OfflineSession,
  OfflineMessage,
  getAllSessionMessages,
  deleteOfflineSession,
  getOfflineSession,
} from '../../lib/offline/OfflineSessionDb';
import { OfflineMemoryBridge, OfflineSessionSummary } from '../../lib/offline/OfflineMemoryBridge';
import { OfflineSessionService } from '../../lib/offline/OfflineSessionService';
import { normalizeOfflineSegments } from '../../lib/offline/offlineSegments';
import { loadOfflineDisplaySettings, getOfflineFontScaleClasses } from '../../lib/offline/offlineDisplaySettings';
import {
  formatOfflineFullDateTime,
  formatOfflineDuration,
  formatOfflineTimeHM,
  formatOfflineDateCN,
} from '../../lib/offline/offlineTimeFormat';
import { AiCharacter, ChatMessage, UserProfile, ApiConfig } from '../../types';
import { saveChatMessage } from '../../lib/chatDb';

interface OfflineHistoryDetailModalProps {
  isOpen: boolean;
  sessionId: string | null;
  character?: AiCharacter | null;
  userProfile?: UserProfile;
  apiConfig?: ApiConfig;
  onClose: () => void;
  onDeleted?: () => void;
  onShareToChat?: (cardMsg: ChatMessage) => void;
  onUpdateCharacters?: (chars: AiCharacter[]) => void;
}

export const OfflineHistoryDetailModal: React.FC<OfflineHistoryDetailModalProps> = ({
  isOpen,
  sessionId,
  character,
  userProfile,
  apiConfig,
  onClose,
  onDeleted,
  onShareToChat,
  onUpdateCharacters,
}) => {
  const [session, setSession] = useState<OfflineSession | null>(null);
  const [messages, setMessages] = useState<OfflineMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary'>('transcript');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRetryingSummary, setIsRetryingSummary] = useState(false);
  const [notice, setNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const fontScale = getOfflineFontScaleClasses(loadOfflineDisplaySettings().fontSize);

  useEffect(() => {
    if (isOpen && sessionId) {
      setNotice(null);
      void loadSessionDetail(sessionId);
    } else {
      setSession(null);
      setMessages([]);
      setNotice(null);
    }
  }, [isOpen, sessionId]);

  const loadSessionDetail = async (id: string) => {
    const sess = await getOfflineSession(id);
    if (sess) {
      setSession(sess);
      const msgs = await getAllSessionMessages(id);
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(msgs);
    }
  };

  if (!isOpen || !session) return null;

  const startStr = formatOfflineFullDateTime(session.startedAt);
  const endStr = session.endedAt ? formatOfflineFullDateTime(session.endedAt) : '';
  const durationStr = formatOfflineDuration(session.durationMinutes, session.startedAt, session.endedAt);

  const handleRetrySummaryAndCommit = async () => {
    if (!character || !userProfile || isRetryingSummary) return;
    setIsRetryingSummary(true);
    setNotice(null);
    try {
      const res = await OfflineSessionService.generateSessionSummary(session, character, userProfile, apiConfig);
      setSession(res.updatedSession);
      if (res.summaryPending || !res.summary) {
        setNotice({ type: 'error', text: res.error || '重新生成总结失败，请稍后再试' });
      } else {
        const committed = await OfflineMemoryBridge.commitSessionToLongTermMemory(
          res.updatedSession,
          res.summary as OfflineSessionSummary,
          character,
          onUpdateCharacters
        );
        setSession(committed.updatedSession);
        setNotice({ type: 'info', text: '经历总结已生成并同步至长期记忆与微信时间线' });
      }
    } catch (e: any) {
      setNotice({ type: 'error', text: e?.message || '重试生成总结失败' });
    } finally {
      setIsRetryingSummary(false);
    }
  };

  const handleShareToWeChat = async () => {
    if (!character) {
      setNotice({ type: 'error', text: '未找到关联的 AI 角色' });
      return;
    }

    setIsSharing(true);
    setNotice(null);
    try {
      const now = Date.now();
      const shareCardMsg: ChatMessage = {
        id: `card_${now}_${Math.random().toString(36).substring(2, 7)}`,
        characterId: character.id,
        sender: 'user',
        text: `【线下经历分享卡片】: ${session.sceneSnapshot.name}`,
        timestamp: now,
        type: 'offline_share_card',
        offlineCardData: {
          sessionId: session.id,
          sceneName: session.sceneSnapshot.name,
          characterName: character.name,
          characterAvatar: character.avatar,
          dateStr: formatOfflineDateCN(session.startedAt),
          summaryText: session.eventSummary || session.sceneSnapshot.background,
        },
      };

      await saveChatMessage(shareCardMsg);
      if (onShareToChat) {
        onShareToChat(shareCardMsg);
      }
      setNotice({ type: 'info', text: `已将『${session.sceneSnapshot.name}』经历卡片分享至微信聊天` });
    } catch (e: any) {
      setNotice({ type: 'error', text: `分享失败：${e?.message || '未知错误'}` });
    } finally {
      setIsSharing(false);
    }
  };

  const handlePerformDelete = async (removeMemories: boolean) => {
    setIsDeleting(true);
    setNotice(null);
    try {
      if (removeMemories && character) {
        await OfflineMemoryBridge.removeSessionFromLongTermMemory(session, character, onUpdateCharacters);
      }
      await deleteOfflineSession(session.id);
      if (onDeleted) onDeleted();
      onClose();
    } catch (e: any) {
      setNotice({ type: 'error', text: `删除失败：${e?.message || '未知错误'}` });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmModal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <h3 className="font-bold text-sm text-zinc-100 truncate">
                {session.eventTitle || session.sceneSnapshot.name}
              </h3>
              <p className="text-[11px] text-zinc-400">
                与 {session.characterName || character?.name || 'AI'} · {session.sceneSnapshot.location}
              </p>
              <p className="text-[11px] text-zinc-400 font-mono flex flex-wrap items-center gap-x-2">
                <span>{startStr} 开始</span>
                {endStr && <span>{endStr} 结束</span>}
                <span className="inline-flex items-center gap-0.5 text-indigo-500 font-sans font-semibold">
                  <Clock className="w-3 h-3" /> 共持续 {durationStr}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:bg-zinc-800 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inline Notice */}
        {notice && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 shrink-0 ${
              notice.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-500'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{notice.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center p-1 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('transcript')}
            className={`flex-1 py-1.5 rounded-xl font-bold transition cursor-pointer ${
              activeTab === 'transcript' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            完整剧情对白 ({messages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-1.5 rounded-xl font-bold transition cursor-pointer ${
              activeTab === 'summary' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            结案总结与回忆
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
          {/* TAB 1: TRANSCRIPT (Segmented rendering with legacy fallback) */}
          {activeTab === 'transcript' && (
            <div className="space-y-3 py-1">
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                const aiSegments = !isUser ? normalizeOfflineSegments(m.segments, m.text, m.action) : [];
                return (
                  <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                    <span className={`${fontScale.timestamp} text-zinc-500 px-1 font-mono`}>
                      {formatOfflineTimeHM(m.timestamp)}
                    </span>
                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl break-words [overflow-wrap:anywhere] ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-zinc-800 text-zinc-100 border border-zinc-750 rounded-bl-xs space-y-2'
                      }`}
                    >
                      {isUser ? (
                        <p className={`whitespace-pre-wrap ${fontScale.userText}`}>{m.text}</p>
                      ) : (
                        aiSegments.map((seg, sIdx) =>
                          seg.type === 'action' ? (
                            <p
                              key={sIdx}
                              className={`${fontScale.action} text-zinc-400 italic pl-2 border-l-2 border-indigo-500/40 whitespace-pre-wrap`}
                            >
                              {seg.text}
                            </p>
                          ) : (
                            <p key={sIdx} className={`${fontScale.dialogue} text-zinc-100 whitespace-pre-wrap`}>
                              {seg.text}
                            </p>
                          )
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-3 py-1 text-xs">
              {session.summaryStatus === 'summary_pending' && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-2.5">
                  <p className="font-bold text-amber-500">该经历的总结尚未成功生成（待重试）</p>
                  <p className="text-zinc-300 leading-relaxed">
                    完整原始对白已保留。点击下方按钮重新生成真实总结并同步写入长期记忆。
                  </p>
                  {character && userProfile && (
                    <button
                      type="button"
                      onClick={() => void handleRetrySummaryAndCommit()}
                      disabled={isRetryingSummary}
                      className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isRetryingSummary ? (
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>{isRetryingSummary ? '正在生成总结...' : '重试生成总结并写入记忆'}</span>
                    </button>
                  )}
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="font-bold text-zinc-100 block">过程总结：</span>
                <p className="text-zinc-300 leading-relaxed">{session.eventSummary || '暂无总结'}</p>

                {session.importantEvents && session.importantEvents.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[11px] text-zinc-400 font-semibold block">重要事件：</span>
                    <ul className="space-y-1 text-zinc-300">
                      {session.importantEvents.map((ev, i) => (
                        <li key={i}>• {ev}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {session.keyExpressions && session.keyExpressions.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[11px] text-zinc-400 font-semibold block">关键表达：</span>
                    <ul className="space-y-1 text-zinc-300">
                      {session.keyExpressions.map((expr, i) => (
                        <li key={i}>「{expr}」</li>
                      ))}
                    </ul>
                  </div>
                )}

                {session.unfinishedTopics && session.unfinishedTopics.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[11px] text-zinc-400 font-semibold block">未完话题与约定：</span>
                    <ul className="space-y-1 text-zinc-300">
                      {session.unfinishedTopics.map((t, i) => (
                        <li key={i}>• {t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {session.aiReflection && (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-1">
                  <span className="text-[11px] text-indigo-500 font-bold flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> 角色回忆独白：
                  </span>
                  <p className="text-zinc-200 italic leading-relaxed">“{session.aiReflection}”</p>
                </div>
              )}

              {session.candidateMemories && session.candidateMemories.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                  <span className="font-bold text-indigo-500 block">对应长期记忆条目：</span>
                  <ul className="space-y-1.5 text-zinc-200">
                    {session.candidateMemories.map((mem, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span className="leading-relaxed">{mem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions: Share to Chat & Delete */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => setShowDeleteConfirmModal(true)}
            className="py-2.5 rounded-2xl bg-zinc-800 hover:bg-rose-500/15 hover:text-rose-500 border border-zinc-700 text-zinc-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除此经历</span>
          </button>

          <button
            type="button"
            onClick={() => void handleShareToWeChat()}
            disabled={isSharing}
            className="py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            <span>{isSharing ? '分享中...' : '分享到微信聊天'}</span>
          </button>
        </div>
      </div>

      {/* Delete Choice Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>选择删除模式</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              即将删除『{session.sceneSnapshot.name}』线下经历记录，请选择删除粒度：
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => void handlePerformDelete(false)}
                disabled={isDeleting}
                className="w-full p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-left font-medium space-y-0.5 transition cursor-pointer"
              >
                <div className="font-bold text-zinc-100">仅删除历史展示记录</div>
                <div className="text-[11px] text-zinc-400">保留 AI 已记住的长期记忆，仅清除详细过程对话。</div>
              </button>

              <button
                type="button"
                onClick={() => void handlePerformDelete(true)}
                disabled={isDeleting}
                className="w-full p-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/45 text-left font-medium space-y-0.5 transition cursor-pointer"
              >
                <div className="font-bold text-rose-500">删除记录并移除对应 AI 长期记忆</div>
                <div className="text-[11px] text-zinc-300">同时从 {character?.name || 'AI'} 的记忆库中移除这段经历。</div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteConfirmModal(false)}
              className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
