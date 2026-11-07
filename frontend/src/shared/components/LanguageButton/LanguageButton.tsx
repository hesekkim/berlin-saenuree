import styles from './LanguageButton.module.css';
import { HiOutlineLanguage } from 'react-icons/hi2';
import { FaLocationArrow } from 'react-icons/fa6';
import { useLanguageButton } from './useLanguageButton';

export default function LanguageButton({ onClick }: { onClick: () => void }) {
  const {
    selectedLanguage,
    languageItems,
    isHover,
    isClicked,
    sizeMedium,
    handleHover,
    handleTitleClick,
    handleLanguageClick,
  } = useLanguageButton(onClick);

  return (
    <li
      className={styles.container}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
    >
      <div className={styles['header']} onClick={handleTitleClick}>
        {window.innerWidth >= sizeMedium ? (
          <div className={styles['header-icon']}>
            <HiOutlineLanguage />
          </div>
        ) : (
          <span className={styles['header-title']}>
            {getMenuTitle(selectedLanguage)}
          </span>
        )}
      </div>
      <div
        className={`${styles['language-container']} ${
          (isHover || isClicked) && styles.show
        }`}
      >
        <div className={styles.point} />
        <ul className={styles.languages}>
          {languageItems.map(({ language, display }) => (
            <li
              className={styles.language}
              key={language}
              onClick={() => handleLanguageClick(language)}
            >
              <span>{display}</span>
              <FaLocationArrow />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function getMenuTitle(code: string): string {
  if (code === 'ko') {
    return '언어';
  }
  if (code === 'de') {
    return 'Sprache';
  }
  return 'Language';
}
