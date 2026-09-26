import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Clock, Heart, BookOpen, ChevronRight, User } from 'lucide-react';
import { OfflineSession, getAllSavedSessions } from '../../lib/offline/OfflineSessionDb';
import { AiCharacter, ChatMessage } from '../../types';
import { OfflineHistoryDetailModal } from './OfflineHistoryDetailModal';

interface OfflineHistoryProps {
  characters: AiCharacter[];
  onShareToChat?: (cardMsg: ChatMessage) => void;
}

export const OfflineHistory: React.FC<OfflineHistoryProps> = ({ characters, onShareToChat }) => {
  const [sessions, setSessions] = useState<OfflineSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCharacterFilter, setSelectedCharacterFilter] = useState<string>('all');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    refreshHistory();
  }, []);

  const refreshHistory = async () => {
    const list = await getAllSavedSessions();
    setSessions(list);
  };

  const filteredSessions = sessions.filter((s) => {
    if (selectedCharacterFilter !== 'all' && s.characterId !== selectedCharacterFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        s.sceneSnapshot.name.toLowerCase().includes(q) ||
        (s.eventSummary || '').toLowerCase().includes(q) ||
        (s.characterName || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const activeCharForDetail = characters.find(
    (c) => c.id === (sessions.find((s) => s.id === activeSessionId)?.characterId)
  );

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 text-zinc-100">
      {/* Header & Search */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            历史线下经历库 ({filteredSessions.length})
          </h2>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索场景名称、内容与AI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Character Filter Select */}
          <select
            value={selectedCharacterFilter}
            onChange={(e) => setSelectedCharacterFilter(e.target.value)}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none cursor-pointer"
          >
            <option value="all">全部 AI 角色</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* History List */}
      {filteredSessions.length === 0 ? (
        <div className="p-8 text-center bg-zinc-900/50 rounded-3xl border border-zinc-800 space-y-2">
          <BookOpen className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-400 font-medium">尚无已保存的线下历史经历</p>
          <p className="text-[11px] text-zinc-500">
            发起线下模式并在结束后点击“保存”，体验记录将自动珍藏于此。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {filteredSessions.map((s) => {
            const char = characters.find((c) => c.id === s.characterId);
            const dateStr = new Date(s.startedAt).toLocaleDateString('zh-CN');
            return (
              <div
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className="p-3.5 rounded-2xl bg-zinc-850/80 border border-zinc-750 hover:border-indigo-500/50 transition cursor-pointer select-none space-y-2 group shadow-sm active:scale-98"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={char?.avatar || s.characterAvatar || ''}
                      alt=""
                      className="w-10 h-10 rounded-2xl object-cover border border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-zinc-100 group-hover:text-indigo-300 transition truncate">
                        {s.sceneSnapshot.name}
                      </h4>
                      <p className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3 text-indigo-400" /> {s.characterName || char?.name} · {dateStr}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition shrink-0" />
                </div>

                {s.eventSummary && (
                  <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed bg-zinc-950/60 p-2 rounded-xl border border-zinc-800">
                    {s.eventSummary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History Detail Modal */}
      <OfflineHistoryDetailModal
        isOpen={!!activeSessionId}
        sessionId={activeSessionId}
        character={activeCharForDetail}
        onClose={() => setActiveSessionId(null)}
        onDeleted={() => refreshHistory()}
        onShareToChat={onShareToChat}
      />
    </div>
  );
};
