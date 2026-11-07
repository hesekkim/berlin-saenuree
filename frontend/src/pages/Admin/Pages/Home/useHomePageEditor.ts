import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  fetchPageDocument,
  savePageDocument,
  type PageContentResponse,
  type PageDocument,
} from '../../../../shared/api/cmsApi';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
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
  ensureHomeContentLanguage,
  type HomeContentByLanguage,
  type HomeCopy,
} from '../../../../shared/content/homeContent';
import { adminTranslations } from '../../translations';

export function useHomePageEditor() {
  const { availableLanguages } = useConfig();
  const { language: cmsLanguage } = useCmsConfig();
  const toast = useToast();
  const labels = adminTranslations[cmsLanguage];
  const [editLanguage, setEditLanguageState] = useState<string>(() =>
    resolveLanguage(Language.EN, availableLanguages)
  );
  const [draft, setDraft] = useState<HomeContentByLanguage>({});
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<PageDocument | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const applyDocument = useCallback((document: PageDocument) => {
    setDraft(document.content);
    setRevision(document.contentRevision);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchPageDocument(HOME_PAGE_SLUG)
      .then((document) => {
        if (cancelled) {
          return;
        }
        applyDocument(document);
        setIsReady(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        // Allow editing empty draft when the API is unavailable.
        setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [applyDocument]);

  useEffect(() => {
    setEditLanguageState((prev) => resolveLanguage(prev, availableLanguages));
  }, [availableLanguages]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    setDraft((prev) => ensureHomeContentLanguage(prev, editLanguage));
  }, [editLanguage, isReady]);

  const current = draft[editLanguage] ?? {
    title: '',
    subtitle: '',
    description: '',
  };

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

  const updateField = useCallback(
    (field: keyof HomeCopy, value: string) => {
      if (!isReady) {
        return;
      }
      setDraft((prev) => {
        const withLanguage = ensureHomeContentLanguage(prev, editLanguage);
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

  const save = useCallback(async () => {
    if (!isReady || isSaving || conflict) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await savePageDocument(HOME_PAGE_SLUG, {
        contentRevision: revision,
        content: draft,
      });
      applyDocument(saved);
      toast.info(labels.homeSaved);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const latest = error.response.data as PageContentResponse;
        setConflict({
          contentRevision: latest.contentRevision,
          content: latest.content,
        });
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
    isSaving,
    labels.homeSaveFailed,
    labels.homeSaved,
    revision,
    toast,
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
    isSaving,
    conflict,
    updateField,
    save,
    reloadLatest,
    dismissConflict,
  };
}
