import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Heart } from 'lucide-react';

export interface LikeBurstButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

interface BurstInstance {
  id: number;
}

const BURST_PARTICLES = Array.from({ length: 8 }, (_, idx) => {
  const angleDeg = idx * 45;
  const angleRad = (angleDeg * Math.PI) / 180;
  const distance = idx % 2 === 0 ? 18 : 15;
  const colors = [
    '#F43F5E', // rose
    '#EC4899', // pink
    '#FB7185', // coral rose
    '#A855F7', // violet
    '#F43F5E',
    '#F472B6',
    '#C084FC',
    '#FDA4AF',
  ];
  return {
    idx,
    dx: Math.cos(angleRad) * distance,
    dy: Math.sin(angleRad) * distance,
    color: colors[idx],
    size: idx % 2 === 0 ? 4 : 3,
  };
});

export const LikeBurstButton: React.FC<LikeBurstButtonProps> = ({
  liked,
  count,
  onToggle,
  disabled = false,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const prevLikedRef = useRef<boolean>(liked);
  const prevCountRef = useRef<number>(count);
  const countDirectionRef = useRef<1 | -1>(1);

  const [bursts, setBursts] = useState<BurstInstance[]>([]);
  const [heartTargetScale, setHeartTargetScale] = useState<number>(1);
  const burstIdRef = useRef(0);
  const bounceTimerRef = useRef<number | null>(null);

  if (count !== prevCountRef.current) {
    countDirectionRef.current = count > prevCountRef.current ? 1 : -1;
    prevCountRef.current = count;
  }

  useEffect(() => {
    const wasLiked = prevLikedRef.current;
    prevLikedRef.current = liked;

    // Trigger burst & bounce ONLY on unliked -> liked transition
    if (!wasLiked && liked && !prefersReducedMotion) {
      const id = ++burstIdRef.current;
      setBursts((prev) => [...prev.slice(-2), { id }]);

      if (bounceTimerRef.current) {
        window.clearTimeout(bounceTimerRef.current);
      }
      setHeartTargetScale(1.3);
      bounceTimerRef.current = window.setTimeout(() => {
        setHeartTargetScale(1);
      }, 115);
    }
  }, [liked, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (bounceTimerRef.current) {
        window.clearTimeout(bounceTimerRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;
    onToggle();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-pressed={liked}
      aria-label={liked ? `取消点赞，当前 ${count} 赞` : `点赞，当前 ${count} 赞`}
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-colors cursor-pointer select-none ${
        liked ? 'ui-like-on' : 'ui-like-off'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {/* Heart + Radial Burst Container */}
      <span className="relative inline-flex items-center justify-center w-4 h-4 shrink-0">
        <AnimatePresence>
          {bursts.map((burst) => (
            <span
              key={burst.id}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              {BURST_PARTICLES.map((p) => (
                <motion.span
                  key={p.idx}
                  initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                  animate={{ x: p.dx, y: p.dy, scale: [0.4, 1.15, 0], opacity: [1, 1, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
                  onAnimationComplete={
                    p.idx === 0
                      ? () => setBursts((prev) => prev.filter((item) => item.id !== burst.id))
                      : undefined
                  }
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                  }}
                />
              ))}
            </span>
          ))}
        </AnimatePresence>

        <motion.span
          animate={{ scale: prefersReducedMotion ? 1 : heartTargetScale }}
          transition={
            prefersReducedMotion
              ? { duration: 0.1 }
              : heartTargetScale > 1
              ? { duration: 0.11, ease: 'easeOut' }
              : { type: 'spring', stiffness: 300, damping: 10, mass: 0.7 }
          }
          className="inline-flex items-center justify-center"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors duration-200 ${
              liked ? 'fill-rose-500 text-rose-500' : 'text-current'
            }`}
          />
        </motion.span>
      </span>

      {/* Fixed-height Counter with Smooth Slide */}
      <span className="relative inline-flex items-center h-4 overflow-hidden min-w-[1ch] justify-center font-medium text-[11px] leading-none">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={
              prefersReducedMotion
                ? { opacity: 0.6 }
                : { y: countDirectionRef.current > 0 ? 10 : -8, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { y: countDirectionRef.current > 0 ? -10 : 8, opacity: 0 }
            }
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block tabular-nums"
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="text-[11px] leading-none">赞</span>
    </button>
  );
};
