import React, { useState } from 'react';
import { apiFetch } from '../../lib/localBackend';
import { AppIconConfig, ApiLog, ApiConfig, ThemeId, WallpaperSource } from '../../types';
import { StableTextInput } from '../common/StableTextInput';
import { StableTextarea } from '../common/StableTextarea';
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
  AppWindow,
  AlertTriangle,
  PlusSquare,
  Sparkles as SparklesIcon,
} from 'lucide-react';
import { ImagePickerModal } from '../ImagePickerModal';
import { IconCropperModal } from '../IconCropperModal';
import { lockSecurityService, LockType } from '../../lib/lockScreenSecurity';
import { GestureLock } from '../GestureLock';
import { Shield, Grid3X3 } from 'lucide-react';
import { PressableButton, ElasticToggle } from '../ui/interaction';
import {
  androidPermissionBridgeClient,
  LauncherAppearanceStatus,
  LauncherPresetId,
} from '../../lib/agent/AndroidPermissionBridgeClient';

interface LauncherPresetMeta {
  id: LauncherPresetId;
  label: string;
  subtitle: string;
  badgeColor: string;
  glyph: string;
}

const LAUNCHER_PRESETS: LauncherPresetMeta[] = [
  {
    id: 'default',
    label: 'AI Phone Simulator',
    subtitle: '原始默认桌面图标与名称',
    badgeColor: 'from-sky-500 to-indigo-600',
    glyph: 'AI',
  },
  {
    id: 'xiaoshouji',
    label: '小手机',
    subtitle: '珊瑚粉轻量图标 · 小手机',
    badgeColor: 'from-rose-400 to-pink-500',
    glyph: '📱',
  },
  {
    id: 'cloud_milk',
    label: '晴空笔记',
    subtitle: '天蓝云朵图标 · 晴空笔记',
    badgeColor: 'from-sky-400 to-cyan-500',
    glyph: '☁️',
  },
  {
    id: 'starlight',
    label: '星语伴侣',
    subtitle: '深靛星月图标 · 星语伴侣',
    badgeColor: 'from-indigo-500 to-violet-600',
    glyph: '🌙',
  },
  {
    id: 'minimal',
    label: 'Sora Space',
    subtitle: '极简曜石绿环 · Sora Space',
    badgeColor: 'from-zinc-800 to-emerald-600',
    glyph: '◎',
  },
];

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

  // Module C: APK Desktop Icon & Name Beautification
  const [launcherStatus, setLauncherStatus] = useState<LauncherAppearanceStatus>(() => ({
    isNativeAndroid: androidPermissionBridgeClient.isNativeAndroid(),
    activePresetId: 'default',
    supportsPinShortcut: false,
    availablePresets: LAUNCHER_PRESETS.map((p) => p.id),
  }));
  const [isSwitchingLauncher, setIsSwitchingLauncher] = useState(false);
  const switchingLockRef = React.useRef(false);
  const restartFallbackTimerRef = React.useRef<number | null>(null);
  const [launcherFeedback, setLauncherFeedback] = useState<{
    type: 'success' | 'warn' | 'info';
    text: string;
  } | null>(null);
  const [customShortcutName, setCustomShortcutName] = useState('小手机');
  const [customShortcutIcon, setCustomShortcutIcon] = useState('');
  const [showShortcutCropper, setShowShortcutCropper] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    androidPermissionBridgeClient
      .getLauncherAppearanceStatus()
      .then((status) => {
        if (!cancelled) {
          setLauncherStatus(status);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (restartFallbackTimerRef.current !== null) {
        window.clearTimeout(restartFallbackTimerRef.current);
      }
    };
  }, []);

  const handleSelectLauncherPreset = async (presetId: LauncherPresetId) => {
    if (switchingLockRef.current || isSwitchingLauncher) {
      return;
    }
    switchingLockRef.current = true;
    setIsSwitchingLauncher(true);
    setLauncherFeedback({
      type: 'info',
      text: '正在切换桌面图标与名称，请稍候...',
    });

    let awaitingControlledRestart = false;
    try {
      const res = await androidPermissionBridgeClient.setLauncherPreset(presetId);
      if (res.success && res.restarting) {
        awaitingControlledRestart = true;
        setLauncherFeedback({
          type: 'info',
          text: res.message || '正在应用桌面图标，应用将自动重新打开',
        });
        // Keep interaction locked while native controlled task rebuild executes.
        // Only unlock after a generous timeout if the OS prevented the restart.
        restartFallbackTimerRef.current = window.setTimeout(() => {
          switchingLockRef.current = false;
          setIsSwitchingLauncher(false);
          androidPermissionBridgeClient
            .getLauncherAppearanceStatus()
            .then((status) => setLauncherStatus(status))
            .catch(() => {});
        }, 4500);
        return;
      }

      if (res.success) {
        setLauncherStatus((prev) => ({
          ...prev,
          activePresetId: res.activePresetId || presetId,
        }));
        setLauncherFeedback({
          type: 'success',
          text: res.message || '当前已是该桌面图标与名称预设！',
        });
      } else {
        setLauncherFeedback({
          type: 'warn',
          text: res.message || '当前环境无法切换 APK 桌面图标。',
        });
      }
    } catch (err: any) {
      setLauncherFeedback({
        type: 'warn',
        text: err?.message || '切换桌面图标与名称失败，请稍后重试。',
      });
    } finally {
      if (!awaitingControlledRestart) {
        switchingLockRef.current = false;
        setIsSwitchingLauncher(false);
      }
    }
  };

  const handleResetLauncherDefault = async () => {
    if (switchingLockRef.current || isSwitchingLauncher) {
      return;
    }
    switchingLockRef.current = true;
    setIsSwitchingLauncher(true);
    setLauncherFeedback({
      type: 'info',
      text: '正在切换桌面图标与名称，请稍候...',
    });

    let awaitingControlledRestart = false;
    try {
      const res = await androidPermissionBridgeClient.resetLauncherDefault();
      if (res.success && res.restarting) {
        awaitingControlledRestart = true;
        setLauncherFeedback({
          type: 'info',
          text: res.message || '正在应用桌面图标，应用将自动重新打开',
        });
        restartFallbackTimerRef.current = window.setTimeout(() => {
          switchingLockRef.current = false;
          setIsSwitchingLauncher(false);
          androidPermissionBridgeClient
            .getLauncherAppearanceStatus()
            .then((status) => setLauncherStatus(status))
            .catch(() => {});
        }, 4500);
        return;
      }

      if (res.success) {
        setLauncherStatus((prev) => ({
          ...prev,
          activePresetId: res.activePresetId || 'default',
        }));
        setLauncherFeedback({
          type: 'success',
          text: res.message || '已恢复默认桌面图标与名称！',
        });
      } else {
        setLauncherFeedback({
          type: 'warn',
          text: res.message || '当前环境无法恢复默认图标。',
        });
      }
    } catch (err: any) {
      setLauncherFeedback({
        type: 'warn',
        text: err?.message || '恢复默认桌面图标失败，请稍后重试。',
      });
    } finally {
      if (!awaitingControlledRestart) {
        switchingLockRef.current = false;
        setIsSwitchingLauncher(false);
      }
    }
  };

  const handleCreateCustomShortcut = async () => {
    if (switchingLockRef.current || isSwitchingLauncher) {
      return;
    }
    const cleanName = customShortcutName.trim();
    if (!cleanName) {
      setLauncherFeedback({ type: 'warn', text: '请先输入自定义快捷方式名称！' });
      return;
    }
    switchingLockRef.current = true;
    setIsSwitchingLauncher(true);
    setLauncherFeedback({
      type: 'info',
      text: '正在向系统桌面请求创建快捷方式，请稍候...',
    });
    try {
      const res = await androidPermissionBridgeClient.createCustomShortcut({
        label: cleanName,
        iconDataUrl: customShortcutIcon || undefined,
      });
      setLauncherFeedback({
        type: res.success ? 'success' : 'warn',
        text: res.message || (res.success ? '已发起自定义桌面快捷方式创建请求' : '创建失败'),
      });
    } finally {
      switchingLockRef.current = false;
      setIsSwitchingLauncher(false);
    }
  };

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
        <PressableButton
          expandHitArea
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>⬅ 返回桌面</span>
        </PressableButton>
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
            <PressableButton
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
            </PressableButton>
            <PressableButton
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
            </PressableButton>
            <PressableButton
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
            </PressableButton>
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
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-850 border border-zinc-750">
            <div>
              <div className="font-semibold text-xs text-zinc-100">开启模拟手机锁屏保护</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                支持数字 PIN 与九宫格手势连线解锁，密码均经 Salted SHA-256 加密保存
              </div>
            </div>
            <ElasticToggle
              checked={isLockEnabled}
              onChange={(next) => {
                if (!next) {
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
              accent="amber"
              ariaLabel="开启模拟手机锁屏保护"
            />
          </div>

          {isLockEnabled && (
            <div className="space-y-3 pt-1">
              {/* Lock Type Selector (Digital PIN vs Gesture Pattern) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-300 block">选择解锁方式</label>
                <div className="grid grid-cols-2 gap-2">
                  <PressableButton
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
                  </PressableButton>

                  <PressableButton
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
                  </PressableButton>
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

                  <PressableButton
                    withRipple
                    rippleTone="dark"
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
                      lockSecurityService.setLockType('pin');
                      setLockType('pin');
                      lockSecurityService.setLockEnabled(true);
                      setIsLockEnabled(true);
                      onUpdatePinEnabled(true);
                      onUpdatePinCode(newPinInput);
                      setNewPinInput('');
                      setConfirmPinInput('');
                      setSuccessMsg('🎉 数字 PIN 密码已成功保存并安全加密！');
                      setTimeout(() => setSuccessMsg(''), 3000);
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition"
                  >
                    保存加密数字密码
                  </PressableButton>
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

                  <PressableButton
                    withRipple
                    rippleTone="dark"
                    onClick={() => setShowGestureSetupModal(true)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span>{lockSecurityService.hasPatternSet() ? '重新绘制并设置手势密码' : '立即设置九宫格手势密码'}</span>
                  </PressableButton>
                </div>
              )}

              {/* Instant Lock Test Button */}
              {onLockPhone && (
                <PressableButton
                  withRipple
                  onClick={() => {
                    lockSecurityService.setLockedState(true);
                    onLockPhone();
                  }}
                  className="w-full py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>🔒 立即锁定手机（测试当前锁屏效果）</span>
                </PressableButton>
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

          <StableTextarea
            rows={6}
            value={cssCode}
            onValueChange={(nextVal) => {
              setCssCode(nextVal);
              onUpdateCustomCss(nextVal);
            }}
            className="w-full px-3 py-2 rounded-xl bg-zinc-850 border border-zinc-700 font-mono text-xs text-emerald-300 focus:outline-none focus:border-purple-500"
          />

          <PressableButton
            withRipple
            loading={isFixingCss}
            onClick={handleFixCssWithAi}
            disabled={isFixingCss || !cssCode.trim()}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{isFixingCss ? 'AI 智能分析并修复 CSS 中...' : '✨ 一键调用 API 修复 & 智能自适应 CSS'}</span>
          </PressableButton>
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
                  <StableTextInput
                    type="text"
                    value={icon.name}
                    onValueChange={(nextVal) => {
                      const updated = icons.map((i) =>
                        i.id === icon.id ? { ...i, name: nextVal } : i
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

        {/* 5. APK Desktop Icon & Name Beautification */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3.5 shadow-sm card-box">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <h3 className="font-bold text-sm text-rose-400 flex items-center gap-2">
              <AppWindow className="w-4 h-4 text-rose-400" />
              <span>5. APK 桌面应用图标与名称美化</span>
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                launcherStatus.isNativeAndroid
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {launcherStatus.isNativeAndroid ? 'Android 原生可用' : 'Web 预览环境'}
            </span>
          </div>

          {!launcherStatus.isNativeAndroid && (
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <b>真实桌面图标与名称切换仅能在 Android APK 中验证。</b>
                当前处于浏览器预览模式，下方仅展示预设列表与效果预览，点击不会伪造切换成功。
              </span>
            </div>
          )}

          {/* Current Desktop Appearance Preview */}
          {(() => {
            const activeMeta =
              LAUNCHER_PRESETS.find((p) => p.id === launcherStatus.activePresetId) || LAUNCHER_PRESETS[0];
            return (
              <div className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${activeMeta.badgeColor} flex items-center justify-center text-white font-bold text-base shadow-md shrink-0`}
                  >
                    {activeMeta.glyph}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-zinc-400">当前 APK 桌面呈现状态</div>
                    <div className="font-bold text-xs text-zinc-100 truncate mt-0.5">{activeMeta.label}</div>
                    <div className="text-[10px] text-zinc-400 truncate">{activeMeta.subtitle}</div>
                  </div>
                </div>
                <PressableButton
                  disabled={isSwitchingLauncher || launcherStatus.activePresetId === 'default'}
                  onClick={handleResetLauncherDefault}
                  className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-[11px] font-medium border border-zinc-700 flex items-center gap-1 shrink-0 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>恢复默认</span>
                </PressableButton>
              </div>
            );
          })()}

          {launcherFeedback && (
            <div
              className={`p-2.5 rounded-2xl border text-[11px] leading-relaxed ${
                launcherFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : launcherFeedback.type === 'info'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              {launcherFeedback.text}
            </div>
          )}

          {/* Preset Launcher Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-200">内置原生桌面预设切换 (activity-alias)</span>
              <span className="text-[10px] text-zinc-400">保留全部用户数据</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LAUNCHER_PRESETS.map((preset) => {
                const isActive = launcherStatus.activePresetId === preset.id;
                return (
                  <PressableButton
                    key={preset.id}
                    disabled={isSwitchingLauncher}
                    onClick={() => handleSelectLauncherPreset(preset.id)}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition ${
                      isActive
                        ? 'bg-rose-500/15 border-rose-400 ring-1 ring-rose-400/40 shadow-sm'
                        : 'bg-zinc-850 border-zinc-750 hover:border-zinc-600'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl bg-gradient-to-br ${preset.badgeColor} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs`}
                    >
                      {preset.glyph}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-[11px] text-zinc-100 truncate">{preset.label}</span>
                        {isActive && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500 text-white font-semibold shrink-0">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-zinc-400 truncate mt-0.5">{preset.subtitle}</div>
                    </div>
                  </PressableButton>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              说明：切换采用分阶段安全切换（先启用新桌面入口并自动重新打开应用，再清理旧入口），不会清空聊天记录、角色、记忆或 API 配置；部分手机系统桌面图标缓存需数秒刷新。
            </p>
          </div>

          {/* Custom Shortcut Section */}
          <div className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-100 flex items-center gap-1.5">
                <PlusSquare className="w-3.5 h-3.5 text-sky-400" />
                <span>自定义图片与名称（生成系统桌面快捷方式）</span>
              </span>
            </div>

            <p className="text-[10px] text-zinc-400 leading-relaxed">
              受限于 Android 系统签名机制，任意自定义图标与名称通过系统“固定快捷方式”创建桌面新入口，<b>不会直接覆盖原 APK Manifest 中的应用名称与图标</b>。
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowShortcutCropper(true)}
                className="w-14 h-14 rounded-2xl bg-zinc-800 border border-dashed border-sky-400/60 hover:border-sky-400 flex flex-col items-center justify-center overflow-hidden shrink-0 transition"
                title="点击上传或裁剪图标"
              >
                {customShortcutIcon ? (
                  <img src={customShortcutIcon} alt="" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Crop className="w-4 h-4 text-sky-400" />
                    <span className="text-[9px] text-sky-300 mt-0.5">选图裁剪</span>
                  </>
                )}
              </button>

              <div className="flex-1 space-y-1.5">
                <StableTextInput
                  type="text"
                  maxLength={24}
                  value={customShortcutName}
                  onValueChange={setCustomShortcutName}
                  placeholder="输入桌面快捷方式显示名称"
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-sky-400"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowShortcutCropper(true)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-medium border border-zinc-700"
                  >
                    裁剪方形图标
                  </button>
                  {customShortcutIcon && (
                    <button
                      type="button"
                      onClick={() => setCustomShortcutIcon('')}
                      className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px]"
                    >
                      清除图片
                    </button>
                  )}
                </div>
              </div>
            </div>

            <PressableButton
              withRipple
              disabled={isSwitchingLauncher || !customShortcutName.trim()}
              onClick={handleCreateCustomShortcut}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>创建自定义桌面快捷方式</span>
            </PressableButton>
          </div>
        </div>
      </div>

      {/* Requirement 3: Bottom Sticky "Save Settings" Action Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 z-20 shrink-0 flex items-center justify-between gap-3">
        <span className="text-[11px] text-zinc-400">已对壁纸、CSS与应用图标做出的美化修改</span>
        <PressableButton
          withRipple
          onClick={() => {
            onUpdateCustomCss(cssCode);
            handleSavePin();
            setSuccessMsg('🎉 所有美化、应用图标与自适应设置已成功保存！');
            setTimeout(() => setSuccessMsg(''), 3000);
          }}
          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>保存设置</span>
        </PressableButton>
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

      {/* Custom APK Shortcut Icon Cropper Modal */}
      {showShortcutCropper && (
        <IconCropperModal
          isOpen={showShortcutCropper}
          onClose={() => setShowShortcutCropper(false)}
          iconName={customShortcutName || '桌面快捷方式'}
          initialImageUrl={customShortcutIcon || undefined}
          onCropComplete={(croppedDataUrl) => {
            setCustomShortcutIcon(croppedDataUrl);
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
              <PressableButton
                withRipple
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
              </PressableButton>

              <PressableButton
                onClick={() => {
                  if (onUpdateTheme) onUpdateTheme('cloud_milk');
                  setSuccessMsg('🎉 已成功应用【晴空牛奶蓝】界面主题（保留当前壁纸）！');
                  setShowThemeWallpaperModal(false);
                  setTimeout(() => setSuccessMsg(''), 3000);
                }}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition cursor-pointer"
              >
                只更换界面主题（保留原有壁纸）
              </PressableButton>
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
                lockSecurityService.setLockEnabled(true);
                setIsLockEnabled(true);
                onUpdatePinEnabled(true);
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
              为了您的数据安全，关闭锁屏密码保护前请先验证当前{lockType === 'pattern' ? '九宫格手势密码' : '数字密码'}：
            </p>

            {lockType === 'pattern' ? (
              <div className="py-2 flex flex-col items-center">
                <GestureLock
                  mode="unlock"
                  onVerifyPattern={async (path) => {
                    return await lockSecurityService.verifyPattern(path);
                  }}
                  onUnlockSuccess={() => {
                    lockSecurityService.setLockEnabled(false);
                    setIsLockEnabled(false);
                    onUpdatePinEnabled(false);
                    setShowVerifyCurrentModal(false);
                    setSuccessMsg('已安全关闭锁屏密码保护！');
                    setTimeout(() => setSuccessMsg(''), 2500);
                  }}
                  onCancelSetup={() => setShowVerifyCurrentModal(false)}
                />
              </div>
            ) : (
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
                  <PressableButton
                    onClick={() => {
                      setShowVerifyCurrentModal(false);
                      setVerifyInput('');
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-semibold text-xs transition cursor-pointer"
                  >
                    取消
                  </PressableButton>
                  <PressableButton
                    withRipple
                    rippleTone="rose"
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
                  </PressableButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
