import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostResponse } from '../../src/shared/api/postsApi';
import type { MediaFileResponse } from '../../src/shared/api/mediaApi';
import { adminTranslations } from '../../src/pages/Admin/translations';
import {
  buildInitialPostEditorState,
  computePostEditorDirty,
  stablePostEditorSnapshot,
  usePostEditor,
} from '../../src/pages/Admin/Pages/Posts/hooks/usePostEditor';

const updateAdminPost = vi.fn();
const deleteOptimizedImage = vi.fn();
const deleteMediaFile = vi.fn();
const uploadMediaFile = vi.fn();
const optimizeMediaImage = vi.fn();
const renewVideoUploadLease = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock('../../src/shared/api/postsApi', () => ({
  updateAdminPost: (...args: unknown[]) => updateAdminPost(...args),
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteOptimizedImage: (...args: unknown[]) => deleteOptimizedImage(...args),
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
  uploadMediaFile: (...args: unknown[]) => uploadMediaFile(...args),
  optimizeMediaImage: (...args: unknown[]) => optimizeMediaImage(...args),
  renewVideoUploadLease: (...args: unknown[]) =>
    renewVideoUploadLease(...args),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    info: vi.fn(),
    warning: toastWarning,
    error: toastError,
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

function makePost(): PostResponse {
  return {
    id: 'p1',
    published: true,
    pinned: false,
    createdBy: 'admin@example.com',
    createdAt: '2026-09-11T12:00:00+00:00',
    updatedAt: '2026-09-11T12:00:00+00:00',
    contentRevision: 3,
    media: [
      { type: 'image', imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
      { type: 'image', imageId: 'img-b', sourceFileId: 'file-b', width: 100, height: 100 },
    ],
    copies: { en: { body: '<p>Hello</p>' } },
  };
}

function renderEditor(post = makePost()) {
  return renderHook(() =>
    usePostEditor({
      post,
      isOpen: true,
      onClose: vi.fn(),
      onSaved: vi.fn(),
      onForbidden: vi.fn(),
      labels: adminTranslations.en,
      availableLanguages: ['en'],
    }),
  );
}

describe('usePostEditor helpers', () => {
  beforeEach(() => {
    updateAdminPost.mockReset();
    deleteOptimizedImage.mockReset();
    deleteMediaFile.mockReset();
    uploadMediaFile.mockReset();
    optimizeMediaImage.mockReset();
    renewVideoUploadLease.mockReset();
    renewVideoUploadLease.mockResolvedValue(undefined);
    toastError.mockReset();
    toastWarning.mockReset();
  });

  it('builds a stable initial state from the post payload', () => {
    const post = {
      id: 'p1',
      published: true,
      pinned: false,
      createdBy: 'user@example.com',
      createdAt: '2026-09-11T12:00:00+00:00',
      updatedAt: '2026-09-11T12:00:00+00:00',
      contentRevision: 3,
      media: [
        { type: 'image', imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
        { type: 'image', imageId: 'img-b', sourceFileId: 'file-b', width: 100, height: 100 },
      ],
      copies: {
        en: { body: '<p>Hello</p>' },
        ko: { body: '<p>안녕</p>' },
      },
    };

    const state = buildInitialPostEditorState(post);

    expect(state.media).toHaveLength(2);
    expect(state.published).toBe(true);
    expect(state.pinned).toBe(false);
    expect(state.editLanguage).toBe('en');
    expect(state.copies.en?.body).toBe('<p>Hello</p>');
  });

  it('marks the form dirty when any tracked field changes', () => {
    const post = {
      id: 'p1',
      published: true,
      pinned: false,
      createdBy: 'user@example.com',
      createdAt: '2026-09-11T12:00:00+00:00',
      updatedAt: '2026-09-11T12:00:00+00:00',
      contentRevision: 3,
      media: [
        { type: 'image', imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
      ],
      copies: { en: { body: '<p>Hello</p>' } },
    };

    const baseline = stablePostEditorSnapshot(
      buildInitialPostEditorState(post),
    );

    expect(
      computePostEditorDirty(
        {
          ...buildInitialPostEditorState(post),
          published: false,
        },
        baseline,
      ),
    ).toBe(true);

    expect(
      computePostEditorDirty(buildInitialPostEditorState(post), baseline),
    ).toBe(false);
  });

  it('does not delete existing media when an image is removed and the editor is cancelled', async () => {
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    act(() => {
      result.current.removeMedia('img-a');
    });
    await act(async () => {
      await result.current.close();
    });

    expect(deleteOptimizedImage).not.toHaveBeenCalled();
    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it('reports upload progress and blocks saving until uploaded media is processed', async () => {
    let resolveUpload!: (response: MediaFileResponse) => void;
    let reportUploadProgress!: (progress: {
      loaded: number;
      total?: number;
    }) => void;
    uploadMediaFile.mockImplementation(
      (
        _file: File,
        options?: {
          onUploadProgress?: (progress: {
            loaded: number;
            total?: number;
          }) => void;
        },
      ) =>
        new Promise((resolve) => {
              if (!options?.onUploadProgress) {
                throw new Error('Expected upload progress callback');
              }
              reportUploadProgress = options.onUploadProgress;
              reportUploadProgress({ loaded: 50, total: 100 });
              resolveUpload = resolve;
            }),
    );
    optimizeMediaImage.mockResolvedValue({
      imageId: 'img-c',
      sourceFileId: 'file-c',
      displayUrl: '/display',
      thumbUrl: '/thumb',
      variants: ['display', 'thumb'],
      width: 100,
      height: 100,
    });
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.addPhotosFromFiles([
        new File(['image'], 'photo.png', { type: 'image/png' }),
      ]);
    });

    await waitFor(() => {
      expect(result.current.uploadProgress?.percent).toBe(50);
    });
    expect(result.current.isUploadingMedia).toBe(true);
    expect(result.current.canSave).toBe(false);
    act(() => {
      reportUploadProgress({ loaded: 100, total: 100 });
    });
    expect(result.current.uploadProgress?.processing).toBe(true);
    expect(result.current.uploadProgress?.percent).toBe(100);
    await act(async () => {
      await result.current.save();
    });
    expect(updateAdminPost).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload({
        id: 'file-c',
        url: '/file-c',
        originalName: 'photo.png',
        contentType: 'image/png',
        sizeBytes: 5,
      });
      await uploadPromise;
    });

    expect(result.current.uploadProgress).toBeNull();
    expect(result.current.state?.media).toHaveLength(3);
  });

  it('renews the lease for unsaved video uploads while the editor is open', async () => {
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
    uploadMediaFile.mockResolvedValue({
      id: 'video-c',
      url: '/video-c',
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 5,
    });
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    await act(async () => {
      await result.current.addPhotosFromFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]);
    });
    intervalSpy.mockRestore();

    expect(uploadMediaFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ leaseVideoUpload: true }),
    );
    expect(renewLeaseInterval).toBeDefined();
    act(() => renewLeaseInterval?.());
    expect(renewVideoUploadLease).toHaveBeenCalledWith('video-c');

    renewVideoUploadLease.mockClear();
    act(() => result.current.removeMedia('video-c'));
    act(() => renewLeaseInterval?.());
    expect(renewVideoUploadLease).not.toHaveBeenCalled();
  });

  it('cancels the active upload and deletes files uploaded earlier in the batch', async () => {
    let uploadCount = 0;
    uploadMediaFile.mockImplementation(
      (
        _file: File,
        options?: {
          signal?: AbortSignal;
        },
      ) => {
        uploadCount += 1;
        if (uploadCount === 1) {
          return Promise.resolve({
            id: 'file-c',
            url: '/file-c',
            originalName: 'first.png',
            contentType: 'image/png',
            sizeBytes: 5,
          });
        }
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.addPhotosFromFiles([
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]);
    });

    await waitFor(() => {
      expect(uploadMediaFile).toHaveBeenCalledTimes(2);
    });
    act(() => {
      result.current.cancelUpload();
    });
    await act(async () => {
      await uploadPromise;
    });

    expect(deleteMediaFile).toHaveBeenCalledWith('file-c');
    expect(result.current.uploadProgress).toBeNull();
    expect(result.current.state?.media).toHaveLength(2);
  });

  it('discards processed media when cancellation happens during processing', async () => {
    uploadMediaFile.mockImplementation(async (file: File) => ({
      id: file.name === 'first.png' ? 'file-c' : 'file-d',
      url: `/file-${file.name}`,
      originalName: file.name,
      contentType: 'image/png',
      sizeBytes: file.size,
    }));
    let optimizeCount = 0;
    optimizeMediaImage.mockImplementation(
      (
        fileId: string,
        _variants: unknown,
        options?: { signal?: AbortSignal },
      ) => {
        optimizeCount += 1;
        if (optimizeCount === 1) {
          return Promise.resolve({
            imageId: 'img-c',
            sourceFileId: fileId,
            displayUrl: '/display',
            thumbUrl: '/thumb',
            variants: ['display', 'thumb'],
            width: 100,
            height: 100,
          });
        }
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.addPhotosFromFiles([
        new File(['first'], 'first.png', { type: 'image/png' }),
        new File(['second'], 'second.png', { type: 'image/png' }),
      ]);
    });

    await waitFor(() => {
      expect(optimizeMediaImage).toHaveBeenCalledTimes(2);
      expect(result.current.state?.media).toHaveLength(3);
    });
    act(() => {
      result.current.cancelUpload();
    });
    await act(async () => {
      await uploadPromise;
    });

    expect(result.current.state?.media).toHaveLength(2);
    expect(deleteOptimizedImage).toHaveBeenCalledWith('img-c');
    expect(deleteMediaFile).toHaveBeenCalledWith('file-c');
    expect(deleteMediaFile).toHaveBeenCalledWith('file-d');
  });

  it('deletes a replaced uploaded video after saving the edit', async () => {
    const post = makePost();
    post.media = [
      post.media[0]!,
      { type: 'video', fileId: 'old-video', width: 1920, height: 1080 },
    ];
    let uploadCount = 0;
    uploadMediaFile.mockImplementation(async (file: File) => {
      uploadCount += 1;
      return {
        id: `video-${uploadCount}`,
        url: `/video-${uploadCount}`,
        originalName: file.name,
        contentType: 'video/mp4',
        sizeBytes: file.size,
      };
    });
    updateAdminPost.mockImplementation(async (id, payload) => ({
      ...post,
      id,
      ...payload,
      contentRevision: post.contentRevision + 1,
    }));
    const { result } = renderEditor(post);

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    act(() => {
      result.current.removeMedia('old-video');
    });
    await act(async () => {
      await result.current.addPhotosFromFiles([
        new File(['first'], 'first.mp4', { type: 'video/mp4' }),
      ]);
    });
    act(() => {
      result.current.removeMedia('video-1');
    });
    await act(async () => {
      await result.current.addPhotosFromFiles([
        new File(['second'], 'second.mp4', { type: 'video/mp4' }),
      ]);
    });
    await act(async () => {
      await result.current.save();
    });

    expect(updateAdminPost).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        media: [
          expect.objectContaining({ type: 'image', imageId: 'img-a' }),
          expect.objectContaining({ type: 'video', fileId: 'video-2' }),
        ],
      }),
    );
    expect(deleteMediaFile).toHaveBeenCalledWith('video-1');
    expect(deleteMediaFile).not.toHaveBeenCalledWith('video-2');
  });

  it('discards uploaded media when the editor unmounts without saving', async () => {
    uploadMediaFile.mockResolvedValue({
      id: 'video-c',
      url: '/video-c',
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 5,
    });
    const { result, unmount } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    await act(async () => {
      await result.current.addPhotosFromFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]);
    });

    unmount();

    await waitFor(() => {
      expect(deleteMediaFile).toHaveBeenCalledWith('video-c');
    });
  });

  it('warns when temporary media cleanup fails', async () => {
    const post = makePost();
    post.media = [post.media[0]!];
    uploadMediaFile.mockResolvedValue({
      id: 'video-c',
      url: '/video-c',
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: 5,
    });
    updateAdminPost.mockResolvedValue({
      ...post,
      media: [post.media[0]!],
      contentRevision: post.contentRevision + 1,
    });
    deleteMediaFile.mockRejectedValueOnce(new Error('Delete failed'));
    const { result } = renderEditor(post);

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    await act(async () => {
      await result.current.addPhotosFromFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]);
    });
    act(() => {
      result.current.removeMedia('video-c');
      result.current.updateCopyBody('<p>Updated</p>');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(toastWarning).toHaveBeenCalledWith(
      adminTranslations.en.postsMediaCleanupFailed,
    );
  });

  it('keeps edits after a conflict until the latest server content is applied', async () => {
    const current = makePost();
    current.contentRevision = 4;
    current.copies = { en: { body: '<p>Server</p>' } };
    updateAdminPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: current },
    });
    const { result } = renderEditor();

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    act(() => {
      result.current.updateCopyBody('<p>Mine</p>');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.state?.copies.en?.body).toBe('<p>Mine</p>');
    expect(result.current.conflictPost?.contentRevision).toBe(4);
    expect(result.current.canSave).toBe(false);

    await act(async () => {
      await result.current.applyLatestConflict();
    });

    expect(result.current.state?.copies.en?.body).toBe('<p>Server</p>');
    expect(result.current.conflictPost).toBeNull();
  });
});
