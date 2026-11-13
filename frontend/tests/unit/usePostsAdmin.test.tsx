import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/shared/components/ui/Toast/ToastProvider';
import { ConfigProvider } from '../../src/shared/context/ConfigContext';
import { CmsConfigProvider } from '../../src/shared/context/CmsConfigContext';
import {
  POSTS_LIST_PAGE_SIZE,
  POSTS_PAGE_SIZE,
  usePostsAdmin,
} from '../../src/pages/Admin/Pages/Posts/hooks/usePostsAdmin';
import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';
import type {
  PostListResponse,
  PostResponse,
} from '../../src/shared/api/postsApi';

const fetchAdminPosts = vi.fn();
const deleteAdminPost = vi.fn();
const fetchSiteSettings = vi.fn();
const toastError = vi.fn();

vi.mock('../../src/shared/api/postsApi', () => ({
  fetchAdminPosts: (...args: unknown[]) => fetchAdminPosts(...args),
  deleteAdminPost: (...args: unknown[]) => deleteAdminPost(...args),
}));

vi.mock('../../src/shared/api/cmsApi', () => ({
  fetchSiteSettings: (...args: unknown[]) => fetchSiteSettings(...args),
  fetchPageContent: vi.fn(),
  savePageContent: vi.fn(),
  saveSiteSettings: vi.fn(),
}));

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({
    email: 'admin@example.com',
    role: 'site_admin',
    isAuthenticated: true,
    isLoading: false,
    pages: [],
    effectivePages: ['home', 'posts'],
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
      info: vi.fn(),
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

function makePost(id: string): PostResponse {
  return {
    id,
    published: true,
    pinned: false,
    createdBy: 'admin@example.com',
    createdAt: '2026-09-11T12:00:00+00:00',
    updatedAt: '2026-09-11T12:00:00+00:00',
    contentRevision: 1,
    media: [
      {
        type: 'image',
        imageId: `img-${id}`,
        sourceFileId: `file-${id}`,
        width: 100,
        height: 100,
      },
    ],
    copies: {},
  };
}

function page(
  items: PostResponse[],
  total: number,
  offset = 0,
  limit = POSTS_PAGE_SIZE,
): PostListResponse {
  return { items, total, limit, offset };
}

describe('usePostsAdmin', () => {
  beforeEach(() => {
    fetchAdminPosts.mockReset();
    deleteAdminPost.mockReset();
    toastError.mockReset();
    window.history.replaceState(null, '', '/');
    window.localStorage.removeItem('posts-view');
    fetchSiteSettings.mockResolvedValue({
      availableLanguages: ['en'],
      adminLanguage: 'en',
    });
  });

  it('loads the first page on mount', async () => {
    fetchAdminPosts.mockResolvedValueOnce(
      page([makePost('a'), makePost('b')], 2),
    );

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchAdminPosts).toHaveBeenCalledWith({
      limit: POSTS_PAGE_SIZE,
      offset: 0,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });
    expect(result.current.posts.map((post) => post.id)).toEqual(['a', 'b']);
    expect(result.current.total).toBe(2);
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(1);
  });

  it('replaces results when navigating between list pages', async () => {
    window.localStorage.setItem('posts-view', 'list');
    const first = Array.from({ length: 10 }, (_, index) =>
      makePost(`p${index}`),
    );
    const second = Array.from({ length: 10 }, (_, index) =>
      makePost(`p${index + 10}`),
    );

    fetchAdminPosts
      .mockResolvedValueOnce(page(first, 22, 0, 10))
      .mockResolvedValueOnce(page(second, 22, 10, 10))
      .mockResolvedValueOnce(page(first, 22, 0, 10))
      .mockResolvedValueOnce(page(second, 22, 10, 10))
      .mockResolvedValueOnce(page([makePost('filtered')], 1, 0, 10));

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pageCount).toBe(3);

    await act(async () => {
      result.current.goToPage(2);
    });

    await waitFor(() => {
      expect(result.current.page).toBe(2);
      expect(result.current.posts[0].id).toBe('p10');
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_LIST_PAGE_SIZE,
      offset: POSTS_LIST_PAGE_SIZE,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });

    await act(async () => {
      result.current.goToPage(1);
    });

    await waitFor(() => {
      expect(result.current.page).toBe(1);
      expect(result.current.posts[0].id).toBe('p0');
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_LIST_PAGE_SIZE,
      offset: 0,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });

    await act(async () => {
      result.current.goToPage(2);
    });
    await waitFor(() => {
      expect(result.current.page).toBe(2);
    });

    await act(async () => {
      result.current.updateFilters({ pinned: true });
    });
    await waitFor(() => {
      expect(result.current.page).toBe(1);
      expect(result.current.posts.map((post) => post.id)).toEqual(['filtered']);
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_LIST_PAGE_SIZE,
      offset: 0,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: true,
    });
  });

  it('appends grid pages as more posts are requested', async () => {
    const first = Array.from({ length: POSTS_PAGE_SIZE }, (_, index) =>
      makePost(`p${index}`),
    );
    const second = Array.from({ length: POSTS_PAGE_SIZE }, (_, index) =>
      makePost(`p${index + POSTS_PAGE_SIZE}`),
    );
    const third = [makePost('p60'), makePost('p61')];

    fetchAdminPosts
      .mockResolvedValueOnce(page(first, 62))
      .mockResolvedValueOnce(page(second, 62, 30))
      .mockResolvedValueOnce(page(third, 62, 60));

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetchAdminPosts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.loadNextPage();
    });
    expect(result.current.posts).toHaveLength(60);
    expect(result.current.posts[30].id).toBe('p30');
    expect(result.current.page).toBe(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadNextPage();
    });
    expect(result.current.posts).toHaveLength(62);
    expect(result.current.posts[60].id).toBe('p60');
    expect(result.current.hasMore).toBe(false);
    expect(fetchAdminPosts).toHaveBeenNthCalledWith(2, {
      limit: 30,
      offset: POSTS_PAGE_SIZE,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });
  });

  it('keeps loaded grid posts when loading another page fails', async () => {
    const first = Array.from({ length: POSTS_PAGE_SIZE }, (_, index) =>
      makePost(`p${index}`),
    );
    fetchAdminPosts
      .mockResolvedValueOnce(page(first, 60))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(
        page(
          Array.from({ length: POSTS_PAGE_SIZE }, (_, index) =>
            makePost(`p${index + POSTS_PAGE_SIZE}`),
          ),
          60,
          POSTS_PAGE_SIZE,
        ),
      );

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.loadNextPage();
    });

    expect(result.current.posts.map((post) => post.id)).toEqual(
      first.map((post) => post.id),
    );
    expect(result.current.page).toBe(1);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loadMoreFailed).toBe(true);
    expect(toastError).toHaveBeenCalled();

    await act(async () => {
      await result.current.loadNextPage();
    });

    expect(result.current.posts).toHaveLength(POSTS_PAGE_SIZE * 2);
    expect(result.current.page).toBe(2);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.loadMoreFailed).toBe(false);
  });

  it('uses matching list page size and clears selection when changing views', async () => {
    window.localStorage.setItem('posts-view', 'list');
    fetchAdminPosts
      .mockResolvedValueOnce(page([makePost('a'), makePost('b')], 2, 0, 10))
      .mockResolvedValueOnce(page([makePost('a'), makePost('b')], 2, 0, 30));

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_LIST_PAGE_SIZE,
      offset: 0,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });

    act(() => result.current.toggleSelection('a', true));
    expect(result.current.selectedIds.has('a')).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.indeterminate).toBe(true);

    act(() => result.current.updateView('grid'));
    await waitFor(() => {
      expect(fetchAdminPosts).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.indeterminate).toBe(false);
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_PAGE_SIZE,
      offset: 0,
      q: '',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });
  });

  it('keeps pagination on the first page while the search query is debounced', async () => {
    window.localStorage.setItem('posts-view', 'list');
    const first = Array.from({ length: 10 }, (_, index) =>
      makePost(`p${index}`),
    );
    const second = Array.from({ length: 10 }, (_, index) =>
      makePost(`p${index + 10}`),
    );

    fetchAdminPosts
      .mockResolvedValueOnce(page(first, 20, 0, 10))
      .mockResolvedValueOnce(page(second, 20, 10, 10))
      .mockResolvedValueOnce(page(first, 20, 0, 10))
      .mockResolvedValueOnce(page([makePost('filtered')], 1, 0, 10));

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.goToPage(2);
    });
    await waitFor(() => {
      expect(result.current.page).toBe(2);
    });

    act(() => {
      result.current.updateFilters({ q: 'search' });
    });
    expect(result.current.isQueryPending).toBe(true);

    act(() => {
      result.current.goToPage(2);
    });

    await waitFor(() => {
      expect(result.current.isQueryPending).toBe(false);
      expect(result.current.page).toBe(1);
      expect(result.current.posts.map((post) => post.id)).toEqual([
        'filtered',
      ]);
    });
    expect(fetchAdminPosts).toHaveBeenLastCalledWith({
      limit: POSTS_LIST_PAGE_SIZE,
      offset: 0,
      q: 'search',
      created_by: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });
  });

  it('includes the required trash labels', () => {
    const labels = adminTranslations[Language.EN];

    expect(labels.postsTrashTitle).toBe('Trash');
    expect(labels.postsTrash).toBe('Trash');
    expect(labels.postsTrashEmpty).toBe('Trash is empty.');
    expect(labels.postsTrashRestore).toBe('Restore');
    expect(labels.postsTrashPurge).toBe('Delete permanently');
  });

  it('toasts and clears the grid on load failure', async () => {
    fetchAdminPosts.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => usePostsAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(toastError).toHaveBeenCalled();
    expect(result.current.posts).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});
