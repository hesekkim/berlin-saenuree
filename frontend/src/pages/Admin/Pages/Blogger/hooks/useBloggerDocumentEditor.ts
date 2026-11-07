import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import type { RichTextEditorEXHandle } from '../../../../../shared/components/ui/RichTextEditorEX';
import { useAuth } from '../../../../../shared/context/AuthContext';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import {
  createAdminBlogger,
  deleteAdminBlogger,
  deleteMyBloggerEditDraft,
  deleteMyBloggerDraft,
  fetchAdminBloggerItem,
  fetchMyBloggerEditDraft,
  fetchMyBloggerDraft,
  updateAdminBlogger,
  upsertMyBloggerEditDraft,
  upsertMyBloggerDraft,
  type BloggerCopy,
  type BloggerDraftResponse,
  type BloggerResponse,
} from '../../../../../shared/api/bloggerApi';
import type { AdminTranslations } from '../../../translations';
import {
  EMPTY_BODY_HTML,
  cloneCopies,
  copiesEqual,
  hasPublishableDefaultCopy,
  sanitizeCopiesForSave,
  upsertCopyField,
} from '../utils/bloggerCopies';
import {
  hasRichHtmlOverLimit,
  MAX_BLOGGER_RICH_HTML_LENGTH,
} from '../../../../../shared/lib/richText';

const DRAFT_AUTOSAVE_MS = 1000;
const LIST_PATH = '/admin/pages/blogger';

function isBloggerCopiesTooLong(copies: Record<string, BloggerCopy>): boolean {
  return hasRichHtmlOverLimit(
    sanitizeCopiesForSave(copies),
    MAX_BLOGGER_RICH_HTML_LENGTH,
  );
}

export type BloggerDocumentMode = 'create' | 'edit';

