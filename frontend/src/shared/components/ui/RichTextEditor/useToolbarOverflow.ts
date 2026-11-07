import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Keeps toolbar items on one row. Hides trailing items into an overflow slot
 * when the container is too narrow (measured via ResizeObserver).
 */
export function useToolbarOverflow(
  toolbarRef: RefObject<HTMLElement | null>,
  measureRef: RefObject<HTMLElement | null>,
  itemCount: number
) {
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const measure = measureRef.current;
    if (!toolbar || !measure) {
      return undefined;
    }

    const recompute = () => {
      const items = Array.from(
        measure.querySelectorAll<HTMLElement>('[data-toolbar-item]')
      );
      if (items.length === 0) {
        setVisibleCount(itemCount);
        return;
      }

      const moreButton = measure.querySelector<HTMLElement>(
        '[data-toolbar-more]'
      );
      const moreWidth = moreButton?.offsetWidth ?? 36;
      const gap = Number.parseFloat(getComputedStyle(toolbar).columnGap || '0') || 2.4;
      const available = toolbar.clientWidth;

      let used = 0;
      let fit = 0;
      for (let index = 0; index < items.length; index += 1) {
        const width = items[index].offsetWidth;
        const nextUsed = fit === 0 ? width : used + gap + width;
        const remaining = items.length - (index + 1);
        const needMore = remaining > 0;
        const limit = needMore ? available - moreWidth - gap : available;
        if (nextUsed <= limit + 0.5) {
          used = nextUsed;
          fit = index + 1;
        } else {
          break;
        }
      }

      // Always keep at least the first formatting control visible.
      setVisibleCount(Math.max(1, fit));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [toolbarRef, measureRef, itemCount]);

  return visibleCount;
}
