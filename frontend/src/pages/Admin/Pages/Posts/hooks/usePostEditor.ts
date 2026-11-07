import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  uploadMediaFile,
  type MediaFileResponse,
} from '../../../../../shared/api/mediaApi';
import {
  type PostCopy,
  type PostImage,
  type PostResponse,
  updateAdminPost,
} from '../../../../../shared/api/postsApi';
import {
  hasRichHtmlOverLimit,
  MAX_RICH_HTML_LENGTH,
  sanitizeRichHtml,
} from '../../../../../shared/lib/richText';
import type { AdminTranslations } from '../../../translations';

export const MAX_POST_EDITOR_IMAGES = 30;

export type PostEditorState = {
  images: PostImage[];
  copies: Record<string, PostCopy>;
  editLanguage: string;
  published: boolean;
  pinned: boolean;
  contentRevision: number;
};

export function buildInitialPostEditorState(
  post: PostResponse,
): PostEditorState {
  const preferredLanguage =
    Object.keys(post.copies ?? {}).find((code) => code === 'en') ??
    Object.keys(post.copies ?? {})[0] ??
    'en';

  return {
    images: post.images.map((image) => ({ ...image })),
    copies: Object.fromEntries(
      Object.entries(post.copies ?? {}).map(([code, copy]) => [
        code,
        { body: copy.body ?? '' },
      ]),
    ),
    editLanguage: preferredLanguage,
    published: Boolean(post.published),
    pinned: Boolean(post.pinned),
    contentRevision: Number(post.contentRevision ?? 1),
  };
}

export function stablePostEditorSnapshot(state: PostEditorState): string {
  return JSON.stringify({
    images: state.images.map((image) => ({
      imageId: image.imageId,
      sourceFileId: image.sourceFileId,
    })),
    copies: Object.fromEntries(
      Object.entries(state.copies).map(([code, copy]) => [
        code,
        { body: sanitizeRichHtml(copy.body ?? '') },
      ]),
    ),
    published: state.published,
    pinned: state.pinned,
  });
}

export function computePostEditorDirty(
  current: PostEditorState,
  baselineSnapshot: string,
): boolean {
  return stablePostEditorSnapshot(current) !== baselineSnapshot;
}

function sanitizeCopies(
  copies: Record<string, PostCopy>,
): Record<string, PostCopy> {
  const next: Record<string, PostCopy> = {};
  for (const [code, copy] of Object.entries(copies)) {
    next[code] = { body: sanitizeRichHtml(copy.body ?? '') };
  }
  return next;
}

export type UsePostEditorOptions = {
  post: PostResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: PostResponse) => void | Promise<void>;
  onForbidden: () => void | Promise<void>;
  labels: AdminTranslations;
  availableLanguages: string[];
};

