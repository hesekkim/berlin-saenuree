import { fetchPublicPageContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  CHURCH_VISION_FALLBACK_CONTENT,
  normalizeEditableContent,
} from '../../shared/content/publicPageFallbacks';
import { usePublicPageContent } from '../../shared/content/usePublicPageContent';
import {
  resolveChurchVisionCopy,
} from '../../shared/content/churchVisionContent';

const loadChurchVisionContent = () => fetchPublicPageContent('church-vision');

export function useChurchVisionContent() {
  const { language } = useConfig();
  const { content, hasLoadError } = usePublicPageContent({
    slug: 'church-vision',
    fallback: CHURCH_VISION_FALLBACK_CONTENT,
    load: loadChurchVisionContent,
    normalize: normalizeEditableContent,
  });

  return {
    content: resolveChurchVisionCopy(content, language),
    hasLoadError,
  };
}
