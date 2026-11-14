import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/shared/components/ui/Toast/ToastProvider';
import { ConfigProvider } from '../../src/shared/context/ConfigContext';
import { CmsConfigProvider } from '../../src/shared/context/CmsConfigContext';
import { Language } from '../../src/shared/types/Language';
import { createEmptyHomeCopy } from '../../src/shared/content/homeContent';
import { useHomePageEditor } from '../../src/pages/Admin/Pages/Home/useHomePageEditor';
import { adminTranslations } from '../../src/pages/Admin/translations';

const fetchPageDocument = vi.fn();
const savePageDocument = vi.fn();
const fetchSiteSettings = vi.fn();
const saveSiteSettings = vi.fn();
const deleteMediaFile = vi.fn();
const deleteOptimizedImage = vi.fn();
const optimizeMediaImage = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();

function validHomeCopy(
  overrides: Partial<ReturnType<typeof createEmptyHomeCopy>> = {},
) {
  return {
    ...createEmptyHomeCopy(),
    pastoralMissionItems: ['Mission'],
    ...overrides,
  };
}

function validHomeContent(
  overrides: Partial<Record<Language, ReturnType<typeof validHomeCopy>>> = {},
) {
  return {
    [Language.EN]: validHomeCopy(overrides[Language.EN]),
    [Language.KO]: validHomeCopy(overrides[Language.KO]),
    [Language.DE]: validHomeCopy(overrides[Language.DE]),
  };
}

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

vi.mock('../../src/shared/api/cmsApi', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/shared/api/cmsApi')
  >('../../src/shared/api/cmsApi');
  return {
    ...actual,
    fetchPageDocument: (...args: unknown[]) => fetchPageDocument(...args),
    savePageDocument: (...args: unknown[]) => savePageDocument(...args),
    fetchSiteSettings: (...args: unknown[]) => fetchSiteSettings(...args),
    saveSiteSettings: (...args: unknown[]) => saveSiteSettings(...args),
  };
});

