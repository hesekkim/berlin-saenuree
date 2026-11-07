/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useConfig } from './ConfigContext';
import { toContentLanguage } from '../config/siteLanguages';
import type { NavbarItemProps } from '../types/NavbarItemProps';

interface NavbarContextType {
  selectedMenuTitle: string;
  setSelectedMenuTitle: (title: string) => void;
  navbarItems: NavbarItemProps[];
}

const NavbarContext = createContext<NavbarContextType | undefined>(undefined);

export function NavbarProvider({
  children,
  navbarItems,
}: {
  children: ReactNode;
  navbarItems: NavbarItemProps[];
}) {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const [selectedMenuTitle, setSelectedMenuTitle] = useState<string>(
    navbarItems[0]?.title[contentLanguage] || '',
  );

  useEffect(() => {
    const currentItem = navbarItems.find((item) =>
      Object.values(item.title).includes(selectedMenuTitle),
    );

    if (currentItem) {
      setSelectedMenuTitle(currentItem.title[contentLanguage]);
      return;
    }

    if (navbarItems[0]) {
      setSelectedMenuTitle(navbarItems[0].title[contentLanguage]);
    }
  }, [contentLanguage, navbarItems, selectedMenuTitle]);

  return (
    <NavbarContext.Provider
      value={{
        selectedMenuTitle,
        setSelectedMenuTitle,
        navbarItems,
      }}
    >
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbar() {
  const context = useContext(NavbarContext);
  if (context === undefined) {
    throw new Error('useNavbar must be used within a NavbarProvider');
  }
  return context;
}
