import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/shared/components/ui/Toast/ToastProvider';
import { ConfigProvider } from '../../src/shared/context/ConfigContext';
import { CmsConfigProvider } from '../../src/shared/context/CmsConfigContext';
import { Language } from '../../src/shared/types/Language';
import { useHomePageEditor } from '../../src/pages/Admin/Pages/Home/useHomePageEditor';
import { adminTranslations } from '../../src/pages/Admin/translations';

const fetchPageDocument = vi.fn();
const savePageDocument = vi.fn();
const fetchSiteSettings = vi.fn();
const saveSiteSettings = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();

vi.mock('../../src/shared/api/cmsApi', () => ({
  fetchPageDocument: (...args: unknown[]) => fetchPageDocument(...args),
  savePageDocument: (...args: unknown[]) => savePageDocument(...args),
  fetchSiteSettings: (...args: unknown[]) => fetchSiteSettings(...args),
  saveSiteSettings: (...args: unknown[]) => saveSiteSettings(...args),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/shared/components/ui/Toast/ToastProvider')
  >('../../src/shared/components/ui/Toast/ToastProvider');
  return {
    ...actual,
    useToast: () => ({
      info: toastInfo,
      warning: vi.fn(),
      error: toastError,
      dismiss: vi.fn(),
    }),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider>
      <CmsConfigProvider>
        <ToastProvider>{children}</ToastProvider>
      </CmsConfigProvider>
    </ConfigProvider>
  );
}

function conflictError(data: unknown) {
  return Object.assign(new Error('Request failed with status code 409'), {
    isAxiosError: true,
    response: { status: 409, data },
  });
}

describe('useHomePageEditor', () => {
  beforeEach(() => {
    fetchPageDocument.mockReset();
    savePageDocument.mockReset();
    fetchSiteSettings.mockReset();
    saveSiteSettings.mockReset();
    toastInfo.mockReset();
    toastError.mockReset();

    fetchPageDocument.mockResolvedValue({ contentRevision: 0, content: {} });
    savePageDocument.mockImplementation(
      async (_slug: string, document: { contentRevision: number; content: object }) => ({
        contentRevision: document.contentRevision + 1,
        content: document.content,
      })
    );
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

  it('updates draft fields for the selected edit language', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateField('title', 'Edited EN title');
    });

    expect(result.current.current.title).toBe('Edited EN title');
  });

  it('switches edit language and saves all languages with the loaded revision', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateField('title', 'English title');
    });
    act(() => {
      result.current.setEditLanguage(Language.KO);
    });

    expect(result.current.editLanguage).toBe(Language.KO);

    act(() => {
      result.current.updateField('title', 'Korean title');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(toastInfo).toHaveBeenCalledWith(adminTranslations[Language.EN].homeSaved);
    expect(savePageDocument).toHaveBeenCalledTimes(1);
    const [slug, document] = savePageDocument.mock.calls[0];
    expect(slug).toBe('home');
    expect(document.contentRevision).toBe(0);
    expect(document.content[Language.EN].title).toBe('English title');
    expect(document.content[Language.KO].title).toBe('Korean title');
  });

  it('sends the revision returned by the previous save on the next save', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.save();
    });
    await act(async () => {
      await result.current.save();
    });

    expect(savePageDocument.mock.calls[0][1].contentRevision).toBe(0);
    expect(savePageDocument.mock.calls[1][1].contentRevision).toBe(1);
  });

  it('shows an error toast when save fails', async () => {
    savePageDocument.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.save();
    });

    expect(toastError).toHaveBeenCalledWith(
      adminTranslations[Language.EN].homeSaveFailed
    );
    expect(toastInfo).not.toHaveBeenCalled();
    expect(result.current.conflict).toBeNull();
  });

  it('opens a conflict with the latest content instead of overwriting it', async () => {
    const latest = {
      [Language.EN]: { title: 'Latest', subtitle: '', description: '' },
    };
    savePageDocument.mockRejectedValue(
      conflictError({ slug: 'home', contentRevision: 3, content: latest })
    );
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.updateField('title', 'My edit');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.conflict).toEqual({ contentRevision: 3, content: latest });
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.current.title).toBe('My edit');

    act(() => {
      result.current.reloadLatest();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.current.title).toBe('Latest');

    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument.mock.calls.at(-1)?.[1].contentRevision).toBe(3);
  });

  it('keeps local edits when the conflict is dismissed', async () => {
    savePageDocument.mockRejectedValue(
      conflictError({ slug: 'home', contentRevision: 3, content: {} })
    );
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.updateField('title', 'Keep me');
    });
    await act(async () => {
      await result.current.save();
    });

    act(() => {
      result.current.dismissConflict();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.current.title).toBe('Keep me');
  });

  it('ignores invalid edit language values', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.setEditLanguage('xx');
    });

    expect(result.current.editLanguage).toBe(Language.EN);
  });

  it('does not save until initial page content has loaded', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    fetchPageDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    expect(result.current.isReady).toBe(false);

    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch?.({
        contentRevision: 2,
        content: {
          [Language.EN]: {
            title: 'Loaded',
            subtitle: '',
            description: '',
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).toHaveBeenCalledTimes(1);
    expect(savePageDocument.mock.calls[0][1].contentRevision).toBe(2);
    expect(savePageDocument.mock.calls[0][1].content[Language.EN].title).toBe('Loaded');
  });

  it('limits edit language options to available site languages', async () => {
    fetchSiteSettings.mockResolvedValue({
      availableLanguages: [Language.EN, 'fr'],
      adminLanguage: Language.EN,
      pageAdminEnabled: false,
    });

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.editLanguageOptions.map((o) => o.value)).toEqual([
        Language.EN,
        'fr',
      ]);
    });

    act(() => {
      result.current.setEditLanguage(Language.KO);
    });

    expect(result.current.editLanguage).toBe(Language.EN);
  });
});
