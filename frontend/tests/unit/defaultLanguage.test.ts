import { describe, expect, it } from 'vitest';
import { resolveDefaultLanguage } from '../../src/shared/config/siteLanguages';
import { findCopyWithFallback } from '../../src/shared/lib/copyFallback';
import { resolveBloggerCopy } from '../../src/pages/Admin/Pages/Blogger/utils/resolveBloggerCopy';
import { resolvePostCopy } from '../../src/pages/Admin/Pages/Posts/utils/resolvePostCopy';

describe('resolveDefaultLanguage', () => {
  it('keeps the stored default while it is still offered', () => {
    expect(resolveDefaultLanguage(['en', 'de'], 'de')).toBe('de');
  });

  it('falls back to ko, then the first language', () => {
    expect(resolveDefaultLanguage(['en', 'ko', 'de'], 'fr')).toBe('ko');
    expect(resolveDefaultLanguage(['en', 'de'], null)).toBe('en');
  });
});

describe('findCopyWithFallback', () => {
  const hasBody = (copy: { body: string }) => copy.body.length > 0;

  it('prefers current language, then site default, then en, then any other copy', () => {
    const copies = {
      de: { body: '' },
      fr: { body: 'fr' },
      ja: { body: 'ja' },
      en: { body: 'en' },
      ko: { body: 'ko' },
    };

    expect(
      findCopyWithFallback(copies, {
        language: 'de',
        defaultLanguage: 'ko',
        hasContent: hasBody,
      }),
    ).toEqual({ body: 'ko' });
    expect(
      findCopyWithFallback(copies, {
        language: 'de',
        defaultLanguage: 'it',
        hasContent: hasBody,
      }),
    ).toEqual({ body: 'en' });
    expect(
      findCopyWithFallback(
        { fr: { body: 'fr' }, ja: { body: 'ja' } },
        { language: 'de', defaultLanguage: 'it', hasContent: hasBody },
      ),
    ).toEqual({ body: 'fr' });
  });

  it('returns undefined when no copy has content', () => {
    expect(
      findCopyWithFallback(
        { en: { body: '' } },
        { language: 'de', defaultLanguage: 'ko', hasContent: hasBody },
      ),
    ).toBeUndefined();
  });
});

describe('resolveBloggerCopy', () => {
  it('uses the site default when the current language is empty', () => {
    const copies = {
      ko: { title: '기본', body: '<p>본문</p>' },
      en: { title: 'English', body: '<p>English</p>' },
    };

    expect(resolveBloggerCopy(copies, 'de', 'ko')).toEqual(copies.ko);
  });

  it('works for sites without ko by falling back to the default language', () => {
    const copies = {
      en: { title: 'English', body: '<p>English</p>' },
      de: { title: 'Deutsch', body: '<p>Deutsch</p>' },
    };

    expect(resolveBloggerCopy(copies, 'fr', 'de')).toEqual(copies.de);
    expect(resolveBloggerCopy(copies, 'fr', 'ja')).toEqual(copies.en);
  });

  it('returns an empty copy when nothing has content', () => {
    expect(resolveBloggerCopy(undefined, 'en', 'ko')).toEqual({
      title: '',
      body: '',
    });
  });
});

describe('resolvePostCopy', () => {
  it('skips empty captions in the same fallback order', () => {
    const copies = {
      de: { body: '' },
      ko: { body: '<p>기본</p>' },
      en: { body: '<p>English</p>' },
    };

    expect(resolvePostCopy(copies, 'de', 'ko')).toEqual(copies.ko);
    expect(resolvePostCopy(copies, 'de', 'fr')).toEqual(copies.en);
  });
});
