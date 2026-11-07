import { describe, expect, it } from 'vitest';
import { resolvePopupCopy } from '../../src/shared/popups/resolvePopupCopy';

describe('resolvePopupCopy', () => {
  it('falls back to en then other languages', () => {
    expect(
      resolvePopupCopy(
        {
          ko: { body: '' },
          en: { body: '<p>Hi</p><p>There</p>' },
        },
        'ko'
      )
    ).toEqual({ body: '<p>Hi</p><p>There</p>' });

    expect(
      resolvePopupCopy(
        {
          de: { body: '<p>Hallo</p>' },
        },
        'ko'
      )
    ).toEqual({ body: '<p>Hallo</p>' });
  });

  it('treats empty rich paragraphs as blank', () => {
    expect(
      resolvePopupCopy(
        {
          ko: { body: '<p></p>' },
          en: { body: '<p>Fallback</p>' },
        },
        'ko'
      )
    ).toEqual({ body: '<p>Fallback</p>' });
  });
});
