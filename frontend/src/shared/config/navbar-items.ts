import type { NavbarItemProps } from '../types/NavbarItemProps';
import { Language } from '../context/ConfigContext';

const navbarItems: NavbarItemProps[] = [
  {
    title: {
      [Language.KO]: 'Home',
      [Language.EN]: 'Home',
      [Language.DE]: 'Home',
    },
    link: '/',
  },
];

export default navbarItems;
