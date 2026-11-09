import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import Upload from '../../../../shared/components/ui/Upload/Upload';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { useHomePageEditor } from './useHomePageEditor';
import styles from './HomePageEditor.module.css';
import { IoTrashOutline } from 'react-icons/io5';
import type { HomeImage } from '../../../../shared/content/homeContent';

export default function HomePageEditor() {
  const { language: cmsLanguage } = useCmsConfig();
  const t = adminTranslations[cmsLanguage];
  const {
    editLanguage,
    editLanguageOptions,
    setEditLanguage,
    current,
    isReady,
    isDirty,
    isSaving,
    isImageUploading,
    isImageOptimizing,
    isImageCleaning,
    conflict,
    updateField,
    updateVideoUrls,
    handleImageUploaded,
    handleImageItemsChange,
    isVideoSelectionValid,
    save,
    reloadLatest,
    dismissConflict,
  } = useHomePageEditor();

  const renderImageUpload = (
    slot: 'hero' | 'panorama',
    imageId: string,
    sourceFileId: string,
    label: string,
    multiple = false,
    images: HomeImage[] = [],
  ) => (
    <div className={styles.mediaField}>
      <p className={styles.mediaLabel}>{label}</p>
      <Upload
        key={`${editLanguage}:${slot}:${multiple ? images.map((image) => image.imageId).join(':') : imageId}`}
        accept="image/jpeg,image/png,image/webp"
        maxSizeBytes={10 * 1024 * 1024}
        multiple={multiple}
        defaultFiles={multiple
          ? images.map((image) => ({
              id: image.sourceFileId,
              url: `/api/v1/media/images/${image.imageId}/thumb`,
              originalName: image.imageId,
              contentType: 'image/jpeg',
              sizeBytes: 0,
            }))
          :
          imageId && sourceFileId
            ? [
                {
                  id: sourceFileId,
                  url: `/api/v1/media/images/${imageId}/thumb`,
                  originalName: imageId,
                  contentType: 'image/jpeg',
                  sizeBytes: 0,
                },
              ]
            : undefined
        }
        retainDefaultRemotes
        retainUploadedRemotes
        disabled={!isReady || isSaving || isImageOptimizing}
        onUploaded={(files) => void handleImageUploaded(slot, files)}
        onItemsChange={(items) => handleImageItemsChange(slot, items)}
        labels={{
          dropHint: t.uploadDropHint,
          chooseFile: t.uploadChooseFile,
          supportedFormats: t.uploadSupportedFormats,
          supportedFormatsShort: t.uploadSupportedFormatsShort,
          maximumSize: t.uploadMaximumSize,
          maximumSizeShort: t.uploadMaximumSizeShort,
          remove: t.uploadRemove,
          download: t.uploadDownload,
          upload: t.uploadUpload,
          retry: t.uploadRetry,
          uploading: t.uploadUploading,
          uploaded: t.uploadUploaded,
          typeNotAllowed: t.uploadTypeNotAllowed,
          sizeExceeded: t.uploadSizeExceeded,
          uploadFailed: t.uploadUploadFailed,
          unauthorized: t.uploadUnauthorized,
          downloadFailed: t.uploadDownloadFailed,
        }}
      />
      {isImageOptimizing || isImageUploading ? (
        <p className={styles.mediaHint}>{t.homeImageProcessing}</p>
      ) : null}
    </div>
  );
  const videoUrls = Array.from(
    { length: 3 },
    (_, index) => current.youtubeVideoUrls[index] ?? '',
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t.homePageTitle}</h1>
        <p className={styles.subtitle}>{t.homePageSubtitle}</p>
      </header>

      <div className={styles.langSelect}>
        <Select
          label={t.languageLabel}
          options={editLanguageOptions}
          value={editLanguage}
          onChange={setEditLanguage}
        />
      </div>

      <div className={styles.fields}>
        <section className={styles.fieldGroup} aria-labelledby="home-copy-title">
          <h2 id="home-copy-title" className={styles.groupTitle}>
            {t.homeCopySectionTitle}
          </h2>
          <InputField
            label={t.homeYearMottoLabel}
            value={current.yearMotto}
            onChange={(value) => updateField('yearMotto', value)}
            multiline
            rows={3}
          />
          <InputField
            label={t.homeBibleVerseLabel}
            value={current.bibleVerse}
            onChange={(value) => updateField('bibleVerse', value)}
            multiline
            rows={4}
          />
          <InputField
            label={t.homeBibleReferenceLabel}
            value={current.bibleReference}
            onChange={(value) => updateField('bibleReference', value)}
          />
        </section>
        <section
          className={styles.fieldGroup}
          aria-labelledby="home-images-title"
        >
          <h2 id="home-images-title" className={styles.groupTitle}>
            {t.homeImagesSectionTitle}
          </h2>
          <div className={styles.mediaGrid}>
            {renderImageUpload(
              'hero',
              '',
              '',
              t.homeHeroImageLabel,
              true,
              current.heroImages,
            )}
            {renderImageUpload(
              'panorama',
              current.panoramaImageId,
              current.panoramaSourceFileId,
              t.homePanoramaImageLabel,
            )}
          </div>
        </section>
        <section
          className={styles.fieldGroup}
          aria-labelledby="home-worship-title"
        >
          <h2 id="home-worship-title" className={styles.groupTitle}>
            {t.homeWorshipSectionTitle}
          </h2>
          {videoUrls.map((url, index) => (
            <div className={styles.videoField} key={`worship-video-${index}`}>
              <InputField
                label={`${t.homeYoutubeVideoLabel} ${index + 1}`}
                value={url}
                onChange={(value) => {
                  const nextUrls = [...videoUrls];
                  nextUrls[index] = value;
                  updateVideoUrls(nextUrls);
                }}
                placeholder="https://youtu.be/xxxxxxxxxxx"
                inputMode="url"
              />
              <button
                type="button"
                className={styles.videoRemove}
                aria-label={`${t.homeRemoveVideo} ${index + 1}`}
                title={`${t.homeRemoveVideo} ${index + 1}`}
                onClick={() => {
                  updateVideoUrls(
                    videoUrls.map((item, itemIndex) =>
                      itemIndex === index ? '' : item,
                    ),
                  );
                }}
                disabled={!url.trim() || !isReady || isSaving}
              >
                <IoTrashOutline aria-hidden />
              </button>
            </div>
          ))}
          {!isVideoSelectionValid ? (
            <p className={styles.mediaHint} role="status">
              {t.homeVideoValidation}
            </p>
          ) : null}
        </section>
      </div>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            void save();
          }}
          disabled={
            !isReady ||
            !isDirty ||
            isSaving ||
            isImageUploading ||
            isImageOptimizing ||
            isImageCleaning ||
            !isVideoSelectionValid
          }
        >
          {t.homeSave}
        </Button>
      </div>

      <Dialog
        isOpen={conflict !== null}
        title={t.homeSaveConflictTitle}
        onClose={dismissConflict}
        closeLabel={t.homeSaveConflictKeep}
        size="sm"
        footer={
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={dismissConflict}>
              {t.homeSaveConflictKeep}
            </Button>
            <Button type="button" variant="primary" onClick={reloadLatest}>
              {t.homeSaveConflictReload}
            </Button>
          </div>
        }
      >
        <p>{t.homeSaveConflictMessage}</p>
      </Dialog>
    </div>
  );
}