vi.mock('../../src/shared/api/mediaApi', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/shared/api/mediaApi')
  >('../../src/shared/api/mediaApi');
  return {
    ...actual,
    deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
    deleteOptimizedImage: (...args: unknown[]) =>
      deleteOptimizedImage(...args),
    optimizeMediaImage: (...args: unknown[]) => optimizeMediaImage(...args),
  };
});

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorage());
    window.sessionStorage.clear();
    fetchPageDocument.mockReset();
    savePageDocument.mockReset();
    fetchSiteSettings.mockReset();
    saveSiteSettings.mockReset();
    deleteMediaFile.mockReset();
    deleteOptimizedImage.mockReset();
    optimizeMediaImage.mockReset();
    toastInfo.mockReset();
    toastError.mockReset();

    fetchPageDocument.mockResolvedValue({
      contentRevision: 0,
      content: validHomeContent({
        [Language.EN]: validHomeCopy({
          youtubeVideoUrls: ['dQw4w9WgXcQ'],
        }),
      }),
    });
    savePageDocument.mockImplementation(
      async (_slug: string, document: { contentRevision: number; content: object }) => ({
        contentRevision: document.contentRevision + 1,
        content: document.content,
      })
    );
    optimizeMediaImage.mockResolvedValue({
      imageId: 'new-image',
      sourceFileId: 'new-source',
    });
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
      result.current.updateField('yearMotto', 'Edited EN motto');
      result.current.updateField('yearMotto', 'Hope');
    });

    expect(result.current.current.yearMotto).toBe('Hope');
    expect(result.current.isDirty).toBe(true);
  });

  it('only saves changed content and resets the dirty state after saving', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.isDirty).toBe(false);
    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).not.toHaveBeenCalled();

    act(() => {
      result.current.updateField('yearMotto', 'Changed motto');
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(false);
  });

  it('adds multiple hero images and cleans up removed unsaved images', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    optimizeMediaImage.mockImplementation(async (sourceFileId: string) => ({
      imageId: `${sourceFileId}-image`,
      sourceFileId,
    }));

    await act(async () => {
      await result.current.handleImageUploaded('hero', [
        {
          id: 'first-upload',
          url: '/media/first-upload',
          originalName: 'first-image.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 100,
        },
        {
          id: 'second-upload',
          url: '/media/second-upload',
          originalName: 'second-image.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 100,
        },
      ]);
    });

    expect(result.current.current.heroImages).toEqual([
      { imageId: 'first-upload-image', sourceFileId: 'first-upload' },
      { imageId: 'second-upload-image', sourceFileId: 'second-upload' },
    ]);

    act(() => {
      result.current.handleImageItemsChange('hero', []);
    });

    await waitFor(() => {
      expect(deleteOptimizedImage).toHaveBeenCalledWith('first-upload-image');
      expect(deleteOptimizedImage).toHaveBeenCalledWith('second-upload-image');
      expect(deleteMediaFile).toHaveBeenCalledWith('first-upload');
      expect(deleteMediaFile).toHaveBeenCalledWith('second-upload');
    });
    expect(result.current.current.heroImages).toEqual([]);
  });

  it('keeps hero images shared when editing another language', async () => {
    const sharedImage = {
      imageId: 'shared-image',
      sourceFileId: 'shared-source',
    };
    fetchPageDocument.mockResolvedValue({
      contentRevision: 0,
      content: validHomeContent({
        [Language.EN]: validHomeCopy({ heroImages: [sharedImage] }),
        [Language.KO]: validHomeCopy({ yearMotto: '한국어 표어' }),
      }),
    });

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.current.heroImages).toEqual([sharedImage]);

    act(() => {
      result.current.setEditLanguage(Language.KO);
    });
    await act(async () => {
      await result.current.handleImageUploaded('hero', [
        {
          id: 'korean-upload',
          url: '/media/korean-upload',
          originalName: 'korean-image.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 100,
        },
      ]);
    });

    expect(result.current.current.heroImages).toEqual([
      sharedImage,
      { imageId: 'new-image', sourceFileId: 'new-source' },
    ]);

    await act(async () => {
      await result.current.save();
    });

    const [, savedDocument] = savePageDocument.mock.calls[0];
    expect(savedDocument.content[Language.EN].heroImages).toEqual(
      savedDocument.content[Language.KO].heroImages
    );
  });

  it('keeps the panorama shared when editing another language', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.setEditLanguage(Language.KO);
    });
    await act(async () => {
      await result.current.handleImageUploaded('panorama', [
        {
          id: 'panorama-upload',
          url: '/media/panorama-upload',
          originalName: 'panorama.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 100,
        },
      ]);
    });
    await act(async () => {
      await result.current.save();
    });

    const [, savedDocument] = savePageDocument.mock.calls[0];
    expect(savedDocument.content[Language.EN].panoramaImageId).toBe('new-image');
    expect(savedDocument.content[Language.KO].panoramaImageId).toBe('new-image');
    expect(savedDocument.content[Language.EN].panoramaSourceFileId).toBe(
      'new-source'
    );
    expect(savedDocument.content[Language.KO].panoramaSourceFileId).toBe(
      'new-source'
    );
  });

  it('shows the shared hero images when the German copy is not saved yet', async () => {
    const sharedImage = {
      imageId: 'shared-image',
      sourceFileId: 'shared-source',
    };
    fetchPageDocument.mockResolvedValue({
      contentRevision: 0,
      content: {
        [Language.EN]: {
          ...createEmptyHomeCopy(),
          heroImages: [sharedImage],
        },
      },
    });

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.setEditLanguage(Language.DE);
    });

    expect(result.current.current.heroImages).toEqual([sharedImage]);
  });

  it('shows and updates shared worship video URLs in German', async () => {
    const videoUrls = ['https://youtu.be/dQw4w9WgXcQ'];
    fetchPageDocument.mockResolvedValue({
      contentRevision: 0,
      content: validHomeContent({
        [Language.EN]: validHomeCopy({ youtubeVideoUrls: videoUrls }),
        [Language.KO]: validHomeCopy({ youtubeVideoUrls: videoUrls }),
      }),
    });

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.setEditLanguage(Language.DE);
    });
    expect(result.current.current.youtubeVideoUrls).toEqual(videoUrls);

    act(() => {
      result.current.updateVideoUrls(['M7lc1UVf-VE', '', '']);
    });
    expect(result.current.current.youtubeVideoUrls).toEqual([
      'M7lc1UVf-VE',
      '',
      '',
    ]);

    await act(async () => {
      await result.current.save();
    });
    const [, savedDocument] = savePageDocument.mock.calls[0];
    expect(savedDocument.content[Language.EN].youtubeVideoUrls).toEqual([
      'M7lc1UVf-VE',
    ]);
    expect(savedDocument.content[Language.KO].youtubeVideoUrls).toEqual([
      'M7lc1UVf-VE',
    ]);
    expect(savedDocument.content[Language.DE].youtubeVideoUrls).toEqual([
      'M7lc1UVf-VE',
    ]);
  });

  it('cleans up media left by an interrupted edit after the page reloads', async () => {
    window.sessionStorage.setItem(
      'cms.home.pending-media.v1',
      JSON.stringify(['orphan-source'])
    );

    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(deleteMediaFile).toHaveBeenCalledWith('orphan-source');
    expect(
      window.sessionStorage.getItem('cms.home.pending-media.v1')
    ).toBeNull();
  });

  it('switches edit language and saves all languages with the loaded revision', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateField('yearMotto', 'English motto');
    });
    act(() => {
      result.current.setEditLanguage(Language.KO);
    });

    expect(result.current.editLanguage).toBe(Language.KO);

    act(() => {
      result.current.updateField('yearMotto', 'Korean motto');
      result.current.updateVideoUrls(['dQw4w9WgXcQ', '', '']);
    });
    await act(async () => {
      await result.current.save();
    });

    expect(toastInfo).toHaveBeenCalledWith(adminTranslations[Language.EN].homeSaved);
    expect(savePageDocument).toHaveBeenCalledTimes(1);
    const [slug, document] = savePageDocument.mock.calls[0];
    expect(slug).toBe('home');
    expect(document.contentRevision).toBe(0);
    expect(document.content[Language.EN].yearMotto).toBe('English motto');
    expect(document.content[Language.KO].yearMotto).toBe('Korean motto');
    expect(document.content[Language.KO].youtubeVideoUrls).toEqual([
      'dQw4w9WgXcQ',
    ]);
  });

  it('sends the revision returned by the previous save on the next edit', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateField('yearMotto', 'First change');
    });
    await act(async () => {
      await result.current.save();
    });

    act(() => {
      result.current.updateField('yearMotto', 'Second change');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(savePageDocument.mock.calls[0][1].contentRevision).toBe(0);
    expect(savePageDocument.mock.calls[1][1].contentRevision).toBe(1);
  });

  it('accepts three fixed slots, treats blank URLs as absent, and rejects invalid URLs', async () => {
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateVideoUrls(['invalid', '', '']);
    });
    expect(result.current.isVideoSelectionValid).toBe(false);
    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).not.toHaveBeenCalled();

    act(() => {
      result.current.updateVideoUrls([
        'dQw4w9WgXcQ',
        'M7lc1UVf-VE',
        'aqz-KE-bpKQ',
        'invalid',
      ]);
    });
    expect(result.current.isVideoSelectionValid).toBe(false);

    act(() => {
      result.current.updateVideoUrls([
        'dQw4w9WgXcQ',
        '',
        'M7lc1UVf-VE',
      ]);
    });
    expect(result.current.isVideoSelectionValid).toBe(true);

    act(() => {
      result.current.updateVideoUrls(['', '', '']);
    });
    expect(result.current.isVideoSelectionValid).toBe(true);
  });

  it('shows an error toast when save fails', async () => {
    savePageDocument.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.updateField('yearMotto', 'Save attempt');
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
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        yearMotto: 'Latest',
        pastoralMissionItems: ['Mission'],
        youtubeVideoUrls: ['dQw4w9WgXcQ'],
      },
      [Language.KO]: validHomeCopy(),
      [Language.DE]: validHomeCopy(),
    };
    savePageDocument.mockRejectedValue(
      conflictError({ slug: 'home', contentRevision: 3, content: latest })
    );
    const { result } = renderHook(() => useHomePageEditor(), { wrapper });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    act(() => {
      result.current.updateField('yearMotto', 'My edit');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.conflict?.contentRevision).toBe(3);
    expect(result.current.conflict?.content[Language.EN].yearMotto).toBe('Latest');
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(result.current.current.yearMotto).toBe('My edit');

    act(() => {
      result.current.reloadLatest();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.current.yearMotto).toBe('Latest');

    act(() => {
      result.current.updateField('yearMotto', 'Latest plus edit');
    });
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
      result.current.updateField('yearMotto', 'Keep me');
    });
    await act(async () => {
      await result.current.save();
    });

    act(() => {
      result.current.dismissConflict();
    });

    expect(result.current.conflict).toBeNull();
    expect(result.current.current.yearMotto).toBe('Keep me');
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
        content: validHomeContent({
          [Language.EN]: validHomeCopy({
            yearMotto: 'Loaded',
            youtubeVideoUrls: ['dQw4w9WgXcQ'],
          }),
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.updateField('yearMotto', 'Edited after load');
    });
    await act(async () => {
      await result.current.save();
    });
    expect(savePageDocument).toHaveBeenCalledTimes(1);
    expect(savePageDocument.mock.calls[0][1].contentRevision).toBe(2);
    expect(savePageDocument.mock.calls[0][1].content[Language.EN].yearMotto).toBe(
      'Edited after load'
    );
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
