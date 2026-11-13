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
    isUploadingMedia,
    uploadProgress,
    formError,
    conflictPost,
    currentLanguageOptions,
    canSave,
    setMedia,
    setPublished,
    updateCopyBody,
    updateEditLanguage,
    removeMedia,
    addPhotosFromFiles,
    cancelUpload,
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
      className={`${styles.uploadBlockingDialog} cms-theme`}
      closeOnOverlayClick={false}
      closeOnEscape={false}
      footer={
        <div
          className={styles.footer}
          inert={isUploadingMedia}
          aria-hidden={isUploadingMedia}
        >
          <Button
            type="button"
            variant="secondary"
            onClick={() => void close()}
            disabled={isUploadingMedia || isSaving}
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
      <div
        className={styles.form}
        inert={isUploadingMedia}
        aria-hidden={isUploadingMedia}
      >
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
          media={state.media}
          onReorder={setMedia}
          onRemove={removeMedia}
          onAddFiles={(files) => {
            void addPhotosFromFiles(files);
          }}
          disabled={isUploadingMedia || isSaving}
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
      {uploadProgress ? (
        <div className={styles.uploadBlockingOverlay}>
          <div
            className={styles.uploadBlockingContent}
            role="status"
            aria-live="polite"
          >
            <span className={styles.uploadSpinner} aria-hidden="true" />
            <h3>{labels.postsMediaUploadTitle}</h3>
            <p>
              {uploadProgress.processing
                ? uploadProgress.optimizingImages
                  ? labels.postsMediaOptimizingImages
                  : labels.postsMediaSaving
                : labels.postsMediaUploading
                    .replace('{fileName}', uploadProgress.fileName)
                    .replace(
                      '{fileIndex}',
                      String(uploadProgress.fileIndex),
                    )
                    .replace(
                      '{fileCount}',
                      String(uploadProgress.fileCount),
                    )}
            </p>
            {!uploadProgress.processing ? (
              <progress
                max={100}
                value={uploadProgress.percent ?? undefined}
                aria-label={labels.postsMediaUploadTitle}
              />
            ) : null}
            {!uploadProgress.processing && uploadProgress.percent !== null ? (
              <span>{uploadProgress.percent}%</span>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={cancelUpload}
            >
              {labels.postsMediaCancel}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
