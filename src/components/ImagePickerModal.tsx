import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
  title?: string;
}

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

        {/* Selected Image Preview */}
        {preview && (
          <div className="mb-4 p-2.5 rounded-2xl bg-zinc-850 border border-zinc-800 flex items-center gap-3">
            <img src={preview} alt="预览" className="w-12 h-12 rounded-xl object-cover border border-zinc-700" />
            <div className="flex-1 min-w-0 text-xs">
              <p className="text-zinc-200 font-medium truncate">已选图片预览</p>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setCustomUrl('');
                }}
                className="text-[10px] text-rose-400 hover:underline mt-0.5"
              >
                清除选择
              </button>
            </div>
          </div>
        )}

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
            disabled={!preview && !customUrl.trim()}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white transition shadow-sm"
          >
            确认使用
          </button>
        </div>
      </div>
    </div>
  );
};
