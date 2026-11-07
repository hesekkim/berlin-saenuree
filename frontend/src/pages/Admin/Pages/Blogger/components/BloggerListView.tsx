import type { BloggerResponse } from '../../../../../shared/api/bloggerApi';
import type { AdminTranslations } from '../../../translations';
import StatusTag from '../../../../../shared/components/ui/StatusTag/StatusTag';
import AdminListRow from '../../../components/AdminListRow/AdminListRow';
import Checkbox from '../../../../../shared/components/ui/Checkbox/Checkbox';
import styles from './BloggerListView.module.css';
import PageSelectionControls from '../../../components/PageSelectionControls';
import PageSelectionHeader from '../../../components/PageSelectionHeader';

type Props = {
  items: {
    blogger: BloggerResponse;
    title: string;
    date: string;
    statusLabel: string;
    statusType: 'published' | 'unpublished';
    hasEditDraft: boolean;
    canSelect: boolean;
    ariaLabel: string;
    selectLabel: string;
  }[];
  draft: { title: string; author: string; date: string } | null;
  showDraft: boolean;
  onOpen: (item: BloggerResponse) => void;
  onOpenDraft: () => void;
  labels: AdminTranslations;
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

export default function BloggerListView({
  items,
  draft,
  showDraft,
  onOpen,
  onOpenDraft,
  labels,
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
      {showDraft && draft ? (
        <ul className={`${styles.list} ${styles.draftList}`}>
          <AdminListRow
            title={draft.title}
            author={draft.author}
            date={draft.date}
            badges={
              <StatusTag
                type="unpublished"
                label={labels.bloggerDraftBadge}
              />
            }
            ariaLabel={`${draft.title}, ${labels.bloggerDraftBadge}`}
            onClick={onOpenDraft}
            tone="draft"
          />
        </ul>
      ) : null}

      {items.length > 0 ? (
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
              titleLabel={labels.bloggerTitleColumn}
              authorLabel={labels.bloggerAuthorColumn}
              dateLabel={labels.bloggerDateColumn}
              statusLabel={labels.bloggerStatusColumn}
              selectAllLabel={labels.bloggerBulkSelectAll}
              onToggleAll={onTogglePageSelection}
            />
            {items.map(
              ({
                blogger,
                title,
                date,
                statusLabel,
                statusType,
                hasEditDraft,
                canSelect: itemCanSelect,
                ariaLabel,
                selectLabel,
              }) => (
                <AdminListRow
                  key={blogger.id}
                  title={title}
                  author={blogger.createdBy}
                  date={date}
                  badges={
                    <>
                      <StatusTag
                        type={statusType}
                        label={statusLabel}
                      />
                      {hasEditDraft ? (
                        <StatusTag
                          type="unpublished"
                          label={labels.bloggerDraftBadge}
                        />
                      ) : null}
                    </>
                  }
                  ariaLabel={ariaLabel}
                  onClick={() => onOpen(blogger)}
                  selection={
                    <Checkbox
                      checked={selectedIds.has(blogger.id)}
                      disabled={!itemCanSelect}
                      ariaLabel={selectLabel}
                      onChange={(checked) =>
                        onToggleSelection(blogger.id, checked)
                      }
                    />
                  }
                />
              ),
            )}
          </ul>
        </>
      ) : null}
    </>
  );
}
