import { FiMenu, FiX } from 'react-icons/fi';
import { SITE_NAME } from '../../../../shared/config/site';
import styles from './AdminTopBar.module.css';

export interface AdminTopBarProps {
  isDrawerOpen: boolean;
  openMenuLabel: string;
  closeMenuLabel: string;
  onToggle: () => void;
}

export default function AdminTopBar({
  isDrawerOpen,
  openMenuLabel,
  closeMenuLabel,
  onToggle,
}: AdminTopBarProps) {
  return (
    <header className={styles.topBar}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onToggle}
        aria-label={isDrawerOpen ? closeMenuLabel : openMenuLabel}
        aria-expanded={isDrawerOpen}
      >
        {isDrawerOpen ? <FiX /> : <FiMenu />}
      </button>
      <p className={styles.brand}>{SITE_NAME}</p>
    </header>
  );
}
