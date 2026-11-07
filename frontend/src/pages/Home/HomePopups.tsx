import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IoMdClose } from 'react-icons/io';
import { useDialog } from '../../shared/components/ui/Dialog/useDialog';
import { mediaFileAbsoluteUrl } from '../../shared/api/mediaApi';
import { normalizeNoticeBackground } from '../../shared/popups/noticeBackground';
import { richHtmlPlainText, sanitizeRichHtml } from '../../shared/lib/richText';
import { isBlankPopupBody } from '../../shared/popups/popupRichText';
import { useHomePopups } from './useHomePopups';
import styles from './HomePopups.module.css';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HomePopups() {
  const { current, copy, closeLabel, dismissCurrent } = useHomePopups();
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const safeBodyHtml = useMemo(() => sanitizeRichHtml(copy.body), [copy.body]);
  const showNoticeText =
    Boolean(current) &&
    current?.type !== 'poster' &&
    !isBlankPopupBody(safeBodyHtml);
  const bodyPlain = richHtmlPlainText(safeBodyHtml);

  useDialog({
    isOpen: Boolean(current),
    onClose: dismissCurrent,
  });

  useEffect(() => {
    if (!current) {
      return undefined;
    }
    closeRef.current?.focus();

    const node = cardRef.current;
    if (!node) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', handleKeyDown);
    return () => node.removeEventListener('keydown', handleKeyDown);
  }, [current]);

  if (!current) {
    return null;
  }

  const isPoster = current.type === 'poster';
  const imageSrc = current.imageId
    ? mediaFileAbsoluteUrl(`/api/v1/media/images/${current.imageId}/display`)
    : null;
  const surface = isPoster
    ? undefined
    : normalizeNoticeBackground(current.backgroundColor);

  return createPortal(
    <div
      className={styles.overlay}
      onClick={dismissCurrent}
      role="presentation"
    >
      <div
        ref={cardRef}
        className={[
          styles.card,
          !isPoster ? styles.cardNotice : '',
          !isPoster && imageSrc ? styles.cardNoticeWithImage : '',
          !isPoster && !imageSrc ? styles.cardNoticeTextOnly : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={surface ? { backgroundColor: surface } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={bodyPlain || closeLabel}
        onClick={(event) => event.stopPropagation()}
      >
        {imageSrc ? (
          <div className={!isPoster ? styles.imageFrame : undefined}>
            <img
              src={imageSrc}
              alt=""
              className={isPoster ? styles.posterImage : styles.noticeImage}
            />
          </div>
        ) : null}
        {showNoticeText ? (
          <div className={styles.noticeFooter}>
            <div
              className={styles.noticeBody}
              dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
            />
          </div>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          className={styles.closeButton}
          onClick={dismissCurrent}
          aria-label={closeLabel}
        >
          <IoMdClose aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
