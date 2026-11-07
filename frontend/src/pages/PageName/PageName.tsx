import { useConfig } from '../../shared/context/ConfigContext';
import { toContentLanguage } from '../../shared/config/siteLanguages';
import navbarItems from '../../shared/config/navbar-items';
import styles from './PageName.module.css';

export default function PageName({ path }: { path: string }) {
  const { language } = useConfig();
  const contentLanguage = toContentLanguage(language);
  const page = navbarItems
    .flatMap((item) => item.subNavbarItems ?? [item])
    .find((item) => item.link === path);

  if (!page) {
    throw new Error(`No navbar page is configured for "${path}"`);
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{page.title[contentLanguage]}</h1>
    </main>
  );
}
