export function getPageCount(total: number, limit: number): number {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1;
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  if (safeTotal <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(safeTotal / safeLimit));
}

export function clampPage(page: number, totalPages: number): number {
  const safeTotalPages = Number.isFinite(totalPages)
    ? Math.max(1, totalPages)
    : 1;
  const safePage = Number.isFinite(page) ? page : 1;
  return Math.min(Math.max(1, safePage), safeTotalPages);
}

export function getPageOffset(page: number, limit: number): number {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1;
  const safePage = clampPage(
    page,
    getPageCount(Number.MAX_SAFE_INTEGER, safeLimit),
  );
  return (safePage - 1) * safeLimit;
}

export function adjustPageAfterMutation(
  page: number,
  total: number,
  limit: number,
): number {
  const totalPages = getPageCount(total, limit);
  return clampPage(page, totalPages);
}
