import { describe, expect, it } from 'vitest';
import {
  buildAdminNavSections,
  canAccessAdminPage,
  canAccessMembers,
  canManageMembers,
  getAssignablePageSlugs,
} from '../../src/pages/Admin/adminNav';
import {
  canMutateCmsAccount,
  canShowCmsAccountsSection,
  pagesForCmsUserSave,
} from '../../src/pages/Admin/Settings/utils/cmsAccountsAccess';

describe('canShowCmsAccountsSection', () => {
  it('shows for site_admin and page_admin when feature is on', () => {
    expect(canShowCmsAccountsSection('site_admin', true)).toBe(true);
    expect(canShowCmsAccountsSection('page_admin', true)).toBe(true);
  });

  it('hides for page_manager and when feature is off', () => {
    expect(canShowCmsAccountsSection('page_manager', true)).toBe(false);
    expect(canShowCmsAccountsSection('page_admin', false)).toBe(false);
    expect(canShowCmsAccountsSection('site_admin', false)).toBe(false);
    expect(canShowCmsAccountsSection(null, true)).toBe(false);
  });
});

describe('canMutateCmsAccount', () => {
  it('allows site_admin to mutate any CMS file role when manage is on', () => {
    expect(canMutateCmsAccount('site_admin', 'page_admin', true)).toBe(true);
    expect(canMutateCmsAccount('site_admin', 'page_manager', true)).toBe(true);
  });

  it('allows page_admin to mutate page_manager only', () => {
    expect(canMutateCmsAccount('page_admin', 'page_manager', true)).toBe(true);
    expect(canMutateCmsAccount('page_admin', 'page_admin', true)).toBe(false);
  });

  it('denies when manage is off or actor cannot manage accounts', () => {
    expect(canMutateCmsAccount('site_admin', 'page_manager', false)).toBe(
      false,
    );
    expect(canMutateCmsAccount('page_manager', 'page_manager', true)).toBe(
      false,
    );
    expect(canMutateCmsAccount(null, 'page_manager', true)).toBe(false);
  });
});

describe('pagesForCmsUserSave', () => {
  it('returns all selected pages for site_admin', () => {
    expect(pagesForCmsUserSave(true, ['home', 'news'], ['home'])).toEqual([
      'home',
      'news',
    ]);
  });

  it('filters to assignable pages for page_admin', () => {
    expect(
      pagesForCmsUserSave(false, ['home', 'news', 'about'], ['home', 'about']),
    ).toEqual(['home', 'about']);
  });
});

describe('adminNav page_manager', () => {
  it('filters pages like page_admin by effectivePages', () => {
    expect(canAccessAdminPage('page_manager', ['home'], 'home')).toBe(true);
    expect(canAccessAdminPage('page_manager', ['home'], 'other')).toBe(false);

    const sections = buildAdminNavSections('page_manager', ['home']);
    const pages = sections.find((section) => section.id === 'pages');
    expect(pages?.items.map((item) => item.id)).toEqual(['home']);
  });

  describe('church member directory access', () => {
    it('is assignable and requires that assignment for non-site admins', () => {
      expect(getAssignablePageSlugs()).toContain('members');
      expect(canAccessMembers('site_admin')).toBe(true);
      expect(canAccessMembers('page_admin', ['members'])).toBe(true);
      expect(canAccessMembers('page_manager', ['members'])).toBe(true);
      expect(canAccessMembers('page_admin', [])).toBe(false);
      expect(canAccessMembers('page_manager', [])).toBe(false);
      expect(canAccessMembers(null, ['members'])).toBe(false);

      expect(canManageMembers('site_admin')).toBe(true);
      expect(canManageMembers('page_admin', ['members'])).toBe(true);
      expect(canManageMembers('page_admin', [])).toBe(false);
      expect(canManageMembers('page_manager', ['members'])).toBe(false);
      expect(canManageMembers(null, ['members'])).toBe(false);
    });

    it('shows the directory under Settings only when assigned', () => {
      const siteAdminSettings = buildAdminNavSections('site_admin', []).find(
        (section) => section.id === 'settings',
      );
      const unassignedSettings = buildAdminNavSections('page_manager', []).find(
        (section) => section.id === 'settings',
      );
      const assignedSettings = buildAdminNavSections(
        'page_manager',
        ['members'],
      ).find((section) => section.id === 'settings');
      const assignedPages = buildAdminNavSections(
        'page_manager',
        ['members'],
      ).find((section) => section.id === 'pages');

      expect(siteAdminSettings?.items.map((item) => item.id)).toContain(
        'members',
      );
      expect(unassignedSettings?.items.map((item) => item.id)).not.toContain(
        'members',
      );
      expect(assignedSettings?.items.map((item) => item.id)).toContain(
        'members',
      );
      expect(assignedPages).toBeUndefined();
    });
  });

  it('includes Visit as an assignable CMS page', () => {
    const sections = buildAdminNavSections('site_admin', []);
    const pages = sections.find((section) => section.id === 'pages');

    expect(pages?.items).toContainEqual(
      expect.objectContaining({
        id: 'visit',
        to: '/admin/pages/visit',
        labelKey: 'visit',
      }),
    );
  });

  it('includes Church History as an assignable CMS page', () => {
    const sections = buildAdminNavSections('site_admin', []);
    const pages = sections.find((section) => section.id === 'pages');

    expect(pages?.items).toContainEqual(
      expect.objectContaining({
        id: 'church-history',
        to: '/admin/pages/church-history',
        labelKey: 'churchHistory',
      }),
    );
  });

  it('includes Church Vision as an assignable CMS page', () => {
    const sections = buildAdminNavSections('site_admin', []);
    const pages = sections.find((section) => section.id === 'pages');

    expect(pages?.items).toContainEqual(
      expect.objectContaining({
        id: 'church-vision',
        to: '/admin/pages/church-vision',
        labelKey: 'churchVision',
      }),
    );
  });

  it('shows backup navigation only to site admins', () => {
    const siteAdminSettings = buildAdminNavSections('site_admin', []).find(
      (section) => section.id === 'settings',
    );
    const pageAdminSettings = buildAdminNavSections('page_admin', []).find(
      (section) => section.id === 'settings',
    );
    const pageManagerSettings = buildAdminNavSections(
      'page_manager',
      [],
    ).find((section) => section.id === 'settings');

    expect(siteAdminSettings?.items.map((item) => item.id)).toContain(
      'backups',
    );
    expect(pageAdminSettings?.items.map((item) => item.id)).not.toContain(
      'backups',
    );
    expect(pageManagerSettings?.items.map((item) => item.id)).not.toContain(
      'backups',
    );
  });
});
