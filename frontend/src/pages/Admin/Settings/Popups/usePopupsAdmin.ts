import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import type { UploadItem } from '../../../../shared/components/ui/Upload/useUpload';
import {
  createAdminPopup,
  deleteAdminPopup,
  fetchAdminPopups,
  reorderAdminPopups,
  updateAdminPopup,
  type Popup,
  type PopupCopy,
  type PopupType,
  type PopupUpsert,
} from '../../../../shared/api/popupsApi';
import {
  deleteMediaFile,
  deleteOptimizedImage,
  optimizeMediaImage,
  type MediaFileResponse,
} from '../../../../shared/api/mediaApi';
import { fetchSiteSettings } from '../../../../shared/api/cmsApi';
import { adminTranslations } from '../../translations';
import { DEFAULT_NOTICE_BACKGROUND } from '../../../../shared/popups/noticeBackground';
import {
  hasRichHtmlOverLimit,
  MAX_RICH_HTML_LENGTH,
  sanitizeRichHtml,
} from '../../../../shared/lib/richText';
import {
  isBlankPopupBody,
  migratePopupCopyBody,
} from '../../../../shared/popups/popupRichText';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export type PopupFormState = {
  name: string;
  type: PopupType;
  enabled: boolean;
  sortOrder: number;
  startsAt: string;
  endsAt: string;
  editLanguage: string;
  copies: Record<string, PopupCopy>;
  imageId: string | null;
  sourceFileId: string | null;
  thumbUrl: string | null;
  backgroundColor: string;
};

type MediaBaseline = {
  imageId: string | null;
  sourceFileId: string | null;
};

function emptyCopy(): PopupCopy {
  return { body: '' };
}

function normalizeCopy(copy: PopupCopy & { title?: string }): PopupCopy {
  return { body: migratePopupCopyBody(copy) };
}

