/** Default notice popup surface (charcoal, not pure black). */
export const DEFAULT_NOTICE_BACKGROUND = '#252830';

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeNoticeBackground(
  value: string | null | undefined
): string {
  const trimmed = (value ?? '').trim();
  if (HEX_COLOR_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return DEFAULT_NOTICE_BACKGROUND;
}
