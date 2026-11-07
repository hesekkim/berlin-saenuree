import { describe, expect, it } from 'vitest';
import {
  fileMatchesAccept,
  formatAcceptLabels,
  formatMaxSizeLabel,
  validateUploadFile,
} from '../../src/shared/components/ui/Upload/uploadValidation';

function makeFile(
  name: string,
  options: { type?: string; size?: number } = {}
): File {
  const type = options.type ?? 'application/octet-stream';
  const size = options.size ?? 4;
  const buffer = new Uint8Array(size);
  return new File([buffer], name, { type });
}

describe('uploadValidation', () => {
  it('allows any file when accept is empty or *', () => {
    const file = makeFile('a.bin', { type: 'application/octet-stream' });
    expect(fileMatchesAccept(file)).toBe(true);
    expect(fileMatchesAccept(file, '*')).toBe(true);
  });

  it('matches mime and wildcard accept', () => {
    const png = makeFile('pic.png', { type: 'image/png' });
    expect(fileMatchesAccept(png, 'image/png,image/jpeg')).toBe(true);
    expect(fileMatchesAccept(png, 'image/*')).toBe(true);
    expect(fileMatchesAccept(png, 'application/pdf')).toBe(false);
  });

  it('matches extension accept', () => {
    const pdf = makeFile('doc.PDF', { type: 'application/octet-stream' });
    expect(fileMatchesAccept(pdf, '.pdf')).toBe(true);
    expect(fileMatchesAccept(pdf, '.txt')).toBe(false);
  });

  it('rejects oversized files before upload', () => {
    const file = makeFile('big.bin', { size: 100 });
    expect(validateUploadFile(file, { maxSizeBytes: 50 })).toEqual({
      ok: false,
      code: 'size_exceeded',
    });
    expect(validateUploadFile(file, { maxSizeBytes: 100 })).toEqual({ ok: true });
  });

  it('rejects disallowed types before upload', () => {
    const file = makeFile('notes.txt', { type: 'text/plain' });
    expect(
      validateUploadFile(file, { accept: 'image/jpeg,image/png,image/webp' })
    ).toEqual({ ok: false, code: 'type_not_allowed' });
  });

  it('formats accept tokens for constraint row', () => {
    expect(formatAcceptLabels('image/jpeg,image/png,image/webp')).toEqual([
      'JPEG',
      'PNG',
      'WEBP',
    ]);
    expect(formatAcceptLabels('.xls,.xlsx')).toEqual(['XLS', 'XLSX']);
    expect(formatAcceptLabels()).toEqual([]);
  });

  it('formats max size for constraint row', () => {
    expect(formatMaxSizeLabel(10 * 1024 * 1024)).toBe('10MB');
    expect(formatMaxSizeLabel(512 * 1024)).toBe('512KB');
    expect(formatMaxSizeLabel(undefined)).toBeNull();
  });
});
