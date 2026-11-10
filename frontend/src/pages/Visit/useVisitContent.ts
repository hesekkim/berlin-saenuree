import { useEffect, useState } from 'react';
import { fetchEditablePageDocument } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import { resolveVisitCopy, type VisitCopy } from '../../shared/content/visitContent';

export function useVisitContent() {
  const { language } = useConfig();
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEditablePageDocument('visit')
      .then((document) => {
        if (!cancelled) {
          setContent(document.content);
          setHasLoadError(false);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load Visit page content', error);
        if (!cancelled) {
          setHasLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    content: resolveVisitCopy(content, language) as VisitCopy,
    hasLoadError,
  };
}
