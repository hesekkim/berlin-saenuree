import { Language } from '../types/Language';
import type { PopupCopy } from '../api/popupsApi';
import { isBlankPopupBody, migratePopupCopyBody } from './popupRichText';

export function isBlankPopupCopy(copy: PopupCopy | undefined): boolean {
  if (!copy) {
    return true;
  }
  return isBlankPopupBody(copy.body);
}

export function resolvePopupCopy(
  copies: Record<string, PopupCopy>,
  language: string
): PopupCopy {
  const preferred = copies[language];
  if (!isBlankPopupCopy(preferred)) {
    return preferred;
  }

  const fallbackCodes = [
    Language.EN,
    ...Object.keys(copies).filter(
      (code) => code !== language && code !== Language.EN
    ),
  ];

  for (const code of fallbackCodes) {
    const candidate = copies[code];
    if (!isBlankPopupCopy(candidate)) {
      return candidate;
    }
  }

  return preferred ?? { body: '' };
}

/** Normalize API copies that may still include legacy title. */
export function normalizePopupCopies(
  copies: Record<string, PopupCopy & { title?: string }>
): Record<string, PopupCopy> {
  const next: Record<string, PopupCopy> = {};
  for (const [code, copy] of Object.entries(copies)) {
    next[code] = { body: migratePopupCopyBody(copy) };
  }
  return next;
}
