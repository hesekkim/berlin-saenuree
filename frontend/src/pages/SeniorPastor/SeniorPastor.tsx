import { useConfig } from '../../shared/context/ConfigContext';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import { toContentLanguage } from '../../shared/config/siteLanguages';
import pastorAvatar from './assets/pastor-avatar.webp';
import content from './seniorPastorContent';
import styles from './SeniorPastor.module.css';

export default function SeniorPastor() {
  const { language } = useConfig();
  const pageContent = content[toContentLanguage(language)];

  return (
    <main className={styles.page}>
      <PageHeader
        className={styles.header}
        title={pageContent.pageTitle}
      />

      <article className={styles.profile}>
        <img
          className={styles.portrait}
          src={pastorAvatar}
          alt={pageContent.imageAlt}
          fetchPriority="high"
        />
        <div className={styles.profileCopy}>
          <h2>{pageContent.name}</h2>
          <p className={styles.role}>{pageContent.role}</p>
          <div className={styles.introduction}>
            {pageContent.introduction.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </article>

      <section className={styles.testimony} aria-labelledby="testimony-title">
        <h2 id="testimony-title">{pageContent.testimonyTitle}</h2>
        {pageContent.testimony.map((paragraph, index) => (
          <article
            className={styles.story}
            key={`${index}-${paragraph.title ?? 'story'}`}
          >
            {paragraph.title ? <h3>{paragraph.title}</h3> : null}
            <p>{paragraph.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
