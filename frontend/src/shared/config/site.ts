import { Language } from '../types/Language';
import { toContentLanguage } from './siteLanguages';

/**
 * Site-wide placeholders.
 * Replace these values when starting a new project from this skeleton.
 */
export const SITE_NAME = 'Berlin Saenuree';
export const CHURCH_NAMES: Record<Language, string> = {
  [Language.KO]: '베를린 새누리교회',
  [Language.EN]: 'Berlin saenuree Church',
  [Language.DE]: 'Berliner saenuree-Gemeinde',
};

export function getChurchName(language: string): string {
  return CHURCH_NAMES[toContentLanguage(language)];
}

export const SITE_TAGLINE = 'A simple starter website';
export const SITE_DESCRIPTION =
  'Replace this text with a short introduction for your project.';
export const SITE_URL = 'https://example.com';
export const SITE_EMAIL = 'hello@example.com';
export const SITE_INSTAGRAM = 'https://www.instagram.com/example';
export const SITE_FACEBOOK = 'https://www.facebook.com/example';
