import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export type CheckboxAccent = 'sky' | 'rose' | 'indigo' | 'emerald';

export interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  value?: string;
  ariaLabel?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  accent?: CheckboxAccent;
  /** Strictly opt-in ONLY for actual task/todo completion semantics */
  completedTextStyle?: boolean;
  className?: string;
}

const CHECKBOX_ACCENT_STYLES: Record<CheckboxAccent, string> = {
  sky: 'bg-[#59B6E8] border-[#59B6E8] dark:bg-sky-500 dark:border-sky-500',
  rose: 'bg-rose-500 border-rose-500',
  indigo: 'bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500',
  emerald: 'bg-emerald-500 border-emerald-500',
};

export const AnimatedCheckbox: React.FC<AnimatedCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
  name,
  value,
  ariaLabel,
  label,
  description,
  accent = 'sky',
  completedTextStyle = false,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    onChange(e.target.checked);
  };

  return (
    <label
      htmlFor={id}
      style={{ touchAction: 'manipulation' }}
      className={`group inline-flex items-center gap-2.5 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <span className="relative inline-flex items-center justify-center shrink-0">
        {/* Visually hidden native input preserving keyboard focus, Space toggle, and form semantics */}
        <input
          id={id}
          name={name}
          value={value}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={handleChange}
          className="peer sr-only"
        />

        {/* Animated Checkbox Box */}
        <motion.span
          aria-hidden="true"
          animate={
            prefersReducedMotion
              ? { scale: 1 }
              : checked
              ? { scale: [0.8, 1.08, 1] }
              : { scale: 1 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.08 }
              : { duration: 0.24, times: [0, 0.55, 1], ease: [0.22, 1, 0.36, 1] }
          }
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400/70 ${
            checked
              ? CHECKBOX_ACCENT_STYLES[accent]
              : 'ui-checkbox-off'
          }`}
        >
          <AnimatePresence>
            {checked && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-3.5 h-3.5 text-white pointer-events-none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={prefersReducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.14 } }}
                  transition={prefersReducedMotion ? { duration: 0.05 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            )}
          </AnimatePresence>
        </motion.span>
      </span>

      {(label || description) && (
        <span className="flex flex-col min-w-0">
          {label && (
            <span
              className={`text-xs font-medium transition-colors duration-200 ${
                completedTextStyle && checked
                  ? 'line-through text-zinc-400 dark:text-zinc-500'
                  : 'text-current'
              }`}
            >
              {label}
            </span>
          )}
          {description && (
            <span className="text-[10px] text-zinc-400 leading-snug">{description}</span>
          )}
        </span>
      )}
    </label>
  );
};
