import type { CmsRole } from '../../../../shared/api/authApi';
import type { CmsFileRole } from '../../../../shared/api/cmsUsersApi';

/** CMS accounts Settings section: site_admin and page_admin only (018). */
export function canShowCmsAccountsSection(
  role: CmsRole | null,
  pageAdminEnabled: boolean,
): boolean {
  return pageAdminEnabled && (role === 'site_admin' || role === 'page_admin');
}

/** Edit/delete buttons: site_admin any row; page_admin only page_manager (019). */
export function canMutateCmsAccount(
  actorRole: CmsRole | null,
  targetRole: CmsFileRole,
  canManage: boolean,
): boolean {
  if (!canManage) {
    return false;
  }
  if (actorRole === 'site_admin') {
    return true;
  }
  return actorRole === 'page_admin' && targetRole === 'page_manager';
}

/**
 * page_admin sends only assignable pages; server merges outside pages (019).
 * site_admin sends the full selection.
 */
export function pagesForCmsUserSave(
  actorIsSiteAdmin: boolean,
  selectedPages: string[],
  assignablePages: string[],
): string[] {
  if (actorIsSiteAdmin) {
    return selectedPages;
  }
  const allowed = new Set(assignablePages);
  return selectedPages.filter((slug) => allowed.has(slug));
}
