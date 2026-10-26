import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Delete, Phone, Camera, ShieldCheck, Grid3X3, KeyRound, AlertTriangle } from 'lucide-react';
import { ThemeId } from '../types';
import { CLOUD_MILK_LOCK_WALLPAPER } from '../lib/themeWallpapers';
import { lockSecurityService, LockType } from '../lib/lockScreenSecurity';
import { GestureLock } from './GestureLock';

interface LockScreenProps {
  onUnlock: () => void;
  wallpaperUrl?: string;
  wallpaper?: string;
  theme?: ThemeId;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  onUnlock,
  wallpaperUrl,
  wallpaper,
  theme = 'default',
}) => {
  const actualWallpaper =
    wallpaperUrl ||
    wallpaper ||
    CLOUD_MILK_LOCK_WALLPAPER;

  const isLightWallpaper = actualWallpaper.includes('data:image/svg') || theme === 'cloud_milk' || theme === 'light';

  const [isLockEnabled, setIsLockEnabled] = useState(lockSecurityService.getIsLockEnabled());
  const [activeLockType, setActiveLockType] = useState<LockType>(lockSecurityService.getLockType());
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // Keep cooldown timer updated
  useEffect(() => {
    const updateCooldown = () => {
      const cd = lockSecurityService.getCooldownSeconds();
      setCooldownSeconds(cd);
      if (cd > 0) {
        setErrorMsg(`尝试次数过多，请 ${cd} 秒后再试`);
      } else if (errorMsg.includes('秒后再试')) {
        setErrorMsg('');
      }
    };
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [errorMsg]);

  // Sync state from lockSecurityService
  useEffect(() => {
    setIsLockEnabled(lockSecurityService.getIsLockEnabled());
    setActiveLockType(lockSecurityService.getLockType());
  }, []);

  const handleKeyPress = async (num: string) => {
    if (cooldownSeconds > 0) return;
    if (pinInput.length < 6) {
      const updated = pinInput + num;
      setPinInput(updated);
      setErrorMsg('');

      // Auto verify when 4 digits entered
      if (updated.length === 4) {
        const matches = await lockSecurityService.verifyPin(updated);
        if (matches) {
          onUnlock();
        } else {
          const cd = lockSecurityService.getCooldownSeconds();
          if (cd > 0) {
            setErrorMsg(`尝试次数过多，请 ${cd} 秒后再试`);
          } else {
            setErrorMsg('数字密码错误，请重新输入');
          }
          setTimeout(() => {
            setPinInput('');
            if (lockSecurityService.getCooldownSeconds() === 0) {
              setErrorMsg('');
            }
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleVerifyPattern = async (path: number[]): Promise<boolean> => {
    if (cooldownSeconds > 0) return false;
    const matches = await lockSecurityService.verifyPattern(path);
    if (matches) {
      setTimeout(() => onUnlock(), 200);
    }
    return matches;
  };

  const handleDirectSlideUnlock = () => {
    if (!isLockEnabled) {
      lockSecurityService.setLockedState(false);
      onUnlock();
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col justify-between overflow-hidden select-none ${
      isLightWallpaper ? 'text-[#40566A]' : 'text-white'
    }`}>
      {/* Background Wallpaper */}
      <img
        src={actualWallpaper}
        alt="Lock Wallpaper"
        className={`absolute inset-0 w-full h-full object-cover ${
          isLightWallpaper ? 'brightness-[0.98]' : 'brightness-[0.82]'
        }`}
      />
      <div className={`absolute inset-0 pointer-events-none ${
        isLightWallpaper
          ? 'bg-gradient-to-b from-sky-200/20 via-transparent to-sky-300/30'
          : 'bg-gradient-to-b from-black/40 via-transparent to-black/80'
      }`} />

      {/* Top Header Time & Date */}
      <div
        className="relative z-10 text-center px-4 pl-safe pr-safe"
        style={{
          paddingTop: 'calc(var(--safe-area-top, 0px) + 1.5rem)',
        }}
      >
        <div className={`flex items-center justify-center gap-1.5 text-xs mb-1.5 font-medium ${
          isLightWallpaper ? 'text-[#67B7EA]' : 'text-white/80'
        }`}>
          <Lock className="w-3.5 h-3.5" />
          <span>
            {!isLockEnabled
              ? '上滑解锁手机'
              : activeLockType === 'pattern'
              ? '绘制手势密码解锁'
              : '输入数字密码解锁'}
          </span>
        </div>
        <h1 className={`text-5xl sm:text-6xl font-extralight tracking-tight font-sans drop-shadow-sm ${
          isLightWallpaper ? 'text-[#40566A]' : 'text-white'
        }`}>
          {timeStr}
        </h1>
        <p className={`text-xs sm:text-sm font-medium mt-1 drop-shadow-xs ${
          isLightWallpaper ? 'text-[#7890A3]' : 'text-white/90'
        }`}>{dateStr}</p>
      </div>

      {/* Center Unlock Interaction Area */}
      <div className="relative z-10 px-6 pb-4 flex flex-col items-center flex-1 justify-center">
        {!isLockEnabled ? (
          <button
            onClick={handleDirectSlideUnlock}
            className="group flex flex-col items-center gap-2 cursor-pointer my-auto"
          >
            <div className={`w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center group-hover:scale-105 transition shadow-lg ${
              isLightWallpaper
                ? 'bg-white/80 text-[#67B7EA] border border-[#CFE9F8]'
                : 'bg-white/20 text-white border border-white/30'
            }`}>
              <Unlock className="w-7 h-7" />
            </div>
            <span className={`text-xs font-medium ${
              isLightWallpaper ? 'text-[#40566A]' : 'text-white/80'
            }`}>点击解锁手机</span>
          </button>
        ) : activeLockType === 'pattern' ? (
          /* GESTURE PATTERN UNLOCK MODE */
          <div className="w-full max-w-xs flex flex-col items-center my-auto">
            <GestureLock
              mode="unlock"
              onVerifyPattern={handleVerifyPattern}
              onUnlockSuccess={() => onUnlock()}
              isLightWallpaper={isLightWallpaper}
              cooldownSeconds={cooldownSeconds}
            />

            {/* Switch to PIN unlock option if pattern fails or preferred */}
            <button
              onClick={() => setActiveLockType('pin')}
              className={`mt-4 text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-md transition flex items-center gap-1.5 ${
                isLightWallpaper
                  ? 'bg-white/70 hover:bg-white/90 text-sky-700 border border-sky-300'
                  : 'bg-white/15 hover:bg-white/25 text-white/90 border border-white/20'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>切换为数字密码解锁</span>
            </button>
          </div>
        ) : (
          /* DIGITAL PIN UNLOCK MODE */
          <div className="w-full max-w-xs flex flex-col items-center my-auto">
            {/* PIN Dots Display */}
            <div className="flex items-center gap-4 mb-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                    isLightWallpaper ? 'border-[#8DCCF4]' : 'border-white/80'
                  } ${
                    idx < pinInput.length
                      ? 'bg-[#67B7EA] border-[#67B7EA] scale-110 shadow-sm'
                      : 'bg-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Error / Cooldown Message */}
            <div className="h-5 mb-2 text-xs text-rose-500 font-semibold text-center flex items-center gap-1 justify-center">
              {errorMsg && (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </>
              )}
            </div>

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-3 w-full mb-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  disabled={cooldownSeconds > 0}
                  className={`h-12 sm:h-13 rounded-full backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition shadow-xs disabled:opacity-40 ${
                    isLightWallpaper
                      ? 'bg-white/70 hover:bg-white/90 text-[#40566A] border border-[#CFE9F8]'
                      : 'bg-white/15 hover:bg-white/30 text-white border border-white/10'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => {
                  if (lockSecurityService.hasPatternSet()) {
                    setActiveLockType('pattern');
                  } else {
                    alert('未设置手势密码，请在 [界面美化与主题] 中设置手势密码');
                  }
                }}
                className={`h-12 sm:h-13 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium ${
                  isLightWallpaper ? 'bg-white/40 text-[#7890A3]' : 'bg-white/10 text-white/70'
                }`}
                title="切换手势密码"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleKeyPress('0')}
                disabled={cooldownSeconds > 0}
                className={`h-12 sm:h-13 rounded-full backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition shadow-xs disabled:opacity-40 ${
                  isLightWallpaper
                    ? 'bg-white/70 hover:bg-white/90 text-[#40566A] border border-[#CFE9F8]'
                    : 'bg-white/15 hover:bg-white/30 text-white border border-white/10'
                }`}
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className={`h-12 sm:h-13 rounded-full backdrop-blur-md flex items-center justify-center text-sm active:scale-95 transition shadow-xs ${
                  isLightWallpaper
                    ? 'bg-white/70 hover:bg-white/90 text-[#40566A] border border-[#CFE9F8]'
                    : 'bg-white/15 hover:bg-white/30 text-white/80 border border-white/10'
                }`}
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Quick Tools */}
        <div
          className={`w-full flex items-center justify-between px-4 pl-safe pr-safe mt-auto ${
            isLightWallpaper ? 'text-[#7890A3]' : 'text-white/70'
          }`}
          style={{
            paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 0.75rem)',
          }}
        >
          <button className={`p-2.5 rounded-full backdrop-blur-md transition ${
            isLightWallpaper ? 'bg-white/60 hover:bg-white/90 text-[#40566A]' : 'bg-white/15 hover:bg-white/25 text-white'
          }`}>
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#67B7EA]" />
            <span>AI 安全守护已启动</span>
          </div>
          <button className={`p-2.5 rounded-full backdrop-blur-md transition ${
            isLightWallpaper ? 'bg-white/60 hover:bg-white/90 text-[#40566A]' : 'bg-white/15 hover:bg-white/25 text-white'
          }`}>
            <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
