/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useContext,
  createContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  fetchSiteSettings,
  saveSiteSettings,
  type SiteSettingsResponse,
} from '../api/cmsApi';
import {
  DEFAULT_SITE_LANGUAGES,
  addLanguageToList,
  removeLanguageFromList,
  resolveDefaultLanguage,
  resolveLanguage,
} from '../config/siteLanguages';
import { Language } from '../types/Language';
import { isWorldLanguageCode } from '../config/worldLanguages';

export { Language };

type SiteLanguageState = {
  availableLanguages: string[];
  defaultLanguage: string;
  language: string;
};

export const ConfigContext = createContext<{
  language: string;
  setLanguage: (language: string) => void;
  availableLanguages: string[];
  defaultLanguage: string;
  addAvailableLanguage: (language: string) => Promise<void>;
  removeAvailableLanguage: (language: string) => Promise<void>;
  setDefaultLanguage: (language: string) => Promise<void>;
  pageAdminEnabled: boolean;
}>({
  language: Language.EN,
  setLanguage: () => {},
  availableLanguages: [...DEFAULT_SITE_LANGUAGES],
  defaultLanguage: resolveDefaultLanguage(DEFAULT_SITE_LANGUAGES, null),
  addAvailableLanguage: async () => {},
  removeAvailableLanguage: async () => {},
  setDefaultLanguage: async () => {},
  pageAdminEnabled: false,
});

function readStoredLanguage(
  available: string[],
  defaultLanguage: string,
): string {
  const saved = localStorage.getItem('language');
  if (
    saved &&
    isWorldLanguageCode(saved) &&
    available.includes(saved)
  ) {
    return saved;
  }
  return resolveDefaultLanguage(available, defaultLanguage);
}

function applyAvailableLanguages(
  prev: SiteLanguageState,
  availableLanguages: string[],
  defaultLanguage: string | null | undefined = prev.defaultLanguage,
): SiteLanguageState {
  const resolvedDefaultLanguage = resolveDefaultLanguage(
    availableLanguages,
    defaultLanguage,
  );
  const language = readStoredLanguage(
    availableLanguages,
    resolvedDefaultLanguage,
  );
  const savedLanguage = localStorage.getItem('language');
  if (savedLanguage && savedLanguage !== language) {
    localStorage.setItem('language', language);
  }
  return {
    availableLanguages,
    defaultLanguage: resolvedDefaultLanguage,
    language,
  };
}

function sameLanguageList(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [siteLanguage, setSiteLanguage] = useState<SiteLanguageState>(() => ({
    availableLanguages: [...DEFAULT_SITE_LANGUAGES],
    defaultLanguage: resolveDefaultLanguage(DEFAULT_SITE_LANGUAGES, null),
    language: readStoredLanguage(
      DEFAULT_SITE_LANGUAGES,
      resolveDefaultLanguage(DEFAULT_SITE_LANGUAGES, null),
    ),
  }));
  const [pageAdminEnabled, setPageAdminEnabled] = useState(false);
  const siteLanguageRef = useRef(siteLanguage);
  siteLanguageRef.current = siteLanguage;

  useEffect(() => {
    let cancelled = false;

    fetchSiteSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        setSiteLanguage((prev) =>
          applyAvailableLanguages(
            prev,
            settings.availableLanguages,
            settings.defaultLanguage,
          ),
        );
        setPageAdminEnabled(settings.pageAdminEnabled);
      })
      .catch(() => {
        // Keep client defaults when the API is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = siteLanguage.language;
  }, [siteLanguage.language]);

  const handleSetLanguage = (newLanguage: string) => {
    setSiteLanguage((prev) => {
      const next = resolveLanguage(newLanguage, prev.availableLanguages);
      localStorage.setItem('language', next);
      return { ...prev, language: next };
    });
  };

  const commitSiteSettings = useCallback((saved: SiteSettingsResponse) => {
    const nextState = applyAvailableLanguages(
      siteLanguageRef.current,
      saved.availableLanguages,
      saved.defaultLanguage,
    );
    siteLanguageRef.current = nextState;
    setSiteLanguage(nextState);
  }, []);

  const setDefaultLanguage = useCallback(
    async (code: string) => {
      const prev = siteLanguageRef.current;
      if (
        code === prev.defaultLanguage ||
        !prev.availableLanguages.includes(code)
      ) {
        return;
      }
      const saved = await saveSiteSettings({ defaultLanguage: code });
      commitSiteSettings(saved);
    },
    [commitSiteSettings],
  );

  const persistAvailableLanguages = useCallback(
    async (nextLanguages: string[], rollback: SiteLanguageState) => {
      try {
        const saved = await saveSiteSettings({
          availableLanguages: nextLanguages,
        });
        commitSiteSettings(saved);
      } catch (error) {
        const settings = await fetchSiteSettings().catch(() => null);
        const nextState = settings
          ? applyAvailableLanguages(
              rollback,
              settings.availableLanguages,
              settings.defaultLanguage,
            )
          : rollback;
        siteLanguageRef.current = nextState;
        setSiteLanguage(nextState);
        localStorage.setItem('language', nextState.language);
        throw error;
      }
    },
    [commitSiteSettings],
  );

  const addAvailableLanguage = useCallback(
    async (code: string) => {
      const prev = siteLanguageRef.current;
      const nextLanguages = addLanguageToList(prev.availableLanguages, code);
      if (sameLanguageList(nextLanguages, prev.availableLanguages)) {
        return;
      }

      const nextState = applyAvailableLanguages(prev, nextLanguages);
      siteLanguageRef.current = nextState;
      setSiteLanguage(nextState);
      await persistAvailableLanguages(nextLanguages, prev);
    },
    [persistAvailableLanguages],
  );

  const removeAvailableLanguage = useCallback(
    async (code: string) => {
      const prev = siteLanguageRef.current;
      const nextLanguages = removeLanguageFromList(
        prev.availableLanguages,
        code,
      );
      if (sameLanguageList(nextLanguages, prev.availableLanguages)) {
        return;
      }

      const nextState = applyAvailableLanguages(prev, nextLanguages);
      siteLanguageRef.current = nextState;
      setSiteLanguage(nextState);
      await persistAvailableLanguages(nextLanguages, prev);
    },
    [persistAvailableLanguages],
  );

  const value = {
    language: siteLanguage.language,
    setLanguage: handleSetLanguage,
    availableLanguages: siteLanguage.availableLanguages,
    defaultLanguage: siteLanguage.defaultLanguage,
    addAvailableLanguage,
    removeAvailableLanguage,
    setDefaultLanguage,
    pageAdminEnabled,
  };

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export const useConfig = () => useContext(ConfigContext);
