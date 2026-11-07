/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as authApi from '../api/authApi';
import type { CmsMeResponse, CmsRole } from '../api/authApi';
import type { Language } from '../types/Language';

const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RECENT_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  role: CmsRole | null;
  pages: string[];
  effectivePages: string[];
  adminLanguage: Language | null;
  darkMode: boolean | null;
  refreshMe: () => Promise<CmsMeResponse | null>;
  sendVerificationCode: (email: string) => Promise<{
    success: boolean;
    error?: string;
    data?: { email_sent?: boolean };
  }>;
  verifyCode: (
    email: string,
    code: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  email: null,
  role: null,
  pages: [],
  effectivePages: [],
  adminLanguage: null,
  darkMode: null,
  refreshMe: async () => null,
  sendVerificationCode: async () => ({ success: false }),
  verifyCode: async () => ({ success: false }),
  logout: () => {},
});

/** Only an explicit rejection ends the session; network errors and 5xx keep it. */
export function isSessionRejected(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

/** Backend `detail` is a string for HTTP errors but a list for 422 validation errors. */
export function readErrorDetail(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function applyMe(
  me: CmsMeResponse,
  setters: {
    setIsAuthenticated: (value: boolean) => void;
    setEmail: (value: string | null) => void;
    setRole: (value: CmsRole | null) => void;
    setPages: (value: string[]) => void;
    setEffectivePages: (value: string[]) => void;
    setAdminLanguage: (value: Language | null) => void;
    setDarkMode: (value: boolean | null) => void;
  },
) {
  setters.setIsAuthenticated(true);
  setters.setEmail(me.email);
  setters.setRole(me.role);
  setters.setPages(me.pages);
  setters.setEffectivePages(me.effectivePages);
  setters.setAdminLanguage(me.adminLanguage);
  setters.setDarkMode(me.darkMode);
}

function clearAuth(setters: {
  setIsAuthenticated: (value: boolean) => void;
  setEmail: (value: string | null) => void;
  setRole: (value: CmsRole | null) => void;
  setPages: (value: string[]) => void;
  setEffectivePages: (value: string[]) => void;
  setAdminLanguage: (value: Language | null) => void;
  setDarkMode: (value: boolean | null) => void;
}) {
  localStorage.removeItem('auth_token');
  setters.setIsAuthenticated(false);
  setters.setEmail(null);
  setters.setRole(null);
  setters.setPages([]);
  setters.setEffectivePages([]);
  setters.setAdminLanguage(null);
  setters.setDarkMode(null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<CmsRole | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [effectivePages, setEffectivePages] = useState<string[]>([]);
  const [adminLanguage, setAdminLanguage] = useState<Language | null>(null);
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const lastActivityAt = useRef(0);
  const authSessionVersion = useRef(0);

  const setters = {
    setIsAuthenticated,
    setEmail,
    setRole,
    setPages,
    setEffectivePages,
    setAdminLanguage,
    setDarkMode,
  };

  const refreshMe = async (): Promise<CmsMeResponse | null> => {
    const sessionVersion = authSessionVersion.current;
    const savedToken = localStorage.getItem('auth_token');
    if (!savedToken) {
      if (sessionVersion === authSessionVersion.current) {
        authSessionVersion.current += 1;
        clearAuth(setters);
      }
      return null;
    }

    try {
      const me = await authApi.fetchMe(savedToken);
      if (sessionVersion !== authSessionVersion.current) {
        return null;
      }
      if (!me.is_authenticated) {
        authSessionVersion.current += 1;
        clearAuth(setters);
        return null;
      }
      applyMe(me, setters);
      return me;
    } catch (error: unknown) {
      if (
        isSessionRejected(error) &&
        sessionVersion === authSessionVersion.current
      ) {
        authSessionVersion.current += 1;
        clearAuth(setters);
      }
      return null;
    }
  };

  const refreshMeRef = useRef(refreshMe);
  refreshMeRef.current = refreshMe;

  useEffect(() => {
    const verifyExistingToken = async () => {
      try {
        await refreshMe();
      } finally {
        setIsLoading(false);
      }
    };

    void verifyExistingToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only session restore
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const recordActivity = () => {
      lastActivityAt.current = Date.now();
    };
    const activityEvents = [
      'pointerdown',
      'pointermove',
      'keydown',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const intervalId = window.setInterval(() => {
      const recentActivity =
        Date.now() - lastActivityAt.current <= RECENT_ACTIVITY_WINDOW_MS;
      if (document.visibilityState === 'visible' && recentActivity) {
        void refreshMeRef.current();
      }
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
    };
  }, [isAuthenticated]);

  const sendVerificationCode = async (emailValue: string) => {
    try {
      const data = await authApi.sendVerificationCode(emailValue);
      return { success: true, data };
    } catch (error: unknown) {
      console.error('[AuthContext] Error:', error);
      return {
        success: false,
        error: readErrorDetail(error, 'Failed to send verification code'),
      };
    }
  };

  const verifyCode = async (emailValue: string, code: string) => {
    const sessionVersion = ++authSessionVersion.current;
    try {
      const data = await authApi.verifyCode(emailValue, code);
      if (sessionVersion !== authSessionVersion.current) {
        return { success: false };
      }
      localStorage.setItem('auth_token', data.access_token);
      const me = await authApi.fetchMe(data.access_token);
      if (sessionVersion !== authSessionVersion.current) {
        return { success: false };
      }
      applyMe(me, setters);
      return { success: true };
    } catch (error: unknown) {
      if (sessionVersion !== authSessionVersion.current) {
        return { success: false };
      }
      return {
        success: false,
        error: readErrorDetail(error, 'Invalid verification code'),
      };
    }
  };

  const logout = () => {
    authSessionVersion.current += 1;
    clearAuth(setters);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        email,
        role,
        pages,
        effectivePages,
        adminLanguage,
        darkMode,
        refreshMe,
        sendVerificationCode,
        verifyCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
