import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Send, Plus, Sparkles, Heart, RefreshCw, X, AlertCircle, RotateCcw, Copy, AlertTriangle } from 'lucide-react';
import { OfflineSession, OfflineMessage, getPaginatedSessionMessages } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionService } from '../../lib/offline/OfflineSessionService';
import { OfflineStateEngine, CharacterState } from '../../lib/offline/OfflineStateEngine';
import { OfflineMemoryBridge, OfflineSessionSummary } from '../../lib/offline/OfflineMemoryBridge';
import { OfflineStateMiniPanel } from './OfflineStateMiniPanel';
import { OfflineEndModal } from './OfflineEndModal';
import { AiCharacter, UserProfile, ApiConfig } from '../../types';

interface OfflineSessionViewProps {
  session: OfflineSession;
  character: AiCharacter;
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  onBack: () => void;
  onSessionEndedAndSaved: () => void;
  onUpdateCharacters?: (chars: AiCharacter[]) => void;
}

export const OfflineSessionView: React.FC<OfflineSessionViewProps> = ({
  session,
  character,
  userProfile,
  apiConfig,
  onBack,
  onSessionEndedAndSaved,
  onUpdateCharacters,
}) => {
  const [currentSession, setCurrentSession] = useState<OfflineSession>(session);
  const [messages, setMessages] = useState<OfflineMessage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Ending Flow States
  const [isEnding, setIsEnding] = useState(false);
  const [endSummary, setEndSummary] = useState<OfflineSessionSummary | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  // Context Menu & Regenerate States
  const [selectedMsgForMenu, setSelectedMsgForMenu] = useState<OfflineMessage | null>(null);
  const [confirmRegenerateMsg, setConfirmRegenerateMsg] = useState<OfflineMessage | null>(null);
  const [regeneratingMsgId, setRegeneratingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadMessages(0);
  }, [session.id]);

  const loadMessages = async (offset = 0) => {
    const { messages: fetched, totalCount: total } = await getPaginatedSessionMessages(session.id, offset, 40);
    setMessages(fetched);
    setTotalCount(total);
    setTimeout(() => scrollToBottom(), 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentLatestState: CharacterState = currentSession.stateHistory.length > 0
    ? currentSession.stateHistory[currentSession.stateHistory.length - 1].state
    : OfflineStateEngine.createInitialState();

  const handleContextMenu = (e: React.MouseEvent, msg: OfflineMessage) => {
    e.preventDefault();
    if (regeneratingMsgId) return;
    setSelectedMsgForMenu(msg);
  };

  const handleRequestRegenerate = (msg: OfflineMessage) => {
    setSelectedMsgForMenu(null);
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const hasSubsequent = msgIndex !== -1 && msgIndex < messages.length - 1;

    if (hasSubsequent) {
      setConfirmRegenerateMsg(msg);
    } else {
      executeRegenerate(msg);
    }
  };

  const executeRegenerate = async (msg: OfflineMessage) => {
    if (regeneratingMsgId) return;
    setConfirmRegenerateMsg(null);
    setRegeneratingMsgId(msg.id);

    try {
      const { updatedAiMsg, updatedSession } = await OfflineSessionService.regenerateAiMessage(
        currentSession,
        character,
        msg,
        userProfile,
        apiConfig
      );

      setCurrentSession(updatedSession);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? updatedAiMsg : m)));
    } catch (e: any) {
      console.error('Failed to regenerate offline message', e);
      alert(`重新生成失败，请重试: ${e?.message || '网络或模型异常'}`);
    } finally {
      setRegeneratingMsgId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userText = inputText.trim();
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsSending(true);

    // Optimistic UI insert for user message
    const tempUserMsg: OfflineMessage = {
      id: `temp_${Date.now()}`,
      sessionId: currentSession.id,
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setTimeout(() => scrollToBottom(), 50);

    try {
      const { aiMessage, updatedSession } = await OfflineSessionService.sendUserMessage(
        currentSession,
        character,
        userText,
        userProfile,
        apiConfig
      );

      setCurrentSession(updatedSession);
      setMessages((prev) => [...prev.filter((m) => !m.id.startsWith('temp_')), tempUserMsg, aiMessage]);
      setTimeout(() => scrollToBottom(), 50);
    } catch (e: any) {
      console.error('Failed to send offline message', e);
      alert(`回复失败: ${e?.message || '网络或模型异常'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleTriggerEnd = async () => {
    if (isEnding) return;
    setIsEnding(true);

    try {
      const { summary, updatedSession } = await OfflineSessionService.endSession(
        currentSession,
        character,
        userProfile,
        apiConfig
      );

      setCurrentSession(updatedSession);
      setEndSummary(summary);
      setShowEndModal(true);
    } catch (e: any) {
      alert(`生成经历总结失败: ${e?.message || '未知错误'}`);
    } finally {
      setIsEnding(false);
    }
  };

  const handleSaveDecision = async () => {
    if (!endSummary) return;
    await OfflineMemoryBridge.commitSessionToLongTermMemory(
      currentSession,
      endSummary,
      character,
      onUpdateCharacters
    );
    setShowEndModal(false);
    onSessionEndedAndSaved();
  };

  const handleDeleteDecision = async () => {
    const { deleteOfflineSession } = await import('../../lib/offline/OfflineSessionDb');
    await deleteOfflineSession(currentSession.id);
    setShowEndModal(false);
    onBack();
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100 relative overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <header className="px-4 py-3 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
          title="暂存草稿并返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center truncate max-w-[200px]">
          <h3 className="font-bold text-sm text-zinc-100 truncate">{currentSession.sceneSnapshot.name}</h3>
          <p className="text-[10px] text-zinc-400 truncate">与 {character.name} 独处中</p>
        </div>

        <button
          onClick={handleTriggerEnd}
          disabled={isEnding}
          className="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer"
        >
          {isEnding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : '结束'}
        </button>
      </header>

      {/* Main Scene & Chat Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative min-h-0" ref={chatContainerRef}>
        {/* Top-Left Mini Panel (Unobtrusive Overlay) */}
        <div className="sticky top-0 z-10 pt-1 pb-2">
          <OfflineStateMiniPanel state={currentLatestState} characterName={character.name} />
        </div>

        {/* Scene Snapshot Banner */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-indigo-300 font-bold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              {currentSession.sceneSnapshot.name}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {new Date(currentSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-zinc-300 leading-relaxed text-[11px]">{currentSession.sceneSnapshot.background}</p>
        </div>

        {/* Messages Stream */}
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
              <div className="flex items-center gap-2">
                {!isUser && (
                  <img src={character.avatar} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700" />
                )}
                <span className="text-[9px] text-zinc-500 font-mono">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div
                onContextMenu={(e) => handleContextMenu(e, m)}
                className={`max-w-[88%] p-3.5 rounded-2xl leading-relaxed text-xs shadow-xs select-text ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-xs'
                    : 'bg-zinc-850 text-zinc-100 border border-zinc-750 rounded-bl-xs space-y-1.5'
                }`}
              >
                {m.id === regeneratingMsgId ? (
                  <div className="flex items-center gap-2 py-1 text-indigo-300">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                    <span className="font-medium text-[11px]">正在重新体会当下氛围并生成回复……</span>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                    {/* AI Action Formatting: Full-width Chinese Parentheses （...） */}
                    {!isUser && m.action && !m.text.includes(m.action) && (
                      <p className="text-[11px] text-indigo-300/90 italic font-semibold pt-1 border-t border-zinc-750/50">
                        {m.action}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isSending && (
          <div className="flex items-center gap-2 text-xs text-indigo-300/80 p-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>{character.name} 正在体会当下氛围并思索对白...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Fixed Bottom Input Bar */}
      <footer className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 z-20">
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <button
            type="button"
            className="p-2.5 mb-0.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition shrink-0"
            title="快捷场景动作"
          >
            <Plus className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="输入你想说的话或做出的动作（支持多行输入与动作括号……）"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 font-medium resize-none max-h-32 min-h-[38px] leading-relaxed"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-2.5 mb-0.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shrink-0 shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* End Decision Modal */}
      {endSummary && (
        <OfflineEndModal
          isOpen={showEndModal}
          session={currentSession}
          summary={endSummary}
          characterName={character.name}
          onSave={handleSaveDecision}
          onDelete={handleDeleteDecision}
        />
      )}

      {/* Message Context Menu Modal */}
      {selectedMsgForMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedMsgForMenu(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-4 space-y-2 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center pb-2 border-b border-zinc-800/80">
              <p className="text-xs font-bold text-zinc-300">消息选项</p>
              <p className="text-[10px] text-zinc-500 truncate max-w-[240px] mx-auto mt-0.5">
                "{selectedMsgForMenu.text.slice(0, 30)}..."
              </p>
            </div>

            <div className="space-y-1 pt-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedMsgForMenu.text);
                  setSelectedMsgForMenu(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Copy className="w-4 h-4 text-zinc-400" />
                复制消息文本
              </button>

              {selectedMsgForMenu.sender === 'ai' && (
                <button
                  onClick={() => handleRequestRegenerate(selectedMsgForMenu)}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <RotateCcw className="w-4 h-4 text-indigo-400" />
                  重新生成回复 (重答)
                </button>
              )}
            </div>

            <button
              onClick={() => setSelectedMsgForMenu(null)}
              className="w-full py-2 rounded-xl bg-zinc-950 text-zinc-400 hover:text-white text-xs font-medium transition cursor-pointer mt-1"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal when Subsequent Messages Exist */}
      {confirmRegenerateMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setConfirmRegenerateMsg(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-sm text-zinc-100">确认重新生成此回复？</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                这条消息后面已有后续对话，重新生成可能与后续内容不一致，是否继续？
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmRegenerateMsg(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => executeRegenerate(confirmRegenerateMsg)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-indigo-600/30"
              >
                继续重答
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
