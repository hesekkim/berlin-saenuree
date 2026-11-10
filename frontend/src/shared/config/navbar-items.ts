import type { NavbarItemProps } from '../types/NavbarItemProps';
import { Language } from '../context/ConfigContext';

const navbarItems: NavbarItemProps[] = [
  {
    title: {
      [Language.KO]: '교회 소개',
      [Language.EN]: 'About Us',
      [Language.DE]: 'Gemeinde',
    },
    link: '/about/church-history',
    subNavbarItems: [
      {
        title: {
          [Language.KO]: '교회역사',
          [Language.EN]: 'Church History',
          [Language.DE]: 'Geschichte der Gemeinde',
        },
        link: '/about/church-history',
      },
      {
        title: {
          [Language.KO]: '담임목사 소개',
          [Language.EN]: 'Senior Pastor',
          [Language.DE]: 'Gemeindepastor',
        },
        link: '/about/senior-pastor',
      },
    ],
  },
  {
    title: {
      [Language.KO]: '우리의 소명',
      [Language.EN]: 'Our Calling',
      [Language.DE]: 'Unser Auftrag',
    },
    link: '/calling/church-vision',
    subNavbarItems: [
      {
        title: {
          [Language.KO]: '교회 비전',
          [Language.EN]: 'Church Vision',
          [Language.DE]: 'Gemeindevision',
        },
        link: '/calling/church-vision',
      },
    ],
  },
  {
    title: {
      [Language.KO]: '새누리 소식',
      [Language.EN]: 'Saenuree News',
      [Language.DE]: 'Saenuree Nachrichten',
    },
    link: '/saenuree-news',
  },
  {
    title: {
      [Language.KO]: '예배 및 오시는 길',
      [Language.EN]: 'Worship & Directions',
      [Language.DE]: 'Gottesdienst & Anfahrt',
    },
    link: '/visit',
  },
];

export default navbarItems;
