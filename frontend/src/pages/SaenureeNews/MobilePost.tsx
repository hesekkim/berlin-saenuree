import { useEffect, useRef, useState, type TouchEvent } from 'react';
import SanitizedRichText from '../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import { mediaImageAbsoluteUrl } from '../../shared/api/mediaApi';
import type { PublicPostResponse } from '../../shared/api/postsApi';
import { resolvePostCopy } from '../../shared/content/resolvePostCopy';
import type { getNewsLabels } from './newsLabels';
import styles from './MobilePost.module.css';

type Labels = ReturnType<typeof getNewsLabels>;

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
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [hasExpandableCaption, setHasExpandableCaption] = useState(false);
  const captionRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const visibleImageIndex = transition?.to ?? activeImage;
  const image = post.images[visibleImageIndex] ?? post.images[0];
  const frameImage = post.images[0] ?? image;
  const copy = resolvePostCopy(post.copies, language, defaultLanguage);
  const positionLabel = labels.imagePosition
    .replace('{current}', String(visibleImageIndex + 1))
    .replace('{total}', String(post.images.length));

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

  return (
    <article className={styles.post}>
      {image ? (
        <div
          className={styles.photoFrame}
          style={{
            aspectRatio: `${frameImage.width} / ${frameImage.height}`,
          }}
          role="group"
          aria-label={positionLabel}
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
                const item = post.images[index];
                return (
                  <img
                    className={styles.photo}
                    key={item.imageId}
                    src={mediaImageAbsoluteUrl(item.imageId, 'display')}
                    alt={`${labels.photoNews} ${index + 1} / ${post.images.length}`}
                    loading="lazy"
                    width={item.width}
                    height={item.height}
                  />
                );
              })}
            </div>
          ) : image ? (
            <img
              className={styles.photo}
              src={mediaImageAbsoluteUrl(image.imageId, 'display')}
              alt={`${labels.photoNews} ${positionLabel}`}
              loading="lazy"
              width={image.width}
              height={image.height}
            />
          ) : null}
          {post.images.length > 1 ? (
            <div className={styles.imageIndicators} aria-label={positionLabel}>
              {post.images.map((item, index) => {
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
                    onClick={() => showImage(index)}
                  />
                );
              })}
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
