import { useEffect, useRef, useState, type TouchEvent } from 'react';
import SanitizedRichText from '../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import {
  mediaImageAbsoluteUrl,
} from '../../shared/api/mediaApi';
import type {
  PublicPostMedia,
  PublicPostResponse,
} from '../../shared/api/postsApi';
import { resolvePostCopy } from '../../shared/content/resolvePostCopy';
import LoadingSpinner from '../../shared/components/LoadingSpinner/LoadingSpinner';
import PostVideo from './PostVideo';
import type { getNewsLabels } from './newsLabels';
import styles from './MobilePost.module.css';

type Labels = ReturnType<typeof getNewsLabels>;
const MAX_VISIBLE_IMAGE_INDICATORS = 7;
const IMAGE_ASPECT_RATIO_TOLERANCE = 0.02;

type MobilePostProps = {
  post: PublicPostResponse;
  language: string;
  defaultLanguage: string;
  labels: Labels;
};

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

function MobilePostMedia({
  media,
  alt,
  frameAspectRatio,
  onVideoPreviewReady,
  onVideoError,
  controls = true,
}: {
  media: PublicPostMedia;
  alt: string;
  frameAspectRatio: number;
  onVideoPreviewReady?: () => void;
  onVideoError?: () => void;
  controls?: boolean;
}) {
  const aspectRatio = media.width / media.height;
  const hasAspectRatioDifference =
    Math.abs(aspectRatio - frameAspectRatio) / frameAspectRatio >
    IMAGE_ASPECT_RATIO_TOLERANCE;

  return (
    <div className={styles.photoSlide}>
      {media.type === 'image' ? (
        <>
          {hasAspectRatioDifference ? (
            <img
              className={`${styles.photo} ${styles.photoBackdrop}`}
              src={mediaImageAbsoluteUrl(media.imageId, 'display')}
              alt=""
              aria-hidden="true"
            />
          ) : null}
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

export default function MobilePost({
  post,
  language,
  defaultLanguage,
  labels,
}: MobilePostProps) {
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
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [hasExpandableCaption, setHasExpandableCaption] = useState(false);
  const captionRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const visibleImageIndex =
    pendingVideoIndex ?? transition?.to ?? activeImage;
  const isChangingVideo = pendingVideoIndex !== null;
  const media = post.media;
  const activeMedia = media[visibleImageIndex] ?? media[0];
  const firstImage = media[0] ?? activeMedia;
  const firstImageAspectRatio = firstImage
    ? firstImage.width / firstImage.height
    : 1;
  const imageAspectRatios = media.map((item) => item.width / item.height);
  const hasMixedAspectRatios = imageAspectRatios.some(
    (aspectRatio) =>
      Math.abs(aspectRatio - firstImageAspectRatio) /
        firstImageAspectRatio >
      IMAGE_ASPECT_RATIO_TOLERANCE,
  );
  const frameAspectRatio = hasMixedAspectRatios
    ? Math.min(...imageAspectRatios)
    : firstImageAspectRatio;
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

  useEffect(() => {
    const caption = captionRef.current;
    if (!caption) {
      setHasExpandableCaption(false);
      return;
    }

    const measureCaption = () => {
      setHasExpandableCaption(
        !isCaptionExpanded && caption.scrollHeight > caption.clientHeight + 1,
      );
    };
    measureCaption();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureCaption);
      return () => window.removeEventListener('resize', measureCaption);
    }

    const observer = new ResizeObserver(measureCaption);
    observer.observe(caption);
    return () => observer.disconnect();
  }, [copy.body, isCaptionExpanded]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

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

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) {
      return;
    }

    if (transition) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    showImage(activeImage + (deltaX < 0 ? 1 : -1));
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
    <article className={styles.post}>
      {activeMedia ? (
        <div
          className={styles.photoFrame}
          style={{
            aspectRatio: String(frameAspectRatio),
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
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
                  <MobilePostMedia
                    key={mediaId}
                    media={item}
                    alt={`${labels.photoNews} ${index + 1} / ${media.length}`}
                    frameAspectRatio={frameAspectRatio}
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
                          ? (pendingVideoIndex ?? activeImage) > activeImage
                            ? styles.mediaLayerSlideOutNext
                            : styles.mediaLayerSlideOutPrevious
                          : ''
                    }`}
                    onAnimationEnd={
                      isPending && pendingVideoTransition
                        ? () => finishVideoTransition()
                        : undefined
                    }
                  >
                    <MobilePostMedia
                      media={item}
                      alt={`${labels.photoNews} ${index + 1} / ${media.length}`}
                      frameAspectRatio={frameAspectRatio}
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
                    key={item.type === 'image' ? item.imageId : item.fileId}
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
      <div className={styles.details}>
        {copy.body ? (
          <div className={styles.captionBlock}>
            <SanitizedRichText
              ref={captionRef}
              html={copy.body}
              className={`${styles.caption} ${
                isCaptionExpanded ? styles.expandedCaption : ''
              }`}
            />
          </div>
        ) : null}
        <div className={styles.postMeta}>
          <time dateTime={post.createdAt}>
            {formatDate(post.createdAt, language)}
          </time>
          {hasExpandableCaption && !isCaptionExpanded ? (
            <button
              type="button"
              className={styles.captionToggle}
              aria-expanded="false"
              onClick={() => setIsCaptionExpanded(true)}
            >
              {labels.captionMore}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
