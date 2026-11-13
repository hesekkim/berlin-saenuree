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
  type PostMedia,
  type PostResponse,
  updateAdminPost,
} from '../../../../../shared/api/postsApi';
import {
  hasRichHtmlOverLimit,
  MAX_RICH_HTML_LENGTH,
  sanitizeRichHtml,
} from '../../../../../shared/lib/richText';
import type { AdminTranslations } from '../../../translations';
import {
  getPostMediaMaxBytes,
  MAX_POST_MEDIA,
  POST_MEDIA_ACCEPT,
  readVideoDimensions,
} from '../utils/postMedia';

export type PostEditorState = {
  media: PostMedia[];
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
    media: post.media.map((item) => ({ ...item })),
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
    media: state.media,
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
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    percent: number | null;
    processing: boolean;
    fileIndex: number;
    fileCount: number;
  } | null>(null);
  const [formError, setFormError] = useState('');
  const [conflictPost, setConflictPost] = useState<PostResponse | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [sessionImageIds, setSessionImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [sessionFileIds, setSessionFileIds] = useState<Set<string>>(new Set());

  const baseSnapshotRef = useRef('');
  const uploadAbortControllerRef = useRef<AbortController | null>(null);

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
    async (media: PostMedia[]) => {
      const retainedImageIds = new Set(
        media.flatMap((item) => (item.type === 'image' ? [item.imageId] : [])),
      );
      const retainedFileIds = new Set(
        media.map((item) =>
          item.type === 'image' ? item.sourceFileId : item.fileId,
        ),
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

  const setMedia = useCallback((next: PostMedia[]) => {
    setState((current) => (current ? { ...current, media: next } : current));
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
    async (
      files: MediaFileResponse[],
      sourceFiles: Map<string, File>,
      signal: AbortSignal,
      createdImageIds: Set<string>,
    ) => {
      if (!state || files.length === 0) {
        return;
      }
      const room = Math.max(0, MAX_POST_MEDIA - state.media.length);
      let videoCount = state.media.filter((item) => item.type === 'video').length;
      let rejectedVideo = false;
      const mediaLimitRejected = files.length > room;
      const accepted = files.slice(0, room).filter((file) => {
        if (file.contentType !== 'video/mp4') {
          return true;
        }
        if (videoCount >= 1) {
          rejectedVideo = true;
          return false;
        }
        videoCount += 1;
        return true;
      });
      if (accepted.length < files.length) {
        if (rejectedVideo) {
          toastRef.current.warning(labels.postsVideoLimitWarning);
        }
        if (mediaLimitRejected) {
          toastRef.current.warning(labels.postsImageLimitWarning);
        }
      }

      for (const file of accepted) {
        if (signal.aborted) {
          throw new DOMException('Media processing was aborted', 'AbortError');
        }
        if (file.contentType === 'video/mp4') {
          const sourceFile = sourceFiles.get(file.id);
          if (!sourceFile) {
            toastRef.current.error(labels.uploadUploadFailed);
            await deleteMediaFile(file.id);
            continue;
          }
          try {
            const dimensions = await readVideoDimensions(sourceFile, signal);
            if (signal.aborted) {
              throw new DOMException(
                'Media processing was aborted',
                'AbortError',
              );
            }
            setSessionFileIds((prev) => new Set(prev).add(file.id));
            setState((current) => {
              if (!current || current.media.some((item) => item.type === 'video')) {
                return current;
              }
              return {
                ...current,
                media: [
                  ...current.media,
                  { type: 'video', fileId: file.id, ...dimensions },
                ],
              };
            });
          } catch {
            if (signal.aborted) {
              throw new DOMException(
                'Media processing was aborted',
                'AbortError',
              );
            }
            toastRef.current.error(labels.uploadUploadFailed);
            await deleteMediaFile(file.id);
          }
          continue;
        }
        try {
          const optimized = await optimizeMediaImage(file.id, [
            'display',
            'thumb',
          ], { signal });
          createdImageIds.add(optimized.imageId);
          if (signal.aborted) {
            throw new DOMException(
              'Media processing was aborted',
              'AbortError',
            );
          }
          const nextEntry: PostMedia = {
            type: 'image',
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
              current.media.some(
                (item) =>
                  item.type === 'image' &&
                  item.imageId === nextEntry.imageId,
              )
            ) {
              return current;
            }
            return {
              ...current,
              media: [...current.media, nextEntry],
            };
          });
        } catch {
          if (signal.aborted) {
            throw new DOMException(
              'Media processing was aborted',
              'AbortError',
            );
          }
          toastRef.current.error(labels.postsOptimizeFailed);
        }
      }
    },
    [labels, state],
  );

  const removeMedia = useCallback(
    (mediaId: string) => {
      setState((current) => {
        if (!current) {
          return current;
        }
        if (current.media.length <= 1) {
          toastRef.current.warning(labels.postsMinImageWarning);
          return current;
        }
        const target = current.media.find((item) =>
          item.type === 'image'
            ? item.imageId === mediaId
            : item.fileId === mediaId,
        );
        if (!target) {
          return current;
        }
        return {
          ...current,
          media: current.media.filter((item) =>
            item.type === 'image'
              ? item.imageId !== mediaId
              : item.fileId !== mediaId,
          ),
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
      const room = Math.max(0, MAX_POST_MEDIA - state.media.length);
      let videoCount = state.media.filter((item) => item.type === 'video').length;
      let rejectedVideo = false;
      const mediaLimitRejected = files.length > room;
      const accepted = files
        .slice(0, room)
        .filter((file) => {
          const isVideo =
            file.type === 'video/mp4' ||
            file.name.toLowerCase().endsWith('.mp4');
          if (!isVideo) {
            return true;
          }
          if (videoCount >= 1) {
            rejectedVideo = true;
            return false;
          }
          videoCount += 1;
          return true;
        });
      if (accepted.length < files.length) {
        if (rejectedVideo) {
          toastRef.current.warning(labels.postsVideoLimitWarning);
        }
        if (mediaLimitRejected) {
          toastRef.current.warning(labels.postsImageLimitWarning);
        }
      }
      const uploaded: MediaFileResponse[] = [];
      const sourceFiles = new Map<string, File>();
      const createdImageIds = new Set<string>();
      if (accepted.length === 0) {
        return;
      }
      const controller = new AbortController();
      uploadAbortControllerRef.current = controller;
      setUploadProgress({
        fileName: accepted[0].name,
        percent: 0,
        processing: false,
        fileIndex: 1,
        fileCount: accepted.length,
      });
      try {
        for (const [index, file] of accepted.entries()) {
          if (controller.signal.aborted) {
            break;
          }
          const maxSizeBytes = getPostMediaMaxBytes(file);
          if (file.size > maxSizeBytes) {
            toastRef.current.error(labels.uploadSizeExceeded);
            continue;
          }
          setUploadProgress({
            fileName: file.name,
            percent: Math.round((index / accepted.length) * 100),
            processing: false,
            fileIndex: index + 1,
            fileCount: accepted.length,
          });
          try {
            const media = await uploadMediaFile(file, {
              accept: POST_MEDIA_ACCEPT,
              maxSizeBytes,
              signal: controller.signal,
              onUploadProgress: ({ loaded, total }) => {
                const filePercent =
                  total && total > 0
                    ? Math.min(100, Math.round((loaded / total) * 100))
                    : null;
                setUploadProgress({
                  fileName: file.name,
                  percent:
                    filePercent === null
                      ? null
                      : Math.round(
                          ((index + filePercent / 100) / accepted.length) *
                            100,
                        ),
                  processing: false,
                  fileIndex: index + 1,
                  fileCount: accepted.length,
                });
              },
            });
            uploaded.push(media);
            sourceFiles.set(media.id, file);
          } catch {
            if (controller.signal.aborted) {
              break;
            }
            toastRef.current.error(labels.uploadUploadFailed);
          }
        }
        if (!controller.signal.aborted && uploaded.length > 0) {
          setUploadProgress({
            fileName: '',
            percent: null,
            processing: true,
            fileIndex: accepted.length,
            fileCount: accepted.length,
          });
          await handleUpload(
            uploaded,
            sourceFiles,
            controller.signal,
            createdImageIds,
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          throw error;
        }
      } finally {
        if (controller.signal.aborted) {
          const uploadedFileIds = new Set(uploaded.map((file) => file.id));
          setState((current) =>
            current
              ? {
                  ...current,
                  media: current.media.filter(
                    (item) =>
                      !uploadedFileIds.has(
                        item.type === 'image' ? item.sourceFileId : item.fileId,
                      ),
                  ),
                }
              : current,
          );
          setSessionFileIds(
            (current) =>
              new Set([...current].filter((id) => !uploadedFileIds.has(id))),
          );
          setSessionImageIds(
            (current) =>
              new Set([...current].filter((id) => !createdImageIds.has(id))),
          );
          await Promise.all([
            ...[...createdImageIds].map(async (imageId) => {
              try {
                await deleteOptimizedImage(imageId);
              } catch {
                // Best-effort cleanup after cancelling an upload.
              }
            }),
            ...[...uploadedFileIds].map(async (fileId) => {
              try {
                await deleteMediaFile(fileId);
              } catch {
                // Best-effort cleanup after cancelling an upload.
              }
            }),
          ]);
        }
        uploadAbortControllerRef.current = null;
        setUploadProgress(null);
      }
    },
    [handleUpload, labels, state],
  );

  const cancelUpload = useCallback(() => {
    uploadAbortControllerRef.current?.abort();
  }, []);

  const save = useCallback(async () => {
    if (!post || !state || !isDirty || uploadProgress) {
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
        media: state.media,
        copies: copiesToSave,
      });
      baseSnapshotRef.current = stablePostEditorSnapshot(
        buildInitialPostEditorState(updated),
      );
      setState(buildInitialPostEditorState(updated));
      await cleanupSavedSessionMedia(updated.media);
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
    uploadProgress,
  ]);

  const applyLatestConflict = useCallback(async () => {
    if (!conflictPost || isClosing || isSaving || uploadProgress) {
      return;
    }
    await discardSessionMedia();
    const nextState = buildInitialPostEditorState(conflictPost);
    setState(nextState);
    baseSnapshotRef.current = stablePostEditorSnapshot(nextState);
    setConflictPost(null);
    setFormError('');
  }, [conflictPost, discardSessionMedia, isClosing, isSaving, uploadProgress]);

  const close = useCallback(async () => {
    if (isClosing || isSaving || uploadProgress) {
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
  }, [discardSessionMedia, isClosing, isSaving, onClose, post, uploadProgress]);

  const currentLanguageOptions = siteLanguages.map((code) => ({
    value: code,
    label: code,
  }));

  return {
    state,
    isDirty,
    isSaving,
    isUploadingMedia: Boolean(uploadProgress),
    uploadProgress,
    formError,
    conflictPost,
    siteLanguages,
    currentLanguageOptions,
    canSave: Boolean(
      state && isDirty && !isSaving && !uploadProgress && !conflictPost,
    ),
    setMedia,
    updateCopyBody,
    updateEditLanguage,
    removeMedia,
    addPhotosFromFiles,
    cancelUpload,
    save,
    applyLatestConflict,
    close,
    setPublished: (value: boolean) =>
      setState((current) =>
        current ? { ...current, published: value } : current,
      ),
  };
}
