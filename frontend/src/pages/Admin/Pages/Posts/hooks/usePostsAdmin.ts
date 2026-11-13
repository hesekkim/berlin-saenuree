import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import {
  deleteAdminPost,
  fetchAdminPosts,
  updateAdminPost,
  type PostResponse,
} from '../../../../../shared/api/postsApi';
import { richHtmlPlainText } from '../../../../../shared/lib/richText';
import { adminTranslations } from '../../../translations';
import { usePageSelection } from '../../../hooks/usePageSelection';
import { canCreatePost, canMutatePost, canPinPost } from '../utils/postsAccess';
import { resolvePostCopy } from '../utils/resolvePostCopy';
import type { PostsFilters } from '../components/PostsToolbar';

export const POSTS_PAGE_SIZE = 30;
export const POSTS_LIST_PAGE_SIZE = 10;

function getPageSize(view: 'grid' | 'list') {
  return view === 'list' ? POSTS_LIST_PAGE_SIZE : POSTS_PAGE_SIZE;
}

function readFilters(): PostsFilters {
  const params = new URLSearchParams(window.location.search);
  const booleanParam = (key: string) => {
    const value = params.get(key);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  };
  return {
    q: params.get('q') ?? '',
    createdBy: params.get('created_by') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    published: booleanParam('published'),
    pinned: booleanParam('pinned'),
  };
}

