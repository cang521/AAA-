import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, ZoomIn, ZoomOut, RotateCw, Check, Image as ImageIcon } from 'lucide-react';
import { CLOUD_MILK_DESKTOP_WALLPAPER, DEFAULT_AI_AVATAR, DEFAULT_USER_AVATAR } from '../lib/storage';

interface IconCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  iconName: string;
  initialImageUrl?: string;
  onCropComplete: (croppedDataUrl: string) => void;
}

export const IconCropperModal: React.FC<IconCropperModalProps> = ({
  isOpen,
  onClose,
  iconName,
  initialImageUrl,
  onCropComplete,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(
    initialImageUrl || DEFAULT_AI_AVATAR
  );
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [customUrlInput, setCustomUrlInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Remove sample preset pictures
  useEffect(() => {
    if (initialImageUrl) {
      setImageSrc(initialImageUrl);
    }
  }, [initialImageUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setZoom(1);
          setOffsetX(0);
          setOffsetY(0);
          setRotation(0);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropAndSave = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fill background
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      // Move to canvas center
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Draw image centered with offset
      const aspect = img.width / img.height;
      let drawW = size;
      let drawH = size;
      if (aspect > 1) {
        drawH = size;
        drawW = size * aspect;
      } else {
        drawW = size;
        drawH = size / aspect;
      }

      ctx.drawImage(img, -drawW / 2 + offsetX, -drawH / 2 + offsetY, drawW, drawH);
      ctx.restore();

      const croppedDataUrl = canvas.toDataURL('image/png', 0.95);
      onCropComplete(croppedDataUrl);
      onClose();
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-zinc-850 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm text-zinc-100">裁剪 & 美化图标 - {iconName}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-xl text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* File Upload & Sample Pickers */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>选择本地图片</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* URL Input */}
          <div className="space-y-1">
            <span className="block text-[11px] text-zinc-400">或输入图片 URL:</span>
            <input
              type="text"
              placeholder="https://..."
              value={customUrlInput}
              onChange={(e) => {
                setCustomUrlInput(e.target.value);
                if (e.target.value.trim()) {
                  setImageSrc(e.target.value.trim());
                  setZoom(1);
                  setOffsetX(0);
                  setOffsetY(0);
                  setRotation(0);
                }
              }}
              className="w-full px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-xs"
            />
          </div>

          {/* Interactive Crop Mask Preview Box */}
          <div className="flex flex-col items-center justify-center space-y-2 py-2">
            <span className="text-[10px] text-zinc-400">图标实时效果展示 (居中自动适配):</span>
            <div className="relative w-40 h-40 rounded-3xl overflow-hidden border-2 border-purple-500 shadow-xl bg-zinc-950 flex items-center justify-center">
              <div
                className="w-full h-full flex items-center justify-center transition-transform duration-75"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px)`,
                }}
              >
                <img
                  src={imageSrc}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                />
              </div>
              <div className="absolute inset-0 border-2 border-white/20 rounded-3xl pointer-events-none" />
            </div>
          </div>

          {/* Controls: Zoom & Rotation & Offsets */}
          <div className="space-y-3 p-3 rounded-2xl bg-zinc-850 border border-zinc-800">
            {/* Zoom Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-300">
                <span className="flex items-center gap-1">
                  <ZoomIn className="w-3 h-3 text-purple-400" />
                  缩放比例
                </span>
                <span className="font-mono text-purple-300">{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* Offsets (Horizontal & Vertical Pan) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">水平偏移 (X)</label>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseInt(e.target.value))}
                  className="w-full accent-purple-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">垂直偏移 (Y)</label>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseInt(e.target.value))}
                  className="w-full accent-purple-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Rotation Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-[11px] flex items-center gap-1 border border-zinc-700"
              >
                <RotateCw className="w-3.5 h-3.5 text-purple-400" />
                <span>旋转 90° ({rotation}°)</span>
              </button>

              <button
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                className="text-[10px] text-zinc-400 hover:text-white underline"
              >
                重置位置
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-zinc-850 border-t border-zinc-800 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-semibold text-xs"
          >
            取消
          </button>
          <button
            onClick={handleCropAndSave}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition"
          >
            <Check className="w-4 h-4" />
            <span>完成裁剪并应用</span>
          </button>
        </div>
      </div>
    </div>
  );
};
