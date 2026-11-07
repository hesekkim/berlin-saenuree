import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import type { UploadItem } from '../../../../../shared/components/ui/Upload/useUpload';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  uploadMediaFile,
  type MediaFileResponse,
} from '../../../../../shared/api/mediaApi';
import { validateUploadFile } from '../../../../../shared/components/ui/Upload/uploadValidation';
import {
  createAdminPost,
  type PostCopy,
  type PostImage,
} from '../../../../../shared/api/postsApi';
import {
  hasRichHtmlOverLimit,
  MAX_RICH_HTML_LENGTH,
  sanitizeRichHtml,
} from '../../../../../shared/lib/richText';
import type { AdminTranslations } from '../../../translations';

export const MAX_POST_IMAGES = 30;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type ComposerStep = 1 | 2 | 3;

export type UsePostComposerOptions = {
  isOpen: boolean;
  onClose: () => void;
  onPublished: () => void | Promise<void>;
  labels: AdminTranslations;
  availableLanguages: string[];
};

function sanitizeCopies(
  copies: Record<string, PostCopy>,
): Record<string, PostCopy> {
  const next: Record<string, PostCopy> = {};
  for (const [code, copy] of Object.entries(copies)) {
    next[code] = { body: sanitizeRichHtml(copy.body ?? '') };
  }
  return next;
}

export function computeCanGoNextFromPhotos(
  imageCount: number,
  uploadBusy: boolean,
  uploadHasError: boolean,
): boolean {
  return imageCount >= 1 && !uploadBusy && !uploadHasError;
}

export function takeImagesWithinLimit<T>(
  currentCount: number,
  incoming: T[],
  max: number = MAX_POST_IMAGES,
): { accepted: T[]; rejected: T[] } {
  const room = Math.max(0, max - currentCount);
  if (incoming.length <= room) {
    return { accepted: incoming, rejected: [] };
  }
  return {
    accepted: incoming.slice(0, room),
    rejected: incoming.slice(room),
  };
}

