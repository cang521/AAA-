import React from 'react';
import { MessageSquareText } from 'lucide-react';
import { ForwardBundleItem, ForwardBundlePayload } from '../../types';

interface ForwardBundleCardProps {
  bundle: ForwardBundlePayload;
  isMe?: boolean;
  disabled?: boolean;
  onOpen: (bundle: ForwardBundlePayload) => void;
}

function formatPreviewItemLine(item: ForwardBundleItem): string {
  const sender = item.senderName || '成员';
  if (item.cardSummary) {
    return `${sender}: ${item.cardSummary}`;
  }
  if (item.messageType === 'image' || item.messageType === 'generated_image') {
    const extra = item.text && item.text.trim() ? ` ${item.text.trim()}` : '';
    return `${sender}: [图片]${extra}`;
  }
  if (item.messageType === 'forward_bundle') {
    return `${sender}: [聊天记录]`;
  }
  const cleanText = String(item.text || '').replace(/\s+/g, ' ').trim();
  return `${sender}: ${cleanText || '[空消息]'}`;
}

export const ForwardBundleCard: React.FC<ForwardBundleCardProps> = ({
  bundle,
  isMe = false,
  disabled = false,
  onOpen,
}) => {
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const previewItems = items.slice(0, 4);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onOpen(bundle);
      }}
      className={`wx-card text-left w-[240px] sm:w-[260px] rounded-2xl border shadow-sm overflow-hidden transition active:scale-[0.99] ${
        disabled ? 'cursor-default' : 'cursor-pointer hover:brightness-98'
      } ${
        isMe
          ? 'bg-white dark:bg-zinc-900 border-emerald-500/25 text-zinc-900 dark:text-zinc-100'
          : 'bg-white dark:bg-zinc-850 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
      }`}
    >
      <div className="px-3 pt-2.5 pb-2 space-y-1.5">
        <div className="wx-primary-text text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {bundle?.title || '聊天记录'}
        </div>

        <div className="space-y-0.5">
          {previewItems.length > 0 ? (
            previewItems.map((item, idx) => (
              <p
                key={`${item.id || idx}_${idx}`}
                className="wx-secondary-text text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 truncate"
              >
                {formatPreviewItemLine(item)}
              </p>
            ))
          ) : (
            <p className="wx-muted-text text-[11px] text-zinc-400">暂无消息明细</p>
          )}
        </div>
      </div>

      <div className="wx-divider px-3 py-1.5 border-t border-zinc-200/80 dark:border-zinc-700/70 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span className="wx-muted-text inline-flex items-center gap-1">
          <MessageSquareText className="w-3 h-3 shrink-0" />
          <span>聊天记录</span>
        </span>
        <span className="wx-muted-text font-mono">共 {items.length} 条</span>
      </div>
    </button>
  );
};