type UseBloggerDocumentEditorArgs = {
  mode: BloggerDocumentMode;
  bloggerId?: string;
  labels: AdminTranslations;
};

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function useBloggerDocumentEditor({
  mode,
  bloggerId,
  labels,
}: UseBloggerDocumentEditorArgs) {
  const navigate = useNavigate();
  const toast = useToast();
  const { email, role } = useAuth();
  const { availableLanguages, defaultLanguage } = useConfig();
  const editorRef = useRef<RichTextEditorEXHandle>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const availableLanguagesKey = availableLanguages.join(',');
  const languageOptions = useMemo(() => {
    const languages = availableLanguagesKey
      ? availableLanguagesKey.split(',')
      : ['en'];
    return languages.map((code) => ({ value: code, label: code }));
  }, [availableLanguagesKey]);

  const defaultEditLanguage = useMemo(() => {
    if (languageOptions.some((option) => option.value === defaultLanguage)) {
      return defaultLanguage;
    }
    return languageOptions[0]?.value ?? defaultLanguage;
  }, [defaultLanguage, languageOptions]);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [autosaveTrigger, setAutosaveTrigger] = useState(0);
  const [hasPublished, setHasPublished] = useState(false);
  const [isEditing, setIsEditing] = useState(mode === 'create');
  const [formError, setFormError] = useState('');
  const [conflictItem, setConflictItem] = useState<BloggerResponse | null>(
    null,
  );
  const [editLanguage, setEditLanguageState] = useState(defaultEditLanguage);
  const [copies, setCopies] = useState<Record<string, BloggerCopy>>({});
  const [published, setPublished] = useState(true);
  const [contentRevision, setContentRevision] = useState(0);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [hasServerDraft, setHasServerDraft] = useState(false);
  const [initialCopies, setInitialCopies] = useState<
    Record<string, BloggerCopy>
  >({});
  const [initialPublished, setInitialPublished] = useState(true);
  const [itemMeta, setItemMeta] = useState<{
    id: string;
    createdBy: string;
  } | null>(null);
  const [sourceItem, setSourceItem] = useState<BloggerResponse | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [discardDraftConfirmOpen, setDiscardDraftConfirmOpen] = useState(false);
  const skipAutosaveRef = useRef(true);
  const autosavePauseRef = useRef(0);
  const draftSavePromiseRef = useRef<Promise<void> | null>(null);
  const publishCompletedRef = useRef(false);
  const draftRevisionRef = useRef<number | null>(null);
  const copiesRef = useRef(copies);
  const publishedRef = useRef(published);

  copiesRef.current = copies;
  publishedRef.current = published;
  draftRevisionRef.current = draftRevision;

  const currentCopy = copies[editLanguage] ?? {
    title: '',
    body: EMPTY_BODY_HTML,
  };

  const canMutate = useMemo(() => {
    if (mode === 'create') {
      return true;
    }
    if (!itemMeta) {
      return false;
    }
    if (role === 'site_admin' || role === 'page_admin') {
      return true;
    }
    if (role !== 'page_manager') {
      return false;
    }
    return normalizeEmail(itemMeta.createdBy) === normalizeEmail(email);
  }, [email, itemMeta, mode, role]);

  const canPublishOrSave = useMemo(
    () => hasPublishableDefaultCopy(copies, defaultLanguage),
    [copies, defaultLanguage],
  );

  const isDirty = useMemo(() => {
    if (!isReady) {
      return false;
    }
    if (mode === 'create') {
      return (
        hasServerDraft ||
        published !== true ||
        Object.keys(copies).some((language) => {
          const copy = copies[language];
          return (
            (copy?.title ?? '').trim().length > 0 ||
            (copy?.body && copy.body !== EMPTY_BODY_HTML)
          );
        })
      );
    }
    return (
      published !== initialPublished || !copiesEqual(copies, initialCopies)
    );
  }, [
    copies,
    published,
    hasServerDraft,
    initialCopies,
    initialPublished,
    isReady,
    mode,
  ]);

  const canSave = useMemo(
    () => mode === 'edit' && (hasServerDraft || isDirty),
    [hasServerDraft, isDirty, mode],
  );

  const applyDraft = useCallback((draft: BloggerDraftResponse) => {
    const nextCopies = cloneCopies(draft.copies);
    setCopies(nextCopies);
    setPublished(draft.published);
    setDraftRevision(draft.contentRevision);
    setHasServerDraft(true);
    setInitialCopies(cloneCopies(draft.copies));
    setInitialPublished(draft.published);
  }, []);

  const applyItem = useCallback((item: BloggerResponse) => {
    const nextCopies = cloneCopies(item.copies);
    setCopies(nextCopies);
    setPublished(item.published);
    setContentRevision(item.contentRevision);
    setInitialCopies(cloneCopies(item.copies));
    setInitialPublished(item.published);
    setItemMeta({ id: item.id, createdBy: item.createdBy });
    setSourceItem(item);
    setConflictItem(null);
  }, []);

  const applyEditDraft = useCallback(
    (draft: BloggerDraftResponse, sourceItem: BloggerResponse) => {
      setCopies(cloneCopies(draft.copies));
      setPublished(draft.published);
      setContentRevision(
        draft.sourceContentRevision ?? sourceItem.contentRevision,
      );
      setDraftRevision(draft.contentRevision);
      setHasServerDraft(true);
      setInitialCopies(cloneCopies(draft.copies));
      setInitialPublished(draft.published);
      setConflictItem(null);
    },
    [],
  );

  useEffect(() => {
    setEditLanguageState((current) =>
      languageOptions.some((option) => option.value === current)
        ? current
        : defaultEditLanguage,
    );
  }, [defaultEditLanguage, languageOptions]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setFormError('');
      setConflictItem(null);
      const autosavePause = ++autosavePauseRef.current;
      skipAutosaveRef.current = true;

      try {
        if (mode === 'create') {
          const draft = await fetchMyBloggerDraft();
          if (cancelled) {
            return;
          }
          if (draft) {
            applyDraft(draft);
          } else {
            setCopies({});
            setPublished(true);
            setDraftRevision(null);
            setHasServerDraft(false);
            setInitialCopies({});
            setInitialPublished(true);
          }
          setIsReady(true);
          return;
        }

        if (!bloggerId) {
          throw new Error('missing id');
        }
        const item = await fetchAdminBloggerItem(bloggerId);
        if (cancelled) {
          return;
        }
        applyItem(item);
        setDraftRevision(null);
        setHasServerDraft(false);
        setIsEditing(false);
        setIsReady(true);
      } catch {
        if (!cancelled) {
          toastRef.current.error(labels.bloggerLoadFailed);
          navigate(LIST_PATH, { replace: true });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          window.setTimeout(() => {
            if (autosavePauseRef.current !== autosavePause) {
              return;
            }
            skipAutosaveRef.current = false;
            setAutosaveTrigger((current) => current + 1);
          }, 0);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    applyDraft,
    applyItem,
    bloggerId,
    labels.bloggerLoadFailed,
    mode,
    navigate,
  ]);

  useEffect(() => {
    if (!isReady || skipAutosaveRef.current) {
      return;
    }

    if (mode === 'edit') {
      if (!isEditing || !bloggerId || !itemMeta || !canMutate || !isDirty) {
        return;
      }

      const timer = window.setTimeout(() => {
        if (skipAutosaveRef.current) {
          return;
        }
        if (isBloggerCopiesTooLong(copiesRef.current)) {
          return;
        }
        const savePromise = (async () => {
          setIsDraftSaving(true);
          try {
            const saved = await upsertMyBloggerEditDraft(bloggerId, {
              published: publishedRef.current,
              contentRevision: draftRevisionRef.current,
              copies: sanitizeCopiesForSave(copiesRef.current),
            });
            setDraftRevision(saved.contentRevision);
            setHasServerDraft(true);
            setInitialCopies(cloneCopies(copiesRef.current));
            setInitialPublished(publishedRef.current);
            setFormError('');
          } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
              const newest = error.response.data as BloggerDraftResponse;
              skipAutosaveRef.current = true;
              applyEditDraft(newest, {
                id: bloggerId,
                createdBy: itemMeta.createdBy,
                createdAt: '',
                updatedAt: '',
                contentRevision,
                published: publishedRef.current,
                copies: copiesRef.current,
              });
              setFormError(labels.bloggerConflictError);
              window.setTimeout(() => {
                skipAutosaveRef.current = false;
                setAutosaveTrigger((current) => current + 1);
              }, 0);
              return;
            }
            setFormError(labels.bloggerDraftSaveFailed);
          } finally {
            setIsDraftSaving(false);
          }
        })();
        draftSavePromiseRef.current = savePromise;
        void savePromise.then(() => {
          if (draftSavePromiseRef.current === savePromise) {
            draftSavePromiseRef.current = null;
          }
        });
      }, DRAFT_AUTOSAVE_MS);

      return () => window.clearTimeout(timer);
    }

    if (mode !== 'create') {
      return;
    }

    const hasContent = Object.values(copiesRef.current).some((copy) => {
      return (
        (copy?.title ?? '').trim().length > 0 ||
        Boolean(copy?.body && copy.body !== EMPTY_BODY_HTML)
      );
    });
    const shouldAutosave =
      hasServerDraft || publishedRef.current !== true || hasContent;
    if (!shouldAutosave) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (skipAutosaveRef.current) {
        return;
      }
      if (isBloggerCopiesTooLong(copiesRef.current)) {
        return;
      }
      const savePromise = (async () => {
        setIsDraftSaving(true);
        try {
          const payload = {
            published: publishedRef.current,
            contentRevision: draftRevisionRef.current,
            copies: sanitizeCopiesForSave(copiesRef.current),
          };
          const saved = await upsertMyBloggerDraft(payload);
          setDraftRevision(saved.contentRevision);
          setHasServerDraft(true);
          setFormError('');
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            const newest = error.response.data as BloggerDraftResponse;
            skipAutosaveRef.current = true;
            applyDraft(newest);
            setFormError(labels.bloggerConflictError);
            window.setTimeout(() => {
              skipAutosaveRef.current = false;
            }, 0);
            return;
          }
          setFormError(labels.bloggerDraftSaveFailed);
        } finally {
          setIsDraftSaving(false);
        }
      })();
      draftSavePromiseRef.current = savePromise;
      void savePromise.then(() => {
        if (draftSavePromiseRef.current === savePromise) {
          draftSavePromiseRef.current = null;
        }
      });
    }, DRAFT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [
    applyDraft,
    applyEditDraft,
    autosaveTrigger,
    bloggerId,
    canMutate,
    copies,
    contentRevision,
    published,
    hasServerDraft,
    isDirty,
    itemMeta,
    isEditing,
    isReady,
    labels.bloggerConflictError,
    labels.bloggerDraftSaveFailed,
    mode,
  ]);

  const setEditLanguage = useCallback((language: string) => {
    setEditLanguageState(language);
  }, []);

  const setTitle = useCallback(
    (title: string) => {
      setCopies((current) =>
        upsertCopyField(current, editLanguage, 'title', title),
      );
    },
    [editLanguage],
  );

  const setBody = useCallback(
    (body: string) => {
      setCopies((current) =>
        upsertCopyField(current, editLanguage, 'body', body),
      );
    },
    [editLanguage],
  );

  const goToList = useCallback(() => {
    navigate(LIST_PATH);
  }, [navigate]);

  const discardSessionMedia = useCallback(async () => {
    await editorRef.current?.discardUploadedMedia();
  }, []);

  const waitForDraftSave = useCallback(async () => {
    await draftSavePromiseRef.current;
  }, []);

  const beginEdit = useCallback(async () => {
    if (mode !== 'edit' || !itemMeta || !sourceItem || !canMutate) {
      return;
    }
    const autosavePause = ++autosavePauseRef.current;
    skipAutosaveRef.current = true;
    setIsSaving(true);
    setFormError('');
    try {
      const draft = await fetchMyBloggerEditDraft(itemMeta.id);
      if (draft) {
        applyEditDraft(draft, sourceItem);
      } else {
        applyItem(sourceItem);
        setDraftRevision(null);
        setHasServerDraft(false);
      }
      setIsEditing(true);
    } catch {
      setFormError(labels.bloggerLoadFailed);
    } finally {
      setIsSaving(false);
      if (autosavePauseRef.current === autosavePause) {
        skipAutosaveRef.current = false;
        setAutosaveTrigger((current) => current + 1);
      }
    }
  }, [
    applyEditDraft,
    applyItem,
    canMutate,
    itemMeta,
    labels.bloggerLoadFailed,
    mode,
    sourceItem,
  ]);

  const publish = useCallback(async () => {
    if (publishCompletedRef.current) {
      return;
    }
    if (!canPublishOrSave) {
      setFormError(labels.bloggerValidationError);
      return;
    }
    if (isBloggerCopiesTooLong(copies)) {
      toastRef.current.error(labels.richTextTooLong);
      return;
    }
    setIsSaving(true);
    skipAutosaveRef.current = true;
    setFormError('');
    try {
      await waitForDraftSave();
      await createAdminBlogger({
        published,
        copies: sanitizeCopiesForSave(copies),
      });
      publishCompletedRef.current = true;
      setHasPublished(true);
      let draftDeleted = false;
      for (let attempt = 0; attempt < 2 && !draftDeleted; attempt += 1) {
        try {
          await deleteMyBloggerDraft();
          draftDeleted = true;
        } catch {
          continue;
        }
      }
      if (!draftDeleted) {
        toastRef.current.error(labels.bloggerDraftDeleteFailed);
      }
      editorRef.current?.commitUploadedMedia();
      toastRef.current.info(labels.bloggerPublishSuccess);
      goToList();
    } catch {
      setFormError(labels.bloggerCreateFailed);
      skipAutosaveRef.current = false;
      setAutosaveTrigger((current) => current + 1);
    } finally {
      setIsSaving(false);
    }
  }, [
    canPublishOrSave,
    copies,
    published,
    goToList,
    labels.bloggerCreateFailed,
    labels.bloggerDraftDeleteFailed,
    labels.bloggerPublishSuccess,
    labels.bloggerValidationError,
    labels.richTextTooLong,
    waitForDraftSave,
  ]);

  const save = useCallback(async () => {
    if (!itemMeta || !canMutate) {
      return;
    }
    if (!canPublishOrSave) {
      setFormError(labels.bloggerValidationError);
      return;
    }
    if (isBloggerCopiesTooLong(copies)) {
      toastRef.current.error(labels.richTextTooLong);
      return;
    }
    setIsSaving(true);
    skipAutosaveRef.current = true;
    setFormError('');
    try {
      await waitForDraftSave();
      const updated = await updateAdminBlogger(itemMeta.id, {
        published,
        contentRevision,
        copies: sanitizeCopiesForSave(copies),
      });
      let draftDeleted = false;
      for (let attempt = 0; attempt < 2 && !draftDeleted; attempt += 1) {
        try {
          await deleteMyBloggerEditDraft(itemMeta.id);
          draftDeleted = true;
        } catch {
          continue;
        }
      }
      if (!draftDeleted) {
        setFormError(labels.bloggerDraftDeleteFailed);
        return;
      }
      editorRef.current?.commitUploadedMedia();
      applyItem(updated);
      setDraftRevision(null);
      setHasServerDraft(false);
      setIsEditing(false);
      toastRef.current.info(labels.bloggerSaveSuccess);
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axios.isAxiosError(error) && axiosError.response?.status === 409) {
        const newest = axiosError.response.data as BloggerResponse;
        setConflictItem(newest);
        setFormError(labels.bloggerConflictError);
        toastRef.current.error(labels.bloggerConflictError);
        return;
      }
      setFormError(labels.bloggerSaveFailed);
      skipAutosaveRef.current = false;
      setAutosaveTrigger((current) => current + 1);
    } finally {
      setIsSaving(false);
    }
  }, [
    applyItem,
    canMutate,
    canPublishOrSave,
    contentRevision,
    copies,
    published,
    itemMeta,
    labels.bloggerConflictError,
    labels.bloggerDraftDeleteFailed,
    labels.bloggerSaveFailed,
    labels.bloggerSaveSuccess,
    labels.bloggerValidationError,
    labels.richTextTooLong,
    waitForDraftSave,
  ]);

  const applyLatest = useCallback(async () => {
    if (!conflictItem || !itemMeta || !canMutate) {
      return;
    }
    setIsDraftSaving(true);
    try {
      const saved = await upsertMyBloggerEditDraft(itemMeta.id, {
        published: conflictItem.published,
        contentRevision: draftRevisionRef.current,
        sourceContentRevision: conflictItem.contentRevision,
        copies: sanitizeCopiesForSave(conflictItem.copies),
      });
      skipAutosaveRef.current = true;
      applyItem(conflictItem);
      applyEditDraft(saved, conflictItem);
      setFormError('');
      window.setTimeout(() => {
        skipAutosaveRef.current = false;
        setAutosaveTrigger((current) => current + 1);
      }, 0);
    } catch {
      setFormError(labels.bloggerDraftSaveFailed);
    } finally {
      setIsDraftSaving(false);
    }
  }, [
    applyEditDraft,
    applyItem,
    canMutate,
    conflictItem,
    itemMeta,
    labels.bloggerDraftSaveFailed,
  ]);

  const deleteItem = useCallback(async () => {
    if (!itemMeta || !canMutate) {
      return;
    }
    setIsSaving(true);
    try {
      await deleteAdminBlogger(itemMeta.id);
      await discardSessionMedia();
      toastRef.current.info(labels.bloggerDeleteSuccess);
      setDeleteConfirmOpen(false);
      goToList();
    } catch {
      toastRef.current.error(labels.bloggerDeleteFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    canMutate,
    discardSessionMedia,
    goToList,
    itemMeta,
    labels.bloggerDeleteFailed,
    labels.bloggerDeleteSuccess,
  ]);

  const deleteDraft = useCallback(async () => {
    if (mode !== 'create' || !hasServerDraft) {
      return;
    }
    skipAutosaveRef.current = true;
    setIsSaving(true);
    try {
      await deleteMyBloggerDraft();
      await discardSessionMedia();
      toastRef.current.info(labels.bloggerDraftDeleteSuccess);
      setDeleteConfirmOpen(false);
      goToList();
    } catch {
      toastRef.current.error(labels.bloggerDraftDeleteFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    discardSessionMedia,
    goToList,
    hasServerDraft,
    labels.bloggerDraftDeleteFailed,
    labels.bloggerDraftDeleteSuccess,
    mode,
  ]);

  const discardEditDraft = useCallback(async () => {
    if (mode !== 'edit' || !itemMeta || !sourceItem) {
      return;
    }
    skipAutosaveRef.current = true;
    setIsSaving(true);
    try {
      await deleteMyBloggerEditDraft(itemMeta.id);
      await discardSessionMedia();
      toastRef.current.info(labels.bloggerDraftDeleteSuccess);
      applyItem(sourceItem);
      setDraftRevision(null);
      setHasServerDraft(false);
      setConflictItem(null);
      setFormError('');
      setDiscardDraftConfirmOpen(false);
      setIsEditing(false);
    } catch {
      toastRef.current.error(labels.bloggerDraftDeleteFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    discardSessionMedia,
    itemMeta,
    labels.bloggerDraftDeleteFailed,
    labels.bloggerDraftDeleteSuccess,
    mode,
    sourceItem,
    applyItem,
  ]);

  return {
    mode,
    editorRef,
    isReady,
    isLoading,
    isSaving,
    isDraftSaving,
    isEditing,
    hasPublished,
    formError,
    conflictItem,
    languageOptions,
    editLanguage,
    setEditLanguage,
    currentTitle: currentCopy.title,
    currentBody: currentCopy.body || EMPTY_BODY_HTML,
    setTitle,
    setBody,
    published,
    setPublished,
    canPublishOrSave,
    canSave,
    canMutate,
    isDirty,
    hasServerDraft,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    discardDraftConfirmOpen,
    setDiscardDraftConfirmOpen,
    deleteDraft,
    discardEditDraft,
    beginEdit,
    publish,
    save,
    applyLatest,
    deleteItem,
  };
}