export function usePostComposer({
  isOpen,
  onClose,
  onPublished,
  labels,
  availableLanguages,
}: UsePostComposerOptions) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const [step, setStep] = useState<ComposerStep>(1);
  const [images, setImages] = useState<PostImage[]>([]);
  const [copies, setCopies] = useState<Record<string, PostCopy>>({});
  const [editLanguage, setEditLanguage] = useState('en');
  const [published, setPublished] = useState(true);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [optimizingCount, setOptimizingCount] = useState(0);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [closing, setClosing] = useState(false);

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const uploadItemsRef = useRef(uploadItems);
  uploadItemsRef.current = uploadItems;
  const sessionImageIdsRef = useRef(new Set<string>());
  const sessionFileIdsRef = useRef(new Set<string>());
  const sessionActiveRef = useRef(false);

  const siteLanguages = useMemo(
    () => (availableLanguages.length > 0 ? availableLanguages : ['en']),
    [availableLanguages],
  );

  const resetSessionTracking = () => {
    sessionImageIdsRef.current = new Set();
    sessionFileIdsRef.current = new Set();
  };

  const discardSessionMedia = useCallback(async () => {
    const imageIds = [...sessionImageIdsRef.current];
    const fileIds = [...sessionFileIdsRef.current];
    sessionImageIdsRef.current = new Set();
    sessionFileIdsRef.current = new Set();
    await Promise.all([
      ...imageIds.map(async (imageId) => {
        try {
          await deleteOptimizedImage(imageId);
        } catch {
          // Best-effort session cleanup.
        }
      }),
      ...fileIds.map(async (fileId) => {
        try {
          await deleteMediaFile(fileId);
        } catch {
          // May already be deleted.
        }
      }),
    ]);
  }, []);

  const resetForm = useCallback(() => {
    setStep(1);
    setImages([]);
    setCopies({});
    setEditLanguage(siteLanguages[0] ?? 'en');
    setPublished(true);
    setUploadItems([]);
    setOptimizingCount(0);
    setFormError('');
    setIsSaving(false);
    setUploadKey((key) => key + 1);
  }, [siteLanguages]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Reset only when the dialog opens — not when siteLanguages refresh.
      sessionActiveRef.current = true;
      resetSessionTracking();
      resetForm();
    }
    if (!isOpen) {
      sessionActiveRef.current = false;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, resetForm]);

  const uploadDefaults = useMemo(
    (): MediaFileResponse[] =>
      images.map((image) => ({
        id: image.sourceFileId,
        // Prefer thumb so step-1 Back still shows a preview after optimize.
        url: `/api/v1/media/images/${image.imageId}/thumb`,
        originalName: image.imageId,
        contentType: 'image/jpeg',
        sizeBytes: 0,
      })),
    [images],
  );

  const uploadBusy =
    optimizingCount > 0 ||
    uploadItems.some(
      (item) => item.status === 'pending' || item.status === 'uploading',
    );
  const uploadHasError = uploadItems.some((item) => item.status === 'error');
  const canGoNextFromPhotos = computeCanGoNextFromPhotos(
    images.length,
    uploadBusy,
    uploadHasError,
  );
  const canPublish = images.length >= 1 && !isSaving && !uploadBusy;

  const handleUploaded = useCallback(async (files: MediaFileResponse[]) => {
    const { accepted, rejected } = takeImagesWithinLimit(
      imagesRef.current.length,
      files,
    );
    if (rejected.length > 0) {
      toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
      await Promise.all(
        rejected.map(async (file) => {
          try {
            await deleteMediaFile(file.id);
          } catch {
            // Best-effort.
          }
        }),
      );
    }

    for (const file of accepted) {
      if (!sessionActiveRef.current) {
        try {
          await deleteMediaFile(file.id);
        } catch {
          // Best-effort — dialog already closed.
        }
        continue;
      }

      sessionFileIdsRef.current.add(file.id);
      setOptimizingCount((count) => count + 1);
      try {
        const optimized = await optimizeMediaImage(file.id, [
          'display',
          'thumb',
        ]);
        if (!sessionActiveRef.current) {
          try {
            await deleteOptimizedImage(optimized.imageId);
          } catch {
            // Best-effort.
          }
          try {
            await deleteMediaFile(file.id);
          } catch {
            // Best-effort.
          }
          sessionFileIdsRef.current.delete(file.id);
          continue;
        }
        sessionImageIdsRef.current.add(optimized.imageId);
        setImages((prev) => {
          if (prev.length >= MAX_POST_IMAGES) {
            sessionImageIdsRef.current.delete(optimized.imageId);
            sessionFileIdsRef.current.delete(file.id);
            void deleteOptimizedImage(optimized.imageId).catch(() => {});
            void deleteMediaFile(file.id).catch(() => {});
            return prev;
          }
          if (prev.some((image) => image.imageId === optimized.imageId)) {
            return prev;
          }
          return [
            ...prev,
            {
              imageId: optimized.imageId,
              sourceFileId: optimized.sourceFileId || file.id,
              width: optimized.width,
              height: optimized.height,
            },
          ];
        });
      } catch {
        sessionFileIdsRef.current.delete(file.id);
        try {
          await deleteMediaFile(file.id);
        } catch {
          // Best-effort.
        }
        toastRef.current.error(labelsRef.current.postsOptimizeFailed);
      } finally {
        setOptimizingCount((count) => Math.max(0, count - 1));
      }
    }
  }, []);

  const handleUploadItemsChange = useCallback((items: UploadItem[]) => {
    const previous = uploadItemsRef.current;
    setUploadItems(items);

    const busy = items.some(
      (item) => item.status === 'pending' || item.status === 'uploading',
    );
    if (busy) {
      return;
    }

    const previousIds = new Set(
      previous
        .map((item) => item.uploaded?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const nextIds = new Set(
      items
        .map((item) => item.uploaded?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const removedIds = [...previousIds].filter((id) => !nextIds.has(id));
    if (removedIds.length === 0) {
      return;
    }

    // Upload has retainUploadedRemotes — composer owns DELETE for removed rows.
    const currentImages = imagesRef.current;
    const removed = currentImages.filter((image) =>
      removedIds.includes(image.sourceFileId),
    );
    if (removed.length === 0) {
      return;
    }
    for (const target of removed) {
      sessionImageIdsRef.current.delete(target.imageId);
      sessionFileIdsRef.current.delete(target.sourceFileId);
    }
    setImages((prev) =>
      prev.filter((image) => !removedIds.includes(image.sourceFileId)),
    );
    for (const target of removed) {
      void deleteOptimizedImage(target.imageId).catch(() => {});
      void deleteMediaFile(target.sourceFileId).catch(() => {});
    }
  }, []);

  const removeImage = useCallback((imageId: string) => {
    const current = imagesRef.current;
    if (current.length <= 1) {
      toastRef.current.warning(labelsRef.current.postsMinImageWarning);
      return;
    }
    const target = current.find((image) => image.imageId === imageId);
    if (!target) {
      return;
    }
    sessionImageIdsRef.current.delete(target.imageId);
    sessionFileIdsRef.current.delete(target.sourceFileId);
    setImages((prev) => prev.filter((image) => image.imageId !== imageId));
    void deleteOptimizedImage(target.imageId).catch(() => {});
    void deleteMediaFile(target.sourceFileId).catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    if (step === 1 && canGoNextFromPhotos) {
      setStep(2);
      return;
    }
    if (step === 2 && images.length >= 1) {
      setStep(3);
    }
  }, [canGoNextFromPhotos, images.length, step]);

  const goBack = useCallback(() => {
    if (step === 2) {
      // Align uploadItems with images before remount so onItemsChange does
      // not treat step-2 removals as a second DELETE pass.
      setUploadItems(
        images.map((image) => ({
          key: `remote-${image.sourceFileId}`,
          file: new File([], image.imageId, { type: 'image/jpeg' }),
          status: 'uploaded' as const,
          uploaded: {
            id: image.sourceFileId,
            url: `/api/v1/media/images/${image.imageId}/thumb`,
            originalName: image.imageId,
            contentType: 'image/jpeg',
            sizeBytes: 0,
          },
          retainRemote: true,
        })),
      );
      setStep(1);
      setUploadKey((key) => key + 1);
      return;
    }
    if (step === 3) {
      setStep(2);
    }
  }, [images, step]);

  const addPhotosFromFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !sessionActiveRef.current) {
        return;
      }

      const room = Math.max(0, MAX_POST_IMAGES - imagesRef.current.length);
      if (room === 0) {
        toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
        return;
      }

      const acceptedFiles = files.slice(0, room);
      if (acceptedFiles.length < files.length) {
        toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
      }

      const uploaded: MediaFileResponse[] = [];
      setOptimizingCount((count) => count + 1);
      try {
        for (const file of acceptedFiles) {
          const validation = validateUploadFile(file, {
            accept: IMAGE_ACCEPT,
            maxSizeBytes: IMAGE_MAX_BYTES,
          });
          if (!validation.ok) {
            toastRef.current.error(
              validation.code === 'size_exceeded'
                ? labelsRef.current.uploadSizeExceeded
                : labelsRef.current.uploadTypeNotAllowed,
            );
            continue;
          }
          try {
            const media = await uploadMediaFile(file, {
              accept: IMAGE_ACCEPT,
              maxSizeBytes: IMAGE_MAX_BYTES,
            });
            uploaded.push(media);
          } catch {
            toastRef.current.error(labelsRef.current.uploadUploadFailed);
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } finally {
        setOptimizingCount((count) => Math.max(0, count - 1));
      }

      if (uploaded.length > 0) {
        await handleUploaded(uploaded);
      }
    },
    [handleUploaded],
  );

  const updateCopyBody = useCallback(
    (body: string) => {
      setCopies((prev) => ({
        ...prev,
        [editLanguage]: { body },
      }));
    },
    [editLanguage],
  );

  const closeAndDiscard = useCallback(async () => {
    if (closing || isSaving) {
      return;
    }
    setClosing(true);
    sessionActiveRef.current = false;
    try {
      await discardSessionMedia();
      resetForm();
      onClose();
    } finally {
      setClosing(false);
    }
  }, [closing, discardSessionMedia, isSaving, onClose, resetForm]);

  const publish = useCallback(async () => {
    if (!canPublish) {
      return;
    }
    const copiesToSave = sanitizeCopies(copies);
    if (hasRichHtmlOverLimit(copiesToSave, MAX_RICH_HTML_LENGTH)) {
      toastRef.current.error(labelsRef.current.richTextTooLong);
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      await createAdminPost({
        published,
        pinned: false,
        images,
        copies: copiesToSave,
      });
      resetSessionTracking();
      sessionActiveRef.current = false;
      toastRef.current.info(labelsRef.current.postsPublishSuccess);
      resetForm();
      await onPublished();
      onClose();
    } catch {
      setFormError(labelsRef.current.postsPublishFailed);
      toastRef.current.error(labelsRef.current.postsPublishFailed);
    } finally {
      setIsSaving(false);
    }
  }, [canPublish, copies, published, images, onClose, onPublished, resetForm]);

  const dialogTitle =
    step === 1
      ? labels.postsComposerStepPhotos
      : step === 2
        ? labels.postsComposerStepOrder
        : labels.postsComposerStepCaption;

  return {
    step,
    images,
    setImages,
    copies,
    editLanguage,
    setEditLanguage,
    published,
    setPublished,
    formError,
    isSaving,
    closing,
    uploadKey,
    uploadDefaults,
    uploadBusy,
    canGoNextFromPhotos,
    canPublish,
    dialogTitle,
    siteLanguages,
    imageAccept: IMAGE_ACCEPT,
    imageMaxBytes: IMAGE_MAX_BYTES,
    handleUploaded,
    handleUploadItemsChange,
    removeImage,
    goNext,
    goBack,
    addPhotosFromFiles,
    updateCopyBody,
    closeAndDiscard,
    publish,
  };
}
