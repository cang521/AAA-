import React, { useState } from 'react';
import { AiCharacter, TheaterPreset } from '../../../types';
import { getRandomTheaterPreset, validateGenderCompatibility } from '../../../lib/theater/theaterEngine';
import { Sparkles, Shuffle, RefreshCw, X, ShieldAlert, ArrowRight, Compass } from 'lucide-react';

interface TheaterDrawModalProps {
  characters: AiCharacter[];
  userNickname: string;
  onClose: () => void;
  onStartSession: (character: AiCharacter, preset: TheaterPreset) => void;
}

export const TheaterDrawModal: React.FC<TheaterDrawModalProps> = ({
  characters,
  userNickname,
  onClose,
  onStartSession,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [drawnPreset, setDrawnPreset] = useState<TheaterPreset | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasRedrawn, setHasRedrawn] = useState<boolean>(false);
  const [genderNotice, setGenderNotice] = useState<string | null>(null);

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];

  const handleDraw = async () => {
    if (!activeCharacter) return;
    setIsDrawing(true);
    setGenderNotice(null);
    try {
      // Simulate shuffle animation delay
      await new Promise(r => setTimeout(r, 600));
      const preset = await getRandomTheaterPreset(activeCharacter);
      
      const isCompatible = validateGenderCompatibility(activeCharacter, preset);
      if (!isCompatible) {
        // Automatic compatible retry
        const retryPreset = await getRandomTheaterPreset(activeCharacter);
        setDrawnPreset(retryPreset);
        setGenderNotice(`已智能为您与「${activeCharacter.name}」适配了角色身份与宿命开局。`);
      } else {
        setDrawnPreset(preset);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDrawing(false);
    }
  };

  const handleRedraw = async () => {
    if (hasRedrawn) return;
    setHasRedrawn(true);
    await handleDraw();
  };

  const handleConfirmStart = () => {
    if (!drawnPreset || !activeCharacter) return;
    onStartSession(activeCharacter, drawnPreset);
  };

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-sky-100 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-sky-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-sky-50/40 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Shuffle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100">🎴 随机抽签剧场</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">从现有70条剧场预设中随机抽取一段关系与开局</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Step 1: Select AI Partner */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-2 uppercase tracking-wider">
              1. 选择同游 AI 伙伴
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {characters.map(c => {
                const isSelected = c.id === selectedCharId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCharId(c.id);
                      setDrawnPreset(null);
                      setGenderNotice(null);
                      setHasRedrawn(false);
                    }}
                    className={`flex flex-col items-center p-3 rounded-2xl border transition text-center ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 shadow-sm font-bold'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-sky-200 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover mb-1.5 shadow-sm" />
                    <span className="text-xs truncate w-full">{c.name}</span>
                    <span className="text-[10px] text-slate-400">({c.gender || '未知'})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Draw Trigger or Result */}
          {!drawnPreset ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-sky-50 dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 flex items-center justify-center text-sky-500 shadow-inner">
                <Shuffle className={`w-10 h-10 ${isDrawing ? 'animate-spin' : ''}`} />
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                点击摇签，系统将从70条深度剧本中抽取最契合你与 {activeCharacter?.name} 的命运开局。
              </p>
              <button
                onClick={handleDraw}
                disabled={isDrawing || !activeCharacter}
                className="px-8 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition flex items-center gap-2 mx-auto"
              >
                {isDrawing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isDrawing ? '正在抽取宿命之签...' : '开始抽取签池'}
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-5 rounded-3xl bg-sky-50/50 dark:bg-zinc-900 border border-sky-200 dark:border-zinc-800 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-sky-500 text-white text-[10px] font-extrabold tracking-wider font-mono">
                    #{drawnPreset.index || '01'} 命运之签
                  </span>
                  <span className="text-xs text-slate-400">{drawnPreset.tags?.join(' · ')}</span>
                </div>

                <h3 className="text-lg font-extrabold text-slate-800 dark:text-zinc-100">
                  {drawnPreset.title}
                </h3>

                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {drawnPreset.summary}
                </p>

                <div className="p-3 rounded-2xl bg-white dark:bg-zinc-950 border border-sky-100 dark:border-zinc-800 space-y-1.5 text-xs">
                  <div className="text-slate-400 flex items-center gap-1 text-[11px] font-medium">
                    <Compass className="w-3.5 h-3.5 text-sky-500" /> 世界设定与场景
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                    {drawnPreset.worldBackground}
                  </p>
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-zinc-900">
                    初始地点：{drawnPreset.initialLocation} · {drawnPreset.initialTime}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
                    <span className="text-slate-400 text-[10px] font-bold block mb-0.5">你的角色：</span>
                    <span className="text-slate-700 dark:text-zinc-200 font-medium">{drawnPreset.userRole.identity}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
                    <span className="text-slate-400 text-[10px] font-bold block mb-0.5">{activeCharacter.name} 角色：</span>
                    <span className="text-slate-700 dark:text-zinc-200 font-medium">{drawnPreset.aiRole.identity}</span>
                  </div>
                </div>

                {genderNotice && (
                  <div className="p-2.5 rounded-xl bg-sky-100/60 dark:bg-sky-950/40 text-[11px] text-sky-800 dark:text-sky-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>{genderNotice}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleRedraw}
                  disabled={hasRedrawn || isDrawing}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-sky-300 text-xs font-bold text-slate-600 dark:text-zinc-300 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDrawing ? 'animate-spin' : ''}`} />
                  {hasRedrawn ? '仅限重抽一次' : '不满意，重抽一次'}
                </button>
                <button
                  onClick={handleConfirmStart}
                  className="flex-1 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-md shadow-sky-500/20 transition flex items-center justify-center gap-1.5"
                >
                  确认以此开局 <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
