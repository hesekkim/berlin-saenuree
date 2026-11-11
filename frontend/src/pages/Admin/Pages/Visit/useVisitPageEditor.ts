import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  fetchEditablePageDocument,
  saveEditablePageDocument,
  type EditablePageDocument,
} from '../../../../shared/api/cmsApi';
import { useConfig } from '../../../../shared/context/ConfigContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import { getLanguageLabel, resolveLanguage } from '../../../../shared/config/siteLanguages';
import { isWorldLanguageCode } from '../../../../shared/config/worldLanguages';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  type MediaFileResponse,
} from '../../../../shared/api/mediaApi';
import type { UploadItem } from '../../../../shared/components/ui/Upload/useUpload';
import {
  isSafeGoogleMapsUrl,
  normalizeVisitSharedMedia,
  normalizeVisitCopy,
  type VisitContentByLanguage,
  type VisitCopy,
  type VisitImage,
  type VisitSharedMedia,
  type VisitTransitRoute,
} from '../../../../shared/content/visitContent';
import { getVisitAdminLabels } from './visitAdminLabels';

type VisitImageGroup = keyof VisitSharedMedia;
type PendingVisitImage = Pick<VisitImage, 'imageId' | 'sourceFileId'>;
const PENDING_VISIT_MEDIA_KEY = 'cms.visit.pending-media.v1';

function readPendingImages(): PendingVisitImage[] {
  const saved = window.sessionStorage.getItem(PENDING_VISIT_MEDIA_KEY);
  if (!saved) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (image) =>
          image &&
          typeof image.imageId === 'string' &&
          typeof image.sourceFileId === 'string',
      )
    ) {
      return parsed;
    }
    throw new Error('Invalid pending Visit media list');
  } catch (error) {
    console.error('Failed to read pending Visit media', error);
    window.sessionStorage.removeItem(PENDING_VISIT_MEDIA_KEY);
    return [];
  }
}

function writePendingImages(images: PendingVisitImage[]) {
  if (images.length === 0) {
    window.sessionStorage.removeItem(PENDING_VISIT_MEDIA_KEY);
    return;
  }
  window.sessionStorage.setItem(
    PENDING_VISIT_MEDIA_KEY,
    JSON.stringify(images),
  );
}

function trackPendingImage(image: PendingVisitImage) {
  writePendingImages([
    ...readPendingImages().filter(
      (pending) => pending.sourceFileId !== image.sourceFileId,
    ),
    image,
  ]);
}

function savedVisitImages(media: VisitSharedMedia): Set<string> {
  return new Set(
    [...media.mapImages, ...media.venueImages]
      .map((image) => image.sourceFileId)
      .filter(Boolean),
  );
}

async function recoverPendingMedia(media: VisitSharedMedia) {
  const savedSources = savedVisitImages(media);
  const remaining: PendingVisitImage[] = [];
  let failed = false;
  for (const image of readPendingImages()) {
    if (savedSources.has(image.sourceFileId)) {
      continue;
    }
    try {
      if (image.imageId) {
        await deleteOptimizedImage(image.imageId);
      }
      if (image.sourceFileId) {
        await deleteMediaFile(image.sourceFileId);
      }
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status !== 404 && status !== 409) {
        console.error('Failed to recover pending Visit media', error);
        remaining.push(image);
        failed = true;
      }
    }
  }
  writePendingImages(remaining);
  return failed;
}

function normalizeVisitContent(
  content: Record<string, Record<string, unknown>>,
  languages: string[] = [],
): VisitContentByLanguage {
  const normalized = Object.fromEntries(
    [...new Set([...Object.keys(content), ...languages])].map((language) => [
      language,
      normalizeVisitCopy(content[language]),
    ]),
  ) as VisitContentByLanguage;
  const serviceIds = [
    ...new Set(
      Object.values(normalized).flatMap((copy) =>
        copy.services.map((service) => service.id),
      ),
    ),
  ];
  const primaryTransitIds = [
    ...new Set(
      Object.values(normalized).flatMap((copy) =>
        copy.primaryTransit.map((route) => route.id),
      ),
    ),
  ];
  const secondaryTransitIds = [
    ...new Set(
      Object.values(normalized).flatMap((copy) =>
        copy.secondaryTransit.map((route) => route.id),
      ),
    ),
  ];

  return Object.fromEntries(
    Object.entries(normalized).map(([language, copy]) => [
      language,
      {
        ...copy,
        services: serviceIds.map(
          (id) =>
            copy.services.find((service) => service.id === id) ?? {
              id,
              name: '',
              day: '',
              time: '',
              place: '',
            },
        ),
        primaryTransit: primaryTransitIds.map(
          (id) =>
            copy.primaryTransit.find((route) => route.id === id) ?? {
              id,
              type: '',
              line: '',
              station: '',
              walkingTime: '',
            },
        ),
        secondaryTransit: secondaryTransitIds.map(
          (id) =>
            copy.secondaryTransit.find((route) => route.id === id) ?? {
              id,
              type: '',
              line: '',
              station: '',
              walkingTime: '',
            },
        ),
      },
    ]),
  );
}

