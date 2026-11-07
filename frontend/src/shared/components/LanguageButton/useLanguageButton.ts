import { useEffect, useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { getLanguageLabel } from '../../config/siteLanguages';

export function useLanguageButton(
  onClick: () => void,
  openMenuBar: boolean
) {
  const {
    language: selectedLanguage,
    setLanguage,
    availableLanguages,
  } = useConfig();
  const [isHover, setIsHover] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const sizeMedium = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--size-lg')
  );

  const languageItems = availableLanguages.map((language) => ({
    language,
    display: getLanguageLabel(language),
  }));

  const handleHover = (nextHover: boolean) => {
    if (window.innerWidth >= sizeMedium) {
      setIsHover(nextHover);
    }
  };

  const handleTitleClick = () => setIsClicked((prev) => !prev);

  const handleLanguageClick = (language: string) => {
    setIsClicked(false);
    setIsHover(false);
    setLanguage(language);
    onClick();
  };

  useEffect(() => {
    const closeOnResize = () => {
      setIsClicked(false);
      setIsHover(false);
    };

    window.addEventListener('resize', closeOnResize);
    return () => window.removeEventListener('resize', closeOnResize);
  }, []);

  useEffect(() => {
    if (!openMenuBar) {
      setIsClicked(false);
      setIsHover(false);
    }
  }, [openMenuBar]);

  return {
    selectedLanguage,
    languageItems,
    isHover,
    isClicked,
    handleHover,
    handleTitleClick,
    handleLanguageClick,
  };
}
