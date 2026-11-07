import type { ReactNode } from 'react';
import Button from '../Button/Button';
import Dialog from '../Dialog/Dialog';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  closeLabel: string;
  cancelLabel: string;
  confirmLabel: string;
};

export default function ConfirmDialog({
  isOpen,
  title,
  children,
  onClose,
  onConfirm,
  closeLabel,
  cancelLabel,
  confirmLabel,
}: ConfirmDialogProps) {
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
          <Button type="button" variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
