import React, { useState } from 'react';
import { X, Check, Image as ImageIcon, Sparkles, RefreshCw, Palette } from 'lucide-react';
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
    name: '极简深色 (默认)',
    url: '',
    preview: 'bg-zinc-950',
    description: '纯粹深邃，专注文字交流',
  },
  {
    id: 'starry_sky',
    name: '浩瀚星空',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=300&q=80',
    description: '静谧璀璨的银河星光',
  },
  {
    id: 'sakura_dream',
    name: '樱花梦境',
    url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=300&q=80',
    description: '浪漫梦幻的春日樱花漫舞',
  },
  {
    id: 'bamboo_forest',
    name: '晨曦竹林',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=300&q=80',
    description: '清新怡人的晨光林海',
  },
  {
    id: 'sunset_twilight',
    name: '暮光日落',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=300&q=80',
    description: '温柔如金的暮光海岸',
  },
  {
    id: 'warm_coffee',
    name: '温暖咖啡',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=300&q=80',
    description: '午后惬意的暖心书吧',
  },
  {
    id: 'city_neon',
    name: '赛博霓虹',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
    preview: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=300&q=80',
    description: '未来都市的雨夜微光',
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

        {/* Preset Wallpapers */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span>精选沉浸主题背景</span>
            <span className="text-[10px] text-zinc-500">点击即时应用</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {PRESET_CHAT_BACKGROUNDS.map((preset) => {
              const isSelected = selectedUrl === preset.url;
              return (
                <div
                  key={preset.id}
                  onClick={() => handleApply(preset.url)}
                  className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer p-2 flex flex-col justify-between h-24 ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-850'
                  }`}
                  style={
                    preset.url
                      ? {
                          backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.2)), url(${preset.preview})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : {}
                  }
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-white drop-shadow-md">
                      {preset.name}
                    </span>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-300 drop-shadow-sm truncate">
                    {preset.description}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom URL or Photo Album */}
        <div className="space-y-2 pt-3 border-t border-zinc-800 text-xs">
          <label className="block text-zinc-300 font-semibold">自定义背景图片</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入在线图片 URL..."
              value={customInputUrl}
              onChange={(e) => setCustomInputUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs"
            />
            <button
              onClick={() => {
                if (customInputUrl.trim()) {
                  handleApply(customInputUrl.trim());
                }
              }}
              disabled={!customInputUrl.trim()}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs cursor-pointer"
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
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>从相册选择图片作为背景</span>
            </button>
          )}
        </div>

        {/* Reset / Clear Button */}
        {selectedUrl && (
          <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">当前已启用自定义背景</span>
            <button
              onClick={() => handleApply('')}
              className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs cursor-pointer"
            >
              恢复默认纯色
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
