import { apiClient } from '../lib/axios';

export type BirthdayEmailDelivery = {
  month: string;
  status: 'sending' | 'sent' | 'failed';
  attemptedAt: string;
  recipientCount: number;
  failedRecipientCount: number;
  recipients?: string[];
  sentRecipients?: string[];
  failedRecipients: string[];
  error:
    | 'email_sending_disabled'
    | 'smtp_not_configured'
    | 'smtp_delivery_failed'
    | null;
};

export type BirthdayEmailStatusDelivery = BirthdayEmailDelivery;

export type BirthdayEmailStatus = {
  enabled: boolean;
  lastDelivery: BirthdayEmailStatusDelivery | null;
  deliveryHistory: BirthdayEmailStatusDelivery[];
};

export type BirthdayEmailSettings = BirthdayEmailStatus & {
  recipients: string[];
  lastDelivery: BirthdayEmailDelivery | null;
  deliveryHistory: BirthdayEmailDelivery[];
};

export type UpdateBirthdayEmailSettings = Pick<
  BirthdayEmailSettings,
  'enabled' | 'recipients'
>;

export async function fetchBirthdayEmailSettings(): Promise<BirthdayEmailSettings> {
  const response = await apiClient.get<BirthdayEmailSettings>(
    '/admin/members/birthday-email',
  );
  return response.data;
}

export async function fetchBirthdayEmailStatus(): Promise<BirthdayEmailStatus> {
  const response = await apiClient.get<BirthdayEmailStatus>(
    '/admin/members/birthday-email/status',
  );
  return response.data;
}

export async function updateBirthdayEmailSettings(
  payload: UpdateBirthdayEmailSettings,
): Promise<BirthdayEmailSettings> {
  const response = await apiClient.put<BirthdayEmailSettings>(
    '/admin/members/birthday-email',
    payload,
  );
  return response.data;
}
