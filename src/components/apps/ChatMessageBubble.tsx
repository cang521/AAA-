import React from 'react';
import { ChatMessage } from '../../types';
import { Brain } from 'lucide-react';

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  isUser: boolean;
  avatar: string;
  name: string;
  quoteText?: string;
  isHighlighted?: boolean;
  onOpenCoT?: (msgId: string) => void;
  onContextMenu: (msg: ChatMessage) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = React.memo(
  ({ msg, isUser, avatar, name, quoteText, isHighlighted, onOpenCoT, onContextMenu }) => {
    return (
      <div
        id={`msg-bubble-${msg.id}`}
        className={`flex gap-2.5 transition-all duration-300 rounded-2xl p-1 ${
          isHighlighted ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''
        } ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      >
        {/* Avatar */}
        <button
          onClick={() => {
            if (!isUser && onOpenCoT) {
              onOpenCoT(msg.id);
            }
          }}
          className="relative shrink-0 w-9 h-9 rounded-2xl overflow-hidden border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          title={!isUser ? '点击查看 AI 思考链 (CoT)' : name}
        >
          <img src={avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
          {!isUser && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-amber-400 rounded-full border border-zinc-900 flex items-center justify-center">
              <Brain className="w-2 h-2 text-zinc-950" />
            </span>
          )}
        </button>

        {/* Bubble Content */}
        <div className="max-w-[76%] flex flex-col">
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(msg);
            }}
            className={`relative rounded-2xl px-3.5 py-2.5 text-xs shadow-xs whitespace-pre-wrap leading-relaxed ${
              isUser
                ? 'bg-emerald-600 text-white rounded-tr-xs'
                : 'bg-zinc-800 text-zinc-100 border border-zinc-750 rounded-tl-xs'
            }`}
          >
            {/* Quote Preview */}
            {quoteText && (
              <div className="mb-1.5 p-1.5 rounded-lg bg-black/25 text-[10px] text-zinc-300 border-l-2 border-emerald-400 truncate">
                引述消息: {quoteText}
              </div>
            )}

            {msg.text}

            {msg.isRefreshed && (
              <span className="block text-[9px] text-amber-300 font-mono mt-1 opacity-80">已刷新回答</span>
            )}
          </div>

          {/* CoT Trigger Chip */}
          {!isUser && onOpenCoT && msg.thinkingProcess && (
            <button
              onClick={() => onOpenCoT(msg.id)}
              className="mt-1 self-start flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 transition cursor-pointer"
            >
              <Brain className="w-3 h-3" />
              <span>点击查看 AI 思考链</span>
            </button>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.msg.id === next.msg.id &&
      prev.msg.text === next.msg.text &&
      prev.msg.thinkingProcess === next.msg.thinkingProcess &&
      prev.msg.isRefreshed === next.msg.isRefreshed &&
      prev.quoteText === next.quoteText &&
      prev.isHighlighted === next.isHighlighted &&
      prev.avatar === next.avatar
    );
  }
);

ChatMessageBubble.displayName = 'ChatMessageBubble';
