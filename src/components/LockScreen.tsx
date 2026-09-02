import React, { useState } from 'react';
import { Lock, Unlock, Delete, Phone, Camera, ShieldCheck } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
  correctPin?: string;
  pinCode?: string;
  isPinEnabled?: boolean;
  wallpaperUrl?: string;
  wallpaper?: string;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  onUnlock,
  correctPin,
  pinCode,
  isPinEnabled = true,
  wallpaperUrl,
  wallpaper,
}) => {
  const actualPin = correctPin || pinCode || '1234';
  const actualWallpaper =
    wallpaperUrl ||
    wallpaper ||
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80';

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
    <div className="relative w-full h-full flex flex-col justify-between text-white overflow-hidden select-none">
      {/* Background Wallpaper */}
      <img
        src={actualWallpaper}
        alt="Lock Wallpaper"
        className="absolute inset-0 w-full h-full object-cover filter brightness-[0.82]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

      {/* Top Header Time & Date */}
      <div className="relative z-10 pt-10 text-center px-4">
        <div className="flex items-center justify-center gap-1.5 text-xs text-white/80 mb-2 font-medium">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isPinEnabled ? '输入数字密码解锁' : '上滑解锁手机'}</span>
        </div>
        <h1 className="text-6xl font-extralight tracking-tight font-sans drop-shadow-md">
          {timeStr}
        </h1>
        <p className="text-sm font-medium text-white/90 mt-1 drop-shadow-xs">{dateStr}</p>
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
                  className={`w-3.5 h-3.5 rounded-full border-2 border-white/80 transition-all ${
                    idx < pinInput.length ? 'bg-emerald-400 border-emerald-400 scale-110 shadow-sm' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Error Message */}
            <div className="h-5 mb-3 text-xs text-rose-400 font-medium text-center">
              {errorMsg}
            </div>

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-3.5 w-full mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  className="h-14 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition text-white border border-white/10"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => {
                  if (!isPinEnabled) onUnlock();
                }}
                className="h-14 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/60 font-medium"
              >
                紧急
              </button>
              <button
                onClick={() => handleKeyPress('0')}
                className="h-14 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-xl font-medium active:scale-95 transition text-white border border-white/10"
              >
                0
              </button>
              <button
                onClick={handleDelete}
                className="h-14 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-sm active:scale-95 transition text-white/80 border border-white/10"
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
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 group-hover:scale-105 transition shadow-lg">
              <Unlock className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs text-white/80 font-medium">点击或上滑解锁</span>
          </button>
        )}

        {/* Bottom Quick Tools */}
        <div className="w-full flex items-center justify-between text-white/70 px-4">
          <button className="p-2.5 rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 transition">
            <Phone className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>AI 安全守护已启动</span>
          </div>
          <button className="p-2.5 rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 transition">
            <Camera className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
