/**
 * Shared rich HTML sanitize (editor subset).
 * Allowlist matches backend `services/rich_text.py` and RichTextEditor output.
 */

import { normalizeLinkUrl } from './linkUrl';
import {
  isImageId,
  isMediaId,
  mediaFileUrl,
  mediaImageUrl,
  normalizeMediaContentType,
  normalizeMediaName,
  normalizeMediaSizeBytes,
  normalizeMediaWidth,
} from './mediaRef';

export const MAX_RICH_HTML_LENGTH = 20_000;
/** Blogger body limit. Must match `MAX_BLOGGER_RICH_HTML_LENGTH` in backend `services/rich_text.py`. */
export const MAX_BLOGGER_RICH_HTML_LENGTH = 200_000;

/** True when any sanitized body is longer than `maxLength`. Used to reject saves, never to cut. */
export function hasRichHtmlOverLimit(
  copies: Record<string, { body: string }>,
  maxLength: number,
): boolean {
  return Object.values(copies).some((copy) => copy.body.length > maxLength);
}

const ALLOWED_TAGS = new Set([
  'P',
  'UL',
  'OL',
  'LI',
  'STRONG',
  'EM',
  'B',
  'I',
  'U',
  'S',
  'A',
  'SPAN',
  'BR',
  'IMG',
]);

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'NOSCRIPT',
]);

const TAG_ALIASES: Record<string, string> = {
  B: 'STRONG',
  I: 'EM',
};

const ALLOWED_ALIGN = new Set(['left', 'center', 'right']);
const ALLOWED_FONT_SIZES = new Set([
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
]);
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB_COLOR_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;
const HTML_HINT_RE = /<\/?(?:p|ul|ol|li|strong|em|b|i|u|s|a|span|br|img)\b/i;
const INLINE_STYLE_TAGS = new Set(['SPAN', 'STRONG', 'EM', 'U', 'S']);

export function looksLikeRichHtml(text: string): boolean {
  return HTML_HINT_RE.test(text);
}

/** Accept #hex / rgb() / rgba() — browsers often rewrite hex to rgb in the DOM. */
function normalizeColorValue(raw: string): string | null {
  const value = raw.trim();
  if (HEX_COLOR_RE.test(value)) {
    if (value.length === 4) {
      return (
        '#' +
        value
          .slice(1)
          .toLowerCase()
          .split('')
          .map((ch) => ch + ch)
          .join('')
      );
    }
    return value.toLowerCase();
  }
  const match = RGB_COLOR_RE.exec(value);
  if (!match) {
    return null;
  }
  const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (channels.some((channel) => channel > 255)) {
    return null;
  }
  return (
    '#' +
    channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')
  );
}

function sanitizeStyle(
  style: string,
  options: { allowAlign: boolean },
): string | null {
  const kept: string[] = [];
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) {
      continue;
    }
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (prop === 'color') {
      const color = normalizeColorValue(value);
      if (color) {
        kept.push(`color: ${color}`);
      }
    } else if (
      prop === 'font-size' &&
      ALLOWED_FONT_SIZES.has(value.replace(/\s+/g, ''))
    ) {
      kept.push(`font-size: ${value.replace(/\s+/g, '')}`);
    } else if (
      options.allowAlign &&
      prop === 'text-align' &&
      ALLOWED_ALIGN.has(value.toLowerCase())
    ) {
      kept.push(`text-align: ${value.toLowerCase()}`);
    }
  }
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Attachments keep name/size/content-type so the editor and the read-only
 * renderer can show the download UI without a metadata round-trip.
 */
function applyAttachmentAttributes(source: Element, target: Element): boolean {
  const mediaId = (source.getAttribute('data-media-id') ?? '').trim();
  const href = (source.getAttribute('href') ?? '').trim();
  if (
    !isMediaId(mediaId) ||
    href !== mediaFileUrl(mediaId, { download: true })
  ) {
    return false;
  }
  target.setAttribute('data-media-id', mediaId);
  target.setAttribute('data-media-kind', 'attachment');
  target.setAttribute(
    'data-media-name',
    normalizeMediaName(source.getAttribute('data-media-name')),
  );
  const contentType = normalizeMediaContentType(
    source.getAttribute('data-media-content-type'),
  );
  if (contentType) {
    target.setAttribute('data-media-content-type', contentType);
  }
  const sizeBytes = normalizeMediaSizeBytes(
    source.getAttribute('data-media-size'),
  );
  if (sizeBytes !== null) {
    target.setAttribute('data-media-size', String(sizeBytes));
  }
  target.setAttribute('href', href);
  return true;
}

