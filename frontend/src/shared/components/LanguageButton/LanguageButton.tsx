import { useId } from 'react';
import styles from './LanguageButton.module.css';
import { HiOutlineLanguage } from 'react-icons/hi2';
import { useLanguageButton } from './useLanguageButton';

export default function LanguageButton({
  onClick,
  openMenuBar,
}: {
  onClick: () => void;
  openMenuBar: boolean;
}) {
  const {
    selectedLanguage,
    languageItems,
    isHover,
    isClicked,
    handleHover,
    handleTitleClick,
    handleLanguageClick,
  } = useLanguageButton(onClick, openMenuBar);
  const submenuId = useId();

  return (
    <li
      className={styles.container}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
    >
      <button
        type="button"
        className={styles.header}
        onClick={handleTitleClick}
        aria-label={getMenuTitle(selectedLanguage)}
        aria-haspopup="true"
        aria-expanded={isHover || isClicked}
        aria-controls={submenuId}
      >
        <HiOutlineLanguage className={styles['header-icon']} />
        <span className={styles['header-title']}>
          {getMenuTitle(selectedLanguage)}
        </span>
      </button>
      <div
        className={`${styles['language-container']} ${
          (isHover || isClicked) && styles.show
        }`}
        id={submenuId}
      >
        <ul className={styles.languages}>
          {languageItems.map(({ language, display }) => (
            <li className={styles['language-wrapper']} key={language}>
              <button
                type="button"
                className={`${styles.language} ${
                  language === selectedLanguage ? styles.selected : ''
                }`}
                onClick={() => handleLanguageClick(language)}
                lang={language}
                aria-pressed={language === selectedLanguage}
              >
                {display}
              </button>
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
