import { useState } from 'react';
import Button from '../Button/Button';
import styles from './Upload.module.css';
import UploadDropIcon from './UploadDropIcon';
import { useUpload, type UploadItem } from './useUpload';
import {
  formatAcceptLabels,
  formatBytes,
  formatMaxSizeLabel,
} from './uploadValidation';
import {
  downloadMediaFile,
  type MediaFileResponse,
} from '../../../api/mediaApi';
import { seekVideoToPreviewFrame } from '../../../lib/videoPreview';

export type UploadLabels = {
  /** Lead text including conjunction, e.g. "Drag and drop files here, or". */
  dropHint: string;
  chooseFile: string;
  supportedFormats: string;
  /** Short label for narrow viewports (e.g. Formats). */
  supportedFormatsShort: string;
  maximumSize: string;
  /** Short label for narrow viewports (e.g. Max). */
  maximumSizeShort: string;
  remove: string;
  download: string;
  upload: string;
  retry: string;
  uploading: string;
  uploaded: string;
  typeNotAllowed: string;
  sizeExceeded: string;
  uploadFailed: string;
  unauthorized: string;
  downloadFailed: string;
};

const DEFAULT_LABELS: UploadLabels = {
  dropHint: 'Drag and drop files here, or',
  chooseFile: 'Choose file',
  supportedFormats: 'Supported formats',
  supportedFormatsShort: 'Formats',
  maximumSize: 'Maximum size',
  maximumSizeShort: 'Max',
  remove: 'Remove',
  download: 'Download',
  upload: 'Upload',
  retry: 'Retry upload',
  uploading: 'Uploading…',
  uploaded: 'Uploaded',
  typeNotAllowed: 'This file type is not allowed',
  sizeExceeded: 'This file exceeds the size limit',
  uploadFailed: 'Upload failed',
  unauthorized: 'Site admin login required',
  downloadFailed: 'Download failed',
};

export interface UploadProps {
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  autoUpload?: boolean;
  /** Already-uploaded files to show on mount (form edit). */
  defaultFiles?: MediaFileResponse[];
  /** Skip DELETE when replacing/removing defaultFiles (caller owns lifecycle). */
  retainDefaultRemotes?: boolean;
  /** After upload succeeds, skip DELETE on remove (caller owns lifecycle). */
  retainUploadedRemotes?: boolean;
  /** Keep Posts video uploads protected while the editor session is active. */
  leaseVideoUploads?: boolean;
  onUploaded?: (
    files: MediaFileResponse[],
    items: UploadItem[],
  ) => void | Promise<void>;
  onItemsChange?: (items: UploadItem[]) => void;
  maxSizeBytesForFile?: (file: File) => number;
  labels?: Partial<UploadLabels>;
  className?: string;
}

function displayName(item: UploadItem): string {
  return item.uploaded?.originalName || item.file.name;
}

function displaySize(item: UploadItem): number {
  return item.uploaded?.sizeBytes ?? item.file.size;
}

function errorMessage(item: UploadItem, labels: UploadLabels): string | null {
  switch (item.errorCode) {
    case 'type_not_allowed':
      return labels.typeNotAllowed;
    case 'size_exceeded':
      return labels.sizeExceeded;
    case 'upload_failed':
      return labels.uploadFailed;
    case 'unauthorized':
      return labels.unauthorized;
    case 'download_failed':
      return labels.downloadFailed;
    default:
      return null;
  }
}

