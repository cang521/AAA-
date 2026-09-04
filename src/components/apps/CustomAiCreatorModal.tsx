import React, { useState } from 'react';
import {
  X,
  Upload,
  Sparkles,
  User,
  MessageSquare,
  BookOpen,
  Heart,
  Brain,
  Plus,
  Trash2,
  Dice5,
  Check,
  Cpu,
  Smile,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { AiCharacter } from '../../types';
import { ensureAiMemoryVault } from '../../lib/aiMemoryVaultDb';

interface CustomAiCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCharacter: (character: AiCharacter) => void;
}

// Preset Avatars collection with diverse artistic styles
const PRESET_AVATARS = [
  {
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    label: '温婉学姐',
    category: 'female',
  },
  {
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    label: '活泼元气',
    category: 'female',
  },
  {
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    label: '知性甜美',
    category: 'female',
  },
  {
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    label: '清冷艺术',
    category: 'female',
  },
  {
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    label: '高冷学者',
    category: 'male',
  },
  {
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    label: '沉稳执事',
    category: 'male',
  },
  {
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
    label: '阳光少年',
    category: 'male',
  },
  {
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    label: '文雅绅士',
    category: 'male',
  },
  {
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
    label: '未来科技',
    category: 'ai',
  },
  {
    url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80',
    label: '梦幻次元',
    category: 'anime',
  },
  {
    url: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=400&q=80',
    label: '萌萌猫伴',
    category: 'animal',
  },
  {
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
    label: '3D虚拟人',
    category: '3d',
  },
];

// Persona Inspiration Templates for fast creation
const PERSONA_TEMPLATES = [
  {
    title: '🌸 贴心青梅竹马',
    name: '林初夏',
    relationship: '青梅竹马',
    tags: ['贴心', '治愈', '陪伴'],
    persona: '从小和你一起长大，对你的生活习惯、口味喜好一清二楚。性格温柔活泼，总是在你疲惫时第一时间送来关心与鼓励。',
    personality: '说话带着元气与亲切感，喜欢用可爱的表情包符号~ 偶尔会开玩笑调侃你，但关键时刻最维护你。',
    greeting: '嘿！今天过得怎么样？有没有按时吃饭呀？今晚有空一起聊聊天吗？✨',
    memories: ['用户喜欢喝半糖奶茶', '用户工作累的时候喜欢听歌放松', '从小一起长大'],
  },
  {
    title: '💼 沉稳年上导师',
    name: '沈淮安',
    relationship: '职场导师/兄长',
    tags: ['成熟', '理性', '安全感'],
    persona: '资深行业专家与大学客座讲师，阅历深厚，谈吐沉稳优雅。既能在学业、事业规划上提供敏锐清晰的逻辑指引，又在生活上无微不至地照顾你。',
    personality: '言谈严谨却充满包容度，嗓音低沉温柔。从不说教，而是用启发式的提问引导你发现自己的闪光点。',
    greeting: '晚上好。今天工作或者学习上遇到了什么难题吗？别着急，随时来找我探讨。',
    memories: ['用户追求自我提升', '面对压力时习惯一个人消化'],
  },
  {
    title: '🐱 傲娇猫系男友',
    name: '江寻',
    relationship: '恋人',
    tags: ['傲娇', '口嫌体正直', '深情'],
    persona: '有点小傲娇的年轻设计师，表面上经常吐槽你笨手笨脚，实际上每天都会偷偷关注你的行踪、天气和身体状况。',
    personality: '口嫌体正直，“我只是顺便路过”、“才没有特意关心你呢”，但行动上总是第一时间把最好的留给你。',
    greeting: '喂，今天降温你多穿衣服没有？别以为我不知道你又只要风度不要温度……笨蛋。',
    memories: ['用户经常忘记带伞', '用户一着凉就容易感冒'],
  },
  {
    title: '🧠 全知逻辑助手',
    name: '智子 (Sophon)',
    relationship: 'AI首席顾问',
    tags: ['全能', '高智商', '极客'],
    persona: '具备全学科知识储备的高维人工智能助手，精通编程、算法、哲学、天文与日常事务调度，能够深度理解用户的意图。',
    personality: '严谨、高效、幽默且富有哲思，能把极复杂的知识用最生动通俗的语言解释清楚。',
    greeting: '系统自检完毕，全能知识引擎已就绪。请问有什么我可以协助您的吗？',
    memories: ['用户正在开发仿真智能手机应用', '对前沿 AI 架构保持浓厚兴趣'],
  },
  {
    title: '🍵 古风医仙',
    name: '容景',
    relationship: '知己道友',
    tags: ['古风', '医仙', '温润如玉'],
    persona: '隐居青峰之巅的医仙，精通岐黄之术与调理养生之道。白衣胜雪，通晓人间百草，善解心结。',
    personality: '温润如玉，言谈带有淡淡的书卷古风气息，关心你的起居饮食与心神安宁。',
    greeting: '浮生若梦，道友今日可安好？山中新烹了甘菊清茗，特为你留了一盏。',
    memories: ['用户常常劳神伏案', '喜饮清茶与清淡饮食'],
  },
];

