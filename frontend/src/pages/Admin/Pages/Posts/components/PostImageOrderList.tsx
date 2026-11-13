import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { IoMdAdd, IoMdClose } from 'react-icons/io';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import {
  mediaFileAbsoluteUrl,
  mediaImageAbsoluteUrl,
} from '../../../../../shared/api/mediaApi';
import type { PostMedia } from '../../../../../shared/api/postsApi';
import { usePointerReorder } from '../../../../../shared/hooks/usePointerReorder';
import { MAX_POST_MEDIA, POST_MEDIA_ACCEPT } from '../utils/postMedia';
import { usePostImageOrderSelection } from '../hooks/usePostImageOrderSelection';
import { seekVideoToPreviewFrame } from '../../../../../shared/lib/videoPreview';
import styles from './PostComposerDialog.module.css';

export type PostImageOrderListProps = {
  media: PostMedia[];
  onReorder: (media: PostMedia[]) => void;
  onRemove: (mediaId: string) => void;
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

function getMediaId(item: PostMedia): string {
  return item.type === 'image' ? item.imageId : item.fileId;
}

/** Step-2 / edit-form media preview + strip — no wizard step dependency. */
export default function PostImageOrderList({
  media,
  onReorder,
  onRemove,
  onAddFiles,
  labels,
  disabled = false,
}: PostImageOrderListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const mediaIds = useMemo(() => media.map(getMediaId), [media]);
  const { trackRef, index, goTo } = usePostImageOrderSelection(mediaIds);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const selectedImage = media[index] ?? media[0] ?? null;

  const { draggingId, dragPoint, onPointerDown, dataAttribute } =
    usePointerReorder({
      items: media,
      getId: getMediaId,
      onReorder,
      onTap: (id) => {
        const target = media.findIndex((item) => getMediaId(item) === id);
        if (target >= 0) {
          goTo(target);
        }
      },
      disabled,
      holdMs: 450,
      axis: 'x',
      scrollContainerRef: stripRef,
    });

  const draggingMedia =
    media.find((item) => getMediaId(item) === draggingId) ?? null;
  const canAdd = !disabled && media.length < MAX_POST_MEDIA;
  const canRemove = !disabled && media.length > 1;
  const pendingRemoveImage = pendingRemoveId
    ? (media.find((item) => getMediaId(item) === pendingRemoveId) ?? null)
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
  }, [draggingId, mediaIds, index]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) {
      onAddFiles(files);
    }
  };

  return (
    <div className={styles.orderStage}>
      {media.length > 0 ? (
        <div className={styles.orderMain}>
          <div
            ref={trackRef}
            className={styles.orderTrack}
            role="group"
            aria-roledescription="carousel"
            aria-label={labels.carouselAria}
          >
            {media.map((item) => (
              <div key={getMediaId(item)} className={styles.orderSlide}>
                {item.type === 'image' ? (
                  <img
                    className={styles.orderMainImage}
                    src={mediaImageAbsoluteUrl(item.imageId, 'display')}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <video
                    className={`${styles.orderMainImage} ${styles.orderMainVideo}`}
                    src={mediaFileAbsoluteUrl(`/api/v1/media/files/${item.fileId}`)}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) =>
                      seekVideoToPreviewFrame(event.currentTarget)
                    }
                  />
                )}
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
                  setPendingRemoveId(getMediaId(selectedImage));
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
          {media.map((item, thumbIndex) => {
            const mediaId = getMediaId(item);
            const isSelected = thumbIndex === index;
            const isDragging = draggingId === mediaId;
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
                key={mediaId}
                className={itemClass}
                {...{ [dataAttribute]: mediaId }}
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
                  onPointerDown={(event) => onPointerDown(mediaId, event)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return;
                    }
                    event.preventDefault();
                    goTo(thumbIndex);
                  }}
                >
                  {item.type === 'image' ? (
                    <img
                      className={styles.orderThumb}
                      src={mediaImageAbsoluteUrl(item.imageId, 'thumb')}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <video
                      className={styles.orderThumb}
                      src={mediaFileAbsoluteUrl(`/api/v1/media/files/${item.fileId}`)}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(event) =>
                        seekVideoToPreviewFrame(event.currentTarget)
                      }
                    />
                  )}
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
            accept={POST_MEDIA_ACCEPT}
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

      {draggingMedia && dragPoint
        ? createPortal(
            draggingMedia.type === 'image' ? (
              <img
                className={styles.dragPreview}
                style={{ left: dragPoint.x, top: dragPoint.y }}
                src={mediaImageAbsoluteUrl(draggingMedia.imageId, 'thumb')}
                alt=""
                aria-hidden
                draggable={false}
              />
            ) : (
              <video
                className={styles.dragPreview}
                style={{ left: dragPoint.x, top: dragPoint.y }}
                src={mediaFileAbsoluteUrl(
                  `/api/v1/media/files/${draggingMedia.fileId}`,
                )}
                muted
                playsInline
                aria-hidden
              />
            ),
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
                  onRemove(getMediaId(pendingRemoveImage));
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
