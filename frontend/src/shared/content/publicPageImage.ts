import { mediaImageAbsoluteUrl } from '../api/mediaApi';

export const publicPageImageFallbacks = {
  homeHero: [
    '/images/cms-fallback/home/hero-1.webp',
    '/images/cms-fallback/home/hero-2.webp',
    '/images/cms-fallback/home/hero-3.webp',
  ],
  homePanorama: '/images/cms-fallback/home/panorama.webp',
  visitMap: [
    '/images/cms-fallback/visit/mapImages-1.webp',
    '/images/cms-fallback/visit/mapImages-2.webp',
    '/images/cms-fallback/visit/mapImages-3.webp',
    '/images/cms-fallback/visit/mapImages-4.webp',
  ],
  visitVenue: [
    '/images/cms-fallback/visit/venueImages-1.webp',
    '/images/cms-fallback/visit/venueImages-2.webp',
    '/images/cms-fallback/visit/venueImages-3.webp',
    '/images/cms-fallback/visit/venueImages-4.webp',
  ],
  churchHistoryEvent: [
    '/images/church-history/20130512.webp',
    '/images/church-history/20131025.webp',
    '/images/church-history/20150125.webp',
    '/images/church-history/20201213.webp',
    '/images/church-history/20210704.webp',
  ],
} as const;

export function indexedPublicPageImageFallback(
  images: readonly string[],
  index: number,
): string | undefined {
  return images[index] ?? images[0];
}

export function applyPublicPageImageFallback(
  image: HTMLImageElement,
  fallbackUrl: string | undefined,
) {
  if (!fallbackUrl) {
    return;
  }

  const resolvedFallbackUrl = new URL(
    fallbackUrl,
    image.ownerDocument.baseURI,
  ).href;
  if (
    image.src === resolvedFallbackUrl ||
    image.dataset.failedSource === image.src
  ) {
    return;
  }

  image.dataset.failedSource = image.src;
  image.src = fallbackUrl;
}

export function publicPageImageUrl(
  imageIdOrUrl: string,
  variant: 'display' | 'thumb' = 'display',
): string {
  if (imageIdOrUrl.startsWith('/images/cms-fallback/')) {
    return imageIdOrUrl;
  }
  return mediaImageAbsoluteUrl(imageIdOrUrl, variant);
}
