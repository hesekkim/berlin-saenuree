import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  fetchPageDocument,
  pageDocumentFromResponse,
  savePageDocument,
  type PageContentResponse,
  type PageDocument,
} from '../../../../shared/api/cmsApi';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import type { UploadItem } from '../../../../shared/components/ui/Upload/useUpload';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  type MediaFileResponse,
} from '../../../../shared/api/mediaApi';
import { useConfig } from '../../../../shared/context/ConfigContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import {
  getLanguageLabel,
  resolveLanguage,
} from '../../../../shared/config/siteLanguages';
import { Language } from '../../../../shared/types/Language';
import { isWorldLanguageCode } from '../../../../shared/config/worldLanguages';
import {
  HOME_PAGE_SLUG,
  createEmptyHomeCopy,
  ensureHomeContentLanguage,
  normalizeHomeCopy,
  normalizeSharedHomeMedia,
  type HomeContentByLanguage,
  type HomeImage,
  type HomeCopy,
} from '../../../../shared/content/homeContent';
import { getYouTubeVideoId } from '../../../Home/youtubeVideo';
import { adminTranslations } from '../../translations';

type HomeImageSlot = 'hero' | 'panorama';
type HomeTextField = Exclude<keyof HomeCopy, 'youtubeVideoUrls' | 'heroImages'>;
const PENDING_HOME_SOURCES_KEY = 'cms.home.pending-media.v1';

function readPendingHomeSources(): string[] {
  const saved = window.sessionStorage.getItem(PENDING_HOME_SOURCES_KEY);
  if (!saved) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
      return [...new Set(parsed)];
    }
    throw new Error('Invalid pending Home media list');
  } catch (error) {
    console.error('Failed to read pending Home media', error);
    window.sessionStorage.removeItem(PENDING_HOME_SOURCES_KEY);
    return [];
  }
}

function writePendingHomeSources(sourceIds: string[]) {
  if (sourceIds.length === 0) {
    window.sessionStorage.removeItem(PENDING_HOME_SOURCES_KEY);
    return;
  }
  window.sessionStorage.setItem(
    PENDING_HOME_SOURCES_KEY,
    JSON.stringify([...new Set(sourceIds)])
  );
}

function trackPendingHomeSource(sourceFileId: string) {
  writePendingHomeSources([
    ...readPendingHomeSources(),
    sourceFileId,
  ]);
}

function untrackPendingHomeSource(sourceFileId: string) {
  writePendingHomeSources(
    readPendingHomeSources().filter((id) => id !== sourceFileId)
  );
}

function savedHomeSourceIds(content: HomeContentByLanguage) {
  return new Set(
    Object.values(content).flatMap((copy) => [
      ...copy.heroImages.map((image) => image.sourceFileId),
      copy.heroSourceFileId ?? '',
      copy.panoramaSourceFileId,
    ])
  );
}

function homeImagesForSlot(copy: HomeCopy, slot: HomeImageSlot): HomeImage[] {
  if (slot === 'hero') {
    return copy.heroImages;
  }
  return copy.panoramaImageId || copy.panoramaSourceFileId
    ? [
        {
          imageId: copy.panoramaImageId,
          sourceFileId: copy.panoramaSourceFileId,
        },
      ]
    : [];
}

async function recoverPendingHomeMedia(content: HomeContentByLanguage) {
  const savedSources = savedHomeSourceIds(content);
  const pending = readPendingHomeSources();
  const remaining: string[] = [];
  let failed = false;

  for (const sourceFileId of pending) {
    if (savedSources.has(sourceFileId)) {
      continue;
    }
    try {
      await deleteMediaFile(sourceFileId);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 404 && status !== 409) {
        console.error('Failed to recover pending Home media', error);
        remaining.push(sourceFileId);
        failed = true;
      }
    }
  }

  writePendingHomeSources(remaining);
  return failed;
}

