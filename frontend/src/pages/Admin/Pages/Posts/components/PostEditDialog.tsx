import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import SlideToggle from '../../../../../shared/components/ui/SlideToggle/SlideToggle';
import type { PostResponse } from '../../../../../shared/api/postsApi';
import type { AdminTranslations } from '../../../translations';
import PostCaptionFields from './PostCaptionFields';
import PostImageOrderList from './PostImageOrderList';
import styles from './PostComposerDialog.module.css';
import { usePostEditor } from '../hooks/usePostEditor';

type PostEditDialogProps = {
  post: PostResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: PostResponse) => void | Promise<void>;
  onForbidden: () => void | Promise<void>;
  labels: AdminTranslations;
  language: string;
  availableLanguages: string[];
};

export default function PostEditDialog({
  post,
  isOpen,
  onClose,
  onSaved,
  onForbidden,
  labels,
  language,
  availableLanguages,
}: PostEditDialogProps) {
  const {
    state,
    isSaving,
    formError,
    conflictPost,
    currentLanguageOptions,
    canSave,
    setImages,
    setPublished,
    updateCopyBody,
    updateEditLanguage,
    removeImage,
    addPhotosFromFiles,
    save,
    close,
    applyLatestConflict,
  } = usePostEditor({
    post,
    isOpen,
    onClose,
    onSaved,
    onForbidden,
    labels,
    availableLanguages,
  });

  if (!state || !post) {
    return null;
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={labels.postsEditDialogTitle ?? 'Edit post'}
      onClose={() => void close()}
      closeLabel={labels.dialogCloseLabel}
      size="md"
      className="cms-theme"
      closeOnOverlayClick={false}
      closeOnEscape={false}
      footer={
        <div className={styles.footer}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void close()}
          >
            {labels.postsComposerCancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void save()}
            disabled={!canSave || isSaving}
          >
            {isSaving ? labels.postsSaving : labels.postsSave}
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}

        {conflictPost ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void applyLatestConflict()}
          >
            {labels.postsConflictApplyLatest}
          </Button>
        ) : null}

        <div className={styles.publishRow}>
          <p className={styles.fieldHint}>{labels.postsPublishedHint}</p>
          <SlideToggle
            label={labels.postsPublishedLabel}
            checked={state.published}
            onChange={setPublished}
          />
        </div>

        <PostImageOrderList
          images={state.images}
          onReorder={setImages}
          onRemove={removeImage}
          onAddFiles={(files) => {
            void addPhotosFromFiles(files);
          }}
          labels={{
            removeAria: labels.postsComposerRemoveImage,
            addAria: labels.postsComposerAddPhotos,
            selectAria: labels.postsComposerSelectImage,
            carouselAria: labels.postsComposerCarousel,
            removeTitle: labels.postsComposerRemoveTitle,
            removeConfirm: labels.postsComposerRemoveConfirm,
            removeConfirmAction: labels.postsComposerRemoveConfirmAction,
            cancel: labels.postsComposerCancel,
            dialogClose: labels.dialogCloseLabel,
          }}
        />

        <PostCaptionFields
          languageOptions={currentLanguageOptions}
          editLanguage={state.editLanguage}
          onEditLanguageChange={updateEditLanguage}
          copies={state.copies}
          onCopyBodyChange={updateCopyBody}
          published={state.published}
          onPublishedChange={setPublished}
          adminLanguage={language}
          labels={{
            postsLanguageLabel: labels.postsLanguageLabel,
            postsCaptionLabel: labels.postsCaptionLabel,
            postsCaptionPlaceholder: labels.postsCaptionPlaceholder,
            postsPublishedLabel: labels.postsPublishedLabel,
            postsPublishedHint: labels.postsPublishedHint,
          }}
          editorKey="edit"
          showEnabled={false}
          showEnabledHint={false}
        />
      </div>
    </Dialog>
  );
}
