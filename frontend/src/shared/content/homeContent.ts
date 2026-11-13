import { Language } from '../types/Language';

export type HomeCopy = {
  yearMotto: string;
  bibleVerse: string;
  bibleReference: string;
  heroImages: HomeImage[];
  heroImageId?: string;
  heroSourceFileId?: string;
  panoramaImageId: string;
  panoramaSourceFileId: string;
  youtubeVideoUrls: string[];
};

export type HomeImage = {
  imageId: string;
  sourceFileId: string;
};

export type HomeSharedMedia = Pick<
  HomeCopy,
  | 'heroImages'
  | 'panoramaImageId'
  | 'panoramaSourceFileId'
  | 'youtubeVideoUrls'
>;

export type HomeContentByLanguage = Record<string, HomeCopy>;

export const HOME_PAGE_SLUG = 'home';

export function createEmptyHomeCopy(): HomeCopy {
  return {
    yearMotto: '',
    bibleVerse: '',
    bibleReference: '',
    heroImages: [],
    panoramaImageId: '',
    panoramaSourceFileId: '',
    youtubeVideoUrls: [],
  };
}

export function createEmptyHomeSharedMedia(): HomeSharedMedia {
  return {
    heroImages: [],
    panoramaImageId: '',
    panoramaSourceFileId: '',
    youtubeVideoUrls: [],
  };
}

export function normalizeHomeCopy(copy?: Partial<HomeCopy>): HomeCopy {
  const merged = { ...createEmptyHomeCopy(), ...copy };
  const legacyImage =
    merged.heroImageId || merged.heroSourceFileId
      ? [
          {
            imageId: merged.heroImageId ?? '',
            sourceFileId: merged.heroSourceFileId ?? '',
          },
        ]
      : [];
  const normalized = {
    ...merged,
    heroImages:
      Array.isArray(copy?.heroImages) && copy.heroImages.length > 0
        ? copy.heroImages
        : legacyImage,
  };
  delete normalized.heroImageId;
  delete normalized.heroSourceFileId;
  return normalized;
}

export function isBlankHomeCopy(copy: HomeCopy | undefined): boolean {
  if (!copy) {
    return true;
  }
  const normalized = normalizeHomeCopy(copy);
  return !(
    normalized.yearMotto.trim() ||
    normalized.bibleVerse.trim() ||
    normalized.bibleReference.trim() ||
    normalized.heroImages.some((image) => image.imageId || image.sourceFileId) ||
    normalized.panoramaImageId.trim() ||
    normalized.panoramaSourceFileId.trim() ||
    normalized.youtubeVideoUrls.some((url) => url.trim())
  );
}

export function normalizeSharedHomeMedia(
  content: HomeContentByLanguage
): HomeContentByLanguage {
  const normalized = Object.fromEntries(
    Object.entries(content).map(([language, copy]) => [
      language,
      normalizeHomeCopy(copy),
    ])
  ) as HomeContentByLanguage;
  const sharedImages = getSharedHomeImages(normalized);
  const sharedPanorama = getSharedHomePanorama(normalized);
  const sharedVideoUrls = getSharedHomeVideoUrls(normalized);

  return Object.fromEntries(
    Object.entries(normalized).map(([language, copy]) => [
      language,
      {
        ...copy,
        heroImages: sharedImages,
        ...sharedPanorama,
        youtubeVideoUrls: sharedVideoUrls,
      },
    ])
  );
}

function getSharedHomeImages(content: HomeContentByLanguage): HomeImage[] {
  const englishImages = content[Language.EN]?.heroImages;
  if (englishImages?.some((image) => image.imageId || image.sourceFileId)) {
    return englishImages;
  }
  return (
    Object.values(content).find((copy) =>
      copy.heroImages.some((image) => image.imageId || image.sourceFileId)
    )?.heroImages ?? []
  );
}

function getSharedHomeVideoUrls(content: HomeContentByLanguage): string[] {
  const englishVideoUrls = content[Language.EN]?.youtubeVideoUrls;
  if (englishVideoUrls?.some((url) => url.trim())) {
    return englishVideoUrls;
  }
  return (
    Object.values(content).find((copy) =>
      copy.youtubeVideoUrls.some((url) => url.trim())
    )?.youtubeVideoUrls ?? []
  );
}

function getSharedHomePanorama(
  content: HomeContentByLanguage
): Pick<HomeCopy, 'panoramaImageId' | 'panoramaSourceFileId'> {
  const hasPanorama = (copy: HomeCopy | undefined) =>
    Boolean(copy?.panoramaImageId || copy?.panoramaSourceFileId);
  const englishCopy = content[Language.EN];
  if (hasPanorama(englishCopy)) {
    return {
      panoramaImageId: englishCopy.panoramaImageId,
      panoramaSourceFileId: englishCopy.panoramaSourceFileId,
    };
  }
  const copy = Object.values(content).find(hasPanorama);
  return {
    panoramaImageId: copy?.panoramaImageId ?? '',
    panoramaSourceFileId: copy?.panoramaSourceFileId ?? '',
  };
}

/** Prefer the active language; if blank, use another language that has copy. */
export function resolveHomeCopy(
  content: HomeContentByLanguage,
  language: string
): HomeCopy {
  const normalizedContent = normalizeSharedHomeMedia(content);
  const preferred = normalizedContent[language];
  const sharedImages = getSharedHomeImages(normalizedContent);
  const sharedVideoUrls = getSharedHomeVideoUrls(normalizedContent);
  if (preferred && !isBlankHomeCopy(preferred)) {
    return {
      ...preferred,
      heroImages: sharedImages,
      youtubeVideoUrls: sharedVideoUrls,
    };
  }

  const fallbackCodes = [
    Language.EN,
    ...Object.keys(normalizedContent).filter(
      (code) => code !== language && code !== Language.EN
    ),
  ];

  for (const code of fallbackCodes) {
    const candidate = normalizedContent[code];
    if (candidate && !isBlankHomeCopy(candidate)) {
      return {
        ...candidate,
        heroImages: sharedImages,
        youtubeVideoUrls: sharedVideoUrls,
      };
    }
  }

  return {
    ...(preferred ?? createEmptyHomeCopy()),
    heroImages: sharedImages,
    youtubeVideoUrls: sharedVideoUrls,
  };
}

export function ensureHomeContentLanguage(
  content: HomeContentByLanguage,
  language: string
): HomeContentByLanguage {
  if (content[language]) {
    return content;
  }

  const sharedContent = normalizeSharedHomeMedia(content);
  const heroImages = getSharedHomeImages(sharedContent);
  const panorama = getSharedHomePanorama(sharedContent);
  const youtubeVideoUrls = getSharedHomeVideoUrls(sharedContent);
  return {
    ...sharedContent,
    [language]: {
      ...createEmptyHomeCopy(),
      heroImages,
      ...panorama,
      youtubeVideoUrls,
    },
  };
}
