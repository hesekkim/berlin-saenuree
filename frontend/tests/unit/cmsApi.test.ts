import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pageDocumentFromResponse,
  savePageDocument,
} from '../../src/shared/api/cmsApi';
import { apiClient } from '../../src/shared/lib/axios';
import { createEmptyHomeCopy } from '../../src/shared/content/homeContent';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pageDocumentFromResponse', () => {
  it('converts the legacy Home video field to a video list', () => {
    const document = pageDocumentFromResponse({
      slug: 'home',
      contentRevision: 3,
      content: {
        ko: {
          yearMotto: 'Hope',
          youtubeVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        },
      },
    });

    expect(document.content.ko?.yearMotto).toBe('Hope');
    expect(document.content.ko?.youtubeVideoUrls).toEqual([
      'https://youtu.be/dQw4w9WgXcQ',
    ]);
    expect(document.content.ko?.panoramaImageId).toBe('');
  });

  it('uses the single shared-media payload for every language', () => {
    const sharedMedia = {
      heroImages: [{ imageId: 'hero-image', sourceFileId: 'hero-source' }],
      panoramaImageId: 'panorama-image',
      panoramaSourceFileId: 'panorama-source',
      youtubeVideoUrls: ['dQw4w9WgXcQ'],
    };
    const document = pageDocumentFromResponse({
      slug: 'home',
      contentRevision: 4,
      content: {
        en: { yearMotto: 'English' },
        ko: { yearMotto: '한국어' },
      },
      sharedMedia,
    });

    expect(document.content.en?.yearMotto).toBe('English');
    expect(document.content.ko?.yearMotto).toBe('한국어');
    expect(document.content.en?.heroImages).toEqual(sharedMedia.heroImages);
    expect(document.content.ko?.heroImages).toEqual(sharedMedia.heroImages);
    expect(document.content.ko?.youtubeVideoUrls).toEqual(
      sharedMedia.youtubeVideoUrls
    );
  });

  it('saves Home media once outside language-specific copy', async () => {
    const sharedMedia = {
      heroImages: [{ imageId: 'hero-image', sourceFileId: 'hero-source' }],
      panoramaImageId: 'panorama-image',
      panoramaSourceFileId: 'panorama-source',
      youtubeVideoUrls: ['dQw4w9WgXcQ'],
    };
    const put = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        slug: 'home',
        contentRevision: 5,
        content: {
          en: { yearMotto: 'English' },
        },
        sharedMedia,
      },
    } as never);

    await savePageDocument('home', {
      contentRevision: 4,
      content: {
        en: {
          ...createEmptyHomeCopy(),
          yearMotto: 'English',
          ...sharedMedia,
        },
        ko: {
          ...createEmptyHomeCopy(),
          yearMotto: '한국어',
          ...sharedMedia,
        },
      },
    });

    expect(put).toHaveBeenCalledWith(
      '/pages/home',
      expect.objectContaining({
        contentRevision: 4,
        content: {
          en: {
            yearMotto: 'English',
            bibleVerse: '',
            bibleReference: '',
            pastoralMissionItems: [],
          },
          ko: {
            yearMotto: '한국어',
            bibleVerse: '',
            bibleReference: '',
            pastoralMissionItems: [],
          },
        },
        sharedMedia,
      })
    );
  });
});