function writeFilters(filters: PostsFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.createdBy.trim())
    params.set('created_by', filters.createdBy.trim());
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.published !== undefined)
    params.set('published', String(filters.published));
  if (filters.pinned !== undefined)
    params.set('pinned', String(filters.pinned));
  const next = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${next ? `?${next}` : ''}`,
  );
}

function isPostResponse(value: unknown): value is PostResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'contentRevision' in value &&
    'images' in value
  );
}

export function usePostsAdmin() {
  const { email, role } = useAuth();
  const { language } = useCmsConfig();
  const { defaultLanguage } = useConfig();
  const toast = useToast();
  const labels = adminTranslations[language];
  const labelsRef = useRef(labels);
  const toastRef = useRef(toast);
  labelsRef.current = labels;
  toastRef.current = toast;

  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(POSTS_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  /** Kept outside the paged list so pin refresh cannot close the dialog. */
  const [detailPost, setDetailPost] = useState<PostResponse | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [filters, setFilters] = useState<PostsFilters>(readFilters);
  const [debouncedQuery, setDebouncedQuery] = useState(filters.q);
  const requestIdRef = useRef(0);
  const [view, setView] = useState<'grid' | 'list'>(() =>
    localStorage.getItem('posts-view') === 'list' ? 'list' : 'grid',
  );
  const {
    selectedIds,
    toggle: toggleSelection,
    toggleAll: toggleAllSelection,
    clear: clearSelection,
    replace: replaceSelection,
  } = usePageSelection();
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const canCreate = canCreatePost(role);
  const canPin = canPinPost(role);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const isQueryPending = filters.q !== debouncedQuery;
  const canMutate = useCallback(
    (post: Pick<PostResponse, 'createdBy'>) => canMutatePost(role, email, post),
    [email, role],
  );
  const selectablePosts = useMemo(
    () => posts.filter(canMutate),
    [canMutate, posts],
  );
  const selectedCount = selectablePosts.filter((post) =>
    selectedIds.has(post.id),
  ).length;
  const allSelected =
    selectablePosts.length > 0 && selectedCount === selectablePosts.length;
  const indeterminate = selectedCount > 0 && !allSelected;
  const canSelectAny = selectablePosts.length > 0;
  const togglePageSelection = useCallback(
    (checked: boolean) =>
      toggleAllSelection(
        selectablePosts.map((post) => post.id),
        checked,
      ),
    [selectablePosts, toggleAllSelection],
  );
  const listItems = useMemo(
    () =>
      posts.map((post) => {
        const copy = resolvePostCopy(post.copies, language, defaultLanguage);
        const title =
          richHtmlPlainText(copy.body).split(/\r?\n/)[0] ||
          labels.postsCaptionEmpty;
        const date = new Date(post.createdAt).toLocaleDateString(
          language.trim() || 'en',
        );
        const statusLabel = post.published
          ? labels.postsPublishedBadge
          : labels.postsUnpublishedBadge;
        const statusType: 'published' | 'unpublished' = post.published
          ? 'published'
          : 'unpublished';
        const imageCountLabel = labels.postsTileMulti.replace(
          '{count}',
          String(post.media.length),
        );

        return {
          post,
          title,
          date,
          statusLabel,
          statusType,
          imageCountLabel,
          canSelect: canMutate(post),
          selectLabel: labels.postsBulkSelectItem.replace(
            '{title}',
            title || labels.postsCaptionEmpty,
          ),
          ariaLabel: [
            title,
            post.createdBy,
            date,
            imageCountLabel,
            ...(post.pinned ? [labels.postsPinnedLabel] : []),
            statusLabel,
          ].join(', '),
        };
      }),
    [canMutate, defaultLanguage, labels, language, posts],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.q), 400);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    writeFilters(filters);
  }, [filters]);

  useEffect(() => {
    const handlePopState = () => {
      setFilters(readFilters());
      setPage(1);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const activeFilters = useMemo(
    () => ({ ...filters, q: debouncedQuery }),
    [debouncedQuery, filters],
  );

  const loadPage = useCallback(
    async (
      requestedPage: number,
      requestedFilters: PostsFilters = activeFilters,
    ) => {
      const requestId = ++requestIdRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoadMoreFailed(false);
      clearSelection();
      setLoading(true);
      try {
        const pageSize = getPageSize(view);
        const fetchPage = (pageNumber: number) =>
          fetchAdminPosts({
            limit: pageSize,
            offset: (pageNumber - 1) * pageSize,
            q: requestedFilters.q,
            created_by: requestedFilters.createdBy,
            from: requestedFilters.from,
            to: requestedFilters.to,
            published: requestedFilters.published,
            pinned: requestedFilters.pinned,
          });

        let result = await fetchPage(requestedPage);
        if (requestId !== requestIdRef.current) {
          return;
        }

        let resolvedPage = Math.min(
          requestedPage,
          Math.max(
            1,
            Math.ceil(result.total / (result.limit || pageSize)),
          ),
        );
        if (resolvedPage !== requestedPage) {
          result = await fetchPage(resolvedPage);
          if (requestId !== requestIdRef.current) {
            return;
          }
          resolvedPage = Math.min(
            resolvedPage,
            Math.max(
              1,
              Math.ceil(result.total / (result.limit || pageSize)),
            ),
          );
        }

        setPosts(result.items);
        setTotal(result.total);
        setLimit(result.limit || pageSize);
        setPage(resolvedPage);
        setDetailPost((current) => {
          if (!current) {
            return null;
          }
          return result.items.find((post) => post.id === current.id) ?? current;
        });
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        toastRef.current.error(labelsRef.current.postsLoadFailed);
        setPosts([]);
        setTotal(0);
        setPage(1);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [activeFilters, clearSelection, view],
  );

  const loadNextPage = useCallback(async () => {
    if (
      view !== 'grid' ||
      loading ||
      loadingMoreRef.current ||
      isQueryPending ||
      page >= pageCount
    ) {
      return;
    }

    const requestId = requestIdRef.current;
    const nextPage = page + 1;
    const pageSize = getPageSize(view);
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const result = await fetchAdminPosts({
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
        q: activeFilters.q,
        created_by: activeFilters.createdBy,
        from: activeFilters.from,
        to: activeFilters.to,
        published: activeFilters.published,
        pinned: activeFilters.pinned,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setPosts((current) => {
        const existingIds = new Set(current.map((post) => post.id));
        return [
          ...current,
          ...result.items.filter((post) => !existingIds.has(post.id)),
        ];
      });
      setTotal(result.total);
      setLimit(result.limit || pageSize);
      setPage(nextPage);
      setLoadMoreFailed(false);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setLoadMoreFailed(true);
      toastRef.current.error(labelsRef.current.postsLoadFailed);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [
    activeFilters,
    isQueryPending,
    loading,
    page,
    pageCount,
    view,
  ]);

  const refreshList = useCallback(async () => {
    await loadPage(view === 'grid' ? 1 : page, activeFilters);
  }, [activeFilters, loadPage, page, view]);

  useEffect(() => {
    if (view === 'grid' && page !== 1) {
      return;
    }
    void loadPage(page, activeFilters);
  }, [activeFilters, loadPage, page, view]);

  const updateFilters = useCallback((next: Partial<PostsFilters>) => {
    setFilters((current) => {
      const updated = { ...current, ...next };
      writeFilters(updated);
      window.history.pushState(null, '', window.location.href);
      return updated;
    });
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    const updated = {
      q: '',
      createdBy: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    };
    writeFilters(updated);
    window.history.pushState(null, '', window.location.pathname);
    setFilters(updated);
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (isQueryPending) {
        return;
      }
      setPage(Math.max(1, Math.min(nextPage, pageCount)));
    },
    [isQueryPending, pageCount],
  );

  const updateView = useCallback(
    (next: 'grid' | 'list') => {
      clearSelection();
      setPage(1);
      setView(next);
      localStorage.setItem('posts-view', next);
    },
    [clearSelection],
  );

  const openDetail = useCallback((post: PostResponse) => {
    setDetailPost(post);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailPost(null);
  }, []);

  const openCreate = useCallback(() => {
    setIsComposerOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setIsComposerOpen(false);
  }, []);

  const applyPostUpdate = useCallback((updated: PostResponse) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === updated.id ? updated : post)),
    );
    setDetailPost((current) =>
      current?.id === updated.id ? updated : current,
    );
  }, []);

  const togglePin = useCallback(async () => {
    if (!detailPost || isPinning || !canPin) {
      return;
    }
    setIsPinning(true);
    try {
      const updated = await updateAdminPost(detailPost.id, {
        published: detailPost.published,
        pinned: !detailPost.pinned,
        contentRevision: detailPost.contentRevision,
        media: detailPost.media,
        copies: detailPost.copies,
      });
      applyPostUpdate(updated);
      await refreshList();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const current = error.response.data;
        toastRef.current.error(labelsRef.current.postsPinConflict);
        if (isPostResponse(current)) {
          applyPostUpdate(current);
        }
        await refreshList();
      } else {
        toastRef.current.error(labelsRef.current.postsPinFailed);
      }
    } finally {
      setIsPinning(false);
    }
  }, [applyPostUpdate, canPin, detailPost, isPinning, refreshList]);

  const openEdit = useCallback(() => {
    if (!detailPost || !canMutate(detailPost)) {
      toastRef.current.error(labelsRef.current.postsForbidden);
      return;
    }
    setIsEditOpen(true);
  }, [canMutate, detailPost]);

  const closeEdit = useCallback(() => {
    setIsEditOpen(false);
  }, []);

  const openDelete = useCallback(() => {
    if (!detailPost || !canMutate(detailPost)) {
      toastRef.current.error(labelsRef.current.postsForbidden);
      return;
    }
    setIsDeleteOpen(true);
  }, [canMutate, detailPost]);

  const closeDelete = useCallback(() => {
    setIsDeleteOpen(false);
  }, []);

  const deleteCurrentPost = useCallback(async () => {
    if (!detailPost) {
      return;
    }
    try {
      await deleteAdminPost(detailPost.id);
      closeDelete();
      closeDetail();
      toastRef.current.info(labelsRef.current.postsDeleteSuccess);
      await refreshList();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        toastRef.current.error(labelsRef.current.postsForbidden);
        await refreshList();
        return;
      }
      toastRef.current.error(labelsRef.current.postsDeleteFailed);
    }
  }, [closeDelete, closeDetail, detailPost, refreshList]);

  const deleteSelectedPosts = useCallback(
    async (ids: string[]) => {
      const targets = posts.filter(
        (post) => ids.includes(post.id) && canMutate(post),
      );
      if (targets.length === 0 || isBulkDeleting) {
        return [];
      }

      setIsBulkDeleting(true);
      try {
        const results = await Promise.allSettled(
          targets.map((post) => deleteAdminPost(post.id)),
        );
        const failedIds = targets.flatMap((post, index) =>
          results[index].status === 'rejected' ? [post.id] : [],
        );
        await loadPage(page, activeFilters);
        replaceSelection(failedIds);

        const successCount = targets.length - failedIds.length;
        const message =
          failedIds.length === targets.length
            ? labelsRef.current.postsBulkDeleteFailure.replace(
                '{count}',
                String(failedIds.length),
              )
            : failedIds.length > 0
              ? labelsRef.current.postsBulkDeletePartial
                  .replace('{success}', String(successCount))
                  .replace('{failed}', String(failedIds.length))
              : labelsRef.current.postsBulkDeleteSuccess.replace(
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
      canMutate,
      isBulkDeleting,
      loadPage,
      page,
      posts,
      replaceSelection,
      labelsRef,
    ],
  );

  const reload = useCallback(
    async (updated?: PostResponse) => {
      if (updated) {
        applyPostUpdate(updated);
      }
      await refreshList();
    },
    [applyPostUpdate, refreshList],
  );

  return {
    labels,
    language,
    filters,
    view,
    posts,
    total,
    page,
    pageCount,
    isQueryPending,
    loading,
    loadingMore,
    loadMoreFailed,
    hasMore: posts.length < total,
    canCreate,
    canPin,
    canMutate,
    listItems,
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
    deleteSelectedPosts,
    isBulkDeleting,
    detailPost,
    isComposerOpen,
    isEditOpen,
    isDeleteOpen,
    isPinning,
    openDetail,
    closeDetail,
    openCreate,
    closeCreate,
    openEdit,
    closeEdit,
    openDelete,
    closeDelete,
    deleteCurrentPost,
    togglePin,
    goToPage,
    loadNextPage,
    reload,
    updateFilters,
    resetFilters,
    updateView,
  };
}
