import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { useHomePageEditor } from './useHomePageEditor';
import styles from './HomePageEditor.module.css';

export default function HomePageEditor() {
  const { language: cmsLanguage } = useCmsConfig();
  const t = adminTranslations[cmsLanguage];
  const {
    editLanguage,
    editLanguageOptions,
    setEditLanguage,
    current,
    isReady,
    isSaving,
    conflict,
    updateField,
    save,
    reloadLatest,
    dismissConflict,
  } = useHomePageEditor();

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
        <InputField
          label={t.homeTitleLabel}
          value={current.title}
          onChange={(value) => updateField('title', value)}
        />
        <InputField
          label={t.homeSubtitleLabel}
          value={current.subtitle}
          onChange={(value) => updateField('subtitle', value)}
        />
        <InputField
          label={t.homeDescriptionLabel}
          value={current.description}
          onChange={(value) => updateField('description', value)}
          multiline
          rows={4}
        />
      </div>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            void save();
          }}
          disabled={!isReady || isSaving}
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
