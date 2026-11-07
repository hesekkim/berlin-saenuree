import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../src/shared/api/authApi';
import { AuthProvider, useAuth } from '../../src/shared/context/AuthContext';

vi.mock('../../src/shared/api/authApi', () => ({
  fetchMe: vi.fn(),
  sendVerificationCode: vi.fn(),
  verifyCode: vi.fn(),
}));

const authenticatedUser: authApi.CmsMeResponse = {
  email: 'admin@example.com',
  is_authenticated: true,
  name: null,
  role: 'site_admin',
  pages: [],
  effectivePages: [],
  adminLanguage: 'en',
  darkMode: null,
};

describe('AuthProvider session refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('auth_token', 'valid-token');
    vi.mocked(authApi.fetchMe).mockResolvedValue(authenticatedUser);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('refreshes the session while the page is visible and recently active', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(authApi.fetchMe).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(authApi.fetchMe).toHaveBeenCalledTimes(2);
  });

  it('does not refresh the session after the user becomes inactive', async () => {
    renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(authApi.fetchMe).toHaveBeenCalledOnce();
  });

  it('does not restore authentication when a session check finishes after logout', async () => {
    let resolveFetchMe: (user: authApi.CmsMeResponse) => void = () => {};
    vi.mocked(authApi.fetchMe).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetchMe = resolve;
      }),
    );
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    act(() => {
      result.current.logout();
    });

    await act(async () => {
      resolveFetchMe(authenticatedUser);
      await Promise.resolve();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});

describe('AuthProvider login code errors', () => {
  beforeEach(() => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(authenticatedUser);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the throttle message returned for a rate-limited send', async () => {
    vi.mocked(authApi.sendVerificationCode).mockRejectedValue({
      response: {
        status: 429,
        data: { detail: 'Too many login attempts. Try again in 1 minute.' },
      },
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    let outcome: Awaited<ReturnType<typeof result.current.sendVerificationCode>>;
    await act(async () => {
      outcome = await result.current.sendVerificationCode('admin@example.com');
    });

    expect(outcome!).toEqual({
      success: false,
      error: 'Too many login attempts. Try again in 1 minute.',
    });
  });

  it('falls back to a plain message when detail is a validation error list', async () => {
    vi.mocked(authApi.verifyCode).mockRejectedValue({
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'code'], msg: 'bad format' }] },
      },
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    let outcome: Awaited<ReturnType<typeof result.current.verifyCode>>;
    await act(async () => {
      outcome = await result.current.verifyCode('admin@example.com', '12345');
    });

    expect(outcome!).toEqual({
      success: false,
      error: 'Invalid verification code',
    });
  });
});

describe('AuthProvider session failure handling', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'valid-token');
    vi.mocked(authApi.fetchMe).mockResolvedValue(authenticatedUser);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps the session and token when a session check fails with a server error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(authApi.fetchMe).mockRejectedValueOnce({
      response: { status: 503 },
    });

    await act(async () => {
      await result.current.refreshMe();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe('valid-token');
  });

  it('keeps the token when the initial check fails on the network', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBe('valid-token');
  });

  it.each([401, 403])('clears the session and token when the server rejects it with %i', async (status) => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    vi.mocked(authApi.fetchMe).mockRejectedValueOnce({ response: { status } });

    await act(async () => {
      await result.current.refreshMe();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});