export function useVisitPageEditor() {
  const { availableLanguages } = useConfig();
  const { language: adminLanguage } = useCmsConfig();
  const labels = getVisitAdminLabels(adminLanguage);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const cleanupFailedLabelRef = useRef(labels.imageCleanupFailed);
  cleanupFailedLabelRef.current = labels.imageCleanupFailed;
  const [editLanguage, setEditLanguage] = useState(() =>
    resolveLanguage('en', availableLanguages),
  );
  const [draft, setDraft] = useState<VisitContentByLanguage>({});
  const [savedDraft, setSavedDraft] = useState<VisitContentByLanguage>({});
  const [imagesDraft, setImagesDraft] = useState<VisitSharedMedia>(() =>
    normalizeVisitSharedMedia(null),
  );
  const [savedImagesDraft, setSavedImagesDraft] = useState<VisitSharedMedia>(
    () => normalizeVisitSharedMedia(null),
  );
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<EditablePageDocument | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageOptimizing, setIsImageOptimizing] = useState(false);
  const [isImageCleaning, setIsImageCleaning] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [imageUploadFailed, setImageUploadFailed] = useState(false);
  const imageCleanupCountRef = useRef(0);
  const imageOptimizationCountRef = useRef(0);
  const imageUploadItemsRef = useRef<Record<VisitImageGroup, UploadItem[]>>({
    mapImages: [],
    venueImages: [],
  });
  const [uploadEpoch, setUploadEpoch] = useState<Record<VisitImageGroup, number>>({
    mapImages: 0,
    venueImages: 0,
  });

  const applyDocument = useCallback((document: EditablePageDocument) => {
    const content = normalizeVisitContent(document.content);
    const sharedMedia = normalizeVisitSharedMedia(document.sharedMedia);
    setDraft(content);
    setSavedDraft(content);
    setImagesDraft(sharedMedia);
    setSavedImagesDraft(sharedMedia);
    setRevision(document.contentRevision);
    setIsReady(true);
    setLoadFailed(false);
  }, []);

  const load = useCallback(async () => {
    setIsReady(false);
    setLoadFailed(false);
    imageCleanupCountRef.current += 1;
    setIsImageCleaning(true);
    try {
      const document = await fetchEditablePageDocument('visit');
      applyDocument(document);
      if (await recoverPendingMedia(normalizeVisitSharedMedia(document.sharedMedia))) {
        toastRef.current.error(cleanupFailedLabelRef.current);
      }
    } catch (error) {
      console.error('Failed to load Visit page content for editing', error);
      setLoadFailed(true);
      setIsReady(true);
    } finally {
      imageCleanupCountRef.current -= 1;
      setIsImageCleaning(imageCleanupCountRef.current > 0);
    }
  }, [applyDocument]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEditLanguage((current) => resolveLanguage(current, availableLanguages));
  }, [availableLanguages]);

  const editLanguageOptions = useMemo(
    () =>
      availableLanguages.map((value) => ({
        value,
        label: getLanguageLabel(value),
      })),
    [availableLanguages],
  );

  const current = normalizeVisitCopy(draft[editLanguage]);
  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(savedDraft) ||
    JSON.stringify(imagesDraft) !== JSON.stringify(savedImagesDraft);
  const hasInvalidMapLink =
    current.googleMapsUrl.trim() !== '' &&
    !isSafeGoogleMapsUrl(current.googleMapsUrl.trim());

  const updateAllCopies = useCallback(
    (update: (copy: VisitCopy) => VisitCopy) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) =>
        Object.fromEntries(
          Object.entries(normalizeVisitContent(previous, availableLanguages)).map(
            ([language, copy]) => [language, update(copy)],
          ),
        ),
      );
    },
    [availableLanguages, isReady],
  );

  const updateCopy = useCallback(
    (update: (copy: VisitCopy) => VisitCopy) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) => ({
        ...previous,
        [editLanguage]: update(normalizeVisitCopy(previous[editLanguage])),
      }));
    },
    [editLanguage, isReady],
  );

  const updateField = useCallback(
    (field: 'address' | 'googleMapsUrl', value: string) => {
      updateCopy((copy) => ({ ...copy, [field]: value }));
    },
    [updateCopy],
  );

  const updateImages = useCallback(
    (group: VisitImageGroup, update: (images: VisitImage[]) => VisitImage[]) => {
      if (!isReady) {
        return;
      }
      setImagesDraft((previous) => ({
        ...previous,
        [group]: update(previous[group]),
      }));
    },
    [isReady],
  );

  const cleanupImage = useCallback(
    async (image: PendingVisitImage) => {
      try {
        if (image.imageId) {
          try {
            await deleteOptimizedImage(image.imageId);
          } catch (error) {
            const status = axios.isAxiosError(error)
              ? error.response?.status
              : undefined;
            if (status !== 404 && status !== 409) {
              throw error;
            }
            if (status === 409) {
              writePendingImages(
                readPendingImages().filter(
                  (item) => item.sourceFileId !== image.sourceFileId,
                ),
              );
              return;
            }
          }
        }
        if (image.sourceFileId) {
          try {
            await deleteMediaFile(image.sourceFileId);
          } catch (error) {
            const status = axios.isAxiosError(error)
              ? error.response?.status
              : undefined;
            if (status !== 404 && status !== 409) {
              throw error;
            }
          }
        }
        writePendingImages(
          readPendingImages().filter(
            (item) => item.sourceFileId !== image.sourceFileId,
          ),
        );
      } catch (error) {
        console.error('Failed to clean up an unsaved Visit image', error);
        toast.error(labels.imageCleanupFailed);
      }
    },
    [labels.imageCleanupFailed, toast],
  );

  const scheduleImageCleanup = useCallback(
    (image: PendingVisitImage) => {
      imageCleanupCountRef.current += 1;
      setIsImageCleaning(true);
      void cleanupImage(image).finally(() => {
        imageCleanupCountRef.current -= 1;
        setIsImageCleaning(imageCleanupCountRef.current > 0);
      });
    },
    [cleanupImage],
  );

  const removeImage = useCallback(
    (group: VisitImageGroup, imageId: string) => {
      const image = imagesDraft[group].find((item) => item.imageId === imageId);
      if (!image) {
        return;
      }
      updateImages(group, (images) =>
        images.filter((item) => item.imageId !== imageId),
      );
      imageUploadItemsRef.current[group] = [];
      setUploadEpoch((previous) => ({
        ...previous,
        [group]: previous[group] + 1,
      }));
      if (
        image?.sourceFileId &&
        !savedVisitImages(savedImagesDraft).has(image.sourceFileId)
      ) {
        scheduleImageCleanup(image);
      }
    },
    [imagesDraft, savedImagesDraft, scheduleImageCleanup, updateImages],
  );

  const reorderImages = useCallback(
    (group: VisitImageGroup, images: VisitImage[]) => {
      updateImages(group, () => images);
    },
    [updateImages],
  );

  const handleImageUploaded = useCallback(
    async (group: VisitImageGroup, files: MediaFileResponse[]) => {
      setImageUploadFailed(false);
      imageOptimizationCountRef.current += 1;
      setIsImageOptimizing(true);
      try {
        for (const file of files) {
          let pending: PendingVisitImage = {
            imageId: '',
            sourceFileId: file.id,
          };
          trackPendingImage(pending);
          try {
            const optimized = await optimizeMediaImage(file.id, [
              'display',
              'thumb',
            ]);
            const image: VisitImage = {
              imageId: optimized.imageId,
              sourceFileId: optimized.sourceFileId,
            };
            pending = image;
            trackPendingImage(image);
            if (optimized.sourceFileId !== file.id) {
              await deleteMediaFile(file.id);
              writePendingImages(
                readPendingImages().filter(
                  (item) => item.sourceFileId !== file.id,
                ),
              );
            }
            updateImages(group, (images) => [...images, image]);
          } catch (error) {
            console.error('Failed to optimize a Visit image', error);
            setImageUploadFailed(true);
            toast.error(labels.imageUploadFailed);
            scheduleImageCleanup(pending);
          }
        }
      } finally {
        imageOptimizationCountRef.current -= 1;
        setIsImageOptimizing(imageOptimizationCountRef.current > 0);
        imageUploadItemsRef.current[group] = [];
        setUploadEpoch((previous) => ({
          ...previous,
          [group]: previous[group] + 1,
        }));
      }
    },
    [labels.imageUploadFailed, scheduleImageCleanup, toast, updateImages],
  );

  const handleImageItemsChange = useCallback(
    (group: VisitImageGroup, items: UploadItem[]) => {
      const previous = imageUploadItemsRef.current[group];
      imageUploadItemsRef.current[group] = items;
      setIsImageUploading(
        Object.values(imageUploadItemsRef.current).some((groupItems) =>
          groupItems.some(
            (item) =>
              item.status === 'pending' || item.status === 'uploading',
          ),
        ),
      );
      const nextIds = new Set(
        items
          .map((item) => item.uploaded?.id)
          .filter((id): id is string => Boolean(id)),
      );
      const previousIds = previous
        .map((item) => item.uploaded?.id)
        .filter((id): id is string => Boolean(id));
      for (const sourceFileId of previousIds.filter((id) => !nextIds.has(id))) {
        const image = imagesDraft[group].find(
          (item) => item.sourceFileId === sourceFileId,
        );
        if (image) {
          removeImage(group, image.imageId);
        }
      }
    },
    [imagesDraft, removeImage],
  );

  const addService = useCallback(() => {
    if (!isReady) {
      return null;
    }
    const id = crypto.randomUUID();
    updateAllCopies((copy) => ({
      ...copy,
      services: [
        ...copy.services,
        { id, name: '', day: '', time: '', place: '' },
      ],
    }));
    return id;
  }, [isReady, updateAllCopies]);

  const removeService = useCallback(
    (id: string) => {
      updateAllCopies((copy) => ({
        ...copy,
        services: copy.services.filter((service) => service.id !== id),
      }));
    },
    [updateAllCopies],
  );

  const updateService = useCallback(
    (id: string, field: 'name' | 'day' | 'time' | 'place', value: string) => {
      updateCopy((copy) => ({
        ...copy,
        services: copy.services.map((service) =>
          service.id === id ? { ...service, [field]: value } : service,
        ),
      }));
    },
    [updateCopy],
  );

  const updateTransit = useCallback(
    (
      group: 'primaryTransit' | 'secondaryTransit',
      id: string,
      field: keyof Omit<VisitTransitRoute, 'id'>,
      value: string,
    ) => {
      updateCopy((copy) => ({
        ...copy,
        [group]: copy[group].map((route) =>
          route.id === id ? { ...route, [field]: value } : route,
        ),
      }));
    },
    [updateCopy],
  );

  const addTransit = useCallback(
    (group: 'primaryTransit' | 'secondaryTransit') => {
      if (!isReady) {
        return null;
      }
      const id = crypto.randomUUID();
      updateAllCopies((copy) => ({
        ...copy,
        [group]: [
          ...copy[group],
          {
            id,
            type: '',
            line: '',
            station: '',
            walkingTime: '',
          },
        ],
      }));
      return id;
    },
    [isReady, updateAllCopies],
  );

  const removeTransit = useCallback(
    (group: 'primaryTransit' | 'secondaryTransit', id: string) => {
      updateAllCopies((copy) => ({
        ...copy,
        [group]: copy[group].filter((route) => route.id !== id),
      }));
    },
    [updateAllCopies],
  );

  const save = useCallback(async () => {
    if (
      !isReady ||
      isSaving ||
      isImageUploading ||
      isImageOptimizing ||
      isImageCleaning ||
      hasInvalidMapLink
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveEditablePageDocument('visit', {
        contentRevision: revision,
        content: draft,
        sharedMedia: imagesDraft,
      });
      applyDocument(saved);
      writePendingImages(
        readPendingImages().filter(
          (image) => !savedVisitImages(normalizeVisitSharedMedia(saved.sharedMedia)).has(image.sourceFileId),
        ),
      );
      toast.info(labels.saved);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        try {
          setConflict(await fetchEditablePageDocument('visit'));
        } catch (loadError) {
          console.error('Failed to load Visit page conflict version', loadError);
          toast.error(labels.saveFailed);
        }
      } else {
        console.error('Failed to save Visit page content', error);
        toast.error(labels.saveFailed);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    applyDocument,
    draft,
    hasInvalidMapLink,
    imagesDraft,
    isImageCleaning,
    isImageOptimizing,
    isImageUploading,
    isReady,
    isSaving,
    labels.saveFailed,
    labels.saved,
    revision,
    toast,
  ]);

  const reloadLatest = useCallback(() => {
    if (conflict) {
      applyDocument(conflict);
      setConflict(null);
    }
  }, [applyDocument, conflict]);

  const setLanguage = useCallback(
    (language: string) => {
      if (isWorldLanguageCode(language) && availableLanguages.includes(language)) {
        setEditLanguage(language);
      }
    },
    [availableLanguages],
  );

  return {
    labels,
    editLanguage,
    editLanguageOptions,
    setLanguage,
    current,
    imagesDraft,
    isReady,
    isSaving,
    isImageUploading,
    isImageOptimizing,
    isImageCleaning,
    imageUploadFailed,
    uploadEpoch,
    isDirty,
    hasInvalidMapLink,
    loadFailed,
    conflict,
    updateField,
    removeImage,
    reorderImages,
    handleImageUploaded,
    handleImageItemsChange,
    addService,
    removeService,
    updateService,
    addTransit,
    removeTransit,
    updateTransit,
    save,
    reloadLatest,
    dismissConflict: () => setConflict(null),
    reload: load,
  };
}
