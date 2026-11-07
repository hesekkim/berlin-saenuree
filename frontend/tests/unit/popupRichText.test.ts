import { describe, expect, it } from 'vitest';
import {
  migratePopupCopyBody,
  plainStringsToHtml,
} from '../../src/shared/popups/popupRichText';
import { richHtmlHasText } from '../../src/shared/lib/richText';

describe('popupRichText migration', () => {
  it('migrates legacy plain title and body to HTML', () => {
    const html = migratePopupCopyBody({ title: 'Hello', body: 'World' });
    expect(html).toContain('<strong>Hello</strong>');
    expect(html).toContain('<p>World</p>');
    expect(richHtmlHasText(html)).toBe(true);
  });

  it('plainStringsToHtml escapes raw markup', () => {
    const html = plainStringsToHtml('', '<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
