import { describe, expect, it } from 'vitest';
import { clampSlideIndex } from '../../src/pages/Admin/Pages/Posts/utils/slideIndex';

describe('clampSlideIndex', () => {
  it('clamps to valid bounds', () => {
    expect(clampSlideIndex(-1, 3)).toBe(0);
    expect(clampSlideIndex(0, 3)).toBe(0);
    expect(clampSlideIndex(2, 3)).toBe(2);
    expect(clampSlideIndex(9, 3)).toBe(2);
    expect(clampSlideIndex(1, 0)).toBe(0);
  });
});
