import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Language } from '../../src/shared/context/ConfigContext';
import { adminTranslations } from '../../src/pages/Admin/translations';
import Members from '../../src/pages/Admin/Pages/Members/Members';
import useChurchMembers from '../../src/pages/Admin/Pages/Members/useChurchMembers';

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({ role: 'page_admin', effectivePages: ['members'] }),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en' }),
}));

vi.mock('../../src/pages/Admin/Pages/Members/useChurchMembers', () => ({
  default: vi.fn(),
}));

describe('Members add dialog validation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(useChurchMembers).mockReturnValue({
      members: [],
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });
  });

  it('shows invalid email and phone errors beside their inputs', () => {
    render(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Member' },
    });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Date of birth'), {
      target: { value: '1990-04-12' },
    });
    expect(saveButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByLabelText('Phone (optional)'), {
      target: { value: 'Call me' },
    });
    fireEvent.click(saveButton);

    expect(
      screen.getByText(adminTranslations[Language.EN].membersEmailInvalid),
    ).toBeInTheDocument();
    expect(
      screen.getByText(adminTranslations[Language.EN].membersPhoneInvalid),
    ).toBeInTheDocument();
  });

  it('keeps the birth date beside the member name in the collapsed row', () => {
    vi.mocked(useChurchMembers).mockReturnValue({
      members: [
        {
          id: 'member-1',
          name: 'Alex Kim',
          email: null,
          birthDate: '1990-04-12',
          phone: null,
        },
      ],
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    const nameToggle = screen.getByRole('button', {
      name: /Alex Kim/,
    });
    const birthDates = screen.getAllByText('Apr 12, 1990');
    expect(
      birthDates.some((birthDate) => birthDate.closest('button') === nameToggle),
    ).toBe(true);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens the edit dialog with the selected member values', () => {
    const editMember = vi.fn().mockResolvedValue(true);
    vi.mocked(useChurchMembers).mockReturnValue({
      members: [
        {
          id: 'member-1',
          name: 'Alex Kim',
          email: 'alex@example.com',
          birthDate: '1990-04-12',
          phone: '+49 30 1234567',
        },
      ],
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember,
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(
      screen.getByRole('heading', { name: 'Edit member' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Alex Kim');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('1990-04-12');
    expect(screen.getByLabelText('Email (optional)')).toHaveValue(
      'alex@example.com',
    );
    expect(screen.getByLabelText('Phone (optional)')).toHaveValue(
      '+49 30 1234567',
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'alex@example.org' },
    });
    expect(saveButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'alex@example.com' },
    });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alex Kim 2' },
    });
    expect(saveButton).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    return waitFor(() => {
      expect(editMember).toHaveBeenCalledWith('member-1', {
        name: 'Alex Kim 2',
        birthDate: '1990-04-12',
        email: 'alex@example.com',
        phone: '+49 30 1234567',
      });
    });
  });

  it('selects and confirms deletion of multiple members', async () => {
    const removeMembers = vi.fn().mockResolvedValue([]);
    vi.mocked(useChurchMembers).mockReturnValue({
      members: [
        {
          id: 'member-1',
          name: 'Alex Kim',
          email: null,
          birthDate: '1990-04-12',
          phone: null,
        },
        {
          id: 'member-2',
          name: 'Jamie Lee',
          email: null,
          birthDate: '1988-03-08',
          phone: null,
        },
      ],
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers,
    });

    render(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('0 selected')).toHaveLength(2);
    screen
      .getAllByRole('button', { name: 'Delete 0 selected items' })
      .forEach((button) => expect(button).toBeDisabled());

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all members' }),
    );
    expect(screen.getAllByText('2 selected')).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete 2 selected items' })[0],
    );
    expect(
      screen.getByRole('heading', { name: 'Delete members' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));

    await waitFor(() => {
      expect(removeMembers).toHaveBeenCalledWith(['member-1', 'member-2']);
    });
  });

  it('paginates the member list and keeps selection across pages', () => {
    const members = Array.from({ length: 11 }, (_, index) => ({
      id: `member-${index + 1}`,
      name: `Member ${index + 1}`,
      email: null,
      birthDate: '1990-04-12',
      phone: null,
    }));
    vi.mocked(useChurchMembers).mockReturnValue({
      members,
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });

    const view = render(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous' }),
    ).toBeDisabled();
    expect(screen.getAllByText('Member 10')).toHaveLength(2);
    expect(screen.queryByText('Member 11')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Member 1' }));
    expect(screen.getAllByText('1 selected')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getAllByText('Member 11')).toHaveLength(2);
    expect(screen.queryByText('Member 1')).not.toBeInTheDocument();
    expect(screen.getAllByText('1 selected')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all members',
    });
    fireEvent.click(selectAll);
    expect(screen.getAllByText('2 selected')).toHaveLength(2);
    fireEvent.click(selectAll);
    expect(screen.getAllByText('1 selected')).toHaveLength(2);

    vi.mocked(useChurchMembers).mockReturnValue({
      members: members.slice(0, 10),
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });
    view.rerender(
      <MemoryRouter>
        <Members />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getAllByText('Member 10')).toHaveLength(2);
    expect(screen.queryByText('Member 11')).not.toBeInTheDocument();
    expect(screen.getAllByText('1 selected')).toHaveLength(2);
  });

  it('scrolls the member page into view when changing pages', () => {
    vi.mocked(useChurchMembers).mockReturnValue({
      members: Array.from({ length: 11 }, (_, index) => ({
        id: `member-${index + 1}`,
        name: `Member ${index + 1}`,
        email: null,
        birthDate: '1990-04-12',
        phone: null,
      })),
      isLoading: false,
      loadError: null,
      isMutating: false,
      loadMembers: vi.fn(),
      addMember: vi.fn(),
      editMember: vi.fn(),
      removeMember: vi.fn(),
      removeMembers: vi.fn(),
    });

    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <MemoryRouter>
          <Members />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenNthCalledWith(1, {
        behavior: 'smooth',
        block: 'start',
      });

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollIntoView',
          originalScrollIntoView,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });
});
