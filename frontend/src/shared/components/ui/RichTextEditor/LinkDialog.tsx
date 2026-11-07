import Button from '../Button/Button';
import Dialog from '../Dialog/Dialog';
import InputField from '../InputField/InputField';
import type { RichTextEditorLabels } from './types';
import styles from './RichTextEditor.module.css';

export type LinkDialogProps = {
  isOpen: boolean;
  labels: RichTextEditorLabels;
  url: string;
  error: boolean;
  onUrlChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
};

export default function LinkDialog({
  isOpen,
  labels,
  url,
  error,
  onUrlChange,
  onClose,
  onApply,
}: LinkDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      title={labels.link}
      onClose={onClose}
      closeLabel={labels.closeDialog}
      size="sm"
      className={`cms-theme ${styles.linkDialog}`}
      showFooterDivider={false}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {labels.linkCancel}
          </Button>
          <Button type="button" variant="primary" onClick={onApply}>
            {labels.linkApply}
          </Button>
        </>
      }
    >
      <InputField
        label={labels.linkUrl}
        value={url}
        onChange={onUrlChange}
        type="url"
        autoFocus
        error={error}
        errorMessage={error ? labels.linkInvalidUrl : undefined}
      />
    </Dialog>
  );
}
