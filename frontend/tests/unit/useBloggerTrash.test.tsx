import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BloggerResponse,
  BloggerTrashItem,
} from '../../src/shared/api/bloggerApi';
import { useBloggerTrash } from '../../src/pages/Admin/Pages/Trash/hooks/useBloggerTrash';

const fetchAdminBloggerTrash = vi.fn();
const restoreAdminBloggerTrash = vi.fn();
const purgeAdminBloggerTrash = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
const toastApi = {
  info: toastInfo,
  warning: vi.fn(),
  error: toastError,
  dismiss: vi.fn(),
};

vi.mock('../../src/shared/api/bloggerApi', () => ({
  fetchAdminBloggerTrash: (...args: unknown[]) =>
    fetchAdminBloggerTrash(...args),
  restoreAdminBloggerTrash: (...args: unknown[]) =>
    restoreAdminBloggerTrash(...args),
  purgeAdminBloggerTrash: (...args: unknown[]) =>
    purgeAdminBloggerTrash(...args),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en', setLanguage: vi.fn() }),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => toastApi,
}));

function makeBlogger(id: string): BloggerResponse {
  return {
    id,
    enabled: true,
    createdBy: 'manager@example.com',
    createdAt: '2026-09-11T12:00:00+00:00',
    updatedAt: '2026-09-11T12:00:00+00:00',
    contentRevision: 1,
    copies: { ko: { title: '제목', body: '<p>본문</p>' } },
  };
}

function makeTrashItem(id = 'trash-1'): BloggerTrashItem {
  return {
    id,
    deletedAt: '2026-09-11T12:00:00+00:00',
    expiresAt: '2026-10-11T12:00:00+00:00',
    deletedBy: 'manager@example.com',
    blogger: makeBlogger('blogger-1'),
  };
}

describe('useBloggerTrash', () => {
  beforeEach(() => {
    fetchAdminBloggerTrash.mockReset();
    restoreAdminBloggerTrash.mockReset();
    purgeAdminBloggerTrash.mockReset();
    toastInfo.mockReset();
    toastError.mockReset();
  });

  it('loads trash and refreshes it after restoring an item', async () => {
    const item = makeTrashItem();
    fetchAdminBloggerTrash
      .mockResolvedValueOnce({ items: [item], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    restoreAdminBloggerTrash.mockResolvedValue(makeBlogger('blogger-1'));

    const { result } = renderHook(() => useBloggerTrash());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([item]);

    await act(async () => {
      await result.current.restore(item.id);
    });

    expect(restoreAdminBloggerTrash).toHaveBeenCalledWith(item.id);
    expect(result.current.items).toEqual([]);
    expect(toastInfo).toHaveBeenCalled();
  });

  it('purges an item and reloads trash', async () => {
    const item = makeTrashItem();
    fetchAdminBloggerTrash
      .mockResolvedValueOnce({ items: [item], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    purgeAdminBloggerTrash.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBloggerTrash());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.purge(item.id);
    });

    expect(purgeAdminBloggerTrash).toHaveBeenCalledWith(item.id);
    expect(result.current.items).toEqual([]);
    expect(toastInfo).toHaveBeenCalled();
  });

  it('shows a conflict error without reloading after restore returns 409', async () => {
    const item = makeTrashItem();
    fetchAdminBloggerTrash.mockResolvedValue({ items: [item], total: 1 });
    const conflict = new axios.AxiosError('conflict');
    conflict.response = { status: 409 } as typeof conflict.response;
    restoreAdminBloggerTrash.mockRejectedValue(conflict);

    const { result } = renderHook(() => useBloggerTrash());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.restore(item.id);
    });

    expect(toastError).toHaveBeenCalled();
    expect(fetchAdminBloggerTrash).toHaveBeenCalledOnce();
  });
});
