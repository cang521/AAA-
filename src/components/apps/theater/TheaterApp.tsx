import React, { useState, useEffect } from 'react';
import { AiCharacter, TheaterPreset, TheaterSession } from '../../../types';
import { loadCharactersFromStorage } from '../../../lib/characterPersistence';
import { loadTheaterSessionsFromDb, saveTheaterSessionToDb } from '../../../lib/theater/theaterDb';
import { generateInitialTheaterScenario } from '../../../lib/theater/theaterEngine';
import { TheaterDrawModal } from './TheaterDrawModal';
import { TheaterCustomSelectModal } from './TheaterCustomSelectModal';
import { TheaterCreateCustomModal } from './TheaterCreateCustomModal';
import { TheaterArchivesView } from './TheaterArchivesView';
import { TheaterGamePlayView } from './TheaterGamePlayView';
import {
  Shuffle, FolderArchive, Play, ArrowLeft, Drama, BookPlus, Sparkles, RefreshCw
} from 'lucide-react';

interface TheaterAppProps {
  onBack: () => void;
  userNickname: string;
}

export const TheaterApp: React.FC<TheaterAppProps> = ({ onBack, userNickname }) => {
  const [characters, setCharacters] = useState<AiCharacter[]>([]);
  const [activeSession, setActiveSession] = useState<TheaterSession | null>(null);
  const [showDrawModal, setShowDrawModal] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showArchives, setShowArchives] = useState<boolean>(false);
  const [recentSessions, setRecentSessions] = useState<TheaterSession[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const chars = loadCharactersFromStorage();
    setCharacters(chars);
    loadTheaterSessionsFromDb().then(list => {
      setRecentSessions(list.filter(s => s.status === 'playing'));
    });
  }, []);

  const handleStartSession = async (character: AiCharacter, preset: TheaterPreset) => {
    setShowDrawModal(false);
    setShowCustomModal(false);
    setShowCreateModal(false);
    setShowArchives(false);
    setIsInitializing(true);
    setInitError(null);

    try {
      const scenario = await generateInitialTheaterScenario(character, preset, userNickname);
      
      const newSession: TheaterSession = {
        id: 'session_' + Date.now(),
        characterId: character.id,
        presetId: preset.id,
        title: scenario.title,
        category: preset.category,
        worldBackground: scenario.worldBackground,
        initialScene: scenario.initialScene,
        currentTime: scenario.currentTime,
        currentLocation: scenario.currentLocation,
        chapter: scenario.chapter,
        userRole: scenario.userRole,
        aiRole: scenario.aiRole,
        messages: [scenario.openingMessage],
        tasks: [],
        inventory: [],
        intimacy: 50,
        status: 'playing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveTheaterSessionToDb(newSession);
      setActiveSession(newSession);
    } catch (e: any) {
      console.error('Failed to initialize session', e);
      setInitError(e?.message || '剧场生成失败，请检查API配置或稍后重试。');
    } finally {
      setIsInitializing(false);
    }
  };

  if (activeSession) {
    return (
      <TheaterGamePlayView
        session={activeSession}
        characters={characters}
        onBack={() => {
          setActiveSession(null);
          loadTheaterSessionsFromDb().then(list => {
            setRecentSessions(list.filter(s => s.status === 'playing'));
          });
        }}
        onUpdateSession={(updated) => setActiveSession(updated)}
      />
    );
  }

  return (
    <div className="theater-app flex flex-col h-full bg-[#F6FBFF] dark:bg-zinc-950 text-[#24445C] dark:text-zinc-100 select-none overflow-hidden relative font-sans">
      
      {/* Top Header Bar */}
      <div className="theater-header px-5 py-3.5 bg-white/95 dark:bg-zinc-900/90 backdrop-blur border-b border-[#CFE8F7] dark:border-zinc-800 flex items-center justify-between shrink-0 shadow-[0_2px_10px_rgba(99,179,237,0.06)] z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="theater-back-btn w-9 h-9 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#2B6CB0] dark:text-zinc-300 hover:bg-[#D9EDFC] transition active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-400/25">
              <Drama className="w-5 h-5" />
            </div>
            <div>
              <h1 className="theater-title text-base font-extrabold text-[#24445C] dark:text-zinc-100 leading-tight">小剧场</h1>
              <p className="theater-subtitle text-[10px] text-[#6F8798] dark:text-zinc-400">沉浸式双人角色扮演游戏</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchives(true)}
            className="theater-archive-btn px-3 py-1.5 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 hover:bg-[#D9EDFC] text-xs font-bold flex items-center gap-1.5 transition text-[#2B6CB0] dark:text-sky-400 border border-[#CFE8F7] dark:border-zinc-700 shadow-sm active:scale-95"
          >
            <FolderArchive className="w-4 h-4 text-[#3182CE] dark:text-sky-400" /> 剧场存档
          </button>
        </div>
      </div>

      {/* Main Home Content (Single-column layout, adaptive scrolling, no horizontal squeeze) */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 max-w-xl mx-auto w-full">
        
        {/* Error notice if initialization failed */}
        {initError && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between shadow-sm animate-fadeIn">
            <span>{initError}</span>
            <button onClick={() => setInitError(null)} className="font-bold ml-2 text-rose-500 hover:text-rose-700">✕</button>
          </div>
        )}

        {/* Loading Indicator */}
        {isInitializing && (
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 flex items-center justify-center gap-3 text-sm font-bold text-[#2B6CB0] dark:text-sky-400 shadow-md animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin text-[#3182CE]" />
            <span>AI 正在构思属于你们的世界与双盲秘密...</span>
          </div>
        )}

        {/* Continue Recent Sessions Section (if any active games) */}
        {recentSessions.length > 0 && (
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold text-[#6F8798] dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
              <Play className="w-3.5 h-3.5 text-[#3182CE]" /> 继续最近游戏
            </h2>
            <div className="space-y-2">
              {recentSessions.slice(0, 3).map(session => {
                const ai = characters.find(c => c.id === session.characterId);
                return (
                  <div
                    key={session.id}
                    onClick={() => setActiveSession(session)}
                    className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 hover:border-[#3182CE] transition cursor-pointer flex items-center justify-between shadow-[0_4px_16px_rgba(99,179,237,0.08)] active:scale-[0.99] group"
                  >
                    <div className="space-y-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 text-[10px] text-[#6F8798] dark:text-zinc-400">
                        <span className="px-2 py-0.5 rounded-md bg-[#EAF6FF] dark:bg-zinc-800 text-[#2B6CB0] dark:text-sky-400 font-bold">
                          {session.chapter}
                        </span>
                        <span>{ai?.name || 'AI伙伴'}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#24445C] dark:text-zinc-100 group-hover:text-[#3182CE] transition truncate">
                        {session.title}
                      </h4>
                      <div className="text-[11px] text-[#6F8798] dark:text-zinc-400 truncate">
                        {session.currentLocation} · {session.currentTime}
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#3182CE] dark:text-sky-400 group-hover:bg-[#3182CE] group-hover:text-white transition shrink-0">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Three Large Vertical Cards (Uniform size, padding, radius, light-blue theme) */}
        <div className="flex flex-col gap-4">
          
          {/* Card 1: 随机抽签剧场 */}
          <div
            onClick={() => setShowDrawModal(true)}
            className="theater-card-item group relative overflow-hidden p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 hover:border-[#4299E1] transition-all duration-300 cursor-pointer shadow-[0_8px_24px_rgba(99,179,237,0.10)] active:scale-[0.99] flex flex-col justify-between min-h-[170px]"
          >
            <div className="absolute right-5 top-5 w-14 h-14 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#3182CE] dark:text-sky-400 group-hover:scale-110 group-hover:bg-[#D9EDFC] transition duration-300">
              <Shuffle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-[78%]">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#EAF6FF] dark:bg-zinc-800 text-[#2B6CB0] dark:text-sky-400 text-[10px] font-extrabold tracking-wider font-mono">
                MODE 01
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold text-[#24445C] dark:text-zinc-100">
                🎴 随机抽签剧场
              </h3>
              <p className="text-xs text-[#6F8798] dark:text-zinc-400 leading-relaxed">
                从现有70条剧场预设中随机抽取一段关系与开局。
              </p>
            </div>

            <div className="pt-3 flex items-center gap-1 text-xs font-bold text-[#3182CE] dark:text-sky-400 group-hover:translate-x-1.5 transition">
              开始抽签 →
            </div>
          </div>

          {/* Card 2: 自选关系剧场 */}
          <div
            onClick={() => setShowCustomModal(true)}
            className="theater-card-item group relative overflow-hidden p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 hover:border-[#4299E1] transition-all duration-300 cursor-pointer shadow-[0_8px_24px_rgba(99,179,237,0.10)] active:scale-[0.99] flex flex-col justify-between min-h-[170px]"
          >
            <div className="absolute right-5 top-5 w-14 h-14 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#3182CE] dark:text-sky-400 group-hover:scale-110 group-hover:bg-[#D9EDFC] transition duration-300">
              <Drama className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-[78%]">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#EAF6FF] dark:bg-zinc-800 text-[#2B6CB0] dark:text-sky-400 text-[10px] font-extrabold tracking-wider font-mono">
                MODE 02
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold text-[#24445C] dark:text-zinc-100">
                🎭 自选关系剧场
              </h3>
              <p className="text-xs text-[#6F8798] dark:text-zinc-400 leading-relaxed">
                从现有70条关系预设中自行挑选想体验的剧情。
              </p>
            </div>

            <div className="pt-3 flex items-center gap-1 text-xs font-bold text-[#3182CE] dark:text-sky-400 group-hover:translate-x-1.5 transition">
              选择剧场 →
            </div>
          </div>

          {/* Card 3: 自定义剧场 */}
          <div
            onClick={() => setShowCreateModal(true)}
            className="theater-card-item group relative overflow-hidden p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-[#CFE8F7] dark:border-zinc-800 hover:border-[#4299E1] transition-all duration-300 cursor-pointer shadow-[0_8px_24px_rgba(99,179,237,0.10)] active:scale-[0.99] flex flex-col justify-between min-h-[170px]"
          >
            <div className="absolute right-5 top-5 w-14 h-14 rounded-2xl bg-[#EAF6FF] dark:bg-zinc-800 flex items-center justify-center text-[#3182CE] dark:text-sky-400 group-hover:scale-110 group-hover:bg-[#D9EDFC] transition duration-300">
              <BookPlus className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-[78%]">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#EAF6FF] dark:bg-zinc-800 text-[#2B6CB0] dark:text-sky-400 text-[10px] font-extrabold tracking-wider font-mono">
                MODE 03
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold text-[#24445C] dark:text-zinc-100">
                ✍️ 自定义剧场
              </h3>
              <p className="text-xs text-[#6F8798] dark:text-zinc-400 leading-relaxed">
                亲自设定角色关系、世界背景与故事开局。
              </p>
            </div>

            <div className="pt-3 flex items-center gap-1 text-xs font-bold text-[#3182CE] dark:text-sky-400 group-hover:translate-x-1.5 transition">
              创建剧场 →
            </div>
          </div>

        </div>

      </div>

      {/* Modals & Views */}
      {showDrawModal && (
        <TheaterDrawModal
          characters={characters}
          userNickname={userNickname}
          onClose={() => setShowDrawModal(false)}
          onStartSession={handleStartSession}
        />
      )}

      {showCustomModal && (
        <TheaterCustomSelectModal
          characters={characters}
          userNickname={userNickname}
          onClose={() => setShowCustomModal(false)}
          onStartSession={handleStartSession}
        />
      )}

      {showCreateModal && (
        <TheaterCreateCustomModal
          characters={characters}
          userNickname={userNickname}
          onClose={() => setShowCreateModal(false)}
          onStartSession={handleStartSession}
        />
      )}

      {showArchives && (
        <TheaterArchivesView
          onClose={() => setShowArchives(false)}
          onSelectSession={(session) => {
            setShowArchives(false);
            setActiveSession(session);
          }}
        />
      )}

    </div>
  );
};
