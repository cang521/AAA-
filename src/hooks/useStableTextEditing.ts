import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export type TextEditableElement = HTMLInputElement | HTMLTextAreaElement;

export interface UseStableTextEditingOptions<T extends TextEditableElement> {
  value?: string;
  defaultValue?: string | number | readonly string[];
  onValueChange?: (nextValue: string) => void;
  onHasTextChange?: (hasText: boolean) => void;
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
  const lastHasTextRef = useRef<boolean>(initialDefaultValueRef.current.trim().length > 0);
  const prevExternalValueRef = useRef<string>(normalizedExternalValue);
  const lastBlurSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const latestCallbacksRef = useRef(options);
  latestCallbacksRef.current = options;

  const notifyHasTextIfChanged = useCallback((rawVal: string) => {
    const nextHasText = rawVal.trim().length > 0;
    if (nextHasText !== lastHasTextRef.current) {
      lastHasTextRef.current = nextHasText;
      latestCallbacksRef.current.onHasTextChange?.(nextHasText);
    }
  }, []);

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
      if (node) {
        notifyHasTextIfChanged(node.value);
        if (autoResize) {
          adjustHeightNow();
        }
      }
    },
    [adjustHeightNow, autoResize, notifyHasTextIfChanged]
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
        lastBlurSelectionRef.current = null;
        notifyHasTextIfChanged('');
        if (autoResize) {
          adjustHeightNow();
        }
      }
      return;
    }

    if (el.value !== normalizedExternalValue) {
      el.value = normalizedExternalValue;
      lastSyncedValueRef.current = normalizedExternalValue;
      lastBlurSelectionRef.current = null;
      notifyHasTextIfChanged(normalizedExternalValue);
      if (autoResize) {
        adjustHeightNow();
      }
    }
  }, [hasExternalValue, normalizedExternalValue, autoResize, adjustHeightNow, notifyHasTextIfChanged]);

  useLayoutEffect(() => {
    if (autoResize) {
      adjustHeightNow();
    }
  }, [autoResize, adjustHeightNow]);

  const syncDomValueOnce = useCallback(
    (el: T) => {
      const nextVal = el.value;
      notifyHasTextIfChanged(nextVal);
      if (nextVal !== lastSyncedValueRef.current) {
        lastSyncedValueRef.current = nextVal;
        latestCallbacksRef.current.onValueChange?.(nextVal);
      }
      if (autoResize) {
        adjustHeightNow();
      }
    },
    [adjustHeightNow, autoResize, notifyHasTextIfChanged]
  );

  const handleInput: React.FormEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      const nativeEvent = e.nativeEvent as InputEvent | undefined;

      // Always reflect whether DOM is non-empty immediately (turns send button green on 1st char even in IME preedit)
      notifyHasTextIfChanged(el.value);

      // Android WebView IME sometimes commits without firing compositionend, emitting input with isComposing === false
      if (isComposingRef.current && nativeEvent && nativeEvent.isComposing === false) {
        isComposingRef.current = false;
      }

      if (!isComposingRef.current && !nativeEvent?.isComposing) {
        syncDomValueOnce(el);
      } else if (autoResize) {
        adjustHeightNow();
      }
      latestCallbacksRef.current.onInput?.(e);
    },
    [adjustHeightNow, autoResize, notifyHasTextIfChanged, syncDomValueOnce]
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
    notifyHasTextIfChanged(e.currentTarget.value);
    latestCallbacksRef.current.onCompositionUpdate?.(e);
  }, [notifyHasTextIfChanged]);

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

  const handleBlur: React.FocusEventHandler<T> = useCallback(
    (e) => {
      isFocusedRef.current = false;
      const el = e.currentTarget;
      if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        lastBlurSelectionRef.current = {
          start: el.selectionStart,
          end: el.selectionEnd,
        };
      }
      if (isComposingRef.current) {
        isComposingRef.current = false;
        syncDomValueOnce(el);
      } else {
        notifyHasTextIfChanged(el.value);
      }
      latestCallbacksRef.current.onBlur?.(e);
    },
    [notifyHasTextIfChanged, syncDomValueOnce]
  );

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
    (nextValue: string, cursorPos?: number) => {
      isComposingRef.current = false;
      lastSyncedValueRef.current = nextValue;
      notifyHasTextIfChanged(nextValue);
      const el = elementRef.current;
      if (el) {
        el.value = nextValue;
        if (autoResize) {
          adjustHeightNow();
        }
        if (typeof cursorPos === 'number') {
          const clamped = Math.max(0, Math.min(cursorPos, nextValue.length));
          lastBlurSelectionRef.current = { start: clamped, end: clamped };
          if (typeof el.setSelectionRange === 'function') {
            try {
              el.setSelectionRange(clamped, clamped);
            } catch {
              // ignore unsupported input types
            }
          }
        } else if (nextValue === '') {
          lastBlurSelectionRef.current = null;
        }
      }
      latestCallbacksRef.current.onValueChange?.(nextValue);
    },
    [adjustHeightNow, autoResize, notifyHasTextIfChanged]
  );

  const insertAtCursor = useCallback(
    (
      insertText: string,
      insertOptions?: { replacePrecedingChar?: string; focus?: boolean }
    ) => {
      const el = elementRef.current;
      const currentVal = el ? el.value : lastSyncedValueRef.current;
      const shouldFocus = insertOptions?.focus !== false;

      let start = currentVal.length;
      let end = currentVal.length;

      const isElFocused =
        el !== null &&
        typeof document !== 'undefined' &&
        document.activeElement === el;

      if (isElFocused && el && typeof el.selectionStart === 'number') {
        start = el.selectionStart;
        end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.selectionStart;
      } else if (lastBlurSelectionRef.current) {
        start = Math.max(0, Math.min(lastBlurSelectionRef.current.start, currentVal.length));
        end = Math.max(start, Math.min(lastBlurSelectionRef.current.end, currentVal.length));
      } else if (el && typeof el.selectionStart === 'number' && el.selectionStart > 0) {
        start = Math.max(0, Math.min(el.selectionStart, currentVal.length));
        end = Math.max(start, Math.min(el.selectionEnd ?? el.selectionStart, currentVal.length));
      }

      let replaceStart = start;
      const preceding = insertOptions?.replacePrecedingChar;
      if (
        preceding &&
        start === end &&
        start >= preceding.length &&
        currentVal.slice(start - preceding.length, start) === preceding
      ) {
        replaceStart = start - preceding.length;
      }

      const nextValue =
        currentVal.slice(0, replaceStart) + insertText + currentVal.slice(end);
      const nextCaret = replaceStart + insertText.length;

      if (el && shouldFocus && typeof document !== 'undefined' && document.activeElement !== el) {
        el.focus();
      }

      setNativeValue(nextValue, nextCaret);
    },
    [setNativeValue]
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
    insertAtCursor,
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
