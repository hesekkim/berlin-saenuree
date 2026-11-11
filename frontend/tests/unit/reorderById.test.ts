import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reorderById,
  usePointerReorder,
} from '../../src/shared/hooks/usePointerReorder';
import type { PointerEvent as ReactPointerEvent } from 'react';

type Row = { id: string };

const getId = (row: Row) => row.id;
const rows = (ids: string) => ids.split('').map((id) => ({ id }));
const order = (list: Row[]) => list.map(getId).join('');

describe('reorderById', () => {
  it('moves the active item forward to the target position', () => {
    expect(order(reorderById(rows('abcd'), getId, 'a', 'c'))).toBe('bcad');
  });

  it('moves the active item backward to the target position', () => {
    expect(order(reorderById(rows('abcd'), getId, 'd', 'b'))).toBe('adbc');
  });

  it('moves the active item to the head', () => {
    expect(order(reorderById(rows('abc'), getId, 'c', 'a'))).toBe('cab');
  });

  it('swaps neighbours', () => {
    expect(order(reorderById(rows('ab'), getId, 'a', 'b'))).toBe('ba');
  });

  it('keeps the same reference when active and target match', () => {
    const items = rows('abc');
    expect(reorderById(items, getId, 'b', 'b')).toBe(items);
  });

  it('keeps the same reference when an id is unknown', () => {
    const items = rows('abc');
    expect(reorderById(items, getId, 'a', 'z')).toBe(items);
    expect(reorderById(items, getId, 'z', 'a')).toBe(items);
  });
});

describe('usePointerReorder', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('activates touch reordering after the configured hold', () => {
    vi.useFakeTimers();
    const onReorder = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePointerReorder({
        items: rows('ab'),
        getId,
        onReorder,
        holdMs: 450,
        axis: 'x',
      }),
    );
    const handle = document.createElement('button');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 40,
      bottom: 40,
      width: 40,
      height: 40,
      toJSON: () => ({}),
    });
    const targetRow = document.createElement('li');
    targetRow.dataset.reorderId = 'b';
    const target = document.createElement('button');
    targetRow.append(target);
    document.body.append(targetRow);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });
    const pointerDown = {
      button: 0,
      pointerType: 'touch',
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      currentTarget: handle,
      preventDefault: vi.fn(),
    } as unknown as ReactPointerEvent<HTMLElement>;

    act(() => result.current.onPointerDown('a', pointerDown));
    expect(result.current.draggingId).toBeNull();

    act(() => vi.advanceTimersByTime(450));
    expect(result.current.draggingId).toBe('a');

    act(() => {
      const pointerMove = new Event('pointermove', { cancelable: true });
      Object.assign(pointerMove, {
        pointerId: 1,
        clientX: 80,
        clientY: 100,
      });
      window.dispatchEvent(pointerMove);
    });
    expect(onReorder).toHaveBeenCalledWith(rows('ba'));

    unmount();
    targetRow.remove();
  });
});
