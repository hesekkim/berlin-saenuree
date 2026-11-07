import { useConfig, Language } from '../../shared/context/ConfigContext';
import { toContentLanguage } from '../../shared/config/siteLanguages';
import { SITE_EMAIL, SITE_NAME } from '../../shared/config/site';
import styles from './PrivacyPolicy.module.css';

const translations = {
  [Language.KO]: {
    title: '개인정보처리방침',
    lastUpdated: '최종 수정일: 2025년 1월 1일',
    sections: [
      {
        title: '1. 개인정보의 수집 및 이용 목적',
        content: `${SITE_NAME}는 다음의 목적을 위해 개인정보를 처리합니다:
        
• 관리자 로그인 및 계정 인증
• 고객 문의 및 불만 처리
• 서비스 개선
• 법적 의무 이행`,
      },
      {
        title: '2. 수집하는 개인정보 항목',
        content: `다음의 개인정보를 수집합니다:
        
• 필수 항목: 관리자 이메일 주소 (로그인 인증용)
• 자동 수집: IP 주소, 쿠키, 방문 기록`,
      },
      {
        title: '3. 개인정보의 보유 및 이용 기간',
        content: `수집된 개인정보는 다음의 기간 동안 보유 및 이용됩니다:
        
• 로그인 정보: 회원 탈퇴 시까지
• 법령에 따른 보존: 관련 법령에서 정한 기간`,
      },
      {
        title: '4. 쿠키 및 로컬 스토리지',
        content: `웹사이트 운영을 위해 다음의 데이터를 저장합니다:
        
• 필수 쿠키: 로그인 세션 유지, 보안
• 기능 쿠키: 언어 설정
• 사용자는 브라우저 설정을 통해 쿠키를 거부할 수 있습니다.`,
      },
      {
        title: '5. 개인정보의 제3자 제공',
        content: `${SITE_NAME}는 원칙적으로 개인정보를 외부에 제공하지 않습니다. 다만, 다음의 경우 예외로 합니다:
        
• 사용자의 사전 동의가 있는 경우
• 법령에 따라 제공이 요구되는 경우`,
      },
      {
        title: '6. 정보주체의 권리',
        content: `사용자는 다음의 권리를 행사할 수 있습니다:
        
• 개인정보 열람, 수정, 삭제 요구
• 개인정보 처리 정지 요구
• 동의 철회
        
문의: ${SITE_EMAIL}`,
      },
      {
        title: '7. 개인정보 보호책임자',
        content: `개인정보 보호와 관련한 문의사항은 아래로 연락주시기 바랍니다:
        
책임자: ${SITE_NAME}
이메일: ${SITE_EMAIL}`,
      },
      {
        title: '8. 개인정보처리방침의 변경',
        content: `본 개인정보처리방침은 관련 법령 및 내부 정책에 따라 변경될 수 있으며, 변경 시 웹사이트를 통해 공지합니다.`,
      },
    ],
  },
  [Language.EN]: {
    title: 'Privacy Policy',
    lastUpdated: 'Last Updated: January 1, 2025',
    sections: [
      {
        title: '1. Purpose of Personal Information Collection',
        content: `${SITE_NAME} processes personal information for the following purposes:
        
• Admin login and account authentication
• Handling customer inquiries and complaints
• Improving services
• Fulfilling legal obligations`,
      },
      {
        title: '2. Personal Information Collected',
        content: `We collect the following personal information:
        
• Required: Admin email address (for login authentication)
• Automatically collected: IP address, cookies, visit records`,
      },
      {
        title: '3. Retention Period',
        content: `Personal information is retained for the following periods:
        
• Login information: Until account deletion
• Legal retention: Period specified by relevant laws`,
      },
      {
        title: '4. Cookies and Local Storage',
        content: `We store the following data for website operation:
        
• Essential cookies: Login session maintenance, security
• Functional cookies: Language settings
• Users can refuse cookies through browser settings.`,
      },
      {
        title: '5. Third-Party Disclosure',
        content: `${SITE_NAME} does not disclose personal information to third parties in principle, except:
        
• With prior user consent
• When required by law`,
      },
      {
        title: '6. Data Subject Rights',
        content: `Users can exercise the following rights:
        
• Request access, correction, or deletion of personal information
• Request suspension of personal information processing
• Withdraw consent
        
Contact: ${SITE_EMAIL}`,
      },
      {
        title: '7. Privacy Officer',
        content: `For privacy-related inquiries, please contact:
        
Officer: ${SITE_NAME}
Email: ${SITE_EMAIL}`,
      },
      {
        title: '8. Changes to Privacy Policy',
        content: `This privacy policy may be changed in accordance with relevant laws and internal policies. Changes will be announced on the website.`,
      },
    ],
  },
  [Language.DE]: {
    title: 'Datenschutzerklärung',
    lastUpdated: 'Zuletzt aktualisiert: 1. Januar 2025',
    sections: [
      {
        title: '1. Zweck der Erhebung personenbezogener Daten',
        content: `${SITE_NAME} verarbeitet personenbezogene Daten für folgende Zwecke:
        
• Admin-Anmeldung und Kontoauthentifizierung
• Bearbeitung von Kundenanfragen und Beschwerden
• Verbesserung der Dienste
• Erfüllung gesetzlicher Verpflichtungen`,
      },
      {
        title: '2. Erhobene personenbezogene Daten',
        content: `Wir erheben folgende personenbezogene Daten:
        
• Erforderlich: Admin-E-Mail-Adresse (für Login-Authentifizierung)
• Automatisch erfasst: IP-Adresse, Cookies, Besuchsaufzeichnungen`,
      },
      {
        title: '3. Aufbewahrungsfrist',
        content: `Personenbezogene Daten werden für folgende Zeiträume aufbewahrt:
        
• Login-Informationen: Bis zur Kontolöschung
• Gesetzliche Aufbewahrung: Zeitraum gemäß geltenden Gesetzen`,
      },
      {
        title: '4. Cookies und lokaler Speicher',
        content: `Wir speichern folgende Daten für den Website-Betrieb:
        
• Wesentliche Cookies: Aufrechterhaltung der Login-Sitzung, Sicherheit
• Funktionale Cookies: Spracheinstellungen
• Benutzer können Cookies über die Browser-Einstellungen ablehnen.`,
      },
      {
        title: '5. Offenlegung an Dritte',
        content: `${SITE_NAME} gibt personenbezogene Daten grundsätzlich nicht an Dritte weiter, außer:
        
• Mit vorheriger Zustimmung des Benutzers
• Wenn gesetzlich vorgeschrieben`,
      },
      {
        title: '6. Rechte der betroffenen Person',
        content: `Benutzer können folgende Rechte ausüben:
        
• Zugriff, Korrektur oder Löschung personenbezogener Daten beantragen
• Aussetzung der Verarbeitung personenbezogener Daten beantragen
• Einwilligung widerrufen
        
Kontakt: ${SITE_EMAIL}`,
      },
      {
        title: '7. Datenschutzbeauftragter',
        content: `Für datenschutzbezogene Anfragen wenden Sie sich bitte an:
        
Beauftragter: ${SITE_NAME}
E-Mail: ${SITE_EMAIL}`,
      },
      {
        title: '8. Änderungen der Datenschutzerklärung',
        content: `Diese Datenschutzerklärung kann gemäß geltenden Gesetzen und internen Richtlinien geändert werden. Änderungen werden auf der Website bekannt gegeben.`,
      },
    ],
  },
};

export default function PrivacyPolicy() {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const t = translations[contentLanguage];

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.updated}>{t.lastUpdated}</p>

        {t.sections.map((section, index) => (
          <section key={index} className={styles.section}>
            <h2 className={styles['section-title']}>{section.title}</h2>
            <p className={styles['section-content']}>{section.content}</p>
          </section>
        ))}

        <div className={styles.footer}>
          <p>
            © 2025 {SITE_NAME}. All rights reserved.
            <br />
            {contentLanguage === Language.KO &&
              '본 개인정보처리방침은 2025년 1월 1일부터 시행됩니다.'}
            {contentLanguage === Language.EN &&
              'This privacy policy is effective from January 1, 2025.'}
            {contentLanguage === Language.DE &&
              'Diese Datenschutzerklärung gilt ab dem 1. Januar 2025.'}
          </p>
        </div>
      </div>
    </div>
  );
}
