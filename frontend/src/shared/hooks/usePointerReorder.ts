import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

const DEFAULT_ACTIVATION_PX = 6;
const DEFAULT_DATA_ATTRIBUTE = 'data-reorder-id';
const DEFAULT_HOLD_MS = 0;
const EDGE_SCROLL_ZONE_PX = 44;
const EDGE_SCROLL_STEP_PX = 12;

export type ReorderAxis = 'x' | 'y' | 'both';

export type DragPoint = { x: number; y: number };

export type UsePointerReorderOptions<T> = {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  /** Fired on pointer up when the gesture did not activate a drag. */
  onTap?: (id: string) => void;
  disabled?: boolean;
  /** Full attribute name for hit-testing (default `data-reorder-id`). */
  dataAttribute?: string;
  activationPx?: number;
  /**
   * Hold duration before drag arms (touch/pen). Mouse stays immediate.
   * Lets horizontal scroll win on short swipes.
   */
  holdMs?: number;
  /**
   * Restrict hit-testing to one axis. With `x` the cross-axis position is
   * taken from the dragged row, so the pointer may wander up and down
   * without losing the drop target.
   */
  axis?: ReorderAxis;
  /**
   * Scrollable list container. While dragging, a pointer held near its edge
   * scrolls it so rows outside the viewport stay reachable.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Pure reorder helper — returns the same reference when nothing moves. */
export function reorderById<T>(
  items: T[],
  getId: (item: T) => string,
  activeId: string,
  targetId: string
): T[] {
  if (activeId === targetId) {
    return items;
  }
  const fromIndex = items.findIndex((item) => getId(item) === activeId);
  const toIndex = items.findIndex((item) => getId(item) === targetId);
  return moveItem(items, fromIndex, toIndex);
}

/** Scroll step for a pointer sitting near the edge of its scroll container. */
function edgeScrollStep(
  container: HTMLElement,
  point: DragPoint
): { left: number; top: number } {
  const rect = container.getBoundingClientRect();
  if (container.scrollWidth > container.clientWidth) {
    if (point.x <= rect.left + EDGE_SCROLL_ZONE_PX) {
      return { left: -EDGE_SCROLL_STEP_PX, top: 0 };
    }
    if (point.x >= rect.right - EDGE_SCROLL_ZONE_PX) {
      return { left: EDGE_SCROLL_STEP_PX, top: 0 };
    }
    return { left: 0, top: 0 };
  }
  if (point.y <= rect.top + EDGE_SCROLL_ZONE_PX) {
    return { left: 0, top: -EDGE_SCROLL_STEP_PX };
  }
  if (point.y >= rect.bottom - EDGE_SCROLL_ZONE_PX) {
    return { left: 0, top: EDGE_SCROLL_STEP_PX };
  }
  return { left: 0, top: 0 };
}

type OriginState = {
  id: string;
  x: number;
  y: number;
  activated: boolean;
  /** True when movement cancelled a pending hold (scroll / pan). */
  cancelled: boolean;
};

/**
 * Pointer-based list reorder (works with touch).
 * Put `dataAttribute={id}` on each row; start drag via `onPointerDown`.
 */
export function usePointerReorder<T>({
  items,
  getId,
  onReorder,
  onTap,
  disabled = false,
  dataAttribute = DEFAULT_DATA_ATTRIBUTE,
  activationPx = DEFAULT_ACTIVATION_PX,
  holdMs = DEFAULT_HOLD_MS,
  axis = 'both',
  scrollContainerRef,
}: UsePointerReorderOptions<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState<DragPoint | null>(null);
  const pointFrameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<DragPoint | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const getIdRef = useRef(getId);
  getIdRef.current = getId;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const originRef = useRef<OriginState | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const endGestureRef = useRef<(() => void) | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const cancelPointFrame = useCallback(() => {
    if (pointFrameRef.current !== null) {
      window.cancelAnimationFrame(pointFrameRef.current);
      pointFrameRef.current = null;
    }
  }, []);

  /** Throttled so a drag preview can follow the pointer without re-render storms. */
  const queueDragPoint = useCallback((x: number, y: number) => {
    pendingPointRef.current = { x, y };
    if (pointFrameRef.current !== null) {
      return;
    }
    pointFrameRef.current = window.requestAnimationFrame(() => {
      pointFrameRef.current = null;
      if (pendingPointRef.current) {
        setDragPoint(pendingPointRef.current);
      }
    });
  }, []);

  const clearDrag = useCallback(() => {
    clearHoldTimer();
    cancelPointFrame();
    originRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragPoint(null);
  }, [cancelPointFrame, clearHoldTimer]);

  // A gesture outlives renders, so unmounting mid-drag has to tear it down.
  useEffect(() => () => endGestureRef.current?.(), []);

  const activateDrag = useCallback(
    (id: string, handleEl: HTMLElement, pointerId: number) => {
      const origin = originRef.current;
      if (!origin || origin.id !== id || origin.cancelled) {
        return;
      }
      origin.activated = true;
      draggingIdRef.current = id;
      setDraggingId(id);
      setDragPoint({ x: origin.x, y: origin.y });
      // Keep receiving moves once the pointer leaves the row.
      handleEl.setPointerCapture?.(pointerId);
    },
    []
  );

  const onPointerDown = useCallback(
    (id: string, event: ReactPointerEvent<HTMLElement>) => {
      if (disabledRef.current || event.button !== 0) {
        return;
      }
      // One gesture at a time so a second finger cannot hijack the first.
      if (originRef.current) {
        return;
      }

      const useHold =
        holdMs > 0 &&
        (event.pointerType === 'touch' || event.pointerType === 'pen');

      // Only lock the gesture once drag starts so the strip can still scroll.
      if (!useHold) {
        event.preventDefault();
      }

      const handleEl = event.currentTarget;
      const pointerId = event.pointerId;
      clearHoldTimer();
      originRef.current = {
        id,
        x: event.clientX,
        y: event.clientY,
        activated: false,
        cancelled: false,
      };

      let lastPoint: DragPoint = { x: event.clientX, y: event.clientY };
      let edgeFrame: number | null = null;

      const resolveHitPoint = (x: number, y: number) => {
        if (axis === 'both') {
          return { x, y };
        }
        const rect = handleEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { x, y };
        }
        return axis === 'x'
          ? { x, y: rect.top + rect.height / 2 }
          : { x: rect.left + rect.width / 2, y };
      };

      const applyHitTest = (x: number, y: number) => {
        const activeId = draggingIdRef.current;
        if (!activeId) {
          return;
        }
        const hit = resolveHitPoint(x, y);
        const target = document.elementFromPoint(hit.x, hit.y);
        const row = target?.closest(`[${dataAttribute}]`);
        const hitId = row?.getAttribute(dataAttribute);
        if (!hitId || hitId === activeId) {
          return;
        }
        const current = itemsRef.current;
        const next = reorderById(current, getIdRef.current, activeId, hitId);
        if (next === current) {
          return;
        }
        itemsRef.current = next;
        onReorderRef.current(next);
      };

      const stepEdgeScroll = () => {
        edgeFrame = null;
        const container = scrollContainerRef?.current;
        if (!draggingIdRef.current || !container) {
          return;
        }
        const step = edgeScrollStep(container, lastPoint);
        if (step.left !== 0 || step.top !== 0) {
          const fromLeft = container.scrollLeft;
          const fromTop = container.scrollTop;
          container.scrollLeft = fromLeft + step.left;
          container.scrollTop = fromTop + step.top;
          if (
            container.scrollLeft !== fromLeft ||
            container.scrollTop !== fromTop
          ) {
            applyHitTest(lastPoint.x, lastPoint.y);
          }
        }
        edgeFrame = window.requestAnimationFrame(stepEdgeScroll);
      };

      const startDrag = () => {
        activateDrag(id, handleEl, pointerId);
        if (
          draggingIdRef.current === id &&
          scrollContainerRef &&
          edgeFrame === null
        ) {
          edgeFrame = window.requestAnimationFrame(stepEdgeScroll);
        }
      };

      if (useHold) {
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = null;
          const origin = originRef.current;
          if (origin?.id === id && !origin.cancelled) {
            startDrag();
          }
        }, holdMs);
      }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const origin = originRef.current;
        if (!origin) {
          return;
        }
        if (disabledRef.current) {
          endGestureRef.current?.();
          return;
        }

        lastPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
        const dx = moveEvent.clientX - origin.x;
        const dy = moveEvent.clientY - origin.y;
        const movedFar = dx * dx + dy * dy >= activationPx * activationPx;

        if (!origin.activated) {
          if (useHold) {
            if (movedFar) {
              // Treat as scroll / pan — abandon hold-to-drag.
              origin.cancelled = true;
              clearHoldTimer();
            }
            return;
          }
          if (!movedFar) {
            return;
          }
          startDrag();
        }
        moveEvent.preventDefault();

        if (!draggingIdRef.current) {
          return;
        }
        queueDragPoint(moveEvent.clientX, moveEvent.clientY);
        applyHitTest(moveEvent.clientX, moveEvent.clientY);
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        const origin = originRef.current;
        const tappedId =
          origin && !origin.activated && !origin.cancelled ? origin.id : null;
        endGestureRef.current?.();
        if (tappedId) {
          onTapRef.current?.(tappedId);
        }
      };

      endGestureRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (edgeFrame !== null) {
          window.cancelAnimationFrame(edgeFrame);
          edgeFrame = null;
        }
        if (handleEl.hasPointerCapture?.(pointerId)) {
          handleEl.releasePointerCapture(pointerId);
        }
        endGestureRef.current = null;
        clearDrag();
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [
      activateDrag,
      activationPx,
      axis,
      clearDrag,
      clearHoldTimer,
      dataAttribute,
      holdMs,
      queueDragPoint,
      scrollContainerRef,
    ]
  );

  return {
    draggingId,
    dragPoint,
    onPointerDown,
    dataAttribute,
  };
}
