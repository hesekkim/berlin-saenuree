import { BiLoaderAlt } from 'react-icons/bi';
import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  className?: string;
  inline?: boolean;
}

export default function LoadingSpinner({
  size = 'medium',
  text = 'Loading...',
  className = '',
  inline = false,
}: LoadingSpinnerProps) {
  return (
    <div
      className={`${styles.container} ${inline ? styles.inline : ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      <BiLoaderAlt
        aria-hidden
        className={`${styles.spinner} ${styles[size]} ${className}`.trim()}
      />
      <p className={styles.text}>{text}</p>
    </div>
  );
}
