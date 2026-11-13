import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  fetchBackups,
  restoreBackup,
  restoreImportedBackup,
  stageBackupImport,
  type BackupListResponse,
  type BackupSummary,
  type ImportPreview,
} from '../../../../shared/api/backupsApi';
import axios from 'axios';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import type { AdminTranslations } from '../../translations';

type PendingAction =
  | { kind: 'restore-backup'; backup: BackupSummary }
  | { kind: 'delete'; backup: BackupSummary }
  | { kind: 'restore-import'; preview: ImportPreview };

export function useBackups(labels: AdminTranslations) {
  const toast = useToast();
  const [backupList, setBackupList] = useState<BackupListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const createAbortControllerRef = useRef<AbortController | null>(null);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordError(null);
  };

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      setBackupList(await fetchBackups());
    } catch {
      toast.error(labels.backupsLoadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [labels.backupsLoadFailed, toast]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  useEffect(
    () => () => {
      createAbortControllerRef.current?.abort();
    },
    [],
  );

  const handleCreate = async () => {
    const controller = new AbortController();
    createAbortControllerRef.current = controller;
    setBusyAction('create');
    try {
      await createBackup(controller.signal);
      toast.info(labels.backupsCreateSuccess);
      await loadBackups();
    } catch (error) {
      if (!axios.isCancel(error)) {
        toast.error(labels.backupsCreateFailed);
      }
    } finally {
      if (createAbortControllerRef.current === controller) {
        createAbortControllerRef.current = null;
      }
      setBusyAction(null);
    }
  };

  const cancelCreate = () => {
    createAbortControllerRef.current?.abort();
  };

  const handleDownload = async (backup: BackupSummary) => {
    setBusyAction(`download:${backup.id}`);
    try {
      const blob = await downloadBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${backup.id}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(labels.backupsDownloadFailed);
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setBusyAction('import');
    try {
      const preview = await stageBackupImport(file);
      setPendingAction({ kind: 'restore-import', preview });
      setPassword('');
      setPasswordError(null);
    } catch {
      toast.error(labels.backupsImportFailed);
    } finally {
      setBusyAction(null);
    }
  };

  const openAction = (action: PendingAction) => {
    setPendingAction(action);
    setPassword('');
    setPasswordError(null);
  };

  const closeAction = () => {
    if (busyAction) {
      return;
    }
    setPendingAction(null);
    setPassword('');
    setPasswordError(null);
  };

  const confirmAction = async () => {
    if (!pendingAction || !password) {
      return;
    }
    setBusyAction('confirm');
    try {
      if (pendingAction.kind === 'delete') {
        await deleteBackup(pendingAction.backup.id, password);
        toast.info(labels.backupsDeleteSuccess);
      } else if (pendingAction.kind === 'restore-backup') {
        await restoreBackup(pendingAction.backup.id, password);
        toast.info(labels.backupsRestoreSuccess);
      } else {
        await restoreImportedBackup(
          pendingAction.preview.importId,
          password,
        );
        toast.info(labels.backupsRestoreSuccess);
      }
      setPendingAction(null);
      setPassword('');
      setPasswordError(null);
      await loadBackups();
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setPasswordError(labels.backupsPasswordInvalid);
      } else {
        toast.error(
          pendingAction.kind === 'delete'
            ? labels.backupsDeleteFailed
            : labels.backupsRestoreFailed,
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  return {
    backups: backupList?.backups ?? [],
    maxBackups: backupList?.maxBackups ?? 12,
    isLoading,
    busyAction,
    pendingAction,
    password,
    passwordError,
    setPassword: handlePasswordChange,
    canConfirm: Boolean(password) && busyAction !== 'confirm',
    loadBackups,
    handleCreate,
    cancelCreate,
    handleDownload,
    handleImportFile,
    openAction,
    closeAction,
    confirmAction,
  };
}
