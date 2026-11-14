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

const fallbackImageUrls: Record<string, string> = {
  '5516e8cf-4622-49bc-a9b5-9b9500597dfe':
    publicPageImageFallbacks.homeHero[0],
  'e0c98859-7655-4b63-a126-ba1737831ab9':
    publicPageImageFallbacks.homeHero[1],
  '2b449924-8222-4cd5-9964-95b4f9df8f38':
    publicPageImageFallbacks.homeHero[2],
  'fd3d3779-a7c1-4684-ab62-492f157e8d65':
    publicPageImageFallbacks.homePanorama,
  'c10e169f-e469-46de-b7a8-6a865a2403d3':
    publicPageImageFallbacks.visitMap[0],
  '4ff9480f-4510-4623-a1d2-fd790822781c':
    publicPageImageFallbacks.visitMap[1],
  '9c5fc7d3-ff16-4175-b491-1344ba92e313':
    publicPageImageFallbacks.visitMap[2],
  '24578012-ce9d-4df1-9d4e-ae36b8efc62a':
    publicPageImageFallbacks.visitMap[3],
  '17aedd74-ee1e-4cc8-86d2-f4ca19adbb71':
    publicPageImageFallbacks.visitVenue[0],
  'e4a1c778-abc4-460d-9511-d81d281ae2ce':
    publicPageImageFallbacks.visitVenue[1],
  'd70f3e0b-1ec1-481d-b7e8-a1258b78f031':
    publicPageImageFallbacks.visitVenue[2],
  'f446ad1d-e1d0-44bc-ba03-1ee9ee488e8f':
    publicPageImageFallbacks.visitVenue[3],
};

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
  return (
    fallbackImageUrls[imageIdOrUrl] ??
    mediaImageAbsoluteUrl(imageIdOrUrl, variant)
  );
}
