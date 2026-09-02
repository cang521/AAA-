import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon, Check } from 'lucide-react';

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
  title?: string;
}

const PRESET_IMAGES = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
];

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectImage,
  title = '选取图片',
}) => {
  const [customUrl, setCustomUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    if (preview) {
      onSelectImage(preview);
    } else if (customUrl.trim()) {
      onSelectImage(customUrl.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Local File Upload */}
        <div className="mb-4">
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-2xl cursor-pointer bg-zinc-850 hover:bg-zinc-800 transition">
            <Upload className="w-6 h-6 text-zinc-400 mb-1" />
            <span className="text-xs text-zinc-300 font-medium">从手机相册上传图片</span>
            <span className="text-[10px] text-zinc-500 mt-0.5">支持 PNG, JPG, WebP</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* URL Input */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-1">图片 URL 链接</label>
          <input
            type="text"
            placeholder="https://..."
            value={customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value);
              setPreview(e.target.value);
            }}
            className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Presets Grid */}
        <div className="mb-4">
          <span className="block text-xs text-zinc-400 mb-2">预设图标与壁纸</span>
          <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto pr-1">
            {PRESET_IMAGES.map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPreview(img);
                  setCustomUrl(img);
                }}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
                  preview === img ? 'border-emerald-500 scale-95' : 'border-transparent hover:border-zinc-600'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
                {preview === img && (
                  <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-sm"
          >
            确认使用
          </button>
        </div>
      </div>
    </div>
  );
};
