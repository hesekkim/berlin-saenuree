import { useEffect, useRef, useState } from 'react';

type UsePublicPageContentOptions<T> = {
  slug: string;
  fallback: T;
  load: () => Promise<unknown>;
  normalize: (value: unknown) => T;
  refreshOnFocus?: boolean;
};

const CACHE_PREFIX = 'public-page-content:';

export function usePublicPageContent<T>({
  slug,
  fallback,
  load,
  normalize,
  refreshOnFocus = false,
}: UsePublicPageContentOptions<T>) {
  const [content, setContent] = useState(() =>
    readCachedContent(slug, fallback, normalize),
  );
  const [hasLoadError, setHasLoadError] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      const requestId = ++requestIdRef.current;
      load()
        .then((value) => {
          const nextContent = normalize(value);
          if (!active || requestId !== requestIdRef.current) {
            return;
          }
          setContent(nextContent);
          setHasLoadError(false);
          writeCachedContent(slug, nextContent);
        })
        .catch((error: unknown) => {
          if (!active || requestId !== requestIdRef.current) {
            return;
          }
          console.error(`Failed to load public page content for "${slug}"`, error);
          setHasLoadError(true);
        });
    };

    refresh();
    if (refreshOnFocus) {
      window.addEventListener('focus', refresh);
    }

    return () => {
      active = false;
      requestIdRef.current += 1;
      if (refreshOnFocus) {
        window.removeEventListener('focus', refresh);
      }
    };
  }, [fallback, load, normalize, refreshOnFocus, slug]);

  return { content, hasLoadError };
}

function readCachedContent<T>(
  slug: string,
  fallback: T,
  normalize: (value: unknown) => T,
): T {
  try {
    if (typeof window === 'undefined') {
      return fallback;
    }
    const cached = window.localStorage.getItem(`${CACHE_PREFIX}${slug}`);
    return cached === null ? fallback : normalize(JSON.parse(cached));
  } catch (error) {
    console.error(`Failed to read cached public page content for "${slug}"`, error);
    return fallback;
  }
}

function writeCachedContent<T>(slug: string, content: T) {
  try {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      `${CACHE_PREFIX}${slug}`,
      JSON.stringify(content),
    );
  } catch (error) {
    console.error(`Failed to cache public page content for "${slug}"`, error);
  }
}
