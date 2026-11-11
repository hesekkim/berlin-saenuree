import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  fetchEditablePageDocument,
  saveEditablePageDocument,
} from '../../../../shared/api/cmsApi';
import { getLanguageLabel, resolveLanguage } from '../../../../shared/config/siteLanguages';
import {
  addChurchVisionGoal,
  hasCompleteChurchVisionContent,
  normalizeChurchVisionContent,
  normalizeChurchVisionCopy,
  removeChurchVisionGoal,
  type ChurchVisionGoalId,
} from '../../../../shared/content/churchVisionContent';
import { useConfig } from '../../../../shared/context/ConfigContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import { getChurchVisionAdminLabels } from './churchVisionAdminLabels';

type GoalField = 'title' | 'quotation' | 'reference';

export function useChurchVisionPageEditor() {
  const { availableLanguages } = useConfig();
  const { language: adminLanguage } = useCmsConfig();
  const labels = getChurchVisionAdminLabels(adminLanguage);
  const toast = useToast();
  const [editLanguage, setEditLanguage] = useState(() =>
    resolveLanguage('en', availableLanguages),
  );
  const [draft, setDraft] = useState<
    ReturnType<typeof normalizeChurchVisionContent>
  >({});
  const [savedDraft, setSavedDraft] = useState<
    ReturnType<typeof normalizeChurchVisionContent>
  >({});
  const [revision, setRevision] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);

  const applyDocument = useCallback(
    (document: Awaited<ReturnType<typeof fetchEditablePageDocument>>) => {
      const content = normalizeChurchVisionContent(
        document.content,
        availableLanguages,
      );
      setDraft(content);
      setSavedDraft(content);
      setRevision(document.contentRevision);
      setIsReady(true);
      setLoadFailed(false);
      setHasConflict(false);
    },
    [availableLanguages],
  );

  const load = useCallback(async () => {
    setIsReady(false);
    setLoadFailed(false);
    try {
      const document = await fetchEditablePageDocument('church-vision');
      applyDocument(document);
    } catch (error) {
      console.error('Failed to load Church Vision page content for editing', error);
      setLoadFailed(true);
      setIsReady(true);
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

  const current = normalizeChurchVisionCopy(draft[editLanguage]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const isContentComplete = hasCompleteChurchVisionContent(
    draft,
    availableLanguages,
  );

  const updateHeading = useCallback(
    (heading: string) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) => ({
        ...previous,
        [editLanguage]: {
          ...normalizeChurchVisionCopy(previous[editLanguage]),
          heading,
        },
      }));
    },
    [editLanguage, isReady],
  );

  const updateGoal = useCallback(
    (id: ChurchVisionGoalId, field: GoalField, value: string) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) => {
        const copy = normalizeChurchVisionCopy(previous[editLanguage]);
        return {
          ...previous,
          [editLanguage]: {
            ...copy,
            goals: copy.goals.map((goal) =>
              goal.id === id ? { ...goal, [field]: value } : goal,
            ),
          },
        };
      });
    },
    [editLanguage, isReady],
  );

  const addGoal = useCallback(() => {
    if (!isReady) {
      return null;
    }
    const id = crypto.randomUUID();
    setDraft((previous) =>
      addChurchVisionGoal(previous, availableLanguages, id),
    );
    return id;
  }, [availableLanguages, isReady]);

  const removeGoal = useCallback(
    (id: ChurchVisionGoalId) => {
      if (!isReady) {
        return;
      }
      setDraft((previous) => removeChurchVisionGoal(previous, id));
    },
    [isReady],
  );

  const save = useCallback(async () => {
    if (!isReady || !isDirty || !isContentComplete || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const document = await saveEditablePageDocument('church-vision', {
        contentRevision: revision,
        content: Object.fromEntries(
          Object.entries(draft).map(([language, copy]) => [
            language,
            {
              heading: copy.heading,
              goals: copy.goals,
            },
          ]),
        ),
      });
      applyDocument(document);
      toast.info(labels.saved);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setHasConflict(true);
      } else {
        console.error('Failed to save Church Vision page content', error);
        toast.error(labels.saveFailed);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    applyDocument,
    draft,
    isContentComplete,
    isDirty,
    isReady,
    isSaving,
    labels,
    revision,
    toast,
  ]);

  return {
    labels,
    current,
    editLanguage,
    editLanguageOptions,
    setLanguage: setEditLanguage,
    updateHeading,
    updateGoal,
    addGoal,
    removeGoal,
    isReady,
    isDirty,
    isContentComplete,
    isSaving,
    loadFailed,
    hasConflict,
    reload: load,
    save,
    dismissConflict: () => setHasConflict(false),
    reloadLatest: load,
  };
}
