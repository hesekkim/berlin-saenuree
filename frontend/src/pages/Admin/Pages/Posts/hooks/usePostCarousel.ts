import { useCallback, useEffect, useRef, useState } from 'react';
import { clampSlideIndex } from '../utils/slideIndex';

export function usePostCarousel(slideCount: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => clampSlideIndex(current, slideCount));
  }, [slideCount]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || slideCount <= 1) {
      return undefined;
    }

    const slides = track.querySelectorAll<HTMLElement>('[data-slide-index]');
    if (slides.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) {
          return;
        }
        const next = Number((visible.target as HTMLElement).dataset.slideIndex);
        if (!Number.isNaN(next)) {
          setIndex(clampSlideIndex(next, slideCount));
        }
      },
      { root: track, threshold: 0.6 },
    );

    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [slideCount]);

  const goTo = useCallback(
    (target: number) => {
      const next = clampSlideIndex(target, slideCount);
      const track = trackRef.current;
      if (track && slideCount > 0) {
        track.scrollTo({
          left: next * track.clientWidth,
          behavior: 'smooth',
        });
      }
      setIndex(next);
    },
    [slideCount],
  );

  const goPrev = useCallback(() => {
    goTo(index - 1);
  }, [goTo, index]);

  const goNext = useCallback(() => {
    goTo(index + 1);
  }, [goTo, index]);

  return {
    trackRef,
    index,
    goTo,
    goPrev,
    goNext,
    canGoPrev: index > 0,
    canGoNext: index < slideCount - 1 && slideCount > 1,
  };
}
