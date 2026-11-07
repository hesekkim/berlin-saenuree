/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { updateMyAdminLanguage, updateMyDarkMode } from '../api/authApi';
import { Language } from './ConfigContext';
import { useAuth } from './AuthContext';
import { parseLanguage } from '../utils/parseLanguage';

type CmsConfigContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  darkMode: boolean;
  setDarkMode: (darkMode: boolean) => void;
};

const CmsConfigContext = createContext<CmsConfigContextValue>({
  language: Language.EN,
  setLanguage: () => {},
  darkMode: false,
  setDarkMode: () => {},
});

export function CmsConfigProvider({ children }: { children: React.ReactNode }) {
  const { role, adminLanguage, darkMode: savedDarkMode, refreshMe } = useAuth();
  const [language, setLanguageState] = useState<Language>(Language.EN);
  const [darkMode, setDarkModeState] = useState(false);

  useEffect(() => {
    if (!role) {
      return;
    }

    const next = parseLanguage(adminLanguage ?? '') ?? Language.EN;
    setLanguageState(next);
  }, [role, adminLanguage]);

  useEffect(() => {
    if (!role) {
      return;
    }

    if (savedDarkMode !== null) {
      setDarkModeState(savedDarkMode);
      return;
    }

    setDarkModeState(
      typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
  }, [role, savedDarkMode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousTheme = document.body.dataset.cmsTheme;
    const previousColorScheme = document.body.style.colorScheme;

    return () => {
      if (previousTheme === undefined) {
        delete document.body.dataset.cmsTheme;
      } else {
        document.body.dataset.cmsTheme = previousTheme;
      }
      document.body.style.colorScheme = previousColorScheme;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.dataset.cmsTheme = darkMode ? 'dark' : 'light';
    document.body.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    void updateMyAdminLanguage(next)
      .then(() => refreshMe())
      .catch(() => {
        // Keep optimistic UI language.
      });
  };

  const setDarkMode = (next: boolean) => {
    const previous = darkMode;
    setDarkModeState(next);
    void updateMyDarkMode(next)
      .then(() => refreshMe())
      .catch(() => {
        setDarkModeState(previous);
      });
  };

  return (
    <CmsConfigContext.Provider
      value={{ language, setLanguage, darkMode, setDarkMode }}
    >
      {children}
    </CmsConfigContext.Provider>
  );
}

export function useCmsConfig() {
  return useContext(CmsConfigContext);
}
