import { Navigate } from 'react-router-dom';
import BackupSection from '../components/BackupSection';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';

export default function Backups() {
  const { role } = useAuth();
  const { language } = useCmsConfig();

  if (role !== 'site_admin') {
    return <Navigate to="/admin/settings" replace />;
  }

  return <BackupSection labels={adminTranslations[language]} />;
}
