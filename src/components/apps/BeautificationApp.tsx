import React, { useState } from 'react';
import { AppIconConfig, ApiLog, ApiConfig } from '../../types';
import {
  ArrowLeft,
  Palette,
  Image as ImageIcon,
  Lock,
  Code,
  Sparkles,
  CheckCircle,
  Save,
  Key,
  Smartphone,
  Crop,
  RotateCcw,
} from 'lucide-react';
import { ImagePickerModal } from '../ImagePickerModal';
import { IconCropperModal } from '../IconCropperModal';

interface BeautificationAppProps {
  onBackToLauncher: () => void;
  desktopWallpaper: string;
  lockWallpaper: string;
  customCss: string;
  pinCode: string;
  isPinEnabled: boolean;
  icons: AppIconConfig[];
  apiConfig?: ApiConfig;
  onUpdateDesktopWallpaper: (url: string) => void;
  onUpdateLockWallpaper: (url: string) => void;
  onUpdateCustomCss: (css: string) => void;
  onUpdatePinCode: (pin: string) => void;
  onUpdatePinEnabled: (enabled: boolean) => void;
  onUpdateIcons: (icons: AppIconConfig[]) => void;
  onAddApiLog: (log: ApiLog) => void;
}

export const BeautificationApp: React.FC<BeautificationAppProps> = ({
  onBackToLauncher,
  desktopWallpaper,
  lockWallpaper,
  customCss,
  pinCode,
  isPinEnabled,
  icons,
  apiConfig,
  onUpdateDesktopWallpaper,
  onUpdateLockWallpaper,
  onUpdateCustomCss,
  onUpdatePinCode,
  onUpdatePinEnabled,
  onUpdateIcons,
  onAddApiLog,
}) => {
  const [cssCode, setCssCode] = useState(customCss);
  const [pinInput, setPinInput] = useState(pinCode);
  const [pinToggle, setPinToggle] = useState(isPinEnabled);

  const [activePicker, setActivePicker] = useState<'desktop' | 'lock' | null>(null);
  const [croppingTargetIcon, setCroppingTargetIcon] = useState<AppIconConfig | null>(null);
  const [isFixingCss, setIsFixingCss] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleFixCssWithAi = async () => {
    if (!cssCode.trim()) return;
    setIsFixingCss(true);
    try {
      const res = await fetch('/api/gemini/fix-css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCss: cssCode, apiConfig }),
      });
      const data = await res.json();
      if (data.success) {
        setCssCode(data.css);
        onUpdateCustomCss(data.css);
        if (data.apiLog) onAddApiLog(data.apiLog);
        setSuccessMsg('AI 已成功修复 CSS 并完成手机自适应适配！');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (e) {
      console.error('Fix CSS error', e);
    } finally {
      setIsFixingCss(false);
    }
  };

  const handleSavePin = () => {
    if (pinInput.length === 4) {
      onUpdatePinCode(pinInput);
      onUpdatePinEnabled(pinToggle);
      setSuccessMsg('密码锁屏设置已更新！');
      setTimeout(() => setSuccessMsg(''), 2500);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>⬅ 返回桌面</span>
        </button>
        <span className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-purple-400" />
          界面美化与 CSS 自适应
        </span>
        <div className="w-16" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 text-xs">
        {successMsg && (
          <div className="p-3 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-purple-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. Wallpaper Settings */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-purple-400 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            1. 壁纸管理 (桌面 & 锁屏)
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Desktop Wallpaper */}
            <div className="space-y-2 text-center">
              <span className="block text-zinc-400 font-medium">桌面壁纸</span>
              <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-zinc-700 shadow-md">
                <img src={desktopWallpaper} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setActivePicker('desktop')}
                  className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white font-medium transition"
                >
                  更换壁纸
                </button>
              </div>
            </div>

            {/* Lock Wallpaper */}
            <div className="space-y-2 text-center">
              <span className="block text-zinc-400 font-medium">锁屏壁纸</span>
              <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-zinc-700 shadow-md">
                <img src={lockWallpaper} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setActivePicker('lock')}
                  className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white font-medium transition"
                >
                  更换壁纸
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Lockscreen Password Settings */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            2. 锁屏与安全密码
          </h3>

          <div className="flex items-center justify-between py-1">
            <span className="font-medium text-zinc-200">开启数字密码锁屏</span>
            <input
              type="checkbox"
              checked={pinToggle}
              onChange={(e) => setPinToggle(e.target.checked)}
              className="w-5 h-5 accent-amber-500 cursor-pointer"
            />
          </div>

          {pinToggle && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <label className="block text-zinc-400">设置 4 位数字密码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-center font-mono text-base tracking-widest text-white"
                />
                <button
                  onClick={handleSavePin}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 font-medium text-zinc-950"
                >
                  重置密码
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Advanced Custom CSS Editor (with AI One-click Repair) */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
              <Code className="w-4 h-4" />
              3. 高级 CSS 美化 (智能屏自适应)
            </h3>
            <span className="text-[10px] text-zinc-400">自动解析 375-430px</span>
          </div>

          <p className="text-[11px] text-zinc-400">
            在下方自由输入自定义 CSS 代码。若出现样式错乱或无法使用，可一键调用 API 让 AI 自动修复并适配手机屏幕。
          </p>

          <textarea
            rows={6}
            value={cssCode}
            onChange={(e) => {
              setCssCode(e.target.value);
              onUpdateCustomCss(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-xl bg-zinc-850 border border-zinc-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-purple-500"
          />

          <button
            onClick={handleFixCssWithAi}
            disabled={isFixingCss || !cssCode.trim()}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{isFixingCss ? 'AI 智能分析并修复 CSS 中...' : '✨ 一键调用 API 修复 & 智能自适应 CSS'}</span>
          </button>
        </div>

        {/* 4. App Name & Icon Beautification */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <h3 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            4. 应用名称与图标美化
          </h3>
          <p className="text-[11px] text-zinc-400">
            自定义桌面各个应用显示的名称与对应图标图标/自定义图片：
          </p>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {icons.map((icon) => (
              <div
                key={icon.id}
                className="p-2.5 rounded-2xl bg-zinc-850 border border-zinc-750 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0 overflow-hidden">
                    {icon.customImage ? (
                      <img src={icon.customImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-purple-300">{icon.name.slice(0, 2)}</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={icon.name}
                    onChange={(e) => {
                      const updated = icons.map((i) =>
                        i.id === icon.id ? { ...i, name: e.target.value } : i
                      );
                      onUpdateIcons(updated);
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="应用名称"
                  />
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setCroppingTargetIcon(icon)}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 font-semibold text-[11px] border border-purple-500/40 flex items-center gap-1 transition"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>选择图片裁剪</span>
                  </button>

                  {icon.customImage && (
                    <button
                      onClick={() => {
                        const updated = icons.map((i) =>
                          i.id === icon.id ? { ...i, customImage: undefined } : i
                        );
                        onUpdateIcons(updated);
                      }}
                      className="p-1.5 rounded-xl bg-zinc-750 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
                      title="重置图标"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Requirement 3: Bottom Sticky "Save Settings" Action Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 z-20 shrink-0 flex items-center justify-between gap-3">
        <span className="text-[11px] text-zinc-400">已对壁纸、CSS与应用图标做出的美化修改</span>
        <button
          onClick={() => {
            onUpdateCustomCss(cssCode);
            handleSavePin();
            setSuccessMsg('🎉 所有美化、应用图标与自适应设置已成功保存！');
            setTimeout(() => setSuccessMsg(''), 3000);
          }}
          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>保存设置</span>
        </button>
      </div>

      {/* Image Picker for Wallpapers */}
      {activePicker && (
        <ImagePickerModal
          isOpen={Boolean(activePicker)}
          onClose={() => setActivePicker(null)}
          title={activePicker === 'desktop' ? '选取桌面壁纸' : '选取锁屏壁纸'}
          onSelectImage={(url) => {
            if (activePicker === 'desktop') onUpdateDesktopWallpaper(url);
            if (activePicker === 'lock') onUpdateLockWallpaper(url);
          }}
        />
      )}

      {/* Icon Cropper Modal */}
      {croppingTargetIcon && (
        <IconCropperModal
          isOpen={Boolean(croppingTargetIcon)}
          onClose={() => setCroppingTargetIcon(null)}
          iconName={croppingTargetIcon.name}
          initialImageUrl={croppingTargetIcon.customImage}
          onCropComplete={(croppedDataUrl) => {
            const updated = icons.map((i) =>
              i.id === croppingTargetIcon.id ? { ...i, customImage: croppedDataUrl } : i
            );
            onUpdateIcons(updated);
            setSuccessMsg(`🎉 已将裁剪后的图片设置为 【${croppingTargetIcon.name}】 的图标！`);
            setTimeout(() => setSuccessMsg(''), 3000);
          }}
        />
      )}
    </div>
  );
};
