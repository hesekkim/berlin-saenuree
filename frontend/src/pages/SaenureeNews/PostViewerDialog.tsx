import { useState } from 'react';
import Dialog from '../../shared/components/ui/Dialog/Dialog';
import SanitizedRichText from '../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import { mediaImageAbsoluteUrl } from '../../shared/api/mediaApi';
import type { PublicPostResponse } from '../../shared/api/postsApi';
import { resolvePostCopy } from '../../shared/content/resolvePostCopy';
import styles from './PostViewerDialog.module.css';
import type { getNewsLabels } from './newsLabels';

type Labels = ReturnType<typeof getNewsLabels>;
const MAX_VISIBLE_IMAGE_INDICATORS = 7;

type PostViewerDialogProps = {
  post: PublicPostResponse;
  postIndex: number;
  postCount: number;
  language: string;
  defaultLanguage: string;
  labels: Labels;
  onClose: () => void;
  onPreviousPost: () => void;
  onNextPost: () => void;
};

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function ViewerPhoto({
  image,
  alt,
}: {
  image: PublicPostResponse['images'][number];
  alt: string;
}) {
  const src = mediaImageAbsoluteUrl(image.imageId, 'display');

  return (
    <div className={styles.photoSlide}>
      <img
        className={`${styles.photo} ${styles.photoBackdrop}`}
        src={src}
        alt=""
        aria-hidden="true"
      />
      <img
        className={`${styles.photo} ${styles.photoForeground}`}
        src={src}
        alt={alt}
        loading="lazy"
        width={image.width}
        height={image.height}
      />
    </div>
  );
}

export default function PostViewerDialog({
  post,
  postIndex,
  postCount,
  language,
  defaultLanguage,
  labels,
  onClose,
  onPreviousPost,
  onNextPost,
}: PostViewerDialogProps) {
  const [activeImage, setActiveImage] = useState(0);
  const [transition, setTransition] = useState<{
    from: number;
    to: number;
    direction: 'next' | 'previous';
  } | null>(null);
  const visibleImageIndex = transition?.to ?? activeImage;
  const image = post.images[visibleImageIndex] ?? post.images[0];
  const copy = resolvePostCopy(post.copies, language, defaultLanguage);
  const positionLabel = labels.imagePosition
    .replace('{current}', String(visibleImageIndex + 1))
    .replace('{total}', String(post.images.length));
  const indicatorStart = Math.max(
    0,
    Math.min(
      visibleImageIndex - Math.floor(MAX_VISIBLE_IMAGE_INDICATORS / 2),
      post.images.length - MAX_VISIBLE_IMAGE_INDICATORS,
    ),
  );
  const visibleIndicatorImages = post.images.slice(
    indicatorStart,
    indicatorStart + MAX_VISIBLE_IMAGE_INDICATORS,
  );
  const showImage = (index: number) => {
    if (
      transition ||
      index === activeImage ||
      index < 0 ||
      index >= post.images.length
    ) {
      return;
    }

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setActiveImage(index);
      return;
    }

    setTransition({
      from: activeImage,
      to: index,
      direction: index > activeImage ? 'next' : 'previous',
    });
  };
  const handleSlideAnimationEnd = () => {
    if (!transition) {
      return;
    }
    setActiveImage(transition.to);
    setTransition(null);
  };
  const visibleImages = transition
    ? transition.direction === 'next'
      ? [transition.from, transition.to]
      : [transition.to, transition.from]
    : [activeImage];

  return (
    <Dialog
      isOpen
      title={labels.photoNews}
      onClose={onClose}
      closeLabel={labels.closeViewer}
      size="lg"
      className={styles.fullscreenDialog}
      bodyClassName={styles.dialogBody}
      overlayClassName={styles.fullscreenOverlay}
      headerClassName={styles.dialogHeader}
      showTitle={false}
      showHeaderDivider={false}
      onDialogClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, [data-dialog-dismiss-ignore]')
        ) {
          return;
        }
        onClose();
      }}
    >
      <div className={styles.viewer}>
        {postIndex > 0 ? (
          <button
            type="button"
            className={`${styles.postNavigation} ${styles.previousPost}`}
            aria-label={labels.previousPost}
            onClick={onPreviousPost}
          >
            <span aria-hidden="true">‹</span>
          </button>
        ) : null}
        <div className={styles.viewerContent}>
          <div className={styles.viewerPhotoColumn}>
            {image ? (
              <div
                className={styles.viewerPhoto}
                role="group"
                aria-label={positionLabel}
                data-dialog-dismiss-ignore
              >
                {transition ? (
                  <div
                    className={`${styles.photoTrack} ${
                      transition.direction === 'next'
                        ? styles.slideNext
                        : styles.slidePrevious
                    }`}
                    onAnimationEnd={handleSlideAnimationEnd}
                  >
                    {visibleImages.map((index) => {
                      const item = post.images[index];
                      return (
                        <ViewerPhoto
                          key={item.imageId}
                          image={item}
                          alt={`${labels.photoNews} ${index + 1} / ${post.images.length}`}
                        />
                      );
                    })}
                  </div>
                ) : image ? (
                  <ViewerPhoto
                    image={image}
                    alt={`${labels.photoNews} ${positionLabel}`}
                  />
                ) : null}
                {visibleImageIndex > 0 ? (
                  <button
                    type="button"
                    className={`${styles.photoNavigation} ${styles.previousPhoto}`}
                    aria-label={labels.previousImage}
                    disabled={Boolean(transition)}
                    onClick={() => showImage(visibleImageIndex - 1)}
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                ) : null}
                {visibleImageIndex < post.images.length - 1 ? (
                  <button
                    type="button"
                    className={`${styles.photoNavigation} ${styles.nextPhoto}`}
                    aria-label={labels.nextImage}
                    disabled={Boolean(transition)}
                    onClick={() => showImage(visibleImageIndex + 1)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                ) : null}
                {post.images.length > 1 ? (
                  <div
                    className={styles.imageIndicators}
                    aria-label={positionLabel}
                    role="group"
                  >
                    {visibleIndicatorImages.map((item, offset) => {
                      const index = indicatorStart + offset;
                      const indicatorLabel = labels.imagePosition
                        .replace('{current}', String(index + 1))
                        .replace('{total}', String(post.images.length));
                      return (
                        <button
                          type="button"
                          key={item.imageId}
                          className={`${styles.imageIndicator} ${
                            index === visibleImageIndex
                              ? styles.activeImageIndicator
                              : ''
                          }`}
                          aria-label={indicatorLabel}
                          aria-current={
                              index === visibleImageIndex ? 'true' : undefined
                          }
                          disabled={Boolean(transition)}
                          onClick={() => showImage(index)}
                        />
                      );
                    })}
                    {post.images.length > MAX_VISIBLE_IMAGE_INDICATORS ? (
                      <span className={styles.imageCount} aria-hidden="true">
                        {visibleImageIndex + 1} / {post.images.length}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.viewerDetails} data-dialog-dismiss-ignore>
            <div className={styles.detailsContent}>
              {copy.body ? (
                <SanitizedRichText
                  html={copy.body}
                  className={styles.caption}
                />
              ) : null}
              <time dateTime={post.createdAt}>
                {formatDate(post.createdAt, language)}
              </time>
            </div>
          </div>
        </div>
        {postIndex < postCount - 1 ? (
          <button
            type="button"
            className={`${styles.postNavigation} ${styles.nextPost}`}
            aria-label={labels.nextPost}
            onClick={onNextPost}
          >
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
