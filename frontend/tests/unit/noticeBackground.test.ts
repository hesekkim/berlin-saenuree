import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTICE_BACKGROUND,
  normalizeNoticeBackground,
} from '../../src/shared/popups/noticeBackground';

describe('normalizeNoticeBackground', () => {
  it('returns default for empty or invalid values', () => {
    expect(normalizeNoticeBackground(null)).toBe(DEFAULT_NOTICE_BACKGROUND);
    expect(normalizeNoticeBackground('')).toBe(DEFAULT_NOTICE_BACKGROUND);
    expect(normalizeNoticeBackground('red')).toBe(DEFAULT_NOTICE_BACKGROUND);
    expect(normalizeNoticeBackground('#fff')).toBe(DEFAULT_NOTICE_BACKGROUND);
  });

  it('accepts #rrggbb and lowercases', () => {
    expect(normalizeNoticeBackground('#252830')).toBe('#252830');
    expect(normalizeNoticeBackground('#ABCDEF')).toBe('#abcdef');
  });
});
