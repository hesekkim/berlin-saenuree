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
      [Language.KO]: '교회 비전',
      [Language.EN]: 'Church Vision',
      [Language.DE]: 'Gemeindevision',
    },
    link: '/church-vision',
  },
  {
    title: {
      [Language.KO]: '새누리 소식',
      [Language.EN]: 'Saenuree News',
      [Language.DE]: 'Saenuree Nachrichten',
    },
    link: '/saenuree-news/posts',
    preserveSubmenuWhenSingle: true,
    subNavbarItems: [
      {
        title: {
          [Language.KO]: '사진 앨범',
          [Language.EN]: 'Photo Gallery',
          [Language.DE]: 'Fotogalerie',
        },
        link: '/saenuree-news/posts',
      },
      {
        title: {
          [Language.KO]: '교회 이야기',
          [Language.EN]: 'Church Stories',
          [Language.DE]: 'Geschichten aus der Gemeinde',
        },
        link: '/saenuree-news/blogger',
        requiresPublishedBlogger: true,
      },
    ],
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
