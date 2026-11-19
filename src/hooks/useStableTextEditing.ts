import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export type TextEditableElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseStableTextEditingOptions<T extends TextEditableElement> {
  value?: string;
  defaultValue?: string | number | readonly string[];
  onValueChange?: (nextValue: string) => void;
  externalRef?: React.Ref<T>;
  disabled?: boolean;
  readOnly?: boolean;
  autoResize?: boolean;
  minHeightPx?: number;
  maxHeightPx?: number;
  onChange?: React.ChangeEventHandler<T>;
  onInput?: React.FormEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionUpdate?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
  onKeyDown?: React.KeyboardEventHandler<T>;
  onFocus?: React.FocusEventHandler<T>;
  onBlur?: React.FocusEventHandler<T>;
}

function normalizeToString(val: string | number | readonly string[] | undefined): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.join('');
  return typeof val === 'string' ? val : String(val);
}

export function useStableTextEditing<T extends TextEditableElement>(
  options: UseStableTextEditingOptions<T>
) {
  const {
    value,
    defaultValue,
    autoResize = false,
    minHeightPx = 36,
    maxHeightPx = 132,
  } = options;

  const hasExternalValue = value !== undefined;
  const normalizedExternalValue = hasExternalValue ? normalizeToString(value) : '';
  const initialDefaultValueRef = useRef<string>(
    hasExternalValue ? normalizedExternalValue : normalizeToString(defaultValue)
  );

  const elementRef = useRef<T | null>(null);
  const isFocusedRef = useRef(false);
  const isComposingRef = useRef(false);
  const lastCompositionEndTimestampRef = useRef(0);
  const lastSyncedValueRef = useRef<string>(initialDefaultValueRef.current);
  const prevExternalValueRef = useRef<string>(normalizedExternalValue);

  const latestCallbacksRef = useRef(options);
  latestCallbacksRef.current = options;

  const adjustHeightNow = useCallback(() => {
    if (!autoResize) return;
    const el = elementRef.current;
    if (!el) return;
    if (typeof HTMLTextAreaElement === 'undefined' || !(el instanceof HTMLTextAreaElement)) {
      return;
    }

    if (!el.value) {
      el.style.height = `${minHeightPx}px`;
      el.style.overflowY = 'hidden';
      return;
    }

    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeightPx), maxHeightPx);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = scrollHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [autoResize, maxHeightPx, minHeightPx]);

  const mergedRef = useCallback(
    (node: T | null) => {
      elementRef.current = node;
      const extRef = latestCallbacksRef.current.externalRef;
      if (typeof extRef === 'function') {
        extRef(node);
      } else if (extRef && typeof extRef === 'object') {
        (extRef as React.MutableRefObject<T | null>).current = node;
      }
      if (node && autoResize) {
        adjustHeightNow();
      }
    },
    [adjustHeightNow, autoResize]
  );

  // Sync external `value` prop ONLY when the element is NOT focused/editing
  // (or on an explicit programmatic reset to empty string after submission).
  useEffect(() => {
    if (!hasExternalValue) return;
    const prevExternal = prevExternalValueRef.current;
    prevExternalValueRef.current = normalizedExternalValue;

    const el = elementRef.current;
    if (!el) return;
    if (isComposingRef.current) return;

    const isCurrentlyFocused =
      isFocusedRef.current ||
      (typeof document !== 'undefined' && document.activeElement === el);

    if (isCurrentlyFocused) {
      // Never overwrite DOM with external state while user is focused & editing,
      // except when an external Enter-to-submit handler explicitly clears a non-empty field to ''.
      const isExplicitProgrammaticReset =
        normalizedExternalValue === '' &&
        prevExternal !== '' &&
        el.value !== '' &&
        lastSyncedValueRef.current === el.value;

      if (isExplicitProgrammaticReset) {
        el.value = '';
        lastSyncedValueRef.current = '';
        if (autoResize) {
          adjustHeightNow();
        }
      }
      return;
    }

    if (el.value !== normalizedExternalValue) {
      el.value = normalizedExternalValue;
      lastSyncedValueRef.current = normalizedExternalValue;
      if (autoResize) {
        adjustHeightNow();
      }
    }
  }, [hasExternalValue, normalizedExternalValue, autoResize, adjustHeightNow]);

  useLayoutEffect(() => {
    if (autoResize) {
      adjustHeightNow();
    }
  }, [autoResize, adjustHeightNow]);

  const syncDomValueOnce = useCallback(
    (el: T) => {
      const nextVal = el.value;
      if (nextVal !== lastSyncedValueRef.current) {
        lastSyncedValueRef.current = nextVal;
        latestCallbacksRef.current.onValueChange?.(nextVal);
      }
      if (autoResize) {
        adjustHeightNow();
      }
    },
    [adjustHeightNow, autoResize]
  );

  const handleInput: React.FormEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      const nativeEvent = e.nativeEvent as InputEvent | undefined;
      if (!isComposingRef.current && !nativeEvent?.isComposing) {
        syncDomValueOnce(el);
      } else if (autoResize) {
        adjustHeightNow();
      }
      latestCallbacksRef.current.onInput?.(e);
    },
    [adjustHeightNow, autoResize, syncDomValueOnce]
  );

  const handleChange: React.ChangeEventHandler<T> = useCallback((e) => {
    // Do NOT duplicate onValueChange here (onInput already handles it).
    // Forward optional caller `onChange` only when not in IME composition.
    if (!isComposingRef.current) {
      latestCallbacksRef.current.onChange?.(e);
    }
  }, []);

  const handleCompositionStart: React.CompositionEventHandler<T> = useCallback((e) => {
    isComposingRef.current = true;
    latestCallbacksRef.current.onCompositionStart?.(e);
  }, []);

  const handleCompositionUpdate: React.CompositionEventHandler<T> = useCallback((e) => {
    // Intentionally do NOT update React state, write DOM, or modify cursor during compositionupdate.
    latestCallbacksRef.current.onCompositionUpdate?.(e);
  }, []);

  const handleCompositionEnd: React.CompositionEventHandler<T> = useCallback(
    (e) => {
      isComposingRef.current = false;
      lastCompositionEndTimestampRef.current = Date.now();
      syncDomValueOnce(e.currentTarget);
      latestCallbacksRef.current.onCompositionEnd?.(e);
    },
    [syncDomValueOnce]
  );

  const handleKeyDown: React.KeyboardEventHandler<T> = useCallback((e) => {
    latestCallbacksRef.current.onKeyDown?.(e);
  }, []);

  const handleFocus: React.FocusEventHandler<T> = useCallback((e) => {
    isFocusedRef.current = true;
    latestCallbacksRef.current.onFocus?.(e);
  }, []);

  const handleBlur: React.FocusEventHandler<T> = useCallback((e) => {
    isFocusedRef.current = false;
    latestCallbacksRef.current.onBlur?.(e);
  }, []);

  const isCompositionActive = useCallback(
    (nativeEvent?: Event | { isComposing?: boolean; keyCode?: number }) => {
      const ev = nativeEvent as { isComposing?: boolean; keyCode?: number } | undefined;
      return Boolean(
        isComposingRef.current ||
          ev?.isComposing ||
          ev?.keyCode === 229 ||
          Date.now() - lastCompositionEndTimestampRef.current < 80
      );
    },
    []
  );

  const setNativeValue = useCallback(
    (nextValue: string) => {
      isComposingRef.current = false;
      lastSyncedValueRef.current = nextValue;
      const el = elementRef.current;
      if (el) {
        el.value = nextValue;
        if (autoResize) {
          adjustHeightNow();
        }
      }
      latestCallbacksRef.current.onValueChange?.(nextValue);
    },
    [adjustHeightNow, autoResize]
  );

  const clear = useCallback(() => {
    setNativeValue('');
  }, [setNativeValue]);

  const getValue = useCallback(() => {
    return elementRef.current ? elementRef.current.value : lastSyncedValueRef.current;
  }, []);

  return {
    elementRef,
    mergedRef,
    initialDefaultValue: initialDefaultValueRef.current,
    isComposingRef,
    lastCompositionEndTimestampRef,
    isCompositionActive,
    setNativeValue,
    clear,
    clearValue: setNativeValue,
    getValue,
    adjustHeightNow,
    eventProps: {
      onInput: handleInput,
      onChange: handleChange,
      onCompositionStart: handleCompositionStart,
      onCompositionUpdate: handleCompositionUpdate,
      onCompositionEnd: handleCompositionEnd,
      onKeyDown: handleKeyDown,
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
  };
}
