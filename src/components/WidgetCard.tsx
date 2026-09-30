import React from 'react';

interface WidgetCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  customStyle?: React.CSSProperties;
  customBg?: string;
  interactive?: boolean;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  children,
  onClick,
  className = '',
  customStyle,
  customBg,
  interactive = true,
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: customBg || 'var(--widget-bg, rgba(255, 255, 255, 0.85))',
        borderColor: 'var(--widget-border, rgba(186, 230, 253, 0.75))',
        boxShadow: 'var(--widget-shadow, 0 8px 24px rgba(56, 189, 248, 0.12))',
        ...customStyle,
      }}
      className={`w-full rounded-3xl backdrop-blur-xl border p-3.5 sm:p-4 text-slate-800 transition-all duration-200 relative overflow-hidden ${
        onClick && interactive
          ? 'cursor-pointer active:scale-[0.98] hover:border-sky-300/90 hover:shadow-[0_10px_28px_rgba(56,189,248,0.18)]'
          : ''
      } ${className}`}
    >
      {/* Delicate Cloud Milk background decorative gradient arc */}
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br from-sky-200/25 to-sky-300/10 pointer-events-none blur-sm" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
