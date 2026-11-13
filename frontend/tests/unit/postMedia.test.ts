import { describe, expect, it } from 'vitest';
import {
  getPostMediaMaxBytes,
  VIDEO_MAX_BYTES,
} from '../../src/pages/Admin/Pages/Posts/utils/postMedia';

describe('post media upload limits', () => {
  it('allows the provided MP4 within the 100 MiB video limit', () => {
    const file = new File(['video'], 'Saenuri_MT_2022.mp4', {
      type: 'video/mp4',
    });
    const providedFileSizeBytes = 88_181_924;

    expect(getPostMediaMaxBytes(file)).toBe(100 * 1024 * 1024);
    expect(providedFileSizeBytes).toBeLessThan(VIDEO_MAX_BYTES);
  });
});
