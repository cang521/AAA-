import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export type TextEditableElement = HTMLInputElement | HTMLTextAreaElement;
export type SelectionDirection = 'forward' | 'backward' | 'none';

export interface CapturedSelection {
  start: number;
  end: number;
  direction: SelectionDirection;
}

interface PendingSelectionCommit extends CapturedSelection {
  expectedValue: string;
}

const SELECTION_SUPPORTED_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'url',
  'tel',
  'password',
]);

export function supportsSelectionRange(el: TextEditableElement | null): el is TextEditableElement {
  if (!el) return false;
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) {
    return typeof el.setSelectionRange === 'function';
  }
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    return SELECTION_SUPPORTED_INPUT_TYPES.has(type) && typeof el.setSelectionRange === 'function';
  }
  return false;
}

export function clampSelection(
  valueLength: number,
  selection: CapturedSelection
): CapturedSelection {
  const safeMax = Math.max(0, valueLength);
  const start = Math.max(0, Math.min(safeMax, selection.start));
  const end = Math.max(start, Math.min(safeMax, selection.end));
  return {
    start,
    end,
    direction: selection.direction || 'none',
  };
}

export function readElementSelection(el: TextEditableElement | null): CapturedSelection | null {
  if (!el || !supportsSelectionRange(el)) return null;
  try {
    const rawStart = el.selectionStart;
    const rawEnd = el.selectionEnd;
    if (typeof rawStart !== 'number' || typeof rawEnd !== 'number') {
      return null;
    }
    const rawDirection = el.selectionDirection;
    const direction: SelectionDirection =
      rawDirection === 'forward' || rawDirection === 'backward' || rawDirection === 'none'
        ? rawDirection
        : 'none';
    return clampSelection(el.value.length, {
      start: rawStart,
      end: rawEnd,
      direction,
    });
  } catch {
    return null;
  }
}

export function applyElementSelectionSafely(
  el: TextEditableElement | null,
  selection: CapturedSelection
): void {
  if (!el || !supportsSelectionRange(el)) return;
  if (typeof document !== 'undefined' && document.activeElement !== el) return;
  try {
    const clamped = clampSelection(el.value.length, selection);
    const currentStart = el.selectionStart;
    const currentEnd = el.selectionEnd;
    const currentDir = el.selectionDirection || 'none';
    if (
      currentStart === clamped.start &&
      currentEnd === clamped.end &&
      currentDir === clamped.direction
    ) {
      return;
    }
    el.setSelectionRange(clamped.start, clamped.end, clamped.direction);
  } catch {
    // Ignore capability errors on exotic mobile WebViews / input types
  }
}

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
  onBeforeInput?: React.FormEventHandler<T>;
  onSelect?: React.ReactEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionUpdate?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
  onKeyDown?: React.KeyboardEventHandler<T>;
  onFocus?: React.FocusEventHandler<T>;
  onBlur?: React.FocusEventHandler<T>;
}

