import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export interface RippleItem {
  id: number;
  x: number;
  y: number;
  size: number;
}

export type RippleTone = 'light' | 'dark' | 'accent' | 'emerald' | 'rose' | 'sky';

const resolveRippleColor = (tone: RippleTone | string): string => {
  switch (tone) {
    case 'light':
      return 'rgba(255, 255, 255, 0.95)';
    case 'dark':
      return 'rgba(36, 48, 64, 0.45)';
    case 'accent':
    case 'sky':
      return 'rgba(89, 182, 232, 0.85)';
    case 'emerald':
      return 'rgba(16, 185, 129, 0.75)';
    case 'rose':
      return 'rgba(244, 63, 94, 0.75)';
    default:
      return tone;
  }
};

export function useTouchRipple(disabled = false) {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const nextIdRef = useRef(0);

  const triggerRipple = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return;

      const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
      const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
      // Diameter reaches ~2.4x button width (at least covering corners for square/tall buttons)
      const size = Math.max(rect.width * 2.4, rect.height * 2.4);

      const id = ++nextIdRef.current;
      setRipples((prev) => [...prev.slice(-4), { id, x, y, size }]);
    },
    [disabled]
  );

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { ripples, triggerRipple, removeRipple };
}

interface TouchRippleProps {
  ripples: RippleItem[];
  onRemove: (id: number) => void;
  tone?: RippleTone | string;
  className?: string;
}

export const TouchRipple: React.FC<TouchRippleProps> = ({
  ripples,
  onRemove,
  tone = 'light',
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const color = resolveRippleColor(tone);

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] z-0 ${className}`}
    >
      <AnimatePresence>
        {ripples.map((r) =>
          prefersReducedMotion ? (
            <motion.span
              key={r.id}
              initial={{ opacity: 0.16 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onAnimationComplete={() => onRemove(r.id)}
              className="absolute inset-0 rounded-[inherit]"
              style={{ backgroundColor: color }}
            />
          ) : (
            <motion.span
              key={r.id}
              initial={{ scale: 0, opacity: 0.28 }}
              animate={{ scale: 1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => onRemove(r.id)}
              className="absolute rounded-full"
              style={{
                left: r.x - r.size / 2,
                top: r.y - r.size / 2,
                width: r.size,
                height: r.size,
                backgroundColor: color,
                transformOrigin: 'center',
                willChange: 'transform, opacity',
              }}
            />
          )
        )}
      </AnimatePresence>
    </span>
  );
};
