import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../src/shared/components/ui/Toast/useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes info, warning, and error toasts', () => {
    const { result } = renderHook(() => useToastStore());

    act(() => {
      result.current.info('Saved');
      result.current.warning('Check input');
      result.current.error('Failed');
    });

    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((toast) => toast.variant)).toEqual([
      'info',
      'warning',
      'error',
    ]);
    expect(result.current.toasts.map((toast) => toast.message)).toEqual([
      'Saved',
      'Check input',
      'Failed',
    ]);
  });

  it('dismisses a toast manually and on timeout', () => {
    const { result } = renderHook(() => useToastStore(1000));

    let firstId = '';
    act(() => {
      firstId = result.current.info('First');
      result.current.info('Second');
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(firstId);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Second');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
