import { useConfig, Language } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';
import styles from './CookieConsent.module.css';
import { useCookieConsent } from './useCookieConsent';

const translations = {
  [Language.KO]: {
    title: '쿠키 및 개인정보 이용 동의',
    description:
      '저희는 웹사이트 기능 제공 및 서비스 개선을 위해 쿠키와 로컬 스토리지를 사용합니다.',
    necessary: '필수 쿠키',
    necessaryDesc: '웹사이트 운영에 필수적인 쿠키입니다. (로그인, 보안)',
    functional: '기능 쿠키',
    functionalDesc: '사용자 경험 개선을 위한 쿠키입니다. (언어 설정)',
    learnMore: '자세히 보기',
    acceptAll: '모두 수락',
    acceptNecessary: '필수만 수락',
    customize: '설정',
    save: '저장',
    privacyPolicy: '개인정보처리방침',
    details: {
      title: '쿠키 설정',
      necessary: '필수 쿠키 (항상 활성화)',
      necessaryItems: [
        'auth_token: 로그인 세션 유지',
      ],
      functional: '기능 쿠키',
      functionalItems: [
        'language: 선택한 언어 저장',
      ],
    },
  },
  [Language.EN]: {
    title: 'Cookie & Privacy Consent',
    description:
      'We use cookies and local storage to provide website functionality and improve our services.',
    necessary: 'Necessary Cookies',
    necessaryDesc: 'Essential cookies for website operation. (Login, Security)',
    functional: 'Functional Cookies',
    functionalDesc: 'Cookies to enhance user experience. (Language)',
    learnMore: 'Learn More',
    acceptAll: 'Accept All',
    acceptNecessary: 'Necessary Only',
    customize: 'Customize',
    save: 'Save',
    privacyPolicy: 'Privacy Policy',
    details: {
      title: 'Cookie Settings',
      necessary: 'Necessary Cookies (Always Active)',
      necessaryItems: [
        'auth_token: Maintain login session',
      ],
      functional: 'Functional Cookies',
      functionalItems: [
        'language: Save selected language',
      ],
    },
  },
  [Language.DE]: {
    title: 'Cookie- und Datenschutz-Einwilligung',
    description:
      'Wir verwenden Cookies und lokalen Speicher, um Website-Funktionen bereitzustellen und unsere Dienste zu verbessern.',
    necessary: 'Notwendige Cookies',
    necessaryDesc:
      'Wesentliche Cookies für den Website-Betrieb. (Anmeldung, Sicherheit)',
    functional: 'Funktionale Cookies',
    functionalDesc:
      'Cookies zur Verbesserung der Benutzererfahrung. (Sprache)',
    learnMore: 'Mehr erfahren',
    acceptAll: 'Alle akzeptieren',
    acceptNecessary: 'Nur notwendige',
    customize: 'Anpassen',
    save: 'Speichern',
    privacyPolicy: 'Datenschutzerklärung',
    details: {
      title: 'Cookie-Einstellungen',
      necessary: 'Notwendige Cookies (Immer aktiv)',
      necessaryItems: [
        'auth_token: Login-Sitzung aufrechterhalten',
      ],
      functional: 'Funktionale Cookies',
      functionalItems: [
        'language: Ausgewählte Sprache speichern',
      ],
    },
  },
};

export default function CookieConsent() {
  const { language } = useConfig();
  const t = translations[toContentLanguage(language)];
  const {
    isVisible,
    showDetails,
    setShowDetails,
    functionalEnabled,
    setFunctionalEnabled,
    acceptAll,
    acceptNecessary,
    saveCustom,
  } = useCookieConsent();

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.banner}>
        <div className={styles.content}>
          <h2 className={styles.title}>{t.title}</h2>
          <p className={styles.description}>{t.description}</p>

          {showDetails ? (
            <div className={styles.details}>
              <div className={styles.category}>
                <div className={styles['category-header']}>
                  <label className={styles['category-label']}>
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className={styles.checkbox}
                    />
                    <span className={styles['category-name']}>
                      {t.details.necessary}
                    </span>
                  </label>
                </div>
                <ul className={styles['cookie-list']}>
                  {t.details.necessaryItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className={styles.category}>
                <div className={styles['category-header']}>
                  <label className={styles['category-label']}>
                    <input
                      type="checkbox"
                      checked={functionalEnabled}
                      onChange={(e) => setFunctionalEnabled(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span className={styles['category-name']}>
                      {t.details.functional}
                    </span>
                  </label>
                </div>
                <ul className={styles['cookie-list']}>
                  {t.details.functionalItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className={styles.categories}>
              <div className={styles['category-simple']}>
                <strong>{t.necessary}</strong>
                <p>{t.necessaryDesc}</p>
              </div>
              <div className={styles['category-simple']}>
                <strong>{t.functional}</strong>
                <p>{t.functionalDesc}</p>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            {showDetails ? (
              <>
                <button
                  onClick={() => setShowDetails(false)}
                  className={styles['button-secondary']}
                >
                  ← {t.acceptAll}
                </button>
                <button
                  onClick={saveCustom}
                  className={styles['button-primary']}
                >
                  {t.save}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={acceptNecessary}
                  className={styles['button-secondary']}
                >
                  {t.acceptNecessary}
                </button>
                <button
                  onClick={() => setShowDetails(true)}
                  className={styles['button-secondary']}
                >
                  {t.customize}
                </button>
                <button
                  onClick={acceptAll}
                  className={styles['button-primary']}
                >
                  {t.acceptAll}
                </button>
              </>
            )}
          </div>

          <div className={styles.footer}>
            <a
              href="/privacy-policy"
              className={styles.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.privacyPolicy}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
