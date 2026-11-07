import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCheckbox } from '../../src/shared/components/ui/Checkbox/useCheckbox';

function clickEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

describe('useCheckbox', () => {
  it('toggles uncontrolled state and notifies onChange', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useCheckbox({ defaultChecked: false, onChange })
    );

    act(() => {
      result.current.handleClick(clickEvent());
    });

    expect(result.current.isChecked).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps controlled state driven by props', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ checked }) => useCheckbox({ checked, onChange }),
      { initialProps: { checked: false } }
    );

    act(() => {
      result.current.handleClick(clickEvent());
    });

    expect(onChange).toHaveBeenCalledWith(true);
    expect(result.current.isChecked).toBe(false);

    rerender({ checked: true });
    expect(result.current.isChecked).toBe(true);
  });

  it('does not toggle when disabled', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useCheckbox({ defaultChecked: false, onChange, disabled: true })
    );

    act(() => {
      result.current.handleClick(clickEvent());
    });

    expect(result.current.isChecked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
