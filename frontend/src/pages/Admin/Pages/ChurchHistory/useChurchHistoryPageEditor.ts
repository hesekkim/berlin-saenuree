import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  fetchEditablePageDocument,
  saveEditablePageDocument,
  type EditablePageDocument,
} from '../../../../shared/api/cmsApi';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  type MediaFileResponse,
} from '../../../../shared/api/mediaApi';
import type { UploadItem } from '../../../../shared/components/ui/Upload/useUpload';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import { useConfig } from '../../../../shared/context/ConfigContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { getLanguageLabel, resolveLanguage } from '../../../../shared/config/siteLanguages';
import { isWorldLanguageCode } from '../../../../shared/config/worldLanguages';
import {
  hasCompleteChurchHistoryContent,
  normalizeChurchHistoryContent,
  normalizeChurchHistoryCopy,
  serializeChurchHistoryContent,
  type ChurchHistoryContentByLanguage,
  type ChurchHistoryCopy,
  type ChurchHistoryEvent,
} from '../../../../shared/content/churchHistoryContent';
import { getChurchHistoryAdminLabels } from './churchHistoryAdminLabels';

const PENDING_MEDIA_KEY = 'cms.church-history.pending-media.v1';

function readPendingSources(): string[] {
  const saved = window.sessionStorage.getItem(PENDING_MEDIA_KEY);
  if (!saved) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
      return [...new Set(parsed)];
    }
    throw new Error('Invalid pending Church History media list');
  } catch (error) {
    console.error('Failed to read pending Church History media', error);
    window.sessionStorage.removeItem(PENDING_MEDIA_KEY);
    return [];
  }
}

function writePendingSources(sourceIds: string[]) {
  if (sourceIds.length === 0) {
    window.sessionStorage.removeItem(PENDING_MEDIA_KEY);
    return;
  }
  window.sessionStorage.setItem(
    PENDING_MEDIA_KEY,
    JSON.stringify([...new Set(sourceIds)]),
  );
}

function savedSourceIds(document: EditablePageDocument) {
  const normalized = normalizeChurchHistoryContent(
    document.content,
    [],
    document.sharedMedia,
  );
  const sourceIds = new Set(
    Object.values(normalized).flatMap((copy) =>
      copy.events.map((event) => event.sourceFileId).filter(Boolean),
    ),
  );
  return sourceIds;
}

async function recoverPendingMedia(document: EditablePageDocument) {
  const savedSources = savedSourceIds(document);
  const remaining: string[] = [];
  let failed = false;
  for (const sourceFileId of readPendingSources()) {
    if (savedSources.has(sourceFileId)) {
      continue;
    }
    try {
      await deleteMediaFile(sourceFileId);
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status !== 404 && status !== 409) {
        console.error('Failed to recover pending Church History media', error);
        remaining.push(sourceFileId);
        failed = true;
      }
    }
  }
  writePendingSources(remaining);
  return failed;
}

function clearSavedPendingMedia(
  document: EditablePageDocument,
) {
  const savedSources = savedSourceIds(document);
  writePendingSources(
    readPendingSources().filter((sourceFileId) => !savedSources.has(sourceFileId)),
  );
}

function collectImageRefs(content: ChurchHistoryContentByLanguage) {
  const refs = new Set<string>();
  for (const copy of Object.values(content)) {
    for (const event of copy.events) {
      if (event.imageId || event.sourceFileId) {
        refs.add(`${event.imageId}:${event.sourceFileId}`);
      }
    }
  }
  return refs;
}

