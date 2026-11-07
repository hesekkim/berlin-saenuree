import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../src/shared/components/ui/Toast/ToastProvider';
import { useBloggerAdmin } from '../../src/pages/Admin/Pages/Blogger/hooks/useBloggerAdmin';
import { useBloggerDocumentEditor } from '../../src/pages/Admin/Pages/Blogger/hooks/useBloggerDocumentEditor';
import { resolveBloggerCopy } from '../../src/pages/Admin/Pages/Blogger/utils/resolveBloggerCopy';
import {
  hasPublishableDefaultCopy,
  sanitizeCopiesForSave,
  upsertCopyField,
} from '../../src/pages/Admin/Pages/Blogger/utils/bloggerCopies';
import { adminTranslations } from '../../src/pages/Admin/translations';
import type { BloggerResponse } from '../../src/shared/api/bloggerApi';

const fetchAdminBlogger = vi.fn();
const fetchMyBloggerDraft = vi.fn();
const fetchMyBloggerDrafts = vi.fn();
const fetchMyBloggerEditDraft = vi.fn();
const upsertMyBloggerDraft = vi.fn();
const upsertMyBloggerEditDraft = vi.fn();
const deleteMyBloggerDraft = vi.fn();
const deleteMyBloggerEditDraft = vi.fn();
const createAdminBlogger = vi.fn();
const fetchAdminBloggerItem = vi.fn();
const updateAdminBlogger = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();

vi.mock('../../src/shared/api/bloggerApi', () => ({
  fetchAdminBlogger: (...args: unknown[]) => fetchAdminBlogger(...args),
  fetchAdminBloggerItem: (...args: unknown[]) => fetchAdminBloggerItem(...args),
  fetchMyBloggerDraft: (...args: unknown[]) => fetchMyBloggerDraft(...args),
  fetchMyBloggerDrafts: (...args: unknown[]) => fetchMyBloggerDrafts(...args),
  fetchMyBloggerEditDraft: (...args: unknown[]) =>
    fetchMyBloggerEditDraft(...args),
  upsertMyBloggerDraft: (...args: unknown[]) => upsertMyBloggerDraft(...args),
  upsertMyBloggerEditDraft: (...args: unknown[]) =>
    upsertMyBloggerEditDraft(...args),
  deleteMyBloggerDraft: (...args: unknown[]) => deleteMyBloggerDraft(...args),
  deleteMyBloggerEditDraft: (...args: unknown[]) =>
    deleteMyBloggerEditDraft(...args),
  createAdminBlogger: (...args: unknown[]) => createAdminBlogger(...args),
  updateAdminBlogger: (...args: unknown[]) => updateAdminBlogger(...args),
  deleteAdminBlogger: vi.fn(),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'ko' }),
  CmsConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/shared/context/ConfigContext', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/shared/context/ConfigContext')
    >();
  return {
    ...actual,
    useConfig: () => ({
      language: 'en',
      availableLanguages: ['ko', 'en'],
      defaultLanguage: 'ko',
    }),
  };
});

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({
    email: 'manager@example.com',
    role: 'page_manager',
    isAuthenticated: true,
    isLoading: false,
    pages: ['blogger'],
    effectivePages: ['blogger'],
    adminLanguage: null,
    refreshMe: async () => null,
    sendVerificationCode: async () => ({ success: false }),
    verifyCode: async () => ({ success: false }),
    logout: () => {},
  }),
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
      success: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

