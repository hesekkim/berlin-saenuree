import { useEffect, useState } from 'react';
import { fetchPublicPageContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import { resolveChurchVisionCopy } from '../../shared/content/churchVisionContent';

export function useChurchVisionContent() {
  const { language } = useConfig();
  const [content, setContent] = useState<Record<string, Record<string, unknown>>>({});
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPageContent('church-vision')
      .then((pageContent) => {
        if (!cancelled) {
          setContent(pageContent);
          setHasLoadError(false);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load Church Vision page content', error);
        if (!cancelled) {
          setHasLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    content: resolveChurchVisionCopy(content, language),
    hasLoadError,
  };
}
