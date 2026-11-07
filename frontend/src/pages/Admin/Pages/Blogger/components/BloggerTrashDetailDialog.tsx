import type { BloggerTrashItem } from '../../../../../shared/api/bloggerApi';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import SanitizedRichText from '../../../../../shared/components/ui/SanitizedRichText/SanitizedRichText';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';
import { useConfig } from '../../../../../shared/context/ConfigContext';
import type { AdminTranslations } from '../../../translations';
import { resolveBloggerCopy } from '../utils/resolveBloggerCopy';
import styles from './BloggerTrashDetailDialog.module.css';

type Props = {
  item: BloggerTrashItem | null;
  isOpen: boolean;
  labels: AdminTranslations;
  onClose: () => void;
  onRestore: () => void;
  onPurge: () => void;
};

export default function BloggerTrashDetailDialog({
  item,
  isOpen,
  labels,
  onClose,
  onRestore,
  onPurge,
}: Props) {
  const { language } = useCmsConfig();
  const { defaultLanguage } = useConfig();

  if (!item) {
    return null;
  }

  const copy = resolveBloggerCopy(
    item.blogger.copies,
    language,
    defaultLanguage,
  );

  return (
    <Dialog
      isOpen={isOpen}
      title={labels.bloggerTrashDetailTitle}
      onClose={onClose}
      closeLabel={labels.bloggerClose}
      size="lg"
      className="cms-theme"
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="primary" onClick={onRestore}>
            {labels.bloggerTrashRestore}
          </Button>
          <Button type="button" variant="danger" onClick={onPurge}>
            {labels.bloggerTrashPurge}
          </Button>
        </div>
      }
    >
      <h2 className={styles.title}>{copy?.title || labels.bloggerUntitled}</h2>
      <SanitizedRichText className={styles.body} html={copy?.body ?? ''} />
    </Dialog>
  );
}
