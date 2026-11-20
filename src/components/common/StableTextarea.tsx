import React from 'react';
import { useStableTextEditing } from '../../hooks/useStableTextEditing';

export interface StableTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> {
  value?: string;
  onValueChange?: (nextValue: string) => void;
  onHasTextChange?: (hasText: boolean) => void;
  autoResize?: boolean;
  minHeightPx?: number;
  maxHeightPx?: number;
}

export const StableTextarea = React.forwardRef<HTMLTextAreaElement, StableTextareaProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      onHasTextChange,
      autoResize = false,
      minHeightPx = 36,
      maxHeightPx = 132,
      onChange,
      onInput,
      onCompositionStart,
      onCompositionUpdate,
      onCompositionEnd,
      onKeyDown,
      onFocus,
      onBlur,
      disabled,
      readOnly,
      ...rest
    },
    ref
  ) => {
    const { mergedRef, initialDefaultValue, eventProps } = useStableTextEditing<HTMLTextAreaElement>({
      value,
      defaultValue,
      onValueChange,
      onHasTextChange,
      externalRef: ref,
      disabled,
      readOnly,
      autoResize,
      minHeightPx,
      maxHeightPx,
      onChange,
      onInput,
      onCompositionStart,
      onCompositionUpdate,
      onCompositionEnd,
      onKeyDown,
      onFocus,
      onBlur,
    });

    return (
      <textarea
        ref={mergedRef}
        {...rest}
        defaultValue={initialDefaultValue}
        disabled={disabled}
        readOnly={readOnly}
        {...eventProps}
      />
    );
  }
);

StableTextarea.displayName = 'StableTextarea';
