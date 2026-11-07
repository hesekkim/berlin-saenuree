import Checkbox from '../../../shared/components/ui/Checkbox/Checkbox';
import styles from './AdminListRow/AdminListRow.module.css';

type Props = {
  canSelect: boolean;
  allSelected: boolean;
  indeterminate: boolean;
  titleLabel: string;
  authorLabel: string;
  dateLabel: string;
  metadataLabel?: string;
  statusLabel: string;
  hasThumbnail?: boolean;
  selectAllLabel: string;
  onToggleAll: (checked: boolean) => void;
};

export default function PageSelectionHeader({
  canSelect,
  allSelected,
  indeterminate,
  titleLabel,
  authorLabel,
  dateLabel,
  metadataLabel,
  statusLabel,
  hasThumbnail = false,
  selectAllLabel,
  onToggleAll,
}: Props) {
  return (
    <li
      className={[
        styles.columnHeader,
        hasThumbnail ? styles.columnHeaderWithThumbnail : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.headerSelection}>
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          disabled={!canSelect}
          ariaLabel={selectAllLabel}
          onChange={onToggleAll}
        />
      </div>
      <div className={styles.headerRow}>
        {hasThumbnail ? (
          <span className={styles.headerThumbnail} aria-hidden />
        ) : null}
        <div
          className={[
            styles.headerContent,
            metadataLabel ? '' : styles.headerContentWithoutMetadata,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={styles.headerTitle}>{titleLabel}</span>
          <span className={styles.headerAuthor}>{authorLabel}</span>
          <span className={styles.headerDate}>{dateLabel}</span>
          {metadataLabel ? (
            <span className={styles.headerMetadata}>{metadataLabel}</span>
          ) : null}
          <span className={styles.headerStatus}>{statusLabel}</span>
        </div>
      </div>
    </li>
  );
}
