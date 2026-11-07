import { useEffect, useState } from 'react';
import { IoFilterOutline } from 'react-icons/io5';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../../shared/components/ui/Select/Select';
import TagSelector from '../../../../../shared/components/ui/TagSelector/TagSelector';
import type { AdminTranslations } from '../../../translations';
import type { BloggerFilters } from '../hooks/useBloggerAdmin';
import styles from './BloggerToolbar.module.css';

type Props = {
  labels: AdminTranslations;
  filters: BloggerFilters;
  onFilterChange: (next: Partial<BloggerFilters>) => void;
  onReset: () => void;
  total: number;
};

export default function BloggerToolbar({
  labels,
  filters,
  onFilterChange,
  onReset,
  total,
}: Props) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);

  const hasFilters = Boolean(filters.q || filters.published !== undefined);
  const activeFilterCount = [filters.q, filters.published].filter(
    (value) => value !== '' && value !== undefined,
  ).length;

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
    setDraftFilters({ q: '', published: undefined });
  };

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
            {labels.bloggerFilterButton}
            {activeFilterCount > 0 ? (
              <span className={styles.filterCount}>{activeFilterCount}</span>
            ) : null}
          </Button>
        </div>

        {hasFilters ? (
          <div className={styles.activeFilters}>
            {filters.q ? (
              <TagSelector
                label={`q: ${filters.q}`}
                onRemove={() => onFilterChange({ q: '' })}
                removeLabel={labels.bloggerResetFilters}
              />
            ) : null}
            {filters.published !== undefined ? (
              <TagSelector
                label={`${labels.bloggerEnabledFilterLabel}: ${filters.published ? labels.bloggerEnabled : labels.bloggerDisabled}`}
                onRemove={() => onFilterChange({ published: undefined })}
                removeLabel={labels.bloggerResetFilters}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog
        isOpen={isFilterOpen}
        title={labels.bloggerFilterTitle}
        onClose={() => setIsFilterOpen(false)}
        closeLabel={labels.dialogCloseLabel}
        size="md"
        footer={
          <div className={styles.filterFooter}>
            <Button type="button" variant="secondary" onClick={resetAllFilters}>
              {labels.bloggerResetFilters}
            </Button>
            <Button type="button" variant="primary" onClick={applyFilters}>
              {labels.bloggerShowResults.replace('{count}', String(total))}
            </Button>
          </div>
        }
      >
        <div className={styles.filterFields}>
          <InputField
            label={labels.bloggerSearchLabel}
            value={draftFilters.q}
            onChange={(value) =>
              setDraftFilters((current) => ({ ...current, q: value }))
            }
            placeholder={labels.bloggerSearchPlaceholder}
          />
          <Select
            label={labels.bloggerEnabledFilterLabel}
            value={
              draftFilters.published === undefined
                ? ''
                : String(draftFilters.published)
            }
            options={[
              { value: '', label: labels.bloggerAllStatuses },
              { value: 'true', label: labels.bloggerEnabled },
              { value: 'false', label: labels.bloggerDisabled },
            ]}
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                published: value === '' ? undefined : value === 'true',
              }))
            }
          />
        </div>
      </Dialog>
    </>
  );
}
