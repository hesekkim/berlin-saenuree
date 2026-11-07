import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInputField } from '../../src/shared/components/ui/InputField/useInputField';

describe('useInputField', () => {
  it('shows clear button only when clearable and value is non-empty', () => {
    const { result, rerender } = renderHook(
      ({ value }) =>
        useInputField({
          value,
          onChange: vi.fn(),
          clearable: true,
        }),
      { initialProps: { value: '' } }
    );

    expect(result.current.showClearButton).toBe(false);

    rerender({ value: 'content' });
    expect(result.current.showClearButton).toBe(true);
  });

  it('clears controlled value through onChange', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useInputField({
        value: 'content',
        onChange,
        clearable: true,
      })
    );

    act(() => {
      result.current.handleClear({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent<HTMLButtonElement>);
    });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clears uncontrolled value in local state', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useInputField({
        defaultValue: 'content',
        onChange,
        clearable: true,
      })
    );

    expect(result.current.currentValue).toBe('content');
    expect(result.current.showClearButton).toBe(true);

    act(() => {
      result.current.handleClear({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent<HTMLButtonElement>);
    });

    expect(result.current.currentValue).toBe('');
    expect(result.current.showClearButton).toBe(false);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
