import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  className?: string;
  headingClassName?: string;
}

export default function PageHeader({
  title,
  className,
  headingClassName,
}: PageHeaderProps) {
  return (
    <header className={className}>
      <p className={styles.eyebrow}>BERLIN SAENUREE CHURCH</p>
      <h1
        className={[styles.heading, headingClassName].filter(Boolean).join(' ')}
      >
        {title}
      </h1>
    </header>
  );
}
