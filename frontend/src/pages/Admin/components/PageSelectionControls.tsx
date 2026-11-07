import { IoTrashOutline } from 'react-icons/io5';
import styles from './PageSelectionControls.module.css';

type Props = {
  selectedCount: number;
  selectedCountLabel: string;
  deleteLabel: string;
  onDelete: () => void;
};

export default function PageSelectionControls({
  selectedCount,
  selectedCountLabel,
  deleteLabel,
  onDelete,
}: Props) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={styles.selectionToolbar}>
      <span className={styles.selectedCount}>{selectedCountLabel}</span>
      <button
        type="button"
        className={styles.delete}
        aria-label={deleteLabel}
        title={deleteLabel}
        onClick={onDelete}
      >
        <IoTrashOutline aria-hidden />
      </button>
    </div>
  );
}