function applyAllowedAttributes(
  source: Element,
  target: Element,
  tag: string,
): boolean {
  if (tag === 'A') {
    if (source.getAttribute('data-media-kind') === 'attachment') {
      return applyAttachmentAttributes(source, target);
    }
    const href = normalizeLinkUrl(source.getAttribute('href') ?? '');
    if (!href) {
      return false;
    }
    target.setAttribute('href', href);
    target.setAttribute('rel', 'noopener noreferrer nofollow');
    target.setAttribute('target', '_blank');
    const className = source.getAttribute('class') ?? '';
    if (className.split(/\s+/).includes('rich-text-link')) {
      target.setAttribute('class', 'rich-text-link');
    }
    return true;
  }

  if (tag === 'IMG') {
    const mediaId = (source.getAttribute('data-media-id') ?? '').trim();
    const imageId = (source.getAttribute('data-image-id') ?? '').trim();
    const src = (source.getAttribute('src') ?? '').trim();
    const validSourceId = isMediaId(mediaId);
    const validImageId = isImageId(imageId);
    const allowedSources = new Set<string>([
      validSourceId ? mediaFileUrl(mediaId) : '',
    ]);
    if (validImageId) {
      allowedSources.add(mediaImageUrl(imageId, 'display'));
    }
    if (!validSourceId || !allowedSources.has(src)) {
      return false;
    }
    target.setAttribute('data-media-id', mediaId);
    if (validImageId) {
      target.setAttribute('data-image-id', imageId);
    }
    target.setAttribute('src', src);
    target.setAttribute('alt', normalizeMediaName(source.getAttribute('alt')));
    const width = normalizeMediaWidth(source.getAttribute('data-media-width'));
    if (width !== null) {
      target.setAttribute('data-media-width', String(width));
      target.setAttribute('width', String(width));
    }
    return true;
  }

  if (tag === 'P' || tag === 'LI') {
    const style = sanitizeStyle(source.getAttribute('style') ?? '', {
      allowAlign: true,
    });
    if (style) {
      target.setAttribute('style', style);
    }
    return true;
  }

  if (INLINE_STYLE_TAGS.has(tag)) {
    const style = sanitizeStyle(source.getAttribute('style') ?? '', {
      allowAlign: false,
    });
    if (style) {
      target.setAttribute('style', style);
    }
    return true;
  }

  return true;
}

function rewriteNode(node: Node, parent: Element): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.appendChild(document.createTextNode(node.textContent ?? ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const el = node as Element;
  const rawTag = el.tagName.toUpperCase();
  if (SKIP_TAGS.has(rawTag)) {
    return;
  }

  if (!ALLOWED_TAGS.has(rawTag)) {
    for (const child of [...el.childNodes]) {
      rewriteNode(child, parent);
    }
    return;
  }

  const tag = TAG_ALIASES[rawTag] ?? rawTag;
  if (tag === 'BR') {
    parent.appendChild(document.createElement('br'));
    return;
  }

  const next = document.createElement(tag.toLowerCase());
  if (!applyAllowedAttributes(el, next, tag)) {
    for (const child of [...el.childNodes]) {
      rewriteNode(child, parent);
    }
    return;
  }

  for (const child of [...el.childNodes]) {
    rewriteNode(child, next);
  }
  parent.appendChild(next);
}

/** Sanitize HTML for storage/public render. Disallowed markup is dropped. Never truncates. */
export function sanitizeRichHtml(html: string): string {
  const text = String(html ?? '');
  if (!text.trim()) {
    return '';
  }
  if (typeof DOMParser === 'undefined') {
    return '';
  }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const wrapper = document.createElement('div');
  for (const child of [...doc.body.childNodes]) {
    rewriteNode(child, wrapper);
  }
  return wrapper.innerHTML.trim();
}

export function richHtmlPlainText(html: string): string {
  if (!html) {
    return '';
  }
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}

export function richHtmlHasText(html: string): boolean {
  return richHtmlPlainText(html).length > 0;
}

/** Media ids referenced by sanitized HTML, in document order, deduplicated. */
export function extractMediaIds(html: string): string[] {
  if (!html || typeof DOMParser === 'undefined') {
    return [];
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const el of doc.querySelectorAll('*')) {
    const mediaId = (el.getAttribute('data-media-id') ?? '').trim();
    if (isMediaId(mediaId) && !seen.has(mediaId)) {
      seen.add(mediaId);
      ids.push(mediaId);
    }
    const imageId = (el.getAttribute('data-image-id') ?? '').trim();
    if (isImageId(imageId) && !seen.has(imageId)) {
      seen.add(imageId);
      ids.push(imageId);
    }
  }
  return ids;
}

/** Media-only bodies carry no text but are still content. */
export function richHtmlHasContent(html: string): boolean {
  return richHtmlHasText(html) || extractMediaIds(html).length > 0;
}
