import React, { useState } from 'react';
import {
  X,
  Upload,
  Sparkles,
  User,
  Plus,
  Trash2,
  Check,
  Smile,
  ImageIcon,
  MessageSquare,
  Brain,
  Cpu,
} from 'lucide-react';
import { AiCharacter } from '../../types';
import { ensureAiMemoryVault } from '../../lib/aiMemoryVaultDb';
import { DEFAULT_AI_AVATAR } from '../../lib/storage';

interface CustomAiCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCharacter: (character: AiCharacter) => void;
}

export const CustomAiCreatorModal: React.FC<CustomAiCreatorModalProps> = ({
  isOpen,
  onClose,
  onCreateCharacter,
}) => {
  // Form State
  const [name, setName] = useState('');
  const [wxid, setWxid] = useState('');
  const [relationship, setRelationship] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_AI_AVATAR);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [persona, setPersona] = useState('');
  const [personality, setPersonality] = useState('');
  const [greeting, setGreeting] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [memories, setMemories] = useState<string[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [modelName, setModelName] = useState('');
  const [systemPromptPrefix, setSystemPromptPrefix] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeAvatarTab, setActiveAvatarTab] = useState<'upload' | 'url'>('upload');

  if (!isOpen) return null;

  // Handle local photo file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate random wxid based on name
  const handleGenerateWxid = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const cleanPrefix = name.trim()
      ? name.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '') || 'ai_friend'
      : 'ai_char';
    setWxid(`${cleanPrefix}_${randomSuffix}`);
  };

  // Add memory entry
  const handleAddMemory = () => {
    if (newMemory.trim()) {
      setMemories([...memories, newMemory.trim()]);
      setNewMemory('');
    }
  };

  // Delete memory entry
  const handleDeleteMemory = (index: number) => {
    setMemories(memories.filter((_, i) => i !== index));
  };

  // Handle final submission
  const handleSave = () => {
    const finalName = name.trim() || '自定义 AI';
    const finalWxid = wxid.trim() || `ai_${Date.now().toString().slice(-6)}`;
    const finalAvatar = avatar || DEFAULT_AI_AVATAR;
    const finalGreeting = greeting.trim();
    const finalTags = tagsInput
      .split(/[,，、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const newChar: AiCharacter = {
      id: `char_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: finalName,
      wxid: finalWxid,
      avatar: finalAvatar,
      persona: persona.trim(),
      personality: personality.trim(),
      relationship: relationship.trim() || '好友',
      greeting: finalGreeting,
      memories: memories,
      isLocked: false,
      tags: finalTags,
      createdAt: Date.now(),
      isCustom: true,
      modelConfig:
        modelName.trim() || systemPromptPrefix.trim()
          ? {
              modelName: modelName.trim() || undefined,
              systemPromptPrefix: systemPromptPrefix.trim() || undefined,
            }
          : undefined,
    };

    // Automatically initialize isolated local memory vault for this new AI
    ensureAiMemoryVault(newChar.id, newChar.name).catch((err) => {
      console.warn('Failed to ensure memory vault on character creation:', err);
    });

    onCreateCharacter(newChar);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
      <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-750 text-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">创建自定义 AI 好友</h3>
              <p className="text-[10px] text-zinc-400">设定人设、性格、记忆与头像，打造专属 AI 角色</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Section 1: Avatar Selector */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-zinc-300">1. AI 头像设置 (支持相册上传与 URL)</label>
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <img
                  src={avatar}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/80 shadow-lg"
                />
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex gap-1.5">
                  <label
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                      activeAvatarTab === 'upload'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    <span>相册上传</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        setActiveAvatarTab('upload');
                        handleFileUpload(e);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveAvatarTab('url')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition ${
                      activeAvatarTab === 'url'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    输入 URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatar(DEFAULT_AI_AVATAR);
                      setCustomAvatarUrl('');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                  >
                    默认图标
                  </button>
                </div>

                {activeAvatarTab === 'url' && (
                  <input
                    type="text"
                    placeholder="https://..."
                    value={customAvatarUrl}
                    onChange={(e) => {
                      setCustomAvatarUrl(e.target.value);
                      if (e.target.value.trim()) setAvatar(e.target.value.trim());
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-[11px] placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Basic Info (Name, Wxid, Relationship) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                2. AI 昵称 / 姓名 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="输入 AI 昵称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-300">微信号 (wxid)</label>
                <button
                  type="button"
                  onClick={handleGenerateWxid}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  随机生成
                </button>
              </div>
              <input
                type="text"
                placeholder="输入微信号"
                value={wxid}
                onChange={(e) => setWxid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs font-mono"
              />
            </div>
          </div>

          {/* Relationship & Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">与用户的关系</label>
              <input
                type="text"
                placeholder="例如: 好友 / 导师 / 伙伴"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">分类标签 (逗号分隔)</label>
              <input
                type="text"
                placeholder="例如: 自定义, 治愈, 学霸"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>
          </div>

          {/* Section 3: AI Persona (Background, Identity, Story) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. AI 人设与背景经历 (System Persona)</span>
              </label>
              <span className="text-[10px] text-zinc-500">{persona.length} 字</span>
            </div>
            <textarea
              rows={3}
              placeholder="自由输入身份、经历、家庭背景、社会关系、过往经历以及与用户的故事背景……支持较长设定内容。"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs placeholder-zinc-500"
            />
          </div>

          {/* Section 4: AI Personality (Tone, Habits, Speech style) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                <span>4. 性格特征与说话口吻风格 (Personality & Tone)</span>
              </label>
              <span className="text-[10px] text-zinc-500">{personality.length} 字</span>
            </div>
            <textarea
              rows={3}
              placeholder="描述性格（傲娇/温柔/冷静/活泼）、说话语气习惯（爱用波浪号~、口头禅、严肃理性）、喜好与禁忌等……"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 leading-relaxed text-xs placeholder-zinc-500"
            />
          </div>

          {/* Section 5: Opening Greeting */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-300 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
              <span>5. 开场白 / 打招呼消息 (首条微信消息)</span>
            </label>
            <input
              type="text"
              placeholder="例如: 嗨！今天过得怎么样？有按时吃晚餐吗？✨"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          {/* Section 6: Initial Long-Term Memories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                <span>6. 初始长期记忆库 ({memories.length})</span>
              </label>
              <span className="text-[10px] text-zinc-500">聊天时 AI 会通过 RAG 智能提取记忆</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="添加初始记忆（如: 用户喜欢在深夜看书）..."
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemory();
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddMemory}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </div>

            {memories.length > 0 && (
              <div className="space-y-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-zinc-950/60 border border-zinc-800">
                {memories.map((mem, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/80 text-[11px] border border-zinc-750"
                  >
                    <span className="truncate max-w-[85%] text-zinc-200">{mem}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(idx)}
                      className="text-rose-400 hover:text-rose-300 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Advanced Settings Accordion */}
          <div className="border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>高级模型与指令配置 (可选)</span>
              </span>
              <span>{showAdvanced ? '收起 ▲' : '展开 ▼'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5 animate-fadeIn">
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    指定专用模型 (留空则默认使用全局配置模型):
                  </label>
                  <input
                    type="text"
                    placeholder="如: gemini-3.6-flash / gpt-4o / deepseek-chat"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1">
                    System Prompt 绝对前置法则 (最高优先级指令):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="例如: 无论任何情况，都禁止跳脱出古代修仙者的角色设定。"
                    value={systemPromptPrefix}
                    onChange={(e) => setSystemPromptPrefix(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-indigo-400 leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Independent Local Memory Notice */}
        <div className="mx-4 mb-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300/90 flex items-center gap-2">
          <Brain className="w-4 h-4 text-emerald-400 shrink-0" />
          <span><b>独立本地记忆空间</b>：创建后将自动为其建立专属记忆文件夹，支持导入各类大型文件，离线保存且严格隔离。</span>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold shadow-md transition active:scale-95 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>完成创建并立即开聊</span>
          </button>
        </div>
      </div>
    </div>
  );
};
