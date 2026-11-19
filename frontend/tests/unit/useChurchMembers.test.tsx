import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchMember } from '../../src/shared/api/churchMembersApi';
import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';
import useChurchMembers from '../../src/pages/Admin/Pages/Members/useChurchMembers';

const mocks = vi.hoisted(() => ({
  fetchChurchMembers: vi.fn(),
  createChurchMember: vi.fn(),
  updateChurchMember: vi.fn(),
  deleteChurchMember: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/shared/api/churchMembersApi', () => ({
  fetchChurchMembers: mocks.fetchChurchMembers,
  createChurchMember: mocks.createChurchMember,
  updateChurchMember: mocks.updateChurchMember,
  deleteChurchMember: mocks.deleteChurchMember,
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  }),
}));

function makeMember(id: string, name: string): ChurchMember {
  return {
    id,
    name,
    email: null,
    birthDate: '1990-04-12',
    phone: null,
  };
}

describe('useChurchMembers bulk deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes successes and retains failed members with a partial-result notice', async () => {
    const first = makeMember('member-1', 'Alex Kim');
    const second = makeMember('member-2', 'Jamie Lee');
    mocks.fetchChurchMembers.mockResolvedValue([first, second]);
    mocks.deleteChurchMember
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Delete failed'));

    const { result } = renderHook(() =>
      useChurchMembers(adminTranslations[Language.EN], true),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let failedIds: string[] = [];
    await act(async () => {
      failedIds = await result.current.removeMembers([
        'member-1',
        'member-2',
      ]);
    });

    expect(mocks.deleteChurchMember).toHaveBeenNthCalledWith(1, 'member-1');
    expect(mocks.deleteChurchMember).toHaveBeenNthCalledWith(2, 'member-2');
    expect(failedIds).toEqual(['member-2']);
    expect(result.current.members).toEqual([second]);
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Deleted 1 members. 1 could not be deleted.',
    );
  });
});
