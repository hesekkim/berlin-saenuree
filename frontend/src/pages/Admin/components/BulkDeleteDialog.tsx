import Button from '../../../shared/components/ui/Button/Button';
import Dialog from '../../../shared/components/ui/Dialog/Dialog';

type Props = {
  isOpen: boolean;
  isBusy: boolean;
  title: string;
  message: string;
  closeLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function BulkDeleteDialog({
  isOpen,
  isBusy,
  title,
  message,
  closeLabel,
  cancelLabel,
  confirmLabel,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      size="sm"
      className="cms-theme"
      showFooterDivider={false}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}
