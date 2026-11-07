import { Link } from 'react-router-dom';
import styles from './Navbar.module.css';
import LanguageButton from '../LanguageButton/LanguageButton';
import { BiMenu, BiX } from 'react-icons/bi';
import NavbarItem from '../NavbarItem/NavbarItem';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { useConfig } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';
import { SITE_NAME } from '../../config/site';
import { useNavbarChrome } from './useNavbarChrome';

export default function Navbar({
  navbarItems,
}: {
  navbarItems: NavbarItemProps[];
}) {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const {
    isAuthenticated,
    selectedMenuTitle,
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
        showBackground && styles.accent
      }`}
    >
      <div className={styles['left-side']}>
        <div className={styles['title-container']}>
          <Link
            to={isAuthenticated ? '/admin' : '/'}
            className={`${styles.title} ${styles['brand-title']}`}
            onClick={() =>
              handleSelectMenu(
                isAuthenticated ? '' : navbarItems[0]?.title[contentLanguage] || ''
              )
            }
          >
            {SITE_NAME}
          </Link>
        </div>

        <button
          className={styles['toggle-button-wrapper']}
          onClick={toggleOpenMenuBar}
        >
          <div
            className={`${styles['toggle-button']} ${
              !openMenuBar && styles.show
            }`}
          >
            <BiMenu />
          </div>
          <div
            className={`${styles['toggle-button']} ${
              openMenuBar && styles.show
            }`}
          >
            <BiX />
          </div>
        </button>
      </div>

      <nav className={styles['brand-nav']}>
        <ul className={`${styles.menus} ${openMenuBar && styles.open}`}>
          {enhancedNavbarItems.map((navbarItem, index) => (
            <NavbarItem
              key={index}
              navbarItem={navbarItem}
              selectedMenuTitle={selectedMenuTitle}
              onClick={() => handleSelectMenu(navbarItem.title[contentLanguage])}
              openMenuBar={openMenuBar}
            />
          ))}
          <LanguageButton onClick={handleLanguageClick} />
        </ul>
      </nav>
    </header>
  );
}
