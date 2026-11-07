import { describe, expect, it } from 'vitest';
import {
  MAX_BLOGGER_RICH_HTML_LENGTH,
  MAX_RICH_HTML_LENGTH,
  extractMediaIds,
  hasRichHtmlOverLimit,
  richHtmlHasContent,
  richHtmlHasText,
  sanitizeRichHtml,
} from '../../src/shared/lib/richText';

describe('richText sanitize', () => {
  it('sanitizes disallowed markup and invalid links', () => {
    const clean = sanitizeRichHtml(
      '<p>Safe</p><script>evil()</script><a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a>',
    );
    expect(clean.toLowerCase()).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('https://example.com/');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('ok');
  });

  it('keeps allowed styles only', () => {
    const clean = sanitizeRichHtml(
      '<p style="text-align: center; margin: 10px"><span style="color: #abc123; font-size: 18px; width: 100%">Hi</span></p>',
    );
    expect(clean).toContain('text-align: center');
    expect(clean).toContain('color: #abc123');
    expect(clean).toContain('font-size: 18px');
    expect(clean).not.toContain('margin');
    expect(clean).not.toContain('width');
  });

  it('keeps rgb colors rewritten by the browser DOM', () => {
    const clean = sanitizeRichHtml(
      '<p><span style="color: rgb(224, 50, 50)">Red</span></p>',
    );
    expect(clean).toContain('color: #e03232');
    expect(clean).toContain('Red');
  });

  it('keeps color on strong marks', () => {
    const clean = sanitizeRichHtml(
      '<p><strong style="color: #0f8a0f">Green</strong></p>',
    );
    expect(clean).toContain('color: #0f8a0f');
  });

  it('detects empty markup as no text', () => {
    expect(richHtmlHasText('<p></p>')).toBe(false);
    expect(richHtmlHasText('<p><br></p>')).toBe(false);
    expect(richHtmlHasText('<p>Hi</p>')).toBe(true);
  });

  it('never truncates stored html', () => {
    const html = '<p>' + 'x'.repeat(MAX_RICH_HTML_LENGTH + 100) + '</p>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('flags copies whose sanitized body exceeds the limit', () => {
    const atLimit = { ko: { body: 'x'.repeat(MAX_RICH_HTML_LENGTH) } };
    const overLimit = { ko: { body: 'x'.repeat(MAX_RICH_HTML_LENGTH + 1) } };
    expect(hasRichHtmlOverLimit(atLimit, MAX_RICH_HTML_LENGTH)).toBe(false);
    expect(hasRichHtmlOverLimit(overLimit, MAX_RICH_HTML_LENGTH)).toBe(true);
    expect(hasRichHtmlOverLimit(overLimit, MAX_BLOGGER_RICH_HTML_LENGTH)).toBe(false);
  });
});

