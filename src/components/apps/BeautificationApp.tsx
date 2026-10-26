import React, { useState } from 'react';
import { apiFetch } from '../../lib/localBackend';
import { AppIconConfig, ApiLog, ApiConfig, ThemeId, WallpaperSource } from '../../types';
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
  Sun,
  Moon,
  Monitor,
  X,
} from 'lucide-react';
import { ImagePickerModal } from '../ImagePickerModal';
import { IconCropperModal } from '../IconCropperModal';
import { lockSecurityService, LockType } from '../../lib/lockScreenSecurity';
import { GestureLock } from '../GestureLock';
import { Shield, Grid3X3 } from 'lucide-react';

interface BeautificationAppProps {
  onBackToLauncher: () => void;
  onLockPhone?: () => void;
  desktopWallpaper: string;
  lockWallpaper: string;
  customCss: string;
  pinCode: string;
  isPinEnabled: boolean;
  currentTheme?: ThemeId;
  wallpaperSource?: WallpaperSource;
  customDesktopWallpaper?: string;
  customLockWallpaper?: string;
  icons: AppIconConfig[];
  apiConfig?: ApiConfig;
  onUpdateTheme?: (theme: ThemeId) => void;
  onUpdateWallpaperSource?: (source: WallpaperSource) => void;
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
  onLockPhone,
  desktopWallpaper,
  lockWallpaper,
  customCss,
  pinCode,
  isPinEnabled,
  currentTheme = 'default',
  wallpaperSource = 'default',
  customDesktopWallpaper,
  customLockWallpaper,
  icons,
  apiConfig,
  onUpdateTheme,
  onUpdateWallpaperSource,
  onUpdateDesktopWallpaper,
  onUpdateLockWallpaper,
  onUpdateCustomCss,
  onUpdatePinCode,
  onUpdatePinEnabled,
  onUpdateIcons,
  onAddApiLog,
}) => {
  const [cssCode, setCssCode] = useState(customCss);
  const [isLockEnabled, setIsLockEnabled] = useState(lockSecurityService.getIsLockEnabled());
  const [lockType, setLockType] = useState<LockType>(lockSecurityService.getLockType());
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showGestureSetupModal, setShowGestureSetupModal] = useState(false);

  // Verification modal before turning off lock
  const [showVerifyCurrentModal, setShowVerifyCurrentModal] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyAction, setVerifyAction] = useState<'disable' | null>(null);

  const [activePicker, setActivePicker] = useState<'desktop' | 'lock' | null>(null);
  const [croppingTargetIcon, setCroppingTargetIcon] = useState<AppIconConfig | null>(null);
  const [isFixingCss, setIsFixingCss] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showThemeWallpaperModal, setShowThemeWallpaperModal] = useState(false);

  const handleFixCssWithAi = async () => {
    if (!cssCode.trim()) return;
    setIsFixingCss(true);
    try {
      const res = await apiFetch('/api/gemini/fix-css', {
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

  const handleSavePin = async () => {
    if (newPinInput.length === 4) {
      await lockSecurityService.setPinCode(newPinInput);
      onUpdatePinCode(newPinInput);
      onUpdatePinEnabled(isLockEnabled);
      setSuccessMsg('密码锁屏设置已成功安全更新！');
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
          界面美化与主题系统
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

        {/* 0. System Global Theme & Appearance Mode Selector */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm card-box">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-sky-400 flex items-center gap-2">
              <Sun className="w-4 h-4 text-sky-400" />
              外观模式 (Appearance Mode)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-medium">
              全局自动响应
            </span>
          </div>

          <p className="text-[11px] text-zinc-400">
            切换整个小手机 App 的白天/黑夜外观，页面、弹窗、输入框与 Widget 均实时随全局主题同步：
          </p>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {/* Option 1: Light Mode (白天模式) */}
            <div
              onClick={() => {
                setShowThemeWallpaperModal(true);
              }}
              className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${
                currentTheme === 'light' || currentTheme === 'cloud_milk'
                  ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 ring-2 ring-sky-400/40 shadow-sm'
                  : 'bg-zinc-850 border-zinc-750 hover:border-sky-400/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-sky-600 dark:text-sky-300 flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>白天模式</span>
                </span>
                {(currentTheme === 'light' || currentTheme === 'cloud_milk') && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500 text-white font-semibold">当前</span>
                )}
              </div>
              <div className="flex items-center gap-1 py-1">
                <span className="w-3.5 h-3.5 rounded-full bg-[#F5FBFF] border border-[#CFE9F8]" title="#F5FBFF (背景)" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#FFFFFF] border border-[#CFE9F8]" title="#FFFFFF (卡片)" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#67B7EA]" title="#67B7EA (天蓝)" />
              </div>
              <span className="text-[9px] text-zinc-400">明亮清爽·晴空牛奶蓝</span>
            </div>

            {/* Option 2: Dark Mode (黑夜模式) */}
            <div
              onClick={() => {
                if (onUpdateTheme) onUpdateTheme('dark');
                setSuccessMsg('已应用：全局黑夜模式 (云海夜空)');
                setTimeout(() => setSuccessMsg(''), 2500);
              }}
              className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${
                currentTheme === 'dark' || currentTheme === 'default'
                  ? 'bg-zinc-800 border-sky-400 ring-2 ring-sky-400/40 shadow-sm'
                  : 'bg-zinc-850 border-zinc-750 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-zinc-100 flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                  <span>黑夜模式</span>
                </span>
                {(currentTheme === 'dark' || currentTheme === 'default') && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500 text-white font-semibold">当前</span>
                )}
              </div>
              <div className="flex items-center gap-1 py-1">
                <span className="w-3.5 h-3.5 rounded-full bg-[#090D12] border border-zinc-700" title="#090D12 (夜空黑)" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#121820] border border-zinc-700" title="#121820 (深色卡片)" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#38BDF8]" title="#38BDF8 (天空蓝)" />
              </div>
              <span className="text-[9px] text-zinc-400">深沉护眼·夜空天空蓝</span>
            </div>

            {/* Option 3: Follow System (跟随系统) */}
            <div
              onClick={() => {
                if (onUpdateTheme) onUpdateTheme('system');
                setSuccessMsg('已应用：自动跟随系统外观设置');
                setTimeout(() => setSuccessMsg(''), 2500);
              }}
              className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${
                currentTheme === 'system'
                  ? 'bg-zinc-800 border-sky-400 ring-2 ring-sky-400/40 shadow-sm'
                  : 'bg-zinc-850 border-zinc-750 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-zinc-100 flex items-center gap-1">
                  <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                  <span>跟随系统</span>
                </span>
                {currentTheme === 'system' && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500 text-white font-semibold">当前</span>
                )}
              </div>
              <div className="flex items-center gap-1 py-1">
                <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-r from-amber-400 to-sky-500" title="Auto" />
                <span className="w-3.5 h-3.5 rounded-full bg-zinc-700" title="System" />
              </div>
              <span className="text-[9px] text-zinc-400">设备系统主题感应</span>
            </div>
          </div>
        </div>

        {/* 1. Wallpaper Settings & Source Selection */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-purple-400 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              1. 壁纸管理 (桌面 & 锁屏)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
              {wallpaperSource === 'theme' ? '🌸 主题配套' : wallpaperSource === 'custom' ? '🖼️ 自定义' : '🌌 默认静谧'}
            </span>
          </div>

          {/* Wallpaper Source Selection Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-850 border border-zinc-750 text-[11px]">
            <button
              onClick={() => {
                if (onUpdateWallpaperSource) onUpdateWallpaperSource('theme');
                setSuccessMsg('已应用：主题配套云朵壁纸');
                setTimeout(() => setSuccessMsg(''), 2000);
              }}
              className={`flex-1 py-1.5 rounded-xl font-medium transition ${
                wallpaperSource === 'theme'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🌸 主题壁纸
            </button>
            <button
              onClick={() => {
                if (onUpdateWallpaperSource) onUpdateWallpaperSource('default');
                setSuccessMsg('已恢复：默认静谧壁纸');
                setTimeout(() => setSuccessMsg(''), 2000);
              }}
              className={`flex-1 py-1.5 rounded-xl font-medium transition ${
                wallpaperSource === 'default'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🌌 默认壁纸
            </button>
            <button
              onClick={() => {
                if (onUpdateWallpaperSource) onUpdateWallpaperSource('custom');
                setSuccessMsg('已切换为：自定义壁纸');
                setTimeout(() => setSuccessMsg(''), 2000);
              }}
              className={`flex-1 py-1.5 rounded-xl font-medium transition ${
                wallpaperSource === 'custom'
                  ? 'bg-sky-500 text-white shadow-xs font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🖼️ 自定义壁纸
            </button>
          </div>

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

        {/* 2. Lockscreen Password Security Management System */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>2. 锁屏与安全密码中心</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
              isLockEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {isLockEnabled ? (lockType === 'pattern' ? '✍️ 手势密码保护中' : '🔢 数字密码保护中') : '🔓 锁屏未开启'}
            </span>
          </div>

          {/* Master Lock Protection Switch */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-850 border border-zinc-750">
            <div>
              <div className="font-semibold text-xs text-zinc-100">开启模拟手机锁屏保护</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                支持数字 PIN 与九宫格手势连线解锁，密码均经 Salted SHA-256 加密保存
              </div>
            </div>
            <button
              onClick={() => {
                if (isLockEnabled) {
                  // Prompt to verify before disabling lock
                  setVerifyAction('disable');
                  setShowVerifyCurrentModal(true);
                } else {
                  lockSecurityService.setLockEnabled(true);
                  setIsLockEnabled(true);
                  onUpdatePinEnabled(true);
                  setSuccessMsg('已开启锁屏保护！');
                  setTimeout(() => setSuccessMsg(''), 2500);
                }
              }}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                isLockEnabled ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                  isLockEnabled ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {isLockEnabled && (
            <div className="space-y-3 pt-1">
              {/* Lock Type Selector (Digital PIN vs Gesture Pattern) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 block">选择解锁方式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      lockSecurityService.setLockType('pin');
                      setLockType('pin');
                      setSuccessMsg('已切换为 4位数字密码 解锁模式');
                      setTimeout(() => setSuccessMsg(''), 2000);
                    }}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      lockType === 'pin'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold shadow-sm'
                        : 'bg-zinc-850 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Key className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs">数字 PIN 密码</div>
                      <div className="text-[9px] text-zinc-400 font-normal">4位极速数字键盘</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (!lockSecurityService.hasPatternSet()) {
                        setShowGestureSetupModal(true);
                      } else {
                        lockSecurityService.setLockType('pattern');
                        setLockType('pattern');
                        setSuccessMsg('已切换为 九宫格手势密码 解锁模式');
                        setTimeout(() => setSuccessMsg(''), 2000);
                      }
                    }}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                      lockType === 'pattern'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold shadow-sm'
                        : 'bg-zinc-850 border-zinc-750 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Grid3X3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs">九宫格手势密码</div>
                      <div className="text-[9px] text-zinc-400 font-normal">连线连点图样解锁</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Digital PIN Configuration Panel */}
              {lockType === 'pin' && (
                <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                    <span>设置/修改数字 PIN 密码</span>
                    <span className="text-[10px] text-emerald-400 font-mono">SHA-256 加密</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">新 4 位数字密码</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="输入新密码"
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">再次输入确认密码</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="重复确认"
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-center font-mono text-sm tracking-widest text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (newPinInput.length !== 4) {
                        alert('请输入 4 位纯数字密码！');
                        return;
                      }
                      if (newPinInput !== confirmPinInput) {
                        alert('两次输入的新密码不一致，请重新检查！');
                        return;
                      }
                      await lockSecurityService.setPinCode(newPinInput);
                      onUpdatePinCode(newPinInput);
                      setNewPinInput('');
                      setConfirmPinInput('');
                      setSuccessMsg('🎉 数字 PIN 密码已成功保存并安全加密！');
                      setTimeout(() => setSuccessMsg(''), 3000);
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition active:scale-95"
                  >
                    保存加密数字密码
                  </button>
                </div>
              )}

              {/* Gesture Pattern Configuration Panel */}
              {lockType === 'pattern' && (
                <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                    <span>设置/重置九宫格手势</span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {lockSecurityService.hasPatternSet() ? '已绘制保存' : '尚未绘制'}
                    </span>
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    手势密码需至少连接 4 个点。首次绘制后系统将要求您二次绘制进行确认。
                  </p>

                  <button
                    onClick={() => setShowGestureSetupModal(true)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span>{lockSecurityService.hasPatternSet() ? '重新绘制并设置手势密码' : '立即设置九宫格手势密码'}</span>
                  </button>
                </div>
              )}

              {/* Instant Lock Test Button */}
              {onLockPhone && (
                <button
                  onClick={() => {
                    lockSecurityService.setLockedState(true);
                    onLockPhone();
                  }}
                  className="w-full py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>🔒 立即锁定手机（测试当前锁屏效果）</span>
                </button>
              )}
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
      {/* Theme Wallpaper Dialog Prompt Modal */}
      {showThemeWallpaperModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-sky-400/40 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Sun className="w-4 h-4" />
                <span>应用晴空牛奶蓝主题</span>
              </div>
              <button
                onClick={() => setShowThemeWallpaperModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              您正在切换为【晴空牛奶蓝】全局软萌主题。是否同时应用配套的天蓝奶白云朵精美壁纸？
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  if (onUpdateTheme) onUpdateTheme('cloud_milk');
                  if (onUpdateWallpaperSource) onUpdateWallpaperSource('theme');
                  setSuccessMsg('🎉 已同时应用【晴空牛奶蓝】界面与配套云朵壁纸！');
                  setShowThemeWallpaperModal(false);
                  setTimeout(() => setSuccessMsg(''), 3000);
                }}
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>应用主题 + 配套云朵壁纸</span>
              </button>

              <button
                onClick={() => {
                  if (onUpdateTheme) onUpdateTheme('cloud_milk');
                  setSuccessMsg('🎉 已成功应用【晴空牛奶蓝】界面主题（保留当前壁纸）！');
                  setShowThemeWallpaperModal(false);
                  setTimeout(() => setSuccessMsg(''), 3000);
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition cursor-pointer"
              >
                只更换界面主题（保留原有壁纸）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gesture Pattern Setup Modal */}
      {showGestureSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-amber-500/40 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Grid3X3 className="w-4 h-4" />
                <span>设置九宫格手势密码</span>
              </div>
              <button
                onClick={() => setShowGestureSetupModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <GestureLock
              mode="setup"
              onSetupSuccess={async (patternPath) => {
                await lockSecurityService.setPattern(patternPath);
                lockSecurityService.setLockType('pattern');
                setLockType('pattern');
                setShowGestureSetupModal(false);
                setSuccessMsg('🎉 九宫格手势密码已成功设置并安全保存！');
                setTimeout(() => setSuccessMsg(''), 3000);
              }}
              onCancelSetup={() => setShowGestureSetupModal(false)}
            />
          </div>
        </div>
      )}

      {/* Verify Current Password Modal (Before Disabling Lock) */}
      {showVerifyCurrentModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-rose-500/40 p-5 text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Shield className="w-4 h-4" />
                <span>验证当前锁屏密码</span>
              </div>
              <button
                onClick={() => {
                  setShowVerifyCurrentModal(false);
                  setVerifyInput('');
                }}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              为了您的数据安全，关闭锁屏密码保护前请先验证当前数字密码：
            </p>

            <div className="space-y-3">
              <input
                type="password"
                maxLength={4}
                placeholder="输入当前 4 位 PIN"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-center font-mono text-base tracking-widest text-white focus:outline-none focus:border-rose-500"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowVerifyCurrentModal(false);
                    setVerifyInput('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-semibold text-xs transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const isValid = await lockSecurityService.verifyPin(verifyInput);
                    if (isValid) {
                      lockSecurityService.setLockEnabled(false);
                      setIsLockEnabled(false);
                      onUpdatePinEnabled(false);
                      setShowVerifyCurrentModal(false);
                      setVerifyInput('');
                      setSuccessMsg('已安全关闭锁屏密码保护！');
                      setTimeout(() => setSuccessMsg(''), 2500);
                    } else {
                      alert('当前密码验证错误！无法关闭锁屏保护。');
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  确认关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
