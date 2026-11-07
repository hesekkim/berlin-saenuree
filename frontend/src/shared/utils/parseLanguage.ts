import { Language } from '../types/Language';

/** Returns a Language enum value, or null if the string is not a supported language. */
export function parseLanguage(value: string | null | undefined): Language | null {
  if (value === Language.KO || value === Language.EN || value === Language.DE) {
    return value;
  }
  return null;
}
