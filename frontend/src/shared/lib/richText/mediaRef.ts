/**
 * Canonical shape of media references embedded in rich text.
 * Must stay in sync with backend `services/rich_text.py`.
 */

export const MEDIA_FILE_PATH_PREFIX = '/api/v1/media/files/';
export const MEDIA_IMAGE_PATH_PREFIX = '/api/v1/media/images/';
export const MAX_MEDIA_NAME_LENGTH = 200;
/** Matches `media_files_service.FILE_ID_RE` (uuid4 directory names). */
const MEDIA_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TYPE_RE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/i;
/** Upper bound well above any accepted upload; guards absurd stored values. */
const MAX_MEDIA_SIZE_BYTES = 1024 ** 4;
export const MIN_MEDIA_WIDTH = 32;
export const MAX_MEDIA_WIDTH = 1200;

export function isMediaId(value: string | null | undefined): boolean {
  return MEDIA_ID_RE.test((value ?? '').trim());
}

export function isImageId(value: string | null | undefined): boolean {
  return IMAGE_ID_RE.test((value ?? '').trim());
}

export function mediaFileUrl(
  mediaId: string,
  options: { download?: boolean } = {},
): string {
  return `${MEDIA_FILE_PATH_PREFIX}${mediaId}${
    options.download ? '?download=true' : ''
  }`;
}

export function mediaImageUrl(
  imageId: string,
  variant: 'display' | 'thumb' = 'display',
): string {
  return `${MEDIA_IMAGE_PATH_PREFIX}${imageId}/${variant}`;
}

export function normalizeMediaName(value: string | null | undefined): string {
  return (value ?? '').slice(0, MAX_MEDIA_NAME_LENGTH);
}

export function normalizeMediaContentType(
  value: string | null | undefined,
): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return CONTENT_TYPE_RE.test(normalized) ? normalized : null;
}

export function normalizeMediaSizeBytes(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MEDIA_SIZE_BYTES) {
    return null;
  }
  return size;
}

export function normalizeMediaWidth(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    return null;
  }
  const width = Number(value);
  if (
    !Number.isSafeInteger(width) ||
    width < MIN_MEDIA_WIDTH ||
    width > MAX_MEDIA_WIDTH
  ) {
    return null;
  }
  return width;
}