export function useStableTextEditing<T extends TextEditableElement>(
  options: UseStableTextEditingOptions<T>
) {
  const {
    value,
    autoResize = false,
    minHeightPx = 36,
    maxHeightPx = 132,
  } = options;

  const isControlled = value !== undefined;
  const normalizedValue = typeof value === 'string' ? value : value === undefined ? '' : String(value);

  const elementRef = useRef<T | null>(null);
  const isFocusedRef = useRef(false);
  const isComposingRef = useRef(false);
  const lastCompositionEndTimestampRef = useRef(0);
  const lastSelectionRef = useRef<CapturedSelection | null>(null);
  const pendingCommitRef = useRef<PendingSelectionCommit | null>(null);
  const latestPropValueRef = useRef<string>(normalizedValue);
  latestPropValueRef.current = normalizedValue;
  const lastDispatchedValueRef = useRef<string>(normalizedValue);

  const rafIdRef = useRef<number | null>(null);
  const timerIdRef = useRef<number | null>(null);

  const latestCallbacksRef = useRef(options);
  latestCallbacksRef.current = options;

  const cancelPendingAsyncSync = useCallback(() => {
    if (rafIdRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPendingAsyncSync(), [cancelPendingAsyncSync]);

  const mergedRef = useCallback((node: T | null) => {
    elementRef.current = node;
    const extRef = latestCallbacksRef.current.externalRef;
    if (typeof extRef === 'function') {
      extRef(node);
    } else if (extRef && typeof extRef === 'object') {
      (extRef as React.MutableRefObject<T | null>).current = node;
    }
  }, []);

  const resizeTextareaPreservingSelection = useCallback(
    (el: T | null) => {
      if (!autoResize || !el) return;
      if (typeof HTMLTextAreaElement === 'undefined' || !(el instanceof HTMLTextAreaElement)) {
        return;
      }

      if (!el.value || el.value.trim() === '') {
        el.style.height = `${minHeightPx}px`;
        el.style.overflowY = 'hidden';
        el.scrollTop = 0;
        return;
      }

      const isActive = typeof document !== 'undefined' && document.activeElement === el;
      const savedScrollTop = el.scrollTop;
      const savedSelection = isActive && !isComposingRef.current ? readElementSelection(el) : null;
      const totalLength = el.value.length;

      el.style.height = 'auto';
      const scrollHeight = el.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeightPx), maxHeightPx);
      el.style.height = `${newHeight}px`;
      const isOverflowing = scrollHeight > maxHeightPx;
      el.style.overflowY = isOverflowing ? 'auto' : 'hidden';

      if (savedSelection && isActive && !isComposingRef.current) {
        applyElementSelectionSafely(el, savedSelection);
      }

      if (isOverflowing) {
        const caretPos = savedSelection ? savedSelection.start : totalLength;
        if (caretPos >= totalLength) {
          el.scrollTop = scrollHeight;
        } else {
          el.scrollTop = savedScrollTop;
        }
      } else {
        el.scrollTop = 0;
      }
    },
    [autoResize, maxHeightPx, minHeightPx]
  );

  // Restore exact caret/selection after React commits controlled `value` to DOM.
  useLayoutEffect(() => {
    const el = elementRef.current;
    if (!el) {
      pendingCommitRef.current = null;
      return;
    }

    if (isControlled) {
      lastDispatchedValueRef.current = normalizedValue;
    }

    const pending = pendingCommitRef.current;
    pendingCommitRef.current = null;

    if (
      isControlled &&
      pending &&
      pending.expectedValue === normalizedValue &&
      el.value === normalizedValue &&
      isFocusedRef.current &&
      typeof document !== 'undefined' &&
      document.activeElement === el &&
      !isComposingRef.current
    ) {
      applyElementSelectionSafely(el, pending);
    }

    if (autoResize) {
      resizeTextareaPreservingSelection(el);
    }
  }, [normalizedValue, isControlled, autoResize, resizeTextareaPreservingSelection]);

  const captureFromElement = useCallback((el: T, markPendingForValue?: string) => {
    const selection = readElementSelection(el);
    if (selection) {
      lastSelectionRef.current = selection;
    }
    if (
      markPendingForValue !== undefined &&
      !isComposingRef.current &&
      isFocusedRef.current &&
      selection
    ) {
      pendingCommitRef.current = {
        expectedValue: markPendingForValue,
        ...selection,
      };
    } else if (isComposingRef.current) {
      pendingCommitRef.current = null;
    }
  }, []);

  const syncDomValueToParent = useCallback(
    (el: T, source: 'input' | 'change' | 'compositionUpdate' | 'compositionEnd' | 'async') => {
      const nextVal = el.value;
      captureFromElement(el, nextVal);

      if (nextVal !== lastDispatchedValueRef.current || source === 'async') {
        lastDispatchedValueRef.current = nextVal;
        if (latestCallbacksRef.current.onValueChange) {
          latestCallbacksRef.current.onValueChange(nextVal);
        } else if (source === 'async' && latestCallbacksRef.current.onChange) {
          const syntheticEvent = {
            target: el,
            currentTarget: el,
          } as unknown as React.ChangeEvent<T>;
          latestCallbacksRef.current.onChange(syntheticEvent);
        }
      }

      if (autoResize) {
        resizeTextareaPreservingSelection(el);
      }
    },
    [autoResize, captureFromElement, resizeTextareaPreservingSelection]
  );

  const scheduleAsyncDomSync = useCallback(() => {
    cancelPendingAsyncSync();
    const runCheck = () => {
      const el = elementRef.current;
      if (!el) return;
      if (el.value !== latestPropValueRef.current) {
        syncDomValueToParent(el, 'async');
      } else if (autoResize) {
        resizeTextareaPreservingSelection(el);
      }
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(runCheck);
    }
    if (typeof requestAnimationFrame === 'function') {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        runCheck();
      });
    }
    timerIdRef.current = window.setTimeout(() => {
      timerIdRef.current = null;
      runCheck();
    }, 0);
  }, [autoResize, cancelPendingAsyncSync, resizeTextareaPreservingSelection, syncDomValueToParent]);

  const handleSelect: React.ReactEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      const sel = readElementSelection(el);
      if (sel) {
        lastSelectionRef.current = sel;
      }
      latestCallbacksRef.current.onSelect?.(e);
    },
    []
  );

  const handleBeforeInput: React.FormEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      const sel = readElementSelection(el);
      if (sel) {
        lastSelectionRef.current = sel;
      }
      latestCallbacksRef.current.onBeforeInput?.(e);
      if (!isComposingRef.current) {
        scheduleAsyncDomSync();
      }
    },
    [scheduleAsyncDomSync]
  );

  const handleInput: React.FormEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      syncDomValueToParent(el, 'input');
      latestCallbacksRef.current.onInput?.(e);
    },
    [syncDomValueToParent]
  );

  const handleChange: React.ChangeEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      const nextVal = el.value;
      captureFromElement(el, nextVal);
      if (nextVal !== lastDispatchedValueRef.current) {
        lastDispatchedValueRef.current = nextVal;
        latestCallbacksRef.current.onValueChange?.(nextVal);
      }
      latestCallbacksRef.current.onChange?.(e);
      if (autoResize) {
        resizeTextareaPreservingSelection(el);
      }
    },
    [autoResize, captureFromElement, resizeTextareaPreservingSelection]
  );

  const handleCompositionStart: React.CompositionEventHandler<T> = useCallback(
    (e) => {
      isComposingRef.current = true;
      pendingCommitRef.current = null;
      cancelPendingAsyncSync();
      latestCallbacksRef.current.onCompositionStart?.(e);
    },
    [cancelPendingAsyncSync]
  );

  const handleCompositionUpdate: React.CompositionEventHandler<T> = useCallback(
    (e) => {
      const el = e.currentTarget;
      syncDomValueToParent(el, 'compositionUpdate');
      latestCallbacksRef.current.onCompositionUpdate?.(e);
    },
    [syncDomValueToParent]
  );

  const handleCompositionEnd: React.CompositionEventHandler<T> = useCallback(
    (e) => {
      isComposingRef.current = false;
      lastCompositionEndTimestampRef.current = Date.now();
      const el = e.currentTarget;
      syncDomValueToParent(el, 'compositionEnd');
      latestCallbacksRef.current.onCompositionEnd?.(e);
      scheduleAsyncDomSync();
    },
    [scheduleAsyncDomSync, syncDomValueToParent]
  );

  const handleKeyDown: React.KeyboardEventHandler<T> = useCallback((e) => {
    const el = e.currentTarget;
    const sel = readElementSelection(el);
    if (sel) {
      lastSelectionRef.current = sel;
    }
    latestCallbacksRef.current.onKeyDown?.(e);
  }, []);

  const handleFocus: React.FocusEventHandler<T> = useCallback((e) => {
    isFocusedRef.current = true;
    const sel = readElementSelection(e.currentTarget);
    if (sel) {
      lastSelectionRef.current = sel;
    }
    latestCallbacksRef.current.onFocus?.(e);
  }, []);

  const handleBlur: React.FocusEventHandler<T> = useCallback((e) => {
    isFocusedRef.current = false;
    pendingCommitRef.current = null;
    latestCallbacksRef.current.onBlur?.(e);
  }, []);

  const isCompositionActive = useCallback(
    (nativeEvent?: Event | { isComposing?: boolean; keyCode?: number }) => {
      const ev = nativeEvent as { isComposing?: boolean; keyCode?: number } | undefined;
      return Boolean(
        isComposingRef.current ||
          ev?.isComposing ||
          ev?.keyCode === 229 ||
          Date.now() - lastCompositionEndTimestampRef.current < 60
      );
    },
    []
  );

  const clearValue = useCallback(
    (nextValue = '') => {
      cancelPendingAsyncSync();
      isComposingRef.current = false;
      pendingCommitRef.current = null;
      lastDispatchedValueRef.current = nextValue;
      const el = elementRef.current;
      if (el) {
        el.value = nextValue;
        if (autoResize) {
          resizeTextareaPreservingSelection(el);
        }
      }
      latestCallbacksRef.current.onValueChange?.(nextValue);
    },
    [autoResize, cancelPendingAsyncSync, resizeTextareaPreservingSelection]
  );

  const adjustHeightNow = useCallback(() => {
    if (autoResize) {
      resizeTextareaPreservingSelection(elementRef.current);
    }
  }, [autoResize, resizeTextareaPreservingSelection]);

  return {
    elementRef,
    mergedRef,
    isComposingRef,
    lastCompositionEndTimestampRef,
    isCompositionActive,
    clearValue,
    adjustHeightNow,
    eventProps: {
      onSelect: handleSelect,
      onBeforeInput: handleBeforeInput,
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
