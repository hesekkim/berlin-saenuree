import { useCallback, useEffect, useState } from 'react';

export function useTrashPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.max(1, Math.min(nextPage, pageCount)));
    },
    [pageCount],
  );

  return {
    page: currentPage,
    pageCount,
    pageItems: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    goToPage,
  };
}
