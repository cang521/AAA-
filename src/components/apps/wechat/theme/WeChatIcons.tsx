import React from 'react';

interface WeChatIconProps {
  className?: string;
}

/**
 * Classic WeChat solid white person-plus silhouette SVG.
 * Uses fill="currentColor" with zero strokes so parent text color controls exact white/green rendering.
 */
export const WeChatPersonPlusIcon: React.FC<WeChatIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    aria-hidden="true"
    className={className}
  >
    {/* Solid circular head */}
    <circle cx="9.5" cy="7.5" r="3.6" />
    {/* Solid shoulders / bust */}
    <path d="M3.2 18.8c0-3.15 2.82-5.3 6.3-5.3s6.3 2.15 6.3 5.3c0 .66-.54 1.2-1.2 1.2H4.4c-.66 0-1.2-.54-1.2-1.2z" />
    {/* Solid crisp plus sign */}
    <rect x="17" y="6.5" width="2" height="8" rx="1" />
    <rect x="14" y="9.5" width="8" height="2" rx="1" />
  </svg>
);

/**
 * Classic WeChat solid white two-person group silhouette SVG.
 */
export const WeChatGroupIcon: React.FC<WeChatIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    aria-hidden="true"
    className={className}
  >
    {/* Primary front person */}
    <circle cx="9.2" cy="8.2" r="3.3" />
    <path d="M3 18.8c0-2.9 2.65-4.9 6.2-4.9s6.2 2 6.2 4.9c0 .66-.54 1.2-1.2 1.2H4.2c-.66 0-1.2-.54-1.2-1.2z" />
    {/* Secondary side person */}
    <circle cx="16.4" cy="9.1" r="2.65" />
    <path d="M16.1 13.75c2.75 0 4.9 1.8 4.9 4.55 0 .6-.48 1.1-1.08 1.1h-3.35c.09-.35.14-.72.14-1.1 0-1.85-.92-3.38-2.32-4.32.54-.15 1.12-.23 1.71-.23z" />
  </svg>
);
