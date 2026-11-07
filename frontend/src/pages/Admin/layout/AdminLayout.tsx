import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/context/AuthContext';
import {
  CmsConfigProvider,
  useCmsConfig,
} from '../../../shared/context/CmsConfigContext';
import LoginModal from '../../../shared/components/LoginModal/LoginModal';
import LoadingSpinner from '../../../shared/components/LoadingSpinner/LoadingSpinner';
import { ToastProvider } from '../../../shared/components/ui/Toast/ToastProvider';
import {
  buildAdminNavSections,
  canAccessAdminPage,
  canAccessTrash,
  getFirstAccessiblePagePath,
} from '../adminNav';
import AdminSidebar from '../components/AdminSidebar/AdminSidebar';
import AdminTopBar from '../components/AdminTopBar/AdminTopBar';
import { adminTranslations } from '../translations';
import { useAdminLayout } from './useAdminLayout';
import styles from './AdminLayout.module.css';

function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, role, effectivePages } = useAuth();
  const { language, darkMode } = useCmsConfig();
  const labels = adminTranslations[language];
  const {
    isDrawerOpen,
    isSidebarCollapsed,
    closeDrawer,
    toggleDrawer,
    toggleSidebarCollapsed,
  } = useAdminLayout();

  const sections = buildAdminNavSections(role, effectivePages);

  const pageMatch = location.pathname.match(/^\/admin\/pages\/([^/]+)/);
  const pageSlug = pageMatch?.[1];
  const canAccessCurrentPage =
    pageSlug === 'trash'
      ? canAccessTrash(role, effectivePages)
      : Boolean(pageSlug) &&
        canAccessAdminPage(role, effectivePages, pageSlug!);
  if (
    pageSlug &&
    (role === 'page_admin' || role === 'page_manager') &&
    !canAccessCurrentPage
  ) {
    return (
      <Navigate to={getFirstAccessiblePagePath(role, effectivePages)} replace />
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/home');
  };

  return (
    <ToastProvider closeLabel={labels.dialogCloseLabel}>
      <div
        className={`cms-theme ${styles.shell}`}
        data-cms-theme={darkMode ? 'dark' : 'light'}
      >
        <aside className={styles.sidebarDesktop} aria-label="Admin">
          <AdminSidebar
            sections={sections}
            labels={labels}
            collapsed={isSidebarCollapsed}
            showCollapseToggle
            onToggleCollapsed={toggleSidebarCollapsed}
            onLogout={handleLogout}
          />
        </aside>

        <div className={styles.mainColumn}>
          <AdminTopBar
            isDrawerOpen={isDrawerOpen}
            openMenuLabel={labels.openMenu}
            closeMenuLabel={labels.closeMenu}
            onToggle={toggleDrawer}
          />

          <main className={styles.content}>
            <Outlet />
          </main>
        </div>

        {isDrawerOpen ? (
          <div className={styles.drawerRoot}>
            <button
              type="button"
              className={styles.backdrop}
              aria-label={labels.closeMenu}
              onClick={closeDrawer}
            />
            <aside className={styles.drawer} aria-label="Admin">
              <AdminSidebar
                sections={sections}
                labels={labels}
                collapsed={false}
                showCollapseToggle={false}
                onLogout={handleLogout}
                onNavigate={closeDrawer}
              />
            </aside>
          </div>
        ) : null}
      </div>
    </ToastProvider>
  );
}

export default function AdminLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleModalClose = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <LoadingSpinner text="Checking authentication..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginModal isOpen onCancel={handleModalClose} />;
  }

  return (
    <CmsConfigProvider>
      <AdminShell />
    </CmsConfigProvider>
  );
}

/** Default child redirect used by the router index route. */
export function AdminIndexRedirect() {
  const { role, effectivePages } = useAuth();
  return (
    <Navigate to={getFirstAccessiblePagePath(role, effectivePages)} replace />
  );
}
