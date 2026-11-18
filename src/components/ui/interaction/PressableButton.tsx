import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { TouchRipple, useTouchRipple, RippleTone } from './TouchRipple';

export interface PressableButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  loading?: boolean;
  pressScale?: number;
  withRipple?: boolean;
  rippleTone?: RippleTone | string;
  expandHitArea?: boolean;
}

export const PressableButton = React.forwardRef<HTMLButtonElement, PressableButtonProps>(
  (
    {
      children,
      className = '',
      style,
      disabled = false,
      loading = false,
      type = 'button',
      pressScale = 0.94,
      withRipple = false,
      rippleTone = 'light',
      expandHitArea = false,
      onPointerDown,
      onClick,
      ...rest
    },
    ref
  ) => {
    const prefersReducedMotion = useReducedMotion();
    const isBlocked = Boolean(disabled || loading);
    const [isPressed, setIsPressed] = useState(false);
    const { ripples, triggerRipple, removeRipple } = useTouchRipple(isBlocked || !withRipple);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isBlocked) {
        setIsPressed(true);
        if (withRipple) {
          triggerRipple(e);
        }
      }
      onPointerDown?.(e);
    };

    const handlePointerEnd = () => {
      if (isPressed) setIsPressed(false);
    };

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isBlocked}
        aria-busy={loading || undefined}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onClick={onClick}
        animate={
          isBlocked
            ? { scale: 1 }
            : isPressed && !prefersReducedMotion
            ? { scale: pressScale }
            : { scale: 1 }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.1 }
            : isPressed
            ? { duration: 0.08, ease: [0.22, 1, 0.36, 1] }
            : { type: 'spring', stiffness: 260, damping: 12, mass: 0.85 }
        }
        className={`relative select-none ${
          expandHitArea ? "before:content-[''] before:absolute before:-inset-1.5 before:rounded-[inherit]" : ''
        } ${
          isPressed && !isBlocked ? 'brightness-[0.97]' : ''
        } ${className}`}
        style={{
          touchAction: 'manipulation',
          ...style,
        }}
        {...rest}
      >
        {withRipple && !isBlocked && (
          <TouchRipple ripples={ripples} onRemove={removeRipple} tone={rippleTone} />
        )}
        {children}
      </motion.button>
    );
  }
);

PressableButton.displayName = 'PressableButton';
