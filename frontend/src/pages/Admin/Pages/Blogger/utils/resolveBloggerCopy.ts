import { richHtmlHasText } from '../../../../../shared/lib/richText';
import { findCopyWithFallback } from '../../../../../shared/lib/copyFallback';
import type { BloggerCopy } from '../../../../../shared/api/bloggerApi';

function hasContent(copy: BloggerCopy): boolean {
  return Boolean(copy.title.trim() || richHtmlHasText(copy.body));
}

/** Current language, then the site default, then en, then any other copy. */
export function resolveBloggerCopy(
  copies: Record<string, BloggerCopy> | undefined,
  language: string,
  defaultLanguage: string,
): BloggerCopy {
  const source = copies ?? {};
  return (
    findCopyWithFallback(source, { language, defaultLanguage, hasContent }) ??
    source[language] ??
    Object.values(source)[0] ?? { title: '', body: '' }
  );
}
