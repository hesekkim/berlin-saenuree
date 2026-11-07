import { useHomeContent } from './useHomeContent';
import HomePopups from './HomePopups';
import styles from './Home.module.css';

export default function Home() {
  const { content } = useHomeContent();

  return (
    <main className={styles.container}>
      <section className={styles.hero}>
        <h1 className={styles.title}>{content.title}</h1>
        <p className={styles.subtitle}>{content.subtitle}</p>
        <p className={styles.description}>{content.description}</p>
      </section>
      <HomePopups />
    </main>
  );
}
