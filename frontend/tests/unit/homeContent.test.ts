import { describe, expect, it } from 'vitest';
import { Language } from '../../src/shared/types/Language';
import {
  createEmptyHomeCopy,
  ensureHomeContentLanguage,
  resolveHomeCopy,
} from '../../src/shared/content/homeContent';

describe('homeContent helpers', () => {
  it('ensures a missing language with empty copy for editing', () => {
    const content = ensureHomeContentLanguage(
      {
        [Language.EN]: {
          ...createEmptyHomeCopy(),
          yearMotto: 'EN',
        },
      },
      'fr'
    );

    expect(content.fr).toEqual(createEmptyHomeCopy());
    expect(content[Language.EN].yearMotto).toBe('EN');
  });

  it('resolves blank active language to another language with copy', () => {
    const content = {
      [Language.KO]: {
        ...createEmptyHomeCopy(),
        yearMotto: '',
      },
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        yearMotto: 'English motto',
      },
    };

    expect(resolveHomeCopy(content, Language.KO).yearMotto).toBe('English motto');
    expect(resolveHomeCopy(content, Language.EN).yearMotto).toBe('English motto');
  });

  it('uses hero images from another language when the active language has none', () => {
    const images = [
      { imageId: 'hero-image', sourceFileId: 'hero-source' },
    ];
    const content = {
      [Language.KO]: {
        ...createEmptyHomeCopy(),
        yearMotto: '한국어 표어',
      },
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        heroImages: images,
      },
    };

    expect(resolveHomeCopy(content, Language.KO)).toMatchObject({
      yearMotto: '한국어 표어',
      heroImages: images,
    });
  });

  it('uses one shared hero image list when language entries differ', () => {
    const sharedImages = [
      { imageId: 'english-image', sourceFileId: 'english-source' },
    ];
    const content = {
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        heroImages: sharedImages,
      },
      [Language.KO]: {
        ...createEmptyHomeCopy(),
        heroImages: [{ imageId: 'korean-image', sourceFileId: 'korean-source' }],
      },
    };

    expect(resolveHomeCopy(content, Language.KO).heroImages).toEqual(sharedImages);
  });

  it('uses shared hero images for German when its copy is empty', () => {
    const sharedImages = [
      { imageId: 'english-image', sourceFileId: 'english-source' },
    ];
    const content = {
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        heroImages: sharedImages,
      },
      [Language.DE]: {
        ...createEmptyHomeCopy(),
        yearMotto: 'Deutsches Jahresmotto',
      },
    };

    expect(resolveHomeCopy(content, Language.DE)).toMatchObject({
      yearMotto: 'Deutsches Jahresmotto',
      heroImages: sharedImages,
    });
  });

  it('uses shared worship video URLs for German when its copy is empty', () => {
    const sharedVideoUrls = ['https://youtu.be/dQw4w9WgXcQ'];
    const content = {
      [Language.EN]: {
        ...createEmptyHomeCopy(),
        youtubeVideoUrls: sharedVideoUrls,
      },
      [Language.KO]: {
        ...createEmptyHomeCopy(),
        youtubeVideoUrls: sharedVideoUrls,
      },
      [Language.DE]: {
        ...createEmptyHomeCopy(),
        yearMotto: 'Deutsches Jahresmotto',
      },
    };

    expect(resolveHomeCopy(content, Language.DE)).toMatchObject({
      yearMotto: 'Deutsches Jahresmotto',
      youtubeVideoUrls: sharedVideoUrls,
    });
  });

  it('returns empty copy when every language is blank', () => {
    expect(resolveHomeCopy({}, Language.EN)).toEqual(createEmptyHomeCopy());
  });
});
