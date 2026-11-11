import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './NavbarItem.module.css';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { useConfig } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';
import { useNavbarItem } from './useNavbarItem';

export default function NavbarItem({
  navbarItem,
  onClick,
  openMenuBar,
}: {
  navbarItem: NavbarItemProps;
  onClick: () => void;
  openMenuBar: boolean;
}) {
  const { language } = useConfig();
  const { pathname } = useLocation();
  const contentLanguage = toContentLanguage(language);
  const { title, link, subNavbarItems } = navbarItem;
  const displayTitle = title[contentLanguage];
  const submenuId = useId();
  const isSelected =
    pathname === link ||
    subNavbarItems?.some(
      (item) =>
        pathname === item.link || pathname.startsWith(`${item.link}/`),
    );
  const {
    isHover,
    isClicked,
    handleHover,
    handleFocus,
    handleBlur,
    handleMenuClick,
    handleSubmenuClick,
  } = useNavbarItem(subNavbarItems, openMenuBar, onClick);

  return (
    <li
      className={styles['main-container']}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
      onFocus={handleFocus}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget as Node | null
          )
        ) {
          handleBlur();
        }
      }}
    >
      <Link
        to={link}
        lang={contentLanguage}
        className={`${styles.title} ${
          isSelected && styles.selected
        }`}
        onClick={handleMenuClick}
        aria-haspopup={subNavbarItems ? 'true' : undefined}
        aria-expanded={
          subNavbarItems ? isHover || isClicked : undefined
        }
        aria-controls={subNavbarItems ? submenuId : undefined}
        aria-current={pathname === link ? 'page' : undefined}
      >
        {displayTitle}
      </Link>

      {subNavbarItems && (
        <div
          className={`${styles['submenu-container']} ${
            (isHover || isClicked) && styles.show
          }`}
        >
          <ul className={styles.submenus} id={submenuId}>
            {subNavbarItems.map(({ title: subTitle, link: subLink }, index) => {
              const isSubItemSelected =
                pathname === subLink || pathname.startsWith(`${subLink}/`);
              return (
                <li className={styles['submenu-wrapper']} key={index}>
                  <Link
                    to={subLink}
                    lang={contentLanguage}
                    className={`${styles.submenu} ${
                      isSubItemSelected ? styles.selected : ''
                    }`}
                    onClick={handleSubmenuClick}
                    aria-current={isSubItemSelected ? 'page' : undefined}
                  >
                    {subTitle[contentLanguage]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
