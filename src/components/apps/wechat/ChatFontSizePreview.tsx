import React from 'react';
import { clampChatMessageFontSize } from '../../../lib/chatDisplayPreferences';

interface ChatFontSizePreviewProps {
  characterName: string;
  characterAvatar: string;
  userAvatar: string;
  fontSize: number;
  customBackground?: string;
}

/**
 * Static, side-effect-free real-time preview of 1-on-1 chat bubbles.
 * Inherits the active WeChat theme (default / classic), light/dark mode CSS tokens,
 * optional custom chat background, and the exact `--chat-message-font-size` variable.
 */
export const ChatFontSizePreview: React.FC<ChatFontSizePreviewProps> = React.memo(
  ({ characterName, characterAvatar, userAvatar, fontSize, customBackground }) => {
    const safeFontSize = clampChatMessageFontSize(fontSize, 12);

    return (
      <div
        data-global-font-excluded="true"
        className="wx-chat-viewport wx-font-preview-frame wechat-chat-font-isolated w-full rounded-2xl border border-zinc-750 bg-zinc-950 relative overflow-hidden p-3"
        style={
          {
            '--chat-message-font-size': `${safeFontSize}px`,
            ...(customBackground
              ? {
                  backgroundImage: `url(${customBackground})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : {}),
          } as React.CSSProperties
        }
      >
        {customBackground && (
          <div className="wx-chat-bg-overlay absolute inset-0 bg-black/55 backdrop-blur-[1px] pointer-events-none z-0" />
        )}

        <div className="relative z-10 space-y-2.5">
          {/* Short Time Divider */}
          <div className="flex justify-center select-none">
            <span className="wx-time-divider px-2.5 py-0.5 rounded-md bg-zinc-800/60 text-[10px] font-medium text-zinc-400 shadow-2xs">
              14:20
            </span>
          </div>

          {/* Left AI Sample Message */}
          <div className="flex items-start gap-2">
            <img
              src={characterAvatar}
              alt=""
              className="wx-avatar w-8 h-8 rounded-2xl object-cover border border-zinc-700 shrink-0"
            />
            <div className="max-w-[78%] min-w-0 flex flex-col items-start">
              <span className="wx-secondary-text text-[10px] text-zinc-400 mb-1 truncate max-w-full">
                {characterName || 'AI 好友'}
              </span>
              <div className="wx-message-bubble relative rounded-2xl px-3.5 py-2 text-xs shadow-xs whitespace-pre-wrap bg-zinc-800 text-zinc-100 border border-zinc-750 rounded-tl-xs chat-bubble-ai wx-message-bubble-ai">
                <div className="wx-chat-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  这是调节后的聊天文字效果，可以看看是否清楚舒服。
                </div>
              </div>
            </div>
          </div>

          {/* Right User Sample Message (Chinese + English + Emoji + Multi-line wrapping) */}
          <div className="flex items-start gap-2 flex-row-reverse">
            <img
              src={userAvatar}
              alt=""
              className="wx-avatar w-8 h-8 rounded-2xl object-cover border border-zinc-700 shrink-0"
            />
            <div className="max-w-[78%] min-w-0 flex flex-col items-end">
              <div className="wx-message-bubble relative rounded-2xl px-3.5 py-2 text-xs shadow-xs whitespace-pre-wrap bg-emerald-600 text-white rounded-tr-xs chat-bubble-user wx-message-bubble-user">
                <div className="wx-chat-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {'Hello～今天也要开心呀 ✨\n嗯，这个大小看起来刚刚好～'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatFontSizePreview.displayName = 'ChatFontSizePreview';
