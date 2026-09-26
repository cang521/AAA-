import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Send, Plus, Sparkles, Heart, RefreshCw, X, AlertCircle } from 'lucide-react';
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userText = inputText.trim();
    setInputText('');
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
                className={`max-w-[85%] p-3.5 rounded-2xl leading-relaxed text-xs shadow-xs ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-xs'
                    : 'bg-zinc-850 text-zinc-100 border border-zinc-750 rounded-bl-xs space-y-1.5'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>

                {/* AI Action Formatting: Full-width Chinese Parentheses （...） */}
                {!isUser && m.action && (
                  <p className="text-[11px] text-indigo-300/90 italic font-semibold pt-1 border-t border-zinc-750/50">
                    {m.action}
                  </p>
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
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <button
            type="button"
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition shrink-0"
            title="快捷场景动作"
          >
            <Plus className="w-4 h-4" />
          </button>

          <input
            type="text"
            placeholder="输入你想说的话或做出的动作……"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            className="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 font-medium"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shrink-0 shadow-md shadow-indigo-600/30 active:scale-95"
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
    </div>
  );
};
