import { useEffect, useState } from 'react';

const CONSENT_KEY = 'cookie_consent';
const CONSENT_VERSION = '1.0';

interface ConsentState {
  necessary: boolean;
  functional: boolean;
  version: string;
  timestamp: string;
}

function getConsent(): ConsentState | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveConsent(necessary: boolean, functional: boolean) {
  const consent: ConsentState = {
    necessary,
    functional,
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch (error) {
    console.error('Failed to save cookie consent:', error);
  }
}

function clearNonEssentialStorage() {
  try {
    const authToken = localStorage.getItem('auth_token');
    const consent = localStorage.getItem(CONSENT_KEY);

    localStorage.clear();

    if (authToken) localStorage.setItem('auth_token', authToken);
    if (consent) localStorage.setItem(CONSENT_KEY, consent);
  } catch (error) {
    console.error('Failed to clear non-essential storage:', error);
  }
}

export function useCookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [functionalEnabled, setFunctionalEnabled] = useState(true);

  useEffect(() => {
    const consent = getConsent();
    if (!consent || consent.version !== CONSENT_VERSION) {
      setIsVisible(true);
    }
  }, []);

  const acceptAll = () => {
    saveConsent(true, true);
    setIsVisible(false);
  };

  const acceptNecessary = () => {
    saveConsent(true, false);
    clearNonEssentialStorage();
    setIsVisible(false);
  };

  const saveCustom = () => {
    saveConsent(true, functionalEnabled);
    if (!functionalEnabled) {
      clearNonEssentialStorage();
    }
    setIsVisible(false);
  };

  return {
    isVisible,
    showDetails,
    setShowDetails,
    functionalEnabled,
    setFunctionalEnabled,
    acceptAll,
    acceptNecessary,
    saveCustom,
  };
}
