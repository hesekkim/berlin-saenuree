import { Language } from '../types/Language';
import { parseLanguage } from '../utils/parseLanguage';
import {
  getWorldLanguageNativeName,
  isWorldLanguageCode,
} from './worldLanguages';

export const DEFAULT_SITE_LANGUAGES: string[] = [
  Language.EN,
  Language.KO,
  Language.DE,
];

/** Native display name for tags, navbar, CMS language pickers. */
export function getLanguageLabel(code: string): string {
  return getWorldLanguageNativeName(code);
}

export function normalizeAvailableLanguages(
  languages: readonly string[]
): string[] {
  const unique: string[] = [];
  for (const code of languages) {
    if (!isWorldLanguageCode(code) || unique.includes(code)) {
      continue;
    }
    unique.push(code);
  }
  return unique.length > 0 ? unique : [...DEFAULT_SITE_LANGUAGES];
}

export function addLanguageToList(
  current: readonly string[],
  language: string
): string[] {
  return normalizeAvailableLanguages([...current, language]);
}

/** Keeps the last remaining language; any code including en may be removed otherwise. */
export function removeLanguageFromList(
  current: readonly string[],
  language: string
): string[] {
  if (current.length <= 1 && current.includes(language)) {
    return normalizeAvailableLanguages(current);
  }
  return normalizeAvailableLanguages(
    current.filter((item) => item !== language)
  );
}

export function resolveLanguage(
  current: string,
  available: readonly string[]
): string {
  if (available.includes(current)) {
    return current;
  }
  if (available.includes(Language.EN)) {
    return Language.EN;
  }
  return available[0] ?? Language.EN;
}

/** Mirrors backend `resolve_default_language`: stored if offered, else ko, else the first language. */
export function resolveDefaultLanguage(
  available: readonly string[],
  stored: string | null | undefined
): string {
  if (stored && available.includes(stored)) {
    return stored;
  }
  if (available.includes(Language.KO)) {
    return Language.KO;
  }
  return available[0] ?? Language.EN;
}

/** Resolve user-facing UI copy language; codes without ko/en/de translations use English. */
export function toContentLanguage(code: string): Language {
  return parseLanguage(code) ?? Language.EN;
}
