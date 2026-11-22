import React, { useState, useEffect } from 'react';
import { AiCharacter, TheaterPreset, TheaterSession } from '../../../types';
import { loadCharactersFromStorage } from '../../../lib/characterPersistence';
import { loadTheaterSessionsFromDb, saveTheaterSessionToDb } from '../../../lib/theater/theaterDb';
import { generateInitialTheaterScenario } from '../../../lib/theater/theaterEngine';
import { TheaterDrawModal } from './TheaterDrawModal';
import { TheaterCustomSelectModal } from './TheaterCustomSelectModal';
import { TheaterArchivesView } from './TheaterArchivesView';
import { TheaterGamePlayView } from './TheaterGamePlayView';
import { BUILTIN_THEATER_PRESETS, THEATER_CATEGORIES } from '../../../lib/theater/theaterPresets';
import {
  Sparkles, Shuffle, BookOpen, FolderArchive, Settings as SettingsIcon,
  Play, Heart, ArrowLeft, Plus, Drama, Compass, Shield, Users
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
  const [showArchives, setShowArchives] = useState<boolean>(false);
  const [showPresetPool, setShowPresetPool] = useState<boolean>(false);
  const [presetPoolCategory, setPresetPoolCategory] = useState<string>('A');
  const [recentSessions, setRecentSessions] = useState<TheaterSession[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

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
    setShowPresetPool(false);
    setShowArchives(false);
    setIsInitializing(true);

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
    } catch (e) {
      console.error('Failed to initialize session', e);
    } finally {
      setIsInitializing(false);
    }
  };

  if (activeSession) {
    return (
      <TheaterGamePlayView
        session={activeSession}
        characters={characters}
        onBack={() => setActiveSession(null)}
        onUpdateSession={(updated) => setActiveSession(updated)}
      />
    );
  }

  return (
    <div className="theater-app flex flex-col h-full bg-zinc-950 text-zinc-100 select-none overflow-hidden relative">
      
      {/* Top Header */}
      <div className="theater-header px-6 py-4 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="theater-back-btn w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <Drama className="w-5 h-5" />
            </div>
            <div>
              <h1 className="theater-title text-base font-bold text-zinc-100">小剧场</h1>
              <p className="theater-subtitle text-[10px] text-zinc-400">沉浸式双人角色扮演游戏</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchives(true)}
            className="theater-archive-btn px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium flex items-center gap-1.5 transition text-zinc-300"
          >
            <FolderArchive className="w-4 h-4 text-violet-400" /> 存档
          </button>
        </div>
      </div>

      {/* Main Home Dashboard Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        
        {/* Dual Main Entry Banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Mode 1: Random Draw */}
          <div
            onClick={() => setShowDrawModal(true)}
            className="theater-draw-card group relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-amber-600/20 via-amber-500/10 to-zinc-900 border border-amber-500/30 hover:border-amber-500/60 transition cursor-pointer shadow-xl flex flex-col justify-between h-48"
          >
            <div className="theater-draw-icon-box absolute right-4 top-4 w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition duration-300">
              <Shuffle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <span className="theater-draw-tag px-2.5 py-1 rounded-full bg-amber-500 text-white text-[10px] font-bold tracking-wider">
                MODE 01
              </span>
              <h3 className="theater-draw-title text-xl font-extrabold text-zinc-100 pt-1">🎴 随机抽签剧场</h3>
              <p className="theater-draw-desc text-xs text-zinc-400 leading-relaxed">
                摇一摇命运之签，在156+预设中随机匹配属于你与AI的宿命开局。
              </p>
            </div>
            <div className="theater-draw-action flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition">
              开始抽签 ➔
            </div>
          </div>

          {/* Mode 2: Custom Selection */}
          <div
            onClick={() => setShowCustomModal(true)}
            className="theater-custom-card group relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-indigo-600/20 via-indigo-500/10 to-zinc-900 border border-indigo-500/30 hover:border-indigo-500/60 transition cursor-pointer shadow-xl flex flex-col justify-between h-48"
          >
            <div className="theater-custom-icon-box absolute right-4 top-4 w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition duration-300">
              <Drama className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <span className="theater-custom-tag px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold tracking-wider">
                MODE 02
              </span>
              <h3 className="theater-custom-title text-xl font-extrabold text-zinc-100 pt-1">🎭 自选关系剧场</h3>
              <p className="theater-custom-desc text-xs text-zinc-400 leading-relaxed">
                13大分类（古风江湖、仙侠、权谋、科幻等）自由浏览，或创建专属剧本。
              </p>
            </div>
            <div className="theater-custom-action flex items-center gap-1 text-xs font-bold text-indigo-400 group-hover:translate-x-1 transition">
              挑选关系 ➔
            </div>
          </div>

        </div>

        {/* Continue Recent Sessions Section */}
        {recentSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="theater-section-title text-sm font-bold text-zinc-300 flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" /> 继续最近游戏
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentSessions.slice(0, 4).map(session => {
                const ai = characters.find(c => c.id === session.characterId);
                return (
                  <div
                    key={session.id}
                    onClick={() => setActiveSession(session)}
                    className="theater-recent-card p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/50 transition cursor-pointer flex items-center justify-between group shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                        <span className="theater-recent-tag px-2 py-0.5 rounded bg-zinc-800 text-amber-400 font-bold">{session.chapter}</span>
                        <span className="theater-recent-ai">{ai?.name || 'AI伙伴'}</span>
                      </div>
                      <h4 className="theater-recent-title text-sm font-bold text-zinc-200 group-hover:text-emerald-400 transition truncate max-w-[220px]">
                        {session.title}
                      </h4>
                      <div className="theater-recent-location text-[11px] text-zinc-500">{session.currentLocation}</div>
                    </div>
                    <div className="theater-recent-play-icon w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preset Pool Browser Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="theater-section-title text-sm font-bold text-zinc-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" /> 156+ 预设关系签池预览 (A-M)
            </h2>
            <button
              onClick={() => setShowPresetPool(true)}
              className="theater-link text-xs text-amber-400 hover:underline font-medium"
            >
              查看全部 ➔
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {THEATER_CATEGORIES.slice(0, 8).map(cat => {
              const count = BUILTIN_THEATER_PRESETS.filter(p => p.category === cat.id).length;
              return (
                <div
                  key={cat.id}
                  onClick={() => { setPresetPoolCategory(cat.id); setShowPresetPool(true); }}
                  className="theater-category-card p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="theater-category-badge text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                      类别 {cat.id}
                    </span>
                    <span className="theater-category-count text-[10px] text-zinc-500">{count} 预设</span>
                  </div>
                  <h4 className="theater-category-title text-xs font-bold text-zinc-200">{cat.name}</h4>
                  <p className="theater-category-desc text-[10px] text-zinc-400 truncate">{cat.description}</p>
                </div>
              );
            })}
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

      {showArchives && (
        <TheaterArchivesView
          onClose={() => setShowArchives(false)}
          onContinueSession={(session) => { setShowArchives(false); setActiveSession(session); }}
        />
      )}

      {showPresetPool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="theater-pool-modal w-full max-w-2xl bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="theater-pool-title text-base font-bold text-zinc-100">📖 预设签池完整目录</h3>
              <button onClick={() => setShowPresetPool(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2 shrink-0">
              {THEATER_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setPresetPoolCategory(c.id)}
                  className={`theater-pool-tab px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                    presetPoolCategory === c.id ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {c.id}. {c.name}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5">
              {BUILTIN_THEATER_PRESETS.filter(p => p.category === presetPoolCategory).map(preset => (
                <div key={preset.id} className="theater-pool-item p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="theater-pool-item-title text-xs font-bold text-zinc-200">{preset.title}</h4>
                    <span className="text-[10px] text-amber-400">{preset.categoryName}</span>
                  </div>
                  <p className="theater-pool-item-desc text-[11px] text-zinc-400">{preset.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isInitializing && (
        <div className="theater-init-loading fixed inset-0 z-70 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md gap-4 text-center p-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/20 flex items-center justify-center text-amber-400 animate-spin">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-100">正在生成小剧场双盲秘密与开场剧本...</h3>
            <p className="text-xs text-zinc-400 mt-1">AI 正在根据人设与世界观为您构筑专属沉浸式世界</p>
          </div>
        </div>
      )}

    </div>
  );
};