function makeItem(id: string, title = 'Title'): BloggerResponse {
  return {
    id,
    published: true,
    createdBy: 'manager@example.com',
    createdAt: '2026-09-11T12:00:00Z',
    updatedAt: '2026-09-11T12:00:00Z',
    contentRevision: 1,
    copies: {
      ko: { title, body: `<p>${title} body</p>` },
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

describe('blogger admin helpers', () => {
  beforeEach(() => {
    fetchAdminBlogger.mockReset();
    fetchMyBloggerDraft.mockReset();
    fetchMyBloggerDrafts.mockReset();
    fetchMyBloggerEditDraft.mockReset();
    upsertMyBloggerDraft.mockReset();
    upsertMyBloggerEditDraft.mockReset();
    deleteMyBloggerDraft.mockReset();
    deleteMyBloggerEditDraft.mockReset();
    createAdminBlogger.mockReset();
    fetchAdminBloggerItem.mockReset();
    updateAdminBlogger.mockReset();
    toastError.mockReset();
    toastInfo.mockReset();
    fetchMyBloggerDraft.mockResolvedValue(null);
    fetchMyBloggerDrafts.mockResolvedValue([]);
    fetchMyBloggerEditDraft.mockResolvedValue(null);
  });

  it('falls back to ko when the site language is missing', () => {
    const copies = {
      ko: { title: '한국어', body: '<p>본문</p>' },
      en: { title: 'English', body: '<p>English body</p>' },
    };

    expect(resolveBloggerCopy(copies, 'de', 'ko')).toEqual(copies.ko);
    expect(resolveBloggerCopy({}, 'de', 'ko')).toEqual({ title: '', body: '' });
  });

  it('resolves list item titles from the admin language copy', async () => {
    fetchAdminBlogger.mockResolvedValue({
      items: [
        {
          ...makeItem('a'),
          copies: {
            ko: { title: '한국어 제목', body: '<p>한국어 본문</p>' },
            en: { title: 'English title', body: '<p>English body</p>' },
          },
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.listItems[0]?.title).toBe('한국어 제목');
  });

  it('resets to page 1 when q and enabled filters change', async () => {
    fetchAdminBlogger.mockResolvedValue({
      items: [makeItem('a')],
      total: 1,
      limit: 10,
      offset: 0,
    });

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.goToPage(2);
      result.current.updateFilters({ q: 'hello' });
    });

    expect(result.current.page).toBe(1);
    expect(fetchAdminBlogger).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: 'hello',
      published: undefined,
    });
  });

  it('exposes create permission for allowed blogger roles', async () => {
    fetchAdminBlogger.mockResolvedValue({
      items: [makeItem('a')],
      total: 1,
      limit: 10,
      offset: 0,
    });

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.canCreate).toBe(true);
  });

  it('exposes the current user draft for the list pin row', async () => {
    fetchAdminBlogger.mockResolvedValue({
      items: [makeItem('a')],
      total: 1,
      limit: 10,
      offset: 0,
    });
    fetchMyBloggerDrafts.mockResolvedValue([
      {
        id: 'draft-1',
        sourceBloggerId: null,
        sourceContentRevision: null,
        published: true,
        createdBy: 'manager@example.com',
        createdAt: '2026-09-11T12:00:00Z',
        updatedAt: '2026-09-11T12:00:00Z',
        contentRevision: 1,
        copies: {
          ko: { title: '내 초안', body: '<p>작성 중</p>' },
        },
      },
    ]);

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.myDraft?.copies.ko?.title).toBe('내 초안');
  });

  it('marks only the list items that have a current user edit draft', async () => {
    fetchAdminBlogger.mockResolvedValue({
      items: [makeItem('edit-1'), makeItem('other')],
      total: 2,
      limit: 10,
      offset: 0,
    });
    fetchMyBloggerDrafts.mockResolvedValue([
      {
        id: 'draft-1',
        sourceBloggerId: 'edit-1',
        sourceContentRevision: 1,
        published: true,
        createdBy: 'manager@example.com',
        createdAt: '2026-09-11T12:00:00Z',
        updatedAt: '2026-09-11T12:00:00Z',
        contentRevision: 1,
        copies: { ko: { title: '수정 중', body: '<p>수정</p>' } },
      },
    ]);

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.listItems[0]?.hasEditDraft).toBe(true);
    });
    expect(result.current.listItems[1]?.hasEditDraft).toBe(false);
  });
});

describe('bloggerCopies', () => {
  it('merges title and body per language', () => {
    const withTitle = upsertCopyField({}, 'en', 'title', 'Hello');
    const withBody = upsertCopyField(withTitle, 'en', 'body', '<p>Hi</p>');
    expect(withBody.en).toEqual({ title: 'Hello', body: '<p>Hi</p>' });
  });

  it('requires title and body in the site default language for publish', () => {
    expect(
      hasPublishableDefaultCopy(
        { ko: { title: '안녕', body: '<p>본문</p>' } },
        'en',
      ),
    ).toBe(false);
    expect(
      hasPublishableDefaultCopy(
        { en: { title: 'Hello', body: '<p>Hi</p>' } },
        'en',
      ),
    ).toBe(true);
  });

  it('checks the default language copy for publish', () => {
    expect(
      hasPublishableDefaultCopy({
        en: { title: 'Hello', body: '<p>Hi</p>' },
      }, 'ko'),
    ).toBe(false);
    expect(
      hasPublishableDefaultCopy({
        ko: { title: '안녕', body: '<p></p>' },
      }, 'ko'),
    ).toBe(false);
    expect(
      hasPublishableDefaultCopy({
        ko: { title: '안녕', body: '<p>본문</p>' },
      }, 'ko'),
    ).toBe(true);
  });

  it('drops empty language copies on save', () => {
    expect(
      sanitizeCopiesForSave({
        ko: { title: '안녕', body: '<p>본문</p>' },
        en: { title: '', body: '<p></p>' },
      }),
    ).toEqual({
      ko: { title: '안녕', body: '<p>본문</p>' },
    });
  });
});

