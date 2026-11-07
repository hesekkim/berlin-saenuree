import { useEffect, useState } from 'react';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { useAuth } from '../../context/AuthContext';
import { useNavbar } from '../../context/NavbarContext';

function filterMenuByAuth(
  items: NavbarItemProps[],
  isAuthenticated: boolean
): NavbarItemProps[] {
  return items.map((item) => {
    if (!item.subNavbarItems) {
      return item;
    }

    const filteredSubItems = item.subNavbarItems.filter((subItem) => {
      if (subItem.requiresAuth && !isAuthenticated) return false;
      return true;
    });

    if (filteredSubItems.length === 1) {
      return { ...item, subNavbarItems: undefined };
    }

    return { ...item, subNavbarItems: filteredSubItems };
  });
}

export function useNavbarChrome(navbarItems: NavbarItemProps[]) {
  const { isAuthenticated } = useAuth();
  const { selectedMenuTitle, setSelectedMenuTitle } = useNavbar();
  const [openMenuBar, setOpenMenuBar] = useState(false);
  const [showBackground, setShowBackground] = useState(
    () => window.scrollY > 10
  );

  const enhancedNavbarItems = filterMenuByAuth(navbarItems, isAuthenticated);

  const sizeMedium = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--size-lg')
  );

  const closeMenu = () => {
    setOpenMenuBar(false);
  };

  const toggleOpenMenuBar = () => {
    setOpenMenuBar((prev) => !prev);
  };

  const handleSelectMenu = (title: string) => {
    closeMenu();
    setSelectedMenuTitle(title);
  };

  const handleLanguageClick = () => {
    closeMenu();
  };

  useEffect(() => {
    const onScroll = () => {
      const minScrollYToShowBackground = 10;
      setShowBackground(window.scrollY > minScrollYToShowBackground);
      setOpenMenuBar(false);
    };

    const onResize = () => setOpenMenuBar(false);

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return {
    isAuthenticated,
    selectedMenuTitle,
    openMenuBar,
    showBackground,
    enhancedNavbarItems,
    sizeMedium,
    toggleOpenMenuBar,
    handleSelectMenu,
    handleLanguageClick,
  };
}
