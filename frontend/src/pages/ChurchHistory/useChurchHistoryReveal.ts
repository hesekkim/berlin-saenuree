import { useEffect, useRef, useState } from 'react';

export function useChurchHistoryReveal(eventIds: string[]) {
  const timelineRef = useRef<HTMLOListElement>(null);
  const eventKey = eventIds.join('\0');
  const [isRevealEnabled, setIsRevealEnabled] = useState(false);
  const [revealedEvents, setRevealedEvents] = useState<string[]>([]);
  const [activeEventId, setActiveEventId] = useState(eventIds[0] ?? '');
  const activeEventIdRef = useRef(eventIds[0] ?? '');

  useEffect(() => {
    const ids = eventKey ? eventKey.split('\0') : [];
    activeEventIdRef.current = ids[0] ?? '';
    setActiveEventId(ids[0] ?? '');
    setRevealedEvents((current) =>
      current.filter((id) => ids.includes(id)),
    );

    if (
      ids.length === 0 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      setIsRevealEnabled(false);
      return;
    }

    const items = timelineRef.current?.querySelectorAll<HTMLElement>(
      '[data-history-event]',
    );
    if (!items?.length) {
      setIsRevealEnabled(false);
      return;
    }

    setIsRevealEnabled(true);
    const visibleEvents = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.historyEvent;
          if (!id) {
            continue;
          }
          if (entry.isIntersecting) {
            visibleEvents.add(id);
            activeEventIdRef.current = id;
            setActiveEventId(id);
          } else {
            visibleEvents.delete(id);
            if (id === activeEventIdRef.current && visibleEvents.size > 0) {
              const nextActiveId = [...visibleEvents][visibleEvents.size - 1];
              activeEventIdRef.current = nextActiveId;
              setActiveEventId(nextActiveId);
            }
          }
        }
        setRevealedEvents([...visibleEvents]);
      },
      { threshold: 0.8, rootMargin: '0px' },
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [eventKey]);

  return { timelineRef, isRevealEnabled, revealedEvents, activeEventId };
}
