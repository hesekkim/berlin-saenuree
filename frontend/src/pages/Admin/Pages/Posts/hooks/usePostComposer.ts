import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import type { UploadItem } from '../../../../../shared/components/ui/Upload/useUpload';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  renewVideoUploadLease,
  uploadMediaFile,
  type MediaFileResponse,
} from '../../../../../shared/api/mediaApi';
import { validateUploadFile } from '../../../../../shared/components/ui/Upload/uploadValidation';
import {
  createAdminPost,
  type PostCopy,
  type PostMedia,
} from '../../../../../shared/api/postsApi';
import {
  hasRichHtmlOverLimit,
  MAX_RICH_HTML_LENGTH,
  sanitizeRichHtml,
} from '../../../../../shared/lib/richText';
import type { AdminTranslations } from '../../../translations';
import {
  getPostMediaMaxBytes,
  IMAGE_MAX_BYTES,
  MAX_POST_MEDIA,
  POST_MEDIA_ACCEPT,
  readVideoDimensions,
  VIDEO_MAX_BYTES,
} from '../utils/postMedia';

const VIDEO_UPLOAD_LEASE_RENEWAL_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
  max: number = MAX_POST_MEDIA,
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
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [copies, setCopies] = useState<Record<string, PostCopy>>({});
  const [editLanguage, setEditLanguage] = useState('en');
  const [published, setPublished] = useState(true);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [optimizingCount, setOptimizingCount] = useState(0);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [closing, setClosing] = useState(false);

  const mediaRef = useRef(media);
  mediaRef.current = media;
  const uploadItemsRef = useRef(uploadItems);
  uploadItemsRef.current = uploadItems;
  const sessionImageIdsRef = useRef(new Set<string>());
  const sessionFileIdsRef = useRef(new Set<string>());
  const sessionVideoFileIdsRef = useRef(new Set<string>());
  const sessionActiveRef = useRef(false);

  const siteLanguages = useMemo(
    () => (availableLanguages.length > 0 ? availableLanguages : ['en']),
    [availableLanguages],
  );

  const resetSessionTracking = () => {
    sessionImageIdsRef.current = new Set();
    sessionFileIdsRef.current = new Set();
    sessionVideoFileIdsRef.current = new Set();
  };

  const discardSessionMedia = useCallback(async () => {
    const imageIds = [...sessionImageIdsRef.current];
    const fileIds = [...sessionFileIdsRef.current];
    sessionImageIdsRef.current = new Set();
    sessionFileIdsRef.current = new Set();
    sessionVideoFileIdsRef.current = new Set();
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
    setMedia([]);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const renewLeases = () => {
      if (!sessionActiveRef.current) {
        return;
      }
      for (const fileId of sessionVideoFileIdsRef.current) {
        void renewVideoUploadLease(fileId).catch(() => {
          toastRef.current.warning(labelsRef.current.postsVideoLeaseRenewalFailed);
        });
      }
    };
    const intervalId = window.setInterval(
      renewLeases,
      VIDEO_UPLOAD_LEASE_RENEWAL_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  const uploadDefaults = useMemo(
    (): MediaFileResponse[] =>
      media.map((item, index) =>
        item.type === 'image'
          ? {
              id: item.sourceFileId,
              url: `/api/v1/media/images/${item.imageId}/thumb`,
              originalName: item.imageId,
              contentType: 'image/jpeg',
              sizeBytes: 0,
            }
          : {
              id: item.fileId,
              url: `/api/v1/media/files/${item.fileId}`,
              originalName: `video-${index + 1}.mp4`,
              contentType: 'video/mp4',
              sizeBytes: 0,
            },
      ),
    [media],
  );

  const uploadBusy =
    optimizingCount > 0 ||
    uploadItems.some(
      (item) => item.status === 'pending' || item.status === 'uploading',
    );
  const uploadHasError = uploadItems.some((item) => item.status === 'error');
  const canGoNextFromPhotos = computeCanGoNextFromPhotos(
    media.length,
    uploadBusy,
    uploadHasError,
  );
  const canPublish = media.length >= 1 && !isSaving && !uploadBusy;

  const handleUploaded = useCallback(
    async (
      files: MediaFileResponse[],
      uploadedItems: UploadItem[] = [],
    ) => {
      const { accepted, rejected } = takeImagesWithinLimit(
        mediaRef.current.length,
        files,
      );
      const mediaLimitRejected = rejected.length > 0;
      const hasVideo = mediaRef.current.some((item) => item.type === 'video');
      let acceptedVideo = hasVideo;
      let rejectedVideo = false;
      const validFiles: MediaFileResponse[] = [];
      for (const file of accepted) {
        if (file.contentType === 'video/mp4') {
          if (acceptedVideo) {
            rejected.push(file);
            rejectedVideo = true;
            continue;
          }
          acceptedVideo = true;
        }
        validFiles.push(file);
      }
      if (rejected.length > 0) {
        if (rejectedVideo) {
          toastRef.current.warning(labelsRef.current.postsVideoLimitWarning);
        }
        if (mediaLimitRejected) {
          toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
        }
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

      for (const file of validFiles) {
        if (!sessionActiveRef.current) {
          try {
            await deleteMediaFile(file.id);
          } catch {
            // Best-effort — dialog already closed.
          }
          continue;
        }

      sessionFileIdsRef.current.add(file.id);
      if (file.contentType === 'video/mp4') {
        sessionVideoFileIdsRef.current.add(file.id);
        const source = uploadedItems.find(
          (item) => item.uploaded?.id === file.id,
        )?.file;
        if (!source) {
          toastRef.current.error(labelsRef.current.uploadUploadFailed);
          sessionFileIdsRef.current.delete(file.id);
          sessionVideoFileIdsRef.current.delete(file.id);
          await deleteMediaFile(file.id);
          continue;
        }
        try {
          const dimensions = await readVideoDimensions(source);
          if (!sessionActiveRef.current) {
            sessionFileIdsRef.current.delete(file.id);
            sessionVideoFileIdsRef.current.delete(file.id);
            await deleteMediaFile(file.id);
            continue;
          }
          setMedia((previous) => {
            if (
              previous.length >= MAX_POST_MEDIA ||
              previous.some((item) => item.type === 'video')
            ) {
              sessionFileIdsRef.current.delete(file.id);
              sessionVideoFileIdsRef.current.delete(file.id);
              void deleteMediaFile(file.id).catch(() => {});
              return previous;
            }
            return [
              ...previous,
              { type: 'video', fileId: file.id, ...dimensions },
            ];
          });
        } catch {
          sessionFileIdsRef.current.delete(file.id);
          sessionVideoFileIdsRef.current.delete(file.id);
          await deleteMediaFile(file.id);
          toastRef.current.error(labelsRef.current.uploadUploadFailed);
        }
        continue;
      }
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
        setMedia((prev) => {
          if (prev.length >= MAX_POST_MEDIA) {
            sessionImageIdsRef.current.delete(optimized.imageId);
            sessionFileIdsRef.current.delete(file.id);
            void deleteOptimizedImage(optimized.imageId).catch(() => {});
            void deleteMediaFile(file.id).catch(() => {});
            return prev;
          }
          if (
            prev.some(
              (item) =>
                item.type === 'image' && item.imageId === optimized.imageId,
            )
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              type: 'image',
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
    },
    [],
  );

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
    const removed = mediaRef.current.filter((item) =>
      removedIds.includes(
        item.type === 'image' ? item.sourceFileId : item.fileId,
      ),
    );
    if (removed.length === 0) {
      return;
    }
    for (const target of removed) {
      if (target.type === 'image') {
        sessionImageIdsRef.current.delete(target.imageId);
        sessionFileIdsRef.current.delete(target.sourceFileId);
      } else {
        sessionFileIdsRef.current.delete(target.fileId);
        sessionVideoFileIdsRef.current.delete(target.fileId);
      }
    }
    setMedia((prev) =>
      prev.filter((item) =>
        !removedIds.includes(
          item.type === 'image' ? item.sourceFileId : item.fileId,
        ),
      ),
    );
    for (const target of removed) {
      if (target.type === 'image') {
        void deleteOptimizedImage(target.imageId).catch(() => {});
        void deleteMediaFile(target.sourceFileId).catch(() => {});
      } else {
        void deleteMediaFile(target.fileId).catch(() => {});
      }
      }
    },
    [],
  );

  const removeMedia = useCallback((mediaId: string) => {
    const current = mediaRef.current;
    if (current.length <= 1) {
      toastRef.current.warning(labelsRef.current.postsMinImageWarning);
      return;
    }
    const target = current.find((item) =>
      item.type === 'image'
        ? item.imageId === mediaId
        : item.fileId === mediaId,
    );
    if (!target) {
      return;
    }
    if (target.type === 'image') {
      sessionImageIdsRef.current.delete(target.imageId);
      sessionFileIdsRef.current.delete(target.sourceFileId);
      void deleteOptimizedImage(target.imageId).catch(() => {});
      void deleteMediaFile(target.sourceFileId).catch(() => {});
    } else {
      sessionFileIdsRef.current.delete(target.fileId);
      sessionVideoFileIdsRef.current.delete(target.fileId);
      void deleteMediaFile(target.fileId).catch(() => {});
    }
    setMedia((prev) =>
      prev.filter((item) =>
        item.type === 'image'
          ? item.imageId !== mediaId
          : item.fileId !== mediaId,
      ),
    );
  }, []);

  const goNext = useCallback(() => {
    if (step === 1 && canGoNextFromPhotos) {
      setStep(2);
      return;
    }
    if (step === 2 && media.length >= 1) {
      setStep(3);
    }
  }, [canGoNextFromPhotos, media.length, step]);

  const goBack = useCallback(() => {
    if (step === 2) {
      // Align uploadItems with media before remount so onItemsChange does
      // not treat step-2 removals as a second DELETE pass.
      setUploadItems(
        media.map((item, index) => {
          const isImage = item.type === 'image';
          const id = isImage ? item.sourceFileId : item.fileId;
          const name = isImage ? item.imageId : `video-${index + 1}.mp4`;
          const contentType = isImage ? 'image/jpeg' : 'video/mp4';
          return {
            key: `remote-${id}`,
            file: new File([], name, { type: contentType }),
            status: 'uploaded' as const,
            uploaded: {
              id,
              url: isImage
                ? `/api/v1/media/images/${item.imageId}/thumb`
                : `/api/v1/media/files/${id}`,
              originalName: name,
              contentType,
              sizeBytes: 0,
            },
            retainRemote: true,
          };
        }),
      );
      setStep(1);
      setUploadKey((key) => key + 1);
      return;
    }
    if (step === 3) {
      setStep(2);
    }
  }, [media, step]);

  const addPhotosFromFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !sessionActiveRef.current) {
        return;
      }

      const room = Math.max(0, MAX_POST_MEDIA - mediaRef.current.length);
      if (room === 0) {
        toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
        return;
      }

      let acceptedVideo = mediaRef.current.some(
        (item) => item.type === 'video',
      );
      let rejectedVideo = false;
      const mediaLimitRejected = files.length > room;
      const acceptedFiles = files
        .slice(0, room)
        .filter((file) => {
          if (
            file.type !== 'video/mp4' &&
            !file.name.toLowerCase().endsWith('.mp4')
          ) {
            return true;
          }
          if (acceptedVideo) {
            rejectedVideo = true;
            return false;
          }
          acceptedVideo = true;
          return true;
        });
      if (acceptedFiles.length < files.length) {
        if (rejectedVideo) {
          toastRef.current.warning(labelsRef.current.postsVideoLimitWarning);
        }
        if (mediaLimitRejected) {
          toastRef.current.warning(labelsRef.current.postsImageLimitWarning);
        }
      }

      const uploaded: MediaFileResponse[] = [];
      const uploadedItems: UploadItem[] = [];
      setOptimizingCount((count) => count + 1);
      try {
        for (const file of acceptedFiles) {
          const isVideo =
            file.type === 'video/mp4' ||
            file.name.toLowerCase().endsWith('.mp4');
          const validation = validateUploadFile(file, {
            accept: POST_MEDIA_ACCEPT,
            maxSizeBytes: isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
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
              accept: POST_MEDIA_ACCEPT,
              maxSizeBytes: isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
              leaseVideoUpload: isVideo,
            });
            uploaded.push(media);
            uploadedItems.push({
              key: `uploaded-${media.id}`,
              file,
              status: 'uploaded',
              uploaded: media,
            });
          } catch {
            toastRef.current.error(labelsRef.current.uploadUploadFailed);
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } finally {
        setOptimizingCount((count) => Math.max(0, count - 1));
      }

      if (uploaded.length > 0) {
        await handleUploaded(uploaded, uploadedItems);
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
        media,
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
  }, [canPublish, copies, published, media, onClose, onPublished, resetForm]);

  const dialogTitle =
    step === 1
      ? labels.postsComposerStepPhotos
      : step === 2
        ? labels.postsComposerStepOrder
        : labels.postsComposerStepCaption;

  return {
    step,
    media,
    setMedia,
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
    mediaAccept: POST_MEDIA_ACCEPT,
    mediaMaxBytes: VIDEO_MAX_BYTES,
    perFileMaxBytes: getPostMediaMaxBytes,
    handleUploaded,
    handleUploadItemsChange,
    removeMedia,
    goNext,
    goBack,
    addPhotosFromFiles,
    updateCopyBody,
    closeAndDiscard,
    publish,
  };
}
