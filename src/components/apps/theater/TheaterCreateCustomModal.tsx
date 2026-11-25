import React, { useState, useEffect } from 'react';
import { AiCharacter, TheaterPreset } from '../../../types';
import { loadCustomPresetsFromDb, saveCustomPresetToDb, deleteCustomPresetFromDb } from '../../../lib/theater/theaterDb';
import { BookPlus, Users, Sparkles, X, Plus, Trash2, ArrowRight, Compass } from 'lucide-react';

interface TheaterCreateCustomModalProps {
  characters: AiCharacter[];
  userNickname: string;
  onClose: () => void;
  onStartSession: (character: AiCharacter, preset: TheaterPreset) => void;
}

export const TheaterCreateCustomModal: React.FC<TheaterCreateCustomModalProps> = ({
  characters,
  userNickname,
  onClose,
  onStartSession,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [existingCustom, setExistingCustom] = useState<TheaterPreset[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

  // Form Fields
  const [title, setTitle] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [worldBackground, setWorldBackground] = useState<string>('');
  const [userRoleIdentity, setUserRoleIdentity] = useState<string>('');
  const [userSecret, setUserSecret] = useState<string>('');
  const [aiRoleIdentity, setAiRoleIdentity] = useState<string>('');
  const [aiSecret, setAiSecret] = useState<string>('');
  const [aiGender, setAiGender] = useState<'female' | 'male' | 'any'>('any');
  const [initialScene, setInitialScene] = useState<string>('');
  const [initialTime, setInitialTime] = useState<string>('黄昏');
  const [initialLocation, setInitialLocation] = useState<string>('静谧走廊');
  const [tagsInput, setTagsInput] = useState<string>('原创, 专属');

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];

  useEffect(() => {
    loadCustomPresetsFromDb().then(setExistingCustom);
  }, []);

  const handleCreateAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !worldBackground.trim() || !activeCharacter) return;

    const tags = tagsInput
      .split(/[,，]/)
      .map(t => t.trim())
      .filter(Boolean);

    const newPreset: TheaterPreset = {
      id: 'custom_' + Date.now(),
      index: 100 + existingCustom.length + 1,
      title: title.trim(),
      summary: summary.trim() || worldBackground.slice(0, 60) + '...',
      userRole: {
        name: userNickname,
        identity: userRoleIdentity.trim() || '自定义角色',
        gender: 'any',
        secretTemplate: userSecret.trim() || '怀揣着只有自己知晓的隐秘真相。',
        roleType: 'both',
      },
      aiRole: {
        identity: aiRoleIdentity.trim() || '神秘同行者',
        gender: aiGender === 'any' ? (activeCharacter.gender === 'female' ? 'female' : 'male') : aiGender,
        secretTemplate: aiSecret.trim() || '在本次剧场中抱有不可告人的初衷。',
        roleType: 'both',
      },
      worldBackground: worldBackground.trim(),
      initialScene: initialScene.trim() || '静谧的空气中，两人在此处相遇。',
      initialTime: initialTime.trim() || '黄昏',
      initialLocation: initialLocation.trim() || '初会之地',
      tags: tags.length > 0 ? tags : ['自定义'],
      isCustom: true,
    };

    await saveCustomPresetToDb(newPreset);
    onStartSession(activeCharacter, newPreset);
  };

  const handleDeleteCustom = async (presetId: string) => {
    await deleteCustomPresetFromDb(presetId);
    setExistingCustom(prev => prev.filter(p => p.id !== presetId));
  };

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-sky-100 dark:border-zinc-800 overflow-hidden flex flex-col h-[88vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-sky-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-sky-50/40 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <BookPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100">✍️ 自定义剧场</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">设定专属双人关系、世界背景与开局秘密</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 flex gap-4 border-b border-sky-100 dark:border-zinc-800 shrink-0 text-xs font-bold">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 transition border-b-2 ${
              activeTab === 'create'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            创建新剧场
          </button>
          {existingCustom.length > 0 && (
            <button
              onClick={() => setActiveTab('manage')}
              className={`pb-2.5 transition border-b-2 ${
                activeTab === 'manage'
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              已有自定义剧场 ({existingCustom.length})
            </button>
          )}
        </div>

        {/* Form Body */}
        {activeTab === 'create' ? (
          <form onSubmit={handleCreateAndStart} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            
            {/* AI Partner Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-500" /> 选择共同参演的 AI 角色
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {characters.map(c => {
                  const isSelected = c.id === selectedCharId;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setSelectedCharId(c.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition shrink-0 ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 font-bold'
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      <img src={c.avatar} alt={c.name} className="w-6 h-6 rounded-full object-cover" />
                      <span className="text-xs">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title & Summary */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  剧场标题 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：长夜尽头、深渊对决、旧友重逢..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  一句话概述 / 剧情简介
                </label>
                <input
                  type="text"
                  placeholder="简述剧情核心冲突或相处氛围..."
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                />
              </div>
            </div>

            {/* Dual Identity & Secrets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-sky-50/40 dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 space-y-2">
                <span className="text-xs font-bold text-sky-700 dark:text-sky-400 block">你的角色设定</span>
                <input
                  type="text"
                  placeholder="你的身份（如：落魄剑客、卧底警察）"
                  value={userRoleIdentity}
                  onChange={e => setUserRoleIdentity(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-sky-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                />
                <textarea
                  rows={2}
                  placeholder="你的秘密/真实目的（如：其实是为了替师门复仇）"
                  value={userSecret}
                  onChange={e => setUserSecret(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-sky-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs resize-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-sky-50/40 dark:bg-zinc-900 border border-sky-100 dark:border-zinc-800 space-y-2">
                <span className="text-xs font-bold text-sky-700 dark:text-sky-400 block">{activeCharacter?.name} 角色设定</span>
                <input
                  type="text"
                  placeholder="AI的身份（如：魔教圣女、冷面法医）"
                  value={aiRoleIdentity}
                  onChange={e => setAiRoleIdentity(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-sky-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
                />
                <textarea
                  rows={2}
                  placeholder="AI的隐秘目的或心防（模型会据此进行双盲推演）"
                  value={aiSecret}
                  onChange={e => setAiSecret(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-sky-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs resize-none"
                />
              </div>
            </div>

            {/* World Background & Initial Scene */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  世界背景与法则设定 *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="详细描述故事所处的世界、时代、社会规则或重大危机..."
                  value={worldBackground}
                  onChange={e => setWorldBackground(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  开场场景与环境描写
                </label>
                <textarea
                  rows={2}
                  placeholder="开局时的天气、声光与两人所处的场景..."
                  value={initialScene}
                  onChange={e => setInitialScene(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                />
              </div>
            </div>

            {/* Time, Location & Tags */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">初始时间</label>
                <input
                  type="text"
                  value={initialTime}
                  onChange={e => setInitialTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">初始地点</label>
                <input
                  type="text"
                  value={initialLocation}
                  onChange={e => setInitialLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-xs"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">标签</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-100 dark:border-zinc-800 bg-sky-50/20 dark:bg-zinc-900 text-xs"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-3 border-t border-sky-100 dark:border-zinc-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !worldBackground.trim()}
                className="px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-sky-500/20 flex items-center gap-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5" /> 保存并开始剧场
              </button>
            </div>

          </form>
        ) : (
          /* Manage existing custom presets */
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
            {existingCustom.map(preset => (
              <div
                key={preset.id}
                className="p-4 rounded-2xl border border-sky-100 dark:border-zinc-800 bg-sky-50/30 dark:bg-zinc-900/60 flex items-center justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 truncate">{preset.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{preset.summary}</p>
                  <div className="text-[11px] text-slate-400">
                    你：{preset.userRole.identity} · AI：{preset.aiRole.identity}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onStartSession(activeCharacter, preset)}
                    className="px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-bold hover:bg-sky-600 transition flex items-center gap-1"
                  >
                    开始 <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCustom(preset.id)}
                    className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};
