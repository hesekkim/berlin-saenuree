import { fetchPageContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  HOME_FALLBACK_CONTENT,
  normalizeHomePageContent,
} from '../../shared/content/publicPageFallbacks';
import { usePublicPageContent } from '../../shared/content/usePublicPageContent';
import {
  HOME_PAGE_SLUG,
  resolveHomeCopy,
} from '../../shared/content/homeContent';

const loadHomeContent = () => fetchPageContent(HOME_PAGE_SLUG);

/** Public home page copy for the active site language. */
export function useHomeContent() {
  const { language } = useConfig();
  const { content } = usePublicPageContent({
    slug: HOME_PAGE_SLUG,
    fallback: HOME_FALLBACK_CONTENT,
    load: loadHomeContent,
    normalize: normalizeHomePageContent,
    refreshOnFocus: true,
  });

  return {
    content: resolveHomeCopy(content, language),
  };
}