export function usePostEditor({
  post,
  isOpen,
  onClose,
  onSaved,
  onForbidden,
  labels,
  availableLanguages,
}: UsePostEditorOptions) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [state, setState] = useState<PostEditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [conflictPost, setConflictPost] = useState<PostResponse | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [sessionImageIds, setSessionImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [sessionFileIds, setSessionFileIds] = useState<Set<string>>(new Set());

  const baseSnapshotRef = useRef('');

  const siteLanguages = useMemo(
    () => (availableLanguages.length > 0 ? availableLanguages : ['en']),
    [availableLanguages],
  );

  const resetSessionTracking = useCallback(() => {
    setSessionImageIds(new Set());
    setSessionFileIds(new Set());
  }, []);

  const discardSessionMedia = useCallback(async () => {
    const imageIds = [...sessionImageIds];
    const fileIds = [...sessionFileIds];
    resetSessionTracking();
    await Promise.all([
      ...imageIds.map(async (imageId) => {
        try {
          await deleteOptimizedImage(imageId);
        } catch {
          // Best-effort only.
        }
      }),
      ...fileIds.map(async (fileId) => {
        try {
          await deleteMediaFile(fileId);
        } catch {
          // Best-effort only.
        }
      }),
    ]);
  }, [resetSessionTracking, sessionFileIds, sessionImageIds]);

  const cleanupSavedSessionMedia = useCallback(
    async (images: PostImage[]) => {
      const retainedImageIds = new Set(images.map((image) => image.imageId));
      const retainedFileIds = new Set(
        images.map((image) => image.sourceFileId),
      );
      const imageIds = [...sessionImageIds].filter(
        (imageId) => !retainedImageIds.has(imageId),
      );
      const fileIds = [...sessionFileIds].filter(
        (fileId) => !retainedFileIds.has(fileId),
      );
      resetSessionTracking();
      await Promise.all([
        ...imageIds.map(async (imageId) => {
          try {
            await deleteOptimizedImage(imageId);
          } catch {
            // Best-effort only.
          }
        }),
        ...fileIds.map(async (fileId) => {
          try {
            await deleteMediaFile(fileId);
          } catch {
            // Best-effort only.
          }
        }),
      ]);
    },
    [resetSessionTracking, sessionFileIds, sessionImageIds],
  );

  useEffect(() => {
    if (!isOpen || !post) {
      return;
    }

    const nextState = buildInitialPostEditorState(post);
    setState(nextState);
    baseSnapshotRef.current = stablePostEditorSnapshot(nextState);
    setConflictPost(null);
    setFormError('');
    resetSessionTracking();
  }, [isOpen, post, resetSessionTracking]);

  const isDirty = useMemo(() => {
    if (!state) {
      return false;
    }
    return computePostEditorDirty(state, baseSnapshotRef.current);
  }, [state]);

  const setImages = useCallback((next: PostImage[]) => {
    setState((current) => (current ? { ...current, images: next } : current));
  }, []);

  const updateCopyBody = useCallback((body: string) => {
    setState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        copies: {
          ...current.copies,
          [current.editLanguage]: { body },
        },
      };
    });
  }, []);

  const updateEditLanguage = useCallback((language: string) => {
    setState((current) =>
      current ? { ...current, editLanguage: language } : current,
    );
  }, []);

  const handleUpload = useCallback(
    async (files: MediaFileResponse[]) => {
      if (!state || files.length === 0) {
        return;
      }
      const room = Math.max(0, MAX_POST_EDITOR_IMAGES - state.images.length);
      const accepted = files.slice(0, room);
      if (accepted.length < files.length) {
        toastRef.current.warning(labels.postsImageLimitWarning);
      }

      for (const file of accepted) {
        try {
          const optimized = await optimizeMediaImage(file.id, [
            'display',
            'thumb',
          ]);
          const nextEntry = {
            imageId: optimized.imageId,
            sourceFileId: optimized.sourceFileId || file.id,
            width: optimized.width,
            height: optimized.height,
          };
          setSessionImageIds((prev) => new Set(prev).add(nextEntry.imageId));
          setSessionFileIds((prev) =>
            new Set(prev).add(nextEntry.sourceFileId),
          );
          setState((current) => {
            if (!current) {
              return current;
            }
            if (
              current.images.some(
                (image) => image.imageId === nextEntry.imageId,
              )
            ) {
              return current;
            }
            return {
              ...current,
              images: [...current.images, nextEntry],
            };
          });
        } catch {
          toastRef.current.error(labels.postsOptimizeFailed);
        }
      }
    },
    [labels, state],
  );

  const removeImage = useCallback(
    (imageId: string) => {
      setState((current) => {
        if (!current) {
          return current;
        }
        if (current.images.length <= 1) {
          toastRef.current.warning(labels.postsMinImageWarning);
          return current;
        }
        const target = current.images.find(
          (image) => image.imageId === imageId,
        );
        if (!target) {
          return current;
        }
        return {
          ...current,
          images: current.images.filter((image) => image.imageId !== imageId),
        };
      });
    },
    [labels],
  );

  const addPhotosFromFiles = useCallback(
    async (files: File[]) => {
      if (!state || files.length === 0) {
        return;
      }
      const room = Math.max(0, MAX_POST_EDITOR_IMAGES - state.images.length);
      const accepted = files.slice(0, room);
      if (accepted.length < files.length) {
        toastRef.current.warning(labels.postsImageLimitWarning);
      }
      const uploaded: MediaFileResponse[] = [];
      for (const file of accepted) {
        try {
          const media = await uploadMediaFile(file, {
            accept: 'image/jpeg,image/png,image/webp',
            maxSizeBytes: 10 * 1024 * 1024,
          });
          uploaded.push(media);
        } catch {
          toastRef.current.error(labels.uploadUploadFailed);
        }
      }
      if (uploaded.length > 0) {
        await handleUpload(uploaded);
      }
    },
    [handleUpload, labels, state],
  );

  const save = useCallback(async () => {
    if (!post || !state || !isDirty) {
      return;
    }
    const copiesToSave = sanitizeCopies(state.copies);
    if (hasRichHtmlOverLimit(copiesToSave, MAX_RICH_HTML_LENGTH)) {
      toastRef.current.error(labels.richTextTooLong);
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      const updated = await updateAdminPost(post.id, {
        published: state.published,
        pinned: state.pinned,
        contentRevision: state.contentRevision,
        images: state.images,
        copies: copiesToSave,
      });
      baseSnapshotRef.current = stablePostEditorSnapshot(
        buildInitialPostEditorState(updated),
      );
      setState(buildInitialPostEditorState(updated));
      await cleanupSavedSessionMedia(updated.images);
      await onSaved(updated);
      toastRef.current.info(labels.postsSaveSuccess ?? 'Saved');
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const current = error.response.data as PostResponse | null;
        if (current) {
          setConflictPost(current);
        }
        toastRef.current.error(labels.postsConflictWarning ?? 'Conflict');
        setFormError(labels.postsConflictWarning ?? 'Conflict');
        return;
      }
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        toastRef.current.error(labels.postsForbidden ?? labels.postsSaveFailed);
        setFormError(labels.postsForbidden ?? labels.postsSaveFailed);
        await onForbidden();
        return;
      }
      toastRef.current.error(labels.postsSaveFailed);
      setFormError(labels.postsSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    cleanupSavedSessionMedia,
    isDirty,
    labels,
    onClose,
    onForbidden,
    onSaved,
    post,
    state,
  ]);

  const applyLatestConflict = useCallback(async () => {
    if (!conflictPost || isClosing || isSaving) {
      return;
    }
    await discardSessionMedia();
    const nextState = buildInitialPostEditorState(conflictPost);
    setState(nextState);
    baseSnapshotRef.current = stablePostEditorSnapshot(nextState);
    setConflictPost(null);
    setFormError('');
  }, [conflictPost, discardSessionMedia, isClosing, isSaving]);

  const close = useCallback(async () => {
    if (isClosing || isSaving) {
      return;
    }
    setIsClosing(true);
    try {
      await discardSessionMedia();
      setState(post ? buildInitialPostEditorState(post) : null);
      baseSnapshotRef.current = post
        ? stablePostEditorSnapshot(buildInitialPostEditorState(post))
        : '';
      setConflictPost(null);
      setFormError('');
      onClose();
    } finally {
      setIsClosing(false);
    }
  }, [discardSessionMedia, isClosing, isSaving, onClose, post]);

  const currentLanguageOptions = siteLanguages.map((code) => ({
    value: code,
    label: code,
  }));

  return {
    state,
    isDirty,
    isSaving,
    formError,
    conflictPost,
    siteLanguages,
    currentLanguageOptions,
    canSave: Boolean(state && isDirty && !isSaving && !conflictPost),
    setImages,
    updateCopyBody,
    updateEditLanguage,
    removeImage,
    addPhotosFromFiles,
    save,
    applyLatestConflict,
    close,
    setPublished: (value: boolean) =>
      setState((current) =>
        current ? { ...current, published: value } : current,
      ),
  };
}