describe('richText media references', () => {
  const mediaId = '12345678-1234-1234-1234-123456789abc';
  const otherMediaId = 'abcdef01-2345-6789-abcd-ef0123456789';
  const imageHtml =
    `<img data-media-id="${mediaId}" ` +
    `src="/api/v1/media/files/${mediaId}" alt="photo">`;
  const attachmentHtml =
    `<a data-media-kind="attachment" data-media-id="${mediaId}" ` +
    'data-media-name="report.pdf" data-media-content-type="application/pdf" ' +
    `data-media-size="12345" href="/api/v1/media/files/${mediaId}?download=true">report.pdf</a>`;

  it('keeps owned media references and drops external images', () => {
    const clean = sanitizeRichHtml(
      `${imageHtml}<img src="https://example.com/image.png">`,
    );
    expect(clean).toContain(`data-media-id="${mediaId}"`);
    expect(clean).not.toContain('example.com');
  });

  it.each([
    ['32', true],
    ['1200', true],
    ['31', false],
    ['1201', false],
    ['-1', false],
    ['40.5', false],
    ['40px', false],
    ['1e2', false],
    ['+40', false],
  ])('validates image width %s', (width, isValid) => {
    const clean = sanitizeRichHtml(
      `<img data-media-id="${mediaId}" data-media-width="${width}" ` +
        `src="/api/v1/media/files/${mediaId}" alt="photo">`,
    );
    expect(clean.includes(`data-media-width="${width}"`)).toBe(isValid);
    expect(clean.includes(`width="${width}"`)).toBe(isValid);
  });

  it('rejects image style width and preserves valid width on round-trip', () => {
    const clean = sanitizeRichHtml(
      `<img data-media-id="${mediaId}" data-media-width="400" ` +
        `style="width: 9999px" src="/api/v1/media/files/${mediaId}" alt="photo">`,
    );
    expect(clean).toContain('data-media-width="400"');
    expect(clean).toContain('width="400"');
    expect(clean).not.toContain('style=');
    expect(sanitizeRichHtml(clean)).toBe(clean);
  });

  it('preserves attachment metadata so the download UI survives a reload', () => {
    const clean = sanitizeRichHtml(attachmentHtml);
    expect(clean).toContain('data-media-content-type="application/pdf"');
    expect(clean).toContain('data-media-size="12345"');
    expect(sanitizeRichHtml(clean)).toBe(clean);
  });

  it('drops attachment metadata that is not a plain size or MIME type', () => {
    const clean = sanitizeRichHtml(
      `<a data-media-kind="attachment" data-media-id="${mediaId}" ` +
        'data-media-name="r.pdf" data-media-content-type="javascript:alert(1)" ' +
        `data-media-size="-5" href="/api/v1/media/files/${mediaId}?download=true">r.pdf</a>`,
    );
    expect(clean).toContain('data-media-kind="attachment"');
    expect(clean).not.toContain('data-media-content-type');
    expect(clean).not.toContain('data-media-size');
  });

  it.each(['----------------', 'not-a-uuid', `${mediaId}/../../etc`])(
    'rejects non-uuid media id %s',
    (badId) => {
      const clean = sanitizeRichHtml(
        `<img data-media-id="${badId}" src="/api/v1/media/files/${badId}">`,
      );
      expect(clean).not.toContain('<img');
    },
  );

  it('rejects a media url that points at a different file', () => {
    const clean = sanitizeRichHtml(
      `<img data-media-id="${mediaId}" src="/api/v1/media/files/${otherMediaId}">`,
    );
    expect(clean).not.toContain('<img');
  });

  it('drops media attributes on tags that are not media nodes', () => {
    const clean = sanitizeRichHtml(
      `<p data-media-kind="attachment" data-media-id="${mediaId}" ` +
        `href="/api/v1/media/files/${mediaId}?download=true">x</p>`,
    );
    expect(clean).toBe('<p>x</p>');
  });

  it('accepts optimized image references and tracks both source and derivative ids', () => {
    const imageId = 'aaaaaaaa-1234-1234-1234-123456789abc';
    const clean = sanitizeRichHtml(
      `<img data-media-id="${mediaId}" data-image-id="${imageId}" ` +
        `data-media-width="400" src="/api/v1/media/images/${imageId}/display" alt="photo">`,
    );
    expect(clean).toContain(`data-media-id="${mediaId}"`);
    expect(clean).toContain(`data-image-id="${imageId}"`);
    expect(clean).toContain(`/api/v1/media/images/${imageId}/display`);
    expect(extractMediaIds(clean)).toEqual([mediaId, imageId]);
  });

  it('extracts referenced media ids in order without duplicates', () => {
    const clean = sanitizeRichHtml(
      `${attachmentHtml}${imageHtml}` +
        `<img data-media-id="${otherMediaId}" src="/api/v1/media/files/${otherMediaId}">`,
    );
    expect(extractMediaIds(clean)).toEqual([mediaId, otherMediaId]);
  });

  it('treats a media-only body as content', () => {
    const clean = sanitizeRichHtml(`<p>${imageHtml}</p>`);
    expect(richHtmlHasText(clean)).toBe(false);
    expect(richHtmlHasContent(clean)).toBe(true);
    expect(richHtmlHasContent('<p></p>')).toBe(false);
  });
});
