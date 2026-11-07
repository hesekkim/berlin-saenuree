import { useState } from 'react';
import Button from '../Button/Button';
import { downloadMediaFile } from '../../../api/mediaApi';
import type { RichTextEditorLabels } from '../RichTextEditor/types';
import { formatBytes } from '../Upload/uploadValidation';
import styles from './RichTextEditorEX.module.css';

type AttachmentCardProps = {
  mediaId: string;
  name: string;
  sizeBytes: number | null;
  labels: RichTextEditorLabels;
  disabled?: boolean;
  onRemove: () => void;
};

export default function AttachmentCard({
  mediaId,
  name,
  sizeBytes,
  labels,
  disabled = false,
  onRemove,
}: AttachmentCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadFailed(false);
    try {
      await downloadMediaFile({ id: mediaId, originalName: name });
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className={styles.mediaItem}>
      <span className={styles.mediaMeta}>
        <span className={styles.mediaName} title={name}>
          {name || labels.attachmentFallbackName}
        </span>
        {sizeBytes !== null ? (
          <span className={styles.mediaSize}>{formatBytes(sizeBytes)}</span>
        ) : null}
        {downloadFailed ? (
          <span className={styles.mediaError} role="alert">
            {labels.attachmentDownloadFailed}
          </span>
        ) : null}
      </span>
      <span className={styles.mediaActions}>
        <Button
          type="button"
          variant="ghost"
          disabled={downloading}
          onClick={() => {
            void handleDownload();
          }}
        >
          {labels.attachmentDownload}
        </Button>
        <Button
          type="button"
          variant="ghost-danger"
          disabled={disabled || downloading}
          onClick={onRemove}
        >
          {labels.attachmentRemove}
        </Button>
      </span>
    </span>
  );
}
