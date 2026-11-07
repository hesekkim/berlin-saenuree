import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { canAccessAdminPage } from '../../../adminNav';
import { useAuth } from '../../../../../shared/context/AuthContext';

export type TrashTab = 'posts' | 'blogger';

function isTrashTab(value: string | null): value is TrashTab {
  return value === 'posts' || value === 'blogger';
}

export function useTrashAccess() {
  const { role, effectivePages } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canViewPosts = canAccessAdminPage(role, effectivePages, 'posts');
  const canViewBlogger = canAccessAdminPage(role, effectivePages, 'blogger');
  const firstAccessibleTab: TrashTab | null = canViewPosts
    ? 'posts'
    : canViewBlogger
      ? 'blogger'
      : null;

  const requestedTab = searchParams.get('type');
  const isRequestedTabAccessible =
    isTrashTab(requestedTab) &&
    ((requestedTab === 'posts' && canViewPosts) ||
      (requestedTab === 'blogger' && canViewBlogger));

  const activeTab = isRequestedTabAccessible
    ? (requestedTab as TrashTab)
    : firstAccessibleTab;

  const setActiveTab = (tab: TrashTab) => {
    setSearchParams({ type: tab });
  };

  useEffect(() => {
    if (activeTab && requestedTab !== activeTab) {
      setSearchParams({ type: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearchParams identity is stable
  }, [activeTab, requestedTab]);

  return { activeTab, canViewPosts, canViewBlogger, setActiveTab };
}
