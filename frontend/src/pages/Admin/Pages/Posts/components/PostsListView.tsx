import { BsPinAngleFill } from 'react-icons/bs';
import { mediaImageAbsoluteUrl } from '../../../../../shared/api/mediaApi';
import type { PostResponse } from '../../../../../shared/api/postsApi';
import StatusTag from '../../../../../shared/components/ui/StatusTag/StatusTag';
import AdminListRow from '../../../components/AdminListRow/AdminListRow';
import type { AdminTranslations } from '../../../translations';
import styles from '../Posts.module.css';
import Checkbox from '../../../../../shared/components/ui/Checkbox/Checkbox';
import PageSelectionControls from '../../../components/PageSelectionControls';
import PageSelectionHeader from '../../../components/PageSelectionHeader';

type Props = {
  items: {
    post: PostResponse;
    title: string;
    date: string;
    statusLabel: string;
    statusType: 'published' | 'unpublished';
    imageCountLabel: string;
    canSelect: boolean;
    ariaLabel: string;
    selectLabel: string;
  }[];
  labels: AdminTranslations;
  onOpen: (post: PostResponse) => void;
  selectedIds: Set<string>;
  canSelectAny: boolean;
  onToggleSelection: (id: string, checked: boolean) => void;
  allSelected: boolean;
  indeterminate: boolean;
  selectedCount: number;
  selectedCountLabel: string;
  bulkDeleteLabel: string;
  onTogglePageSelection: (checked: boolean) => void;
  onDeleteSelected: () => void;
};

export default function PostsListView({
  items,
  labels,
  onOpen,
  selectedIds,
  canSelectAny,
  onToggleSelection,
  allSelected,
  indeterminate,
  selectedCount,
  selectedCountLabel,
  bulkDeleteLabel,
  onTogglePageSelection,
  onDeleteSelected,
}: Props) {
  return (
    <>
      <PageSelectionControls
        selectedCount={selectedCount}
        selectedCountLabel={selectedCountLabel}
        deleteLabel={bulkDeleteLabel}
        onDelete={onDeleteSelected}
      />
      <ul className={styles.list}>
        <PageSelectionHeader
          canSelect={canSelectAny}
          allSelected={allSelected}
          indeterminate={indeterminate}
          titleLabel={labels.postsColumnCaption}
          authorLabel={labels.postsColumnAuthor}
          dateLabel={labels.postsColumnDate}
          metadataLabel={labels.postsColumnCount}
          statusLabel={labels.postsColumnStatus}
          hasThumbnail
          selectAllLabel={labels.postsBulkSelectAll}
          onToggleAll={onTogglePageSelection}
        />
        {items.map((item) => {
          const { post } = item;
          const cover = post.images[0];

          return (
            <AdminListRow
              key={post.id}
              title={item.title}
              author={post.createdBy}
              date={item.date}
              thumbnailUrl={
                cover ? mediaImageAbsoluteUrl(cover.imageId, 'thumb') : undefined
              }
              metadata={
                <>
                  <span className={styles.listPhotoCount}>
                    {item.imageCountLabel}
                  </span>
                  {post.pinned ? <BsPinAngleFill aria-hidden /> : null}
                </>
              }
              badges={
                <StatusTag
                  type={item.statusType}
                  label={item.statusLabel}
                />
              }
              ariaLabel={item.ariaLabel}
              onClick={() => onOpen(post)}
              selection={
                <Checkbox
                  checked={selectedIds.has(post.id)}
                  disabled={!item.canSelect}
                  ariaLabel={item.selectLabel}
                  onChange={(checked) => onToggleSelection(post.id, checked)}
                />
              }
            />
          );
        })}
      </ul>
    </>
  );
}
