import React, { useState, useEffect } from 'react';
import { Search, X, MessageSquare, ArrowRight, Clock } from 'lucide-react';
import { ChatMessage, AiCharacter, UserProfile } from '../../types';
import { searchCharacterMessages } from '../../lib/chatDb';

interface ChatSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: AiCharacter;
  userProfile: UserProfile;
  onSelectMessage: (msgId: string) => void;
}

export const ChatSearchModal: React.FC<ChatSearchModalProps> = ({
  isOpen,
  onClose,
  character,
  userProfile,
  onSelectMessage,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await searchCharacterMessages(character.id, query.trim(), 50);
        setResults(found);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, character.id]);

  if (!isOpen) return null;

  // Helper to highlight matching text in search snippets
  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="bg-amber-400/40 text-amber-200 px-0.5 rounded-xs font-semibold">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col justify-start animate-in fade-in duration-150">
      {/* Search Header Bar */}
      <div className="w-full bg-zinc-900 border-b border-zinc-800 p-3 flex items-center gap-3">
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            autoFocus
            placeholder={`在与【${character.name}】的聊天记录中搜索...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-2xl bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
        >
          取消
        </button>
      </div>

      {/* Search Results List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-w-xl mx-auto w-full">
        {isSearching && (
          <div className="text-center py-8 text-xs text-zinc-500 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>正在检索结构化本地记忆数据库...</span>
          </div>
        )}

        {!isSearching && query.trim() && results.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-xs space-y-1">
            <MessageSquare className="w-8 h-8 mx-auto text-zinc-600 mb-2 opacity-60" />
            <p className="font-semibold text-zinc-400">未找到相关聊天记录</p>
            <p className="text-[11px]">可以尝试换一个词或缩短搜索关键词</p>
          </div>
        )}

        {!query.trim() && (
          <div className="text-center py-12 text-zinc-500 text-xs space-y-2">
            <Search className="w-8 h-8 mx-auto text-zinc-600 mb-2 opacity-50" />
            <p className="text-zinc-400 font-medium">输入字词快速检索任意时期的对话记忆</p>
            <p className="text-[10px] text-zinc-500">点击检索结果可一键跳转至上下文所在位置并高亮显示</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-2">
            <div className="px-1 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>共找到 {results.length} 条包含 "{query}" 的消息记录</span>
              <span className="text-[10px] text-zinc-500 font-mono">点击跳转</span>
            </div>

            {results.map((msg) => {
              const isUser = msg.sender === 'user';
              const senderName = isUser ? userProfile.name : character.name;
              const senderAvatar = isUser ? userProfile.avatar : character.avatar;

              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    onSelectMessage(msg.id);
                    onClose();
                  }}
                  className="p-3 rounded-2xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 hover:border-emerald-500/50 cursor-pointer transition shadow-xs group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <img
                        src={senderAvatar}
                        alt=""
                        className="w-5 h-5 rounded-lg object-cover border border-zinc-700"
                      />
                      <span className={`text-xs font-semibold ${isUser ? 'text-zinc-200' : 'text-emerald-400'}`}>
                        {senderName}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300 leading-relaxed pl-7">
                    {renderHighlightedText(msg.text, query)}
                  </div>

                  <div className="mt-2 pl-7 flex items-center gap-1 text-[10px] text-emerald-400/80 group-hover:text-emerald-300 font-medium">
                    <span>定位至该消息</span>
                    <ArrowRight className="w-3 h-3 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
