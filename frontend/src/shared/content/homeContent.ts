import { Language } from '../types/Language';

export type HomeCopy = {
  title: string;
  subtitle: string;
  description: string;
};

export type HomeContentByLanguage = Record<string, HomeCopy>;

export const HOME_PAGE_SLUG = 'home';

export function createEmptyHomeCopy(): HomeCopy {
  return {
    title: '',
    subtitle: '',
    description: '',
  };
}

export function isBlankHomeCopy(copy: HomeCopy | undefined): boolean {
  if (!copy) {
    return true;
  }
  return ![copy.title, copy.subtitle, copy.description].some((value) =>
    value.trim()
  );
}

/** Prefer the active language; if blank, use another language that has copy. */
export function resolveHomeCopy(
  content: HomeContentByLanguage,
  language: string
): HomeCopy {
  const preferred = content[language];
  if (!isBlankHomeCopy(preferred)) {
    return preferred;
  }

  const fallbackCodes = [
    Language.EN,
    ...Object.keys(content).filter(
      (code) => code !== language && code !== Language.EN
    ),
  ];

  for (const code of fallbackCodes) {
    const candidate = content[code];
    if (!isBlankHomeCopy(candidate)) {
      return candidate;
    }
  }

  return preferred ?? createEmptyHomeCopy();
}

export function ensureHomeContentLanguage(
  content: HomeContentByLanguage,
  language: string
): HomeContentByLanguage {
  if (content[language]) {
    return content;
  }

  return {
    ...content,
    [language]: createEmptyHomeCopy(),
  };
}
