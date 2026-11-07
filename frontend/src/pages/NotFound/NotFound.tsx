import { Link } from 'react-router-dom';
import styles from './NotFound.module.css';
import { FaHome, FaExclamationTriangle } from 'react-icons/fa';
import { useConfig, Language } from '../../shared/context/ConfigContext';
import { toContentLanguage } from '../../shared/config/siteLanguages';

export default function NotFound() {
  const { language } = useConfig();
  const t = translations[toContentLanguage(language)];

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>
          <FaExclamationTriangle />
        </div>

        <h1 className={styles.title}>{t.title}</h1>
        <h2 className={styles.subtitle}>{t.subtitle}</h2>

        <p className={styles.message}>{t.message}</p>

        <div className={styles.actions}>
          <Link to="/" className={styles.homeButton}>
            <FaHome />
            <span>{t.homeButton}</span>
          </Link>

          <button
            onClick={() => window.history.back()}
            className={styles.backButton}
          >
            {t.backButton}
          </button>
        </div>
      </div>
    </div>
  );
}

const translations = {
  [Language.KO]: {
    title: '404',
    subtitle: '페이지를 찾을 수 없습니다',
    message:
      '찾으시는 페이지가 삭제되었거나, 이름이 변경되었거나, 일시적으로 사용할 수 없습니다.',
    homeButton: '홈으로 이동',
    backButton: '이전으로',
  },
  [Language.EN]: {
    title: '404',
    subtitle: 'Page Not Found',
    message:
      'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.',
    homeButton: 'Go to Home',
    backButton: 'Go Back',
  },
  [Language.DE]: {
    title: '404',
    subtitle: 'Seite nicht gefunden',
    message:
      'Die gesuchte Seite wurde möglicherweise entfernt, umbenannt oder ist vorübergehend nicht verfügbar.',
    homeButton: 'Zur Startseite',
    backButton: 'Zurück',
  },
};
