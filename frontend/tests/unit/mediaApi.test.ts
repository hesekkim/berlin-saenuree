import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadMediaFile } from '../../src/shared/api/mediaApi';
import { apiClient } from '../../src/shared/lib/axios';

describe('uploadMediaFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams videos directly and allows enough time for large uploads', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'video-id',
        url: '/video-id',
        originalName: 'video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 100,
      },
    });

    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    await uploadMediaFile(file, { accept: 'video/mp4,.mp4' });

    expect(post).toHaveBeenCalledWith(
      '/media/files/video',
      file,
      expect.objectContaining({
        params: {
          filename: 'video.mp4',
          accept: 'video/mp4,.mp4',
        },
        headers: { 'Content-Type': 'video/mp4' },
        timeout: 30 * 60 * 1000,
      }),
    );
  });

  it('keeps image uploads as multipart form data', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'image-id',
        url: '/image-id',
        originalName: 'image.png',
        contentType: 'image/png',
        sizeBytes: 5,
      },
    });
    const file = new File(['image'], 'image.png', { type: 'image/png' });

    await uploadMediaFile(file);

    expect(post).toHaveBeenCalledWith(
      '/media/files',
      expect.any(FormData),
      expect.objectContaining({ timeout: undefined }),
    );
  });
});
