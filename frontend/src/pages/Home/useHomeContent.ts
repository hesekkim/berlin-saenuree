import { useCallback, useEffect, useState } from 'react';
import { fetchPageContent } from '../../shared/api/cmsApi';
import { useConfig } from '../../shared/context/ConfigContext';
import {
  HOME_PAGE_SLUG,
  resolveHomeCopy,
  type HomeContentByLanguage,
} from '../../shared/content/homeContent';

/** Public home page copy for the active site language. */
export function useHomeContent() {
  const { language } = useConfig();
  const [contentByLanguage, setContentByLanguage] =
    useState<HomeContentByLanguage>({});

  const refresh = useCallback(() => {
    fetchPageContent(HOME_PAGE_SLUG)
      .then((content) => {
        setContentByLanguage(content);
      })
      .catch(() => {
        // Keep the last known copy when the API is unavailable.
      });
  }, []);

  useEffect(() => {
    refresh();

    const onFocus = () => {
      refresh();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return {
    content: resolveHomeCopy(contentByLanguage, language),
  };
}
