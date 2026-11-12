import { useConfig } from '../../shared/context/ConfigContext';
import PageHeader from '../../shared/components/PageHeader/PageHeader';
import { getChurchVisionLabels } from './churchVisionLabels';
import { useChurchVisionContent } from './useChurchVisionContent';
import styles from './ChurchVision.module.css';

export default function ChurchVision() {
  const { language } = useConfig();
  const labels = getChurchVisionLabels(language);
  const { content, hasLoadError } = useChurchVisionContent();

  return (
    <main className={styles.page}>
      <PageHeader
        className={styles.header}
        title={labels.pageHeading}
      />

      {hasLoadError ? (
        <p className={styles.loadError} role="alert">
          {labels.contentUnavailable}
        </p>
      ) : null}

      <section className={styles.vision} aria-label={labels.title}>
        <ol className={styles.goalList}>
          {content.goals.map((goal, index) => (
            <li className={styles.goalRow} key={goal.id}>
              <article className={styles.goal}>
                <div className={styles.goalTitle}>
                  <span className={styles.goalNumber}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {goal.title ? <h3>{goal.title}</h3> : null}
                </div>
                <div className={styles.scripture}>
                  {goal.quotation ? (
                    <blockquote>{goal.quotation}</blockquote>
                  ) : null}
                  {goal.reference ? (
                    <p className={styles.reference}>{goal.reference}</p>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
