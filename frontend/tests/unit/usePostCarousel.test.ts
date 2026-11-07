import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostCarousel } from '../../src/pages/Admin/Pages/Posts/hooks/usePostCarousel';

describe('usePostCarousel', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('blocks prev at the first slide and next at the last', () => {
    const { result } = renderHook(() => usePostCarousel(3));

    expect(result.current.index).toBe(0);
    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(true);

    act(() => {
      result.current.goPrev();
    });
    expect(result.current.index).toBe(0);

    act(() => {
      result.current.goTo(2);
    });
    expect(result.current.index).toBe(2);
    expect(result.current.canGoPrev).toBe(true);
    expect(result.current.canGoNext).toBe(false);

    act(() => {
      result.current.goNext();
    });
    expect(result.current.index).toBe(2);
  });

  it('hides next when there is only one slide', () => {
    const { result } = renderHook(() => usePostCarousel(1));
    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(false);
  });
});
