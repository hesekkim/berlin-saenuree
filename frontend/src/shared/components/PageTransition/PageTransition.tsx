import styles from './PageTransition.module.css';
import { usePageTransition } from './usePageTransition';

interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const { isAnimating } = usePageTransition();

  return (
    <div className={`${styles.transition} ${isAnimating ? styles.fadeIn : ''}`}>
      {children}
    </div>
  );
}
