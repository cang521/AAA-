import React, { useState } from 'react';
import { AiCharacter, TheaterPreset } from '../../../types';
import { BUILTIN_THEATER_PRESETS } from '../../../lib/theater/theaterPresets';
import { validateGenderCompatibility } from '../../../lib/theater/theaterEngine';
import { Search, Sparkles, ShieldAlert, BookOpen, Users, Compass, ArrowRight, X } from 'lucide-react';

interface TheaterCustomSelectModalProps {
  characters: AiCharacter[];
  userNickname: string;
  onClose: () => void;
  onStartSession: (character: AiCharacter, preset: TheaterPreset) => void;
}

export const TheaterCustomSelectModal: React.FC<TheaterCustomSelectModalProps> = ({
  characters,
  userNickname,
  onClose,
  onStartSession,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const allPresets = BUILTIN_THEATER_PRESETS;
  const [selectedPreset, setSelectedPreset] = useState<TheaterPreset | null>(null);
  const [genderWarning, setGenderWarning] = useState<string | null>(null);

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];


  const filteredPresets = allPresets.filter(p => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchSummary = p.summary.toLowerCase().includes(q);
      const matchWorld = p.worldBackground.toLowerCase().includes(q);
      const matchUser = p.userRole?.identity?.toLowerCase().includes(q);
      const matchAi = p.aiRole?.identity?.toLowerCase().includes(q);
      const matchTags = (p.tags || []).some(t => t.toLowerCase().includes(q));
      return matchTitle || matchSummary || matchWorld || matchUser || matchAi || matchTags;
    }
    return true;
  });

  const handleSelectPreset = (preset: TheaterPreset) => {
    setSelectedPreset(preset);
    setGenderWarning(null);
    if (activeCharacter) {
      const isCompat = validateGenderCompatibility(activeCharacter, preset);
      if (!isCompat) {
        setGenderWarning(
          `提示：该剧场设定为「${preset.aiRole.gender === 'female' ? '女性' : '男性'}」AI，当前选择的「${activeCharacter.name}」(${activeCharacter.gender || '未知'})将通过智能适配双方角色展开剧情。`
        );
      }
    }
  };

  const handleConfirmStart = () => {
    if (!selectedPreset || !activeCharacter) return;
    onStartSession(activeCharacter, selectedPreset);
  };

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-4xl bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-sky-100 dark:border-zinc-800 overflow-hidden flex flex-col h-[88vh]">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-sky-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-sky-50/40 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100">🎭 自选关系剧场</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">从现有70条关系预设中自行挑选想体验的剧情</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Character Selector & Search Row */}
        <div className="p-4 sm:p-5 border-b border-sky-100 dark:border-zinc-800 space-y-4 shrink-0 bg-white dark:bg-zinc-950">
          {/* Character selection list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-500" /> 选择同游 AI 伙伴
              </label>
              <span className="text-[11px] text-slate-400">已选：{activeCharacter?.name}</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {characters.map(c => {
                const isSelected = c.id === selectedCharId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCharId(c.id);
                      setGenderWarning(null);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition shrink-0 ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-sky-200 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <img src={c.avatar} alt={c.name} className="w-7 h-7 rounded-full object-cover shadow-sm" />
                    <span className="text-xs">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="搜索预设编号、标题、身份、世界观或标签（例如：魔教、学霸、科幻、钢琴家）..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/30 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
        </div>

        {/* Content Body: Continuous 1-70 List + Detail Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Continuous List of 70 Presets */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 divide-y divide-transparent">
            <div className="text-[11px] font-medium text-slate-400 px-1 pb-1">
              共有 {filteredPresets.length} 个剧场预设（连续编号 1—70）
            </div>

            {filteredPresets.map(preset => {
              const isSelected = selectedPreset?.id === preset.id;
              const displayIndex = preset.index || (BUILTIN_THEATER_PRESETS.findIndex(p => p.id === preset.id) + 1);

              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 shadow-sm'
                      : 'border-slate-100 dark:border-zinc-800/80 hover:border-sky-200 bg-white dark:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-[11px] font-extrabold font-mono">
                        #{displayIndex}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate max-w-[260px] sm:max-w-md">
                        {preset.title}
                      </h4>
                    </div>
                    {preset.isCustom && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                        自定义
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                    {preset.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                      你：{preset.userRole.identity}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                      AI：{preset.aiRole.identity}
                    </span>
                    {(preset.tags || []).slice(0, 3).map((tag, i) => (
                      <span key={i} className="text-sky-600 dark:text-sky-400">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Preset Inspector (Desktop) or Preview Bar */}
          {selectedPreset && (
            <div className="w-80 sm:w-96 border-l border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-950 p-5 flex flex-col justify-between overflow-y-auto shrink-0">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-bold font-mono text-sky-600 dark:text-sky-400">
                    PRESET #{selectedPreset.index || '01'}
                  </span>
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-zinc-100 mt-1">
                    {selectedPreset.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed">
                    {selectedPreset.summary}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="font-bold text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-sky-500" /> 世界背景与场景
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                    {selectedPreset.worldBackground}
                  </p>
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-zinc-800">
                    初始地点：{selectedPreset.initialLocation} · {selectedPreset.initialTime}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                    <span className="text-slate-400 font-bold block mb-0.5">你的角色：</span>
                    <span className="text-slate-800 dark:text-zinc-200">{selectedPreset.userRole.identity}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                    <span className="text-slate-400 font-bold block mb-0.5">{activeCharacter.name} 角色：</span>
                    <span className="text-slate-800 dark:text-zinc-200">{selectedPreset.aiRole.identity}</span>
                  </div>
                </div>

                {genderWarning && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-relaxed">{genderWarning}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-sky-100 dark:border-zinc-800">
                <button
                  onClick={handleConfirmStart}
                  className="w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-md shadow-sky-500/20 transition flex items-center justify-center gap-2"
                >
                  与 {activeCharacter.name} 开始剧场 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

