import ConfirmDialog from '../../../../../shared/components/ui/ConfirmDialog/ConfirmDialog';
import type { PostResponse } from '../../../../../shared/api/postsApi';
import type { AdminTranslations } from '../../../translations';
import styles from './PostComposerDialog.module.css';

type PostDeleteDialogProps = {
  post: PostResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  labels: AdminTranslations;
  language: string;
};

function formatCreatedAt(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleString(language);
  } catch {
    return iso;
  }
}

export default function PostDeleteDialog({
  post,
  isOpen,
  onClose,
  onConfirm,
  labels,
  language,
}: PostDeleteDialogProps) {
  if (!post) {
    return null;
  }

  const message = labels.postsDeleteConfirm
    ? labels.postsDeleteConfirm
        .replace('{count}', String(post.media.length))
        .replace('{createdAt}', formatCreatedAt(post.createdAt, language))
    : `Move this post to trash? It includes ${post.media.length} media item(s).`;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={labels.postsDeleteTitle ?? 'Move to trash'}
      onClose={onClose}
      onConfirm={onConfirm}
      closeLabel={labels.dialogCloseLabel}
      cancelLabel={labels.emailsCancel}
      confirmLabel={labels.postsDeleteConfirmAction ?? labels.postsDelete}
    >
      <p className={styles.confirmMessage}>{message}</p>
    </ConfirmDialog>
  );
}
