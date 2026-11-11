import { describe, expect, it } from 'vitest';
import {
  isSafeGoogleMapsUrl,
  normalizeVisitSharedMedia,
  normalizeVisitCopy,
  resolveVisitCopy,
} from '../../src/shared/content/visitContent';

describe('visitContent helpers', () => {
  it('uses English copy when the active language is missing', () => {
    const copy = {
      en: {
        address: 'Borsigstraße 5',
        services: [],
        primaryTransit: [],
        secondaryTransit: [],
        googleMapsUrl: '',
      },
    };

    expect(resolveVisitCopy(copy, 'de').address).toBe('Borsigstraße 5');
  });

  it('uses the active language when it contains visit information', () => {
    const copy = {
      en: {
        address: 'English address',
        services: [],
        primaryTransit: [],
        secondaryTransit: [],
        googleMapsUrl: '',
      },
      ko: {
        address: 'Borsigstraße 5',
        services: [],
        primaryTransit: [],
        secondaryTransit: [],
        googleMapsUrl: '',
      },
    };

    expect(resolveVisitCopy(copy, 'ko').address).toBe('Borsigstraße 5');
  });

  it('normalizes malformed content to empty values', () => {
    expect(normalizeVisitCopy({ services: [null], address: 12 })).toMatchObject({
      services: [],
      address: '',
      primaryTransit: [],
      secondaryTransit: [],
      googleMapsUrl: '',
    });
  });

  it('accepts only HTTPS Google Maps links', () => {
    expect(isSafeGoogleMapsUrl('https://www.google.com/maps/place/church')).toBe(
      true,
    );
    expect(isSafeGoogleMapsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeGoogleMapsUrl('https://example.com/maps')).toBe(false);
  });

  it('allows empty image collections', () => {
    expect(
      normalizeVisitSharedMedia({ mapImages: [], venueImages: [] }),
    ).toEqual({ mapImages: [], venueImages: [] });
  });

  it('accepts any number of uploaded media references', () => {
    const images = Array.from({ length: 5 }, (_, index) => ({
      imageId: `image-${index}`,
      sourceFileId: `source-${index}`,
    }));

    expect(
      normalizeVisitSharedMedia({ mapImages: images, venueImages: [] })
        .mapImages,
    ).toEqual(images);
  });
});
