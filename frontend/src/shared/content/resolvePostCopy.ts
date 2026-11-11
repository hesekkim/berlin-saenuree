import { richHtmlHasText } from '../lib/richText';
import { findCopyWithFallback } from '../lib/copyFallback';
import type { PostCopy } from '../api/postsApi';

/** Current language, site default, en, then any other non-empty caption. */
export function resolvePostCopy(
  copies: Record<string, PostCopy>,
  language: string,
  defaultLanguage: string,
): PostCopy {
  return (
    findCopyWithFallback(copies, {
      language,
      defaultLanguage,
      hasContent: (copy) => richHtmlHasText(copy.body),
    }) ??
    copies[language] ?? { body: '' }
  );
}
