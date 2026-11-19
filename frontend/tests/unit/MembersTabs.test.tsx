import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Members from '../../src/pages/Admin/Pages/Members/Members';

const mocks = vi.hoisted(() => ({
  role: 'site_admin' as 'site_admin' | 'page_admin',
  fetchBirthdayEmailSettings: vi.fn(),
  fetchBirthdayEmailStatus: vi.fn(),
}));

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({
    role: mocks.role,
    effectivePages: mocks.role === 'page_admin' ? ['members'] : [],
  }),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en' }),
}));

vi.mock('../../src/pages/Admin/Pages/Members/useMembersPage', () => ({
  default: () => ({
    pageContainerRef: { current: null },
    members: [],
    isLoading: false,
    loadError: '',
    isMutating: false,
    loadMembers: vi.fn(),
    selectedIds: new Set<string>(),
    toggleSelection: vi.fn(),
    isBulkDeleteOpen: false,
    isMemberDialogOpen: false,
    editingMember: null,
    pendingDelete: null,
    expandedIds: [],
    pageCount: 1,
    currentPage: 1,
    pageMembers: [],
    allSelected: false,
    indeterminate: false,
    form: { name: '', email: '', birthDate: '', phone: '' },
    formErrors: {},
    canSaveMember: false,
    selectionControlsProps: {},
    bulkDeleteConfirmMessage: '',
    openAddDialog: vi.fn(),
    openEditDialog: vi.fn(),
    closeMemberDialog: vi.fn(),
    updateFormField: vi.fn(),
    saveMember: vi.fn(),
    confirmMemberDelete: vi.fn(),
    confirmBulkDelete: vi.fn(),
    closeBulkDelete: vi.fn(),
    closePendingDelete: vi.fn(),
    requestMemberDelete: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleAllMembers: vi.fn(),
    goToPage: vi.fn(),
    formatBirthDate: (value: string) => value,
  }),
}));

vi.mock('../../src/shared/api/birthdayEmailApi', () => ({
  fetchBirthdayEmailSettings: mocks.fetchBirthdayEmailSettings,
  fetchBirthdayEmailStatus: mocks.fetchBirthdayEmailStatus,
  updateBirthdayEmailSettings: vi.fn(),
}));

describe('Members tabs', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(['site_admin', 'page_admin'] as const)(
    'shows the member and birthday tabs to %s',
    async (role) => {
      mocks.role = role;
      mocks.fetchBirthdayEmailSettings.mockResolvedValue({
        enabled: true,
        recipients: ['admin@example.com'],
        lastDelivery: null,
        deliveryHistory: [],
      });
      mocks.fetchBirthdayEmailStatus.mockResolvedValue({
        enabled: true,
        lastDelivery: null,
        deliveryHistory: [],
      });

      render(<Members />);

      expect(screen.getByRole('tab', { name: 'Directory' })).toBeVisible();
      fireEvent.click(screen.getByRole('tab', { name: 'Birthday email' }));

      if (role === 'page_admin') {
        expect(
          await screen.findByText('Automatic sending is on'),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(mocks.fetchBirthdayEmailStatus).toHaveBeenCalledOnce(),
        );
        expect(mocks.fetchBirthdayEmailSettings).not.toHaveBeenCalled();
      } else {
        expect(
          await screen.findByRole('textbox', { name: 'Email address 1' }),
        ).toHaveValue('admin@example.com');
        expect(mocks.fetchBirthdayEmailSettings).toHaveBeenCalledOnce();
        expect(mocks.fetchBirthdayEmailStatus).not.toHaveBeenCalled();
      }
    },
  );
});
