import React, { useState, useEffect } from 'react';
import { TheaterSession } from '../../../types';
import { loadTheaterSessionsFromDb, deleteTheaterSessionFromDb } from '../../../lib/theater/theaterDb';
import { FolderArchive, Play, Trash2, Clock, Sparkles, BookOpen, Heart, X } from 'lucide-react';

interface TheaterArchivesViewProps {
  onClose: () => void;
  onSelectSession: (session: TheaterSession) => void;
}

export const TheaterArchivesView: React.FC<TheaterArchivesViewProps> = ({
  onClose,
  onSelectSession,
}) => {
  const [sessions, setSessions] = useState<TheaterSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [memoirModalSession, setMemoirModalSession] = useState<TheaterSession | null>(null);

  useEffect(() => {
    loadTheaterSessionsFromDb().then(list => {
      setSessions(list);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定要删除该剧场存档吗？删除后将无法恢复。')) return;
    await deleteTheaterSessionFromDb(id);
    setSessions(sessions.filter(s => s.id !== id));
  };

  return (
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn font-sans">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-sky-100 dark:border-zinc-800 overflow-hidden flex flex-col h-[82vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-sky-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-sky-50/40 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100">📂 剧场存档与回忆录</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">继续未完的冒险，温顾往昔共同经历的篇章</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">加载存档中...</div>
          ) : sessions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
              <FolderArchive className="w-12 h-12 opacity-30 text-sky-500" />
              <p className="text-sm font-bold text-slate-600 dark:text-zinc-300">暂无任何剧场存档</p>
              <p className="text-xs text-slate-400">快去通过随机抽签、自选关系或自定义剧场开启你的第一场角色扮演吧！</p>
            </div>
          ) : (
            sessions.map(session => {
              const isEnded = session.status === 'ended';
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                  className="p-4 rounded-2xl border border-sky-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-sky-300 transition cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group shadow-sm active:scale-[0.99]"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isEnded ? 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                      }`}>
                        {isEnded ? '已完结' : '进行中'}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-sky-500" /> {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-rose-500 flex items-center gap-1 font-bold">
                        <Heart className="w-3 h-3 fill-rose-500" /> 亲密度 {session.intimacy}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100 group-hover:text-sky-600 transition truncate">
                      {session.title}
                    </h3>

                    <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                      <span>角色：{session.userRole.name} & {session.aiRole.name}</span>
                      <span>• {session.chapter}</span>
                      <span>• {session.currentLocation}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                    {session.memoirSummary && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMemoirModalSession(session); }}
                        className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-xs font-bold flex items-center gap-1 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> 回忆录
                      </button>
                    )}
                    <button
                      onClick={() => onSelectSession(session)}
                      className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> {isEnded ? '回顾' : '继续'}
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 flex items-center justify-center transition"
                      title="删除存档"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Memoir Modal */}
      {memoirModalSession && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-sky-100 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-500" /> 《{memoirModalSession.title}》回忆录
              </h3>
              <button
                onClick={() => setMemoirModalSession(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-sky-50/50 dark:bg-zinc-950 border border-sky-100 dark:border-zinc-800 text-xs sm:text-sm text-slate-700 dark:text-zinc-200 leading-relaxed italic space-y-2">
              <p>“{memoirModalSession.memoirSummary}”</p>
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setMemoirModalSession(null)}
                className="px-5 py-2.5 rounded-xl bg-sky-500 text-white text-xs font-bold hover:bg-sky-600 transition shadow-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
