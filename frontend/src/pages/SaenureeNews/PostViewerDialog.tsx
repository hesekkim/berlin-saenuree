import { useEffect, useState } from 'react';
import Dialog from '../../shared/components/ui/Dialog/Dialog';
import LoadingSpinner from '../../shared/components/LoadingSpinner/LoadingSpinner';
import SanitizedRichText from '../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import {
  mediaImageAbsoluteUrl,
} from '../../shared/api/mediaApi';
import type {
  PublicPostMedia,
  PublicPostResponse,
} from '../../shared/api/postsApi';
import { resolvePostCopy } from '../../shared/content/resolvePostCopy';
import PostVideo from './PostVideo';
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

function ViewerMedia({
  media,
  alt,
  controls = true,
  onVideoPreviewReady,
  onVideoError,
}: {
  media: PublicPostMedia;
  alt: string;
  controls?: boolean;
  onVideoPreviewReady?: () => void;
  onVideoError?: () => void;
}) {
  return (
    <div className={styles.photoSlide}>
      {media.type === 'image' ? (
        <>
          <img
            className={`${styles.photo} ${styles.photoBackdrop}`}
            src={mediaImageAbsoluteUrl(media.imageId, 'display')}
            alt=""
            aria-hidden="true"
          />
          <img
            className={`${styles.photo} ${styles.photoForeground}`}
            src={mediaImageAbsoluteUrl(media.imageId, 'display')}
            alt={alt}
            loading="lazy"
            width={media.width}
            height={media.height}
          />
        </>
      ) : (
        <PostVideo
          fileId={media.fileId}
          className={`${styles.photo} ${styles.photoForeground}`}
          controls={controls}
          onPreviewReady={onVideoPreviewReady}
          onError={onVideoError}
        />
      )}
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
  const [pendingVideoIndex, setPendingVideoIndex] = useState<number | null>(
    null,
  );
  const [pendingVideoReady, setPendingVideoReady] = useState(false);
  const [pendingVideoTransition, setPendingVideoTransition] = useState(false);
  const visibleImageIndex =
    pendingVideoIndex ?? transition?.to ?? activeImage;
  const isChangingVideo = pendingVideoIndex !== null;
  const media = post.media;
  const activeMedia = media[visibleImageIndex] ?? media[0];
  const copy = resolvePostCopy(post.copies, language, defaultLanguage);
  const positionLabel = labels.imagePosition
    .replace('{current}', String(visibleImageIndex + 1))
    .replace('{total}', String(media.length));
  const indicatorStart = Math.max(
    0,
    Math.min(
      visibleImageIndex - Math.floor(MAX_VISIBLE_IMAGE_INDICATORS / 2),
      media.length - MAX_VISIBLE_IMAGE_INDICATORS,
    ),
  );
  const visibleIndicatorImages = media.slice(
    indicatorStart,
    indicatorStart + MAX_VISIBLE_IMAGE_INDICATORS,
  );
  const showImage = (index: number) => {
    if (
      transition ||
      isChangingVideo ||
      index === activeImage ||
      index < 0 ||
      index >= media.length
    ) {
      return;
    }

    if (media[index]?.type === 'video' && media[activeImage]?.type !== 'video') {
      setPendingVideoIndex(index);
      setPendingVideoReady(false);
      setPendingVideoTransition(false);
      return;
    }

    if (
      media[activeImage]?.type === 'video' ||
      (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
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
  const finishVideoTransition = () => {
    if (pendingVideoIndex === null || !pendingVideoTransition) {
      return;
    }
    setActiveImage(pendingVideoIndex);
    setPendingVideoIndex(null);
    setPendingVideoReady(false);
    setPendingVideoTransition(false);
  };
  const startVideoTransition = () => {
    setPendingVideoTransition(true);
  };
  const cancelPendingVideo = () => {
    setPendingVideoIndex(null);
    setPendingVideoReady(false);
    setPendingVideoTransition(false);
  };

  useEffect(() => {
    if (!pendingVideoTransition || pendingVideoIndex === null) {
      return;
    }
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(
      () => {
        setActiveImage(pendingVideoIndex);
        setPendingVideoIndex(null);
        setPendingVideoReady(false);
        setPendingVideoTransition(false);
      },
      prefersReducedMotion ? 20 : 300,
    );
    return () => window.clearTimeout(timeout);
  }, [pendingVideoIndex, pendingVideoTransition]);

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
            {activeMedia ? (
              <div
                className={styles.viewerPhoto}
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
                      const item = media[index];
                      const mediaId =
                        item.type === 'image' ? item.imageId : item.fileId;
                      return (
                        <ViewerMedia
                          key={mediaId}
                          media={item}
                          alt={`${labels.photoNews} ${index + 1} / ${media.length}`}
                        />
                      );
                    })}
                  </div>
                ) : activeMedia ? (
                  <>
                    {[
                      { index: activeImage, isPending: false },
                      ...(pendingVideoIndex === null
                        ? []
                        : [{ index: pendingVideoIndex, isPending: true }]),
                    ].map(({ index, isPending }) => {
                      const item = media[index];
                      const mediaId =
                        item.type === 'image' ? item.imageId : item.fileId;
                      return (
                        <div
                          key={mediaId}
                          className={`${styles.mediaLayer} ${
                            isPending
                              ? pendingVideoReady
                                ? pendingVideoTransition
                                  ? index > activeImage
                                    ? styles.mediaLayerSlideInNext
                                    : styles.mediaLayerSlideInPrevious
                                  : ''
                                : styles.mediaLayerPending
                              : pendingVideoTransition
                                ? (pendingVideoIndex ?? activeImage) >
                                  activeImage
                                  ? styles.mediaLayerSlideOutNext
                                  : styles.mediaLayerSlideOutPrevious
                                : ''
                          }`}
                          onAnimationEnd={
                            isPending && pendingVideoTransition
                              ? finishVideoTransition
                              : undefined
                          }
                        >
                          <ViewerMedia
                            media={item}
                            alt={`${labels.photoNews} ${index + 1} / ${media.length}`}
                            controls={!isPending}
                            onVideoPreviewReady={
                              isPending
                                ? () => {
                                    setPendingVideoReady(true);
                                    startVideoTransition();
                                  }
                                : undefined
                            }
                            onVideoError={
                              isPending ? cancelPendingVideo : undefined
                            }
                          />
                        </div>
                      );
                    })}
                    {pendingVideoIndex !== null && !pendingVideoReady ? (
                      <div className={styles.videoLoading} role="status" aria-live="polite">
                        <LoadingSpinner
                          size="medium"
                          text={labels.videoLoading}
                          className={styles.videoLoadingSpinner}
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}
                {visibleImageIndex > 0 ? (
                  <button
                    type="button"
                    className={`${styles.photoNavigation} ${styles.previousPhoto}`}
                    aria-label={labels.previousImage}
                    disabled={Boolean(transition) || isChangingVideo}
                    onClick={() => showImage(visibleImageIndex - 1)}
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                ) : null}
                {visibleImageIndex < media.length - 1 ? (
                  <button
                    type="button"
                    className={`${styles.photoNavigation} ${styles.nextPhoto}`}
                    aria-label={labels.nextImage}
                    disabled={Boolean(transition) || isChangingVideo}
                    onClick={() => showImage(visibleImageIndex + 1)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                ) : null}
                {media.length > 1 ? (
                  <div
                    className={styles.imageIndicators}
                    aria-label={positionLabel}
                    role="group"
                  >
                    {visibleIndicatorImages.map((item, offset) => {
                      const index = indicatorStart + offset;
                      const indicatorLabel = labels.imagePosition
                        .replace('{current}', String(index + 1))
                        .replace('{total}', String(media.length));
                      return (
                        <button
                          type="button"
                          key={
                            item.type === 'image' ? item.imageId : item.fileId
                          }
                          className={`${styles.imageIndicator} ${
                            index === visibleImageIndex
                              ? styles.activeImageIndicator
                              : ''
                          }`}
                          aria-label={indicatorLabel}
                          aria-current={
                              index === visibleImageIndex ? 'true' : undefined
                          }
                          disabled={Boolean(transition) || isChangingVideo}
                          onClick={() => showImage(index)}
                        />
                      );
                    })}
                    {media.length > MAX_VISIBLE_IMAGE_INDICATORS ? (
                      <span className={styles.imageCount} aria-hidden="true">
                        {visibleImageIndex + 1} / {media.length}
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
