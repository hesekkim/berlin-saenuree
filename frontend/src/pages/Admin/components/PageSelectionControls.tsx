import { IoTrashOutline } from 'react-icons/io5';
import styles from './PageSelectionControls.module.css';

type Props = {
  selectedCount: number;
  selectedCountLabel: string;
  deleteLabel: string;
  onDelete: () => void;
  alwaysVisible?: boolean;
  showWhenEmpty?: boolean;
  disabled?: boolean;
  className?: string;
};

export default function PageSelectionControls({
  selectedCount,
  selectedCountLabel,
  deleteLabel,
  onDelete,
  alwaysVisible = false,
  showWhenEmpty = false,
  disabled = false,
  className = '',
}: Props) {
  const isEmpty = selectedCount === 0;
  if (isEmpty && !showWhenEmpty) {
    return null;
  }

  return (
    <div
      className={[
        styles.selectionToolbar,
        alwaysVisible ? styles.alwaysVisible : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={`${styles.selectedCount} ${
          isEmpty ? styles.selectedCountEmpty : ''
        }`}
      >
        {selectedCountLabel}
      </span>
      <button
        type="button"
        className={styles.delete}
        aria-label={deleteLabel}
        title={deleteLabel}
        onClick={onDelete}
        disabled={disabled || isEmpty}
      >
        <IoTrashOutline aria-hidden />
      </button>
    </div>
  );
}
