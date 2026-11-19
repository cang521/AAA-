import React from 'react';
import { useStableTextEditing } from '../../hooks/useStableTextEditing';

export interface StableTextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  value?: string;
  onValueChange?: (nextValue: string) => void;
}

export const StableTextInput = React.forwardRef<HTMLInputElement, StableTextInputProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
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
    const { mergedRef, initialDefaultValue, eventProps } = useStableTextEditing<HTMLInputElement>({
      value,
      defaultValue,
      onValueChange,
      externalRef: ref,
      disabled,
      readOnly,
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
      <input
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

StableTextInput.displayName = 'StableTextInput';
