import { useEffect, useRef, useState } from 'react';
import {
  applyPublicPageImageFallback,
  indexedPublicPageImageFallback,
  publicPageImageFallbacks,
  publicPageImageUrl,
} from '../../shared/content/publicPageImage';
import { useConfig } from '../../shared/context/ConfigContext';
import HomePopups from './HomePopups';
import { getHomeLabels } from './homeLabels';
import { useHomeContent } from './useHomeContent';
import { getYouTubeVideoId } from './youtubeVideo';
import styles from './Home.module.css';

export default function Home() {
  const { language } = useConfig();
  const { content } = useHomeContent();
  const labels = getHomeLabels(language);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const heroRef = useRef<HTMLElement>(null);
  const heroPhotoRef = useRef<HTMLDivElement>(null);
  const heroTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const videoScrollTimerRef = useRef<number | null>(null);
  const heroImages = content.heroImages;
  const activeHeroSlideIndex =
    heroImages.length > 0 ? heroSlideIndex % heroImages.length : 0;
  const videos = content.youtubeVideoUrls
    .map((url) => getYouTubeVideoId(url))
    .filter((id): id is string => id !== null)
    .slice(0, 3);

  const handleHeroTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    heroTouchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null;
  };

  const handleHeroTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = heroTouchStartRef.current;
    heroTouchStartRef.current = null;
    if (!start || heroImages.length < 2) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    setHeroSlideIndex((index) =>
      (index + (deltaX < 0 ? 1 : -1) + heroImages.length) % heroImages.length
    );
  };

  useEffect(
    () => () => {
      if (videoScrollTimerRef.current !== null) {
        window.clearTimeout(videoScrollTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (heroImages.length < 2) {
      setHeroSlideIndex(0);
      return;
    }

    const timer = window.setTimeout(() => {
      setHeroSlideIndex((index) => (index + 1) % heroImages.length);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [heroImages.length, heroSlideIndex]);

  useEffect(() => {
    const updateProgress = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const hero = heroRef.current;
        if (!hero) {
          return;
        }
        const scrollDistance = Math.max(
          hero.offsetHeight - window.innerHeight,
          1,
        );
        const progress = Math.min(
          1,
          Math.max(0, -hero.getBoundingClientRect().top / scrollDistance),
        );
        const photo = heroPhotoRef.current;
        if (!photo) {
          return;
        }
        photo.style.setProperty('--hero-image-scale', `${1 + progress * 0.08}`);
        photo.style.setProperty('--hero-image-opacity', `${1 - progress}`);
      });
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <main className={styles.container}>
      <section ref={heroRef} className={styles.hero}>
        <div className={styles.heroStage}>
          <div
            ref={heroPhotoRef}
            className={styles.heroPhoto}
            role={heroImages.length > 1 ? 'region' : undefined}
            aria-roledescription={heroImages.length > 1 ? 'carousel' : undefined}
            aria-label={heroImages.length > 1 ? labels.heroSlides : undefined}
            onTouchStart={handleHeroTouchStart}
            onTouchEnd={handleHeroTouchEnd}
            onTouchCancel={() => {
              heroTouchStartRef.current = null;
            }}
          >
            {heroImages.map((image, index) => (
              <img
                key={image.imageId}
                className={`${styles.heroSlide} ${
                  index === activeHeroSlideIndex ? styles.heroSlideActive : ''
                }`}
                src={publicPageImageUrl(image.imageId, 'display')}
                onError={(event) =>
                  applyPublicPageImageFallback(
                    event.currentTarget,
                    indexedPublicPageImageFallback(
                      publicPageImageFallbacks.homeHero,
                      index,
                    ),
                  )
                }
                alt=""
                aria-hidden={index !== activeHeroSlideIndex}
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            ))}
            {heroImages.length > 1 ? (
              <div className={styles.heroIndicators}>
                {heroImages.map((image, index) => (
                  <button
                    key={image.imageId}
                    type="button"
                    className={`${styles.heroIndicator} ${
                      index === activeHeroSlideIndex
                        ? styles.heroIndicatorActive
                        : ''
                    }`}
                    aria-label={`${labels.heroSlide} ${index + 1}`}
                    aria-current={
                      index === activeHeroSlideIndex ? 'true' : undefined
                    }
                    onClick={() => setHeroSlideIndex(index)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.verseSection}>
        <div className={styles.verseContent}>
          {content.yearMotto ? (
            <>
              <p className={styles.eyebrow}>{labels.yearMotto}</p>
              <h1 className={styles.motto}>{content.yearMotto}</h1>
            </>
          ) : null}
          {content.bibleVerse || content.bibleReference ? (
            <p className={`${styles.eyebrow} ${styles.bibleLabel}`}>
              {labels.bibleVerse}
            </p>
          ) : null}
          {content.bibleVerse ? (
            <blockquote className={styles.verse}>
              <p>{content.bibleVerse}</p>
              {content.bibleReference ? (
                <cite>{content.bibleReference}</cite>
              ) : null}
            </blockquote>
          ) : null}
        </div>
      </section>

      <section className={styles.mediaSection} aria-labelledby="worship-title">
        <div className={styles.sectionHeading}>
          <h2 id="worship-title" className={styles.eyebrow}>
            {labels.worship}
          </h2>
        </div>
        {videos.length > 0 ? (
          <div
            className={styles.videoGrid}
            onScroll={(event) => {
              const grid = event.currentTarget;
              if (!window.matchMedia('(max-width: 768px)').matches) {
                return;
              }
              if (videoScrollTimerRef.current !== null) {
                window.clearTimeout(videoScrollTimerRef.current);
              }
              videoScrollTimerRef.current = window.setTimeout(() => {
                const gridCenter =
                  grid.getBoundingClientRect().left + grid.clientWidth / 2;
                const focusedCard = Array.from(
                  grid.querySelectorAll<HTMLElement>('[data-video-id]')
                ).reduce<HTMLElement | null>((nearest, card) => {
                  if (!nearest) {
                    return card;
                  }
                  const cardCenter =
                    card.getBoundingClientRect().left +
                    card.getBoundingClientRect().width / 2;
                  const nearestCenter =
                    nearest.getBoundingClientRect().left +
                    nearest.getBoundingClientRect().width / 2;
                  return Math.abs(cardCenter - gridCenter) <
                    Math.abs(nearestCenter - gridCenter)
                    ? card
                    : nearest;
                }, null);
                const focusedVideoId = focusedCard?.dataset.videoId;
                setPlayingVideoId((current) =>
                  current && current !== focusedVideoId ? null : current
                );
              }, 150);
            }}
          >
            {videos.map((videoId, index) => (
              <article
                className={styles.videoCard}
                data-video-id={videoId}
                key={videoId}
              >
                {playingVideoId === videoId ? (
                  <div className={styles.videoFrame}>
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                      title={`${labels.videoTitle} ${index + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.videoThumbnail}
                    onClick={(event) => {
                      const card = event.currentTarget.closest('article');
                      setPlayingVideoId(videoId);
                      if (window.matchMedia('(max-width: 768px)').matches) {
                        window.requestAnimationFrame(() => {
                          card?.scrollIntoView({
                            block: 'nearest',
                            inline: 'center',
                            behavior: 'smooth',
                          });
                        });
                      }
                    }}
                    aria-label={`${labels.playVideo} ${index + 1}`}
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span className={styles.playButton} aria-hidden="true">
                      <span className={styles.playIcon} />
                    </span>
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyMessage}>{labels.videoUnavailable}</p>
        )}
      </section>

      {content.pastoralMissionItems.some((item) => item.trim()) ? (
        <section
          className={styles.philosophySection}
          aria-labelledby="philosophy-title"
        >
          <div className={styles.philosophyContent}>
            <h2
              id="philosophy-title"
              className={`${styles.eyebrow} ${styles.philosophyTitle}`}
            >
              {labels.philosophy}
            </h2>
            <div className={styles.philosophyList}>
              {content.pastoralMissionItems.map((item, index) =>
                item.trim() ? (
                  <p className={styles.philosophyItem} key={`${index}-${item}`}>
                    {item}
                  </p>
                ) : null
              )}
            </div>
          </div>
        </section>
      ) : null}

      {content.panoramaImageId ? (
        <section className={styles.panoramaSection}>
          <img
            className={styles.panoramaImage}
            src={publicPageImageUrl(content.panoramaImageId, 'display')}
            onError={(event) =>
              applyPublicPageImageFallback(
                event.currentTarget,
                publicPageImageFallbacks.homePanorama,
              )
            }
            alt={labels.panoramaLabel}
            loading="lazy"
          />
        </section>
      ) : null}

      <HomePopups />
    </main>
  );
}
