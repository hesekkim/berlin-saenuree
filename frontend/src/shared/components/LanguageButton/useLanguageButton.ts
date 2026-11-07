import { useState } from 'react';
import { useConfig } from '../../context/ConfigContext';
import { getLanguageLabel } from '../../config/siteLanguages';

export function useLanguageButton(onClick: () => void) {
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

  const handleTitleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < sizeMedium) {
      setIsClicked((prev) => !prev);
      e.preventDefault();
    }
  };

  const handleLanguageClick = (language: string) => {
    setIsClicked(false);
    setIsHover(false);
    setLanguage(language);
    onClick();
  };

  return {
    selectedLanguage,
    languageItems,
    isHover,
    isClicked,
    sizeMedium,
    handleHover,
    handleTitleClick,
    handleLanguageClick,
  };
}
