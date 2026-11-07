import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCookieConsent } from '../../src/shared/components/CookieConsent/useCookieConsent';

const CONSENT_KEY = 'cookie_consent';

describe('useCookieConsent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows banner when consent is missing', () => {
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.isVisible).toBe(true);
  });

  it('hides banner when current consent version exists', () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        necessary: true,
        functional: true,
        version: '1.0',
        timestamp: '2026-01-01T00:00:00.000Z',
      })
    );

    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.isVisible).toBe(false);
  });

  it('acceptAll stores full consent and hides banner', () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.acceptAll();
    });

    expect(result.current.isVisible).toBe(false);

    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}');
    expect(stored.necessary).toBe(true);
    expect(stored.functional).toBe(true);
    expect(stored.version).toBe('1.0');
  });

  it('acceptNecessary keeps auth token and clears other keys', () => {
    localStorage.setItem('auth_token', 'keep-me');
    localStorage.setItem('analytics_id', 'drop-me');

    const { result } = renderHook(() => useCookieConsent());

    act(() => {
      result.current.acceptNecessary();
    });

    expect(localStorage.getItem('auth_token')).toBe('keep-me');
    expect(localStorage.getItem('analytics_id')).toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeTruthy();
  });
});
