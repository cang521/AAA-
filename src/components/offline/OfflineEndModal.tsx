import React, { useState } from 'react';
import {
  Sparkles,
  Save,
  Trash2,
  CheckCircle2,
  Heart,
  BookOpen,
  AlertCircle,
  RotateCcw,
  Clock,
  MessageSquareQuote,
} from 'lucide-react';
import { OfflineSession } from '../../lib/offline/OfflineSessionDb';
import { OfflineSessionSummary } from '../../lib/offline/OfflineMemoryBridge';
import { formatOfflineFullDateTime, formatOfflineDuration } from '../../lib/offline/offlineTimeFormat';

interface OfflineEndModalProps {
  isOpen: boolean;
  session: OfflineSession;
  summary: OfflineSessionSummary | null;
  summaryPending: boolean;
  summaryError?: string;
  isRetryingSummary?: boolean;
  characterName: string;
  onRetrySummary: () => Promise<void>;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onKeepPendingAndExit?: () => void;
}

export const OfflineEndModal: React.FC<OfflineEndModalProps> = ({
  isOpen,
  session,
  summary,
  summaryPending,
  summaryError,
  isRetryingSummary = false,
  characterName,
  onRetrySummary,
  onSave,
  onDelete,
  onKeepPendingAndExit,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const startText = formatOfflineFullDateTime(session.startedAt);
  const endText = formatOfflineFullDateTime(session.endedAt || Date.now());
  const durationText = formatOfflineDuration(session.durationMinutes, session.startedAt, session.endedAt);
  const canCommitToMemory = Boolean(!summaryPending && summary && summary.summary?.trim());

  const handleConfirmSave = async () => {
    if (!canCommitToMemory) return;
    setActionError(null);
    setIsProcessing(true);
    try {
      await onSave();
    } catch (e: any) {
      setActionError(`保存经历失败：${e?.message || '未知错误'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    setActionError(null);
    setIsProcessing(true);
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch (e: any) {
      setActionError(`删除经历失败：${e?.message || '未知错误'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header with Full Real Local Timestamps */}
        <div className="text-center space-y-1.5 border-b border-zinc-800 pb-3.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> 线下相处已结束
          </div>
          <h3 className="font-bold text-base text-zinc-100">
            {summary?.title || session.sceneSnapshot.name}
          </h3>
          <div className="text-xs text-zinc-400 space-y-0.5 font-mono">
            <p>{startText} 开始</p>
            <p>{endText} 结束</p>
            <p className="inline-flex items-center gap-1 text-indigo-500 font-semibold font-sans">
              <Clock className="w-3.5 h-3.5" />
              共持续 {durationText} · {session.sceneSnapshot.location}
            </p>
          </div>
        </div>

        {/* Summary Pending State (API failure: NO fake fallback committed!) */}
        {summaryPending || !summary ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-500">经历总结暂未生成（已标记为待重生成）</p>
                <p className="text-zinc-300 leading-relaxed">
                  {summaryError || '网络或模型接口异常，未能生成可靠的经历总结。'}
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  本次完整原始对话记录已安全保存在本地，系统绝不会将空泛模板写入 {characterName} 的长期记忆。你可以立即重试生成，或先保留原始记录稍后在历史中重试。
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRetrySummary}
              disabled={isRetryingSummary || isProcessing}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${isRetryingSummary ? 'animate-spin' : ''}`} />
              <span>{isRetryingSummary ? '正在重新生成总结...' : '重新生成经历总结'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* AI Reflection Card */}
            {summary.aiReflection && (
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-1">
                <span className="text-[11px] text-indigo-500 font-bold flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> {characterName} 的回忆独白：
                </span>
                <p className="text-xs text-zinc-200 italic leading-relaxed">“{summary.aiReflection}”</p>
              </div>
            )}

            {/* Experience Summary */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5 text-xs">
              <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> 过程总结：
              </span>
              <p className="text-zinc-300 leading-relaxed">{summary.summary}</p>

              {summary.importantEvents && summary.importantEvents.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold block">重要事件：</span>
                  <ul className="space-y-1 text-zinc-300">
                    {summary.importantEvents.map((ev, idx) => (
                      <li key={idx} className="leading-relaxed">
                        • {ev}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.keyExpressions && summary.keyExpressions.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold flex items-center gap-1">
                    <MessageSquareQuote className="w-3 h-3" /> 关键话语：
                  </span>
                  <ul className="space-y-1 text-zinc-300">
                    {summary.keyExpressions.map((expr, idx) => (
                      <li key={idx} className="leading-relaxed">
                        「{expr}」
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.relationshipChanges && summary.relationshipChanges.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold block">情绪与关系变化：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.relationshipChanges.map((change, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[11px]"
                      >
                        {change}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.unfinishedTopics && summary.unfinishedTopics.length > 0 && (
                <div className="pt-1 space-y-1">
                  <span className="text-[11px] text-zinc-400 font-semibold block">未完话题 / 后续约定：</span>
                  <ul className="space-y-1 text-zinc-300">
                    {summary.unfinishedTopics.map((topic, idx) => (
                      <li key={idx}>• {topic}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Candidate Long-Term Memories */}
            {summary.candidateMemories && summary.candidateMemories.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-indigo-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 候选长期记忆 ({summary.candidateMemories.length})
                  </span>
                  <span className="text-[11px] text-zinc-400">保存后同步写入</span>
                </div>
                <ul className="space-y-1.5 text-zinc-200">
                  {summary.candidateMemories.map((mem, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 bg-zinc-900/90 p-2 rounded-xl border border-zinc-800">
                      <span className="text-indigo-500 font-bold shrink-0">•</span>
                      <span className="leading-relaxed">{mem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info Banner */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                保存后将写入 {characterName} 的长期记忆，并在你们的微信私聊时间线中生成一条可点击回看的「线下经历」卡片。
              </span>
            </div>
          </>
        )}

        {actionError && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-500">
            {actionError}
          </div>
        )}

        {/* Inline Delete Confirmation */}
        {confirmDelete ? (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 space-y-2.5 text-xs">
            <p className="font-bold text-rose-500">
              确定彻底删除本次『{session.sceneSnapshot.name}』经历吗？
            </p>
            <p className="text-zinc-400">删除后原始对话与总结均会移除，且不会写入长期记忆。</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isProcessing}
                className="py-2 rounded-xl bg-zinc-800 text-zinc-300 font-semibold cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isProcessing}
                className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                {isProcessing ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isProcessing || isRetryingSummary}
                className="py-3 rounded-2xl bg-zinc-800 hover:bg-rose-500/15 hover:text-rose-500 border border-zinc-700 text-zinc-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除本次经历</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={!canCommitToMemory || isProcessing || isRetryingSummary}
                className="py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Save className="w-4 h-4" />
                <span>{isProcessing ? '保存中...' : '保存并同步记忆'}</span>
              </button>
            </div>

            {summaryPending && onKeepPendingAndExit && (
              <button
                type="button"
                onClick={onKeepPendingAndExit}
                className="w-full py-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                暂存原始记录并返回（稍后再重试总结）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