export function useChurchHistoryPageEditor() {
  const { availableLanguages } = useConfig();
  const { language: adminLanguage } = useCmsConfig();
  const labels = getChurchHistoryAdminLabels(adminLanguage);
  const toast = useToast();
  const [editLanguage, setEditLanguage] = useState(() =>
    resolveLanguage('en', availableLanguages),
  );
  const [draft, setDraft] = useState<ChurchHistoryContentByLanguage>({});
  const [savedDraft, setSavedDraft] = useState<ChurchHistoryContentByLanguage>({});
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<EditablePageDocument | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isImageOptimizing, setIsImageOptimizing] = useState(false);
  const [isImageCleaning, setIsImageCleaning] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const imageUploadingRef = useRef<Record<string, boolean>>({});
  const imageCleanupCountRef = useRef(0);

  const applyDocument = useCallback(
    (document: EditablePageDocument) => {
      const content = normalizeChurchHistoryContent(
        document.content,
        availableLanguages,
        document.sharedMedia,
      );
      setDraft(content);
      setSavedDraft(content);
      setRevision(document.contentRevision);
      setIsReady(true);
      setLoadFailed(false);
    },
    [availableLanguages],
  );

  const load = useCallback(async () => {
    setIsReady(false);
    setLoadFailed(false);
    try {
      const document = await fetchEditablePageDocument('church-history');
      applyDocument(document);
      if (await recoverPendingMedia(document)) {
        toast.error(labels.imageCleanupFailed);
      }
    } catch (error) {
      console.error('Failed to load Church History page content for editing', error);
      setLoadFailed(true);
      setIsReady(true);
    }
  }, [applyDocument, labels.imageCleanupFailed, toast]);

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

  const current = normalizeChurchHistoryCopy(draft[editLanguage]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const isContentComplete = hasCompleteChurchHistoryContent(
    draft,
    availableLanguages,
  );

  const updateCopy = useCallback(
    (update: (copy: ChurchHistoryCopy) => ChurchHistoryCopy) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) => ({
        ...previous,
        [editLanguage]: update(normalizeChurchHistoryCopy(previous[editLanguage])),
      }));
    },
    [editLanguage, isReady],
  );

  const updateAllCopies = useCallback(
    (update: (copy: ChurchHistoryCopy) => ChurchHistoryCopy) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) =>
        Object.fromEntries(
          Object.entries(
            normalizeChurchHistoryContent(
              previous as Record<string, Record<string, unknown>>,
              availableLanguages,
            ),
          ).map(([language, copy]) => [language, update(copy)]),
        ),
      );
    },
    [availableLanguages, isReady],
  );

  const addEvent = useCallback(() => {
    if (!isReady) {
      return null;
    }
    const id = crypto.randomUUID();
    const event: ChurchHistoryEvent = {
      id,
      date: '',
      description: '',
      imageUrl: '',
      imageId: '',
      sourceFileId: '',
    };
    updateAllCopies((copy) => ({ ...copy, events: [...copy.events, event] }));
    return id;
  }, [isReady, updateAllCopies]);

  const updateEvent = useCallback(
    (id: string, field: 'date' | 'description', value: string) => {
      updateCopy((copy) => ({
        ...copy,
        events: copy.events.map((event) =>
          event.id === id ? { ...event, [field]: value } : event,
        ),
      }));
    },
    [updateCopy],
  );

  const updateSharedEventImage = useCallback(
    (id: string, update: (event: ChurchHistoryEvent) => ChurchHistoryEvent) => {
      updateAllCopies((copy) => ({
        ...copy,
        events: copy.events.map((event) =>
          event.id === id ? update(event) : event,
        ),
      }));
    },
    [updateAllCopies],
  );

  const cleanupImage = useCallback(
    async (image: Pick<ChurchHistoryEvent, 'imageId' | 'sourceFileId'>) => {
      if (!image.imageId && !image.sourceFileId) {
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
                writePendingSources(
                  readPendingSources().filter((id) => id !== image.sourceFileId),
                );
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
          writePendingSources(
            readPendingSources().filter((id) => id !== image.sourceFileId),
          );
        }
      } catch (error) {
        console.error(
          'Failed to clean up an unsaved Church History image',
          error,
        );
        toast.error(labels.imageCleanupFailed);
      }
    },
    [labels.imageCleanupFailed, toast],
  );

  const scheduleImageCleanup = useCallback(
    (image: Pick<ChurchHistoryEvent, 'imageId' | 'sourceFileId'>) => {
      imageCleanupCountRef.current += 1;
      setIsImageCleaning(true);
      void cleanupImage(image).finally(() => {
        imageCleanupCountRef.current -= 1;
        setIsImageCleaning(imageCleanupCountRef.current > 0);
      });
    },
    [cleanupImage],
  );

  const removeEvent = useCallback(
    (id: string) => {
      const event = current.events.find((item) => item.id === id);
      updateAllCopies((copy) => ({
        ...copy,
        events: copy.events.filter((item) => item.id !== id),
      }));
      if (
        event &&
        !collectImageRefs(savedDraft).has(
          `${event.imageId}:${event.sourceFileId}`,
        )
      ) {
        scheduleImageCleanup(event);
      }
    },
    [current.events, savedDraft, scheduleImageCleanup, updateAllCopies],
  );

  const removeEventImage = useCallback(
    (id: string) => {
      const event = current.events.find((item) => item.id === id);
      updateSharedEventImage(id, (previous) => ({
        ...previous,
        imageUrl: '',
        imageId: '',
        sourceFileId: '',
      }));
      if (
        event &&
        !collectImageRefs(savedDraft).has(
          `${event.imageId}:${event.sourceFileId}`,
        )
      ) {
        scheduleImageCleanup(event);
      }
    },
    [current.events, savedDraft, scheduleImageCleanup, updateSharedEventImage],
  );

  const handleImageUploaded = useCallback(
    async (eventId: string, files: MediaFileResponse[]) => {
      setIsImageOptimizing(true);
      try {
        for (const file of files) {
          writePendingSources([...readPendingSources(), file.id]);
          const currentEvent = current.events.find((event) => event.id === eventId);
          try {
            const optimized = await optimizeMediaImage(file.id, [
              'display',
              'thumb',
            ]);
            if (optimized.sourceFileId !== file.id) {
              writePendingSources([
                ...readPendingSources(),
                optimized.sourceFileId,
              ]);
            }
            if (
              currentEvent &&
              !collectImageRefs(savedDraft).has(
                `${currentEvent.imageId}:${currentEvent.sourceFileId}`,
              )
            ) {
              scheduleImageCleanup(currentEvent);
            }
            updateSharedEventImage(eventId, (event) => ({
              ...event,
              imageUrl: '',
              imageId: optimized.imageId,
              sourceFileId: optimized.sourceFileId,
            }));
          } catch (error) {
            console.error('Failed to optimize a Church History image', error);
            toast.error(labels.imageUploadFailed);
            scheduleImageCleanup({
              imageId: '',
              sourceFileId: file.id,
            });
          }
        }
      } finally {
        setIsImageOptimizing(false);
      }
    },
    [
      current.events,
      labels.imageUploadFailed,
      savedDraft,
      scheduleImageCleanup,
      toast,
      updateSharedEventImage,
    ],
  );

  const handleImageItemsChange = useCallback(
    (eventId: string, items: UploadItem[]) => {
      imageUploadingRef.current[eventId] = items.some(
        (item) => item.status === 'pending' || item.status === 'uploading',
      );
      setIsImageUploading(Object.values(imageUploadingRef.current).some(Boolean));
      const event = current.events.find((item) => item.id === eventId);
      if (
        items.length === 0 &&
        event?.sourceFileId &&
        event.imageId
      ) {
        updateSharedEventImage(eventId, (previous) => ({
          ...previous,
          imageUrl: '',
          imageId: '',
          sourceFileId: '',
        }));
        if (
          !collectImageRefs(savedDraft).has(
            `${event.imageId}:${event.sourceFileId}`,
          )
        ) {
          scheduleImageCleanup(event);
        }
      }
    },
    [current.events, savedDraft, scheduleImageCleanup, updateSharedEventImage],
  );

  const save = useCallback(async () => {
    if (
      !isReady ||
      isSaving ||
      !isContentComplete ||
      isImageUploading ||
      isImageOptimizing ||
      isImageCleaning
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveEditablePageDocument('church-history', {
        contentRevision: revision,
        ...serializeChurchHistoryContent(draft),
      });
      applyDocument(saved);
      clearSavedPendingMedia(saved);
      toast.info(labels.saved);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        try {
          setConflict(await fetchEditablePageDocument('church-history'));
        } catch (loadError) {
          console.error('Failed to load Church History conflict version', loadError);
          toast.error(labels.saveFailed);
        }
      } else {
        console.error('Failed to save Church History page content', error);
        toast.error(labels.saveFailed);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    applyDocument,
    draft,
    isImageCleaning,
    isImageOptimizing,
    isImageUploading,
    isContentComplete,
    isReady,
    isSaving,
    labels.saveFailed,
    labels.saved,
    revision,
    toast,
  ]);

  const setLanguage = useCallback(
    (language: string) => {
      if (isWorldLanguageCode(language) && availableLanguages.includes(language)) {
        setEditLanguage(language);
      }
    },
    [availableLanguages],
  );

  const reloadLatest = useCallback(() => {
    if (conflict) {
      applyDocument(conflict);
      setConflict(null);
    }
  }, [applyDocument, conflict]);

  return {
    labels,
    editLanguage,
    editLanguageOptions,
    setLanguage,
    current,
    isReady,
    isSaving,
    isDirty,
    isContentComplete,
    isImageUploading,
    isImageOptimizing,
    isImageCleaning,
    loadFailed,
    conflict,
    addEvent,
    removeEvent,
    removeEventImage,
    updateEvent,
    handleImageUploaded,
    handleImageItemsChange,
    save,
    reloadLatest,
    dismissConflict: () => setConflict(null),
    reload: load,
  };
}
