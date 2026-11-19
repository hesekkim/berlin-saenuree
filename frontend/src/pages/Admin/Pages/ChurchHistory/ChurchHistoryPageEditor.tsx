import { useEffect, useRef } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import Upload from '../../../../shared/components/ui/Upload/Upload';
import { mediaImageAbsoluteUrl } from '../../../../shared/api/mediaApi';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { useChurchHistoryPageEditor } from './useChurchHistoryPageEditor';
import styles from './ChurchHistoryPageEditor.module.css';

export default function ChurchHistoryPageEditor() {
  const { language: cmsLanguage } = useCmsConfig();
  const uploadLabels = adminTranslations[cmsLanguage];
  const editor = useChurchHistoryPageEditor();
  const { labels, current } = editor;
  const pendingFocusEventId = useRef<string | null>(null);
  const eventDateRefs = useRef(
    new Map<string, HTMLInputElement | HTMLTextAreaElement>(),
  );
  const disabled =
    !editor.isReady ||
    editor.isSaving ||
    editor.isImageUploading ||
    editor.isImageOptimizing ||
    editor.isImageCleaning;

  useEffect(() => {
    const eventId = pendingFocusEventId.current;
    if (!eventId) {
      return;
    }
    const input = eventDateRefs.current.get(eventId);
    if (!input) {
      return;
    }
    pendingFocusEventId.current = null;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  }, [current.events]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      {editor.loadFailed ? (
        <div className={styles.loadError} role="alert">
          <p>{labels.loadFailed}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void editor.reload()}
          >
            {labels.retry}
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.language}>
            <Select
              label={labels.language}
              options={editor.editLanguageOptions}
              value={editor.editLanguage}
              onChange={editor.setLanguage}
            />
          </div>

          <div className={styles.fields} aria-busy={!editor.isReady}>
            <section className={styles.group} aria-label={labels.events}>
              <div className={styles.listHeading}>
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label={labels.addEvent}
                  title={labels.addEvent}
                  disabled={disabled}
                  onClick={() => {
                    pendingFocusEventId.current = editor.addEvent();
                  }}
                >
                  <FiPlus aria-hidden />
                </button>
              </div>

              <div className={styles.eventList}>
                {current.events.map((event, index) => {
                  const mediaFiles =
                    event.imageId && event.sourceFileId
                      ? [
                          {
                            id: event.sourceFileId,
                            url: `/api/v1/media/images/${event.imageId}/thumb`,
                            originalName: event.imageId,
                            contentType: 'image/jpeg',
                            sizeBytes: 0,
                          },
                        ]
                      : undefined;
                  const imagePreviewUrl =
                    event.imageUrl ||
                    (event.imageId
                      ? mediaImageAbsoluteUrl(event.imageId, 'thumb')
                      : '');
                  return (
                    <fieldset className={styles.event} key={event.id}>
                      <legend>
                        <span>
                          {labels.events} {index + 1}
                        </span>
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.removeButton}`}
                          aria-label={`${index + 1}. ${labels.removeEvent}`}
                          title={labels.removeEvent}
                          disabled={disabled}
                          onClick={() => editor.removeEvent(event.id)}
                        >
                          <FiTrash2 aria-hidden />
                        </button>
                      </legend>

                      <div className={styles.eventFields}>
                        <InputField
                          label={labels.date}
                          value={event.date}
                          disabled={disabled}
                          ref={(element) => {
                            if (element) {
                              eventDateRefs.current.set(event.id, element);
                            } else {
                              eventDateRefs.current.delete(event.id);
                            }
                          }}
                          onChange={(value) =>
                            editor.updateEvent(event.id, 'date', value)
                          }
                        />
                        <InputField
                          label={labels.description}
                          value={event.description}
                          disabled={disabled}
                          multiline
                          rows={2}
                          onChange={(value) =>
                            editor.updateEvent(event.id, 'description', value)
                          }
                        />
                        <div className={styles.mediaField}>
                          <p className={styles.mediaLabel}>{labels.image}</p>
                          {imagePreviewUrl ? (
                            <div className={styles.previewContainer}>
                              <img
                                className={styles.staticPreview}
                                src={imagePreviewUrl}
                                alt={
                                  event.date || `${labels.events} ${index + 1}`
                                }
                              />
                              <button
                                type="button"
                                className={`${styles.iconButton} ${styles.removeButton}`}
                                aria-label={labels.removeImage}
                                title={labels.removeImage}
                                disabled={disabled}
                                onClick={() =>
                                  editor.removeEventImage(event.id)
                                }
                              >
                                <FiTrash2 aria-hidden />
                              </button>
                            </div>
                          ) : null}
                          {!imagePreviewUrl ? (
                            <Upload
                              key={`${event.id}:${event.imageId}:${event.sourceFileId}`}
                              accept="image/jpeg,image/png,image/webp"
                              maxSizeBytes={10 * 1024 * 1024}
                              defaultFiles={mediaFiles}
                              retainDefaultRemotes
                              retainUploadedRemotes
                              disabled={disabled || editor.isImageUploading}
                              onUploaded={(files) =>
                                void editor.handleImageUploaded(event.id, files)
                              }
                              onItemsChange={(items) =>
                                editor.handleImageItemsChange(event.id, items)
                              }
                              labels={{
                                dropHint: uploadLabels.uploadDropHint,
                                chooseFile: uploadLabels.uploadChooseFile,
                                supportedFormats:
                                  uploadLabels.uploadSupportedFormats,
                                supportedFormatsShort:
                                  uploadLabels.uploadSupportedFormatsShort,
                                maximumSize: uploadLabels.uploadMaximumSize,
                                maximumSizeShort:
                                  uploadLabels.uploadMaximumSizeShort,
                                remove: uploadLabels.uploadRemove,
                                download: uploadLabels.uploadDownload,
                                upload: uploadLabels.uploadUpload,
                                retry: uploadLabels.uploadRetry,
                                uploading: uploadLabels.uploadUploading,
                                uploaded: uploadLabels.uploadUploaded,
                                typeNotAllowed:
                                  uploadLabels.uploadTypeNotAllowed,
                                sizeExceeded: uploadLabels.uploadSizeExceeded,
                                uploadFailed: uploadLabels.uploadUploadFailed,
                                unauthorized: uploadLabels.uploadUnauthorized,
                                downloadFailed:
                                  uploadLabels.uploadDownloadFailed,
                              }}
                            />
                          ) : null}
                          {editor.isImageOptimizing ||
                          editor.isImageUploading ? (
                            <p className={styles.mediaHint} role="status">
                              {labels.imageProcessing}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </section>
          </div>

          <div className={styles.actions}>
            <Button
              type="button"
              onClick={() => void editor.save()}
              disabled={
                !editor.isReady ||
                editor.loadFailed ||
                !editor.isDirty ||
                !editor.isContentComplete ||
                editor.isSaving ||
                editor.isImageUploading ||
                editor.isImageOptimizing ||
                editor.isImageCleaning
              }
            >
              {labels.save}
            </Button>
          </div>
        </>
      )}

      <Dialog
        isOpen={editor.conflict !== null}
        title={labels.conflictTitle}
        onClose={editor.dismissConflict}
        closeLabel={labels.close}
        footer={
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={editor.dismissConflict}
            >
              {labels.keepEditing}
            </Button>
            <Button type="button" onClick={editor.reloadLatest}>
              {labels.reloadLatest}
            </Button>
          </div>
        }
      >
        <p>{labels.conflictMessage}</p>
      </Dialog>
    </div>
  );
}