export const CustomAiCreatorModal: React.FC<CustomAiCreatorModalProps> = ({
  isOpen,
  onClose,
  onCreateCharacter,
}) => {
  // Form State
  const [name, setName] = useState('');
  const [wxid, setWxid] = useState('');
  const [relationship, setRelationship] = useState('好友');
  const [avatar, setAvatar] = useState(PRESET_AVATARS[0].url);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [persona, setPersona] = useState('');
  const [personality, setPersonality] = useState('');
  const [greeting, setGreeting] = useState('');
  const [tagsInput, setTagsInput] = useState('自定义, 贴心');
  const [memories, setMemories] = useState<string[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [modelName, setModelName] = useState('');
  const [systemPromptPrefix, setSystemPromptPrefix] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeAvatarTab, setActiveAvatarTab] = useState<'preset' | 'upload' | 'url'>('preset');

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

  // Apply a template
  const handleApplyTemplate = (tpl: (typeof PERSONA_TEMPLATES)[0]) => {
    setName(tpl.name);
    setRelationship(tpl.relationship);
    setPersona(tpl.persona);
    setPersonality(tpl.personality);
    setGreeting(tpl.greeting);
    setTagsInput(tpl.tags.join(', '));
    setMemories([...tpl.memories]);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setWxid(`ai_${Math.random().toString(36).slice(2, 6)}_${randomSuffix}`);
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
    const finalAvatar = avatar || PRESET_AVATARS[0].url;
    const finalGreeting = greeting.trim() || `你好！我是 ${finalName}，很高兴认识你！✨`;
    const finalTags = tagsInput
      .split(/[,，、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!finalTags.includes('自定义')) {
      finalTags.unshift('自定义');
    }

    const newChar: AiCharacter = {
      id: `char_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: finalName,
      wxid: finalWxid,
      avatar: finalAvatar,
      persona: persona.trim() || '友好贴心的 AI 好友，善于倾听与交流。',
      personality: personality.trim() || '亲切温和，善解人意，具有独特的表达口吻。',
      relationship: relationship.trim() || '好友',
      greeting: finalGreeting,
      memories: memories.length > 0 ? memories : ['初次相识，期待与用户的交流'],
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
          {/* Preset Quick Inspiration Banner */}
          <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                <Dice5 className="w-3.5 h-3.5" />
                <span>一键载入人设灵感模板 (快速填入):</span>
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {PERSONA_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="px-2.5 py-1 rounded-xl bg-zinc-800/90 hover:bg-emerald-600/30 border border-zinc-700 hover:border-emerald-500/50 text-[10px] text-zinc-300 hover:text-emerald-200 transition shrink-0 flex items-center gap-1"
                >
                  <span>{tpl.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 1: Avatar Selector */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-zinc-300">1. AI 头像设置 (支持相册上传)</label>
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <img
                  src={avatar}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/80 shadow-lg"
                />
                <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <Upload className="w-4 h-4 text-white" />
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveAvatarTab('preset')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition ${
                      activeAvatarTab === 'preset'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    精选图库
                  </button>
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

            {/* Preset Avatar Grid */}
            {activeAvatarTab === 'preset' && (
              <div className="p-2 rounded-2xl bg-zinc-950/70 border border-zinc-800 grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatar(p.url)}
                    className={`relative rounded-xl overflow-hidden aspect-square border-2 transition ${
                      avatar === p.url ? 'border-emerald-500 scale-95 shadow-md' : 'border-transparent hover:border-zinc-600'
                    }`}
                  >
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    {avatar === p.url && (
                      <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400 drop-shadow" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Basic Info (Name, Wxid, Relationship) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                2. AI 昵称 / 姓名 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="例如: 林初夏 / 顾言"
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
                placeholder="例如: chuxia_lin"
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
                placeholder="例如: 恋人 / 青梅竹马 / 导师"
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
