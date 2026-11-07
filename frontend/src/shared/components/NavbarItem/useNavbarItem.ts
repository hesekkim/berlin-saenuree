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

  const handleMenuClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.innerWidth >= sizeMedium) {
      onClick();
      return;
    }

    setIsClicked((prev) => !prev);

    if (subNavbarItems) {
      e.preventDefault();
    } else {
      onClick();
    }
  };

  const handleSubmenuClick = () => {
    setIsHover(false);
    onClick();
  };

  useEffect(() => {
    setIsClicked(false);
  }, [openMenuBar]);

  return {
    isHover,
    isClicked,
    handleHover,
    handleMenuClick,
    handleSubmenuClick,
  };
}
