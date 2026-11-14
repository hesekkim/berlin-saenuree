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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isValidatingImport, setIsValidatingImport] = useState(false);
  const operationAbortControllerRef = useRef<AbortController | null>(null);

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
      operationAbortControllerRef.current?.abort();
    },
    [],
  );

  const handleCreate = async () => {
    const controller = new AbortController();
    operationAbortControllerRef.current = controller;
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
      if (operationAbortControllerRef.current === controller) {
        operationAbortControllerRef.current = null;
      }
      setBusyAction(null);
    }
  };

  const cancelCreate = () => {
    operationAbortControllerRef.current?.abort();
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
    const controller = new AbortController();
    operationAbortControllerRef.current = controller;
    setBusyAction('import');
    setUploadProgress(0);
    setIsValidatingImport(false);
    try {
      const preview = await stageBackupImport(
        file,
        controller.signal,
        (loaded, total) => {
          if (total && loaded >= total) {
            setUploadProgress(null);
            setIsValidatingImport(true);
          } else if (total) {
            setUploadProgress(Math.round((loaded / total) * 100));
          }
        },
      );
      setPendingAction({ kind: 'restore-import', preview });
      setPassword('');
      setPasswordError(null);
    } catch (error) {
      if (!axios.isCancel(error)) {
        toast.error(labels.backupsImportFailed);
      }
    } finally {
      if (operationAbortControllerRef.current === controller) {
        operationAbortControllerRef.current = null;
      }
      setBusyAction(null);
      setUploadProgress(null);
      setIsValidatingImport(false);
    }
  };

  const cancelImport = () => {
    operationAbortControllerRef.current?.abort();
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
    const action = pendingAction;
    if (!action || !password) {
      return;
    }
    setBusyAction('confirm');
    try {
      if (action.kind === 'delete') {
        await deleteBackup(action.backup.id, password);
        setBackupList((current) =>
          current
            ? {
                ...current,
                backups: current.backups.filter(
                  (backup) => backup.id !== action.backup.id,
                ),
              }
            : current,
        );
        toast.info(labels.backupsDeleteSuccess);
      } else if (action.kind === 'restore-backup') {
        await restoreBackup(action.backup.id, password);
        toast.info(labels.backupsRestoreSuccess);
      } else {
        await restoreImportedBackup(action.preview.importId, password);
        toast.info(labels.backupsRestoreSuccess);
      }
      setPendingAction(null);
      setPassword('');
      setPasswordError(null);
      if (action.kind !== 'delete') {
        await loadBackups();
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setPasswordError(labels.backupsPasswordInvalid);
      } else {
        toast.error(
          action.kind === 'delete'
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
    uploadProgress,
    isValidatingImport,
    setPassword: handlePasswordChange,
    canConfirm: Boolean(password) && busyAction !== 'confirm',
    loadBackups,
    handleCreate,
    cancelCreate,
    cancelImport,
    handleDownload,
    handleImportFile,
    openAction,
    closeAction,
    confirmAction,
  };
}
