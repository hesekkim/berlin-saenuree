import { Language } from '../context/ConfigContext';

export interface NavbarItemProps {
  title: Record<Language, string>;
  link: string;
  subNavbarItems?: NavbarItemProps[];
  requiresAuth?: boolean;
}
