import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTrashPagination } from '../../src/pages/Admin/Pages/Trash/hooks/useTrashPagination';

describe('useTrashPagination', () => {
  it('slices items and navigates within page boundaries', () => {
    const items = Array.from({ length: 5 }, (_, index) => index + 1);
    const { result } = renderHook(() => useTrashPagination(items, 2));

    expect(result.current.pageItems).toEqual([1, 2]);
    expect(result.current.pageCount).toBe(3);

    act(() => result.current.goToPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toEqual([3, 4]);

    act(() => result.current.goToPage(99));
    expect(result.current.page).toBe(3);
    expect(result.current.pageItems).toEqual([5]);

    act(() => result.current.goToPage(0));
    expect(result.current.page).toBe(1);
  });

  it('moves to the last available page when items are removed', () => {
    const initialItems = Array.from({ length: 5 }, (_, index) => index + 1);
    const { result, rerender } = renderHook(
      ({ items }) => useTrashPagination(items, 2),
      { initialProps: { items: initialItems } },
    );

    act(() => result.current.goToPage(3));
    expect(result.current.page).toBe(3);

    rerender({ items: [1, 2] });
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2]);
  });
});
