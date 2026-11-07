import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigProvider,
  useConfig,
} from '../../src/shared/context/ConfigContext';
import { Language } from '../../src/shared/types/Language';

const fetchSiteSettings = vi.fn();
const saveSiteSettings = vi.fn();

vi.mock('../../src/shared/api/cmsApi', () => ({
  fetchSiteSettings: (...args: unknown[]) => fetchSiteSettings(...args),
  saveSiteSettings: (...args: unknown[]) => saveSiteSettings(...args),
}));

describe('ConfigProvider available languages', () => {
  beforeEach(() => {
    localStorage.removeItem('language');
    fetchSiteSettings.mockReset();
    saveSiteSettings.mockReset();
    fetchSiteSettings.mockResolvedValue({
      availableLanguages: [Language.EN, Language.KO, Language.DE],
      adminLanguage: Language.EN,
      pageAdminEnabled: false,
    });
    saveSiteSettings.mockImplementation(async (update: {
      availableLanguages?: string[];
      adminLanguage?: string;
    }) => ({
      availableLanguages:
        update.availableLanguages ?? [Language.EN, Language.KO, Language.DE],
      adminLanguage: update.adminLanguage ?? Language.EN,
      pageAdminEnabled: false,
    }));
  });

  it('defaults to en, ko, de', async () => {
    const { result } = renderHook(() => useConfig(), {
      wrapper: ({ children }) => <ConfigProvider>{children}</ConfigProvider>,
    });

    await waitFor(() => {
      expect(result.current.availableLanguages).toEqual([
        Language.EN,
        Language.KO,
        Language.DE,
      ]);
    });
  });

  it('adds a world language and falls back current language on remove', async () => {
    const { result } = renderHook(() => useConfig(), {
      wrapper: ({ children }) => <ConfigProvider>{children}</ConfigProvider>,
    });

    await waitFor(() => {
      expect(fetchSiteSettings).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.addAvailableLanguage('ja');
    });
    expect(result.current.availableLanguages).toContain('ja');

    act(() => {
      result.current.setLanguage('ja');
    });
    expect(result.current.language).toBe('ja');

    await act(async () => {
      await result.current.removeAvailableLanguage('ja');
    });

    expect(result.current.availableLanguages).not.toContain('ja');
    expect(result.current.language).toBe(Language.EN);
  });

  it('keeps at least one available language', async () => {
    const { result } = renderHook(() => useConfig(), {
      wrapper: ({ children }) => <ConfigProvider>{children}</ConfigProvider>,
    });

    await waitFor(() => {
      expect(fetchSiteSettings).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.removeAvailableLanguage(Language.KO);
      await result.current.removeAvailableLanguage(Language.DE);
    });

    await act(async () => {
      await result.current.removeAvailableLanguage(Language.EN);
    });

    expect(result.current.availableLanguages).toEqual([Language.EN]);
  });

  it('rethrows when persisting available languages fails', async () => {
    saveSiteSettings.mockReset();
    saveSiteSettings.mockImplementation(() =>
      Promise.reject(new Error('network'))
    );
    fetchSiteSettings.mockResolvedValue({
      availableLanguages: [Language.EN, Language.KO, Language.DE],
      adminLanguage: Language.EN,
      pageAdminEnabled: false,
    });

    const { result } = renderHook(() => useConfig(), {
      wrapper: ({ children }) => <ConfigProvider>{children}</ConfigProvider>,
    });

    await waitFor(() => {
      expect(result.current.availableLanguages).toEqual([
        Language.EN,
        Language.KO,
        Language.DE,
      ]);
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.removeAvailableLanguage(Language.KO);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toEqual(new Error('network'));
    expect(saveSiteSettings).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.availableLanguages).toEqual([
        Language.EN,
        Language.KO,
        Language.DE,
      ]);
    });
  });

  it('rolls back optimistic languages when save and refetch both fail', async () => {
    saveSiteSettings.mockReset();
    saveSiteSettings.mockImplementation(() =>
      Promise.reject(new Error('network'))
    );

    const { result } = renderHook(() => useConfig(), {
      wrapper: ({ children }) => <ConfigProvider>{children}</ConfigProvider>,
    });

    await waitFor(() => {
      expect(result.current.availableLanguages).toEqual([
        Language.EN,
        Language.KO,
        Language.DE,
      ]);
    });

    fetchSiteSettings.mockRejectedValue(new Error('offline'));

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.addAvailableLanguage('ja');
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toEqual(new Error('network'));
    expect(result.current.availableLanguages).toEqual([
      Language.EN,
      Language.KO,
      Language.DE,
    ]);
    expect(result.current.availableLanguages).not.toContain('ja');
  });
});
