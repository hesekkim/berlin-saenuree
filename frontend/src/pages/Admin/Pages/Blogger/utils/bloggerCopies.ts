import type { BloggerCopy } from '../../../../../shared/api/bloggerApi';
import { richHtmlHasContent } from '../../../../../shared/lib/richText';

export const EMPTY_BODY_HTML = '<p></p>';

export function emptyCopy(): BloggerCopy {
  return { title: '', body: EMPTY_BODY_HTML };
}

export function cloneCopies(
  copies: Record<string, BloggerCopy> | undefined,
): Record<string, BloggerCopy> {
  const next: Record<string, BloggerCopy> = {};
  for (const [language, copy] of Object.entries(copies ?? {})) {
    next[language] = {
      title: copy.title ?? '',
      body: copy.body || EMPTY_BODY_HTML,
    };
  }
  return next;
}

export function upsertCopyField(
  copies: Record<string, BloggerCopy>,
  language: string,
  field: 'title' | 'body',
  value: string,
): Record<string, BloggerCopy> {
  const current = copies[language] ?? emptyCopy();
  return {
    ...copies,
    [language]: {
      ...current,
      [field]: value,
    },
  };
}

export function hasPublishableDefaultCopy(
  copies: Record<string, BloggerCopy>,
  defaultLanguage: string,
): boolean {
  const copy = copies[defaultLanguage];
  if (!copy) {
    return false;
  }
  return copy.title.trim().length > 0 && richHtmlHasContent(copy.body);
}

export function copiesEqual(
  left: Record<string, BloggerCopy>,
  right: Record<string, BloggerCopy>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false;
    }
    const language = leftKeys[index];
    const leftCopy = left[language];
    const rightCopy = right[language];
    if (
      (leftCopy?.title ?? '') !== (rightCopy?.title ?? '') ||
      (leftCopy?.body || EMPTY_BODY_HTML) !==
        (rightCopy?.body || EMPTY_BODY_HTML)
    ) {
      return false;
    }
  }
  return true;
}

export function sanitizeCopiesForSave(
  copies: Record<string, BloggerCopy>,
): Record<string, BloggerCopy> {
  const next: Record<string, BloggerCopy> = {};
  for (const [language, copy] of Object.entries(copies)) {
    const title = copy.title.trim();
    const body = copy.body || EMPTY_BODY_HTML;
    if (!title && !richHtmlHasContent(body)) {
      continue;
    }
    next[language] = { title, body };
  }
  return next;
}
