import type { ComponentType, ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import styles from './AdminSidebar.module.css';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface AdminSidebarItemProps {
  label: string;
  collapsed?: boolean;
  icon?: IconComponent;
  to?: string;
  end?: boolean;
  /** Use NavLink active styles when `to` is set. */
  nav?: boolean;
  variant?: 'nav' | 'brand';
  onClick?: () => void;
  title?: string;
}

export default function AdminSidebarItem({
  label,
  collapsed = false,
  icon: Icon,
  to,
  end,
  nav = false,
  variant = 'nav',
  onClick,
  title,
}: AdminSidebarItemProps) {
  if (variant === 'brand') {
    if (collapsed || !to) {
      return null;
    }

    return (
      <Link to={to} className={styles.brand} onClick={onClick} title={title}>
        {label}
      </Link>
    );
  }

  const content: ReactNode = (
    <>
      {Icon ? <Icon className={styles.linkIcon} aria-hidden /> : null}
      {!collapsed ? <span className={styles.linkLabel}>{label}</span> : null}
    </>
  );

  const commonProps = {
    className: styles.link,
    title: title ?? label,
    'aria-label': label,
    onClick,
  };

  if (to && nav) {
    return (
      <NavLink
        to={to}
        end={end}
        title={commonProps.title}
        aria-label={commonProps['aria-label']}
        onClick={onClick}
        className={({ isActive }) =>
          [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ')
        }
      >
        {content}
      </NavLink>
    );
  }

  if (to) {
    return (
      <Link to={to} {...commonProps}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" {...commonProps}>
      {content}
    </button>
  );
}
