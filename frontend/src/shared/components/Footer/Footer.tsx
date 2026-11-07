import styles from './Footer.module.css';
import { AiFillInstagram } from 'react-icons/ai';
import { MdFacebook } from 'react-icons/md';
import { footerInfos } from '../../config/footer-infos';
import { SITE_MAKER_LABEL, SITE_MAKER_URL } from '../../config/site';

export default function Footer() {
  return (
    <footer className={styles.container}>
      <section className={styles['title-container']}>
        <h1 className={styles['brand-title']}>
          {footerInfos.title}
        </h1>
        <a
          className={styles.maker}
          href={SITE_MAKER_URL}
          target="_blank"
          rel="noreferrer"
        >
          {SITE_MAKER_LABEL}
        </a>
      </section>

      <section className={styles['info-container']}>
        <article className={styles.info}>
          <h2>info.</h2>
          {footerInfos.info && (
            <p className={styles['info-contents']}>{footerInfos.info}</p>
          )}
          <a
            className={styles['info-contents']}
            href={`mailto:${footerInfos.email}`}
          >
            {footerInfos.email}
          </a>
        </article>

        <article className={styles.channels}>
          <h2>channels.</h2>
          <a
            className={styles.icon}
            href={footerInfos.instagram}
            target="_blank"
            rel="noreferrer"
          >
            <AiFillInstagram />
          </a>
          {footerInfos.facebook && (
            <a
              className={styles.icon}
              href={footerInfos.facebook}
              target="_blank"
              rel="noreferrer"
            >
              <MdFacebook />
            </a>
          )}
        </article>
      </section>
    </footer>
  );
}
