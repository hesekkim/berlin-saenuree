import { useEffect, useState } from 'react';
import type { NavbarItemProps } from '../../types/NavbarItemProps';

export function useNavbarItem(
  subNavbarItems: NavbarItemProps[] | undefined,
  openMenuBar: boolean,
  onClick: () => void
) {
  const [isHover, setIsHover] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const sizeMedium = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--size-lg')
  );

  const handleHover = (nextHover: boolean) => {
    if (window.innerWidth < sizeMedium) return;
    setIsHover(nextHover);
  };

  const handleFocus = () => {
    if (window.innerWidth >= sizeMedium) {
      setIsHover(true);
    }
  };

  const handleBlur = () => setIsHover(false);

  const handleMenuClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.innerWidth >= sizeMedium) {
      setIsHover(false);
      setIsClicked(false);
      onClick();
      e.currentTarget.blur();
      return;
    }

    setIsClicked((prev) => !prev);

    if (subNavbarItems) {
      e.preventDefault();
    } else {
      onClick();
    }
  };

  const handleSubmenuClick = (
    e: React.MouseEvent<HTMLAnchorElement>
  ) => {
    setIsHover(false);
    setIsClicked(false);
    onClick();
    e.currentTarget.blur();
  };

  useEffect(() => {
    setIsClicked(false);
  }, [openMenuBar]);

  useEffect(() => {
    const closeSubmenu = () => {
      setIsHover(false);
      setIsClicked(false);
    };

    window.addEventListener('resize', closeSubmenu);
    return () => window.removeEventListener('resize', closeSubmenu);
  }, []);

  return {
    isHover,
    isClicked,
    handleHover,
    handleFocus,
    handleBlur,
    handleMenuClick,
    handleSubmenuClick,
  };
}
