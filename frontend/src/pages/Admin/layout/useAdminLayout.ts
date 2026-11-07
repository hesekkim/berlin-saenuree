import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const MOBILE_MQ = '(max-width: 1023px)';
const COLLAPSED_KEY = 'adminSidebarCollapsed';

export function useAdminLayout() {
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isMobile) {
      setIsDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);
  const toggleDrawer = () => setIsDrawerOpen((open) => !open);
  const toggleSidebarCollapsed = () =>
    setIsSidebarCollapsed((collapsed) => !collapsed);

  return {
    isDrawerOpen,
    isMobile,
    isSidebarCollapsed,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    toggleSidebarCollapsed,
  };
}
