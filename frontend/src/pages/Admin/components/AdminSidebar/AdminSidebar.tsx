import { BiLogOut, BiLinkExternal } from 'react-icons/bi';
import SidebarPanelIcon from '../../../../shared/components/ui/SidebarPanelIcon/SidebarPanelIcon';
import { SITE_NAME } from '../../../../shared/config/site';
import { adminNavIcons, type AdminNavSection } from '../../adminNav';
import type { AdminTranslations } from '../../translations';
import AdminSidebarItem from './AdminSidebarItem';
import styles from './AdminSidebar.module.css';

export interface AdminSidebarProps {
  sections: AdminNavSection[];
  labels: AdminTranslations;
  collapsed?: boolean;
  showCollapseToggle?: boolean;
  onToggleCollapsed?: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
}

export default function AdminSidebar({
  sections,
  labels,
  collapsed = false,
  showCollapseToggle = false,
  onToggleCollapsed,
  onLogout,
  onNavigate,
}: AdminSidebarProps) {
  const collapseControl = showCollapseToggle ? (
    <button
      type="button"
      className={collapsed ? styles.link : styles.collapseToggle}
      onClick={(event) => {
        event.stopPropagation();
        onToggleCollapsed?.();
      }}
      aria-expanded={!collapsed}
      aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
      title={collapsed ? labels.expandSidebar : labels.collapseSidebar}
    >
      <SidebarPanelIcon
        collapsed={collapsed}
        className={collapsed ? styles.linkIcon : undefined}
      />
    </button>
  ) : null;

  return (
    <div
      className={[
        styles.sidebar,
        collapsed ? styles.collapsed : '',
        showCollapseToggle ? styles.collapsible : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.panel}>
        <div className={styles.lead}>
          {collapsed ? (
            collapseControl
          ) : (
            <AdminSidebarItem
              variant="brand"
              label={SITE_NAME}
              to="/admin"
              collapsed={collapsed}
              onClick={onNavigate}
            />
          )}
        </div>

        <div className={styles.sections}>
          {sections.map((section) => (
            <section key={section.id} className={styles.section}>
              {!collapsed ? (
                <h2 className={styles.sectionLabel}>
                  {labels[section.labelKey]}
                </h2>
              ) : null}
              <div className={styles.sectionItems}>
                {section.items.map((item) => (
                  <AdminSidebarItem
                    key={item.id}
                    nav
                    to={item.to}
                    end={item.end}
                    label={labels[item.labelKey]}
                    icon={adminNavIcons[item.icon]}
                    collapsed={collapsed}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className={styles.footer}>
          <AdminSidebarItem
            to="/home"
            label={labels.viewSite}
            icon={BiLinkExternal}
            collapsed={collapsed}
            onClick={onNavigate}
          />
          <AdminSidebarItem
            label={labels.logout}
            icon={BiLogOut}
            collapsed={collapsed}
            onClick={() => {
              onLogout();
              onNavigate?.();
            }}
          />
        </div>
      </div>

      {showCollapseToggle && !collapsed ? (
        <div className={styles.dividerSlot}>{collapseControl}</div>
      ) : null}
    </div>
  );
}
