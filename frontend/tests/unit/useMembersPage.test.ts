import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchMember } from '../../src/shared/api/churchMembersApi';
import useMembersPage from '../../src/pages/Admin/Pages/Members/useMembersPage';
import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';

const mocks = vi.hoisted(() => ({
  members: [] as Array<{
    id: string;
    name: string;
    email: string | null;
    birthDate: string;
    phone: string | null;
  }>,
}));

vi.mock('../../src/pages/Admin/Pages/Members/useChurchMembers', () => ({
  default: () => ({
    members: mocks.members,
    isLoading: false,
    loadError: null,
    isMutating: false,
    loadMembers: vi.fn(),
    addMember: vi.fn(),
    editMember: vi.fn(),
    removeMember: vi.fn(),
    removeMembers: vi.fn(),
  }),
}));

function makeMember(
  id: string,
  birthDate: string,
  name = id,
): ChurchMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
    birthDate,
    phone: '+49 30 123456',
  };
}

describe('useMembersPage export scope', () => {
  beforeEach(() => {
    mocks.members = Array.from({ length: 11 }, (_, index) =>
      makeMember(
        `september-${index + 1}`,
        `1980-09-${String(index + 1).padStart(2, '0')}`,
      ),
    ).concat(makeMember('october', '1980-10-12'));
  });

  it('exports all filtered pages and keeps checked members independent of filters', () => {
    const { result } = renderHook(() =>
      useMembersPage(adminTranslations[Language.EN], 'en', true),
    );

    act(() => {
      result.current.updateBirthMonth('09');
      result.current.openExportDialog();
    });

    expect(result.current.filteredMembers).toHaveLength(11);
    expect(result.current.pageMembers).toHaveLength(10);
    expect(result.current.exportScope).toBe('filtered');

    act(() => result.current.confirmExport());

    expect(result.current.printRequest?.scope).toBe('filtered');
    expect(result.current.printRequest?.members).toHaveLength(11);

    act(() => result.current.toggleSelection('october', true));
    act(() => result.current.openExportDialog());

    expect(result.current.exportScope).toBeNull();

    act(() => result.current.setExportScope('selected'));
    act(() => result.current.confirmExport());

    expect(result.current.printRequest?.scope).toBe('selected');
    expect(result.current.printRequest?.members.map((member) => member.id)).toEqual([
      'october',
    ]);
  });
});
