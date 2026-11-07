import { describe, expect, it } from 'vitest';
import { Language } from '../../src/shared/types/Language';
import {
  DEFAULT_SITE_LANGUAGES,
  addLanguageToList,
  normalizeAvailableLanguages,
  removeLanguageFromList,
  resolveLanguage,
  toContentLanguage,
} from '../../src/shared/config/siteLanguages';

describe('siteLanguages', () => {
  it('keeps world-language codes in selection order', () => {
    expect(normalizeAvailableLanguages(['fr', 'en', 'fr', 'xx'])).toEqual([
      'fr',
      'en',
    ]);
  });

  it('falls back to defaults when the list is empty', () => {
    expect(normalizeAvailableLanguages([])).toEqual(DEFAULT_SITE_LANGUAGES);
  });

  it('adds languages and keeps the last remaining language', () => {
    expect(addLanguageToList(['en'], 'ja')).toEqual(['en', 'ja']);
    expect(removeLanguageFromList(['en'], 'en')).toEqual(['en']);
    expect(removeLanguageFromList(['en', 'ko'], 'en')).toEqual(['ko']);
    expect(removeLanguageFromList(['en', 'ko'], 'ko')).toEqual(['en']);
  });

  it('resolves missing current language to English when available', () => {
    expect(resolveLanguage('ko', ['de', 'en'])).toBe('en');
    expect(resolveLanguage('ko', ['de', 'fr'])).toBe('de');
    expect(resolveLanguage('de', DEFAULT_SITE_LANGUAGES)).toBe('de');
  });

  it('maps unknown site languages to content Language.EN', () => {
    expect(toContentLanguage('fr')).toBe(Language.EN);
    expect(toContentLanguage('ko')).toBe(Language.KO);
  });
});
