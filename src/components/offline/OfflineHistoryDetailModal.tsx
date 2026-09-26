import React, { useState, useEffect } from 'react';
import { X, Sparkles, MapPin, Share2, Trash2, Heart, BookOpen, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { OfflineSession, OfflineMessage, getAllSessionMessages, deleteOfflineSession } from '../../lib/offline/OfflineSessionDb';
import { OfflineMemoryBridge } from '../../lib/offline/OfflineMemoryBridge';
import { AiCharacter, ChatMessage } from '../../types';
import { saveChatMessage } from '../../lib/chatDb';

interface OfflineHistoryDetailModalProps {
  isOpen: boolean;
  sessionId: string | null;
  character?: AiCharacter | null;
  onClose: () => void;
  onDeleted?: () => void;
  onShareToChat?: (cardMsg: ChatMessage) => void;
}

export const OfflineHistoryDetailModal: React.FC<OfflineHistoryDetailModalProps> = ({
  isOpen,
  sessionId,
  character,
  onClose,
  onDeleted,
  onShareToChat,
}) => {
  const [session, setSession] = useState<OfflineSession | null>(null);
  const [messages, setMessages] = useState<OfflineMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'states'>('transcript');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (isOpen && sessionId) {
      loadSessionDetail(sessionId);
    } else {
      setSession(null);
      setMessages([]);
    }
  }, [isOpen, sessionId]);

  const loadSessionDetail = async (id: string) => {
    const { getOfflineSession } = await import('../../lib/offline/OfflineSessionDb');
    const sess = await getOfflineSession(id);
    if (sess) {
      setSession(sess);
      const msgs = await getAllSessionMessages(id);
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(msgs);
    }
  };

  if (!isOpen || !session) return null;

  const handleShareToWeChat = async () => {
    if (!character) {
      alert('未找到关联的 AI 角色');
      return;
    }

    setIsSharing(true);
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
          dateStr: new Date(session.startedAt).toLocaleDateString('zh-CN'),
          summaryText: session.eventSummary || (session.sceneSnapshot as any).description || session.sceneSnapshot.background,
        },
      };

      await saveChatMessage(shareCardMsg);
      if (onShareToChat) {
        onShareToChat(shareCardMsg);
      }
      alert(`已成功将『${session.sceneSnapshot.name}』线下经历卡片分享至与 ${character.name} 的微信聊天！`);
    } catch (e: any) {
      alert(`分享到聊天失败: ${e?.message || '未知错误'}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handlePerformDelete = async (removeMemories: boolean) => {
    setIsDeleting(true);
    try {
      if (removeMemories && character) {
        await OfflineMemoryBridge.removeSessionFromLongTermMemory(session, character);
      }
      await deleteOfflineSession(session.id);
      alert(removeMemories ? '已彻底删除历史记录并同步移除对应 AI 长期记忆' : '已删除历史记录，保留已有长期记忆');
      if (onDeleted) onDeleted();
      onClose();
    } catch (e: any) {
      alert(`删除失败: ${e?.message || '未知错误'}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmModal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="truncate">
              <h3 className="font-bold text-sm text-zinc-100 truncate">{session.sceneSnapshot.name}</h3>
              <p className="text-[10px] text-zinc-400 truncate">
                与 {session.characterName || character?.name || 'AI'} · {new Date(session.startedAt).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-zinc-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center p-1 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex-1 py-1.5 rounded-xl font-bold transition ${
              activeTab === 'transcript' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            完整剧情对白 ({messages.length})
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-1.5 rounded-xl font-bold transition ${
              activeTab === 'summary' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            结案总结与回忆
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0 text-xs">
          {/* TAB 1: TRANSCRIPT */}
          {activeTab === 'transcript' && (
            <div className="space-y-3 py-1">
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                    <span className="text-[9px] text-zinc-500 px-1 font-mono">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl leading-relaxed ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-zinc-800 text-zinc-100 border border-zinc-750 rounded-bl-xs space-y-1'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {!isUser && m.action && (
                        <p className="text-[11px] text-indigo-300/90 italic font-medium pt-0.5">
                          {m.action}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-3 py-1">
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="font-bold text-zinc-200 block text-xs">事态过程总结：</span>
                <p className="text-zinc-300 leading-relaxed text-[11px]">{session.eventSummary || '暂无精炼总结'}</p>
              </div>

              {session.aiReflection && (
                <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-1">
                  <span className="text-[10px] text-purple-300 font-bold flex items-center gap-1">
                    <Heart className="w-3 h-3 text-pink-400 fill-pink-400" /> AI 独白与回忆：
                  </span>
                  <p className="text-xs text-purple-200 italic leading-relaxed">“{session.aiReflection}”</p>
                </div>
              )}

              {session.candidateMemories && session.candidateMemories.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
                  <span className="font-bold text-indigo-300 block text-xs">对应长期记忆条目：</span>
                  <ul className="space-y-1 text-[11px] text-zinc-200">
                    {session.candidateMemories.map((mem, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                        <span className="text-indigo-400 font-bold">•</span>
                        <span>{mem}</span>
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
            onClick={() => setShowDeleteConfirmModal(true)}
            className="py-2.5 rounded-2xl bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-300 border border-zinc-700 hover:border-rose-500/40 text-zinc-300 font-bold text-xs transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除此经历</span>
          </button>

          <button
            onClick={handleShareToWeChat}
            disabled={isSharing}
            className="py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5"
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
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>选择删除模式</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              您即将删除『{session.sceneSnapshot.name}』线下经历记录，请选择删除粒度：
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <button
                onClick={() => handlePerformDelete(false)}
                disabled={isDeleting}
                className="w-full p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-left font-medium space-y-0.5 transition"
              >
                <div className="font-bold text-zinc-100">仅删除历史展示记录</div>
                <div className="text-[10px] text-zinc-400">保留 AI 已经记住的长期记忆，仅清除详细过程对话。</div>
              </button>

              <button
                onClick={() => handlePerformDelete(true)}
                disabled={isDeleting}
                className="w-full p-3 rounded-2xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/50 text-left font-medium space-y-0.5 transition"
              >
                <div className="font-bold text-rose-300">删除记录并移除对应 AI 长期记忆</div>
                <div className="text-[10px] text-rose-200/80">同时从 {character?.name || 'AI'} 的记忆库中彻底擦除这段经历。</div>
              </button>
            </div>

            <button
              onClick={() => setShowDeleteConfirmModal(false)}
              className="w-full py-2 text-xs text-zinc-400 hover:text-white transition"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
