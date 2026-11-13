import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadItem } from '../../src/shared/components/ui/Upload/useUpload';
import type { MediaFileResponse } from '../../src/shared/api/mediaApi';
import { adminTranslations } from '../../src/pages/Admin/translations';
import {
  computeCanGoNextFromPhotos,
  takeImagesWithinLimit,
  usePostComposer,
} from '../../src/pages/Admin/Pages/Posts/hooks/usePostComposer';

const renewVideoUploadLease = vi.fn();
const deleteMediaFile = vi.fn();
const optimizeMediaImage = vi.fn();

vi.mock('../../src/shared/api/postsApi', () => ({
  createAdminPost: vi.fn(),
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
  deleteOptimizedImage: vi.fn(),
  optimizeMediaImage: (...args: unknown[]) => optimizeMediaImage(...args),
  renewVideoUploadLease: (...args: unknown[]) =>
    renewVideoUploadLease(...args),
  uploadMediaFile: vi.fn(),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('../../src/pages/Admin/Pages/Posts/utils/postMedia', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/pages/Admin/Pages/Posts/utils/postMedia')
    >();
  return {
    ...actual,
    readVideoDimensions: vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
    }),
  };
});

beforeEach(() => {
  renewVideoUploadLease.mockReset();
  renewVideoUploadLease.mockResolvedValue(undefined);
  deleteMediaFile.mockReset();
  deleteMediaFile.mockResolvedValue(undefined);
  optimizeMediaImage.mockReset();
  optimizeMediaImage.mockResolvedValue({
    imageId: 'image-id',
    sourceFileId: 'image-source-id',
    width: 1200,
    height: 800,
  });
});

describe('computeCanGoNextFromPhotos', () => {
  it('requires at least one image and idle uploads', () => {
    expect(computeCanGoNextFromPhotos(0, false, false)).toBe(false);
    expect(computeCanGoNextFromPhotos(1, true, false)).toBe(false);
    expect(computeCanGoNextFromPhotos(1, false, true)).toBe(false);
    expect(computeCanGoNextFromPhotos(2, false, false)).toBe(true);
  });
});

describe('usePostComposer video upload leases', () => {
  it('renews an unsaved video lease while the composer is open', async () => {
    let renewLeaseInterval: (() => void) | undefined;
    const intervalSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((handler, timeout) => {
        if (
          timeout === 6 * 60 * 60 * 1000 &&
          typeof handler === 'function'
        ) {
          renewLeaseInterval = handler as () => void;
        }
        return 1;
      });
    const file: MediaFileResponse = {
      id: 'video-id',
      url: '/video-id',
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 5,
    };
    const item: UploadItem = {
      key: 'video',
      file: new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      status: 'uploaded',
      uploaded: file,
    };
    const { result } = renderHook(() =>
      usePostComposer({
        isOpen: true,
        onClose: vi.fn(),
        onPublished: vi.fn(),
        labels: adminTranslations.en,
        availableLanguages: ['en'],
      }),
    );

    await act(async () => {
      await result.current.handleUploaded([file], [item]);
    });
    intervalSpy.mockRestore();

    expect(renewLeaseInterval).toBeDefined();
    act(() => renewLeaseInterval?.());
    expect(renewVideoUploadLease).toHaveBeenCalledWith('video-id');
  });

  it('stops renewing a video lease after the video is removed', async () => {
    let renewLeaseInterval: (() => void) | undefined;
    const intervalSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((handler, timeout) => {
        if (
          timeout === 6 * 60 * 60 * 1000 &&
          typeof handler === 'function'
        ) {
          renewLeaseInterval = handler as () => void;
        }
        return 1;
      });
    const video: MediaFileResponse = {
      id: 'video-id',
      url: '/video-id',
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 5,
    };
    const image: MediaFileResponse = {
      id: 'image-source-id',
      url: '/image-source-id',
      originalName: 'image.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 5,
    };
    const item: UploadItem = {
      key: 'video',
      file: new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      status: 'uploaded',
      uploaded: video,
    };
    const { result } = renderHook(() =>
      usePostComposer({
        isOpen: true,
        onClose: vi.fn(),
        onPublished: vi.fn(),
        labels: adminTranslations.en,
        availableLanguages: ['en'],
      }),
    );

    await act(async () => {
      await result.current.handleUploaded([video, image], [item]);
    });
    act(() => result.current.removeMedia('video-id'));
    intervalSpy.mockRestore();

    act(() => renewLeaseInterval?.());
    expect(renewVideoUploadLease).not.toHaveBeenCalled();
    expect(deleteMediaFile).toHaveBeenCalledWith('video-id');
  });
});

describe('takeImagesWithinLimit', () => {
  it('keeps only room left under the max', () => {
    const incoming = ['a', 'b', 'c', 'd'];
    expect(takeImagesWithinLimit(28, incoming, 30)).toEqual({
      accepted: ['a', 'b'],
      rejected: ['c', 'd'],
    });
    expect(takeImagesWithinLimit(0, incoming, 30).accepted).toHaveLength(4);
    expect(takeImagesWithinLimit(30, incoming, 30)).toEqual({
      accepted: [],
      rejected: incoming,
    });
  });
});
