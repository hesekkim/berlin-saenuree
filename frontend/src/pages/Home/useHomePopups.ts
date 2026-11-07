import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  fetchPublishedPopups,
  type PublishedPopup,
} from '../../shared/api/popupsApi';
import { resolvePopupCopy } from '../../shared/popups/resolvePopupCopy';

const CLOSE_LABELS: Record<string, string> = {
  en: 'Close',
  ko: '닫기',
  de: 'Schließen',
};

export function useHomePopups() {
  const { language } = useConfig();
  const [queue, setQueue] = useState<PublishedPopup[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const published = await fetchPublishedPopups();
        if (cancelled) {
          return;
        }
        const sorted = [...published].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
        );
        setQueue(sorted);
      } catch {
        if (!cancelled) {
          setQueue([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue[0] ?? null;
  const copy = useMemo(
    () =>
      current
        ? resolvePopupCopy(current.copies, language)
        : { body: '' },
    [current, language]
  );

  const dismissCurrent = useCallback(() => {
    if (!current) {
      return;
    }
    setQueue((prev) => prev.filter((item) => item.id !== current.id));
  }, [current]);

  const closeLabel = CLOSE_LABELS[language] ?? CLOSE_LABELS.en;

  return {
    current,
    copy,
    closeLabel,
    dismissCurrent,
  };
}
