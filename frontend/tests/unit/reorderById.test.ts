import { describe, expect, it } from 'vitest';
import { reorderById } from '../../src/shared/hooks/usePointerReorder';

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
