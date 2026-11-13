import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import { FiDownload, FiTrash2 } from 'react-icons/fi';
import type { AdminTranslations } from '../../translations';
import { useBackups } from '../hooks/useBackups';
import styles from './BackupSection.module.css';

type BackupSectionProps = {
  labels: AdminTranslations;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function BackupSection({ labels }: BackupSectionProps) {
  const {
    backups,
    maxBackups,
    isLoading,
    busyAction,
    pendingAction,
    password,
    passwordError,
    setPassword,
    canConfirm,
    handleCreate,
    cancelCreate,
    handleDownload,
    handleImportFile,
    openAction,
    closeAction,
    confirmAction,
  } = useBackups(labels);
  const pendingImport =
    pendingAction?.kind === 'restore-import' ? pendingAction.preview : null;
  const isDelete = pendingAction?.kind === 'delete';
  const title = isDelete
    ? labels.backupsDeleteTitle
    : labels.backupsRestoreTitle;
  const pendingDate = pendingImport?.createdAt ??
    (pendingAction && pendingAction.kind !== 'restore-import'
      ? pendingAction.backup.createdAt
      : '');
  const kindLabels = {
    automatic: labels.backupsAutomatic,
    manual: labels.backupsManual,
    pre_restore: labels.backupsPreRestore,
  };

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>
              {labels.backupsSectionTitle}
            </h1>
            <p className={styles.description}>{labels.backupsSectionDesc}</p>
          </div>
          <div className={styles.headerActions}>
            {busyAction === 'create' ? (
              <div className={styles.createProgress}>
                <LoadingSpinner
                  size="small"
                  text={labels.backupsCreating}
                  inline
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelCreate}
                >
                  {labels.backupsCancel}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCreate()}
              >
                {labels.backupsCreate}
              </Button>
            )}
            <label
              className={[
                styles.uploadButton,
                busyAction ? styles.uploadButtonDisabled : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>
                {busyAction === 'import'
                  ? labels.backupsLoading
                  : labels.backupsImport}
              </span>
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={Boolean(busyAction)}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void handleImportFile(file);
                }}
              />
            </label>
          </div>
        </div>
        <p className={styles.warning}>{labels.backupsStorageWarning}</p>
        {isLoading ? (
          <p className={styles.emptyMessage}>{labels.backupsLoading}</p>
        ) : backups.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyMessage}>{labels.backupsEmpty}</p>
          </div>
        ) : (
          <ul className={styles.backupList} aria-label={labels.backupsSectionTitle}>
            {backups.map((backup) => (
              <li className={styles.backupRow} key={backup.id}>
                <div className={styles.backupInfo}>
                  <strong className={styles.backupDate}>
                    {formatDate(backup.createdAt)}
                  </strong>
                  <span className={styles.backupMeta}>
                    {kindLabels[backup.kind]} · {formatBytes(backup.sizeBytes)}
                  </span>
                  {!backup.isValid ? (
                    <span className={styles.invalidLabel}>
                      {labels.backupsInvalid}
                    </span>
                  ) : null}
                </div>
                <div className={styles.rowActions}>
                  <div className={styles.utilityActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      disabled={Boolean(busyAction)}
                      aria-label={
                        busyAction === `download:${backup.id}`
                          ? labels.backupsLoading
                          : labels.backupsDownload
                      }
                      title={labels.backupsDownload}
                      onClick={() => void handleDownload(backup)}
                    >
                      <FiDownload aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteButton}`}
                      disabled={Boolean(busyAction)}
                      aria-label={labels.backupsDelete}
                      title={labels.backupsDelete}
                      onClick={() => openAction({ kind: 'delete', backup })}
                    >
                      <FiTrash2 aria-hidden />
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busyAction) || !backup.isValid}
                    onClick={() =>
                      openAction({ kind: 'restore-backup', backup })
                    }
                  >
                    {labels.backupsRestore}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {backups.length > 0 ? (
          <p className={styles.retention}>
            {labels.backupsRetention.replaceAll(
              '{count}',
              String(maxBackups),
            )}
          </p>
        ) : null}
      </section>

      <Dialog
        isOpen={pendingAction !== null}
        title={pendingImport ? labels.backupsImportTitle : title}
        onClose={closeAction}
        closeLabel={labels.dialogCloseLabel}
        className={styles.restoreDialog}
        closeOnOverlayClick={!busyAction}
        closeOnEscape={!busyAction}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busyAction)}
              onClick={closeAction}
            >
              {labels.backupsCancel}
            </Button>
            <Button
              type="button"
              variant={isDelete ? 'danger' : 'primary'}
              disabled={!canConfirm}
              onClick={() => void confirmAction()}
            >
              {busyAction === 'confirm'
                ? labels.backupsLoading
                : labels.backupsConfirm}
            </Button>
          </>
        }
      >
        {pendingAction ? (
          <div className={styles.dialogContent}>
            {isDelete ? (
              <p>{labels.backupsDeleteConfirm.replaceAll(
                '{date}',
                formatDate(pendingDate),
              )}</p>
            ) : (
              <strong className={styles.restoreConfirm}>
                {labels.backupsRestoreConfirm.replaceAll(
                  '{date}',
                  formatDate(pendingDate),
                )}
              </strong>
            )}
            {pendingImport ? (
              <dl className={styles.previewDetails}>
                <div>
                  <dt>{labels.backupsCreatedAt}</dt>
                  <dd>{formatDate(pendingImport.createdAt)}</dd>
                </div>
                <div>
                  <dt>{labels.backupsSiteId}</dt>
                  <dd>{pendingImport.siteId}</dd>
                </div>
                <div>
                  <dt>{labels.backupsImportFileCount}</dt>
                  <dd>{pendingImport.fileCount}</dd>
                </div>
                <div>
                  <dt>{labels.backupsImportExpandedSize}</dt>
                  <dd>{formatBytes(pendingImport.expandedSizeBytes)}</dd>
                </div>
              </dl>
            ) : null}
            {!isDelete ? (
              <p className={styles.restoreSafety}>{labels.backupsRestoreSafety}</p>
            ) : null}
            <InputField
              id="backup-password"
              label={labels.backupsPasswordLabel}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              error={Boolean(passwordError)}
              errorMessage={passwordError ?? undefined}
            />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
