import type { ReactNode } from 'react';
import styles from './RichTextEditor.module.css';

export type ToolbarButtonProps = {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export default function ToolbarButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={[styles.toolButton, active ? styles.toolButtonActive : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type OverflowItemProps = {
  label: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function OverflowItem({
  label,
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: OverflowItemProps) {
  return (
    <button
      type="button"
      className={[styles.overflowItem, active ? styles.overflowItemActive : '']
        .filter(Boolean)
        .join(' ')}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className={styles.overflowItemIcon}>{children}</span>
      {label}
    </button>
  );
}

export function ToolbarDivider() {
  return <span className={styles.divider} aria-hidden="true" />;
}
