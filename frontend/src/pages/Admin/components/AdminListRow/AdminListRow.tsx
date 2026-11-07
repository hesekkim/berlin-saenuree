import type { ReactNode } from 'react';
import styles from './AdminListRow.module.css';

type Props = {
  title: string;
  author: string;
  date: string;
  badges: ReactNode;
  metadata?: ReactNode;
  thumbnailUrl?: string;
  ariaLabel: string;
  onClick: () => void;
  tone?: 'default' | 'draft';
  selection?: ReactNode;
};

export default function AdminListRow({
  title,
  author,
  date,
  badges,
  metadata,
  thumbnailUrl,
  ariaLabel,
  onClick,
  tone = 'default',
  selection,
}: Props) {
  const rowClassName = [
    styles.row,
    thumbnailUrl ? styles.withThumbnail : '',
    tone === 'draft' ? styles.draftRow : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={styles.item}>
      <div
        className={[
          selection ? styles.rowWithSelection : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {selection ? (
          <div
            className={styles.selection}
          >
            {selection}
          </div>
        ) : null}
        <button
          type="button"
          className={rowClassName}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {thumbnailUrl ? (
            <img
              className={styles.thumbnail}
              src={thumbnailUrl}
              alt=""
              draggable={false}
              loading="lazy"
            />
          ) : null}
          <div
            className={`${styles.content} ${metadata ? '' : styles.contentWithoutMetadata}`}
          >
            <span className={styles.title}>{title}</span>
            <span className={styles.author}>{author}</span>
            <span className={styles.date}>{date}</span>
            {metadata ? (
              <span className={styles.metadata}>{metadata}</span>
            ) : null}
            <span className={styles.badges}>{badges}</span>
          </div>
        </button>
      </div>
    </li>
  );
}
