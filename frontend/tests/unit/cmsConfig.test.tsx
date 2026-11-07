import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Language } from '../../src/shared/context/ConfigContext';
import {
  CmsConfigProvider,
  useCmsConfig,
} from '../../src/shared/context/CmsConfigContext';

const fetchSiteSettings = vi.fn();
const saveSiteSettings = vi.fn();
const updateMyAdminLanguage = vi.fn();
const updateMyDarkMode = vi.fn();
let authState = {
  role: 'site_admin' as const,
  adminLanguage: Language.EN,
  darkMode: null as boolean | null,
  refreshMe: vi.fn(),
};

vi.mock('../../src/shared/api/cmsApi', () => ({
  fetchSiteSettings: (...args: unknown[]) => fetchSiteSettings(...args),
  saveSiteSettings: (...args: unknown[]) => saveSiteSettings(...args),
}));

vi.mock('../../src/shared/api/authApi', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/shared/api/authApi')
  >('../../src/shared/api/authApi');
  return {
    ...actual,
    updateMyAdminLanguage: (...args: unknown[]) =>
      updateMyAdminLanguage(...args),
    updateMyDarkMode: (...args: unknown[]) => updateMyDarkMode(...args),
  };
});

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('CmsConfigProvider', () => {
  beforeEach(() => {
    localStorage.removeItem('language');
    fetchSiteSettings.mockReset();
    saveSiteSettings.mockReset();
    updateMyAdminLanguage.mockReset();
    updateMyDarkMode.mockReset();
    authState = {
      role: 'site_admin',
      adminLanguage: Language.EN,
      darkMode: null,
      refreshMe: vi.fn(),
    };
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    updateMyAdminLanguage.mockResolvedValue({});
  });

  it('stores CMS language via API without touching public site language', async () => {
    localStorage.setItem('language', Language.KO);

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    expect(result.current.language).toBe(Language.EN);

    await act(async () => {
      result.current.setLanguage(Language.DE);
    });

    expect(result.current.language).toBe(Language.DE);
    expect(updateMyAdminLanguage).toHaveBeenCalledWith(Language.DE);
    expect(saveSiteSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem('language')).toBe(Language.KO);
    expect(localStorage.getItem('cmsLanguage')).toBeNull();
  });

  it('restores CMS language from the authenticated user', async () => {
    authState.adminLanguage = Language.KO;

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.language).toBe(Language.KO);
    });
  });

  it('prefers the saved dark mode value over the OS preference', async () => {
    authState.darkMode = true;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.darkMode).toBe(true);
    });
    expect(window.matchMedia).not.toHaveBeenCalled();
  });

  it('uses the OS dark mode preference when no value is saved', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.darkMode).toBe(true);
    });
    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-color-scheme: dark)',
    );
  });

  it('updates dark mode optimistically and sends the user preference', async () => {
    updateMyDarkMode.mockResolvedValue({ darkMode: true });

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await act(async () => {
      result.current.setDarkMode(true);
    });

    expect(result.current.darkMode).toBe(true);
    expect(updateMyDarkMode).toHaveBeenCalledWith(true);
  });

  it('applies the CMS theme data attribute to the document when dark mode changes', async () => {
    updateMyDarkMode.mockResolvedValue({ darkMode: true });

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await act(async () => {
      result.current.setDarkMode(true);
    });

    await waitFor(() => {
      expect(document.body.dataset.cmsTheme).toBe('dark');
    });
    expect(result.current.darkMode).toBe(true);
  });

  it('restores the document theme when the CMS provider unmounts', async () => {
    updateMyDarkMode.mockResolvedValue({ darkMode: true });
    document.body.dataset.cmsTheme = 'public';
    document.body.style.colorScheme = 'normal';

    const { result, unmount } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await act(async () => {
      result.current.setDarkMode(true);
    });

    expect(document.body.dataset.cmsTheme).toBe('dark');
    expect(document.body.style.colorScheme).toBe('dark');

    unmount();

    expect(document.body.dataset.cmsTheme).toBe('public');
    expect(document.body.style.colorScheme).toBe('normal');
  });

  it('restores the previous dark mode value when saving fails', async () => {
    updateMyDarkMode.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useCmsConfig(), {
      wrapper: ({ children }) => (
        <CmsConfigProvider>{children}</CmsConfigProvider>
      ),
    });

    await act(async () => {
      result.current.setDarkMode(true);
    });

    await waitFor(() => {
      expect(result.current.darkMode).toBe(false);
    });
  });
});