describe('useBloggerDocumentEditor create draft', () => {
  it('restores an existing draft and publishes with language copies', async () => {
    fetchMyBloggerDraft.mockResolvedValue({
      id: 'draft-1',
      published: true,
      createdBy: 'manager@example.com',
      createdAt: '2026-09-11T12:00:00Z',
      updatedAt: '2026-09-11T12:00:00Z',
      contentRevision: 3,
      copies: {
        ko: { title: '초안', body: '<p>본문</p>' },
        en: { title: 'Draft', body: '<p>Body</p>' },
      },
    });
    createAdminBlogger.mockResolvedValue(makeItem('published'));
    deleteMyBloggerDraft.mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useBloggerDocumentEditor({
          mode: 'create',
          labels: adminTranslations.ko,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.hasServerDraft).toBe(true);
    expect(result.current.canPublishOrSave).toBe(true);
    expect(result.current.currentTitle).toBe('초안');

    await act(async () => {
      result.current.setEditLanguage('en');
    });
    expect(result.current.currentTitle).toBe('Draft');

    await act(async () => {
      await result.current.publish();
    });

    expect(createAdminBlogger).toHaveBeenCalledWith({
      published: true,
      copies: {
        ko: { title: '초안', body: '<p>본문</p>' },
        en: { title: 'Draft', body: '<p>Body</p>' },
      },
    });
    expect(deleteMyBloggerDraft).toHaveBeenCalled();

    await act(async () => {
      await result.current.publish();
    });

    expect(createAdminBlogger).toHaveBeenCalledTimes(1);
  });

  it('autosaves an edit draft and removes it after saving the source entry', async () => {
    const item = makeItem('edit-1', '원본');
    fetchAdminBloggerItem.mockResolvedValue(item);
    upsertMyBloggerEditDraft.mockResolvedValue({
      id: 'draft-edit-1',
      sourceBloggerId: item.id,
      sourceContentRevision: item.contentRevision,
      published: item.published,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      contentRevision: 1,
      copies: {
        ko: { title: '수정', body: item.copies.ko.body },
      },
    });
    updateAdminBlogger.mockResolvedValue({
      ...item,
      contentRevision: 2,
      copies: {
        ko: { title: '수정', body: item.copies.ko.body },
      },
    });
    deleteMyBloggerEditDraft.mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useBloggerDocumentEditor({
          mode: 'edit',
          bloggerId: item.id,
          labels: adminTranslations.ko,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.isEditing).toBe(false);
    expect(result.current.currentTitle).toBe('원본');
    expect(fetchMyBloggerEditDraft).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.beginEdit();
    });
    expect(result.current.isEditing).toBe(true);
    expect(fetchMyBloggerEditDraft).toHaveBeenCalledWith(item.id);
    upsertMyBloggerEditDraft.mockClear();

    await act(async () => {
      result.current.setTitle('수정');
    });
    await waitFor(
      () => {
        expect(upsertMyBloggerEditDraft).toHaveBeenCalledWith(item.id, {
          published: true,
          contentRevision: null,
          copies: {
            ko: { title: '수정', body: item.copies.ko.body },
          },
        });
      },
      { timeout: 2_000 },
    );

    await act(async () => {
      await result.current.save();
    });

    expect(updateAdminBlogger).toHaveBeenCalledWith(item.id, {
      published: true,
      contentRevision: 1,
      copies: {
        ko: { title: '수정', body: item.copies.ko.body },
      },
    });
    expect(deleteMyBloggerEditDraft).toHaveBeenCalledWith(item.id);
    expect(result.current.hasServerDraft).toBe(false);
    expect(result.current.isEditing).toBe(false);
  });

  it('discards an edit draft and restores the readonly source entry', async () => {
    const item = makeItem('edit-1', '원본');
    fetchAdminBloggerItem.mockResolvedValue(item);
    fetchMyBloggerEditDraft.mockResolvedValue({
      id: 'draft-edit-1',
      sourceBloggerId: item.id,
      sourceContentRevision: item.contentRevision,
      published: item.published,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      contentRevision: 1,
      copies: {
        ko: { title: '수정 초안', body: '<p>초안 본문</p>' },
      },
    });
    deleteMyBloggerEditDraft.mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useBloggerDocumentEditor({
          mode: 'edit',
          bloggerId: item.id,
          labels: adminTranslations.ko,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    await act(async () => {
      await result.current.beginEdit();
      await result.current.discardEditDraft();
    });

    expect(deleteMyBloggerEditDraft).toHaveBeenCalledWith(item.id);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.currentTitle).toBe('원본');
    expect(result.current.hasServerDraft).toBe(false);
  });
});
