import type { MouseEventHandler, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useId } from 'react';
import { IoMdClose } from 'react-icons/io';
import styles from './Dialog.module.css';
import { useDialog } from './useDialog';

export interface DialogProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  /** When false, footer has no top border (default true). */
  showFooterDivider?: boolean;
  bodyClassName?: string;
  overlayClassName?: string;
  headerClassName?: string;
  showTitle?: boolean;
  showHeaderDivider?: boolean;
  onDialogClick?: MouseEventHandler<HTMLDivElement>;
}

export default function Dialog({
  isOpen,
  title,
  children,
  onClose,
  closeLabel = 'Close',
  footer,
  size = 'md',
  className = '',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showFooterDivider = true,
  bodyClassName = '',
  overlayClassName = '',
  headerClassName = '',
  showTitle = true,
  showHeaderDivider = true,
  onDialogClick,
}: DialogProps) {
  const titleId = useId();
  useDialog({ isOpen, onClose, closeOnEscape });

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      onClose();
    }
  };

  const dialogClassName = [
    styles.dialog,
    size === 'sm' ? styles['dialog--sm'] : '',
    size === 'lg' ? styles['dialog--lg'] : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const footerClassName = [
    styles.footer,
    showFooterDivider ? '' : styles['footer--noDivider'],
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={['cms-theme', styles.overlay, overlayClassName]
        .filter(Boolean)
        .join(' ')}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={showTitle ? titleId : undefined}
        aria-label={showTitle ? undefined : title}
        onClick={(event) => {
          event.stopPropagation();
          onDialogClick?.(event);
        }}
      >
        <div
          className={[
            styles.header,
            showHeaderDivider ? '' : styles['header--noDivider'],
            headerClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {showTitle ? (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          ) : null}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <IoMdClose aria-hidden="true" />
          </button>
        </div>

        <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>
          {children}
        </div>

        {footer ? <div className={footerClassName}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
