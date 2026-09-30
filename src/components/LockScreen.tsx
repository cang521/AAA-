import React, { useState } from 'react';
import { Lock, Unlock, Delete, Phone, Camera, ShieldCheck } from 'lucide-react';
import { ThemeId } from '../types';
import { CLOUD_MILK_LOCK_WALLPAPER } from '../lib/themeWallpapers';

interface LockScreenProps {
  onUnlock: () => void;
  correctPin?: string;
  pinCode?: string;
  isPinEnabled?: boolean;
  wallpaperUrl?: string;
  wallpaper?: string;
  theme?: ThemeId;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  onUnlock,
  correctPin,
  pinCode,
  isPinEnabled = true,
  wallpaperUrl,
  wallpaper,
  theme = 'default',
}) => {
  const actualPin = correctPin || pinCode || '1234';
  const actualWallpaper =
    wallpaperUrl ||
    wallpaper ||
    CLOUD_MILK_LOCK_WALLPAPER;

  const isLightWallpaper = actualWallpaper.includes('data:image/svg') || theme === 'cloud_milk' || theme === 'light';

  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showKeypad, setShowKeypad] = useState(isPinEnabled);

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const handleKeyPress = (num: string) => {
    if (pinInput.length < 4) {
      const updated = pinInput + num;
      setPinInput(updated);
      setErrorMsg('');

      if (updated.length === 4) {
        if (!isPinEnabled || updated === actualPin) {
          onUnlock();
        } else {
          setErrorMsg('密码错误，请重新输入');
          setTimeout(() => {
            setPinInput('');
            setErrorMsg('');
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleDirectSlideUnlock = () => {
    if (!isPinEnabled) {
      onUnlock();
    } else {
      setShowKeypad(true);
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
          paddingTop: 'calc(var(--safe-area-top, 0px) + 2rem)',
        }}
      >
        <div className={`flex items-center justify-center gap-1.5 text-xs mb-2 font-medium ${
          isLightWallpaper ? 'text-[#67B7EA]' : 'text-white/80'
        }`}>
          <Lock className="w-3.5 h-3.5" />
          <span>{isPinEnabled ? '输入数字密码解锁' : '上滑解锁手机'}</span>
        </div>
        <h1 className={`text-6xl font-extralight tracking-tight font-sans drop-shadow-sm ${
          isLightWallpaper ? 'text-[#40566A]' : 'text-white'
        }`}>
          {timeStr}
        </h1>
        <p className={`text-sm font-medium mt-1 drop-shadow-xs ${
          isLightWallpaper ? 'text-[#7890A3]' : 'text-white/90'
        }`}>{dateStr}</p>
      </div>

      {/* Center Keypad or Slide Guide */}
      <div className="relative z-10 px-6 pb-8 flex flex-col items-center">
        {showKeypad && isPinEnabled ? (
          <div className="w-full max-w-xs flex flex-col items-center">
            {/* PIN Dots Display */}
            <div className="flex items-center gap-4 mb-3">
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

            {/* Error Message */}
            <div className="h-5 mb-3 text-xs text-rose-500 font-medium text-center">
              {errorMsg}
            </div>

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-3.5 w-full mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  className={`h-14 rounded-full backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition shadow-xs ${
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
                  if (!isPinEnabled) onUnlock();
                }}
                className={`h-14 rounded-full flex items-center justify-center text-xs font-medium ${
                  isLightWallpaper ? 'bg-white/40 text-[#7890A3]' : 'bg-white/5 text-white/60'
                }`}
              >
                紧急
              </button>
              <button
                onClick={() => handleKeyPress('0')}
                className={`h-14 rounded-full backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition shadow-xs ${
                  isLightWallpaper
                    ? 'bg-white/70 hover:bg-white/90 text-[#40566A] border border-[#CFE9F8]'
                    : 'bg-white/15 hover:bg-white/30 text-white border border-white/10'
                }`}
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className={`h-14 rounded-full backdrop-blur-md flex items-center justify-center text-sm active:scale-95 transition shadow-xs ${
                  isLightWallpaper
                    ? 'bg-white/70 hover:bg-white/90 text-[#40566A] border border-[#CFE9F8]'
                    : 'bg-white/15 hover:bg-white/30 text-white/80 border border-white/10'
                }`}
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleDirectSlideUnlock}
            className="group flex flex-col items-center gap-2 mb-10 cursor-pointer"
          >
            <div className={`w-12 h-12 rounded-full backdrop-blur-md flex items-center justify-center group-hover:scale-105 transition shadow-lg ${
              isLightWallpaper
                ? 'bg-white/80 text-[#67B7EA] border border-[#CFE9F8]'
                : 'bg-white/20 text-white border border-white/30'
            }`}>
              <Unlock className="w-6 h-6" />
            </div>
            <span className={`text-xs font-medium ${
              isLightWallpaper ? 'text-[#40566A]' : 'text-white/80'
            }`}>点击或上滑解锁</span>
          </button>
        )}

        {/* Bottom Quick Tools */}
        <div
          className={`w-full flex items-center justify-between px-4 pl-safe pr-safe ${
            isLightWallpaper ? 'text-[#7890A3]' : 'text-white/70'
          }`}
          style={{
            paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 1.25rem)',
          }}
        >
          <button className={`p-2.5 rounded-full backdrop-blur-md transition ${
            isLightWallpaper ? 'bg-white/60 hover:bg-white/90 text-[#40566A]' : 'bg-white/15 hover:bg-white/25 text-white'
          }`}>
            <Phone className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#67B7EA]" />
            <span>AI 安全守护已启动</span>
          </div>
          <button className={`p-2.5 rounded-full backdrop-blur-md transition ${
            isLightWallpaper ? 'bg-white/60 hover:bg-white/90 text-[#40566A]' : 'bg-white/15 hover:bg-white/25 text-white'
          }`}>
            <Camera className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
