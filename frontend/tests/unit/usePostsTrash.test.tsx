import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PostResponse,
  PostTrashItem,
} from '../../src/shared/api/postsApi';
import { usePostsTrash } from '../../src/pages/Admin/Pages/Trash/hooks/usePostsTrash';

const fetchAdminPostsTrash = vi.fn();
const restoreAdminPostTrash = vi.fn();
const purgeAdminPostTrash = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
const toastApi = {
  info: toastInfo,
  warning: vi.fn(),
  error: toastError,
  dismiss: vi.fn(),
};

vi.mock('../../src/shared/api/postsApi', () => ({
  fetchAdminPostsTrash: (...args: unknown[]) => fetchAdminPostsTrash(...args),
  restoreAdminPostTrash: (...args: unknown[]) => restoreAdminPostTrash(...args),
  purgeAdminPostTrash: (...args: unknown[]) => purgeAdminPostTrash(...args),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en', setLanguage: vi.fn() }),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => toastApi,
}));

function makePost(id: string): PostResponse {
  return {
    id,
    enabled: true,
    pinned: false,
    createdBy: 'manager@example.com',
    createdAt: '2026-09-11T12:00:00+00:00',
    updatedAt: '2026-09-11T12:00:00+00:00',
    contentRevision: 1,
    media: [],
    copies: {},
  };
}

function makeTrashItem(id = 'trash-1'): PostTrashItem {
  return {
    id,
    deletedAt: '2026-09-11T12:00:00+00:00',
    expiresAt: '2026-10-11T12:00:00+00:00',
    deletedBy: 'manager@example.com',
    post: makePost('post-1'),
  };
}

describe('usePostsTrash', () => {
  beforeEach(() => {
    fetchAdminPostsTrash.mockReset();
    restoreAdminPostTrash.mockReset();
    purgeAdminPostTrash.mockReset();
    toastInfo.mockReset();
    toastError.mockReset();
  });

  it('loads trash and refreshes it after restoring an item', async () => {
    const item = makeTrashItem();
    fetchAdminPostsTrash
      .mockResolvedValueOnce({ items: [item], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    restoreAdminPostTrash.mockResolvedValue(makePost('post-1'));

    const { result } = renderHook(() => usePostsTrash());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.trashItems).toEqual([item]);

    await act(async () => {
      await result.current.restoreTrashItem(item.id);
    });

    expect(restoreAdminPostTrash).toHaveBeenCalledWith(item.id);
    expect(result.current.trashItems).toEqual([]);
    expect(toastInfo).toHaveBeenCalled();
  });

  it('purges an item and reloads the trash list', async () => {
    const item = makeTrashItem();
    fetchAdminPostsTrash
      .mockResolvedValueOnce({ items: [item], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    purgeAdminPostTrash.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePostsTrash());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.purgeTrashItem(item.id);
    });

    expect(purgeAdminPostTrash).toHaveBeenCalledWith(item.id);
    expect(result.current.trashItems).toEqual([]);
    expect(toastInfo).toHaveBeenCalled();
  });

  it('shows a conflict error without refreshing when restore returns 409', async () => {
    const item = makeTrashItem();
    fetchAdminPostsTrash.mockResolvedValue({ items: [item], total: 1 });
    const conflict = new axios.AxiosError('conflict');
    conflict.response = { status: 409 } as typeof conflict.response;
    restoreAdminPostTrash.mockRejectedValue(conflict);

    const { result } = renderHook(() => usePostsTrash());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.restoreTrashItem(item.id);
    });

    expect(toastError).toHaveBeenCalled();
    expect(fetchAdminPostsTrash).toHaveBeenCalledOnce();
  });
});
