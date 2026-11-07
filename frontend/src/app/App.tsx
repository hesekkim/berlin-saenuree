import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ConfigProvider } from '../shared/context/ConfigContext';
import { NavbarProvider } from '../shared/context/NavbarContext';
import Navbar from '../shared/components/Navbar/Navbar';
import navbarItems from '../shared/config/navbar-items';
import { AuthProvider } from '../shared/context/AuthContext';
import { Outlet, useLocation } from 'react-router-dom';
import Footer from '../shared/components/Footer/Footer';
import ScrollToTop from '../shared/components/ScrollToTop/ScrollToTop';
import PageTransition from '../shared/components/PageTransition/PageTransition';
import CookieConsent from '../shared/components/CookieConsent';
import styles from './App.module.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AppShell() {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');

  return (
    <NavbarProvider navbarItems={navbarItems}>
      <ScrollToTop />
      <div className={styles.shell}>
        {!isAdminRoute ? <Navbar navbarItems={navbarItems} /> : null}
        <div className={styles.main}>
          {isAdminRoute ? (
            <Outlet />
          ) : (
            <PageTransition>
              <Outlet />
            </PageTransition>
          )}
        </div>
        {!isAdminRoute ? <Footer /> : null}
      </div>
      {!isAdminRoute ? <CookieConsent /> : null}
    </NavbarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfigProvider>
          <AppShell />
        </ConfigProvider>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
