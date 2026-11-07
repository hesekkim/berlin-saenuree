import { useMemo, type KeyboardEvent } from 'react';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import { mediaImageAbsoluteUrl } from '../../../../../shared/api/mediaApi';
import type { PostResponse } from '../../../../../shared/api/postsApi';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import {
  richHtmlHasText,
  sanitizeRichHtml,
} from '../../../../../shared/lib/richText';
import type { AdminTranslations } from '../../../translations';
import { resolvePostCopy } from '../utils/resolvePostCopy';
import { usePostCarousel } from '../hooks/usePostCarousel';
import styles from './PostDetailDialog.module.css';

type PostDetailDialogProps = {
  post: PostResponse | null;
  isOpen: boolean;
  language: string;
  labels: AdminTranslations;
  canPin: boolean;
  canMutate: boolean;
  isPinning: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isTrash?: boolean;
  onRestore?: () => void;
  onPurge?: () => void;
  restoreLabel?: string;
  purgeLabel?: string;
};

function formatCreatedAt(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleString(language);
  } catch {
    return iso;
  }
}

export default function PostDetailDialog({
  post,
  isOpen,
  language,
  labels,
  canPin,
  canMutate,
  isPinning,
  onClose,
  onTogglePin,
  onEdit,
  onDelete,
  isTrash = false,
  onRestore,
  onPurge,
  restoreLabel = 'Restore',
  purgeLabel = 'Delete',
}: PostDetailDialogProps) {
  const { defaultLanguage } = useConfig();
  const images = post?.images ?? [];
  const slideCount = images.length;
  const { trackRef, index, goPrev, goNext, canGoPrev, canGoNext } =
    usePostCarousel(slideCount);

  const copy = useMemo(
    () => resolvePostCopy(post?.copies ?? {}, language, defaultLanguage),
    [defaultLanguage, language, post?.copies],
  );
  const safeCaptionHtml = useMemo(
    () => sanitizeRichHtml(copy.body),
    [copy.body],
  );
  const hasCaption = richHtmlHasText(safeCaptionHtml);
  const showControls = slideCount > 1;

  const handleCarouselKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!showControls) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    }
  };

  if (!post) {
    return null;
  }

  const positionLabel = labels.postsSlidePosition
    .replace('{current}', String(index + 1))
    .replace('{total}', String(slideCount));

  return (
    <Dialog
      isOpen={isOpen}
      title={labels.postsDetailTitle}
      onClose={onClose}
      closeLabel={labels.dialogCloseLabel}
      size="lg"
      footer={
        isTrash ? (
          <div className={styles.footer}>
            <Button type="button" variant="primary" onClick={onRestore}>
              {restoreLabel}
            </Button>
            <Button type="button" variant="danger" onClick={onPurge}>
              {purgeLabel}
            </Button>
          </div>
        ) : canPin || canMutate ? (
          <div className={styles.footer}>
            {canPin ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onTogglePin}
                disabled={isPinning}
              >
                {post.pinned ? labels.postsUnpin : labels.postsPin}
              </Button>
            ) : null}
            {canMutate ? (
              <>
                <Button type="button" variant="secondary" onClick={onEdit}>
                  {labels.postsEdit}
                </Button>
                <Button type="button" variant="danger" onClick={onDelete}>
                  {labels.postsDelete}
                </Button>
              </>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className={styles.body}>
        <div className={styles.media}>
          <div
            className={styles.carousel}
            tabIndex={showControls ? 0 : undefined}
            role={showControls ? 'region' : undefined}
            aria-roledescription={showControls ? 'carousel' : undefined}
            aria-label={labels.postsDetailTitle}
            onKeyDown={handleCarouselKeyDown}
          >
            <div ref={trackRef} className={styles.track}>
              {images.map((image, slideIndex) => (
                <div
                  key={`${image.imageId}-${slideIndex}`}
                  className={styles.slide}
                  data-slide-index={slideIndex}
                >
                  <img
                    className={styles.image}
                    src={mediaImageAbsoluteUrl(image.imageId, 'display')}
                    alt=""
                    draggable={false}
                    loading={slideIndex === 0 ? 'eager' : 'lazy'}
                  />
                </div>
              ))}
            </div>

            {showControls && canGoPrev ? (
              <button
                type="button"
                className={`${styles.navButton} ${styles.navPrev}`}
                onClick={goPrev}
                aria-label={labels.postsPrev}
              >
                <IoChevronBack aria-hidden />
              </button>
            ) : null}
            {showControls && canGoNext ? (
              <button
                type="button"
                className={`${styles.navButton} ${styles.navNext}`}
                onClick={goNext}
                aria-label={labels.postsNext}
              >
                <IoChevronForward aria-hidden />
              </button>
            ) : null}

            {showControls ? (
              <p className={styles.position} aria-live="polite">
                {positionLabel}
              </p>
            ) : null}
          </div>
        </div>

        <aside className={styles.side}>
          <div className={styles.meta}>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>
                {labels.postsAuthorLabel}:{' '}
              </span>
              {post.createdBy}
            </p>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>
                {labels.postsCreatedAtLabel}:{' '}
              </span>
              {formatCreatedAt(post.createdAt, language)}
            </p>
          </div>

          {hasCaption ? (
            <div
              className={styles.caption}
              dangerouslySetInnerHTML={{ __html: safeCaptionHtml }}
            />
          ) : (
            <p className={styles.captionEmpty}>{labels.postsCaptionEmpty}</p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
