import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeDays } from '../../src/pages/Admin/Pages/Trash/utils/formatRelativeDays';

describe('formatRelativeDays', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the remaining days using the requested locale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const formatted = formatRelativeDays(
      '2026-01-03T00:00:00Z',
      'en',
    );

    expect(`${formatted.prefix}${formatted.value}`).toBe('in 2 days');
  });

  it('clamps expired dates to today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));

    const formatted = formatRelativeDays(
      '2026-01-01T00:00:00Z',
      'en',
    );

    expect(`${formatted.prefix}${formatted.value}`).toBe('today');
  });

  it('returns an invalid date string unchanged', () => {
    expect(formatRelativeDays('not-a-date', 'en')).toEqual({
      prefix: '',
      value: 'not-a-date',
    });
  });
});
