import { useEffect, useState } from 'react';
import { fetchPublicChurchHistoryContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import { resolveChurchHistoryCopy } from '../../shared/content/churchHistoryContent';

export function useChurchHistoryContent() {
  const { language } = useConfig();
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicChurchHistoryContent()
      .then((content) => {
        if (!cancelled) {
          setContent(content);
          setHasLoadError(false);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load Church History page content', error);
        if (!cancelled) {
          setHasLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    content: resolveChurchHistoryCopy(content, language),
    hasLoadError,
  };
}
