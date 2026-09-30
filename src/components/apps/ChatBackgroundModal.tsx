import React, { useState } from 'react';
import { X, Check, Image as ImageIcon, Palette } from 'lucide-react';
import { AiCharacter } from '../../types';

interface ChatBackgroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: AiCharacter;
  onSaveBackground: (bgUrl: string | undefined) => void;
  onOpenImagePicker?: () => void;
}

export const PRESET_CHAT_BACKGROUNDS = [
  {
    id: 'default',
    name: '极简深色 (系统默认)',
    url: '',
    preview: 'bg-zinc-950',
    description: '纯粹深邃，专注文字交流',
  },
];

export const ChatBackgroundModal: React.FC<ChatBackgroundModalProps> = ({
  isOpen,
  onClose,
  character,
  onSaveBackground,
  onOpenImagePicker,
}) => {
  const [selectedUrl, setSelectedUrl] = useState<string>(character.customBackground || '');
  const [customInputUrl, setCustomInputUrl] = useState<string>('');

  if (!isOpen) return null;

  const handleApply = (url: string) => {
    setSelectedUrl(url);
    onSaveBackground(url || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-4 text-white shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-zinc-100">
              设置【{character.name}】的聊天背景
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom URL or Photo Album */}
        <div className="space-y-3 text-xs">
          <label className="block text-zinc-300 font-semibold">自定义背景图片与壁纸</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入在线图片 URL..."
              value={customInputUrl}
              onChange={(e) => setCustomInputUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs"
            />
            <button
              onClick={() => {
                if (customInputUrl.trim()) {
                  handleApply(customInputUrl.trim());
                }
              }}
              disabled={!customInputUrl.trim()}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs cursor-pointer"
            >
              应用
            </button>
          </div>

          {onOpenImagePicker && (
            <button
              onClick={() => {
                onClose();
                onOpenImagePicker();
              }}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>从手机相册选择图片作为背景</span>
            </button>
          )}
        </div>

        {/* Reset / Clear Button */}
        {selectedUrl ? (
          <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">当前已启用自定义背景</span>
            <button
              onClick={() => handleApply('')}
              className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs cursor-pointer"
            >
              恢复默认纯色
            </button>
          </div>
        ) : (
          <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-500 text-center">
            默认全黑/纯净壁纸已生效
          </div>
        )}
      </div>
    </div>
  );
};
