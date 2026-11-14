import { fetchPublicChurchHistoryContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  CHURCH_HISTORY_FALLBACK_CONTENT,
  normalizeEditableContent,
} from '../../shared/content/publicPageFallbacks';
import { usePublicPageContent } from '../../shared/content/usePublicPageContent';
import {
  resolveChurchHistoryCopy,
} from '../../shared/content/churchHistoryContent';

const loadChurchHistoryContent = () => fetchPublicChurchHistoryContent();

export function useChurchHistoryContent() {
  const { language } = useConfig();
  const { content, hasLoadError } = usePublicPageContent({
    slug: 'church-history',
    fallback: CHURCH_HISTORY_FALLBACK_CONTENT,
    load: loadChurchHistoryContent,
    normalize: normalizeEditableContent,
  });

  return {
    content: resolveChurchHistoryCopy(content, language),
    hasLoadError,
  };
}
