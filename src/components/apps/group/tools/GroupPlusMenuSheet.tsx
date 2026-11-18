import React, { useState } from 'react';
import {
  ListOrdered,
  BarChart3,
  Dices,
  Image as ImageIcon,
  Camera,
  FolderOpen,
  X,
  AlertCircle,
} from 'lucide-react';
import { androidPermissionBridgeClient } from '../../../../lib/agent/AndroidPermissionBridgeClient';

interface GroupPlusMenuSheetProps {
  onSelectRelay: () => void;
  onSelectPoll: () => void;
  onSelectRandomDraw: () => void;
  onPhotoPickedDataUrl: (dataUrl: string, source: 'camera' | 'gallery') => void;
  onTriggerWebFilePicker: (useCameraCapture: boolean) => void;
  onClose: () => void;
}

export const GroupPlusMenuSheet: React.FC<GroupPlusMenuSheetProps> = ({
  onSelectRelay,
  onSelectPoll,
  onSelectRandomDraw,
  onPhotoPickedDataUrl,
  onTriggerWebFilePicker,
  onClose,
}) => {
  const [showPhotoSubMenu, setShowPhotoSubMenu] = useState(false);
  const [photoStatusMsg, setPhotoStatusMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isNative = androidPermissionBridgeClient.isNativeAndroid();

  const handleNativeCamera = async () => {
    setPhotoStatusMsg(null);
    if (!isNative) {
      setPhotoStatusMsg(
        '当前为 Web 预览环境，无法调用 Android 原生相机；已为您切换浏览器拍照/文件选择（真机 APK 支持原生相机）。'
      );
      onTriggerWebFilePicker(true);
      return;
    }
    setIsBusy(true);
    try {
      const res = await androidPermissionBridgeClient.takeGroupPhotoWithCamera();
      if (res.success && res.dataUrl) {
        onPhotoPickedDataUrl(res.dataUrl, 'camera');
        onClose();
      } else if (!res.cancelled) {
        setPhotoStatusMsg(res.message || '未能获取相机拍摄照片，请检查相机权限。');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleNativeGallery = async () => {
    setPhotoStatusMsg(null);
    if (!isNative) {
      setPhotoStatusMsg(
        '当前为 Web 预览环境，已打开本地图片选择器压缩上传；真机 Android APK 将调用系统 Photo Picker。'
      );
      onTriggerWebFilePicker(false);
      return;
    }
    setIsBusy(true);
    try {
      const res = await androidPermissionBridgeClient.pickGroupPhotoFromGallery();
      if (res.success && res.dataUrl) {
        onPhotoPickedDataUrl(res.dataUrl, 'gallery');
        onClose();
      } else if (!res.cancelled) {
        setPhotoStatusMsg(res.message || '未能读取相册图片，请重试。');
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="wx-composer border-t border-zinc-300/70 dark:border-zinc-800 bg-[#F7F7F7] dark:bg-zinc-900 px-4 py-3.5 shrink-0 select-none">
      {photoStatusMsg && (
        <div className="mb-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">{photoStatusMsg}</span>
          <button
            type="button"
            onClick={() => setPhotoStatusMsg(null)}
            className="text-amber-600 dark:text-amber-300 p-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {!showPhotoSubMenu ? (
        <div className="grid grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectRelay();
            }}
            className="flex flex-col items-center justify-center gap-1.5 py-2 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer min-h-[72px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-2xs text-emerald-600 dark:text-emerald-400">
              <ListOrdered className="w-5 h-5" />
            </div>
            <span className="wx-secondary-text text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              群接龙
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectPoll();
            }}
            className="flex flex-col items-center justify-center gap-1.5 py-2 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer min-h-[72px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-2xs text-blue-600 dark:text-blue-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="wx-secondary-text text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              发起投票
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectRandomDraw();
            }}
            className="flex flex-col items-center justify-center gap-1.5 py-2 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer min-h-[72px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-2xs text-amber-600 dark:text-amber-400">
              <Dices className="w-5 h-5" />
            </div>
            <span className="wx-secondary-text text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              随机抽人
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowPhotoSubMenu(true)}
            className="flex flex-col items-center justify-center gap-1.5 py-2 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer min-h-[72px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-2xs text-purple-600 dark:text-purple-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="wx-secondary-text text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              图片
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="wx-primary-text text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              发送图片到群聊
            </span>
            <button
              type="button"
              onClick={() => setShowPhotoSubMenu(false)}
              className="wx-secondary-text text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-1 cursor-pointer"
            >
              返回工具栏
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleNativeCamera}
              className="min-h-[44px] px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 flex items-center justify-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>拍照</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleNativeGallery}
              className="min-h-[44px] px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500/50 flex items-center justify-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>从相册选择</span>
            </button>
          </div>
          {!isNative && (
            <p className="wx-muted-text text-[10px] text-zinc-500 dark:text-zinc-400">
              当前处于 Web 预览模式，选择相册将使用浏览器本地文件并压缩；Android APK 真机上将直接调起系统相机与 Photo Picker。
            </p>
          )}
        </div>
      )}
    </div>
  );
};
