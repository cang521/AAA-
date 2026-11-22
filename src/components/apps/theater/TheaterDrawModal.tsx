import React, { useState } from 'react';
import { AiCharacter, TheaterPreset } from '../../../types';
import { THEATER_CATEGORIES } from '../../../lib/theater/theaterPresets';
import { getRandomTheaterPreset, validateGenderCompatibility } from '../../../lib/theater/theaterEngine';
import { Sparkles, Shuffle, Check, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';

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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [worldFilter, setWorldFilter] = useState<string>('all');
  const [drawnPreset, setDrawnPreset] = useState<TheaterPreset | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasRedrawn, setHasRedrawn] = useState<boolean>(false);
  const [genderError, setGenderError] = useState<string | null>(null);

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];

  const handleDraw = async () => {
    if (!activeCharacter) return;
    setIsDrawing(true);
    setGenderError(null);
    try {
      // Simulate shuffle animation delay
      await new Promise(r => setTimeout(r, 600));
      const preset = await getRandomTheaterPreset(selectedCategory, worldFilter);
      
      // Check strict gender compatibility
      const isCompatible = validateGenderCompatibility(activeCharacter, preset);
      if (!isCompatible) {
        setGenderError(`当前AI角色「${activeCharacter.name}」的性别与该剧场AI角色要求(${preset.aiRole.gender})不符，已为您重新抽取兼容的剧场！`);
        // Try one more time with compatible filter or pick another
        const retryPreset = await getRandomTheaterPreset(selectedCategory, worldFilter);
        setDrawnPreset(retryPreset);
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

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">🎴 随机抽签剧场</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">抽取命运之签，开启双人沉浸式冒险</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Step 1: Select AI Partner */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">
              1. 选择同游 AI 伙伴
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {characters.map(c => {
                const isSelected = c.id === selectedCharId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCharId(c.id)}
                    className={`flex flex-col items-center p-3 rounded-2xl border transition text-center ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-300 shadow-sm'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover mb-1.5 shadow" />
                    <span className="text-xs font-medium truncate w-full">{c.name}</span>
                    <span className="text-[10px] text-zinc-400">({c.gender || '未知'})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Category Filter */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">
              2. 过滤签池类型
            </label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="all">✨ 全部分类（156+ 预设随机混合）</option>
              {THEATER_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.id}. {cat.name} — {cat.description}
                </option>
              ))}
            </select>
          </div>

          {genderError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{genderError}</span>
            </div>
          )}

          {/* Drawn Preset Card Result */}
          {drawnPreset ? (
            <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent border border-amber-500/30 rounded-2xl p-5 space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  类别 {drawnPreset.category} · {drawnPreset.categoryName}
                </span>
                <span className="text-xs text-zinc-400">
                  AI: {activeCharacter?.name} ({drawnPreset.aiRole.identity})
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">{drawnPreset.title}</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{drawnPreset.summary}</p>
              </div>

              <div className="p-3 bg-white/60 dark:bg-zinc-800/60 rounded-xl text-xs space-y-1.5 border border-zinc-200/50 dark:border-zinc-700/50">
                <div className="text-zinc-700 dark:text-zinc-300"><strong>世界观：</strong>{drawnPreset.worldBackground}</div>
                <div className="text-zinc-700 dark:text-zinc-300"><strong>开场场景：</strong>{drawnPreset.initialScene}</div>
                <div className="text-zinc-500 dark:text-zinc-400"><strong>你的角色：</strong>{userNickname} ({drawnPreset.userRole.identity})</div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {!hasRedrawn && (
                  <button
                    onClick={handleRedraw}
                    className="flex-1 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-sm flex items-center justify-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    <RefreshCw className="w-4 h-4" /> 免费重抽一次
                  </button>
                )}
                <button
                  onClick={() => activeCharacter && onStartSession(activeCharacter, drawnPreset)}
                  className="flex-2 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition"
                >
                  <Sparkles className="w-4 h-4" /> 接受此签，进入小剧场
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500 animate-pulse">
                <Shuffle className={`w-10 h-10 ${isDrawing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">签筒已备好，静待有缘人</h4>
                <p className="text-xs text-zinc-500">点击下方按钮抽取专属于你与 {activeCharacter?.name} 的沉浸式剧场</p>
              </div>
              <button
                onClick={handleDraw}
                disabled={isDrawing || !activeCharacter}
                className="px-8 py-3.5 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-xl shadow-amber-500/25 hover:bg-amber-600 transition flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" /> {isDrawing ? '正在摇签中...' : '🎴 摇一签'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
