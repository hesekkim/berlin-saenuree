import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  MdContentCopy,
  MdEdit,
  MdLinkOff,
  MdOpenInNew,
} from 'react-icons/md';
import type { LinkContextMenuState, RichTextEditorLabels } from './types';
import styles from './RichTextEditor.module.css';

export type LinkContextMenuProps = {
  menu: LinkContextMenuState;
  labels: RichTextEditorLabels;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onCopy: (href: string) => void;
  onOpen: (href: string) => void;
  onEdit: (href: string) => void;
  onRemove: () => void;
};

export default function LinkContextMenu({
  menu,
  labels,
  menuRef,
  onClose,
  onCopy,
  onOpen,
  onEdit,
  onRemove,
}: LinkContextMenuProps) {
  return createPortal(
    <>
      <div
        className={styles.contextMenuBackdrop}
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className={`cms-theme ${styles.contextMenu}`}
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onPointerDown={(event) => {
          // Keep the editor from stealing this gesture.
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          className={styles.contextMenuItem}
          role="menuitem"
          onClick={() => {
            void onCopy(menu.href);
          }}
        >
          <span className={styles.contextMenuIcon}>
            <MdContentCopy aria-hidden="true" />
          </span>
          {labels.linkCopy}
        </button>
        <button
          type="button"
          className={styles.contextMenuItem}
          role="menuitem"
          onClick={() => onOpen(menu.href)}
        >
          <span className={styles.contextMenuIcon}>
            <MdOpenInNew aria-hidden="true" />
          </span>
          {labels.linkOpen}
        </button>
        <button
          type="button"
          className={styles.contextMenuItem}
          role="menuitem"
          onClick={() => onEdit(menu.href)}
        >
          <span className={styles.contextMenuIcon}>
            <MdEdit aria-hidden="true" />
          </span>
          {labels.linkEdit}
        </button>
        <button
          type="button"
          className={[styles.contextMenuItem, styles.contextMenuItemDanger]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          onClick={onRemove}
        >
          <span className={styles.contextMenuIcon}>
            <MdLinkOff aria-hidden="true" />
          </span>
          {labels.linkRemove}
        </button>
      </div>
    </>,
    document.body
  );
}
