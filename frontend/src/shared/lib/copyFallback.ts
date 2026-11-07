type CopyFallbackOptions<T> = {
  language: string;
  defaultLanguage: string;
  hasContent: (copy: T) => boolean;
};

/**
 * Returns the first copy with content in the order: current language,
 * site default language, `en`, then any other copy.
 */
export function findCopyWithFallback<T>(
  copies: Record<string, T>,
  { language, defaultLanguage, hasContent }: CopyFallbackOptions<T>,
): T | undefined {
  const codes = [language, defaultLanguage, 'en', ...Object.keys(copies)];
  for (const code of codes) {
    const copy = copies[code];
    if (copy !== undefined && hasContent(copy)) {
      return copy;
    }
  }
  return undefined;
}
