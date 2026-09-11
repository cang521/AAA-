import React from 'react';
import { MessageCircle, Bell, X, Sparkles, ChevronRight } from 'lucide-react';
import { InPhoneNotification } from '../../lib/agent/types';

interface InPhoneNotificationBannerProps {
  notification: InPhoneNotification;
  onOpenWechat?: (characterId?: string) => void;
  onDismiss: () => void;
}

export const InPhoneNotificationBanner: React.FC<InPhoneNotificationBannerProps> = ({
  notification,
  onOpenWechat,
  onDismiss,
}) => {
  return (
    <div className="absolute top-2 left-3 right-3 z-40 animate-in slide-in-from-top duration-300 select-none">
      <div
        onClick={() => {
          if (onOpenWechat) {
            onOpenWechat(notification.aiId);
          }
          onDismiss();
        }}
        className="p-3 rounded-2xl bg-zinc-900/95 border border-indigo-500/40 shadow-2xl backdrop-blur-md flex items-start gap-2.5 cursor-pointer hover:border-indigo-500 transition active:scale-[0.98]"
      >
        {/* Avatar or Icon */}
        <div className="relative shrink-0">
          {notification.aiAvatar ? (
            <img
              src={notification.aiAvatar}
              alt={notification.aiName}
              className="w-9 h-9 rounded-xl object-cover border border-indigo-500/30"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border border-zinc-900 flex items-center justify-center">
            <MessageCircle className="w-2.5 h-2.5 text-white" />
          </div>
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-zinc-100 truncate">
              {notification.title}
            </span>
            <span className="text-[9px] text-zinc-500 font-mono shrink-0">刚刚</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-snug line-clamp-2 mt-0.5">
            {notification.content}
          </p>
          <div className="flex items-center gap-1 text-[9px] text-indigo-400 font-medium mt-1">
            <span>点击立即进入微信回复</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
