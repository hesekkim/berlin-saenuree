import { FiPlus, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import VisitMediaEditor from './VisitMediaEditor';
import { useVisitPageEditor } from './useVisitPageEditor';
import styles from './VisitPageEditor.module.css';

export default function VisitPageEditor() {
  const { language: cmsLanguage } = useCmsConfig();
  const uploadLabels = adminTranslations[cmsLanguage];
  const editor = useVisitPageEditor();
  const { labels, current } = editor;
  const disabled =
    !editor.isReady ||
    editor.isSaving ||
    editor.isImageUploading ||
    editor.isImageOptimizing ||
    editor.isImageCleaning;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      <div className={styles.language}>
        <Select
          label={labels.language}
          options={editor.editLanguageOptions}
          value={editor.editLanguage}
          onChange={editor.setLanguage}
        />
      </div>

      {editor.loadFailed ? (
        <div className={styles.loadError} role="alert">
          <p>{labels.loadFailed}</p>
          <Button type="button" variant="secondary" onClick={() => void editor.reload()}>
            {labels.retry}
          </Button>
        </div>
      ) : null}

      <div className={styles.fields} aria-busy={!editor.isReady}>
        <section className={styles.group} aria-labelledby="visit-editor-services">
          <div className={styles.listHeading}>
            <h2 id="visit-editor-services">{labels.services}</h2>
            <button
              type="button"
              className={styles.addButton}
              aria-label={labels.addService}
              title={labels.addService}
              disabled={disabled}
              onClick={editor.addService}
            >
              <FiPlus aria-hidden />
            </button>
          </div>
          <div className={styles.itemList}>
            {current.services.map((service, index) => {
              const removeLabel = labels.removeService.replace(
                '{name}',
                service.name || `${labels.services} ${index + 1}`,
              );
              return (
                <fieldset className={styles.item} key={service.id}>
                  <legend>
                    <span>
                      {service.name || `${labels.services} ${index + 1}`}
                    </span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={removeLabel}
                      title={removeLabel}
                      disabled={disabled}
                      onClick={() => editor.removeService(service.id)}
                    >
                      <FiTrash2 aria-hidden />
                    </button>
                  </legend>
                  <div className={styles.grid}>
                    <InputField
                      label={labels.serviceName}
                      value={service.name}
                      disabled={disabled}
                      onChange={(value) =>
                        editor.updateService(service.id, 'name', value)
                      }
                    />
                    <InputField
                      label={labels.day}
                      value={service.day}
                      disabled={disabled}
                      onChange={(value) =>
                        editor.updateService(service.id, 'day', value)
                      }
                    />
                    <InputField
                      label={labels.time}
                      value={service.time}
                      disabled={disabled}
                      onChange={(value) =>
                        editor.updateService(service.id, 'time', value)
                      }
                    />
                    <InputField
                      label={labels.place}
                      value={service.place}
                      disabled={disabled}
                      onChange={(value) =>
                        editor.updateService(service.id, 'place', value)
                      }
                    />
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section
          className={`${styles.group} ${styles.locationGroup}`}
          aria-labelledby="visit-editor-location"
        >
          <h2 id="visit-editor-location">{labels.location}</h2>
          <div className={styles.fieldGroup}>
            <h3>{labels.address}</h3>
            <InputField
              label={labels.address}
              hideLabel
              value={current.address}
              disabled={disabled}
              onChange={(value) => editor.updateField('address', value)}
            />
          </div>
          {(
            [
              [
                'primaryTransit',
                labels.primaryTransit,
                labels.addPrimaryTransit,
              ],
              [
                'secondaryTransit',
                labels.secondaryTransit,
                labels.addSecondaryTransit,
              ],
            ] as const
          ).map(([group, title, addLabel]) => (
            <div className={styles.transitGroup} key={group}>
              <div className={styles.listHeading}>
                <h3>{title}</h3>
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label={addLabel}
                  title={addLabel}
                  disabled={disabled}
                  onClick={() => editor.addTransit(group)}
                >
                  <FiPlus aria-hidden />
                </button>
              </div>
              <div className={styles.transitItems}>
                {current[group].map((route, index) => {
                  const removeLabel = labels.removeTransit.replace(
                    '{name}',
                    route.type
                      ? `${route.type} ${route.line}`.trim()
                      : `${title} ${index + 1}`,
                  );
                  return (
                    <fieldset className={styles.item} key={route.id}>
                      <legend>
                        <span>{route.type || `${title} ${index + 1}`}</span>
                        <button
                          type="button"
                          className={styles.removeButton}
                          aria-label={removeLabel}
                          title={removeLabel}
                          disabled={disabled}
                          onClick={() =>
                            editor.removeTransit(group, route.id)
                          }
                        >
                          <FiTrash2 aria-hidden />
                        </button>
                      </legend>
                      <div className={styles.grid}>
                        <InputField
                          label={labels.type}
                          value={route.type}
                          disabled={disabled}
                          onChange={(value) =>
                            editor.updateTransit(
                              group,
                              route.id,
                              'type',
                              value,
                            )
                          }
                        />
                        <InputField
                          label={labels.line}
                          value={route.line}
                          disabled={disabled}
                          onChange={(value) =>
                            editor.updateTransit(
                              group,
                              route.id,
                              'line',
                              value,
                            )
                          }
                        />
                        <InputField
                          label={labels.station}
                          value={route.station}
                          disabled={disabled}
                          onChange={(value) =>
                            editor.updateTransit(
                              group,
                              route.id,
                              'station',
                              value,
                            )
                          }
                        />
                        <InputField
                          label={labels.walkingTime}
                          value={route.walkingTime}
                          disabled={disabled}
                          onChange={(value) =>
                            editor.updateTransit(
                              group,
                              route.id,
                              'walkingTime',
                              value,
                            )
                          }
                        />
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </div>
          ))}
          <div className={styles.fieldGroup}>
            <h3>{labels.mapLink}</h3>
            <div className={styles.mapField}>
              <InputField
                label={labels.mapLink}
                hideLabel
                value={current.googleMapsUrl}
                disabled={disabled}
                inputMode="url"
                onChange={(value) => editor.updateField('googleMapsUrl', value)}
                error={editor.hasInvalidMapLink}
                errorMessage={labels.invalidMapLink}
              />
              <p>{labels.mapLinkHint}</p>
            </div>
          </div>
          {(
            [
              ['mapImages', labels.mapScreenshots],
              ['venueImages', labels.venueImages],
            ] as const
          ).map(([group, title]) => (
            <VisitMediaEditor
              key={group}
              title={title}
              hint={
                group === 'mapImages'
                  ? labels.mapScreenshotHint
                  : labels.mediaHint
              }
              images={editor.imagesDraft[group]}
              disabled={disabled}
              uploadKey={`${group}:${editor.uploadEpoch[group]}`}
              removeImageLabel={labels.removeImage}
              selectImageLabel={labels.reorderImage}
              reorderHint={labels.reorderHint}
              imageMovedLabel={labels.imageMoved}
              uploadLabels={{
                dropHint: uploadLabels.uploadDropHint,
                chooseFile: uploadLabels.uploadChooseFile,
                supportedFormats: uploadLabels.uploadSupportedFormats,
                supportedFormatsShort:
                  uploadLabels.uploadSupportedFormatsShort,
                maximumSize: uploadLabels.uploadMaximumSize,
                maximumSizeShort: uploadLabels.uploadMaximumSizeShort,
                remove: uploadLabels.uploadRemove,
                download: uploadLabels.uploadDownload,
                upload: uploadLabels.uploadUpload,
                retry: uploadLabels.uploadRetry,
                uploading: uploadLabels.uploadUploading,
                uploaded: uploadLabels.uploadUploaded,
                typeNotAllowed: uploadLabels.uploadTypeNotAllowed,
                sizeExceeded: uploadLabels.uploadSizeExceeded,
                uploadFailed: uploadLabels.uploadUploadFailed,
                unauthorized: uploadLabels.uploadUnauthorized,
                downloadFailed: uploadLabels.uploadDownloadFailed,
              }}
              onUploaded={(files) => {
                void editor.handleImageUploaded(group, files);
              }}
              onItemsChange={(items) =>
                editor.handleImageItemsChange(group, items)
              }
              onRemove={(imageId) => editor.removeImage(group, imageId)}
              onReorder={(images) => editor.reorderImages(group, images)}
            />
          ))}
          {editor.isImageOptimizing || editor.isImageUploading ? (
            <p className={styles.mediaHint} role="status">
              {labels.imageProcessing}
            </p>
          ) : null}
          {editor.imageUploadFailed ? (
            <p className={styles.loadError} role="alert">
              {labels.imageUploadFailed}
            </p>
          ) : null}
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
            editor.isSaving ||
            editor.hasInvalidMapLink ||
            editor.isImageUploading ||
            editor.isImageOptimizing ||
            editor.isImageCleaning
          }
        >
          {labels.save}
        </Button>
      </div>

      <Dialog
        isOpen={editor.conflict !== null}
        title={labels.conflictTitle}
        onClose={editor.dismissConflict}
        closeLabel={labels.close}
        footer={
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={editor.dismissConflict}>
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
