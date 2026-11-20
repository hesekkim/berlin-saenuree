import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Members from '../../src/pages/Admin/Pages/Members/Members';

const mocks = vi.hoisted(() => ({
  role: 'site_admin' as 'site_admin' | 'page_admin' | 'page_manager',
  fetchBirthdayEmailSettings: vi.fn(),
  fetchBirthdayEmailStatus: vi.fn(),
  printRequest: null as
    | {
        scope: 'selected' | 'filtered';
        members: Array<{
          id: string;
          name: string;
          email: string | null;
          birthDate: string;
          phone: string | null;
        }>;
      }
    | null,
}));

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({
    role: mocks.role,
    effectivePages: mocks.role === 'site_admin' ? [] : ['members'],
  }),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en' }),
}));

vi.mock('../../src/pages/Admin/Pages/Members/useMembersPage', () => ({
  default: () => ({
    pageContainerRef: { current: null },
    members: [
      {
        id: 'member-1',
        name: 'Hannah Kim',
        email: null,
        birthDate: '1990-04-12',
        phone: null,
      },
    ],
    filteredMembers: [
      {
        id: 'member-1',
        name: 'Hannah Kim',
        email: null,
        birthDate: '1990-04-12',
        phone: null,
      },
    ],
    isLoading: false,
    loadError: '',
    isMutating: false,
    loadMembers: vi.fn(),
    selectedIds: new Set<string>(),
    selectedCount: 0,
    toggleSelection: vi.fn(),
    isBulkDeleteOpen: false,
    isMemberDialogOpen: false,
    editingMember: null,
    pendingDelete: null,
    expandedIds: [],
    pageCount: 1,
    currentPage: 1,
    pageMembers: [
      {
        id: 'member-1',
        name: 'Hannah Kim',
        email: null,
        birthDate: '1990-04-12',
        phone: null,
      },
    ],
    birthMonth: '',
    searchTerm: '',
    hasActiveFilters: false,
    printRequest: mocks.printRequest,
    isExportDialogOpen: false,
    exportScope: null,
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
    updateBirthMonth: vi.fn(),
    updateSearchTerm: vi.fn(),
    resetFilters: vi.fn(),
    requestPrint: vi.fn(),
    clearPrintRequest: vi.fn(),
    openExportDialog: vi.fn(),
    closeExportDialog: vi.fn(),
    setExportScope: vi.fn(),
    confirmExport: vi.fn(),
    formatBirthDate: (value: string) => value,
  }),
}));

vi.mock('../../src/shared/api/birthdayEmailApi', () => ({
  fetchBirthdayEmailSettings: mocks.fetchBirthdayEmailSettings,
  fetchBirthdayEmailStatus: mocks.fetchBirthdayEmailStatus,
  updateBirthdayEmailSettings: vi.fn(),
}));

describe('Members tabs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.printRequest = null;
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

  it('allows a read-only member manager to select and export without management actions', () => {
    mocks.role = 'page_manager';
    render(<Members />);

    expect(
      screen.getByRole('checkbox', { name: 'Select Hannah Kim' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save as PDF' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All months' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('prints registered email and phone alongside name and birth date', () => {
    mocks.printRequest = {
      scope: 'selected',
      members: [
        {
          id: 'member-1',
          name: 'Hannah Kim',
          email: 'hannah@example.com',
          birthDate: '1990-04-12',
          phone: '+49 30 123456',
        },
      ],
    };
    vi.spyOn(window, 'print').mockImplementation(() => undefined);

    const { container } = render(<Members />);
    const printTable = container.querySelector('table');

    if (!printTable) {
      throw new Error('Expected the print table to render.');
    }

    expect(within(printTable).getByText('Hannah Kim')).toBeInTheDocument();
    expect(
      within(printTable).getByText('hannah@example.com'),
    ).toBeInTheDocument();
    expect(
      within(printTable).getByText('+49 30 123456'),
    ).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledOnce();
  });
});
