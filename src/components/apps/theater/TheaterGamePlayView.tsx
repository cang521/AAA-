import React, { useState, useEffect, useRef } from 'react';
import { TheaterSession, TheaterMessage, TheaterTask, TheaterItem, AiCharacter } from '../../../types';
import { sendTheaterChatMessage, generateTheaterMemoirSummary } from '../../../lib/theater/theaterEngine';
import { saveTheaterSessionToDb } from '../../../lib/theater/theaterDb';
import {
  ArrowLeft, Send, Pause, Play, Shield, Backpack, CheckSquare, Sparkles,
  MapPin, Clock, Heart, Dice5, AlertCircle, RefreshCw, LogOut, Check
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
  const [messages, setMessages] = useState<TheaterMessage[]>(session.messages);
  const [inputText, setInputText] = useState<string>('');
  const [actionText, setActionText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showRoleCard, setShowRoleCard] = useState<boolean>(false);
  const [showTasksModal, setShowTasksModal] = useState<boolean>(false);
  const [showInventoryModal, setShowInventoryModal] = useState<boolean>(false);
  const [showDestinyModal, setShowDestinyModal] = useState<boolean>(false);
  const [destinyResult, setDestinyResult] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [memoirSummary, setMemoirSummary] = useState<string>(session.memoirSummary || '');
  const [saveToMemory, setSaveToMemory] = useState<boolean>(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiChar = characters.find(c => c.id === session.characterId) || characters[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !actionText.trim()) || isGenerating || session.status === 'ended') return;

    const userMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: inputText.trim() || '（做出了某个动作）',
      action: actionText.trim() || undefined,
      timestamp: Date.now(),
    };

    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInputText('');
    setActionText('');
    setIsGenerating(true);

    const tempSession: TheaterSession = {
      ...session,
      messages: updatedMsgs,
    };

    try {
      const res = await sendTheaterChatMessage(tempSession, userMsg.text, userMsg.action);
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
        updatedAt: Date.now(),
      };

      setMessages(finalMsgs);
      onUpdateSession(updatedSession);
      await saveTheaterSessionToDb(updatedSession);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTriggerDestinyCheck = () => {
    const roll = Math.floor(Math.random() * 100) + 1;
    let outcome = '';
    if (roll >= 90) {
      outcome = `【大成功 (🎲 ${roll}/100)】命运之神眷顾！不仅化解了危机，还获得了意外的转机与线索。`;
    } else if (roll >= 50) {
      outcome = `【成功 (🎲 ${roll}/100)】进展顺利，有惊无险地通过了考验。`;
    } else if (roll >= 20) {
      outcome = `【艰难通过 (🎲 ${roll}/100)】虽然勉强过关，但付出了一些代价或引起了对方的警觉。`;
    } else {
      outcome = `【大失败 (🎲 ${roll}/100)】天呐！情况急转直下，陷入了意料之外的困境。`;
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
    <div className="theater-app flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold truncate max-w-[200px] sm:max-w-xs">{session.title}</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                {session.chapter}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {session.currentLocation}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {session.currentTime}</span>
              <span className="flex items-center gap-1 text-rose-400"><Heart className="w-3 h-3 fill-rose-500" /> {session.intimacy}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRoleCard(true)}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" /> 角色档案
          </button>
          <button
            onClick={handleTriggerDestinyCheck}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Dice5 className="w-3.5 h-3.5 text-indigo-400" /> 命运判定
          </button>
          <button
            onClick={handleEndGame}
            className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> 结束剧场
          </button>
        </div>
      </div>

      {/* Main Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* World background banner */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-400 space-y-1">
          <div className="font-bold text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" /> 世界观与开场设定
          </div>
          <p className="leading-relaxed">{session.worldBackground}</p>
        </div>

        {messages.map(msg => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="px-4 py-2 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 text-xs text-indigo-300 max-w-lg text-center shadow">
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
                <img src={avatar} alt={name} className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-zinc-700 shadow" />
              )}
              <div className={`max-w-[80%] sm:max-w-[70%] space-y-1.5 ${isUser ? 'items-end text-right' : 'items-start'}`}>
                <div className="text-[11px] text-zinc-400 font-medium px-1">
                  {name} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                <div className={`p-4 rounded-3xl text-sm leading-relaxed shadow-md ${
                  isUser
                    ? 'bg-amber-500 text-white rounded-tr-sm'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm'
                }`}>
                  {msg.action && (
                    <div className="text-xs opacity-80 italic mb-1.5 font-serif">
                      （{msg.action}）
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>

                {/* AI Secret / Thoughts preview if any */}
                {!isUser && msg.thoughts && (
                  <div className="text-[11px] text-zinc-500 italic px-2">
                    💭 独白: {msg.thoughts}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-start gap-3">
            <img src={aiChar?.avatar} alt={aiChar?.name} className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-zinc-700 animate-pulse" />
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              <span>{session.aiRole.name}正在构思剧情与回应...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      {session.status === 'ended' ? (
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 text-center text-xs text-zinc-400 shrink-0">
          该剧场冒险已完结，可前往存档查看完整回忆录。
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className="p-4 bg-zinc-900/90 backdrop-blur border-t border-zinc-800 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="输入你的动作或神态描写（例如：警惕地拔出腰间短剑）..."
              value={actionText}
              onChange={e => setActionText(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={`对 ${session.aiRole.name} 说点什么或做出回应...`}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              type="submit"
              disabled={isGenerating || (!inputText.trim() && !actionText.trim())}
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" /> 发送
            </button>
          </div>
        </form>
      )}

      {/* Role Card Modal */}
      {showRoleCard && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-800 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" /> 剧场双人角色档案
              </h3>
              <button onClick={() => setShowRoleCard(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">你的角色：{session.userRole.name}</div>
                <div className="text-xs text-zinc-300"><strong>身份：</strong>{session.userRole.identity}</div>
                <div className="text-xs text-zinc-400"><strong>秘密/动机：</strong>{session.userRole.secret}</div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI 角色：{session.aiRole.name}</div>
                <div className="text-xs text-zinc-300"><strong>身份：</strong>{session.aiRole.identity}</div>
                <div className="text-xs text-zinc-400"><strong>AI 隐秘设定：</strong>{session.aiRole.secret}</div>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={() => setShowRoleCard(false)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Game Memoir Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-800 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" /> 剧场冒险完结报告与回忆录
              </h3>
              <button onClick={() => setShowEndModal(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 leading-relaxed italic space-y-2">
              <p>“{memoirSummary}”</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToMemory}
                  onChange={e => setSaveToMemory(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                />
                同时将这段经历摘要沉淀为 AI 角色「{aiChar?.name}」的长期记忆
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-700 text-xs text-zinc-300"
              >
                继续游戏
              </button>
              <button
                onClick={handleConfirmEnd}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow"
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
