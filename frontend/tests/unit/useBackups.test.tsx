import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  deleteBackup: vi.fn(),
  downloadBackup: vi.fn(),
  fetchBackups: vi.fn(),
  restoreBackup: vi.fn(),
  restoreImportedBackup: vi.fn(),
  stageBackupImport: vi.fn(),
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('../../src/shared/api/backupsApi', () => mocks);
vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => mocks.toast,
}));

import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';
import { useBackups } from '../../src/pages/Admin/Settings/hooks/useBackups';

describe('useBackups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchBackups.mockResolvedValue({ backups: [], maxBackups: 12 });
    mocks.stageBackupImport.mockResolvedValue({
      importId: 'staged-import',
      createdAt: '2026-01-01T00:00:00+00:00',
      siteId: 'site',
      fileCount: 3,
      expandedSizeBytes: 1200,
    });
    mocks.restoreImportedBackup.mockResolvedValue({
      restored: true,
      safetyBackupId: 'safety-backup',
    });
  });

  it('previews an uploaded archive before restoring it with a password', async () => {
    const { result } = renderHook(() =>
      useBackups(adminTranslations[Language.EN]),
    );
    await waitFor(() => expect(mocks.fetchBackups).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleImportFile(
        new File(['archive'], 'backup.zip', { type: 'application/zip' }),
      );
    });
    expect(result.current.pendingAction).toMatchObject({
      kind: 'restore-import',
      preview: { fileCount: 3 },
    });
    expect(mocks.restoreImportedBackup).not.toHaveBeenCalled();

    act(() => result.current.setPassword('admin-secret'));
    await act(async () => result.current.confirmAction());

    expect(mocks.restoreImportedBackup).toHaveBeenCalledWith(
      'staged-import',
      'admin-secret',
    );
    expect(mocks.toast.info).toHaveBeenCalledWith(
      adminTranslations[Language.EN].backupsRestoreSuccess,
    );
    expect(result.current.pendingAction).toBeNull();
  });

  it('aborts an in-progress backup when cancellation is requested', async () => {
    const labels = adminTranslations[Language.EN];
    const { result } = renderHook(() => useBackups(labels));
    await waitFor(() => expect(mocks.fetchBackups).toHaveBeenCalledTimes(1));

    let backupSignal: AbortSignal | undefined;
    mocks.createBackup.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          backupSignal = signal;
          signal.addEventListener(
            'abort',
            () => reject({ __CANCEL__: true }),
            { once: true },
          );
        }),
    );

    act(() => {
      void result.current.handleCreate();
    });
    expect(result.current.busyAction).toBe('create');

    act(() => result.current.cancelCreate());
    await waitFor(() => expect(result.current.busyAction).toBeNull());

    expect(backupSignal?.aborted).toBe(true);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('shows an incorrect password on the field instead of a toast', async () => {
    const labels = adminTranslations[Language.EN];
    const { result } = renderHook(() => useBackups(labels));
    await waitFor(() => expect(mocks.fetchBackups).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleImportFile(
        new File(['archive'], 'backup.zip', { type: 'application/zip' }),
      );
    });
    act(() => result.current.setPassword('wrong-password'));
    mocks.restoreImportedBackup.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
    });

    await act(async () => result.current.confirmAction());

    expect(result.current.passwordError).toBe(labels.backupsPasswordInvalid);
    expect(mocks.toast.error).not.toHaveBeenCalled();

    act(() => result.current.setPassword('corrected-password'));
    expect(result.current.passwordError).toBeNull();
  });
});
