import React, { useState, useEffect } from 'react';
import { ThemeId } from '../types';

interface PhoneContainerProps {
  children: React.ReactNode;
  onLockClick: () => void;
  customCss?: string;
  theme?: ThemeId;
}

export const PhoneContainer: React.FC<PhoneContainerProps> = ({
  children,
  onLockClick,
  customCss = '',
  theme = 'default',
}) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-screen h-full bg-zinc-950 flex flex-col overflow-hidden select-none selection:bg-emerald-500 selection:text-white">
      {/* Dynamic User Custom CSS Injection */}
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}

      {/* Main Full-Screen Display Area (No outer phone chassis or fake metal borders) */}
      <div
        data-theme={theme}
        className={`phone-screen relative w-full h-full flex-1 overflow-hidden flex flex-col transition-colors duration-200 ${
          theme === 'cloud_milk' ? 'theme-cloud-milk bg-[#F5FBFF]' : 'bg-zinc-900'
        }`}
      >
        {/* Main Application Active View Area */}
        <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
};
