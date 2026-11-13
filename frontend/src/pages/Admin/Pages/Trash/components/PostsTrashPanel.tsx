import { useState } from 'react';
import type { PostTrashItem } from '../../../../../shared/api/postsApi';
import Button from '../../../../../shared/components/ui/Button/Button';
import ConfirmDialog from '../../../../../shared/components/ui/ConfirmDialog/ConfirmDialog';
import LoadingSpinner from '../../../../../shared/components/LoadingSpinner/LoadingSpinner';
import {
  mediaFileAbsoluteUrl,
  mediaImageAbsoluteUrl,
} from '../../../../../shared/api/mediaApi';
import type { AdminTranslations } from '../../../translations';
import PostDetailDialog from '../../Posts/components/PostDetailDialog';
import { usePostsTrash } from '../hooks/usePostsTrash';
import { useTrashPagination } from '../hooks/useTrashPagination';
import { formatRelativeDays } from '../utils/formatRelativeDays';
import styles from './PostsTrashPanel.module.css';

const PAGE_SIZE = 30;

type Props = {
  labels: AdminTranslations;
  language: string;
};

function formatCaptionText(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const withoutTags = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return withoutTags || ' ';
}

export default function PostsTrashPanel({ labels, language }: Props) {
  const { trashItems, loading, restoreTrashItem, purgeTrashItem } =
    usePostsTrash();
  const { page, pageCount, pageItems, goToPage } = useTrashPagination(
    trashItems,
    PAGE_SIZE,
  );
  const [selectedTrashItem, setSelectedTrashItem] =
    useState<PostTrashItem | null>(null);
  const [pendingPurgeItem, setPendingPurgeItem] =
    useState<PostTrashItem | null>(null);

  const requestPurge = (item: PostTrashItem) => {
    setPendingPurgeItem(item);
  };

  const confirmPurge = () => {
    if (!pendingPurgeItem) {
      return;
    }
    purgeTrashItem(pendingPurgeItem.id);
    setPendingPurgeItem(null);
  };

  if (loading) {
    return (
      <LoadingSpinner
        size="medium"
        text={labels.postsTrashLoading ?? 'Loading…'}
        className={styles.loadingSpinner}
      />
    );
  }

  if (trashItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.empty}>
          {labels.postsTrashEmpty ?? 'Trash is empty.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {pageItems.map((item) => {
          const cover = item.post.media[0];
          const thumb =
            cover?.type === 'image'
              ? mediaImageAbsoluteUrl(cover.imageId, 'thumb')
              : cover?.type === 'video'
                ? mediaFileAbsoluteUrl(`/api/v1/media/files/${cover.fileId}`)
                : '';
          const remainingDays = formatRelativeDays(item.expiresAt, language);
          const captionText = formatCaptionText(
            item.post.copies[language]?.body ??
              item.post.copies.en?.body ??
              item.post.copies.ko?.body ??
              labels.postsCaptionEmpty,
          );

          return (
            <li key={item.id} className={styles.row}>
              <button
                type="button"
                className={styles.mobileTrigger}
                onClick={() => setSelectedTrashItem(item)}
                aria-label={labels.postsDetailTitle}
              >
                {cover?.type === 'video' ? (
                  <video
                    className={styles.thumb}
                    src={thumb}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : thumb ? (
                  <img className={styles.thumb} src={thumb} alt="" />
                ) : (
                  <div className={styles.thumbPlaceholder} />
                )}
                <div className={styles.meta}>
                  <p className={styles.caption}>{captionText}</p>
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
                  onClick={() => restoreTrashItem(item.id)}
                >
                  {labels.postsTrashRestore ?? 'Restore'}
                </Button>
                <Button
                  type="button"
                  variant="ghost-danger"
                  onClick={() => requestPurge(item)}
                >
                  {labels.postsTrashPurge ?? 'Delete permanently'}
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
      <PostDetailDialog
        post={selectedTrashItem?.post ?? null}
        isOpen={selectedTrashItem !== null}
        language={language}
        labels={labels}
        canPin={false}
        canMutate={false}
        isPinning={false}
        onClose={() => setSelectedTrashItem(null)}
        onTogglePin={() => undefined}
        onEdit={() => undefined}
        onDelete={() => undefined}
        isTrash
        onRestore={() => {
          if (selectedTrashItem) {
            restoreTrashItem(selectedTrashItem.id);
            setSelectedTrashItem(null);
          }
        }}
        onPurge={() => {
          if (selectedTrashItem) {
            requestPurge(selectedTrashItem);
            setSelectedTrashItem(null);
          }
        }}
        restoreLabel={labels.postsTrashRestore ?? 'Restore'}
        purgeLabel={labels.postsTrashPurge ?? 'Delete permanently'}
      />
      <ConfirmDialog
        isOpen={pendingPurgeItem !== null}
        title={labels.postsTrashPurgeTitle ?? 'Delete post permanently'}
        onClose={() => setPendingPurgeItem(null)}
        onConfirm={confirmPurge}
        closeLabel={labels.dialogCloseLabel}
        cancelLabel={labels.emailsCancel}
        confirmLabel={
          labels.postsTrashPurgeConfirmAction ??
          labels.postsTrashPurge ??
          'Delete permanently'
        }
      >
        <p>
          {labels.postsTrashPurgeConfirm ??
            'Delete this post permanently? This action cannot be undone.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
