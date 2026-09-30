import React from 'react';
import { AppId } from '../types';

interface CloudMilkIconProps {
  appId: AppId | string;
  customImage?: string;
  name?: string;
  isMiniApp?: boolean;
  className?: string;
  size?: number; // Size in px (default 56 = 14 * 4)
}

/**
 * Cloud Milk (晴空牛奶蓝) Unified App & Mini-App Icon System
 * Features:
 * - White/Cream base for System Apps, Soft Sky-Blue base for Mini-Apps
 * - Delicate Sky-Blue ornamental frame with micro clouds/stars/lace geometry
 * - Precision sky-blue vector graphics
 * - Custom Image Priority (Requirement 7)
 */
export const CloudMilkIcon: React.FC<CloudMilkIconProps> = ({
  appId,
  customImage,
  name,
  isMiniApp = false,
  className = '',
  size = 56,
}) => {
  // Requirement 7: Prioritize User Custom Image if present
  if (customImage && customImage.trim().length > 0) {
    return (
      <div
        className={`relative rounded-[16px] overflow-hidden shadow-[0_4px_12px_rgba(186,230,253,0.3)] border border-sky-100 flex items-center justify-center bg-zinc-800 ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <img
          src={customImage}
          alt={name || appId}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback if custom image fails to load
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  const isMini = isMiniApp || ['gomoku', 'tictactoe', 'rps', 'telepathy'].includes(appId);

  return (
    <div
      className={`relative rounded-[16px] select-none flex items-center justify-center transition-all transform hover:scale-105 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* Base Box Container */}
      <div
        className={`relative w-full h-full rounded-[16px] overflow-hidden flex items-center justify-center ${
          isMini
            ? 'bg-gradient-to-b from-sky-50 via-sky-100/70 to-blue-100/60 border border-sky-200/90 shadow-[0_4px_14px_rgba(56,189,248,0.22)]'
            : 'bg-gradient-to-b from-white via-sky-50/60 to-sky-100/40 border border-sky-100 shadow-[0_4px_16px_rgba(186,230,253,0.35)]'
        }`}
      >
        {/* Subtle Top Inner Highlight */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/80 to-transparent pointer-events-none" />

        {/* Delicate Sky Blue Ornamental Outer Frame Decorator SVG */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 56 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Corner Micro-Stars / Dots in Sky Blue */}
          <circle cx="5" cy="5" r="1" fill="#7DD3FC" opacity="0.8" />
          <circle cx="51" cy="5" r="1" fill="#7DD3FC" opacity="0.8" />
          <circle cx="5" cy="51" r="1" fill="#7DD3FC" opacity="0.8" />
          <circle cx="51" cy="51" r="1" fill="#7DD3FC" opacity="0.8" />

          {/* Delicate Lace Frame Lines */}
          <rect
            x="2.5"
            y="2.5"
            width="51"
            height="51"
            rx="13.5"
            stroke="#BAE6FD"
            strokeWidth="0.75"
            strokeDasharray="4 2"
            opacity="0.6"
          />

          {/* Micro Cloud Silhouette Arc at Top */}
          <path
            d="M 22 2.5 Q 25 1 28 2.5 Q 31 1 34 2.5"
            stroke="#38BDF8"
            strokeWidth="0.8"
            fill="none"
            opacity="0.7"
          />

          {/* Corner Sparkle Elements */}
          <path
            d="M 6 8 L 7 6 L 8 8 L 6 8 Z"
            fill="#38BDF8"
            opacity="0.5"
          />
          <path
            d="M 48 8 L 49 6 L 50 8 L 48 8 Z"
            fill="#38BDF8"
            opacity="0.5"
          />
        </svg>

        {/* Central Graphic Icon */}
        <div className="relative z-10 flex items-center justify-center p-1">
          {renderCoreIconGraphic(appId)}
        </div>

        {/* Mini-App Top-Right Distinction Badge */}
        {isMini && (
          <div className="absolute top-1 right-1 bg-sky-500 text-white font-bold text-[7px] px-1 py-[0.5px] rounded-full shadow-xs border border-white/80 leading-none">
            小程序
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Render precise, domain-authentic Sky Blue vector illustrations
 * conforming to section V of user prompt.
 */
function renderCoreIconGraphic(appId: string) {
  switch (appId) {
    case 'wechat':
      // 天蓝聊天气泡
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M17 12.5C17 8.91 13.64 6 9.5 6C5.36 6 2 8.91 2 12.5C2 14.65 3.2 16.55 5.06 17.72L4.2 20.2L6.96 19.22C7.75 19.59 8.6 19.8 9.5 19.8C10.05 19.8 10.59 19.74 11.1 19.63C10.87 18.96 10.75 18.24 10.75 17.5C10.75 14.19 13.55 11.5 17 11.5C17 11.83 17 12.17 17 12.5Z"
            fill="#38BDF8"
          />
          <path
            d="M26 17.5C26 14.46 23.09 12 19.5 12C15.91 12 13 14.46 13 17.5C13 20.54 15.91 23 19.5 23C20.28 23 21.03 22.84 21.72 22.54L24.1 23.4L23.36 21.26C24.97 20.25 26 18.96 26 17.5Z"
            fill="#0284C7"
          />
          <circle cx="6.5" cy="12.5" r="1.2" fill="white" />
          <circle cx="10" cy="12.5" r="1.2" fill="white" />
          <circle cx="17.2" cy="17.5" r="1" fill="white" />
          <circle cx="20.2" cy="17.5" r="1" fill="white" />
        </svg>
      );

    case 'contacts':
    case 'offline':
      // 通讯录 / 线下模式：蓝色双人轮廓 / 双人爱心
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="10" cy="10" r="4" fill="#0284C7" />
          <path
            d="M3 21C3 17.13 6.13 14 10 14C11.6 14 13.07 14.54 14.25 15.45C13.47 16.92 13 18.6 13 20.4V21H3Z"
            fill="#38BDF8"
          />
          <circle cx="18" cy="11" r="3.5" fill="#0284C7" />
          <path
            d="M13.5 21C13.5 17.96 15.96 15.5 19 15.5C22.04 15.5 24.5 17.96 24.5 21V21.5H13.5V21Z"
            fill="#0369A1"
          />
          <path
            d="M19 13.2L19.4 14.1L20.4 14.2L19.6 14.9L19.8 15.9L19 15.4L18.2 15.9L18.4 14.9L17.6 14.2L18.6 14.1L19 13.2Z"
            fill="#38BDF8"
          />
        </svg>
      );

    case 'moments':
      // 朋友圈：蓝色圆环/相机/星形组合
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="#BAE6FD" strokeWidth="2" strokeDasharray="3 3" />
          <rect x="7" y="10" width="14" height="10" rx="3" fill="#0284C7" />
          <path d="M11 10L12.5 8H15.5L17 10H11Z" fill="#0369A1" />
          <circle cx="14" cy="15" r="3" fill="#E0F2FE" />
          <circle cx="14" cy="15" r="1.5" fill="#0284C7" />
          <path d="M20 7L21 4L22 7L25 8L22 9L21 12L20 9L17 8L20 7Z" fill="#38BDF8" />
        </svg>
      );

    case 'settings':
      // 设置：蓝色齿轮
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M12.2 3.8C12.5 2.6 13.9 2.6 14.2 3.8L14.7 5.6C15.4 5.9 16 6.3 16.6 6.8L18.4 6.2C19.5 5.8 20.5 6.8 20.1 7.9L19.5 9.7C20 10.3 20.4 10.9 20.7 11.6L22.5 12.1C23.7 12.4 23.7 13.8 22.5 14.1L20.7 14.6C20.4 15.3 20 15.9 19.5 16.5L20.1 18.3C20.5 19.4 19.5 20.4 18.4 20L16.6 19.4C16 19.9 15.4 20.3 14.7 20.6L14.2 22.4C13.9 23.6 12.5 23.6 12.2 22.4L11.7 20.6C11 20.3 10.4 19.9 9.8 19.4L8 20C6.9 20.4 5.9 19.4 6.3 18.3L6.9 16.5C6.4 15.9 6 15.3 5.7 14.6L3.9 14.1C2.7 13.8 2.7 12.4 3.9 12.1L5.7 11.6C6 10.9 6.4 10.3 6.9 9.7L6.3 7.9C5.9 6.8 6.9 5.8 8 6.2L9.8 6.8C10.4 6.3 11 5.9 11.7 5.6L12.2 3.8Z"
            fill="#0284C7"
          />
          <circle cx="13.2" cy="13.1" r="3.8" fill="#E0F2FE" />
          <circle cx="13.2" cy="13.1" r="2" fill="#0369A1" />
        </svg>
      );

    case 'beautification':
      // 美化：蓝色画笔/调色盘
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M14 4C8.48 4 4 8.48 4 14C4 19.52 8.48 24 14 24C15.38 24 16.5 22.88 16.5 21.5C16.5 20.86 16.26 20.28 15.86 19.84C15.47 19.4 15.25 18.84 15.25 18.25C15.25 17.01 16.26 16 17.5 16H19.5C21.98 16 24 13.98 24 11.5C24 7.36 19.52 4 14 4Z"
            fill="#BAE6FD"
          />
          <circle cx="9" cy="10" r="1.8" fill="#0284C7" />
          <circle cx="14" cy="8" r="1.8" fill="#38BDF8" />
          <circle cx="19" cy="10" r="1.8" fill="#0369A1" />
          <circle cx="8" cy="15" r="1.8" fill="#0284C7" />
          <path
            d="M17.5 17.5L22 22M22 22L24.5 24.5M22 22L20 24"
            stroke="#0284C7"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'weather':
      // 天气：蓝色云朵+太阳
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="10" cy="10" r="4.5" fill="#38BDF8" />
          <path
            d="M10 3V4.5M10 15.5V17M3 10H4.5M15.5 10H17M5.05 5.05L6.11 6.11M13.89 13.89L14.95 14.95M5.05 14.95L6.11 13.89M13.89 6.11L14.95 5.05"
            stroke="#7DD3FC"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M8.5 20.5C6.57 20.5 5 18.93 5 17C5 15.28 6.24 13.85 7.89 13.56C8.55 11.2 10.72 9.5 13.25 9.5C16.32 9.5 18.83 11.88 18.99 14.9C20.69 15.15 22 16.6 22 18.38C22 20.27 20.43 21.8 18.54 21.8L8.5 20.5Z"
            fill="#0284C7"
          />
        </svg>
      );

    case 'memo':
      // 备忘录：蓝色纸张+笔
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="6" y="5" width="14" height="18" rx="2.5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.5" />
          <line x1="9" y1="10" x2="16" y2="10" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="14" x2="16" y2="14" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="18" x2="13" y2="18" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M17 19L22 14L20 12L15 17V19H17Z" fill="#0369A1" />
        </svg>
      );

    case 'worldbook':
      // 世界书：蓝色打开的书
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M4 8C4 6.9 4.9 6 6 6H13V20H6C4.9 20 4 19.1 4 18V8Z"
            fill="#BAE6FD"
          />
          <path
            d="M24 8C24 6.9 23.1 6 22 6H15V20H22C23.1 20 24 19.1 24 18V8Z"
            fill="#38BDF8"
          />
          <path
            d="M14 6V20"
            stroke="#0284C7"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M7 10H11M7 13H11M7 16H10" stroke="#0284C7" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M17 10H21M17 13H21M17 16H20" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M14 3L15 5L17 5.5L15.5 7L16 9L14 8L12 9L12.5 7L11 5.5L13 5L14 3Z" fill="#0284C7" />
        </svg>
      );

    case 'gamecenter':
      // 游戏中心：蓝色游戏手柄
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M7.5 8H20.5C22.985 8 25 10.015 25 12.5V17C25 19.485 22.985 21.5 20.5 21.5C19.2 21.5 18.05 20.95 17.25 20.08L15.5 18.17C15.1 17.73 14.5 17.5 13.9 17.5H13.1C12.5 17.5 11.9 17.73 11.5 18.17L9.75 20.08C8.95 20.95 7.8 21.5 6.5 21.5C4.015 21.5 2 19.485 2 17V12.5C2 10.015 4.015 8 6.5 8H7.5Z"
            fill="#0284C7"
          />
          <line x1="8" y1="12" x2="8" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="6" y1="14" x2="10" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18" cy="12.5" r="1.2" fill="#BAE6FD" />
          <circle cx="20.5" cy="14.5" r="1.2" fill="#BAE6FD" />
          <circle cx="18" cy="16.5" r="1.2" fill="#BAE6FD" />
          <circle cx="15.5" cy="14.5" r="1.2" fill="#BAE6FD" />
        </svg>
      );

    case 'apimonitor':
      // API 监控：蓝色节点/波形
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M4 14H8L11 7L15 21L18 11L20 14H24" stroke="#0284C7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="11" cy="7" r="2" fill="#38BDF8" />
          <circle cx="15" cy="21" r="2" fill="#0369A1" />
          <circle cx="18" cy="11" r="2" fill="#38BDF8" />
        </svg>
      );

    case 'connectivity':
      // 外部设备：蓝色连接/设备符号
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="9" cy="14" r="4" stroke="#0284C7" strokeWidth="2" />
          <circle cx="19" cy="14" r="4" stroke="#0369A1" strokeWidth="2" />
          <path d="M12 11L16 17M12 17L16 11" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'permissions':
      // AI 权限：蓝色盾牌+星芒
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path
            d="M14 4L21 7V13C21 17.5 18 21.5 14 23C10 21.5 7 17.5 7 13V7L14 4Z"
            fill="#0284C7"
          />
          <path d="M14 8L15.5 12.5L20 14L15.5 15.5L14 20L12.5 15.5L8 14L12.5 12.5L14 8Z" fill="#E0F2FE" />
        </svg>
      );

    case 'ai_activity_logs':
      // AI 活动记录：蓝色文档+勾选波形
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="6" y="4" width="16" height="20" rx="3" fill="#BAE6FD" />
          <path d="M10 9H18M10 13H18M10 17H15" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18" cy="18" r="4" fill="#0284C7" />
          <path d="M16 18L17.5 19.5L20 16.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'menstrual':
      // 女性健康：柔和蓝色花朵/月亮/周期环图形 (Requirement V: 柔和蓝色，不要刺眼粉红)
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          {/* Outer Soft Cycle Ring */}
          <circle cx="14" cy="14" r="10" stroke="#BAE6FD" strokeWidth="2" strokeDasharray="5 3" />
          {/* Gentle Blue Crescent Moon & Blossom */}
          <path
            d="M15.5 6C11.36 6 8 9.36 8 13.5C8 17.64 11.36 21 15.5 21C16.88 21 18.17 20.63 19.28 19.98C16.73 19.5 14.75 17.23 14.75 14.5C14.75 11.77 16.73 9.5 19.28 9.02C18.17 8.37 16.88 6 15.5 6Z"
            fill="#0284C7"
          />
          {/* Center Petal Accents */}
          <circle cx="10" cy="13.5" r="1.5" fill="#38BDF8" />
          <circle cx="14" cy="9.5" r="1.2" fill="#7DD3FC" />
          <circle cx="14" cy="17.5" r="1.2" fill="#7DD3FC" />
        </svg>
      );

    // Mini-App Games (Gomoku, TicTacToe, RPS, Telepathy)
    case 'gomoku':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="4" y="4" width="20" height="20" rx="3" stroke="#0284C7" strokeWidth="1.5" fill="#E0F2FE" />
          <line x1="4" y1="10" x2="24" y2="10" stroke="#BAE6FD" strokeWidth="1" />
          <line x1="4" y1="16" x2="24" y2="16" stroke="#BAE6FD" strokeWidth="1" />
          <line x1="10" y1="4" x2="10" y2="24" stroke="#BAE6FD" strokeWidth="1" />
          <line x1="16" y1="4" x2="16" y2="24" stroke="#BAE6FD" strokeWidth="1" />
          <circle cx="10" cy="10" r="2.5" fill="#0284C7" />
          <circle cx="16" cy="10" r="2.5" fill="white" stroke="#0284C7" strokeWidth="1" />
          <circle cx="16" cy="16" r="2.5" fill="#0369A1" />
        </svg>
      );

    case 'tictactoe':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <line x1="10" y1="5" x2="10" y2="23" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="18" y1="5" x2="18" y2="23" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="5" y1="10" x2="23" y2="10" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="5" y1="18" x2="23" y2="18" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6.5 6.5L8.5 8.5M8.5 6.5L6.5 8.5" stroke="#0369A1" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14" cy="14" r="1.8" stroke="#38BDF8" strokeWidth="1.5" />
          <path d="M19.5 19.5L21.5 21.5M21.5 19.5L19.5 21.5" stroke="#0369A1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'rps':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="9" cy="12" r="3.5" fill="#0284C7" />
          <path d="M16 8L22 14M22 8L16 14" stroke="#0369A1" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 20H20C21.1 20 22 19.1 22 18V17H6V18C6 19.1 6.9 20 8 20Z" fill="#38BDF8" />
        </svg>
      );

    case 'telepathy':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="10" cy="14" r="5" stroke="#0284C7" strokeWidth="1.8" fill="#E0F2FE" />
          <circle cx="18" cy="14" r="5" stroke="#0369A1" strokeWidth="1.8" fill="#E0F2FE" />
          <path
            d="M14 7L15 10L18 11L15 12L14 15L13 12L10 11L13 10L14 7Z"
            fill="#0284C7"
          />
        </svg>
      );

    default:
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="5" y="5" width="18" height="18" rx="4" fill="#0284C7" />
          <circle cx="14" cy="14" r="4" fill="white" />
        </svg>
      );
  }
}
