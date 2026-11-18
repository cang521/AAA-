import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export type ToggleAccent = 'green' | 'sky' | 'amber' | 'indigo' | 'cyan';

export interface ElasticToggleProps {
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  disabled?: boolean;
  accent?: ToggleAccent;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  id?: string;
  className?: string;
}

const ACCENT_TRACK_CLASSES: Record<ToggleAccent, string> = {
  green: 'ui-toggle-green',
  sky: 'ui-toggle-sky',
  amber: 'ui-toggle-amber',
  indigo: 'ui-toggle-indigo',
  cyan: 'ui-toggle-cyan',
};

export const ElasticToggle: React.FC<ElasticToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  accent = 'green',
  size = 'md',
  ariaLabel,
  id,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const prevCheckedRef = useRef<boolean>(checked);
  const [stretchKey, setStretchKey] = useState(0);

  useEffect(() => {
    if (prevCheckedRef.current !== checked) {
      prevCheckedRef.current = checked;
      setStretchKey((k) => k + 1);
    }
  }, [checked]);

  const isSmall = size === 'sm';
  // sm: w-10 (40px) h-5 (20px) p-0.5 (2px), thumb 16px, travel = 40 - 4 - 16 = 20px
  // md: w-11 (44px) h-6 (24px) p-0.5 (2px), thumb 20px, travel = 44 - 4 - 20 = 20px
  const travelX = 20;

  const trackDimensions = isSmall ? 'w-10 h-5 p-0.5' : 'w-11 h-6 p-0.5';
  const thumbDimensions = isSmall ? 'w-4 h-4' : 'w-5 h-5';

  const trackColorClass = checked
    ? ACCENT_TRACK_CLASSES[accent]
    : 'ui-toggle-off';

  const handleToggleClick = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggleClick}
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex items-center rounded-full shrink-0 transition-colors duration-[280ms] ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 before:content-[''] before:absolute before:-inset-2 before:rounded-full ${trackDimensions} ${trackColorClass} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <motion.span
        initial={false}
        animate={{
          x: checked ? travelX : 0,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0.14 }
            : { type: 'spring', stiffness: 200, damping: 14, mass: 0.8 }
        }
        style={{
          transformOrigin: checked ? 'right center' : 'left center',
        }}
        className={`relative block rounded-full bg-white shadow-sm ${thumbDimensions}`}
      >
        {/* Horizontal elastic squash-and-stretch visual layer triggered only on toggle */}
        <motion.span
          key={stretchKey}
          initial={stretchKey === 0 || prefersReducedMotion ? { scaleX: 1 } : { scaleX: 1 }}
          animate={
            stretchKey === 0 || prefersReducedMotion
              ? { scaleX: 1 }
              : { scaleX: [1, 1.35, 1] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.1 }
              : { duration: 0.34, times: [0, 0.35, 1], ease: [0.22, 1, 0.36, 1] }
          }
          style={{
            transformOrigin: checked ? 'right center' : 'left center',
          }}
          className="block w-full h-full rounded-full bg-white"
        />
      </motion.span>
    </button>
  );
};