function toDateInputValue(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInputValue(
  value: string,
  bound: 'start' | 'end',
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date =
    bound === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function formFromPopup(popup: Popup, languages: string[]): PopupFormState {
  const copies: Record<string, PopupCopy> = {};
  for (const code of languages) {
    copies[code] = popup.copies[code]
      ? normalizeCopy(popup.copies[code])
      : emptyCopy();
  }
  for (const [code, copy] of Object.entries(popup.copies)) {
    if (!copies[code]) {
      copies[code] = normalizeCopy(copy);
    }
  }
  return {
    name: popup.name ?? '',
    type: popup.type,
    enabled: popup.enabled,
    sortOrder: popup.sortOrder,
    startsAt: toDateInputValue(popup.startsAt),
    endsAt: toDateInputValue(popup.endsAt),
    editLanguage: languages[0] ?? 'en',
    copies,
    imageId: popup.imageId,
    sourceFileId: popup.sourceFileId,
    thumbUrl: popup.imageId
      ? `/api/v1/media/images/${popup.imageId}/thumb`
      : null,
    backgroundColor: popup.backgroundColor?.trim() || DEFAULT_NOTICE_BACKGROUND,
  };
}

function emptyForm(languages: string[]): PopupFormState {
  const copies: Record<string, PopupCopy> = {};
  for (const code of languages) {
    copies[code] = emptyCopy();
  }
  return {
    name: '',
    type: 'poster',
    enabled: true,
    sortOrder: 0,
    startsAt: '',
    endsAt: '',
    editLanguage: languages[0] ?? 'en',
    copies,
    imageId: null,
    sourceFileId: null,
    thumbUrl: null,
    backgroundColor: DEFAULT_NOTICE_BACKGROUND,
  };
}

function mediaFileStub(fileId: string): MediaFileResponse {
  return {
    id: fileId,
    url: `/api/v1/media/files/${fileId}`,
    originalName: 'image',
    contentType: 'image/jpeg',
    sizeBytes: 0,
  };
}

function formSnapshot(form: PopupFormState): string {
  return JSON.stringify({
    name: form.name.trim(),
    type: form.type,
    enabled: form.enabled,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    imageId: form.imageId,
    sourceFileId: form.sourceFileId,
    backgroundColor: form.type === 'notice' ? form.backgroundColor : null,
    copies: form.type === 'notice' ? form.copies : {},
  });
}

export function usePopupsAdmin() {
  const { role } = useAuth();
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const toast = useToast();
  const isSiteAdmin = role === 'site_admin';

  const [popups, setPopups] = useState<Popup[]>([]);
  const [siteLanguages, setSiteLanguages] = useState<string[]>(['en']);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PopupFormState>(() => emptyForm(['en']));
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploadDefaults, setUploadDefaults] = useState<MediaFileResponse[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const dragOrderBeforeRef = useRef<string[] | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const pointerOriginRef = useRef<{
    popupId: string;
    x: number;
    y: number;
    activated: boolean;
  } | null>(null);
  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  const baselineRef = useRef<MediaBaseline>({
    imageId: null,
    sourceFileId: null,
  });
  const formBaselineRef = useRef<string | null>(null);
  const sessionImageIdsRef = useRef(new Set<string>());
  const sessionFileIdsRef = useRef(new Set<string>());

  const resetSessionTracking = () => {
    sessionImageIdsRef.current = new Set();
    sessionFileIdsRef.current = new Set();
  };

  const discardSessionMedia = async () => {
    const imageIds = [...sessionImageIdsRef.current];
    const fileIds = [...sessionFileIdsRef.current];
    resetSessionTracking();
    await Promise.all([
      ...imageIds.map(async (imageId) => {
        try {
          await deleteOptimizedImage(imageId);
        } catch {
          // Best-effort cleanup of dialog-session orphans.
        }
      }),
      ...fileIds.map(async (fileId) => {
        try {
          await deleteMediaFile(fileId);
        } catch {
          // May already be deleted by Upload replace/remove.
        }
      }),
    ]);
  };

  /** Keep media bound to the saved form; delete other session uploads. */
  const releaseUnboundSessionMedia = async (keep: MediaBaseline) => {
    const imageIds = [...sessionImageIdsRef.current].filter(
      (imageId) => imageId !== keep.imageId,
    );
    const fileIds = [...sessionFileIdsRef.current].filter(
      (fileId) => fileId !== keep.sourceFileId,
    );
    resetSessionTracking();
    await Promise.all([
      ...imageIds.map(async (imageId) => {
        try {
          await deleteOptimizedImage(imageId);
        } catch {
          // Best-effort.
        }
      }),
      ...fileIds.map(async (fileId) => {
        try {
          await deleteMediaFile(fileId);
        } catch {
          // Best-effort.
        }
      }),
    ]);
  };

  const releaseReplacedSessionMedia = (
    imageId: string | null,
    fileId: string | null,
  ) => {
    if (imageId && sessionImageIdsRef.current.has(imageId)) {
      sessionImageIdsRef.current.delete(imageId);
      void deleteOptimizedImage(imageId).catch(() => {});
    }
    if (fileId && sessionFileIdsRef.current.has(fileId)) {
      sessionFileIdsRef.current.delete(fileId);
      void deleteMediaFile(fileId).catch(() => {});
    }
  };

  const toastRef = useRef(toast);
  toastRef.current = toast;
  const loadFailedLabelRef = useRef(labels.popupsLoadFailed);
  loadFailedLabelRef.current = labels.popupsLoadFailed;

  const load = useCallback(async () => {
    if (!isSiteAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        fetchAdminPopups(),
        fetchSiteSettings(),
      ]);
      setPopups(list);
      setSiteLanguages(
        settings.availableLanguages.length > 0
          ? settings.availableLanguages
          : ['en'],
      );
    } catch {
      toastRef.current.error(loadFailedLabelRef.current);
    } finally {
      setLoading(false);
    }
  }, [isSiteAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = () => {
    if (popups.length >= 4) {
      toast.warning(labels.popupsLimitReached);
      return;
    }
    resetSessionTracking();
    baselineRef.current = { imageId: null, sourceFileId: null };
    const nextForm = emptyForm(siteLanguages);
    formBaselineRef.current = null;
    setEditingId(null);
    setForm(nextForm);
    setFormError('');
    setUploadDefaults([]);
    setUploadKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const openEdit = (popup: Popup) => {
    resetSessionTracking();
    baselineRef.current = {
      imageId: popup.imageId,
      sourceFileId: popup.sourceFileId,
    };
    const nextForm = formFromPopup(popup, siteLanguages);
    formBaselineRef.current = formSnapshot(nextForm);
    setEditingId(popup.id);
    setForm(nextForm);
    setFormError('');
    setUploadDefaults(
      popup.sourceFileId ? [mediaFileStub(popup.sourceFileId)] : [],
    );
    setUploadKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const closeDialog = (options?: {
    discardSession?: boolean;
    keepMedia?: MediaBaseline;
  }) => {
    const discardSession = options?.discardSession !== false;
    // Block user cancel/discard while save or optimize is in flight; allow
    // successful-save cleanup (discardSession: false + keepMedia).
    if (discardSession && (isSaving || isOptimizing)) {
      return;
    }
    void (async () => {
      if (discardSession) {
        await discardSessionMedia();
      } else if (options?.keepMedia) {
        await releaseUnboundSessionMedia(options.keepMedia);
      } else {
        resetSessionTracking();
      }
      setIsDialogOpen(false);
      setEditingId(null);
      setFormError('');
      setUploadDefaults([]);
      formBaselineRef.current = null;
    })();
  };

  const updateForm = (patch: Partial<PopupFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateCopyBody = (value: string) => {
    setForm((prev) => ({
      ...prev,
      copies: {
        ...prev.copies,
        [prev.editLanguage]: {
          body: value,
        },
      },
    }));
  };

  const handleUploaded = async (files: MediaFileResponse[]) => {
    const file = files[0];
    if (!file) {
      return;
    }
    sessionFileIdsRef.current.add(file.id);
    setIsOptimizing(true);
    setFormError('');
    try {
      const optimized = await optimizeMediaImage(file.id, ['display', 'thumb']);
      sessionImageIdsRef.current.add(optimized.imageId);
      let replacedImageId: string | null = null;
      let replacedFileId: string | null = null;
      setForm((prev) => {
        replacedImageId = prev.imageId;
        replacedFileId = prev.sourceFileId;
        return {
          ...prev,
          imageId: optimized.imageId,
          sourceFileId: file.id,
          thumbUrl: optimized.thumbUrl,
        };
      });
      releaseReplacedSessionMedia(replacedImageId, replacedFileId);
    } catch {
      sessionFileIdsRef.current.delete(file.id);
      void deleteMediaFile(file.id).catch(() => {});
      setFormError(labels.popupsSaveFailed);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleUploadItemsChange = (items: UploadItem[]) => {
    const busy = items.some(
      (item) => item.status === 'pending' || item.status === 'uploading',
    );
    if (busy) {
      return;
    }
    const hasFile = items.some(
      (item) => Boolean(item.uploaded) || item.file.size > 0,
    );
    if (!hasFile) {
      let replacedImageId: string | null = null;
      let replacedFileId: string | null = null;
      setForm((prev) => {
        if (!prev.imageId && !prev.sourceFileId) {
          return prev;
        }
        replacedImageId = prev.imageId;
        replacedFileId = prev.sourceFileId;
        return {
          ...prev,
          imageId: null,
          sourceFileId: null,
          thumbUrl: null,
        };
      });
      releaseReplacedSessionMedia(replacedImageId, replacedFileId);
    }
  };

  const isDirty = useMemo(() => {
    if (!editingId || formBaselineRef.current == null) {
      return true;
    }
    return formSnapshot(form) !== formBaselineRef.current;
  }, [editingId, form]);

  const canSave = useMemo(() => {
    if (isSaving || isOptimizing) {
      return false;
    }
    if (editingId && !isDirty) {
      return false;
    }
    if (!form.name.trim()) {
      return false;
    }
    if (form.type === 'poster') {
      return Boolean(form.imageId);
    }
    return Object.values(form.copies).some(
      (copy) => !isBlankPopupBody(copy.body),
    );
  }, [editingId, form, isDirty, isOptimizing, isSaving]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError(labels.popupsNameRequired);
      return;
    }
    if (form.type === 'poster' && !form.imageId) {
      setFormError(labels.popupsImageRequired);
      return;
    }
    const sanitizedCopies: Record<string, PopupCopy> = {};
    for (const [code, copy] of Object.entries(form.copies)) {
      sanitizedCopies[code] = { body: sanitizeRichHtml(copy.body) };
    }
    if (hasRichHtmlOverLimit(sanitizedCopies, MAX_RICH_HTML_LENGTH)) {
      setFormError(labels.richTextTooLong);
      return;
    }
    if (
      form.type === 'notice' &&
      !Object.values(sanitizedCopies).some(
        (copy) => !isBlankPopupBody(copy.body),
      )
    ) {
      setFormError(labels.popupsNoticeRequired);
      return;
    }
    if (
      form.startsAt.trim() &&
      form.endsAt.trim() &&
      form.startsAt.trim() > form.endsAt.trim()
    ) {
      setFormError(labels.popupsScheduleInvalid);
      return;
    }

    const payload: PopupUpsert = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      sortOrder: form.sortOrder,
      startsAt: fromDateInputValue(form.startsAt, 'start'),
      endsAt: fromDateInputValue(form.endsAt, 'end'),
      imageId: form.imageId,
      sourceFileId: form.sourceFileId,
      backgroundColor: form.type === 'notice' ? form.backgroundColor : null,
      copies: form.type === 'notice' ? sanitizedCopies : {},
    };

    setIsSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await updateAdminPopup(editingId, payload);
      } else {
        await createAdminPopup(payload);
      }
      toast.info(labels.popupsSaveSuccess);
      closeDialog({
        discardSession: false,
        keepMedia: {
          imageId: form.imageId,
          sourceFileId: form.sourceFileId,
        },
      });
      await load();
    } catch {
      setFormError(labels.popupsSaveFailed);
      toast.error(labels.popupsSaveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }
    try {
      await deleteAdminPopup(pendingDeleteId);
      toast.info(labels.popupsDeleteSuccess);
      setPendingDeleteId(null);
      await load();
    } catch {
      toast.error(labels.popupsDeleteFailed);
    }
  };

  const DRAG_ACTIVATION_PX = 6;

  const clearPointerDrag = () => {
    pointerOriginRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
  };

  const handlePointerDragStart = (popupId: string, x: number, y: number) => {
    if (isReordering) {
      return;
    }
    pointerOriginRef.current = {
      popupId,
      x,
      y,
      activated: false,
    };
  };

  const handlePointerDragMove = (clientX: number, clientY: number) => {
    const origin = pointerOriginRef.current;
    if (!origin || isReordering) {
      return;
    }

    if (!origin.activated) {
      const dx = clientX - origin.x;
      const dy = clientY - origin.y;
      if (dx * dx + dy * dy < DRAG_ACTIVATION_PX * DRAG_ACTIVATION_PX) {
        return;
      }
      origin.activated = true;
      dragOrderBeforeRef.current = popupsRef.current.map((popup) => popup.id);
      draggingIdRef.current = origin.popupId;
      setDraggingId(origin.popupId);
    }

    const activeId = draggingIdRef.current;
    if (!activeId) {
      return;
    }
    const target = document.elementFromPoint(clientX, clientY);
    const row = target?.closest('[data-popup-id]');
    const targetId = row?.getAttribute('data-popup-id');
    if (!targetId || targetId === activeId) {
      return;
    }
    setPopups((prev) => {
      const fromIndex = prev.findIndex((popup) => popup.id === activeId);
      const toIndex = prev.findIndex((popup) => popup.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ordered = next.map((popup, index) => ({
        ...popup,
        sortOrder: index,
      }));
      // Eager sync so pointerup in the same tick does not read a stale order.
      popupsRef.current = ordered;
      return ordered;
    });
  };

  const handlePointerDragEnd = async () => {
    const origin = pointerOriginRef.current;
    const dragging = draggingIdRef.current;
    const activated = Boolean(origin?.activated && dragging);
    clearPointerDrag();

    if (!activated || isReordering) {
      dragOrderBeforeRef.current = null;
      return;
    }

    const orderedIds = popupsRef.current.map((popup) => popup.id);
    const before = dragOrderBeforeRef.current;
    dragOrderBeforeRef.current = null;
    if (before && before.join(',') === orderedIds.join(',')) {
      return;
    }

    setIsReordering(true);
    try {
      const reordered = await reorderAdminPopups(orderedIds);
      setPopups(reordered);
    } catch {
      toast.error(labels.popupsReorderFailed);
      await load();
    } finally {
      setIsReordering(false);
    }
  };

  return {
    labels,
    language,
    isSiteAdmin,
    loading,
    popups,
    siteLanguages,
    isDialogOpen,
    editingId,
    form,
    formError,
    isSaving,
    isOptimizing,
    canSave,
    pendingDeleteId,
    setPendingDeleteId,
    imageAccept: IMAGE_ACCEPT,
    imageMaxBytes: IMAGE_MAX_BYTES,
    uploadKey,
    uploadDefaults,
    draggingId,
    isReordering,
    openAdd,
    openEdit,
    closeDialog,
    updateForm,
    updateCopyBody,
    handleUploaded,
    handleUploadItemsChange,
    handleSave,
    handleConfirmDelete,
    handlePointerDragStart,
    handlePointerDragMove,
    handlePointerDragEnd,
  };
}
