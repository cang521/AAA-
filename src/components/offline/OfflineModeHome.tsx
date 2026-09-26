import React, { useState, useEffect } from 'react';
import { ChevronLeft, Sparkles, Plus, History, BookOpen, Trash2, ArrowRight, Play, Heart, AlertCircle } from 'lucide-react';
import { AiCharacter, UserProfile, ApiConfig, ChatMessage } from '../../types';
import { OfflineSession, getAnyActiveSession, deleteOfflineSession } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionService } from '../../lib/offline/OfflineSessionService';
import { OfflineAiSelector } from './OfflineAiSelector';
import { SceneSelector } from './SceneSelector';
import { OfflineSessionView } from './OfflineSessionView';
import { OfflineHistory } from './OfflineHistory';

interface OfflineModeHomeProps {
  characters: AiCharacter[];
  userProfile: UserProfile;
  apiConfig?: ApiConfig;
  initialCharacterId?: string | null;
  onBack: () => void;
  onUpdateCharacters?: (chars: AiCharacter[]) => void;
  onShareToChat?: (cardMsg: ChatMessage) => void;
}

export const OfflineModeHome: React.FC<OfflineModeHomeProps> = ({
  characters,
  userProfile,
  apiConfig,
  initialCharacterId,
  onBack,
  onUpdateCharacters,
  onShareToChat,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [activeSession, setActiveSession] = useState<OfflineSession | null>(null);

  // Setup Flow States
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCharacter, setSelectedCharacter] = useState<AiCharacter | null>(null);

  useEffect(() => {
    // Default pick initial character if provided
    if (initialCharacterId) {
      const found = characters.find((c) => c.id === initialCharacterId);
      if (found) {
        setSelectedCharacter(found);
      }
    } else if (characters.length > 0 && !selectedCharacter) {
      setSelectedCharacter(characters[0]);
    }

    checkDraftSession();
  }, [initialCharacterId, characters]);

  const checkDraftSession = async () => {
    const draft = await getAnyActiveSession();
    if (draft) {
      setActiveSession(draft);
    }
  };

  const handleStartSession = async (
    scene: { name: string; location: string; atmosphere: string; background: string; defaultOpening?: string },
    templateId?: string
  ) => {
    if (!selectedCharacter) {
      alert('请先选择一个 AI 角色');
      return;
    }

    try {
      const { session } = await OfflineSessionService.startSession(selectedCharacter, scene, templateId);
      setActiveSession(session);
    } catch (e: any) {
      alert(`启动线下模式失败: ${e?.message || '未知错误'}`);
    }
  };

  const handleDiscardDraft = async () => {
    if (activeSession && confirm(`确定放弃未完成的『${activeSession.sceneSnapshot.name}』草稿吗？`)) {
      await deleteOfflineSession(activeSession.id);
      setActiveSession(null);
    }
  };

  // Render Ongoing Offline Session View
  if (activeSession) {
    const sessionChar = characters.find((c) => c.id === activeSession.characterId) || selectedCharacter || characters[0];
    return (
      <OfflineSessionView
        session={activeSession}
        character={sessionChar}
        userProfile={userProfile}
        apiConfig={apiConfig}
        onBack={() => setActiveSession(null)}
        onSessionEndedAndSaved={() => {
          setActiveSession(null);
          setActiveTab('history');
        }}
        onUpdateCharacters={onUpdateCharacters}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* Header */}
      <header className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-10">
        <button
          onClick={onBack}
          className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="font-bold text-sm text-zinc-100 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            线下模式
          </h3>
          <p className="text-[10px] text-zinc-400">现实剧情与真实场景沉浸互动</p>
        </div>

        <div className="w-8" />
      </header>

      {/* Navigation Tabs */}
      <div className="px-4 pt-3 shrink-0">
        <div className="flex items-center p-1 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'create' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            发起线下剧情
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-4 h-4" />
            历史经历库
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Draft Banner */}
        {activeSession && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/60 to-zinc-900 border border-amber-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400 animate-pulse" />
                发现一段未结束的线下经历草稿
              </span>
              <button
                onClick={handleDiscardDraft}
                className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 transition"
                title="放弃草稿"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div>
                <h4 className="font-bold text-zinc-100">{activeSession.sceneSnapshot.name}</h4>
                <p className="text-[10px] text-zinc-400">
                  与 {activeSession.characterName} · {new Date(activeSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={() => setActiveSession(activeSession)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1 transition shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-zinc-950" />
                继续进行
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: CREATE SCENE FLOW */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            {step === 1 ? (
              <OfflineAiSelector
                characters={characters}
                selectedCharacterId={selectedCharacter?.id || null}
                onSelectCharacter={(char) => setSelectedCharacter(char)}
                onNext={() => setStep(2)}
              />
            ) : (
              <SceneSelector
                onSelectScene={handleStartSession}
                onBack={() => setStep(1)}
              />
            )}
          </div>
        )}

        {/* TAB 2: HISTORY */}
        {activeTab === 'history' && (
          <OfflineHistory characters={characters} onShareToChat={onShareToChat} />
        )}
      </div>
    </div>
  );
};
