import { describe, expect, it } from 'vitest';
import { Language } from '../../src/shared/types/Language';
import {
  createEmptyHomeCopy,
  ensureHomeContentLanguage,
  hasValidHomeMissionItems,
  normalizeHomeMissionItems,
  resolveHomeCopy,
  updateHomeMissionItem,
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

    expect(content.fr).toEqual({
      ...createEmptyHomeCopy(),
      pastoralMissionItems: ['', '', ''],
    });
    expect(content[Language.EN].yearMotto).toBe('EN');
  });

  it('keeps three editable mission item slots aligned across languages', () => {
    const content = normalizeHomeMissionItems(
      {
        en: {
          ...createEmptyHomeCopy(),
          pastoralMissionItems: ['First', 'Second', 'Third', 'Ignored'],
        },
        ko: {
          ...createEmptyHomeCopy(),
          pastoralMissionItems: ['첫째'],
        },
      },
      ['en', 'ko', 'de']
    );

    expect(content.en.pastoralMissionItems).toEqual(['First', 'Second', 'Third']);
    expect(content.ko.pastoralMissionItems).toEqual(['첫째', '', '']);
    expect(content.de.pastoralMissionItems).toEqual(['', '', '']);
  });

  it('requires 1–3 non-empty mission items in every enabled language', () => {
    const content = normalizeHomeMissionItems(
      {
        en: {
          ...createEmptyHomeCopy(),
          pastoralMissionItems: ['Serve'],
        },
        ko: {
          ...createEmptyHomeCopy(),
          pastoralMissionItems: ['섬김'],
        },
      },
      ['en', 'ko']
    );

    expect(hasValidHomeMissionItems(content, ['en', 'ko'])).toBe(true);
    expect(
      hasValidHomeMissionItems(
        updateHomeMissionItem(content, 'ko', 0, '  '),
        ['en', 'ko']
      )
    ).toBe(false);
    expect(
      hasValidHomeMissionItems(
        normalizeHomeMissionItems({ en: createEmptyHomeCopy() }, ['en']),
        ['en']
      )
    ).toBe(false);
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
