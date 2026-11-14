import { describe, expect, it } from 'vitest';
import { applyPublicPageImageFallback } from '../../src/shared/content/publicPageImage';

describe('public page image fallback', () => {
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
