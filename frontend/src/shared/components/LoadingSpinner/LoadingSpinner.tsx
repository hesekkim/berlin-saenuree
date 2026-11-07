import { BiLoaderAlt } from 'react-icons/bi';
import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = 'medium',
  text = 'Loading...',
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div className={styles.container}>
      <BiLoaderAlt
        className={`${styles.spinner} ${styles[size]} ${className}`.trim()}
      />
      <p className={styles.text}>{text}</p>
    </div>
  );
}
