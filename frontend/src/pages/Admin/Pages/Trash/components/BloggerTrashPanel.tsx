import { useState } from 'react';
import type { BloggerTrashItem } from '../../../../../shared/api/bloggerApi';
import Button from '../../../../../shared/components/ui/Button/Button';
import ConfirmDialog from '../../../../../shared/components/ui/ConfirmDialog/ConfirmDialog';
import LoadingSpinner from '../../../../../shared/components/LoadingSpinner/LoadingSpinner';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import type { AdminTranslations } from '../../../translations';
import BloggerTrashDetailDialog from '../../Blogger/components/BloggerTrashDetailDialog';
import { resolveBloggerCopy } from '../../Blogger/utils/resolveBloggerCopy';
import { useBloggerTrash } from '../hooks/useBloggerTrash';
import { useTrashPagination } from '../hooks/useTrashPagination';
import { formatRelativeDays } from '../utils/formatRelativeDays';
import styles from './BloggerTrashPanel.module.css';

const PAGE_SIZE = 10;

type Props = {
  labels: AdminTranslations;
  language: string;
};

export default function BloggerTrashPanel({ labels, language }: Props) {
  const { items, loading, restore, purge } = useBloggerTrash();
  const { defaultLanguage } = useConfig();
  const { page, pageCount, pageItems, goToPage } = useTrashPagination(
    items,
    PAGE_SIZE,
  );
  const [pending, setPending] = useState<BloggerTrashItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<BloggerTrashItem | null>(
    null,
  );

  if (loading) {
    return <LoadingSpinner size="medium" text={labels.bloggerTrashLoading} />;
  }

  if (items.length === 0) {
    return <p className={styles.empty}>{labels.bloggerTrashEmpty}</p>;
  }

  return (
    <>
      <ul className={styles.list}>
        {pageItems.map((item) => {
          const remainingDays = formatRelativeDays(item.expiresAt, language);
          return (
            <li className={styles.row} key={item.id}>
              <button
                type="button"
                className={styles.metaTrigger}
                onClick={() => setSelectedItem(item)}
                aria-label={labels.bloggerTrashDetailTitle}
              >
                <div className={styles.meta}>
                  <strong className={styles.caption}>
                    {resolveBloggerCopy(
                      item.blogger.copies,
                      language,
                      defaultLanguage,
                    ).title || labels.bloggerUntitled}
                  </strong>
                  <div className={styles.infoLine}>
                    <span>
                      {labels.trashDeletedBy}: {item.deletedBy}
                    </span>
                    <span>
                      {labels.trashDeletedAt}:{' '}
                      {new Date(item.deletedAt).toLocaleString(language)}
                    </span>
                  </div>
                  <div className={styles.infoLine}>
                    <span>
                      {labels.postsTrashRemaining}:{' '}
                      {remainingDays.prefix}
                      <span className={styles.remaining}>
                        {remainingDays.value}
                      </span>
                    </span>
                  </div>
                </div>
              </button>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => restore(item.id)}
                >
                  {labels.bloggerTrashRestore}
                </Button>
                <Button
                  type="button"
                  variant="ghost-danger"
                  onClick={() => setPending(item)}
                >
                  {labels.bloggerTrashPurge}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <nav className={styles.pagination} aria-label={labels.trashPagination}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          {labels.trashPrevious}
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
          {labels.trashNext}
        </Button>
      </nav>
      <BloggerTrashDetailDialog
        item={selectedItem}
        isOpen={selectedItem !== null}
        labels={labels}
        onClose={() => setSelectedItem(null)}
        onRestore={() => {
          if (selectedItem) restore(selectedItem.id);
          setSelectedItem(null);
        }}
        onPurge={() => {
          if (selectedItem) setPending(selectedItem);
          setSelectedItem(null);
        }}
      />
      <ConfirmDialog
        isOpen={pending !== null}
        title={labels.bloggerTrashPurgeTitle}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) purge(pending.id);
          setPending(null);
        }}
        closeLabel={labels.bloggerClose}
        cancelLabel={labels.bloggerCancel}
        confirmLabel={labels.bloggerTrashPurge}
      >
        {labels.bloggerTrashPurgeConfirm}
      </ConfirmDialog>
    </>
  );
}
