import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../shared/components/ui/Button/Button';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import { adminTranslations } from '../../translations';
import BulkDeleteDialog from '../../components/BulkDeleteDialog';
import { useBloggerAdmin } from './hooks/useBloggerAdmin';
import BloggerToolbar from './components/BloggerToolbar';
import BloggerListView from './components/BloggerListView';
import styles from './Blogger.module.css';

export default function BloggerPage() {
  const navigate = useNavigate();
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const {
    myDraft,
    total,
    loading,
    page,
    pageCount,
    language,
    filters,
    canCreate,
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
    selectedCountLabel,
    bulkDeleteLabel,
    toggleSelection,
    deleteSelectedBloggers,
    isBulkDeleting,
    updateFilters,
    resetFilters,
    goToPage,
  } = useBloggerAdmin();
  const labels = adminTranslations[language];

  return (
    <main className={`cms-theme ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{labels.bloggerTitle}</h1>
            {!loading ? <p className={styles.total}>{total}</p> : null}
          </div>
          <div className={styles.headerActions}>
            {canCreate ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate('/admin/pages/blogger/new')}
                disabled={loading}
              >
                {myDraft ? labels.bloggerContinueDraft : labels.bloggerAdd}
              </Button>
            ) : null}
          </div>
        </div>
        <p className={styles.subtitle}>{labels.bloggerSubtitle}</p>
      </header>

      <BloggerToolbar
        labels={labels}
        filters={filters}
        total={total}
        onFilterChange={updateFilters}
        onReset={resetFilters}
      />

      {loading ? (
        <div className={styles.loadingState}>
          <LoadingSpinner text={labels.bloggerLoading} />
        </div>
      ) : isEmpty ? (
        <div className={styles.emptyState}>
          <p className={styles.empty}>{labels.bloggerEmpty}</p>
        </div>
      ) : (
        <>
          <BloggerListView
            items={listItems}
            draft={draftItem}
            showDraft={showDraft}
            onOpen={(item) => navigate(`/admin/pages/blogger/${item.id}`)}
            onOpenDraft={() => navigate('/admin/pages/blogger/new')}
            labels={labels}
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
          <nav
            className={styles.pagination}
            aria-label={labels.bloggerPaginationLabel}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              {labels.bloggerPrevious}
            </Button>
            <span className={styles.paginationLabel}>
              {page} / {pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
            >
              {labels.bloggerNext}
            </Button>
          </nav>
        </>
      )}

      <BulkDeleteDialog
        isOpen={isBulkDeleteOpen}
        isBusy={isBulkDeleting}
        title={labels.bloggerBulkDeleteTitle}
        message={labels.bloggerBulkDeleteConfirm.replace(
          '{count}',
          String(selectedCount),
        )}
        closeLabel={labels.dialogCloseLabel}
        cancelLabel={labels.bulkDeleteCancel}
        confirmLabel={labels.bulkDelete}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={async () => {
          setIsBulkDeleteOpen(false);
          await deleteSelectedBloggers([...selectedIds]);
        }}
      />
    </main>
  );
}
