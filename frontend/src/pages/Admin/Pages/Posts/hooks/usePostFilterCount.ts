import { useEffect, useState } from 'react';
import { fetchAdminPosts } from '../../../../../shared/api/postsApi';
import type { PostsFilters } from '../components/PostsToolbar';

export function usePostFilterCount(
  filters: PostsFilters,
  enabled: boolean,
  fallback: number,
): number {
  const [count, setCount] = useState(fallback);
  const [debouncedQuery, setDebouncedQuery] = useState(filters.q);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.q), 400);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    if (!enabled) {
      setCount(fallback);
      return undefined;
    }

    let active = true;
    void fetchAdminPosts({
      limit: 1,
      offset: 0,
      q: debouncedQuery,
      created_by: filters.createdBy,
      from: filters.from,
      to: filters.to,
      published: filters.published,
      pinned: filters.pinned,
    })
      .then((result) => {
        if (active) {
          setCount(result.total);
        }
      })
      .catch(() => {
        if (active) {
          setCount(fallback);
        }
      });

    return () => {
      active = false;
    };
  }, [
    debouncedQuery,
    enabled,
    fallback,
    filters.createdBy,
    filters.from,
    filters.to,
    filters.published,
    filters.pinned,
  ]);

  return count;
}
