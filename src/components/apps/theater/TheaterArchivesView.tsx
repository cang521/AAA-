import React, { useState, useEffect } from 'react';
import { TheaterSession } from '../../../types';
import { loadTheaterSessionsFromDb, deleteTheaterSessionFromDb } from '../../../lib/theater/theaterDb';
import { FolderArchive, Play, Trash2, Clock, Sparkles, BookOpen, Heart } from 'lucide-react';

interface TheaterArchivesViewProps {
  onClose: () => void;
  onContinueSession: (session: TheaterSession) => void;
}

export const TheaterArchivesView: React.FC<TheaterArchivesViewProps> = ({
  onClose,
  onContinueSession,
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
    <div className="theater-app fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[80vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 dark:bg-violet-400/10 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">📂 剧场存档与回忆录</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">继续未完的冒险，温顾往昔共同经历的篇章</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-zinc-400 text-xs">加载存档中...</div>
          ) : sessions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400 space-y-3">
              <FolderArchive className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">暂无任何剧场存档</p>
              <p className="text-xs">快去通过随机抽签或自选关系开启你的第一场沉浸式角色扮演吧！</p>
            </div>
          ) : (
            sessions.map(session => {
              const isEnded = session.status === 'ended';
              return (
                <div
                  key={session.id}
                  onClick={() => onContinueSession(session)}
                  className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 hover:border-violet-500/50 transition cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group shadow-sm"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isEnded ? 'bg-zinc-500/10 text-zinc-500' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                      }`}>
                        {isEnded ? '已完结' : '进行中'}
                      </span>
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-rose-500 flex items-center gap-1">
                        <Heart className="w-3 h-3 fill-rose-500" /> 亲密度 {session.intimacy}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-violet-600 transition">
                      {session.title}
                    </h3>

                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-3">
                      <span>角色：{session.userRole.name} & {session.aiRole.name}</span>
                      <span>• {session.chapter}</span>
                      <span>• {session.currentLocation}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {session.memoirSummary && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMemoirModalSession(session); }}
                        className="px-3 py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-300 text-xs font-medium flex items-center gap-1 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" /> 回忆录
                      </button>
                    )}
                    <button
                      onClick={() => onContinueSession(session)}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> {isEnded ? '查看回顾' : '继续游戏'}
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 flex items-center justify-center transition"
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
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" /> 剧场回忆录
              </h3>
              <button onClick={() => setMemoirModalSession(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
              “{memoirModalSession.memoirSummary}”
            </div>
            <div className="text-right">
              <button
                onClick={() => setMemoirModalSession(null)}
                className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold"
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
