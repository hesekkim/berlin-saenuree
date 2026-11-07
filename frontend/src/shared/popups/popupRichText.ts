/**
 * Popup notice rich HTML — legacy plain migration (ticket 026/027).
 * Sanitize / hasText live in `shared/lib/richText`.
 */

import {
  looksLikeRichHtml,
  richHtmlHasText,
  sanitizeRichHtml,
} from '../lib/richText';

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainStringsToHtml(title: string, body: string): string {
  const parts: string[] = [];
  const titleText = title.trim();
  if (titleText) {
    parts.push(`<p><strong>${escapeText(titleText)}</strong></p>`);
  }
  if (body) {
    for (const line of body.split('\n')) {
      parts.push(`<p>${escapeText(line)}</p>`);
    }
  }
  return sanitizeRichHtml(parts.join(''));
}

export function isBlankPopupBody(body: string | undefined): boolean {
  if (!body) {
    return true;
  }
  return !richHtmlHasText(body);
}

/** Coerce API/legacy copy payload to a single sanitized HTML body. */
export function migratePopupCopyBody(copy: {
  title?: string;
  body?: string;
}): string {
  const title = copy.title?.trim() ?? '';
  const body = copy.body ?? '';
  if (looksLikeRichHtml(body)) {
    const sanitized = sanitizeRichHtml(body);
    if (title && !richHtmlHasText(sanitized)) {
      return plainStringsToHtml(title, '');
    }
    return sanitized;
  }
  return plainStringsToHtml(title, body);
}
