import React, { useState } from 'react';
import { X, MessageSquareText, Quote, Image as ImageIcon } from 'lucide-react';
import { ForwardBundleItem, ForwardBundlePayload } from '../../types';
import { DEFAULT_USER_AVATAR } from '../../lib/storage';

interface ForwardBundleDetailModalProps {
  bundle: ForwardBundlePayload | null;
  onClose: () => void;
}

function formatDetailTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

const BundleItemRow: React.FC<{
  item: ForwardBundleItem;
  onPreviewImage: (url: string) => void;
}> = ({ item, onPreviewImage }) => {
  const [imgError, setImgError] = useState(false);
  const avatarSrc = item.senderAvatar || DEFAULT_USER_AVATAR;
  const structured = item.structuredData as Record<string, any> | undefined;

  return (
    <div className="wx-divider flex items-start gap-2.5 py-2.5 border-b border-zinc-200/70 dark:border-zinc-800 last:border-b-0">
      <img
        src={avatarSrc}
        alt={item.senderName}
        className="wx-avatar w-8 h-8 rounded-lg object-cover border border-black/10 dark:border-white/10 shrink-0"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="wx-primary-text text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
            {item.senderName}
          </span>
          <span className="wx-muted-text text-[10px] font-mono text-zinc-400 shrink-0">
            {formatDetailTime(item.timestamp)}
          </span>
        </div>

        {item.quoteSummary && (
          <div className="wx-quote-preview px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border-l-2 border-emerald-500 text-[10px] text-zinc-600 dark:text-zinc-300 flex items-start gap-1">
            <Quote className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
            <span className="break-words">
              {item.quoteSummary.senderName}: {item.quoteSummary.text}
            </span>
          </div>
        )}

        {item.imageUrl && !imgError && (
          <div className="pt-0.5">
            <img
              src={item.imageUrl}
              alt={item.imageDescription || '聊天图片'}
              onClick={() => onPreviewImage(item.imageUrl!)}
              onError={() => setImgError(true)}
              className="max-w-[180px] max-h-44 rounded-xl object-cover border border-black/10 dark:border-white/10 cursor-pointer hover:opacity-95 transition"
            />
          </div>
        )}

        {item.imageUrl && imgError && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>[图片] {item.imageDescription || '图片资源暂不可预览'}</span>
          </div>
        )}

        {!item.imageUrl && (item.messageType === 'image' || item.messageType === 'generated_image') && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>[图片] {item.imageDescription || ''}</span>
          </div>
        )}

        {structured && structured.kind === 'relay' && (
          <div className="wx-sub-card p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 space-y-1 text-[11px]">
            <div className="font-semibold text-emerald-600 dark:text-emerald-400">
              [群接龙] {String(structured.title || '')}
            </div>
            {Array.isArray(structured.entries) && structured.entries.length > 0 ? (
              <div className="space-y-0.5 text-zinc-600 dark:text-zinc-300">
                {structured.entries.map((entry: any, i: number) => (
                  <div key={i} className="break-words">
                    {i + 1}. {entry.memberName}：{entry.content}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-400">暂无接龙明细</div>
            )}
          </div>
        )}

        {structured && structured.kind === 'poll' && (
          <div className="wx-sub-card p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 space-y-1 text-[11px]">
            <div className="font-semibold text-blue-600 dark:text-blue-400">
              [群投票] {String(structured.title || '')}
            </div>
            {Array.isArray(structured.options) && (
              <div className="space-y-0.5 text-zinc-600 dark:text-zinc-300">
                {structured.options.map((opt: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{opt.text}</span>
                    <span className="font-mono text-zinc-400 shrink-0">{opt.votes || 0} 票</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {structured && structured.kind === 'random_draw' && (
          <div className="wx-sub-card p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-purple-600 dark:text-purple-400">[随机抽人] </span>
            <span>{String(structured.taskDescription || '随机抽签')}</span>
            {Array.isArray(structured.winners) && structured.winners.length > 0 && (
              <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                结果：{structured.winners.join('、')}
              </div>
            )}
          </div>
        )}

        {structured && structured.kind === 'offline_share_card' && (
          <div className="wx-sub-card p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-600 dark:text-zinc-300">
            <div className="font-semibold text-rose-500 dark:text-rose-400">
              [线下经历卡] {String(structured.sceneName || '')}
            </div>
            {structured.summaryText && (
              <div className="mt-0.5 leading-relaxed">{String(structured.summaryText)}</div>
            )}
          </div>
        )}

        {structured && structured.kind === 'forward_bundle' && (
          <div className="wx-sub-card p-2.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-600 dark:text-zinc-300">
            <div className="font-semibold">
              [聊天记录] {String(structured.title || '')}（共 {Number(structured.itemCount || 0)} 条）
            </div>
          </div>
        )}

        {item.text && !structured && (
          <p className="wx-primary-text text-xs text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">
            {item.text}
          </p>
        )}

        {item.text && structured && !item.cardSummary?.includes(item.text) && (
          <p className="wx-secondary-text text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap break-words">
            {item.text}
          </p>
        )}

        {item.imageDescription && item.imageUrl && !imgError && (
          <p className="wx-muted-text text-[10px] text-zinc-400 leading-snug">
            画面描述：{item.imageDescription}
          </p>
        )}
      </div>
    </div>
  );
};

export const ForwardBundleDetailModal: React.FC<ForwardBundleDetailModalProps> = ({
  bundle,
  onClose,
}) => {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  if (!bundle) return null;

  const items = Array.isArray(bundle.items) ? bundle.items : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="wx-modal-card w-full max-w-sm max-h-[82vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="wx-divider px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="wx-primary-text text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {bundle.title || '聊天记录'}
              </h3>
              <p className="wx-muted-text text-[10px] text-zinc-400 font-mono">
                共 {items.length} 条记录
                {bundle.createdAt ? ` · ${formatDetailTime(bundle.createdAt)}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="wx-muted-text p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {items.length > 0 ? (
            items.map((item, idx) => (
              <BundleItemRow
                key={`${item.id || idx}_${idx}`}
                item={item}
                onPreviewImage={(url) => setZoomedUrl(url)}
              />
            ))
          ) : (
            <div className="py-12 text-center text-xs text-zinc-400">暂无聊天记录明细</div>
          )}
        </div>

        <div className="wx-divider px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="wx-btn-secondary px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>

      {zoomedUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setZoomedUrl(null);
          }}
        >
          <img
            src={zoomedUrl}
            alt="查看大图"
            className="max-w-full max-h-[88vh] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
