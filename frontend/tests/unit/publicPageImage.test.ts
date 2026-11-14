import { describe, expect, it } from 'vitest';
import {
  applyPublicPageImageFallback,
  publicPageImageUrl,
} from '../../src/shared/content/publicPageImage';

describe('public page image fallback', () => {
  it('uses the CMS image URL before falling back to bundled assets', () => {
    const imageId = '5516e8cf-4622-49bc-a9b5-9b9500597dfe';

    expect(publicPageImageUrl(imageId, 'display')).toBe(
      `http://localhost:9000/api/v1/media/images/${imageId}/display`,
    );
    expect(publicPageImageUrl('/images/cms-fallback/home/hero-1.webp')).toBe(
      '/images/cms-fallback/home/hero-1.webp',
    );
  });

  it('replaces an unavailable CMS image with its bundled fallback only once', () => {
    const image = document.createElement('img');
    image.src = 'https://api.example.test/media/image-id';

    applyPublicPageImageFallback(
      image,
      '/images/cms-fallback/home/hero-1.webp',
    );
    expect(image.getAttribute('src')).toBe(
      '/images/cms-fallback/home/hero-1.webp',
    );

    applyPublicPageImageFallback(
      image,
      '/images/cms-fallback/home/hero-1.webp',
    );
    expect(image.getAttribute('src')).toBe(
      '/images/cms-fallback/home/hero-1.webp',
    );
  });
});
