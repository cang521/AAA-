import React, { useState } from 'react';
import {
  WorldBook,
  WorldBookEntry,
  AiCharacter,
  ApiConfig,
  ApiLog,
} from '../../types';
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Search,
  Users,
  Check,
  X,
  FileText,
  Tag,
  Share2,
  Download,
  Upload,
  Layers,
  HelpCircle,
  Link,
  Unlink,
} from 'lucide-react';

interface WorldBookAppProps {
  onBackToLauncher: () => void;
  worldBooks: WorldBook[];
  characters: AiCharacter[];
  apiConfig?: ApiConfig;
  onUpdateWorldBooks: (books: WorldBook[]) => void;
  onAddApiLog: (log: ApiLog) => void;
}

export const WorldBookApp: React.FC<WorldBookAppProps> = ({
  onBackToLauncher,
  worldBooks = [],
  characters = [],
  apiConfig,
  onUpdateWorldBooks,
  onAddApiLog,
}) => {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingBook, setEditingBook] = useState<WorldBook | null>(null);
  const [showAssociateModal, setShowAssociateModal] = useState<WorldBook | null>(null);

  // Form states for creating/editing world book
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formWorldSetting, setFormWorldSetting] = useState('');
  const [formTags, setFormTags] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Form states for adding entry
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [entryKeyword, setEntryKeyword] = useState('');
  const [entryContent, setEntryContent] = useState('');

  const activeBook = worldBooks.find((b) => b.id === activeBookId) || null;

  // Filter books by search query
  const filteredBooks = worldBooks.filter(
    (b) =>
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // AI Architect Generate/Expand World Book
  const handleAiGenerate = async () => {
    setIsAiGenerating(true);
    try {
      const res = await fetch('/api/gemini/worldbook-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle || '新幻想世界',
          genre: formTags || '奇幻/科幻/都市',
          brief: formDescription || formWorldSetting || '自动构想一套宏大严谨的世界观法则',
          apiConfig,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setFormTitle(data.data.title || formTitle);
        setFormDescription(data.data.description || formDescription);
        setFormWorldSetting(data.data.worldSetting || formWorldSetting);
        if (data.data.tags && Array.isArray(data.data.tags)) {
          setFormTags(data.data.tags.join(', '));
        }
        if (data.apiLog) onAddApiLog(data.apiLog);
      }
    } catch (e) {
      console.error('AI WorldBook generation error', e);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Save or Create World Book
  const handleSaveBook = () => {
    if (!formTitle.trim()) {
      alert('请输入世界书标题');
      return;
    }

    const tagArray = formTags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingBook) {
      // Edit existing
      const updated = worldBooks.map((b) =>
        b.id === editingBook.id
          ? {
              ...b,
              title: formTitle.trim(),
              description: formDescription.trim(),
              worldSetting: formWorldSetting.trim(),
              tags: tagArray,
              updatedAt: Date.now(),
            }
          : b
      );
      onUpdateWorldBooks(updated);
    } else {
      // Create new
      const newBook: WorldBook = {
        id: 'wb_' + Date.now(),
        title: formTitle.trim(),
        description: formDescription.trim() || '自定义世界观',
        worldSetting:
          formWorldSetting.trim() ||
          '世界观核心法则：在此世界中，一切运转均遵循专属规律。',
        tags: tagArray.length > 0 ? tagArray : ['自定义'],
        entries: [
          {
            id: 'entry_' + Date.now() + '_1',
            keyword: '核心法则',
            content: '该世界独特的能量体系与社会准则。',
            enabled: true,
          },
        ],
        associatedCharacterIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onUpdateWorldBooks([newBook, ...worldBooks]);
      setActiveBookId(newBook.id);
    }

    setIsCreatingNew(false);
    setEditingBook(null);
  };

  // Delete World Book
  const handleDeleteBook = (id: string) => {
    if (confirm('确定要删除这本世界书吗？')) {
      const updated = worldBooks.filter((b) => b.id !== id);
      onUpdateWorldBooks(updated);
      if (activeBookId === id) setActiveBookId(null);
    }
  };

  // Associate or Disassociate Character
  const handleToggleCharacterAssociation = (bookId: string, charId: string) => {
    const updated = worldBooks.map((b) => {
      if (b.id === bookId) {
        const currentIds = b.associatedCharacterIds || [];
        const exists = currentIds.includes(charId);
        const newIds = exists
          ? currentIds.filter((id) => id !== charId)
          : [...currentIds, charId];
        return { ...b, associatedCharacterIds: newIds, updatedAt: Date.now() };
      }
      return b;
    });
    onUpdateWorldBooks(updated);
  };

  // Add Entry to active book
  const handleAddEntry = () => {
    if (!entryKeyword.trim() || !activeBook) return;
    const newEntry: WorldBookEntry = {
      id: 'entry_' + Date.now(),
      keyword: entryKeyword.trim(),
      content: entryContent.trim() || '专有名词详细设定说明',
      enabled: true,
    };
    const updated = worldBooks.map((b) =>
      b.id === activeBook.id
        ? { ...b, entries: [...(b.entries || []), newEntry], updatedAt: Date.now() }
        : b
    );
    onUpdateWorldBooks(updated);
    setEntryKeyword('');
    setEntryContent('');
    setShowAddEntryModal(false);
  };

  // Delete Entry
  const handleDeleteEntry = (entryId: string) => {
    if (!activeBook) return;
    const updated = worldBooks.map((b) =>
      b.id === activeBook.id
        ? { ...b, entries: (b.entries || []).filter((e) => e.id !== entryId), updatedAt: Date.now() }
        : b
    );
    onUpdateWorldBooks(updated);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={() => {
            if (activeBookId) {
              setActiveBookId(null);
            } else {
              onBackToLauncher();
            }
          }}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{activeBookId ? '世界书库' : '桌面'}</span>
        </button>

        <div className="flex items-center gap-1.5 font-semibold text-sm tracking-tight text-zinc-100">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <span>{activeBook ? activeBook.title : '世界书设定库'}</span>
        </div>

        <div className="flex items-center gap-1">
          {!activeBookId && (
            <button
              onClick={() => {
                setFormTitle('');
                setFormDescription('');
                setFormWorldSetting('');
                setFormTags('');
                setEditingBook(null);
                setIsCreatingNew(true);
              }}
              className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建世界书</span>
            </button>
          )}

          {activeBook && (
            <button
              onClick={() => setShowAssociateModal(activeBook)}
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-indigo-300 text-xs font-medium flex items-center gap-1 border border-indigo-500/30 transition"
              title="管理关联的 AI 角色"
            >
              <Users className="w-3.5 h-3.5" />
              <span>关联 AI ({activeBook.associatedCharacterIds?.length || 0})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* VIEW 1: World Books List View */}
        {!activeBookId && (
          <div className="space-y-3">
            {/* Search and Prompt Notice */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜索世界书名称、标签或描述..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Explanatory Banner */}
            <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-200 leading-relaxed flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-300">什么是世界书？</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  世界书用于定义宇宙法则、力量体系与专有名词。<strong>关联到 AI 角色后</strong>，AI 将自动基于该世界观设定进行沉浸式回复；未关联的 AI 则不受影响。
                </p>
              </div>
            </div>

            {/* List of World Books */}
            <div className="space-y-2.5">
              {filteredBooks.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/50 rounded-2xl border border-zinc-850">
                  没有找到相关的世界书，点击右上角「新建世界书」开始创建
                </div>
              ) : (
                filteredBooks.map((book) => {
                  const associatedChars = characters.filter((c) =>
                    book.associatedCharacterIds?.includes(c.id)
                  );

                  return (
                    <div
                      key={book.id}
                      onClick={() => setActiveBookId(book.id)}
                      className="p-3.5 rounded-2xl bg-zinc-900/90 hover:bg-zinc-850/90 border border-zinc-800 hover:border-indigo-500/40 transition cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm text-zinc-100 group-hover:text-indigo-300 transition">
                              《{book.title}》
                            </h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {book.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setFormTitle(book.title);
                              setFormDescription(book.description);
                              setFormWorldSetting(book.worldSetting);
                              setFormTags(book.tags.join(', '));
                              setEditingBook(book);
                              setIsCreatingNew(true);
                            }}
                            className="p-1.5 rounded-lg hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200"
                            title="编辑世界书"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBook(book.id)}
                            className="p-1.5 rounded-lg hover:bg-zinc-750 text-zinc-400 hover:text-red-400"
                            title="删除世界书"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {book.description || book.worldSetting}
                      </p>

                      {/* Associated Characters Preview */}
                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500">关联 AI:</span>
                          {associatedChars.length === 0 ? (
                            <span className="text-zinc-600 italic text-[10px]">未关联任何角色</span>
                          ) : (
                            <div className="flex items-center -space-x-1.5">
                              {associatedChars.map((c) => (
                                <img
                                  key={c.id}
                                  src={c.avatar}
                                  alt={c.name}
                                  title={c.name}
                                  className="w-5 h-5 rounded-full object-cover border border-zinc-900"
                                />
                              ))}
                              <span className="text-[10px] text-indigo-400 ml-2 font-medium">
                                ({associatedChars.length} 个角色)
                              </span>
                            </div>
                          )}
                        </div>

                        <span className="text-[10px] text-zinc-500">
                          {book.entries?.length || 0} 个专有词条
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: Active World Book Details & Entries View */}
        {activeBook && (
          <div className="space-y-4">
            {/* World Setting Synopsis Card */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-indigo-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  世界观核心法则与背景
                </h3>
                <button
                  onClick={() => {
                    setFormTitle(activeBook.title);
                    setFormDescription(activeBook.description);
                    setFormWorldSetting(activeBook.worldSetting);
                    setFormTags(activeBook.tags.join(', '));
                    setEditingBook(activeBook);
                    setIsCreatingNew(true);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>编辑</span>
                </button>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-950/60 p-3 rounded-xl border border-zinc-850 font-sans">
                {activeBook.worldSetting}
              </p>

              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-wrap gap-1">
                  {activeBook.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 text-[10px]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500">
                  更新于 {new Date(activeBook.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Associated AI Characters Section */}
            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  已关联的 AI 角色 ({activeBook.associatedCharacterIds?.length || 0})
                </h3>
                <button
                  onClick={() => setShowAssociateModal(activeBook)}
                  className="px-2 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-medium border border-indigo-500/30"
                >
                  管理关联
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {characters
                  .filter((c) => activeBook.associatedCharacterIds?.includes(c.id))
                  .map((char) => (
                    <div
                      key={char.id}
                      className="p-2 rounded-xl bg-zinc-800/80 border border-zinc-750 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={char.avatar}
                          alt=""
                          className="w-7 h-7 rounded-lg object-cover border border-zinc-700 shrink-0"
                        />
                        <span className="font-medium text-zinc-200 truncate">{char.name}</span>
                      </div>
                      <button
                        onClick={() => handleToggleCharacterAssociation(activeBook.id, char.id)}
                        className="text-zinc-500 hover:text-red-400 p-1"
                        title="取消关联"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                {(!activeBook.associatedCharacterIds || activeBook.associatedCharacterIds.length === 0) && (
                  <div className="col-span-2 p-3 text-center text-zinc-500 text-xs bg-zinc-950/40 rounded-xl border border-zinc-850">
                    暂未关联任何角色，点击上方「管理关联」选择 AI 角色
                  </div>
                )}
              </div>
            </div>

            {/* Entries & Glossary Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  专有名词与词条设定 ({activeBook.entries?.length || 0})
                </h3>
                <button
                  onClick={() => setShowAddEntryModal(true)}
                  className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-indigo-300 text-xs font-medium flex items-center gap-1 border border-indigo-500/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加词条</span>
                </button>
              </div>

              <div className="space-y-2">
                {activeBook.entries && activeBook.entries.length > 0 ? (
                  activeBook.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <span className="font-semibold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                          【{entry.keyword}】
                        </span>
                        <p className="text-zinc-300 leading-relaxed mt-1 text-[11px]">
                          {entry.content}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-zinc-500 hover:text-red-400 p-1 shrink-0"
                        title="删除词条"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-zinc-500 text-xs bg-zinc-900/50 rounded-2xl border border-zinc-850">
                    暂无词条，点击「添加词条」扩充专属世界观专有名词
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Create / Edit World Book Modal */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-indigo-300">
                <BookOpen className="w-4 h-4" />
                <span>{editingBook ? '编辑世界书' : '创建全新世界书'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsCreatingNew(false);
                  setEditingBook(null);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs max-h-96 overflow-y-auto pr-1">
              <div>
                <label className="block text-zinc-400 mb-1">世界书标题 / 名称</label>
                <input
                  type="text"
                  placeholder="例如: 赛博夜城·纪元2088 / 修真长生界"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">类型标签 (以逗号分隔)</label>
                <input
                  type="text"
                  placeholder="例如: 赛博朋克, 科幻, 义体科技"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">一句话世界简介</label>
                <input
                  type="text"
                  placeholder="例如: 霓虹闪烁的巨型都会，大企业掌控一切的阴暗未来。"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-zinc-400">核心世界观法则与背景描述</label>
                  <button
                    onClick={handleAiGenerate}
                    disabled={isAiGenerating}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isAiGenerating ? 'AI构想中...' : 'AI 一键扩写设定'}</span>
                  </button>
                </div>
                <textarea
                  rows={5}
                  placeholder="详细描述该世界观的历史背景、阶级阵营、超自然规则、科技水平与日常用语规范..."
                  value={formWorldSetting}
                  onChange={(e) => setFormWorldSetting(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  setIsCreatingNew(false);
                  setEditingBook(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs"
              >
                取消
              </button>
              <button
                onClick={handleSaveBook}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-medium text-white text-xs shadow-md"
              >
                保存世界书
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Associate Character Modal */}
      {showAssociateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-indigo-500/40 p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div>
                <h3 className="font-semibold text-sm text-indigo-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>关联 AI 角色</span>
                </h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  已关联的角色在微信聊天中将自动融入《{showAssociateModal.title}》设定
                </p>
              </div>
              <button onClick={() => setShowAssociateModal(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {characters.map((char) => {
                const isAssociated = showAssociateModal.associatedCharacterIds?.includes(char.id);

                return (
                  <div
                    key={char.id}
                    onClick={() => handleToggleCharacterAssociation(showAssociateModal.id, char.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      isAssociated
                        ? 'bg-indigo-950/60 border-indigo-500/50'
                        : 'bg-zinc-800/60 border-zinc-750 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={char.avatar} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <div>
                        <h5 className="font-medium text-xs text-zinc-100">{char.name}</h5>
                        <p className="text-[10px] text-zinc-400 truncate max-w-[170px]">{char.persona}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                        isAssociated ? 'bg-indigo-500 text-white' : 'border border-zinc-600'
                      }`}
                    >
                      {isAssociated && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowAssociateModal(null)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white shadow-md"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Add Entry Modal */}
      {showAddEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm text-indigo-300">添加专有名词 / 词条</h3>
              <button onClick={() => setShowAddEntryModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">专有名词 / 关键词</label>
                <input
                  type="text"
                  placeholder="例如: 灵力结晶 / 义体过载 / 浮空城"
                  value={entryKeyword}
                  onChange={(e) => setEntryKeyword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">词条详细设定内容</label>
                <textarea
                  rows={4}
                  placeholder="解释此名词在世界观中的定义、来源、作用以及对人物的影响..."
                  value={entryContent}
                  onChange={(e) => setEntryContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowAddEntryModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs"
              >
                取消
              </button>
              <button
                onClick={handleAddEntry}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-medium text-white text-xs shadow-md"
              >
                添加词条
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
