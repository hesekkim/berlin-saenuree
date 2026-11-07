import styles from './Footer.module.css';
import { BsYoutube } from 'react-icons/bs';
import { AiFillInstagram } from 'react-icons/ai';
import { MdFacebook } from 'react-icons/md';
import { footerInfos } from '../../config/footer-infos';
import { getChurchName } from '../../config/site';
import { Language } from '../../types/Language';
import { useConfig } from '../../context/ConfigContext';
import { toContentLanguage } from '../../config/siteLanguages';

const footerCopy: Record<
  Language,
  {
    address: string;
    info: string;
    channels: string;
    phone: string;
  }
> = {
  [Language.KO]: {
    address: '주소',
    info: '연락처',
    channels: '채널',
    phone: '전화',
  },
  [Language.EN]: {
    address: 'Address',
    info: 'Contact',
    channels: 'Channels',
    phone: 'Tel.',
  },
  [Language.DE]: {
    address: 'Adresse',
    info: 'Kontakt',
    channels: 'Kanäle',
    phone: 'Tel.',
  },
};

export default function Footer() {
  const { language } = useConfig();
  const copy = footerCopy[toContentLanguage(language)];

  return (
    <footer className={styles.container}>
      <section className={styles['title-container']}>
        <h1
          className={styles['brand-title']}
          lang={toContentLanguage(language)}
        >
          {getChurchName(language)}
        </h1>
      </section>

      <section className={styles['info-container']}>
        <article className={styles.info}>
          <h2>{copy.address}</h2>
          <a
            className={styles['info-contents']}
            href="https://maps.google.com/?q=Borsigstra%C3%9Fe+5,+10115+Berlin,+Germany"
            target="_blank"
            rel="noopener noreferrer"
          >
            {footerInfos.address}
          </a>
        </article>

        <article className={styles.info}>
          <h2>{copy.info}</h2>
          <a
            className={styles['info-contents']}
            href={`mailto:${footerInfos.email}`}
          >
            {footerInfos.email}
          </a>
          <a
            className={styles['info-contents']}
            href={`tel:${footerInfos.phone.replaceAll('-', '')}`}
          >
            {copy.phone}: {footerInfos.phone}
          </a>
        </article>

        <article className={styles.channels}>
          <h2>{copy.channels}</h2>
          <a
            className={styles.icon}
            href={footerInfos.youtube}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTube"
          >
            <BsYoutube aria-hidden="true" />
          </a>
          <a
            className={styles.icon}
            href={footerInfos.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
          >
            <AiFillInstagram aria-hidden="true" />
          </a>
          <a
            className={styles.icon}
            href={footerInfos.facebook}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
          >
            <MdFacebook aria-hidden="true" />
          </a>
        </article>
      </section>
    </footer>
  );
}
