import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/shared/components/ui/Toast/ToastProvider';
import { ConfigProvider } from '../../src/shared/context/ConfigContext';
import { CmsConfigProvider } from '../../src/shared/context/CmsConfigContext';
import { useBloggerAdmin } from '../../src/pages/Admin/Pages/Blogger/hooks/useBloggerAdmin';
import type {
  BloggerListResponse,
  BloggerResponse,
} from '../../src/shared/api/bloggerApi';

const fetchAdminBlogger = vi.fn();
const fetchMyBloggerDrafts = vi.fn();
const deleteAdminBlogger = vi.fn();
const fetchSiteSettings = vi.fn();
const toastWarning = vi.fn();

vi.mock('../../src/shared/api/bloggerApi', () => ({
  fetchAdminBlogger: (...args: unknown[]) => fetchAdminBlogger(...args),
  fetchMyBloggerDrafts: (...args: unknown[]) => fetchMyBloggerDrafts(...args),
  deleteAdminBlogger: (...args: unknown[]) => deleteAdminBlogger(...args),
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
    effectivePages: ['home', 'blogger'],
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
      warning: toastWarning,
      error: vi.fn(),
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

function makeBlogger(id: string): BloggerResponse {
  return {
    id,
    createdBy: 'admin@example.com',
    createdAt: '2026-09-11T12:00:00+00:00',
    updatedAt: '2026-09-11T12:00:00+00:00',
    contentRevision: 1,
    published: true,
    copies: { en: { title: `Title ${id}`, body: '<p>Body</p>' } },
  };
}

function page(items: BloggerResponse[], total: number): BloggerListResponse {
  return { items, total, limit: 10, offset: 0 };
}

describe('useBloggerAdmin', () => {
  beforeEach(() => {
    fetchAdminBlogger.mockReset();
    fetchMyBloggerDrafts.mockReset();
    deleteAdminBlogger.mockReset();
    fetchSiteSettings.mockResolvedValue({
      availableLanguages: ['en'],
      adminLanguage: 'en',
    });
    toastWarning.mockReset();
  });

  it('reports partial bulk-delete failures and retains failed selections', async () => {
    fetchAdminBlogger
      .mockResolvedValueOnce(page([makeBlogger('a'), makeBlogger('b')], 2))
      .mockResolvedValueOnce(page([makeBlogger('b')], 1));
    fetchMyBloggerDrafts.mockResolvedValue([]);
    deleteAdminBlogger.mockImplementation(async (id: string) => {
      if (id === 'b') {
        throw new Error('delete failed');
      }
    });

    const { result } = renderHook(() => useBloggerAdmin(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      result.current.toggleSelection('a', true);
      result.current.toggleSelection('b', true);
    });
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.allSelected).toBe(true);

    let failedIds: string[] = [];
    await act(async () => {
      failedIds = await result.current.deleteSelectedBloggers(['a', 'b']);
    });

    expect(deleteAdminBlogger).toHaveBeenCalledTimes(2);
    expect(failedIds).toEqual(['b']);
    expect([...result.current.selectedIds]).toEqual(['b']);
    expect(result.current.selectedCount).toBe(1);
    expect(toastWarning).toHaveBeenCalledWith(
      'Deleted 1 Blogger posts. 1 could not be deleted.',
    );
  });
});
