import React, { useState, useEffect } from 'react';
import { AiCharacter, TheaterPreset } from '../../../types';
import { THEATER_CATEGORIES, BUILTIN_THEATER_PRESETS } from '../../../lib/theater/theaterPresets';
import { loadCustomPresetsFromDb, saveCustomPresetToDb } from '../../../lib/theater/theaterDb';
import { validateGenderCompatibility } from '../../../lib/theater/theaterEngine';
import { Search, Bookmark, Plus, Sparkles, ShieldAlert, BookOpen, Check } from 'lucide-react';

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
  const [activeCategory, setActiveCategory] = useState<string>('A');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customPresets, setCustomPresets] = useState<TheaterPreset[]>([]);
  const [allPresets, setAllPresets] = useState<TheaterPreset[]>(BUILTIN_THEATER_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState<TheaterPreset | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);

  // Custom preset creation state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSummary, setNewSummary] = useState<string>('');
  const [newWorld, setNewWorld] = useState<string>('');
  const [newScene, setNewScene] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('D');

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];

  useEffect(() => {
    loadCustomPresetsFromDb().then(custom => {
      setCustomPresets(custom);
      setAllPresets([...BUILTIN_THEATER_PRESETS, ...custom]);
    });
  }, []);

  const handleCreateCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newWorld.trim()) return;

    const catObj = THEATER_CATEGORIES.find(c => c.id === newCategory) || THEATER_CATEGORIES[3];
    const newPreset: TheaterPreset = {
      id: 'custom_preset_' + Date.now(),
      category: newCategory,
      categoryName: catObj.name,
      title: newTitle.trim(),
      summary: newSummary.trim() || '自定义专属剧场背景。',
      userRole: {
        name: userNickname,
        identity: '玩家自定义角色',
        gender: 'any',
        secretTemplate: '你怀揣着一个不为人知的秘密。',
      },
      aiRole: {
        identity: 'AI定制角色身份',
        gender: activeCharacter?.gender === 'female' ? 'female' : 'male',
        secretTemplate: 'AI在故事中有着隐藏的动机。',
      },
      worldBackground: newWorld.trim(),
      initialScene: newScene.trim() || '故事在一个神秘的地点拉开序幕。',
      initialTime: '午后',
      initialLocation: '定制场景',
      tags: ['自定义', catObj.name],
      isCustom: true,
    };

    await saveCustomPresetToDb(newPreset);
    const updatedCustom = [...customPresets, newPreset];
    setCustomPresets(updatedCustom);
    setAllPresets([...BUILTIN_THEATER_PRESETS, ...updatedCustom]);
    setSelectedPreset(newPreset);
    setShowCreateModal(false);
    setNewTitle('');
    setNewSummary('');
    setNewWorld('');
    setNewScene('');
  };

  const filteredPresets = allPresets.filter(p => {
    if (activeCategory !== 'custom' && p.category !== activeCategory) return false;
    if (activeCategory === 'custom' && !p.isCustom) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || p.worldBackground.toLowerCase().includes(q);
    }
    return true;
  });

  const handleStart = (preset: TheaterPreset) => {
    if (!activeCharacter) return;
    const isCompatible = validateGenderCompatibility(activeCharacter, preset);
    if (!isCompatible) {
      setGenderError(`当前AI角色「${activeCharacter.name}」的性别与该剧场要求不符（要求AI性别：${preset.aiRole.gender}）。建议更换AI伙伴或选择其他剧场。`);
      return;
    }
    onStartSession(activeCharacter, preset);
  };

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-3xl bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">🎭 自选关系剧场</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">13大分类，156+ 预设世界任君挑选，或创建专属剧本</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1.5 shadow transition"
            >
              <Plus className="w-4 h-4" /> 自定义剧本
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* AI Selector & Search bar */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 shrink-0 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-zinc-500 shrink-0">当前伙伴:</span>
            {characters.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCharId(c.id); setGenderError(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 transition ${
                  c.id === selectedCharId
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <img src={c.avatar} alt={c.name} className="w-4 h-4 rounded-full object-cover" />
                {c.name}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索剧场标题、世界观..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {genderError && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 shrink-0">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{genderError}</span>
          </div>
        )}

        {/* Main Body: Categories Sidebar + Preset List */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Categories Sidebar (A-M) */}
          <div className="w-48 sm:w-56 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-3 space-y-1 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30">
            <button
              onClick={() => setActiveCategory('custom')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                activeCategory === 'custom'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
              }`}
            >
              <span>⭐ 我的自定义</span>
              <span className="text-[10px] opacity-80">({customPresets.length})</span>
            </button>

            <div className="pt-2 pb-1 px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              13大剧情分类 (A-M)
            </div>

            {THEATER_CATEGORIES.map(cat => {
              const count = allPresets.filter(p => p.category === cat.id).length;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                    isActive
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{cat.id}. {cat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Preset Cards List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredPresets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <BookOpen className="w-12 h-12 mb-2 opacity-40" />
                <p className="text-sm">没有找到匹配的剧场预设</p>
                <p className="text-xs mt-1">试试切换分类或搜索其他关键词</p>
              </div>
            ) : (
              filteredPresets.map(preset => {
                const isSelected = selectedPreset?.id === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30 shadow-md'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                            {preset.categoryName}
                          </span>
                          {preset.isCustom && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                              自定义
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{preset.title}</h3>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStart(preset); }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow transition shrink-0 flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> 开始游戏
                      </button>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mb-2">{preset.summary}</p>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                      <span>世界: {preset.worldBackground.slice(0, 30)}...</span>
                      <span>• AI角色要求: {preset.aiRole.identity} ({preset.aiRole.gender})</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>

      {/* Create Custom Preset Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">✨ 创建自定义剧场预设</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleCreateCustomPreset} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">剧场分类</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  {THEATER_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.id}. {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">剧场标题</label>
                <input
                  type="text"
                  placeholder="例如：深夜图书馆的秘密契约"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">剧情梗概</label>
                <input
                  type="text"
                  placeholder="简述两人的核心冲突与开场情境..."
                  value={newSummary}
                  onChange={e => setNewSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">世界观背景设定</label>
                <textarea
                  placeholder="详细描述时代法则、社会背景、特殊规则..."
                  value={newWorld}
                  onChange={e => setNewWorld(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">初始开场场景描写</label>
                <textarea
                  placeholder="例如：深夜古旧的阅览室里，烛火昏黄..."
                  value={newScene}
                  onChange={e => setNewScene(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-xs text-white font-bold shadow"
                >
                  保存并使用
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
