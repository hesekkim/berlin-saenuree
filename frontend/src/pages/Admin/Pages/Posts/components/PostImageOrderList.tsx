import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { IoMdAdd, IoMdClose } from 'react-icons/io';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import { mediaImageAbsoluteUrl } from '../../../../../shared/api/mediaApi';
import type { PostImage } from '../../../../../shared/api/postsApi';
import { usePointerReorder } from '../../../../../shared/hooks/usePointerReorder';
import { IMAGE_ACCEPT, MAX_POST_IMAGES } from '../hooks/usePostComposer';
import { usePostImageOrderSelection } from '../hooks/usePostImageOrderSelection';
import styles from './PostComposerDialog.module.css';

export type PostImageOrderListProps = {
  images: PostImage[];
  onReorder: (images: PostImage[]) => void;
  onRemove: (imageId: string) => void;
  onAddFiles: (files: File[]) => void;
  labels: {
    removeAria: string;
    addAria: string;
    /** Contains `{index}` for the 1-based thumb position. */
    selectAria: string;
    carouselAria: string;
    removeTitle: string;
    removeConfirm: string;
    removeConfirmAction: string;
    cancel: string;
    dialogClose: string;
  };
  disabled?: boolean;
};

function getImageId(image: PostImage): string {
  return image.imageId;
}

/** Step-2 / edit-form image preview + strip — no wizard step dependency. */
export default function PostImageOrderList({
  images,
  onReorder,
  onRemove,
  onAddFiles,
  labels,
  disabled = false,
}: PostImageOrderListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const imageIds = useMemo(() => images.map(getImageId), [images]);
  const { trackRef, index, goTo } = usePostImageOrderSelection(imageIds);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const selectedImage = images[index] ?? images[0] ?? null;

  const { draggingId, dragPoint, onPointerDown, dataAttribute } =
    usePointerReorder({
      items: images,
      getId: getImageId,
      onReorder,
      onTap: (id) => {
        const target = images.findIndex((image) => image.imageId === id);
        if (target >= 0) {
          goTo(target);
        }
      },
      disabled,
      holdMs: 450,
      axis: 'x',
      scrollContainerRef: stripRef,
    });

  const draggingImage =
    images.find((image) => image.imageId === draggingId) ?? null;
  const canAdd = !disabled && images.length < MAX_POST_IMAGES;
  const canRemove = !disabled && images.length > 1;
  const pendingRemoveImage = pendingRemoveId
    ? (images.find((image) => image.imageId === pendingRemoveId) ?? null)
    : null;

  // Reveal the selected thumb without re-centering, so the strip never
  // scrolls back and forth on a long jump. While dragging, the strip is
  // driven by edge auto-scroll instead.
  useEffect(() => {
    const strip = stripRef.current;
    const item = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !item || draggingId !== null) {
      return;
    }
    const stripRect = strip.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const margin = 8;
    const overflowLeft = itemRect.left - stripRect.left - margin;
    const overflowRight = itemRect.right - stripRect.right + margin;
    if (overflowLeft < 0) {
      strip.scrollLeft += overflowLeft;
    } else if (overflowRight > 0) {
      strip.scrollLeft += overflowRight;
    }
  }, [draggingId, imageIds, index]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) {
      onAddFiles(files);
    }
  };

  return (
    <div className={styles.orderStage}>
      {images.length > 0 ? (
        <div className={styles.orderMain}>
          <div
            ref={trackRef}
            className={styles.orderTrack}
            role="group"
            aria-roledescription="carousel"
            aria-label={labels.carouselAria}
          >
            {images.map((image) => (
              <div key={image.imageId} className={styles.orderSlide}>
                <img
                  className={styles.orderMainImage}
                  src={mediaImageAbsoluteUrl(image.imageId, 'display')}
                  alt=""
                  draggable={false}
                />
              </div>
            ))}
          </div>
          {selectedImage ? (
            <button
              type="button"
              className={styles.orderMainRemove}
              disabled={!canRemove}
              aria-label={labels.removeAria}
              onClick={() => {
                if (canRemove) {
                  setPendingRemoveId(selectedImage.imageId);
                }
              }}
            >
              <IoMdClose aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.orderStripRow}>
        <ul ref={stripRef} className={styles.orderList}>
          {images.map((image, thumbIndex) => {
            const isSelected = thumbIndex === index;
            const isDragging = draggingId === image.imageId;
            const itemClass = [
              styles.orderItem,
              isSelected ? styles.orderItemSelected : '',
              isDragging ? styles.orderItemDragging : '',
              disabled ? styles.orderItemDisabled : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li
                key={image.imageId}
                className={itemClass}
                {...{ [dataAttribute]: image.imageId }}
              >
                <button
                  type="button"
                  className={styles.orderHandle}
                  disabled={disabled}
                  aria-label={labels.selectAria.replace(
                    '{index}',
                    String(thumbIndex + 1),
                  )}
                  aria-current={isSelected ? 'true' : undefined}
                  onPointerDown={(event) => onPointerDown(image.imageId, event)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return;
                    }
                    event.preventDefault();
                    goTo(thumbIndex);
                  }}
                >
                  <img
                    className={styles.orderThumb}
                    src={mediaImageAbsoluteUrl(image.imageId, 'thumb')}
                    alt=""
                    draggable={false}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.orderAddWrap}>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.hiddenFileInput}
            accept={IMAGE_ACCEPT}
            multiple
            disabled={!canAdd}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={styles.orderAdd}
            disabled={!canAdd}
            aria-label={labels.addAria}
            onClick={() => fileInputRef.current?.click()}
          >
            <IoMdAdd aria-hidden />
          </button>
        </div>
      </div>

      {draggingImage && dragPoint
        ? createPortal(
            <img
              className={styles.dragPreview}
              style={{ left: dragPoint.x, top: dragPoint.y }}
              src={mediaImageAbsoluteUrl(draggingImage.imageId, 'thumb')}
              alt=""
              aria-hidden
              draggable={false}
            />,
            document.body,
          )
        : null}

      <Dialog
        isOpen={pendingRemoveImage !== null}
        title={labels.removeTitle}
        onClose={() => setPendingRemoveId(null)}
        closeLabel={labels.dialogClose}
        size="sm"
        showFooterDivider={false}
        className="cms-theme"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingRemoveId(null)}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (pendingRemoveImage && canRemove) {
                  onRemove(pendingRemoveImage.imageId);
                }
                setPendingRemoveId(null);
              }}
            >
              {labels.removeConfirmAction}
            </Button>
          </>
        }
      >
        <p className={styles.confirmMessage}>{labels.removeConfirm}</p>
      </Dialog>
    </div>
  );
}
