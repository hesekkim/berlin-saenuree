import { describe, expect, it } from 'vitest';
import {
  computeCanGoNextFromPhotos,
  takeImagesWithinLimit,
} from '../../src/pages/Admin/Pages/Posts/hooks/usePostComposer';

describe('computeCanGoNextFromPhotos', () => {
  it('requires at least one image and idle uploads', () => {
    expect(computeCanGoNextFromPhotos(0, false, false)).toBe(false);
    expect(computeCanGoNextFromPhotos(1, true, false)).toBe(false);
    expect(computeCanGoNextFromPhotos(1, false, true)).toBe(false);
    expect(computeCanGoNextFromPhotos(2, false, false)).toBe(true);
  });
});

describe('takeImagesWithinLimit', () => {
  it('keeps only room left under the max', () => {
    const incoming = ['a', 'b', 'c', 'd'];
    expect(takeImagesWithinLimit(28, incoming, 30)).toEqual({
      accepted: ['a', 'b'],
      rejected: ['c', 'd'],
    });
    expect(takeImagesWithinLimit(0, incoming, 30).accepted).toHaveLength(4);
    expect(takeImagesWithinLimit(30, incoming, 30)).toEqual({
      accepted: [],
      rejected: incoming,
    });
  });
});
