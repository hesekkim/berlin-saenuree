import { Link } from 'react-router-dom';
import styles from './NavbarItem.module.css';
import type { NavbarItemProps } from '../../types/NavbarItemProps';
import { useConfig } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';
import { useNavbarItem } from './useNavbarItem';

export default function NavbarItem({
  navbarItem,
  selectedMenuTitle,
  onClick,
  openMenuBar,
}: {
  navbarItem: NavbarItemProps;
  selectedMenuTitle: string;
  onClick: () => void;
  openMenuBar: boolean;
}) {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const { title, link, subNavbarItems } = navbarItem;
  const displayTitle = title[contentLanguage];
  const {
    isHover,
    isClicked,
    handleHover,
    handleMenuClick,
    handleSubmenuClick,
  } = useNavbarItem(subNavbarItems, openMenuBar, onClick);

  return (
    <li className={styles['main-container']}>
      <Link
        to={link}
        className={`${styles.title} ${
          displayTitle === selectedMenuTitle && styles.selected
        }`}
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
        onClick={handleMenuClick}
      >
        {displayTitle}
      </Link>

      {subNavbarItems && (
        <div
          className={`${styles['submenu-container']} ${
            (isHover || isClicked) && styles.show
          }`}
          onMouseEnter={() => handleHover(true)}
          onMouseLeave={() => handleHover(false)}
        >
          <div className={styles.point} />
          <ul className={styles.submenus}>
            {subNavbarItems.map(({ title: subTitle, link: subLink }, index) => (
              <li className={styles['submenu-wrapper']} key={index}>
                <Link
                  to={subLink}
                  className={styles.submenu}
                  onClick={handleSubmenuClick}
                >
                  {subTitle[contentLanguage]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
