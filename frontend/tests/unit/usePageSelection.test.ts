import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePageSelection } from '../../src/pages/Admin/hooks/usePageSelection';

describe('usePageSelection', () => {
  it('toggles individual and page-wide selections', () => {
    const { result } = renderHook(() => usePageSelection());

    act(() => result.current.toggle('first', true));
    expect([...result.current.selectedIds]).toEqual(['first']);

    act(() => result.current.toggleAll(['first', 'second'], true));
    expect([...result.current.selectedIds]).toEqual(['first', 'second']);

    act(() => result.current.toggleAll(['first', 'second'], false));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('replaces the selected IDs and clears them', () => {
    const { result } = renderHook(() => usePageSelection());

    act(() => result.current.replace(['failed']));
    expect([...result.current.selectedIds]).toEqual(['failed']);

    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
  });
});
