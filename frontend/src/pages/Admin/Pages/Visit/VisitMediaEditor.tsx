import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import Upload, {
  type UploadLabels,
} from '../../../../shared/components/ui/Upload/Upload';
import {
  mediaImageAbsoluteUrl,
  type MediaFileResponse,
} from '../../../../shared/api/mediaApi';
import {
  reorderById,
  usePointerReorder,
} from '../../../../shared/hooks/usePointerReorder';
import type { UploadItem } from '../../../../shared/components/ui/Upload/useUpload';
import type { VisitImage } from '../../../../shared/content/visitContent';
import editorStyles from './VisitPageEditor.module.css';
import styles from './VisitMediaEditor.module.css';

type VisitMediaEditorProps = {
  title: string;
  hint: string;
  images: VisitImage[];
  disabled: boolean;
  uploadKey: string;
  removeImageLabel: string;
  removeImageConfirmTitle: string;
  removeImageConfirmMessage: string;
  cancelLabel: string;
  confirmRemoveImageLabel: string;
  closeLabel: string;
  selectImageLabel: string;
  reorderHint: string;
  imageMovedLabel: string;
  uploadLabels: Partial<UploadLabels>;
  onUploaded: (files: MediaFileResponse[]) => void;
  onItemsChange: (items: UploadItem[]) => void;
  onRemove: (imageId: string) => void;
  onReorder: (images: VisitImage[]) => void;
};

function getImageId(image: VisitImage): string {
  return image.imageId;
}

export default function VisitMediaEditor({
  title,
  hint,
  images,
  disabled,
  uploadKey,
  removeImageLabel,
  removeImageConfirmTitle,
  removeImageConfirmMessage,
  cancelLabel,
  confirmRemoveImageLabel,
  closeLabel,
  selectImageLabel,
  reorderHint,
  imageMovedLabel,
  uploadLabels,
  onUploaded,
  onItemsChange,
  onRemove,
  onReorder,
}: VisitMediaEditorProps) {
  const stripRef = useRef<HTMLOListElement>(null);
  const reorderHintId = useId();
  const [announcement, setAnnouncement] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<{
    imageId: string;
    index: number;
  } | null>(null);
  const { draggingId, dragPoint, onPointerDown, dataAttribute } = usePointerReorder({
    items: images,
    getId: getImageId,
    onReorder,
    disabled,
    holdMs: 450,
    axis: 'x',
    scrollOnHoldCancel: true,
    scrollContainerRef: stripRef,
  });

  const handleReorderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    imageId: string,
    currentIndex: number,
  ) => {
    let targetIndex = currentIndex;
    if (event.key === 'ArrowLeft') {
      targetIndex = Math.max(0, currentIndex - 1);
    } else if (event.key === 'ArrowRight') {
      targetIndex = Math.min(images.length - 1, currentIndex + 1);
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = images.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    if (targetIndex === currentIndex) {
      return;
    }
    onReorder(
      reorderById(images, getImageId, imageId, images[targetIndex].imageId),
    );
    setAnnouncement(
      imageMovedLabel
        .replace('{image}', String(currentIndex + 1))
        .replace('{position}', String(targetIndex + 1)),
    );
  };

  return (
    <section className={styles.mediaGroup}>
      <h3>{title}</h3>
      <p className={styles.mediaHint}>{hint}</p>
      <Upload
        key={uploadKey}
        multiple
        accept="image/jpeg,image/png,image/webp"
        maxSizeBytes={10 * 1024 * 1024}
        disabled={disabled}
        retainUploadedRemotes
        onUploaded={onUploaded}
        onItemsChange={onItemsChange}
        labels={uploadLabels}
      />
      {images.length > 0 ? (
        <>
          <ol ref={stripRef} className={styles.mediaList} aria-label={title}>
            {images.map((image, index) => {
              const isDragging = draggingId === image.imageId;
              return (
                <li
                  className={`${styles.mediaItem} ${
                    isDragging ? styles.mediaItemDragging : ''
                  }`}
                  key={image.imageId}
                  {...{ [dataAttribute]: image.imageId }}
                >
                  <button
                    type="button"
                    className={styles.mediaHandle}
                    aria-label={selectImageLabel.replace(
                      '{number}',
                      String(index + 1),
                    )}
                    disabled={disabled}
                    aria-describedby={reorderHintId}
                    aria-keyshortcuts="ArrowLeft ArrowRight Home End"
                    onKeyDown={(event) =>
                      handleReorderKeyDown(event, image.imageId, index)
                    }
                    onPointerDown={(event) =>
                      onPointerDown(image.imageId, event)
                    }
                  >
                    <img
                      src={mediaImageAbsoluteUrl(image.imageId, 'thumb')}
                      alt=""
                      draggable={false}
                    />
                  </button>
                  <button
                    type="button"
                    className={`${editorStyles.removeButton} ${styles.mediaRemoveButton}`}
                    aria-label={removeImageLabel.replace(
                      '{number}',
                      String(index + 1),
                    )}
                    title={removeImageLabel.replace(
                      '{number}',
                      String(index + 1),
                    )}
                    disabled={disabled}
                    onClick={() =>
                      setPendingRemoval({ imageId: image.imageId, index })
                    }
                  >
                    <FiTrash2 aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
          <span id={reorderHintId} className={styles.visuallyHidden}>
            {reorderHint}
          </span>
          <span
            className={styles.visuallyHidden}
            role="status"
            aria-live="polite"
          >
            {announcement}
          </span>
        </>
      ) : null}
      {draggingId && dragPoint
        ? createPortal(
            <img
              className={styles.dragPreview}
              style={{ left: dragPoint.x, top: dragPoint.y }}
              src={mediaImageAbsoluteUrl(draggingId, 'thumb')}
              alt=""
              aria-hidden
              draggable={false}
            />,
            document.body,
          )
        : null}
      <Dialog
        isOpen={pendingRemoval !== null}
        title={removeImageConfirmTitle}
        onClose={() => setPendingRemoval(null)}
        closeLabel={closeLabel}
        showFooterDivider={false}
        footer={
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingRemoval(null)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (pendingRemoval) {
                  onRemove(pendingRemoval.imageId);
                  setPendingRemoval(null);
                }
              }}
            >
              {confirmRemoveImageLabel}
            </Button>
          </div>
        }
      >
        <p>
          {pendingRemoval
            ? removeImageConfirmMessage.replace(
                '{number}',
                String(pendingRemoval.index + 1),
              )
            : null}
        </p>
      </Dialog>
    </section>
  );
}
