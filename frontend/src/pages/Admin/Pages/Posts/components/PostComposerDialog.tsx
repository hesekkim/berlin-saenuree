import { BiLoaderAlt } from 'react-icons/bi';
import Button from '../../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../../shared/components/ui/Dialog/Dialog';
import Upload from '../../../../../shared/components/ui/Upload/Upload';
import type { AdminTranslations } from '../../../translations';
import PostCaptionFields from './PostCaptionFields';
import PostImageOrderList from './PostImageOrderList';
import { usePostComposer } from '../hooks/usePostComposer';
import styles from './PostComposerDialog.module.css';

export type PostComposerDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onPublished: () => void | Promise<void>;
  labels: AdminTranslations;
  adminLanguage: string;
  availableLanguages: string[];
};

export default function PostComposerDialog({
  isOpen,
  onClose,
  onPublished,
  labels,
  adminLanguage,
  availableLanguages,
}: PostComposerDialogProps) {
  const {
    step,
    images,
    setImages,
    copies,
    editLanguage,
    setEditLanguage,
    published,
    setPublished,
    formError,
    isSaving,
    closing,
    uploadKey,
    uploadDefaults,
    uploadBusy,
    canGoNextFromPhotos,
    canPublish,
    dialogTitle,
    siteLanguages,
    imageAccept,
    imageMaxBytes,
    handleUploaded,
    handleUploadItemsChange,
    removeImage,
    goNext,
    goBack,
    addPhotosFromFiles,
    updateCopyBody,
    closeAndDiscard,
    publish,
  } = usePostComposer({
    isOpen,
    onClose,
    onPublished,
    labels,
    availableLanguages,
  });

  const languageOptions = siteLanguages.map((code) => ({
    value: code,
    label: code,
  }));

  const busy = isSaving || closing;

  const footer =
    step === 1 ? (
      <div className={styles.footer}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void closeAndDiscard()}
          disabled={busy}
        >
          {labels.postsComposerCancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={goNext}
          disabled={!canGoNextFromPhotos || busy}
        >
          {labels.postsComposerNext}
        </Button>
      </div>
    ) : step === 2 ? (
      <div className={styles.footer}>
        <Button
          type="button"
          variant="secondary"
          onClick={goBack}
          disabled={busy}
        >
          {labels.postsComposerBack}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={goNext}
          disabled={images.length < 1 || busy}
        >
          {labels.postsComposerNext}
        </Button>
      </div>
    ) : (
      <div className={styles.footer}>
        <Button
          type="button"
          variant="secondary"
          onClick={goBack}
          disabled={busy}
        >
          {labels.postsComposerBack}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void closeAndDiscard()}
          disabled={busy}
        >
          {labels.postsComposerCancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void publish()}
          disabled={!canPublish || busy}
        >
          {isSaving
            ? labels.postsComposerPublishing
            : labels.postsComposerPublish}
        </Button>
      </div>
    );

  return (
    <Dialog
      isOpen={isOpen}
      title={dialogTitle}
      onClose={() => void closeAndDiscard()}
      closeLabel={labels.dialogCloseLabel}
      size="md"
      className="cms-theme"
      closeOnOverlayClick={false}
      closeOnEscape={false}
      footer={footer}
    >
      <div className={styles.form}>
        {formError ? (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        ) : null}

        {step === 1 ? (
          <>
            {images.length > 0 ? (
              <p className={styles.hint}>
                {labels.postsComposerSelectedCount.replace(
                  '{count}',
                  String(images.length),
                )}
              </p>
            ) : null}
            {uploadBusy ? (
              <p className={styles.processing} role="status" aria-live="polite">
                <BiLoaderAlt className={styles.processingIcon} aria-hidden />
                {labels.postsComposerPhotosProcessing}
              </p>
            ) : null}
            <Upload
              key={uploadKey}
              multiple
              accept={imageAccept}
              maxSizeBytes={imageMaxBytes}
              autoUpload
              disabled={busy}
              defaultFiles={uploadDefaults}
              retainDefaultRemotes
              retainUploadedRemotes
              onUploaded={handleUploaded}
              onItemsChange={handleUploadItemsChange}
              labels={{
                dropHint: labels.uploadDropHint,
                chooseFile: labels.uploadChooseFile,
                supportedFormats: labels.uploadSupportedFormats,
                supportedFormatsShort: labels.uploadSupportedFormatsShort,
                maximumSize: labels.uploadMaximumSize,
                maximumSizeShort: labels.uploadMaximumSizeShort,
                remove: labels.uploadRemove,
                download: labels.uploadDownload,
                upload: labels.uploadUpload,
                retry: labels.uploadRetry,
                uploading: labels.uploadUploading,
                uploaded: labels.uploadUploaded,
                typeNotAllowed: labels.uploadTypeNotAllowed,
                sizeExceeded: labels.uploadSizeExceeded,
                uploadFailed: labels.uploadUploadFailed,
                unauthorized: labels.uploadUnauthorized,
                downloadFailed: labels.uploadDownloadFailed,
              }}
            />
          </>
        ) : null}

        {step === 2 ? (
          <PostImageOrderList
            images={images}
            onReorder={setImages}
            onRemove={removeImage}
            onAddFiles={(files) => {
              void addPhotosFromFiles(files);
            }}
            disabled={busy || uploadBusy}
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
        ) : null}

        {step === 3 ? (
          <PostCaptionFields
            languageOptions={languageOptions}
            editLanguage={editLanguage}
            onEditLanguageChange={setEditLanguage}
            copies={copies}
            onCopyBodyChange={updateCopyBody}
            published={published}
            onPublishedChange={setPublished}
            adminLanguage={adminLanguage}
            labels={labels}
            editorKey="composer"
            disabled={busy || uploadBusy}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
