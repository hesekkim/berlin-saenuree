import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostResponse } from '../../src/shared/api/postsApi';
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
const toastError = vi.fn();

vi.mock('../../src/shared/api/postsApi', () => ({
  updateAdminPost: (...args: unknown[]) => updateAdminPost(...args),
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteOptimizedImage: (...args: unknown[]) => deleteOptimizedImage(...args),
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
  optimizeMediaImage: vi.fn(),
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
    images: [
      { imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
      { imageId: 'img-b', sourceFileId: 'file-b', width: 100, height: 100 },
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
      images: [
        { imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
        { imageId: 'img-b', sourceFileId: 'file-b', width: 100, height: 100 },
      ],
      copies: {
        en: { body: '<p>Hello</p>' },
        ko: { body: '<p>안녕</p>' },
      },
    };

    const state = buildInitialPostEditorState(post);

    expect(state.images).toHaveLength(2);
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
      images: [
        { imageId: 'img-a', sourceFileId: 'file-a', width: 100, height: 100 },
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
      result.current.removeImage('img-a');
    });
    await act(async () => {
      await result.current.close();
    });

    expect(deleteOptimizedImage).not.toHaveBeenCalled();
    expect(deleteMediaFile).not.toHaveBeenCalled();
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
