import { describe, expect, it } from 'vitest';
import { Language } from '../../src/shared/context/ConfigContext';
import { parseLanguage } from '../../src/shared/utils/parseLanguage';

describe('parseLanguage', () => {
  it('accepts supported language codes', () => {
    expect(parseLanguage('ko')).toBe(Language.KO);
    expect(parseLanguage('en')).toBe(Language.EN);
    expect(parseLanguage('de')).toBe(Language.DE);
  });

  it('rejects unsupported values', () => {
    expect(parseLanguage('fr')).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage(null)).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
  });
});
