import type { IconType } from 'react-icons';
import {
  FiBookOpen,
  FiTarget,
  FiClock,
  FiGrid,
  FiHome,
  FiSettings,
  FiLayout,
  FiMapPin,
  FiTrash2,
  FiArchive,
  FiUsers,
} from 'react-icons/fi';
import type { CmsRole } from '../../shared/api/authApi';

export type AdminNavIcon =
  | 'home'
  | 'posts'
  | 'blogger'
  | 'settings'
  | 'churchHistory'
  | 'churchVision'
  | 'visit'
  | 'popups'
  | 'backups'
  | 'trash'
  | 'members';

export type AdminNavItem = {
  id: string;
  to: string;
  labelKey:
    | 'home'
    | 'churchHistory'
    | 'churchVision'
    | 'visit'
    | 'posts'
    | 'blogger'
    | 'settings'
    | 'popups'
    | 'backups'
    | 'trash'
    | 'members';
  icon: AdminNavIcon;
  end?: boolean;
};

export type AdminNavSection = {
  id: 'pages' | 'settings';
  labelKey: 'pagesSection' | 'settingsSection';
  items: AdminNavItem[];
};

export type AdminPageNode = {
  slug: string;
  labelKey:
    | 'home'
    | 'churchHistory'
    | 'churchVision'
    | 'visit'
    | 'posts'
    | 'blogger'
    | 'members';
  to: string;
  icon: AdminNavIcon;
  end?: boolean;
  children: AdminPageNode[];
};

/** Mirrors backend `page_catalog.PAGE_TREE`.
 * Assign **main (top-level) slugs only**; children inherit via expandPageAccess.
 * When adding a page, update this tree and `backend/services/page_catalog.py` together.
 */
export const adminPageTree: AdminPageNode[] = [
  {
    slug: 'home',
    labelKey: 'home',
    to: '/admin/pages/home',
    icon: 'home',
    end: true,
    children: [],
  },
  {
    slug: 'church-history',
    labelKey: 'churchHistory',
    to: '/admin/pages/church-history',
    icon: 'churchHistory',
    end: true,
    children: [],
  },
  {
    slug: 'church-vision',
    labelKey: 'churchVision',
    to: '/admin/pages/church-vision',
    icon: 'churchVision',
    end: true,
    children: [],
  },
  {
    slug: 'posts',
    labelKey: 'posts',
    to: '/admin/pages/posts',
    icon: 'posts',
    end: true,
    children: [],
  },
  {
    slug: 'blogger',
    labelKey: 'blogger',
    to: '/admin/pages/blogger',
    icon: 'blogger',
    children: [],
  },
  {
    slug: 'visit',
    labelKey: 'visit',
    to: '/admin/pages/visit',
    icon: 'visit',
    end: true,
    children: [],
  },
  {
    slug: 'members',
    labelKey: 'members',
    to: '/admin/members',
    icon: 'members',
    end: true,
    children: [],
  },
];

function walkPages(nodes: AdminPageNode[]): AdminPageNode[] {
  return nodes.flatMap((node) => [node, ...walkPages(node.children)]);
}

export function getAssignablePageSlugs(): string[] {
  return adminPageTree.map((node) => node.slug);
}

export function getPageNode(slug: string): AdminPageNode | undefined {
  return walkPages(adminPageTree).find((node) => node.slug === slug);
}

export function expandPageAccess(assignedPages: string[]): string[] {
  const allowed = new Set<string>();
  for (const slug of assignedPages) {
    const node = getPageNode(slug);
    if (!node) {
      continue;
    }
    for (const descendant of walkPages([node])) {
      allowed.add(descendant.slug);
    }
  }
  return [...allowed];
}

export function canAccessAdminPage(
  role: CmsRole | null,
  effectivePages: string[],
  slug: string,
): boolean {
  if (role === 'site_admin') {
    return true;
  }
  if (role !== 'page_admin' && role !== 'page_manager') {
    return false;
  }
  return effectivePages.includes(slug);
}

