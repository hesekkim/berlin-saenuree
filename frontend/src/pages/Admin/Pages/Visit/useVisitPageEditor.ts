import { useCallback, useEffect, useMemo, useState } from 'react';
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
  isSafeGoogleMapsUrl,
  normalizeVisitCopy,
  type VisitContentByLanguage,
  type VisitCopy,
  type VisitTransitRoute,
} from '../../../../shared/content/visitContent';
import { getVisitAdminLabels } from './visitAdminLabels';

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
  const [editLanguage, setEditLanguage] = useState(() =>
    resolveLanguage('en', availableLanguages),
  );
  const [draft, setDraft] = useState<VisitContentByLanguage>({});
  const [savedDraft, setSavedDraft] = useState<VisitContentByLanguage>({});
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState<EditablePageDocument | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const applyDocument = useCallback((document: EditablePageDocument) => {
    const content = normalizeVisitContent(document.content);
    setDraft(content);
    setSavedDraft(content);
    setRevision(document.contentRevision);
    setIsReady(true);
    setLoadFailed(false);
  }, []);

  const load = useCallback(async () => {
    setIsReady(false);
    setLoadFailed(false);
    try {
      applyDocument(await fetchEditablePageDocument('visit'));
    } catch (error) {
      console.error('Failed to load Visit page content for editing', error);
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

  const current = normalizeVisitCopy(draft[editLanguage]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
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

  const addService = useCallback(() => {
    const id = crypto.randomUUID();
    updateAllCopies((copy) => ({
      ...copy,
      services: [
        ...copy.services,
        { id, name: '', day: '', time: '', place: '' },
      ],
    }));
  }, [updateAllCopies]);

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
    },
    [updateAllCopies],
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
    if (!isReady || isSaving || hasInvalidMapLink) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveEditablePageDocument('visit', {
        contentRevision: revision,
        content: draft,
      });
      applyDocument(saved);
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
    isReady,
    isSaving,
    isDirty,
    hasInvalidMapLink,
    loadFailed,
    conflict,
    updateField,
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