export default function Upload({
  accept,
  maxSizeBytes,
  maxSizeBytesForFile,
  multiple = false,
  disabled = false,
  autoUpload = true,
  defaultFiles,
  retainDefaultRemotes = false,
  retainUploadedRemotes = false,
  leaseVideoUploads = false,
  onUploaded,
  onItemsChange,
  labels: labelsProp,
  className = '',
}: UploadProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const {
    inputId,
    inputRef,
    dropzoneRef,
    items,
    isDragging,
    isUploading,
    openFilePicker,
    handleInputChange,
    removeItem,
    retryUpload,
    setItemDownloadError,
  } = useUpload({
    accept,
    maxSizeBytes,
    maxSizeBytesForFile,
    multiple,
    disabled,
    autoUpload,
    defaultFiles,
    retainDefaultRemotes,
    retainUploadedRemotes,
    leaseVideoUploads,
    onUploaded,
    onItemsChange,
  });

  const hasRetryable = items.some((item) => item.errorCode === 'upload_failed');
  const hasPending = items.some((item) => item.status === 'pending');
  const showUploadAction = hasRetryable || (!autoUpload && hasPending);

  const formatLabels = formatAcceptLabels(accept);
  const maxSizeText = formatMaxSizeLabel(maxSizeBytes);
  const showConstraints = formatLabels.length > 0 || maxSizeText != null;
  const formatsValue = formatLabels.join(', ');

  const handleDownload = async (item: UploadItem) => {
    if (!item.uploaded) {
      return;
    }
    setDownloadingId(item.uploaded.id);
    setItemDownloadError(item.key, false);
    try {
      await downloadMediaFile(item.uploaded);
    } catch {
      setItemDownloadError(item.key, true);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        className={styles.input}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
      />

      <div
        ref={dropzoneRef}
        className={[
          styles.dropzone,
          disabled ? styles['dropzone--disabled'] : '',
          isDragging ? styles['dropzone--active'] : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <UploadDropIcon className={styles.dropIcon} />
        <p className={styles.hint}>
          <span>{labels.dropHint}</span>{' '}
          <button
            type="button"
            className={styles.chooseFile}
            disabled={disabled || isUploading}
            onClick={openFilePicker}
          >
            {labels.chooseFile}
          </button>
        </p>
      </div>

      {showConstraints ? (
        <div className={styles.constraints}>
          {formatLabels.length > 0 ? (
            <p className={styles.constraintsFormats}>
              <span className={styles.constraintsLabelFull}>
                {labels.supportedFormats}:
              </span>
              <span className={styles.constraintsLabelShort}>
                {labels.supportedFormatsShort}:
              </span>{' '}
              {formatsValue}
            </p>
          ) : (
            <span className={styles.constraintsFormats} />
          )}
          {maxSizeText ? (
            <p className={styles.constraintsSize}>
              <span className={styles.constraintsLabelFull}>
                {labels.maximumSize}:
              </span>
              <span className={styles.constraintsLabelShort}>
                {labels.maximumSizeShort}:
              </span>{' '}
              {maxSizeText}
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item) => {
            const message = errorMessage(item, labels);
            const canDownload = item.status === 'uploaded' && Boolean(item.uploaded);
            const showMediaPreview = Boolean(item.previewUrl);
            return (
              <li key={item.key} className={styles.item}>
                {showMediaPreview && item.file.type === 'video/mp4' ? (
                  <video
                    src={item.previewUrl}
                    className={styles.preview}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) =>
                      seekVideoToPreviewFrame(event.currentTarget)
                    }
                  />
                ) : showMediaPreview ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className={styles.preview}
                    draggable={false}
                  />
                ) : null}
                <div className={styles.meta}>
                  <span className={styles.name}>{displayName(item)}</span>
                  <span className={styles.size}>
                    {formatBytes(displaySize(item))}
                    {item.status === 'uploading' ? ` · ${labels.uploading}` : ''}
                    {item.status === 'uploaded' ? ` · ${labels.uploaded}` : ''}
                  </span>
                  {message ? (
                    <span className={styles.error} role="alert">
                      {message}
                    </span>
                  ) : null}
                </div>
                <div className={styles.itemActions}>
                  {canDownload ? (
                    <div className={styles.downloadSlot}>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={
                          disabled ||
                          downloadingId === item.uploaded?.id ||
                          item.status === 'uploading'
                        }
                        onClick={() => {
                          void handleDownload(item);
                        }}
                      >
                        {labels.download}
                      </Button>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost-danger"
                    disabled={disabled || item.status === 'uploading'}
                    onClick={() => {
                      void removeItem(item.key);
                    }}
                  >
                    {labels.remove}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showUploadAction ? (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="primary"
            disabled={disabled || isUploading}
            onClick={retryUpload}
          >
            {hasRetryable ? labels.retry : labels.upload}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
