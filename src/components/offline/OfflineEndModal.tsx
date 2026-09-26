import React, { useState } from 'react';
import { Sparkles, Save, Trash2, CheckCircle2, Heart, BookOpen, AlertCircle } from 'lucide-react';
import { OfflineSession } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionSummary } from '../../lib/offline/OfflineMemoryBridge';

interface OfflineEndModalProps {
  isOpen: boolean;
  session: OfflineSession;
  summary: OfflineSessionSummary;
  characterName: string;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export const OfflineEndModal: React.FC<OfflineEndModalProps> = ({
  isOpen,
  session,
  summary,
  characterName,
  onSave,
  onDelete,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirmSave = async () => {
    setIsProcessing(true);
    try {
      await onSave();
    } catch (e: any) {
      alert(`保存经历失败: ${e?.message || '未知错误'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (confirm(`确定要完全删除本次『${session.sceneSnapshot.name}』经历吗？\n删除后该经历不会写入 ${characterName} 的长期记忆。`)) {
      setIsProcessing(true);
      try {
        await onDelete();
      } catch (e: any) {
        alert(`删除经历失败: ${e?.message || '未知错误'}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="text-center space-y-1 border-b border-zinc-800 pb-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> 线下模式已平稳落幕
          </div>
          <h3 className="font-bold text-base text-zinc-100">{summary.title || session.sceneSnapshot.name}</h3>
          <p className="text-[11px] text-zinc-400">
            {new Date(session.startedAt).toLocaleString('zh-CN')} @ {session.sceneSnapshot.location}
          </p>
        </div>

        {/* AI Reflection Card */}
        {summary.aiReflection && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/40 to-indigo-950/30 border border-purple-500/30 space-y-1">
            <span className="text-[10px] text-purple-300 font-bold flex items-center gap-1">
              <Heart className="w-3 h-3 text-pink-400 fill-pink-400" /> {characterName} 的内心回忆独白：
            </span>
            <p className="text-xs text-purple-200 italic leading-relaxed">“{summary.aiReflection}”</p>
          </div>
        )}

        {/* Experience Summary */}
        <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
          <span className="font-bold text-zinc-200 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> 过程总结：
          </span>
          <p className="text-zinc-300 leading-relaxed text-[11px]">{summary.summary}</p>

          {/* Relationship Changes */}
          {summary.relationshipChanges && summary.relationshipChanges.length > 0 && (
            <div className="pt-1 space-y-1">
              <span className="text-[10px] text-zinc-400 font-semibold block">情感与关系升温：</span>
              <div className="flex flex-wrap gap-1">
                {summary.relationshipChanges.map((change, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                    ♥ {change}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Candidate Long-Term Memories */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" /> 提炼候选长期记忆 ({summary.candidateMemories.length})
            </span>
            <span className="text-[10px] text-zinc-400">选择保存后将自动同步写入</span>
          </div>
          <ul className="space-y-1.5 text-[11px] text-zinc-200">
            {summary.candidateMemories.map((mem, idx) => (
              <li key={idx} className="flex items-start gap-1.5 bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                <span className="text-indigo-400 font-bold shrink-0">•</span>
                <span className="leading-relaxed">{mem}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>保存后，本次经历将永久进入 {characterName} 的长期记忆库，以后的正常微信聊天中 AI 能自然想起来；删除则彻底放弃不留记录。</span>
        </div>

        {/* Action Buttons: Save vs Delete */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={handleConfirmDelete}
            disabled={isProcessing}
            className="py-3 rounded-2xl bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-300 border border-zinc-700 hover:border-rose-500/40 text-zinc-300 font-bold text-xs transition flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除本次经历</span>
          </button>

          <button
            onClick={handleConfirmSave}
            disabled={isProcessing}
            className="py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isProcessing ? '处理中...' : '保存本次经历'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
