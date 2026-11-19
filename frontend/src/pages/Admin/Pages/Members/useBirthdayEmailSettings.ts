import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBirthdayEmailSettings,
  fetchBirthdayEmailStatus,
  updateBirthdayEmailSettings,
  type BirthdayEmailDelivery,
  type BirthdayEmailStatusDelivery,
  type BirthdayEmailSettings,
} from '../../../../shared/api/birthdayEmailApi';
import type { AdminTranslations } from '../../translations';

type RecipientInput = {
  id: number;
  value: string;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type SettingsView = {
  enabled: boolean;
  recipients?: string[];
  lastDelivery: BirthdayEmailDelivery | BirthdayEmailStatusDelivery | null;
  deliveryHistory: (BirthdayEmailDelivery | BirthdayEmailStatusDelivery)[];
};

function sameRecipients(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((recipient, index) => recipient === right[index])
  );
}

export default function useBirthdayEmailSettings(
  labels: AdminTranslations,
  canManage: boolean,
) {
  const nextRecipientId = useRef(0);
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [recipientInputs, setRecipientInputs] = useState<RecipientInput[]>([]);
  const [recipientErrors, setRecipientErrors] = useState<
    Record<number, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingEnabled, setIsUpdatingEnabled] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const createInputs = useCallback((recipients: string[]) => {
    const values = recipients.length > 0 ? recipients : [''];
    return values.map((value) => ({
      id: nextRecipientId.current++,
      value,
    }));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const current: SettingsView = canManage
        ? await fetchBirthdayEmailSettings()
        : await fetchBirthdayEmailStatus();
      setSettings(current);
      setEnabled(current.enabled);
      setRecipientInputs(
        canManage ? createInputs(current.recipients ?? []) : [],
      );
    } catch {
      setError(labels.birthdayEmailLoadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [canManage, createInputs, labels.birthdayEmailLoadFailed]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const addRecipient = () => {
    setRecipientInputs((current) => [
      ...current,
      { id: nextRecipientId.current++, value: '' },
    ]);
  };

  const updateRecipient = (id: number, value: string) => {
    setRecipientInputs((current) =>
      current.map((item) => (item.id === id ? { ...item, value } : item)),
    );
    setRecipientErrors((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const removeRecipient = (id: number) => {
    setRecipientInputs((current) => current.filter((item) => item.id !== id));
    setRecipientErrors((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const updateEnabled = async (value: boolean) => {
    if (!canManage || !settings) {
      return;
    }
    setIsUpdatingEnabled(true);
    setError('');
    setSaved(false);
    try {
      const updated = await updateBirthdayEmailSettings({
        enabled: value,
        recipients: settings.recipients ?? [],
      });
      setSettings(updated);
      setEnabled(updated.enabled);
    } catch {
      setEnabled(settings.enabled);
      setError(labels.birthdayEmailSaveFailed);
    } finally {
      setIsUpdatingEnabled(false);
    }
  };

  const saveSettings = async () => {
    if (!canManage) {
      return;
    }
    const invalidRecipients = recipientInputs.filter((item) => {
      const value = item.value.trim();
      return value !== '' && !EMAIL_PATTERN.test(value);
    });
    if (invalidRecipients.length > 0) {
      setRecipientErrors(
        Object.fromEntries(
          invalidRecipients.map((item) => [
            item.id,
            labels.birthdayEmailSaveFailed,
          ]),
        ),
      );
      setError('');
      setSaved(false);
      return;
    }
    setRecipientErrors({});
    setIsSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated: BirthdayEmailSettings =
        await updateBirthdayEmailSettings({
          enabled,
          recipients: recipientInputs
            .map((item) => item.value.trim())
            .filter(Boolean),
        });
      setSettings(updated);
      setEnabled(updated.enabled);
      setRecipientInputs(createInputs(updated.recipients));
      setSaved(true);
    } catch {
      setError(labels.birthdayEmailSaveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const recipientValues = recipientInputs
    .map((item) => item.value.trim())
    .filter(Boolean);
  const hasChanges =
    canManage &&
    settings !== null &&
    !sameRecipients(recipientValues, settings.recipients ?? []);

  return {
    settings,
    enabled,
    updateEnabled,
    recipientInputs,
    recipientErrors,
    addRecipient,
    updateRecipient,
    removeRecipient,
    isLoading,
    isSaving,
    isUpdatingEnabled,
    error,
    saved,
    hasChanges,
    loadSettings,
    saveSettings,
  };
}
