import { describe, expect, it } from 'vitest';
import { getPopupVisibilityStatus } from '../../src/shared/popups/popupVisibility';

const now = new Date('2026-09-09T12:00:00.000Z');

describe('getPopupVisibilityStatus', () => {
  it('returns disabled when not enabled', () => {
    expect(
      getPopupVisibilityStatus(
        { enabled: false, startsAt: null, endsAt: null },
        now
      )
    ).toBe('disabled');
  });

  it('returns live when enabled with no schedule', () => {
    expect(
      getPopupVisibilityStatus(
        { enabled: true, startsAt: null, endsAt: null },
        now
      )
    ).toBe('live');
  });

  it('returns scheduled before startsAt', () => {
    expect(
      getPopupVisibilityStatus(
        {
          enabled: true,
          startsAt: '2026-09-10T00:00:00.000Z',
          endsAt: null,
        },
        now
      )
    ).toBe('scheduled');
  });

  it('returns ended after endsAt', () => {
    expect(
      getPopupVisibilityStatus(
        {
          enabled: true,
          startsAt: null,
          endsAt: '2026-09-08T09:55:00.000Z',
        },
        now
      )
    ).toBe('ended');
  });

  it('returns live inside the schedule window', () => {
    expect(
      getPopupVisibilityStatus(
        {
          enabled: true,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-09-30T00:00:00.000Z',
        },
        now
      )
    ).toBe('live');
  });
});
