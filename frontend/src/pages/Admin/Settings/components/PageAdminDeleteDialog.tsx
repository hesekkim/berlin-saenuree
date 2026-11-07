import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import type { AdminTranslations } from '../../translations';
import styles from '../Settings.module.css';

type PageAdminDeleteDialogProps = {
  labels: AdminTranslations;
  email: string | null;
  isRevoke: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function PageAdminDeleteDialog({
  labels,
  email,
  isRevoke,
  onClose,
  onConfirm,
}: PageAdminDeleteDialogProps) {
  const title = isRevoke ? labels.emailsRevokeTitle : labels.emailsDeleteTitle;
  const actionLabel = isRevoke
    ? labels.emailsRevokeConfirmAction
    : labels.emailsDeleteConfirmAction;
  const template = isRevoke
    ? labels.emailsRevokeConfirm
    : labels.emailsDeleteConfirm;
  const message = email ? template.replaceAll('{email}', email) : '';

  return (
    <Dialog
      isOpen={email !== null}
      title={title}
      onClose={onClose}
      closeLabel={labels.dialogCloseLabel}
      className="cms-theme"
      showFooterDivider={false}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {labels.emailsCancel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <p className={styles.confirmMessage}>{message}</p>
    </Dialog>
  );
}
