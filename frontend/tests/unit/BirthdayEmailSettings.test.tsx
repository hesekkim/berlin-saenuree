import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BirthdayEmailSettings from '../../src/pages/Admin/Pages/Members/BirthdayEmailSettings';
import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';

const mocks = vi.hoisted(() => ({
  fetchBirthdayEmailSettings: vi.fn(),
  fetchBirthdayEmailStatus: vi.fn(),
  updateBirthdayEmailSettings: vi.fn(),
}));

vi.mock('../../src/shared/api/birthdayEmailApi', () => ({
  fetchBirthdayEmailSettings: mocks.fetchBirthdayEmailSettings,
  fetchBirthdayEmailStatus: mocks.fetchBirthdayEmailStatus,
  updateBirthdayEmailSettings: mocks.updateBirthdayEmailSettings,
}));

describe('BirthdayEmailSettings', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lets site admins add an address without saving an empty row', async () => {
    mocks.fetchBirthdayEmailSettings.mockResolvedValue({
      enabled: false,
      recipients: ['first@example.com'],
      lastDelivery: null,
      deliveryHistory: [],
    });

    render(
      <BirthdayEmailSettings
        labels={adminTranslations[Language.EN]}
        language="en"
        canManage
      />,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Email address 1' }),
    ).toHaveValue('first@example.com');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add address' }));
    const addedAddress = await screen.findByRole('textbox', {
      name: 'Email address 2',
    });
    expect(addedAddress).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    fireEvent.change(addedAddress, {
      target: { value: 'second@example.com' },
    });
    expect(saveButton).toBeEnabled();
    expect(screen.getByText('No delivery record yet.')).toBeInTheDocument();
  });

  it('shows page admins read-only delivery status without recipient settings', async () => {
    mocks.fetchBirthdayEmailStatus.mockResolvedValue({
      enabled: true,
      lastDelivery: null,
      deliveryHistory: [
        {
          month: '2026-10',
          status: 'failed',
          attemptedAt: '2026-09-27T18:00:00+02:00',
          recipientCount: 2,
          failedRecipientCount: 1,
          recipients: ['sent@example.com', 'failed@example.com'],
          sentRecipients: ['sent@example.com'],
          failedRecipients: ['failed@example.com'],
          error: 'smtp_delivery_failed',
        },
      ],
    });

    const { container } = render(
      <BirthdayEmailSettings
        labels={adminTranslations[Language.EN]}
        language="en"
        canManage={false}
      />,
    );

    expect(
      await screen.findByText('Automatic sending is on'),
    ).toBeInTheDocument();
    expect(mocks.fetchBirthdayEmailStatus).toHaveBeenCalledOnce();
    expect(mocks.fetchBirthdayEmailSettings).not.toHaveBeenCalled();
    expect(within(container).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(container).queryByRole('textbox')).not.toBeInTheDocument();
    const recipientSummary = screen.getByRole('button', {
      name: '2 recipients, 1 failed',
    });
    expect(recipientSummary).not.toHaveAttribute('title');
    fireEvent.click(recipientSummary);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('sent@example.com')).toBeInTheDocument();
    expect(screen.getByText('failed@example.com')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(container).queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the address save label while auto-send is being saved', async () => {
    const savedSettings = {
      enabled: true,
      recipients: ['first@example.com'],
      lastDelivery: null,
      deliveryHistory: [],
    };
    mocks.fetchBirthdayEmailSettings.mockResolvedValue({
      ...savedSettings,
      enabled: false,
    });
    let resolveUpdate: ((value: typeof savedSettings) => void) | undefined;
    mocks.updateBirthdayEmailSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    render(
      <BirthdayEmailSettings
        labels={adminTranslations[Language.EN]}
        language="en"
        canManage
      />,
    );

    const saveButton = await screen.findByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-send' }));

    expect(mocks.updateBirthdayEmailSettings).toHaveBeenCalledWith({
      enabled: true,
      recipients: ['first@example.com'],
    });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveTextContent('Save');
    expect(
      screen.getByRole('textbox', { name: 'Email address 1' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Add address' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove address 1' }),
    ).toBeEnabled();
    await act(async () => {
      resolveUpdate?.(savedSettings);
    });
  });

  it('shows invalid address errors on the corresponding input', async () => {
    mocks.fetchBirthdayEmailSettings.mockResolvedValue({
      enabled: false,
      recipients: ['first@example.com'],
      lastDelivery: null,
      deliveryHistory: [],
    });

    render(
      <BirthdayEmailSettings
        labels={adminTranslations[Language.EN]}
        language="en"
        canManage
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Add address' }));
    const invalidAddress = await screen.findByRole('textbox', {
      name: 'Email address 2',
    });
    fireEvent.change(invalidAddress, {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(invalidAddress).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText(
        adminTranslations[Language.EN].birthdayEmailSaveFailed,
      ),
    ).toBeInTheDocument();
    expect(mocks.updateBirthdayEmailSettings).not.toHaveBeenCalled();
  });

  it('shows real delivery history when available', async () => {
    mocks.fetchBirthdayEmailSettings.mockResolvedValue({
      enabled: false,
      recipients: [],
      lastDelivery: null,
      deliveryHistory: [
        {
          month: '2026-11',
          status: 'sent',
          attemptedAt: '2026-10-25T18:00:00+02:00',
          recipientCount: 2,
          failedRecipientCount: 0,
          failedRecipients: [],
          error: null,
        },
      ],
    });

    render(
      <BirthdayEmailSettings
        labels={adminTranslations[Language.EN]}
        language="en"
        canManage
      />,
    );

    expect(await screen.findByText('2026-11')).toBeInTheDocument();
  });
});
