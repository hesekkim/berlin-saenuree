import { useEffect, useState } from 'react';
import { BsPinAngleFill } from 'react-icons/bs';
import { IoCopy, IoVideocam } from 'react-icons/io5';
import Button from '../../../../shared/components/ui/Button/Button';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import {
  mediaFileAbsoluteUrl,
  mediaImageAbsoluteUrl,
} from '../../../../shared/api/mediaApi';
import { useConfig } from '../../../../shared/context/ConfigContext';
import StatusTag from '../../../../shared/components/ui/StatusTag/StatusTag';
import type { PostResponse } from '../../../../shared/api/postsApi';
import { seekVideoToPreviewFrame } from '../../../../shared/lib/videoPreview';
import PostComposerDialog from './components/PostComposerDialog';
import PostDeleteDialog from './components/PostDeleteDialog';
import PostDetailDialog from './components/PostDetailDialog';
import PostEditDialog from './components/PostEditDialog';
import BulkDeleteDialog from '../../components/BulkDeleteDialog';
import { usePostsAdmin } from './hooks/usePostsAdmin';
import styles from './Posts.module.css';
import PostsListView from './components/PostsListView';
import PostsToolbar from './components/PostsToolbar';

function tileAriaLabel(
  post: PostResponse,
  labels: {
    postsTileLabel: string;
    postsTilePinned: string;
    postsTileMulti: string;
    postsUnpublishedBadge: string;
  },
): string {
  const parts = [labels.postsTileLabel];
  if (post.pinned) {
    parts.push(labels.postsTilePinned);
  }
  if (post.media.length > 1) {
    parts.push(
      labels.postsTileMulti.replace('{count}', String(post.media.length)),
    );
  }
  if (!post.published) {
    parts.push(labels.postsUnpublishedBadge);
  }
  return parts.join(', ');
}

