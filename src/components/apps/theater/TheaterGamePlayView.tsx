import React, { useState, useEffect, useRef } from 'react';
import { TheaterSession, TheaterMessage, AiCharacter } from '../../../types';
import { sendTheaterChatMessage, generateTheaterMemoirSummary } from '../../../lib/theater/theaterEngine';
import { saveTheaterSessionToDb } from '../../../lib/theater/theaterDb';
import {
  ArrowLeft, Send, Shield, Sparkles, MapPin, Clock, Heart, Dice5,
  AlertCircle, RefreshCw, LogOut, X, Check
} from 'lucide-react';

interface TheaterGamePlayViewProps {
  session: TheaterSession;
  characters: AiCharacter[];
  onBack: () => void;
  onUpdateSession: (updated: TheaterSession) => void;
}

export const TheaterGamePlayView: React.FC<TheaterGamePlayViewProps> = ({
  session,
  characters,
  onBack,
  onUpdateSession,
}) => {
  const [messages, setMessages] = useState<TheaterMessage[]>(session.messages || []);
  const [inputText, setInputText] = useState<string>('');
  const [actionText, setActionText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastError, setLastError] = useState<{ message: string; userMessageId?: string } | null>(
    session.lastError || null
  );

  const [showRoleCard, setShowRoleCard] = useState<boolean>(false);
  const [showDestinyModal, setShowDestinyModal] = useState<boolean>(false);
  const [destinyResult, setDestinyResult] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [memoirSummary, setMemoirSummary] = useState<string>(session.memoirSummary || '');
  const [saveToMemory, setSaveToMemory] = useState<boolean>(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiChar = characters.find(c => c.id === session.characterId) || characters[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, lastError]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !actionText.trim()) || isGenerating || session.status === 'ended') return;

    const userMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: inputText.trim() || '（无言，静静注视着对方）',
      action: actionText.trim() || undefined,
      timestamp: Date.now(),
    };

    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInputText('');
    setActionText('');
    setIsGenerating(true);
    setLastError(null);

    const tempSession: TheaterSession = {
      ...session,
      messages: updatedMsgs,
      lastError: undefined,
    };

    try {
      const res = await sendTheaterChatMessage(tempSession, userMsg.text, userMsg.action, aiChar);
      const newAiMsg = res.replyMessage;
      const finalMsgs = [...updatedMsgs, newAiMsg];
      
      const newIntimacy = Math.max(0, Math.min(100, session.intimacy + (res.intimacyDelta || 0)));
      const updatedSession: TheaterSession = {
        ...tempSession,
        messages: finalMsgs,
        currentLocation: res.updatedLocation || session.currentLocation,
        currentTime: res.updatedTime || session.currentTime,
        chapter: res.updatedChapter || session.chapter,
        intimacy: newIntimacy,
        lastError: undefined,
        updatedAt: Date.now(),
      };

      setMessages(finalMsgs);
      setLastError(null);
      onUpdateSession(updatedSession);
      await saveTheaterSessionToDb(updatedSession);
    } catch (err: any) {
      console.error('Theater chat error:', err);
      const errInfo = {
        message: err?.message || '生成对话失败，请检查网络或API设置',
        userMessageId: userMsg.id,
      };
      setLastError(errInfo);

      const errSession: TheaterSession = {
        ...tempSession,
        lastError: errInfo,
        updatedAt: Date.now(),
      };
      onUpdateSession(errSession);
      await saveTheaterSessionToDb(errSession);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetryLastMessage = async () => {
    if (isGenerating || messages.length === 0) return;

    // Find the failed user message
    let targetUserMsg = messages[messages.length - 1];
    if (lastError?.userMessageId) {
      const found = messages.find(m => m.id === lastError.userMessageId);
      if (found) targetUserMsg = found;
    }
    if (!targetUserMsg || targetUserMsg.sender !== 'user') return;

    setIsGenerating(true);
    setLastError(null);

    const tempSession: TheaterSession = {
      ...session,
      messages,
      lastError: undefined,
    };

    try {
      const res = await sendTheaterChatMessage(tempSession, targetUserMsg.text, targetUserMsg.action, aiChar);
      const newAiMsg = res.replyMessage;
      const finalMsgs = [...messages, newAiMsg];
      
      const newIntimacy = Math.max(0, Math.min(100, session.intimacy + (res.intimacyDelta || 0)));
      const updatedSession: TheaterSession = {
        ...tempSession,
        messages: finalMsgs,
        currentLocation: res.updatedLocation || session.currentLocation,
        currentTime: res.updatedTime || session.currentTime,
        chapter: res.updatedChapter || session.chapter,
        intimacy: newIntimacy,
        lastError: undefined,
        updatedAt: Date.now(),
      };

      setMessages(finalMsgs);
      setLastError(null);
      onUpdateSession(updatedSession);
      await saveTheaterSessionToDb(updatedSession);
    } catch (err: any) {
      console.error('Retry error:', err);
      const errInfo = {
        message: err?.message || '重试依然失败，请检查网络或API密钥配置',
        userMessageId: targetUserMsg.id,
      };
      setLastError(errInfo);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTriggerDestinyCheck = () => {
    const roll = Math.floor(Math.random() * 100) + 1;
    let outcome = '';
    if (roll >= 90) {
      outcome = `【大成功 (🎲 ${roll}/100)】命运之神眷顾！化解了危机，并洞悉了对方隐秘的动机。`;
    } else if (roll >= 50) {
      outcome = `【成功 (🎲 ${roll}/100)】进展顺利，通过了考验，局势渐入佳境。`;
    } else if (roll >= 20) {
      outcome = `【艰难通过 (🎲 ${roll}/100)】勉强过关，但引起了对方的警惕与审视。`;
    } else {
      outcome = `【大失败 (🎲 ${roll}/100)】意外横生！情况急转直下，陷入两难境地。`;
    }
    setDestinyResult(outcome);
    setShowDestinyModal(true);

    const systemMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'system',
      text: `🎲 【命运判定】${outcome}`,
      timestamp: Date.now(),
    };
    const updated = [...messages, systemMsg];
    setMessages(updated);
    const updatedSession = { ...session, messages: updated, updatedAt: Date.now() };
    onUpdateSession(updatedSession);
    saveTheaterSessionToDb(updatedSession);
  };

  const handleEndGame = async () => {
    setIsGenerating(true);
    const summary = await generateTheaterMemoirSummary(session);
    setMemoirSummary(summary);
    setIsGenerating(false);
    setShowEndModal(true);
  };

  const handleConfirmEnd = async () => {
    const endedSession: TheaterSession = {
      ...session,
      status: 'ended',
      memoirSummary,
      updatedAt: Date.now(),
    };
    onUpdateSession(endedSession);
    await saveTheaterSessionToDb(endedSession);

    // If saveToMemory is checked, add to AI character long-term memory
    if (saveToMemory && aiChar) {
      try {
        const memKey = `phone_ai_characters`;
        const raw = localStorage.getItem(memKey);
        if (raw) {
          const chars: AiCharacter[] = JSON.parse(raw);
          const idx = chars.findIndex(c => c.id === aiChar.id);
          if (idx >= 0) {
            if (!chars[idx].memories) chars[idx].memories = [];
            chars[idx].memories.unshift(`[小剧场经历: ${session.title}] ${memoirSummary.slice(0, 100)}`);
            localStorage.setItem(memKey, JSON.stringify(chars));
          }
        }
      } catch (e) {
        console.error('Failed to sync theater memoir to AI memory', e);
      }
    }

    setShowEndModal(false);
    onBack();
  };

  return (
    <div className="theater-app flex flex-col h-full bg-[#F6FBFF] dark:bg-zinc-950 text-[#24445C] dark:text-zinc-100 select-none overflow-hidden font-sans">
      
      {/* Top Header Bar */}
      <div className="theater-header px-4 py-3 bg-white/95 dark:bg-zinc-900/90 backdrop-blur border-b border-[#CFE8F7] dark:border-zinc-800 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="theater-back-btn w-9 h-9 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#2B6CB0] dark:text-zinc-300 hover:bg-[#D9EDFC] transition shrink-0 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-[#24445C] dark:text-zinc-100 truncate max-w-[170px] sm:max-w-xs">
                {session.title}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#EAF6FF] dark:bg-zinc-800 text-[#2B6CB0] dark:text-sky-300 text-[10px] font-extrabold shrink-0 font-mono">
                {session.chapter}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#6F8798] dark:text-zinc-400 pt-0.5">
              <span className="flex items-center gap-1 truncate max-w-[120px]"><MapPin className="w-3 h-3 text-[#3182CE]" /> {session.currentLocation}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#3182CE]" /> {session.currentTime}</span>
              <span className="flex items-center gap-1 text-rose-500 font-bold"><Heart className="w-3 h-3 fill-rose-500" /> {session.intimacy}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowRoleCard(true)}
            className="px-2.5 py-1.5 rounded-xl bg-[#EAF6FF] dark:bg-zinc-800 hover:bg-[#D9EDFC] text-[#2B6CB0] dark:text-sky-300 text-xs font-bold flex items-center gap-1 border border-[#CFE8F7] dark:border-zinc-700 transition"
          >
            <Shield className="w-3.5 h-3.5" /> 档案
          </button>
          <button
            onClick={handleTriggerDestinyCheck}
            className="px-2.5 py-1.5 rounded-xl bg-[#EAF6FF] dark:bg-zinc-800 hover:bg-[#D9EDFC] text-[#2B6CB0] dark:text-sky-300 text-xs font-bold flex items-center gap-1 border border-[#CFE8F7] dark:border-zinc-700 transition"
          >
            <Dice5 className="w-3.5 h-3.5" /> 判定
          </button>
          <button
            onClick={handleEndGame}
            className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 text-xs font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-900 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> 完结
          </button>
        </div>
      </div>

      {/* Main Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-3xl mx-auto w-full">
        
        {/* World Background & Opening Scene Banner */}
        <div className="p-4 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 text-xs text-[#6F8798] dark:text-zinc-400 space-y-1.5 shadow-[0_4px_16px_rgba(99,179,237,0.06)]">
          <div className="font-extrabold text-[#24445C] dark:text-zinc-200 flex items-center gap-1.5 text-xs">
            <Sparkles className="w-4 h-4 text-[#3182CE]" /> 世界法则与初始舞台
          </div>
          <p className="leading-relaxed text-[11px] sm:text-xs text-[#4A6478] dark:text-zinc-300">
            {session.worldBackground}
          </p>
        </div>

        {/* Messages List */}
        {messages.map(msg => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="px-4 py-2 rounded-2xl bg-[#EAF6FF] dark:bg-sky-950/50 border border-[#CFE8F7] dark:border-sky-800/40 text-xs text-[#2B6CB0] dark:text-sky-300 max-w-md text-center shadow-sm font-medium">
                  {msg.text}
                </div>
              </div>
            );
          }

          const isUser = msg.sender === 'user';
          const avatar = isUser ? '' : aiChar?.avatar;
          const name = isUser ? session.userRole.name : session.aiRole.name;

          return (
            <div key={msg.id} className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
              {!isUser && (
                <img
                  src={avatar}
                  alt={name}
                  className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-[#CFE8F7] dark:border-zinc-700 shadow-sm"
                />
              )}
              <div className={`max-w-[82%] sm:max-w-[75%] space-y-1.5 ${isUser ? 'items-end text-right' : 'items-start'}`}>
                <div className="text-[11px] text-[#6F8798] dark:text-zinc-400 font-medium px-1">
                  {name} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                <div className={`p-4 rounded-3xl text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-[#3182CE] text-white rounded-tr-sm shadow-[0_4px_14px_rgba(49,130,206,0.25)]'
                    : 'bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 text-[#24445C] dark:text-zinc-200 rounded-tl-sm shadow-[0_4px_16px_rgba(99,179,237,0.06)]'
                }`}>
                  {/* Action Description */}
                  {msg.action && (
                    <div className={`text-xs italic mb-1.5 font-serif ${isUser ? 'text-sky-100' : 'text-[#6F8798] dark:text-zinc-400'}`}>
                      （{msg.action}）
                    </div>
                  )}
                  {/* Spoken Dialog */}
                  <div className="whitespace-pre-wrap font-medium">{msg.text}</div>
                </div>

                {/* AI Secret / Thoughts (if generated) */}
                {!isUser && msg.thoughts && (
                  <div className="text-[11px] text-[#6F8798] dark:text-zinc-500 italic px-2">
                    💭 心声: {msg.thoughts}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Bubble */}
        {isGenerating && (
          <div className="flex items-start gap-3 animate-fadeIn">
            <img
              src={aiChar?.avatar}
              alt={aiChar?.name}
              className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-[#CFE8F7] dark:border-zinc-700 animate-pulse"
            />
            <div className="p-4 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 text-[#6F8798] dark:text-zinc-400 text-xs flex items-center gap-2 shadow-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-[#3182CE]" />
              <span>{session.aiRole.name} 正在结合秘密与人设构思回应...</span>
            </div>
          </div>
        )}

        {/* Error Card & Retry Button */}
        {lastError && !isGenerating && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2.5 shadow-sm animate-fadeIn">
            <div className="flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 leading-relaxed">
                <span className="font-bold">生成失败：</span>
                {lastError.message}
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleRetryLastMessage}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> 重新生成
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      {session.status === 'ended' ? (
        <div className="p-4 bg-white/95 dark:bg-zinc-900 border-t border-[#CFE8F7] dark:border-zinc-800 text-center text-xs text-[#6F8798] dark:text-zinc-400 shrink-0 font-medium">
          该剧场冒险已完结，可前往「剧场存档」随时回顾完整回忆录。
        </div>
      ) : (
        <form
          onSubmit={handleSendMessage}
          className="p-3.5 sm:p-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t border-[#CFE8F7] dark:border-zinc-800 shrink-0 space-y-2 max-w-3xl mx-auto w-full"
        >
          {/* Action text input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="你的神态动作（可选，如：按紧腰间佩剑，目光锐利）..."
              value={actionText}
              onChange={e => setActionText(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl bg-[#F6FBFF] dark:bg-zinc-950 border border-[#CFE8F7] dark:border-zinc-800 text-xs text-[#24445C] dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40 placeholder-[#8CA0AE]"
            />
          </div>

          {/* Dialogue text input & Send */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={`对 ${session.aiRole.name} 说点什么...`}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#F6FBFF] dark:bg-zinc-950 border border-[#CFE8F7] dark:border-zinc-800 text-sm text-[#24445C] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-400/40 placeholder-[#8CA0AE]"
            />
            <button
              type="submit"
              disabled={isGenerating || (!inputText.trim() && !actionText.trim())}
              className="px-5 py-2.5 rounded-xl bg-[#3182CE] hover:bg-[#2B6CB0] disabled:opacity-40 text-white font-bold text-sm shadow-md shadow-sky-500/20 transition flex items-center gap-1.5 shrink-0 active:scale-95"
            >
              <Send className="w-4 h-4" /> 发送
            </button>
          </div>
        </form>
      )}

      {/* Role Card Modal */}
      {showRoleCard && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-[#CFE8F7] dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#24445C] dark:text-zinc-100 flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#3182CE]" /> 双人角色设定与秘密档案
              </h3>
              <button
                onClick={() => setShowRoleCard(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-[#F6FBFF] dark:bg-zinc-950 border border-[#CFE8F7] dark:border-zinc-800 space-y-1.5">
                <div className="text-xs font-bold text-[#2B6CB0] dark:text-sky-400 uppercase tracking-wider">
                  你的角色：{session.userRole.name}
                </div>
                <div className="text-xs text-[#24445C] dark:text-zinc-300">
                  <strong>身份：</strong>{session.userRole.identity}
                </div>
                <div className="text-xs text-[#6F8798] dark:text-zinc-400 leading-relaxed">
                  <strong>你的隐藏秘密：</strong>{session.userRole.secret}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F6FBFF] dark:bg-zinc-950 border border-[#CFE8F7] dark:border-zinc-800 space-y-1.5">
                <div className="text-xs font-bold text-[#2B6CB0] dark:text-sky-400 uppercase tracking-wider">
                  {aiChar?.name} 的剧场角色：{session.aiRole.name}
                </div>
                <div className="text-xs text-[#24445C] dark:text-zinc-300">
                  <strong>身份：</strong>{session.aiRole.identity}
                </div>
                <div className="text-xs text-[#6F8798] dark:text-zinc-400 leading-relaxed">
                  <strong>AI 隐秘动机：</strong>{session.aiRole.secret}
                </div>
              </div>
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setShowRoleCard(false)}
                className="px-5 py-2.5 rounded-xl bg-[#3182CE] text-white text-xs font-bold hover:bg-[#2B6CB0] transition shadow-sm"
              >
                返回剧场
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Game Memoir Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-[#CFE8F7] dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#24445C] dark:text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#3182CE]" /> 剧场冒险完结报告
              </h3>
              <button
                onClick={() => setShowEndModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#F6FBFF] dark:bg-zinc-950 border border-[#CFE8F7] dark:border-zinc-800 text-xs sm:text-sm text-[#24445C] dark:text-zinc-200 leading-relaxed italic space-y-2">
              <p>“{memoirSummary}”</p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-[#24445C] dark:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToMemory}
                  onChange={e => setSaveToMemory(e.target.checked)}
                  className="w-4 h-4 rounded text-[#3182CE] focus:ring-[#3182CE]"
                />
                同时将这段经历沉淀为「{aiChar?.name}」的长期记忆
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs text-[#6F8798] dark:text-zinc-400 font-bold"
              >
                继续游戏
              </button>
              <button
                onClick={handleConfirmEnd}
                className="px-6 py-2.5 rounded-xl bg-[#3182CE] hover:bg-[#2B6CB0] text-white text-xs font-bold shadow-md shadow-sky-500/20 transition"
              >
                确认完结并归档
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
