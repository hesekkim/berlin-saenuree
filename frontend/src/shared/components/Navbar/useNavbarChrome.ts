import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { useAuth } from '../../context/AuthContext';
import { useNavbar } from '../../context/NavbarContext';
import { fetchPublicBlogger } from '../../api/bloggerApi';

export function filterNavbarItems(
  items: NavbarItemProps[],
  isAuthenticated: boolean,
  hasPublishedBlogger: boolean,
): NavbarItemProps[] {
  return items.map((item) => {
    if (!item.subNavbarItems) {
      return item;
    }

    const filteredSubItems = item.subNavbarItems.filter((subItem) => {
      if (subItem.requiresAuth && !isAuthenticated) return false;
      if (subItem.requiresPublishedBlogger && !hasPublishedBlogger) {
        return false;
      }
      return true;
    });

    if (filteredSubItems.length === 1 && !item.preserveSubmenuWhenSingle) {
      return { ...item, subNavbarItems: undefined };
    }

    return { ...item, subNavbarItems: filteredSubItems };
  });
}

export function useNavbarChrome(navbarItems: NavbarItemProps[]) {
  const { isAuthenticated } = useAuth();
  const { selectedMenuTitle, setSelectedMenuTitle } = useNavbar();
  const { data: publicBlogger } = useQuery({
    queryKey: ['public-blogger', 'availability'],
    queryFn: () => fetchPublicBlogger({ limit: 1 }),
    staleTime: 30_000,
  });
  const [openMenuBar, setOpenMenuBar] = useState(false);

  const enhancedNavbarItems = filterNavbarItems(
    navbarItems,
    isAuthenticated,
    (publicBlogger?.total ?? 0) > 0,
  );

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
    enhancedNavbarItems,
    sizeMedium,
    toggleOpenMenuBar,
    handleSelectMenu,
    handleLanguageClick,
  };
}
