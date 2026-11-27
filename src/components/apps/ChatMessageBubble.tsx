import React, { useState } from 'react';
import { ChatMessage, ForwardBundlePayload } from '../../types';
import {
  Brain,
  Sparkles,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
  Maximize2,
  Download,
  ScanSearch,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { OfflineShareCard } from '../offline/OfflineShareCard';
import { ForwardBundleCard } from '../wechat/ForwardBundleCard';
import { formatOfflineTimeRange, formatOfflineDuration } from '../../lib/offline/offlineTimeFormat';

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  isUser: boolean;
  avatar: string;
  name: string;
  quoteText?: string;
  isHighlighted?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (msgId: string) => void;
  onOpenForwardBundle?: (bundle: ForwardBundlePayload) => void;
  onOpenCoT?: (msgId: string) => void;
  onContextMenu: (msg: ChatMessage) => void;
  onOpenOfflineDetail?: (sessionId: string) => void;
  onPreviewImage?: (msg: ChatMessage) => void;
  onRetryImageRecognition?: (msg: ChatMessage) => void;
  onRegenerateImage?: (msg: ChatMessage) => void;
  onRecognizeImage?: (msg: ChatMessage) => void;
  onSaveImage?: (msg: ChatMessage) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = React.memo(
  ({
    msg,
    isUser,
    avatar,
    name,
    quoteText,
    isHighlighted,
    selectionMode = false,
    isSelected = false,
    onToggleSelect,
    onOpenForwardBundle,
    onOpenCoT,
    onContextMenu,
    onOpenOfflineDetail,
    onPreviewImage,
    onRetryImageRecognition,
    onRegenerateImage,
    onRecognizeImage,
    onSaveImage,
  }) => {
    const [imgDecodeError, setImgDecodeError] = useState(false);

    // Unified Timeline System Event Card for completed Offline Sessions
    if (msg.type === 'offline_session_event' && msg.offlineEventData) {
      const ev = msg.offlineEventData;
      const timeRange = formatOfflineTimeRange(ev.startedAt, ev.endedAt);
      const durationStr = formatOfflineDuration(ev.durationMinutes, ev.startedAt, ev.endedAt);
      return (
        <div id={`msg-bubble-${msg.id}`} className="w-full flex justify-center my-2 px-2">
          <button
            type="button"
            onClick={() => {
              if (onOpenOfflineDetail && ev.sessionId) {
                onOpenOfflineDetail(ev.sessionId);
              }
            }}
            className="w-full max-w-[320px] text-left p-3.5 rounded-2xl bg-zinc-900/90 border border-indigo-500/30 hover:border-indigo-400/60 shadow-sm transition active:scale-[0.99] cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-400">
                <Sparkles className="w-3.5 h-3.5" />
                线下经历
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                <Clock className="w-3 h-3" />
                {durationStr}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-100 leading-snug">
                你和{ev.characterName || name}在「{ev.sceneName}」度过了一段时间
              </p>
              <p className="text-[11px] text-zinc-400 font-mono">{timeRange}</p>
            </div>

            {ev.summary && (
              <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed">
                {ev.summary}
              </p>
            )}

            <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[11px] font-semibold text-indigo-400">
              <span>查看经历</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      );
    }

    const isSelectable = !msg.isSystemEvent && msg.type !== 'offline_session_event';

    const renderSelectCheckbox = () => {
      if (!selectionMode || !isSelectable) return null;
      return (
        <div className="pt-2 pr-1 shrink-0 flex items-center justify-center">
          <span
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
              isSelected
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-zinc-400 dark:border-zinc-600 bg-transparent'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </span>
        </div>
      );
    };

    if (msg.type === 'offline_share_card' && msg.offlineCardData) {
      return (
        <div
          id={`msg-bubble-${msg.id}`}
          onClick={() => {
            if (selectionMode && isSelectable) {
              onToggleSelect?.(msg.id);
            }
          }}
          className={`flex items-start gap-2 transition-all duration-200 rounded-2xl p-1 ${
            selectionMode ? 'cursor-pointer' : ''
          } ${isSelected ? 'bg-emerald-500/10' : ''}`}
        >
          {renderSelectCheckbox()}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              if (!selectionMode) onContextMenu(msg);
            }}
            className={`flex-1 flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <img src={avatar} alt="" className="wx-avatar w-9 h-9 rounded-2xl object-cover border border-zinc-700 shrink-0" />
            <div className={selectionMode ? 'pointer-events-none' : ''}>
              <OfflineShareCard
                sessionId={msg.offlineCardData.sessionId}
                sceneName={msg.offlineCardData.sceneName}
                characterName={msg.offlineCardData.characterName}
                characterAvatar={msg.offlineCardData.characterAvatar}
                dateStr={msg.offlineCardData.dateStr}
                summaryText={msg.offlineCardData.summaryText}
                onOpenDetail={(sid) => {
                  if (!selectionMode && onOpenOfflineDetail) onOpenOfflineDetail(sid);
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    const isForwardBundle =
      (msg.type === 'forward_bundle' || msg.messageType === 'forward_bundle' || Boolean(msg.forwardBundle)) &&
      Boolean(msg.forwardBundle);

    if (isForwardBundle && msg.forwardBundle) {
      return (
        <div
          id={`msg-bubble-${msg.id}`}
          onClick={() => {
            if (selectionMode && isSelectable) {
              onToggleSelect?.(msg.id);
            }
          }}
          className={`flex items-start gap-2 transition-all duration-200 rounded-2xl p-1 ${
            selectionMode ? 'cursor-pointer' : ''
          } ${isHighlighted ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''} ${
            isSelected ? 'bg-emerald-500/10' : ''
          }`}
        >
          {renderSelectCheckbox()}
          <div className={`flex-1 flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            <button
              type="button"
              onClick={(e) => {
                if (selectionMode) return;
                e.stopPropagation();
                if (!isUser && onOpenCoT) {
                  onOpenCoT(msg.id);
                }
              }}
              className="wx-avatar relative shrink-0 w-9 h-9 rounded-2xl overflow-hidden border border-zinc-700 focus:outline-none"
              title={!isUser ? '点击查看 AI 思考链 (CoT)' : name}
            >
              <img src={avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selectionMode) onContextMenu(msg);
              }}
              className="max-w-[78%] min-w-0 flex flex-col"
            >
              <ForwardBundleCard
                bundle={msg.forwardBundle}
                isMe={isUser}
                disabled={selectionMode}
                onOpen={(b) => {
                  if (!selectionMode) onOpenForwardBundle?.(b);
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    const isGeneratedImage = msg.messageType === 'generated_image' || msg.type === 'generated_image';
    const recognitionStatus = msg.recognitionStatus || msg.imageAnalysisStatus;

    return (
      <div
        id={`msg-bubble-${msg.id}`}
        onClick={() => {
          if (selectionMode && isSelectable) {
            onToggleSelect?.(msg.id);
          }
        }}
        className={`flex items-start gap-2 transition-all duration-200 rounded-2xl p-1 ${
          selectionMode ? 'cursor-pointer' : ''
        } ${isHighlighted ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''} ${
          isSelected ? 'bg-emerald-500/10' : ''
        }`}
      >
        {renderSelectCheckbox()}
        <div className={`flex-1 flex items-start gap-2.5 min-w-0 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <button
          type="button"
          onClick={(e) => {
            if (selectionMode) return;
            e.stopPropagation();
            if (!isUser && onOpenCoT) {
              onOpenCoT(msg.id);
            }
          }}
          className="wx-avatar relative shrink-0 w-9 h-9 rounded-2xl overflow-hidden border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
        <div className={`max-w-[78%] min-w-0 flex flex-col ${selectionMode ? 'pointer-events-none' : ''}`}>
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              if (!selectionMode) onContextMenu(msg);
            }}
            className={`wx-message-bubble relative rounded-2xl px-3.5 py-2.5 text-xs shadow-xs whitespace-pre-wrap leading-relaxed ${
              isUser
                ? 'bg-emerald-600 text-white rounded-tr-xs chat-bubble-user wx-message-bubble-user'
                : 'bg-zinc-800 text-zinc-100 border border-zinc-750 rounded-tl-xs chat-bubble-ai wx-message-bubble-ai'
            }`}
          >
            {/* Quote Preview */}
            {quoteText && (
              <div className="wx-quote-preview mb-1.5 p-1.5 rounded-lg bg-black/25 text-[10px] text-zinc-300 border-l-2 border-emerald-400 truncate">
                引述消息: {quoteText}
              </div>
            )}

            {/* === AI Generated Image Card === */}
            {isGeneratedImage && (
              <div className="space-y-2">
                {msg.generationStatus === 'pending' && (
                  <div className="w-56 sm:w-64 rounded-xl bg-zinc-900/90 border border-zinc-700/80 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>正在为你绘制图片...</span>
                    </div>
                    <div className="h-28 rounded-lg bg-zinc-800/80 animate-pulse flex items-center justify-center">
                      <ImageIcon className="w-7 h-7 text-zinc-600" />
                    </div>
                    {msg.generationPrompt && (
                      <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {msg.generationPrompt}
                      </p>
                    )}
                  </div>
                )}

                {msg.generationStatus === 'failed' && (
                  <div className="w-56 sm:w-64 rounded-xl bg-rose-950/35 border border-rose-500/35 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>图片生成失败</span>
                    </div>
                    <p className="text-[11px] text-rose-200/85 break-words leading-relaxed">
                      {msg.generationError || '上游图像接口未返回有效图片'}
                    </p>
                    {onRegenerateImage && (
                      <button
                        type="button"
                        onClick={() => onRegenerateImage(msg)}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>重新生成</span>
                      </button>
                    )}
                  </div>
                )}

                {msg.generationStatus !== 'pending' && msg.generationStatus !== 'failed' && msg.imageUrl && (
                  <div className="space-y-1.5">
                    {!imgDecodeError ? (
                      <div className="overflow-hidden rounded-xl border border-white/15 bg-zinc-900">
                        <img
                          src={msg.imageUrl}
                          alt={msg.imageDescription || 'AI 生成图片'}
                          className="max-w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition block"
                          onClick={() => onPreviewImage?.(msg)}
                          onError={() => setImgDecodeError(true)}
                        />
                      </div>
                    ) : (
                      <div className="w-56 rounded-xl bg-rose-950/35 border border-rose-500/35 p-3 space-y-2 text-[11px] text-rose-200">
                        <p>图片资源加载失败，无法解码显示。</p>
                        {onRegenerateImage && (
                          <button
                            type="button"
                            onClick={() => {
                              setImgDecodeError(false);
                              onRegenerateImage(msg);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>重新生成</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Compact Action Bar for AI-generated image */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {onPreviewImage && (
                        <button
                          type="button"
                          onClick={() => onPreviewImage(msg)}
                          className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 text-[10px] text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          <Maximize2 className="w-2.5 h-2.5" />
                          <span>大图</span>
                        </button>
                      )}
                      {onSaveImage && (
                        <button
                          type="button"
                          onClick={() => onSaveImage(msg)}
                          className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 text-[10px] text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          <Download className="w-2.5 h-2.5" />
                          <span>保存</span>
                        </button>
                      )}
                      {onRecognizeImage && (
                        <button
                          type="button"
                          onClick={() => onRecognizeImage(msg)}
                          disabled={recognitionStatus === 'pending'}
                          className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 disabled:opacity-50 text-[10px] text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          <ScanSearch className="w-2.5 h-2.5" />
                          <span>{recognitionStatus === 'pending' ? '识别中...' : '识别此图'}</span>
                        </button>
                      )}
                      {onRegenerateImage && (
                        <button
                          type="button"
                          onClick={() => {
                            setImgDecodeError(false);
                            onRegenerateImage(msg);
                          }}
                          className="px-2 py-0.5 rounded-md bg-black/25 hover:bg-black/40 text-[10px] text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>重绘</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === Regular Attached / User Image === */}
            {!isGeneratedImage && msg.imageUrl && (
              <div className="mb-1.5 overflow-hidden rounded-xl border border-white/20 bg-black/20">
                <img
                  src={msg.imageUrl}
                  alt="图片附件"
                  className="max-w-full max-h-56 object-cover cursor-pointer hover:opacity-95 transition block"
                  onClick={() => onPreviewImage?.(msg)}
                />
              </div>
            )}

            {/* Message Text */}
            {msg.text && (
              <div className="wx-chat-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {msg.text}
              </div>
            )}

            {/* Image Recognition Pending / Failed Status (for user images or on-demand recognition) */}
            {msg.imageUrl && recognitionStatus === 'pending' && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] opacity-85">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>正在识别图片内容...</span>
              </div>
            )}

            {msg.imageUrl && recognitionStatus === 'failed' && (
              <div className="mt-1.5 p-2 rounded-lg bg-black/25 border border-rose-400/35 space-y-1.5">
                <div className="flex items-start gap-1 text-[10px] text-rose-200 leading-snug">
                  <AlertCircle className="w-3 h-3 text-rose-300 shrink-0 mt-0.5" />
                  <span className="break-words">
                    图片识别失败：{msg.recognitionError || '识别接口调用未成功（图片已保存）'}
                  </span>
                </div>
                {onRetryImageRecognition && (
                  <button
                    type="button"
                    onClick={() => onRetryImageRecognition(msg)}
                    className="px-2 py-0.5 rounded-md bg-rose-500/80 hover:bg-rose-500 text-white text-[10px] font-medium inline-flex items-center gap-1 transition cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>重试识别</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.msg.id === next.msg.id &&
      prev.msg.text === next.msg.text &&
      prev.msg.type === next.msg.type &&
      prev.msg.messageType === next.msg.messageType &&
      prev.msg.forwardBundle === next.msg.forwardBundle &&
      prev.msg.offlineEventData === next.msg.offlineEventData &&
      prev.msg.imageUrl === next.msg.imageUrl &&
      prev.msg.imageAnalysisStatus === next.msg.imageAnalysisStatus &&
      prev.msg.recognitionStatus === next.msg.recognitionStatus &&
      prev.msg.recognitionError === next.msg.recognitionError &&
      prev.msg.imageDescription === next.msg.imageDescription &&
      prev.msg.generationStatus === next.msg.generationStatus &&
      prev.msg.generationError === next.msg.generationError &&
      prev.msg.revisedPrompt === next.msg.revisedPrompt &&
      prev.msg.thinkingProcess === next.msg.thinkingProcess &&
      prev.msg.reasoningStatus === next.msg.reasoningStatus &&
      prev.msg.reasoningAvailable === next.msg.reasoningAvailable &&
      prev.msg.reasoningSource === next.msg.reasoningSource &&
      prev.msg.isRefreshed === next.msg.isRefreshed &&
      prev.msg.turnId === next.msg.turnId &&
      prev.quoteText === next.quoteText &&
      prev.isHighlighted === next.isHighlighted &&
      prev.selectionMode === next.selectionMode &&
      prev.isSelected === next.isSelected &&
      prev.avatar === next.avatar
    );
  }
);

ChatMessageBubble.displayName = 'ChatMessageBubble';