function clearSavedPendingHomeMedia(content: HomeContentByLanguage) {
  const savedSources = savedHomeSourceIds(content);
  writePendingHomeSources(
    readPendingHomeSources().filter((sourceFileId) => !savedSources.has(sourceFileId))
  );
}

function normalizeHomeDraft(content: HomeContentByLanguage) {
  return Object.fromEntries(
    Object.entries(content).map(([language, copy]) => [
      language,
      {
        ...normalizeHomeCopy(copy),
        youtubeVideoUrls: copy.youtubeVideoUrls
          .map((url) => url.trim())
          .filter(Boolean),
      },
    ])
  ) as HomeContentByLanguage;
}

export function useHomePageEditor() {
  const { availableLanguages } = useConfig();
  const { language: cmsLanguage } = useCmsConfig();
  const toast = useToast();
  const labels = adminTranslations[cmsLanguage];
  const reportImageCleanupFailure = useCallback(
    () => toast.error(labels.homeImageCleanupFailed),
    [labels.homeImageCleanupFailed, toast]
  );
  const reportImageCleanupFailureRef = useRef(reportImageCleanupFailure);
  reportImageCleanupFailureRef.current = reportImageCleanupFailure;
  const [editLanguage, setEditLanguageState] = useState<string>(() =>
    resolveLanguage(Language.EN, availableLanguages)
  );
  const [draft, setDraft] = useState<HomeContentByLanguage>({});
  const [savedDraft, setSavedDraft] = useState<HomeContentByLanguage>({});
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<PageDocument | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageOptimizing, setIsImageOptimizing] = useState(false);
  const [isImageCleaning, setIsImageCleaning] = useState(false);
  const imageCleanupCountRef = useRef(0);
  const imageUploadingRef = useRef<Record<HomeImageSlot, boolean>>({
    hero: false,
    panorama: false,
  });

  const applyDocument = useCallback((document: PageDocument) => {
    const content = normalizeSharedHomeMedia(Object.fromEntries(
      Object.entries(document.content).map(([language, copy]) => [
        language,
        normalizeHomeCopy(copy),
      ])
    ) as HomeContentByLanguage);
    setDraft(content);
    setSavedDraft(content);
    setRevision(document.contentRevision);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const document = await fetchPageDocument(HOME_PAGE_SLUG);
        if (cancelled) {
          return;
        }
        applyDocument(document);
        setIsImageCleaning(true);
        try {
          if (await recoverPendingHomeMedia(document.content)) {
            reportImageCleanupFailureRef.current();
          }
        } catch (error) {
          console.error('Failed to recover pending Home media', error);
          reportImageCleanupFailureRef.current();
        } finally {
          setIsImageCleaning(false);
        }
        setIsReady(true);
      } catch {
        if (cancelled) {
          return;
        }
        // Allow editing empty draft when the API is unavailable.
        setIsReady(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [applyDocument]);

  useEffect(() => {
    setEditLanguageState((prev) => resolveLanguage(prev, availableLanguages));
  }, [availableLanguages]);

  const current =
    ensureHomeContentLanguage(draft, editLanguage)[editLanguage] ??
    createEmptyHomeCopy();
  const isDirty =
    JSON.stringify(normalizeHomeDraft(draft)) !==
    JSON.stringify(normalizeHomeDraft(savedDraft));

  const editLanguageOptions = availableLanguages.map((value) => ({
    value,
    label: getLanguageLabel(value),
  }));

  const setEditLanguage = useCallback(
    (value: string) => {
      if (isWorldLanguageCode(value) && availableLanguages.includes(value)) {
        setEditLanguageState(value);
      }
    },
    [availableLanguages]
  );

  const cleanupUnsavedImage = useCallback(
    async (slot: HomeImageSlot, image: HomeImage) => {
      const saved = savedDraft[editLanguage] ?? createEmptyHomeCopy();
      if (
        homeImagesForSlot(saved, slot).some(
          (savedImage) =>
            (image.imageId && savedImage.imageId === image.imageId) ||
            (image.sourceFileId &&
              savedImage.sourceFileId === image.sourceFileId)
        )
      ) {
        return;
      }

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
              if (image.sourceFileId) {
                untrackPendingHomeSource(image.sourceFileId);
              }
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
          untrackPendingHomeSource(image.sourceFileId);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          return;
        }
        console.error('Failed to clean up an unsaved Home image', error);
        toast.error(labels.homeImageCleanupFailed);
      }
    },
    [editLanguage, labels.homeImageCleanupFailed, savedDraft, toast]
  );

  const scheduleUnsavedImageCleanup = useCallback(
    (slot: HomeImageSlot, image: HomeImage) => {
      imageCleanupCountRef.current += 1;
      setIsImageCleaning(true);
      void cleanupUnsavedImage(slot, image).finally(() => {
        imageCleanupCountRef.current -= 1;
        setIsImageCleaning(imageCleanupCountRef.current > 0);
      });
    },
    [cleanupUnsavedImage]
  );

  const updateField = useCallback(
    (field: HomeTextField, value: string) => {
      if (!isReady) {
        return;
      }
      setDraft((prev) => {
        const withLanguage = ensureHomeContentLanguage(prev, editLanguage);
        if (
          field === 'panoramaImageId' ||
          field === 'panoramaSourceFileId'
        ) {
          return Object.fromEntries(
            Object.entries(withLanguage).map(([language, copy]) => [
              language,
              { ...copy, [field]: value },
            ])
          ) as HomeContentByLanguage;
        }
        return {
          ...withLanguage,
          [editLanguage]: {
            ...withLanguage[editLanguage],
            [field]: value,
          },
        };
      });
    },
    [editLanguage, isReady]
  );

  const updateHeroImages = useCallback(
    (update: (images: HomeImage[]) => HomeImage[]) => {
      if (!isReady) {
        return;
      }
      setDraft((prev) => {
        const withLanguage = ensureHomeContentLanguage(prev, editLanguage);
        const currentCopy = withLanguage[editLanguage];
        const heroImages = update(currentCopy.heroImages);
        return Object.fromEntries(
          Object.entries(withLanguage).map(([language, copy]) => [
            language,
            { ...copy, heroImages },
          ])
        ) as HomeContentByLanguage;
      });
    },
    [editLanguage, isReady]
  );

  const updateVideoUrls = useCallback(
    (value: string[]) => {
      if (!isReady) {
        return;
      }
      setDraft((prev) => {
        const withLanguage = ensureHomeContentLanguage(prev, editLanguage);
        return Object.fromEntries(
          Object.entries(withLanguage).map(([language, copy]) => [
            language,
            { ...copy, youtubeVideoUrls: value },
          ])
        ) as HomeContentByLanguage;
      });
    },
    [editLanguage, isReady]
  );

  const handleImageUploaded = useCallback(
    async (slot: HomeImageSlot, files: MediaFileResponse[]) => {
      setIsImageOptimizing(true);
      try {
        for (const file of files) {
          try {
            trackPendingHomeSource(file.id);
            const optimized = await optimizeMediaImage(file.id, [
              'display',
              'thumb',
            ]);
            if (optimized.sourceFileId !== file.id) {
              trackPendingHomeSource(optimized.sourceFileId);
            }
            if (slot === 'hero') {
              updateHeroImages((images) => [
                ...images,
                {
                  imageId: optimized.imageId,
                  sourceFileId: optimized.sourceFileId,
                },
              ]);
              continue;
            }

            const previousCopy = draft[editLanguage] ?? createEmptyHomeCopy();
            await cleanupUnsavedImage('panorama', {
              imageId: previousCopy.panoramaImageId,
              sourceFileId: previousCopy.panoramaSourceFileId,
            });
            updateField('panoramaImageId', optimized.imageId);
            updateField('panoramaSourceFileId', optimized.sourceFileId);
          } catch (error) {
            toast.error(labels.homeImageUploadFailed);
            try {
              await deleteMediaFile(file.id);
              untrackPendingHomeSource(file.id);
            } catch (cleanupError) {
              console.error('Failed to clean up the Home image upload', cleanupError);
            }
            console.error('Failed to optimize the Home image', error);
          }
        }
      } finally {
        setIsImageOptimizing(false);
      }
    },
    [
      cleanupUnsavedImage,
      draft,
      editLanguage,
      labels.homeImageUploadFailed,
      toast,
      updateHeroImages,
      updateField,
    ]
  );

  const handleImageItemsChange = useCallback(
    (slot: HomeImageSlot, items: UploadItem[]) => {
      imageUploadingRef.current[slot] = items.some(
        (item) => item.status === 'pending' || item.status === 'uploading'
      );
      setIsImageUploading(Object.values(imageUploadingRef.current).some(Boolean));
      const current = draft[editLanguage] ?? createEmptyHomeCopy();
      if (slot === 'hero') {
        const presentSourceIds = new Set(
          items.flatMap((item) => (item.uploaded ? [item.uploaded.id] : []))
        );
        const removedImages = current.heroImages.filter(
          (image) => !presentSourceIds.has(image.sourceFileId)
        );
        if (removedImages.length > 0) {
          const removedImageIds = new Set(
            removedImages.map((image) => image.imageId)
          );
          updateHeroImages((images) =>
            images.filter((image) => !removedImageIds.has(image.imageId))
          );
          removedImages.forEach((image) =>
            scheduleUnsavedImageCleanup('hero', image)
          );
        }
      } else if (items.length === 0 && current.panoramaSourceFileId) {
        scheduleUnsavedImageCleanup('panorama', {
          imageId: current.panoramaImageId,
          sourceFileId: current.panoramaSourceFileId,
        });
        updateField('panoramaImageId', '');
        updateField('panoramaSourceFileId', '');
      }
    },
    [
      draft,
      editLanguage,
      scheduleUnsavedImageCleanup,
      updateField,
      updateHeroImages,
    ]
  );

  const videoUrls = current.youtubeVideoUrls;
  const isVideoSelectionValid =
    videoUrls.length <= 3 &&
    videoUrls.every(
      (url) => !url.trim() || getYouTubeVideoId(url) !== null
    );

  const save = useCallback(async () => {
    if (
      !isReady ||
      !isDirty ||
      isSaving ||
      isImageUploading ||
      isImageOptimizing ||
      isImageCleaning ||
      !isVideoSelectionValid ||
      conflict
    ) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await savePageDocument(HOME_PAGE_SLUG, {
        contentRevision: revision,
        content: normalizeHomeDraft(draft),
      });
      applyDocument(saved);
      try {
        clearSavedPendingHomeMedia(saved.content);
      } catch (error) {
        console.error('Failed to update pending Home media tracking', error);
        toast.error(labels.homeImageCleanupFailed);
      }
      toast.info(labels.homeSaved);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const latest = error.response.data as PageContentResponse;
        setConflict(pageDocumentFromResponse(latest));
        return;
      }
      toast.error(labels.homeSaveFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    applyDocument,
    conflict,
    draft,
    isReady,
    isDirty,
    isImageOptimizing,
    isImageUploading,
    isImageCleaning,
    isSaving,
    labels.homeSaveFailed,
    labels.homeImageCleanupFailed,
    labels.homeSaved,
    revision,
    toast,
    isVideoSelectionValid,
  ]);

  const reloadLatest = useCallback(() => {
    if (!conflict) {
      return;
    }
    applyDocument(conflict);
    setConflict(null);
  }, [applyDocument, conflict]);

  const dismissConflict = useCallback(() => {
    setConflict(null);
  }, []);

  return {
    editLanguage,
    editLanguageOptions,
    setEditLanguage,
    current,
    isReady,
    isDirty,
    isSaving,
    isImageUploading,
    isImageOptimizing,
    isImageCleaning,
    conflict,
    updateField,
    updateVideoUrls,
    handleImageUploaded,
    handleImageItemsChange,
    isVideoSelectionValid,
    save,
    reloadLatest,
    dismissConflict,
  };
}
