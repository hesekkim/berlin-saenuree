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
const toastError = vi.fn();

vi.mock('../../src/shared/api/postsApi', () => ({
  updateAdminPost: (...args: unknown[]) => updateAdminPost(...args),
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteOptimizedImage: (...args: unknown[]) => deleteOptimizedImage(...args),
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
  uploadMediaFile: (...args: unknown[]) => uploadMediaFile(...args),
  optimizeMediaImage: (...args: unknown[]) => optimizeMediaImage(...args),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: toastError,
    dismiss: vi.fn(),
  }),
}));

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
    toastError.mockReset();
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
          options?.onUploadProgress?.({ loaded: 50, total: 100 });
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
