import { describe, expect, it } from 'vitest';
import {
  RICH_HREF_ATTR,
  toStoredRichTextHtml,
} from '../../src/shared/components/ui/RichTextEditor/editorLink';
import {
  isValidLinkUrl,
  normalizeLinkUrl,
} from '../../src/shared/lib/richText';

describe('normalizeLinkUrl', () => {
  it('accepts http(s) urls and normalizes host-only input', () => {
    expect(normalizeLinkUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeLinkUrl('example.com/path')).toBe(
      'https://example.com/path'
    );
    expect(isValidLinkUrl('http://localhost:3000')).toBe(true);
    expect(isValidLinkUrl('192.168.1.1')).toBe(true);
  });

  it('rejects empty, bare protocol, and non-http schemes', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('https://')).toBeNull();
    expect(normalizeLinkUrl('http://')).toBeNull();
    expect(normalizeLinkUrl('not a url')).toBeNull();
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(isValidLinkUrl('ftp://files.example')).toBe(false);
  });

  it('rejects bare numbers that URL would coerce to an IP', () => {
    expect(normalizeLinkUrl('123')).toBeNull();
    expect(normalizeLinkUrl('https://123')).toBeNull();
    expect(isValidLinkUrl('99999')).toBe(false);
  });

  it('rejects hostnames without a real domain TLD', () => {
    expect(normalizeLinkUrl('intranet')).toBeNull();
    expect(normalizeLinkUrl('example')).toBeNull();
    expect(normalizeLinkUrl('http://a.1')).toBeNull();
  });
});

describe('toStoredRichTextHtml', () => {
  it('restores real href from data-rich-href for storage', () => {
    const input = `<p><a class="rich-text-link" ${RICH_HREF_ATTR}="https://example.com/">text</a></p>`;
    expect(toStoredRichTextHtml(input)).toBe(
      '<p><a class="rich-text-link" href="https://example.com/">text</a></p>'
    );
  });
});
