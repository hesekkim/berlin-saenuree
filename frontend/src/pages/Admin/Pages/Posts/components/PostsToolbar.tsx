import { useEffect, useState } from 'react';
import { IoFilterOutline, IoGridOutline, IoListOutline } from 'react-icons/io5';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../../shared/components/ui/Select/Select';
import TagSelector from '../../../../../shared/components/ui/TagSelector/TagSelector';
import type { AdminTranslations } from '../../../translations';
import { usePostFilterCount } from '../hooks/usePostFilterCount';
import styles from '../Posts.module.css';

export type PostsFilters = {
  q: string;
  createdBy: string;
  from: string;
  to: string;
  published: boolean | undefined;
  pinned: boolean | undefined;
};

type Props = {
  filters: PostsFilters;
  labels: AdminTranslations;
  view: 'grid' | 'list';
  total: number;
  onFilterChange: (next: Partial<PostsFilters>) => void;
  onReset: () => void;
  onViewChange: (view: 'grid' | 'list') => void;
};

export default function PostsToolbar({
  filters,
  labels,
  view,
  total,
  onFilterChange,
  onReset,
  onViewChange,
}: Props) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const previewCount = usePostFilterCount(draftFilters, isFilterOpen, total);
  const hasFilters = Boolean(
    filters.q ||
    filters.createdBy ||
    filters.from ||
    filters.to ||
    filters.published !== undefined ||
    filters.pinned !== undefined,
  );
  const activeFilterCount = [
    filters.q,
    filters.createdBy,
    filters.from,
    filters.to,
    filters.published,
    filters.pinned,
  ].filter((value) => value !== '' && value !== undefined).length;
  const updateDraftFilters = (next: Partial<PostsFilters>) => {
    setDraftFilters((current) => ({ ...current, ...next }));
  };

  useEffect(() => {
    if (isFilterOpen) {
      setDraftFilters(filters);
    }
  }, [filters, isFilterOpen]);

  const applyFilters = () => {
    onFilterChange(draftFilters);
    setIsFilterOpen(false);
  };

  const resetAllFilters = () => {
    onReset();
    setDraftFilters({
      q: '',
      createdBy: '',
      from: '',
      to: '',
      published: undefined,
      pinned: undefined,
    });
  };

  const renderFilterFields = (
    currentFilters: PostsFilters,
    onChange: (next: Partial<PostsFilters>) => void,
  ) => (
    <div className={styles.filterFields}>
      <InputField
        label={labels.postsSearchLabel}
        value={currentFilters.q}
        onChange={(value) => onChange({ q: value })}
        placeholder={labels.postsSearchPlaceholder}
      />
      <InputField
        label={labels.postsAuthorLabel}
        value={currentFilters.createdBy}
        onChange={(value) => onChange({ createdBy: value })}
        placeholder={labels.postsAuthorFilterPlaceholder}
      />
      <InputField
        label={labels.postsFromLabel}
        type="date"
        value={currentFilters.from}
        onChange={(value) => onChange({ from: value })}
      />
      <InputField
        label={labels.postsToLabel}
        type="date"
        value={currentFilters.to}
        onChange={(value) => onChange({ to: value })}
      />
      <Select
        label={labels.postsEnabledFilterLabel}
        value={
          currentFilters.published === undefined
            ? ''
            : String(currentFilters.published)
        }
        options={[
          { value: '', label: labels.postsAllStatuses },
          { value: 'true', label: labels.postsPublishedLabel },
          { value: 'false', label: labels.postsUnpublishedBadge },
        ]}
        onChange={(value) =>
          onChange({ published: value === '' ? undefined : value === 'true' })
        }
      />
      <Select
        label={labels.postsPinnedFilterLabel}
        value={
          currentFilters.pinned === undefined
            ? ''
            : String(currentFilters.pinned)
        }
        options={[
          { value: '', label: labels.postsAllPinned },
          { value: 'true', label: labels.postsPinnedLabel },
          { value: 'false', label: labels.postsNotPinned },
        ]}
        onChange={(value) =>
          onChange({ pinned: value === '' ? undefined : value === 'true' })
        }
      />
    </div>
  );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <Button
            type="button"
            variant="secondary"
            icon={<IoFilterOutline />}
            onClick={() => setIsFilterOpen(true)}
          >
            {labels.postsFilterButton}
            {activeFilterCount > 0 ? (
              <span className={styles.filterCount}>{activeFilterCount}</span>
            ) : null}
          </Button>
          <div
            className={styles.viewToggle}
            role="group"
            aria-label={labels.postsViewLabel}
          >
            <button
              type="button"
              className={
                view === 'grid' ? styles.viewButtonActive : styles.viewButton
              }
              onClick={() => onViewChange('grid')}
              aria-label={labels.postsGridView}
              title={labels.postsGridView}
            >
              <IoGridOutline aria-hidden />
            </button>
            <button
              type="button"
              className={
                view === 'list' ? styles.viewButtonActive : styles.viewButton
              }
              onClick={() => onViewChange('list')}
              aria-label={labels.postsListView}
              title={labels.postsListView}
            >
              <IoListOutline aria-hidden />
            </button>
          </div>
        </div>
        {hasFilters ? (
          <div className={styles.activeFilters}>
            {filters.q ? (
              <TagSelector
                label={`q: ${filters.q}`}
                onRemove={() => onFilterChange({ q: '' })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
            {filters.createdBy ? (
              <TagSelector
                label={filters.createdBy}
                onRemove={() => onFilterChange({ createdBy: '' })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
            {filters.from ? (
              <TagSelector
                label={`${labels.postsFromLabel}: ${filters.from}`}
                onRemove={() => onFilterChange({ from: '' })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
            {filters.to ? (
              <TagSelector
                label={`${labels.postsToLabel}: ${filters.to}`}
                onRemove={() => onFilterChange({ to: '' })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
            {filters.published !== undefined ? (
              <TagSelector
                label={`${labels.postsEnabledFilterLabel}: ${filters.published ? labels.postsPublishedLabel : labels.postsUnpublishedBadge}`}
                onRemove={() => onFilterChange({ published: undefined })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
            {filters.pinned !== undefined ? (
              <TagSelector
                label={`${labels.postsPinnedFilterLabel}: ${filters.pinned ? labels.postsPinnedLabel : labels.postsNotPinned}`}
                onRemove={() => onFilterChange({ pinned: undefined })}
                removeLabel={labels.postsResetFilters}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <Dialog
        isOpen={isFilterOpen}
        title={labels.postsFilterTitle}
        onClose={() => setIsFilterOpen(false)}
        closeLabel={labels.dialogCloseLabel}
        size="md"
        footer={
          <div className={styles.filterFooter}>
            <Button type="button" variant="secondary" onClick={resetAllFilters}>
              {labels.postsResetFilters}
            </Button>
            <Button type="button" variant="primary" onClick={applyFilters}>
              {labels.postsShowResults.replace('{count}', String(previewCount))}
            </Button>
          </div>
        }
      >
        {renderFilterFields(draftFilters, updateDraftFilters)}
      </Dialog>
    </>
  );
}
