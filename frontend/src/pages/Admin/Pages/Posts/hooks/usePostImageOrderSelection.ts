import { useCallback, useEffect, useRef, useState } from 'react';
import { clampSlideIndex } from '../utils/slideIndex';

/** Longer jumps land next to the target so the middle slides are skipped. */
const MAX_ANIMATED_SLIDES = 3;
const SETTLE_MS = 700;

/**
 * Horizontal scroll-snap preview.
 * Selection is anchored to the slide id, so reordering or removing images
 * keeps the same photo on screen.
 * Selecting a slide updates the index immediately, then moves the track.
 * Scroll-driven index updates are ignored until the programmatic move lands,
 * so the selection never walks through the slides in between.
 */
export function usePostImageOrderSelection(slideIds: string[]) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const slideIdsRef = useRef(slideIds);
  slideIdsRef.current = slideIds;
  const targetRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const slideCount = slideIds.length;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const cancelScrollFrame = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const applyIndex = useCallback((next: number) => {
    indexRef.current = next;
    selectedIdRef.current = slideIdsRef.current[next] ?? null;
    setIndex(next);
  }, []);

  /** Scroll width is only reliable after layout, so read it in the frame. */
  const queueTrackScroll = useCallback(
    (slide: number, behavior: ScrollBehavior) => {
      cancelScrollFrame();
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const track = trackRef.current;
        if (!track) {
          return;
        }
        track.scrollTo({ left: slide * track.clientWidth, behavior });
      });
    },
    [cancelScrollFrame],
  );

  useEffect(
    () => () => {
      clearSettleTimer();
      cancelScrollFrame();
    },
    [cancelScrollFrame, clearSettleTimer],
  );

  useEffect(() => {
    const selectedId = selectedIdRef.current;
    const moved = selectedId ? slideIds.indexOf(selectedId) : -1;
    const next =
      moved >= 0 ? moved : clampSlideIndex(indexRef.current, slideIds.length);
    applyIndex(next);
    targetRef.current = null;
    clearSettleTimer();

    const track = trackRef.current;
    if (!track || slideIds.length === 0) {
      return;
    }
    queueTrackScroll(next, 'auto');
  }, [applyIndex, clearSettleTimer, queueTrackScroll, slideIds]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return undefined;
    }

    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const width = track.clientWidth;
        if (width <= 0) {
          return;
        }
        const target = targetRef.current;
        if (target !== null) {
          if (Math.abs(track.scrollLeft - target * width) <= 2) {
            targetRef.current = null;
            clearSettleTimer();
          }
          return;
        }
        const current = clampSlideIndex(
          Math.round(track.scrollLeft / width),
          slideCount,
        );
        if (current !== indexRef.current) {
          applyIndex(current);
        }
      });
    };

    // A direct swipe wins: drop the pending move instead of snapping back.
    const onPointerDown = () => {
      targetRef.current = null;
      clearSettleTimer();
      cancelScrollFrame();
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('pointerdown', onPointerDown);
    return () => {
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('pointerdown', onPointerDown);
      window.cancelAnimationFrame(frame);
    };
  }, [applyIndex, cancelScrollFrame, clearSettleTimer, slideCount]);

  const goTo = useCallback(
    (target: number) => {
      const next = clampSlideIndex(target, slideCount);
      applyIndex(next);

      const track = trackRef.current;
      const width = track?.clientWidth ?? 0;
      if (!track || width <= 0) {
        return;
      }

      const left = next * width;
      if (Math.abs(track.scrollLeft - left) <= 2) {
        targetRef.current = null;
        clearSettleTimer();
        cancelScrollFrame();
        return;
      }

      const from = Math.round(track.scrollLeft / width);
      targetRef.current = next;
      clearSettleTimer();
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        targetRef.current = null;
        if (Math.abs(track.scrollLeft - left) > 2) {
          track.scrollTo({ left, behavior: 'auto' });
        }
      }, SETTLE_MS);

      if (Math.abs(next - from) > MAX_ANIMATED_SLIDES) {
        const approach = next > from ? next - 1 : next + 1;
        track.scrollTo({ left: approach * width, behavior: 'auto' });
      }
      queueTrackScroll(next, 'smooth');
    },
    [
      applyIndex,
      cancelScrollFrame,
      clearSettleTimer,
      queueTrackScroll,
      slideCount,
    ],
  );

  return {
    trackRef,
    index,
    goTo,
  };
}
