import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import { adminTranslations } from '../../../translations';
import {
  deleteAdminBlogger,
  fetchAdminBlogger,
  fetchMyBloggerDrafts,
  type BloggerDraftResponse,
  type BloggerResponse,
} from '../../../../../shared/api/bloggerApi';
import { getPageCount } from '../utils/pagination';
import { usePageSelection } from '../../../hooks/usePageSelection';
import { resolveBloggerCopy } from '../utils/resolveBloggerCopy';

export const PAGE_SIZE = 10;

export type BloggerFilters = {
  q: string;
  published?: boolean;
};

function readFilters(): BloggerFilters {
  const params = new URLSearchParams(window.location.search);
  const publishedValue = params.get('published');
  return {
    q: params.get('q') ?? '',
    published:
      publishedValue === 'true'
        ? true
        : publishedValue === 'false'
          ? false
          : undefined,
  };
}

function writeFilters(filters: BloggerFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) {
    params.set('q', filters.q.trim());
  }
  if (filters.published !== undefined) {
    params.set('published', String(filters.published));
  }

  const nextUrl = `${window.location.pathname}${params.size > 0 ? `?${params.toString()}` : ''}`;
  window.history.replaceState(null, '', nextUrl);
}

export function useBloggerAdmin() {
  const { email, role } = useAuth();
  const { language: adminLanguage } = useCmsConfig();
  const { defaultLanguage } = useConfig();
  const toast = useToast();
  const labels = adminTranslations[adminLanguage];
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [bloggers, setBloggers] = useState<BloggerResponse[]>([]);
  const [myDraft, setMyDraft] = useState<BloggerDraftResponse | null>(null);
  const [editDraftSourceIds, setEditDraftSourceIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BloggerFilters>(readFilters);
  const [debouncedQuery, setDebouncedQuery] = useState(filters.q);
  const {
    selectedIds,
    toggle: toggleSelection,
    toggleAll: toggleAllSelection,
    clear: clearSelection,
    replace: replaceSelection,
  } = usePageSelection();
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const activeFilters = useMemo(
    () => ({ ...filters, q: debouncedQuery }),
    [debouncedQuery, filters],
  );

  const pageCount = useMemo(() => getPageCount(total, limit), [limit, total]);

  const canCreate = useMemo(
    () =>
      role === 'site_admin' || role === 'page_admin' || role === 'page_manager',
    [role],
  );
  const canMutate = useCallback(
    (blogger: Pick<BloggerResponse, 'createdBy'>) => {
      if (role === 'site_admin' || role === 'page_admin') {
        return true;
      }
      return (
        role === 'page_manager' &&
        normalizeEmail(blogger.createdBy) === normalizeEmail(email)
      );
    },
    [email, role],
  );
  const selectableBloggers = useMemo(
    () => bloggers.filter(canMutate),
    [bloggers, canMutate],
  );
  const selectedCount = selectableBloggers.filter((blogger) =>
    selectedIds.has(blogger.id),
  ).length;
  const allSelected =
    selectableBloggers.length > 0 &&
    selectedCount === selectableBloggers.length;
  const indeterminate = selectedCount > 0 && !allSelected;
  const canSelectAny = selectableBloggers.length > 0;
  const togglePageSelection = useCallback(
    (checked: boolean) =>
      toggleAllSelection(
        selectableBloggers.map((blogger) => blogger.id),
        checked,
      ),
    [selectableBloggers, toggleAllSelection],
  );
  const listItems = useMemo(
    () =>
      bloggers.map((blogger) => {
        const copy = resolveBloggerCopy(
          blogger.copies,
          adminLanguage,
          defaultLanguage,
        );
        const title = copy.title || labels.bloggerUntitled;
        const statusLabel = blogger.published
          ? labels.bloggerPublished
          : labels.bloggerUnpublished;
        const statusType: 'published' | 'unpublished' = blogger.published
          ? 'published'
          : 'unpublished';

        return {
          blogger,
          title,
          date: new Date(blogger.createdAt).toLocaleDateString(
            adminLanguage.trim() || 'en',
          ),
          statusLabel,
          statusType,
          hasEditDraft: editDraftSourceIds.includes(blogger.id),
          canSelect: canMutate(blogger),
          ariaLabel: `${title}, ${blogger.createdBy}, ${statusLabel}`,
          selectLabel: labels.bloggerBulkSelectItem.replace(
            '{title}',
            title,
          ),
        };
      }),
    [
      adminLanguage,
      bloggers,
      canMutate,
      defaultLanguage,
      editDraftSourceIds,
      labels,
    ],
  );
  const draftItem = useMemo(() => {
    if (!myDraft) {
      return null;
    }

    const copy = resolveBloggerCopy(
      myDraft.copies,
      adminLanguage,
      defaultLanguage,
    );
    return {
      title: copy.title || labels.bloggerUntitled,
      author: myDraft.createdBy,
      date: new Date(myDraft.updatedAt).toLocaleDateString(
        adminLanguage.trim() || 'en',
      ),
    };
  }, [adminLanguage, defaultLanguage, labels.bloggerUntitled, myDraft]);
  const showDraft = Boolean(draftItem) && page === 1;
  const isEmpty = bloggers.length === 0 && !showDraft;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(filters.q);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    writeFilters(filters);
  }, [filters]);

  const loadDrafts = useCallback(async () => {
    if (!canCreate) {
      setMyDraft(null);
      setEditDraftSourceIds([]);
      return [];
    }
    try {
      const drafts = await fetchMyBloggerDrafts();
      setMyDraft(
        drafts.find((draft) => draft.sourceBloggerId === null) ?? null,
      );
      setEditDraftSourceIds(
        drafts.flatMap((draft) =>
          draft.sourceBloggerId ? [draft.sourceBloggerId] : [],
        ),
      );
      return drafts;
    } catch {
      setMyDraft(null);
      setEditDraftSourceIds([]);
      return [];
    }
  }, [canCreate]);

  const loadPage = useCallback(
    async (nextPage: number, nextFilters: BloggerFilters = activeFilters) => {
      const safePage = Math.max(1, nextPage);
      clearSelection();
      setLoading(true);

      try {
        const [result] = await Promise.all([
          fetchAdminBlogger({
            limit: PAGE_SIZE,
            offset: (safePage - 1) * PAGE_SIZE,
            q: nextFilters.q,
            published: nextFilters.published,
          }),
          loadDrafts(),
        ]);
        const resolvedPage = Math.min(
          safePage,
          getPageCount(result.total, result.limit || PAGE_SIZE),
        );
        setBloggers(result.items);
        setTotal(result.total);
        setLimit(result.limit || PAGE_SIZE);
        setPageState(resolvedPage);
      } catch {
        toastRef.current.error(labels.bloggerDeleteLoadFailed);
        setBloggers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [
      activeFilters,
      labels.bloggerDeleteLoadFailed,
      loadDrafts,
      clearSelection,
    ],
  );

  useEffect(() => {
    void loadPage(1, activeFilters);
  }, [activeFilters, loadPage]);

  useEffect(() => {
    if (page < 1) {
      setPageState(1);
    }
    if (page > pageCount) {
      setPageState(pageCount);
    }
  }, [page, pageCount]);

  const updateFilters = useCallback((next: Partial<BloggerFilters>) => {
    setFilters((current) => {
      const merged = { ...current, ...next };
      if ('q' in next) {
        setDebouncedQuery(merged.q);
      }
      return merged;
    });
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ q: '', published: undefined });
    setPageState(1);
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      const safePage = Math.max(1, nextPage);
      setPageState(safePage);
      void loadPage(safePage, activeFilters);
    },
    [activeFilters, loadPage],
  );

  const deleteSelectedBloggers = useCallback(
    async (ids: string[]) => {
      const targets = bloggers.filter(
        (blogger) => ids.includes(blogger.id) && canMutate(blogger),
      );
      if (targets.length === 0 || isBulkDeleting) {
        return [];
      }

      setIsBulkDeleting(true);
      try {
        const results = await Promise.allSettled(
          targets.map((blogger) => deleteAdminBlogger(blogger.id)),
        );
        const failedIds = targets.flatMap((blogger, index) =>
          results[index].status === 'rejected' ? [blogger.id] : [],
        );
        await loadPage(page, activeFilters);
        replaceSelection(failedIds);

        const successCount = targets.length - failedIds.length;
        const message =
          failedIds.length === targets.length
            ? labels.bloggerBulkDeleteFailure.replace(
                '{count}',
                String(failedIds.length),
              )
            : failedIds.length > 0
              ? labels.bloggerBulkDeletePartial
                  .replace('{success}', String(successCount))
                  .replace('{failed}', String(failedIds.length))
              : labels.bloggerBulkDeleteSuccess.replace(
                  '{count}',
                  String(successCount),
                );
        if (failedIds.length === targets.length) {
          toastRef.current.error(message);
        } else if (failedIds.length > 0) {
          toastRef.current.warning(message);
        } else {
          toastRef.current.info(message);
        }
        return failedIds;
      } finally {
        setIsBulkDeleting(false);
      }
    },
    [
      activeFilters,
      bloggers,
      canMutate,
      isBulkDeleting,
      labels.bloggerBulkDeleteFailure,
      labels.bloggerBulkDeletePartial,
      labels.bloggerBulkDeleteSuccess,
      loadPage,
      page,
      replaceSelection,
    ],
  );

  return {
    bloggers,
    myDraft,
    editDraftSourceIds,
    total,
    loading,
    page,
    pageCount,
    language: adminLanguage,
    filters,
    canCreate,
    canMutate,
    listItems,
    draftItem,
    showDraft,
    isEmpty,
    selectedIds,
    selectedCount,
    allSelected,
    indeterminate,
    canSelectAny,
    togglePageSelection,
    selectedCountLabel: labels.bulkSelectedCount.replace(
      '{count}',
      String(selectedCount),
    ),
    bulkDeleteLabel: labels.bulkDeleteHint.replace(
      '{count}',
      String(selectedCount),
    ),
    toggleSelection,
    toggleAllSelection,
    clearSelection,
    deleteSelectedBloggers,
    isBulkDeleting,
    updateFilters,
    resetFilters,
    goToPage,
  };
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