export function getFirstAccessiblePagePath(
  role: CmsRole | null,
  effectivePages: string[],
): string {
  if (role === 'site_admin') {
    return adminPageTree[0]?.to ?? '/admin/settings';
  }

  for (const node of walkPages(adminPageTree)) {
    if (effectivePages.includes(node.slug)) {
      return node.to;
    }
  }
  return '/admin/settings';
}

/** Trash is a derived view over posts/blogger access, not an assignable page slug. */
export function canAccessTrash(
  role: CmsRole | null,
  effectivePages: string[],
): boolean {
  return (
    role === 'site_admin' ||
    effectivePages.includes('posts') ||
    effectivePages.includes('blogger')
  );
}

export function canAccessMembers(
  role: CmsRole | null,
  effectivePages: string[] = [],
): boolean {
  return (
    role === 'site_admin' ||
    ((role === 'page_admin' || role === 'page_manager') &&
      effectivePages.includes('members'))
  );
}

export function canManageMembers(
  role: CmsRole | null,
  effectivePages: string[] = [],
): boolean {
  return (
    (role === 'site_admin' || role === 'page_admin') &&
    canAccessMembers(role, effectivePages)
  );
}

function pagesSectionItems(
  effectivePages: string[],
  role: CmsRole | null,
): AdminNavItem[] {
  const navNodes =
    role === 'page_admin' || role === 'page_manager'
      ? walkPages(adminPageTree).filter((node) =>
          effectivePages.includes(node.slug),
        )
      : adminPageTree;

  const items: AdminNavItem[] = navNodes
    .filter((node) => node.slug !== 'members')
    .map((node) => ({
      id: node.slug,
      to: node.to,
      labelKey: node.labelKey,
      icon: node.icon,
      end: node.end,
    }));

  if (canAccessTrash(role, effectivePages)) {
    items.push({
      id: 'trash',
      to: '/admin/pages/trash',
      labelKey: 'trash',
      icon: 'trash',
      end: true,
    });
  }

  return items;
}

export function buildAdminNavSections(
  role: CmsRole | null,
  effectivePages: string[],
): AdminNavSection[] {
  const pageItems = pagesSectionItems(effectivePages, role);

  const sections: AdminNavSection[] = [];
  if (pageItems.length > 0) {
    sections.push({
      id: 'pages',
      labelKey: 'pagesSection',
      items: pageItems,
    });
  }

  const settingsItems: AdminNavItem[] = [
    {
      id: 'settings',
      to: '/admin/settings',
      labelKey: 'settings',
      icon: 'settings',
      end: true,
    },
  ];
  if (canAccessMembers(role, effectivePages)) {
    settingsItems.push({
      id: 'members',
      to: '/admin/members',
      labelKey: 'members',
      icon: 'members',
      end: true,
    });
  }
  if (role === 'site_admin') {
    settingsItems.push({
      id: 'popups',
      to: '/admin/settings/popups',
      labelKey: 'popups',
      icon: 'popups',
      end: true,
    });
    settingsItems.push({
      id: 'backups',
      to: '/admin/settings/backups',
      labelKey: 'backups',
      icon: 'backups',
      end: true,
    });
  }

  sections.push({
    id: 'settings',
    labelKey: 'settingsSection',
    items: settingsItems,
  });

  return sections;
}

export const adminNavSections: AdminNavSection[] = buildAdminNavSections(
  'site_admin',
  expandPageAccess(getAssignablePageSlugs()),
);

export const adminNavIcons: Record<AdminNavIcon, IconType> = {
  home: FiHome,
  visit: FiMapPin,
  churchHistory: FiClock,
  churchVision: FiTarget,
  posts: FiGrid,
  blogger: FiBookOpen,
  settings: FiSettings,
  popups: FiLayout,
  backups: FiArchive,
  trash: FiTrash2,
  members: FiUsers,
};
