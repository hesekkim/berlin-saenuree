import { describe, expect, it } from 'vitest';
import { getRatingClassName } from '../../src/shared/utils/ratingClassName';

describe('getRatingClassName', () => {
  it('maps exact rating tokens', () => {
    expect(getRatingClassName('niedrig')).toBe('tag--niedrig');
    expect(getRatingClassName('Mittel')).toBe('tag--mittel');
    expect(getRatingClassName('sehr gut')).toBe('tag--sehr-gut');
  });

  it('maps range ratings using the upper bound when it is hoch', () => {
    expect(getRatingClassName('mittel bis hoch')).toBe('tag--hoch');
    expect(getRatingClassName('niedrig bis mittel')).toBe('tag--niedrig');
  });

  it('maps leading rating tokens in longer text', () => {
    expect(getRatingClassName('gut. overall')).toBe('tag--gut');
  });

  it('falls back to range for empty or unknown values', () => {
    expect(getRatingClassName('')).toBe('tag--range');
    expect(getRatingClassName(null)).toBe('tag--range');
    expect(getRatingClassName('unknown')).toBe('tag--range');
  });
});