export default function Posts() {
  const { availableLanguages } = useConfig();
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const {
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
    hasMore,
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
    selectedCountLabel,
    bulkDeleteLabel,
    toggleSelection,
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
  } = usePostsAdmin();
  const [gridSentinel, setGridSentinel] = useState<HTMLDivElement | null>(null);
  const [isGridSentinelIntersecting, setIsGridSentinelIntersecting] =
    useState(false);

  useEffect(() => {
    if (view !== 'grid' || !gridSentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsGridSentinelIntersecting(entry.isIntersecting);
      },
      { rootMargin: '400px' },
    );
    observer.observe(gridSentinel);
    return () => observer.disconnect();
  }, [gridSentinel, view]);

  useEffect(() => {
    if (
      view !== 'grid' ||
      !isGridSentinelIntersecting ||
      !hasMore ||
      loading ||
      loadingMore ||
      loadMoreFailed ||
      isQueryPending
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadNextPage();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    hasMore,
    isGridSentinelIntersecting,
    isQueryPending,
    loadMoreFailed,
    loadNextPage,
    loading,
    loadingMore,
    view,
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{labels.postsTitle}</h1>
            {!loading ? (
              <p className={styles.total}>
                {labels.postsTotal.replace('{count}', String(total))}
              </p>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            {canCreate ? (
              <Button
                type="button"
                variant="primary"
                className={styles.headerAction}
                onClick={openCreate}
                disabled={loading}
              >
                {labels.postsAdd}
              </Button>
            ) : null}
          </div>
        </div>
        <p className={styles.subtitle}>{labels.postsSubtitle}</p>
      </header>

      <PostsToolbar
        filters={filters}
        labels={labels}
        view={view}
        total={total}
        onFilterChange={updateFilters}
        onReset={resetFilters}
        onViewChange={updateView}
      />

      {loading ? (
        <div className={styles.loadingState}>
          <LoadingSpinner text={labels.postsLoading} />
        </div>
      ) : posts.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>
            {filters.q ||
            filters.createdBy ||
            filters.from ||
            filters.to ||
            filters.published !== undefined ||
            filters.pinned !== undefined
              ? labels.postsFilteredEmpty
              : labels.postsEmpty}
          </p>
        </div>
      ) : (
        <>
          {view === 'list' ? (
            <PostsListView
              items={listItems}
              labels={labels}
              onOpen={openDetail}
              selectedIds={selectedIds}
              canSelectAny={canSelectAny}
              onToggleSelection={toggleSelection}
              allSelected={allSelected}
              indeterminate={indeterminate}
              selectedCount={selectedCount}
              selectedCountLabel={selectedCountLabel}
              bulkDeleteLabel={bulkDeleteLabel}
              onTogglePageSelection={togglePageSelection}
              onDeleteSelected={() => setIsBulkDeleteOpen(true)}
            />
          ) : (
            <>
              <ul className={styles.grid}>
                {posts.map((post) => {
                  const cover = post.media[0];
                  const tileClass = [
                    styles.tile,
                    !post.published ? styles.tileDisabled : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <li key={post.id}>
                      <button
                        type="button"
                        className={tileClass}
                        aria-label={tileAriaLabel(post, labels)}
                        onClick={() => openDetail(post)}
                      >
                        {cover?.type === 'image' ? (
                          <img
                            className={styles.thumb}
                            src={mediaImageAbsoluteUrl(cover.imageId, 'thumb')}
                            alt=""
                            draggable={false}
                            loading="lazy"
                          />
                        ) : cover?.type === 'video' ? (
                          <video
                            className={styles.thumb}
                            src={mediaFileAbsoluteUrl(
                              `/api/v1/media/files/${cover.fileId}`,
                            )}
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(event) =>
                              seekVideoToPreviewFrame(event.currentTarget)
                            }
                          />
                        ) : null}
                        {post.media.some((item) => item.type === 'video') ? (
                          <span
                            className={styles.videoIndicator}
                            aria-hidden="true"
                          >
                            <IoVideocam className={styles.videoIcon} />
                          </span>
                        ) : post.media.length > 1 ? (
                          <IoCopy className={styles.multiIcon} aria-hidden />
                        ) : null}
                        {post.pinned ? (
                          <BsPinAngleFill
                            className={styles.pinIcon}
                            aria-hidden
                          />
                        ) : null}
                        {!post.published ? (
                          <StatusTag
                            className={styles.disabledBadge}
                            type="unpublished"
                            label={labels.postsUnpublishedBadge}
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <div
                  ref={setGridSentinel}
                  className={styles.loadMoreSentinel}
                >
                  {loadingMore ? (
                    <LoadingSpinner size="small" text={labels.postsLoading} />
                  ) : loadMoreFailed ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void loadNextPage()}
                    >
                      {labels.postsLoadMoreRetry}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {view === 'list' ? (
            <nav
              className={styles.pagination}
              aria-label={labels.postsPaginationLabel}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading || isQueryPending}
              >
                {labels.postsPagePrevious}
              </Button>
              <span className={styles.paginationLabel}>
                {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pageCount || loading || isQueryPending}
              >
                {labels.postsPageNext}
              </Button>
            </nav>
          ) : null}
        </>
      )}

      <PostDetailDialog
        post={detailPost}
        isOpen={Boolean(detailPost)}
        language={language}
        labels={labels}
        canPin={canPin}
        canMutate={detailPost ? canMutate(detailPost) : false}
        isPinning={isPinning}
        onClose={closeDetail}
        onTogglePin={() => void togglePin()}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      <PostEditDialog
        post={detailPost}
        isOpen={isEditOpen}
        onClose={closeEdit}
        onSaved={reload}
        onForbidden={reload}
        labels={labels}
        language={language}
        availableLanguages={availableLanguages}
      />

      <PostDeleteDialog
        post={detailPost}
        isOpen={isDeleteOpen}
        onClose={closeDelete}
        onConfirm={async () => {
          await deleteCurrentPost();
        }}
        labels={labels}
        language={language}
      />

      <BulkDeleteDialog
        isOpen={isBulkDeleteOpen}
        isBusy={isBulkDeleting}
        title={labels.postsBulkDeleteTitle}
        message={labels.postsBulkDeleteConfirm.replace(
          '{count}',
          String(selectedCount),
        )}
        closeLabel={labels.dialogCloseLabel}
        cancelLabel={labels.bulkDeleteCancel}
        confirmLabel={labels.postsDeleteConfirmAction}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={async () => {
          setIsBulkDeleteOpen(false);
          await deleteSelectedPosts([...selectedIds]);
        }}
      />

      <PostComposerDialog
        isOpen={isComposerOpen}
        onClose={closeCreate}
        onPublished={reload}
        labels={labels}
        adminLanguage={language}
        availableLanguages={availableLanguages}
      />
    </div>
  );
}
