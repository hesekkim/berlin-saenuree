import { Link } from 'react-router-dom';
import styles from './Navbar.module.css';
import LanguageButton from '../LanguageButton/LanguageButton';
import { BiMenu, BiX } from 'react-icons/bi';
import NavbarItem from '../NavbarItem/NavbarItem';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { Language } from '../../types/Language';
import { useConfig } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';
import { CHURCH_NAMES } from '../../config/site';
import { useNavbarChrome } from './useNavbarChrome';
import churchLogo from '../../../assets/church-logo.png';

export default function Navbar({
  navbarItems,
}: {
  navbarItems: NavbarItemProps[];
}) {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const {
    openMenuBar,
    showBackground,
    enhancedNavbarItems,
    toggleOpenMenuBar,
    handleSelectMenu,
    handleLanguageClick,
  } = useNavbarChrome(navbarItems);

  return (
    <header
      className={`${styles['main-container']} ${
        (showBackground || openMenuBar) && styles.accent
      } ${openMenuBar ? styles['menu-open'] : ''}`}
    >
      <div className={styles['left-side']}>
        <div className={styles['title-container']}>
          <Link
            to="/home"
            className={`${styles.title} ${styles['brand-title']}`}
            onClick={() => handleSelectMenu('')}
          >
            <img className={styles['brand-logo']} src={churchLogo} alt="" />
            <span lang={Language.KO}>{CHURCH_NAMES[Language.KO]}</span>
          </Link>
        </div>

        <button
          type="button"
          className={styles['toggle-button-wrapper']}
          onClick={toggleOpenMenuBar}
          aria-label={
            openMenuBar ? 'Close navigation menu' : 'Open navigation menu'
          }
          aria-expanded={openMenuBar}
          aria-controls="primary-navigation"
        >
          <span
            aria-hidden="true"
            className={`${styles['toggle-button']} ${
              !openMenuBar && styles.show
            }`}
          >
            <BiMenu />
          </span>
          <span
            aria-hidden="true"
            className={`${styles['toggle-button']} ${
              openMenuBar && styles.show
            }`}
          >
            <BiX />
          </span>
        </button>
      </div>

      <nav
        id="primary-navigation"
        className={styles['brand-nav']}
        aria-label="Main navigation"
      >
        <ul className={`${styles.menus} ${openMenuBar && styles.open}`}>
          {enhancedNavbarItems.map((navbarItem, index) => (
            <NavbarItem
              key={index}
              navbarItem={navbarItem}
              onClick={() => handleSelectMenu(navbarItem.title[contentLanguage])}
              openMenuBar={openMenuBar}
            />
          ))}
          <LanguageButton
            onClick={handleLanguageClick}
            openMenuBar={openMenuBar}
          />
        </ul>
      </nav>
    </header>
  );
}
