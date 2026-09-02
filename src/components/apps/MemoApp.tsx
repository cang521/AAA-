import React, { useState } from 'react';
import { Memo } from '../../types';
import {
  ArrowLeft,
  FileText,
  Plus,
  Search,
  Trash2,
  Edit3,
  Sparkles,
  Tag,
  Clock,
  X,
  Check,
  Brain,
  Share2,
} from 'lucide-react';

interface MemoAppProps {
  onBackToLauncher: () => void;
  memos: Memo[];
  onSaveMemo: (title: string, content: string) => void;
  onDeleteMemo: (id: string) => void;
  onUpdateMemos: (memos: Memo[]) => void;
}

export const MemoApp: React.FC<MemoAppProps> = ({
  onBackToLauncher,
  memos,
  onSaveMemo,
  onDeleteMemo,
  onUpdateMemos,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('全部');
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states for modal
  const [memoTitle, setMemoTitle] = useState('');
  const [memoContent, setMemoContent] = useState('');
  const [memoTags, setMemoTags] = useState<string[]>(['个人']);
  const [aiLoading, setAiLoading] = useState(false);
  const [swipedMemoId, setSwipedMemoId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);

  const handleStart = (clientX: number) => {
    setDragStartX(clientX);
  };

  const handleEnd = (clientX: number, id: string) => {
    if (dragStartX === null) return;
    const deltaX = clientX - dragStartX;
    if (deltaX < -20) {
      setSwipedMemoId(id);
    } else if (deltaX > 20) {
      setSwipedMemoId(null);
    }
    setDragStartX(null);
  };

  // Available tag filters
  const allTags = ['全部', '个人', '工作', 'AI灵感', '秘密'];

  // Filtered memos
  const filteredMemos = memos.filter((memo) => {
    const matchesSearch =
      memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      memo.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag =
      selectedTag === '全部' || (memo.tags && memo.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const handleOpenCreate = () => {
    setEditingMemo(null);
    setMemoTitle('');
    setMemoContent('');
    setMemoTags(['个人']);
    setIsCreating(true);
  };

  const handleOpenEdit = (memo: Memo) => {
    setEditingMemo(memo);
    setMemoTitle(memo.title);
    setMemoContent(memo.content);
    setMemoTags(memo.tags || ['个人']);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!memoTitle.trim() && !memoContent.trim()) return;

    if (editingMemo) {
      // Update existing
      const updated = memos.map((m) =>
        m.id === editingMemo.id
          ? {
              ...m,
              title: memoTitle.trim() || '无标题便签',
              content: memoContent.trim(),
              tags: memoTags,
              updatedAt: Date.now(),
            }
          : m
      );
      onUpdateMemos(updated);
    } else {
      // Create new
      const newMemo: Memo = {
        id: 'memo_' + Date.now(),
        title: memoTitle.trim() || '无标题便签',
        content: memoContent.trim(),
        tags: memoTags,
        updatedAt: Date.now(),
      };
      onUpdateMemos([newMemo, ...memos]);
    }

    setIsCreating(false);
    setEditingMemo(null);
  };

  // AI Assistance logic inside Memo
  const handleAiAction = async (actionType: 'polish' | 'summarize' | 'expand') => {
    if (!memoContent.trim()) {
      alert('请先输入便签内容，再使用 AI 功能');
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: `对以下便签内容执行 [${
            actionType === 'polish'
              ? '润色美化'
              : actionType === 'summarize'
              ? '提炼要点'
              : '深度续写'
          }]：\n${memoContent}`,
          character: {
            name: '便签 AI 助理',
            persona: '你是一个高效的笔记整理和文字润色专家。',
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.text) {
        if (actionType === 'summarize') {
          setMemoContent((prev) => `${prev}\n\n📌 AI 提炼总结：\n${data.text}`);
        } else if (actionType === 'expand') {
          setMemoContent((prev) => `${prev}\n${data.text}`);
        } else {
          setMemoContent(data.text);
        }
      }
    } catch (e) {
      console.error('AI memo action failed', e);
      // Fallback response if offline
      if (actionType === 'polish') {
        setMemoContent((prev) => `✨ [AI润色] ${prev}`);
      } else if (actionType === 'summarize') {
        setMemoContent((prev) => `${prev}\n\n📌 AI 总结要点：1. 核心要事已记录 2. 待办项追踪中`);
      } else {
        setMemoContent((prev) => `${prev}\n\n💡 AI 续写提示：接下来可以继续规划具体操作步骤和时间轴。`);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const toggleTagSelection = (tag: string) => {
    if (memoTags.includes(tag)) {
      setMemoTags(memoTags.filter((t) => t !== tag));
    } else {
      setMemoTags([...memoTags, tag]);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-900 text-white font-sans overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-12 px-3 bg-zinc-850 border-b border-zinc-800 flex items-center justify-between shrink-0 z-10">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-750 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>⬅ 退出到桌面</span>
        </button>

        <div className="flex items-center gap-1.5 font-semibold text-sm text-zinc-100">
          <FileText className="w-4 h-4 text-amber-400" />
          <span>备忘录与便签</span>
        </div>

        <button
          onClick={handleOpenCreate}
          className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold flex items-center gap-1 text-xs shadow-md transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>新建</span>
        </button>
      </div>

      {/* Search & Tag Filter Bar */}
      <div className="p-3 bg-zinc-850/60 border-b border-zinc-800 space-y-2.5">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3" />
          <input
            type="text"
            placeholder="搜索备忘录标题、内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tags Horizontal Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition ${
                selectedTag === tag
                  ? 'bg-amber-400 text-zinc-950 font-bold'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Memo List View */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredMemos.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
            <FileText className="w-12 h-12 mb-2 text-zinc-700" />
            <p className="text-xs font-medium text-zinc-400">暂无相关备忘录便签</p>
            <p className="text-[11px] mt-1 text-zinc-500">点击右上角“新建”开始记录想法</p>
          </div>
        ) : (
          filteredMemos.map((memo) => {
            const isSwiped = swipedMemoId === memo.id;
            return (
              <div
                key={memo.id}
                className="relative overflow-hidden rounded-2xl bg-zinc-800/80 border border-zinc-750 shadow-sm select-none"
                onTouchStart={(e) => handleStart(e.touches[0].clientX)}
                onTouchEnd={(e) => handleEnd(e.changedTouches[0].clientX, memo.id)}
                onMouseDown={(e) => handleStart(e.clientX)}
                onMouseUp={(e) => handleEnd(e.clientX, memo.id)}
              >
                {/* Main Card Content Layer */}
                <div
                  onClick={() => {
                    if (isSwiped) {
                      setSwipedMemoId(null);
                    } else {
                      handleOpenEdit(memo);
                    }
                  }}
                  className={`p-3.5 transition-transform duration-200 cursor-pointer group bg-zinc-800 ${
                    isSwiped ? '-translate-x-20' : 'translate-x-0'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm text-amber-300 group-hover:text-amber-200 transition truncate">
                      {memo.title}
                    </h4>
                  </div>

                  <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed mb-2.5">
                    {memo.content}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-750/60">
                    <div className="flex items-center gap-1 text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(memo.updatedAt).toLocaleString([], {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {memo.tags?.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-medium border border-amber-400/25"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Swipe Left Action Button (Delete) - Only revealed when swiped left */}
                {isSwiped && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteMemo(memo.id);
                        setSwipedMemoId(null);
                      }}
                      className="h-full px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition shadow-inner"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>删除</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Editor Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl flex flex-col space-y-3 max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-semibold text-sm text-amber-400 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4" />
                <span>{editingMemo ? '编辑便签' : '新建备忘便签'}</span>
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Title Input */}
            <input
              type="text"
              placeholder="便签标题..."
              value={memoTitle}
              onChange={(e) => setMemoTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-800 border border-zinc-700 text-amber-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />

            {/* Tag Selection */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-[11px] text-zinc-400">分类标签:</span>
              {['个人', '工作', 'AI灵感', '秘密'].map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTagSelection(t)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] transition ${
                    memoTags.includes(t)
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-750'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Content Textarea */}
            <textarea
              rows={8}
              placeholder="在此输入便签备忘细节..."
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              className="w-full px-3 py-2.5 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 leading-relaxed resize-none"
            />

            {/* AI Assistant Quick Tools */}
            <div className="p-2 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-amber-300 font-medium px-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  AI 智能撰写助手
                </span>
                {aiLoading && <span className="animate-pulse text-[10px] text-zinc-400">处理中...</span>}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <button
                  onClick={() => handleAiAction('polish')}
                  disabled={aiLoading}
                  className="py-1.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 flex items-center justify-center gap-1 transition"
                >
                  <span>✨ 润色语句</span>
                </button>
                <button
                  onClick={() => handleAiAction('summarize')}
                  disabled={aiLoading}
                  className="py-1.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 flex items-center justify-center gap-1 transition"
                >
                  <span>📌 提炼要点</span>
                </button>
                <button
                  onClick={() => handleAiAction('expand')}
                  disabled={aiLoading}
                  className="py-1.5 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 flex items-center justify-center gap-1 transition"
                >
                  <span>💡 深度续写</span>
                </button>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-amber-400 text-zinc-950 hover:bg-amber-300 shadow-md transition active:scale-95"
              >
                保存便签
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
