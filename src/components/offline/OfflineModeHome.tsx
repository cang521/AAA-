import React, { useState, useEffect } from 'react';
import { ChevronLeft, Sparkles, Plus, History, Trash2, Play, AlertCircle } from 'lucide-react';
import { AiCharacter, UserProfile, ApiConfig, ChatMessage } from '../../types';
import { OfflineSession, getAllActiveSessions } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionService } from '../../lib/offline/OfflineSessionService';
import { formatOfflineFullDateTime } from '../../lib/offline/offlineTimeFormat';
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
  // Separates detected active sessions (for restoration banner) from currently open view
  const [openSession, setOpenSession] = useState<OfflineSession | null>(null);
  const [activeDrafts, setActiveDrafts] = useState<OfflineSession[]>([]);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Setup Flow States
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCharacter, setSelectedCharacter] = useState<AiCharacter | null>(null);

  useEffect(() => {
    if (initialCharacterId) {
      const found = characters.find((c) => c.id === initialCharacterId);
      if (found) {
        setSelectedCharacter(found);
      }
    } else if (characters.length > 0 && !selectedCharacter) {
      setSelectedCharacter(characters[0]);
    }
    void refreshActiveDrafts();
  }, [initialCharacterId, characters]);

  const refreshActiveDrafts = async () => {
    const drafts = await getAllActiveSessions();
    setActiveDrafts(drafts);
  };

  const handleStartSession = async (
    scene: { name: string; location: string; atmosphere: string; background: string; defaultOpening?: string },
    templateId?: string
  ) => {
    setErrorBanner(null);
    if (!selectedCharacter) {
      setErrorBanner('请先选择一个 AI 角色');
      return;
    }

    try {
      const { session } = await OfflineSessionService.startSession(selectedCharacter, scene, templateId);
      setOpenSession(session);
      void refreshActiveDrafts();
    } catch (e: any) {
      setErrorBanner(`启动线下模式失败：${e?.message || '未知错误'}`);
    }
  };

  const handleDiscardDraft = async (draft: OfflineSession) => {
    setErrorBanner(null);
    try {
      await OfflineSessionService.discardActiveSession(draft);
      setConfirmDiscardId(null);
      await refreshActiveDrafts();
    } catch (e: any) {
      setErrorBanner(`放弃草稿失败：${e?.message || '未知错误'}`);
    }
  };

  // Render Ongoing Offline Session View when user explicitly opens/starts a session
  if (openSession) {
    const sessionChar =
      characters.find((c) => c.id === openSession.characterId) || selectedCharacter || characters[0];
    return (
      <OfflineSessionView
        session={openSession}
        character={sessionChar}
        userProfile={userProfile}
        apiConfig={apiConfig}
        onBack={() => {
          setOpenSession(null);
          void refreshActiveDrafts();
        }}
        onSessionEndedAndSaved={() => {
          setOpenSession(null);
          setActiveTab('history');
          void refreshActiveDrafts();
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
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="font-bold text-sm text-zinc-100 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            线下模式
          </h3>
          <p className="text-[11px] text-zinc-400">与微信和长期记忆共处同一条时间线</p>
        </div>

        <div className="w-8" />
      </header>

      {/* Navigation Tabs */}
      <div className="px-4 pt-3 shrink-0">
        <div className="flex items-center p-1 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'create' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            发起线下剧情
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
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
        {errorBanner && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Active Session Restoration Banner(s) — cleanly reachable & interactive */}
        {activeDrafts.length > 0 && (
          <div className="space-y-2.5">
            {activeDrafts.map((draft) => (
              <div
                key={draft.id}
                className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    进行中的线下相处
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscardId(confirmDiscardId === draft.id ? null : draft.id)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                    title="放弃并结束草稿"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <h4 className="font-bold text-zinc-100 truncate">{draft.sceneSnapshot.name}</h4>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      与 {draft.characterName} · {formatOfflineFullDateTime(draft.startedAt)} 开始
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenSession(draft)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    继续相处
                  </button>
                </div>

                {confirmDiscardId === draft.id && (
                  <div className="pt-2 border-t border-amber-500/30 flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-300">确认放弃这段未结束记录？</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDiscardId(null)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDiscardDraft(draft)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                      >
                        确认放弃
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
              <SceneSelector onSelectScene={handleStartSession} onBack={() => setStep(1)} />
            )}
          </div>
        )}

        {/* TAB 2: HISTORY */}
        {activeTab === 'history' && (
          <OfflineHistory
            characters={characters}
            userProfile={userProfile}
            apiConfig={apiConfig}
            onShareToChat={onShareToChat}
            onUpdateCharacters={onUpdateCharacters}
          />
        )}
      </div>
    </div>
  );
};
