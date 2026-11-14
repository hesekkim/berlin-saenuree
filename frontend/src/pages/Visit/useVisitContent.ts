import { fetchEditablePageDocument } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  normalizeVisitDocument,
  VISIT_FALLBACK_DOCUMENT,
} from '../../shared/content/publicPageFallbacks';
import { usePublicPageContent } from '../../shared/content/usePublicPageContent';
import {
  resolveVisitCopy,
} from '../../shared/content/visitContent';

const loadVisitContent = () => fetchEditablePageDocument('visit');

export function useVisitContent() {
  const { language } = useConfig();
  const { content: document, hasLoadError } = usePublicPageContent({
    slug: 'visit',
    fallback: VISIT_FALLBACK_DOCUMENT,
    load: loadVisitContent,
    normalize: normalizeVisitDocument,
  });

  return {
    content: resolveVisitCopy(document.content, language),
    sharedMedia: document.sharedMedia,
    hasLoadError,
  };
}
