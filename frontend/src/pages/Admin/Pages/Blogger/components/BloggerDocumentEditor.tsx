import { useParams } from 'react-router-dom';
import Button from '../../../../../shared/components/ui/Button/Button';
import ConfirmDialog from '../../../../../shared/components/ui/ConfirmDialog/ConfirmDialog';
import InputField from '../../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../../shared/components/ui/Select/Select';
import SlideToggle from '../../../../../shared/components/ui/SlideToggle/SlideToggle';
import RichTextEditorEX from '../../../../../shared/components/ui/RichTextEditorEX';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../../translations';
import { useBloggerDocumentEditor } from '../hooks/useBloggerDocumentEditor';
import styles from './BloggerDocumentEditor.module.css';

type Props = {
  mode: 'create' | 'edit';
};

export default function BloggerDocumentEditor({ mode }: Props) {
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const { id } = useParams<{ id: string }>();
  const editor = useBloggerDocumentEditor({
    mode,
    bloggerId: mode === 'edit' ? id : undefined,
    labels,
  });

  if (editor.isLoading && !editor.isReady) {
    return (
      <main className={`cms-theme ${styles.page}`}>
        <p className={styles.status}>{labels.bloggerLoading}</p>
      </main>
    );
  }

  const primaryLabel =
    mode === 'create'
      ? editor.isSaving
        ? labels.bloggerSaving
        : labels.bloggerPublish
      : !editor.isEditing
        ? labels.bloggerEdit
        : editor.isSaving
          ? labels.bloggerSaving
          : labels.bloggerSave;

  return (
    <main className={`cms-theme ${styles.page}`}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <div className={styles.toolbarLeft}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>
                {mode === 'create'
                  ? labels.bloggerCreateTitle
                  : labels.bloggerEditTitle}
              </h1>
              {(mode === 'create' || editor.isEditing) &&
              editor.isDraftSaving ? (
                <p className={styles.draftStatus}>
                  {labels.bloggerDraftSaving}
                </p>
              ) : null}
              {(mode === 'create' || editor.isEditing) &&
              editor.hasServerDraft &&
              !editor.isDraftSaving ? (
                <p className={styles.draftStatus}>{labels.bloggerDraftSaved}</p>
              ) : null}
            </div>
          </div>
          <div className={styles.toolbarRight}>
            {mode === 'create' && editor.hasServerDraft ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => editor.setDeleteConfirmOpen(true)}
                disabled={editor.isSaving}
              >
                {labels.bloggerDelete}
              </Button>
            ) : null}
            {mode === 'edit' && editor.isEditing ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => editor.setDiscardDraftConfirmOpen(true)}
                disabled={editor.isSaving}
              >
                {labels.bloggerDiscardDraft}
              </Button>
            ) : null}
            {mode === 'edit' && !editor.isEditing && editor.canMutate ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => editor.setDeleteConfirmOpen(true)}
                disabled={editor.isSaving}
              >
                {labels.bloggerDelete}
              </Button>
            ) : null}
            {mode === 'create' ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  void editor.publish();
                }}
                disabled={
                  !editor.canPublishOrSave ||
                  editor.isSaving ||
                  editor.hasPublished
                }
              >
                {primaryLabel}
              </Button>
            ) : editor.isEditing ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  void editor.save();
                }}
                disabled={
                  !editor.canMutate ||
                  !editor.canPublishOrSave ||
                  !editor.canSave ||
                  editor.isSaving
                }
              >
                {primaryLabel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  void editor.beginEdit();
                }}
                disabled={!editor.canMutate || editor.isSaving}
              >
                {primaryLabel}
              </Button>
            )}
          </div>
        </div>
        <div className={styles.publishToggle}>
          <SlideToggle
            label={labels.bloggerPublishToggle}
            checked={editor.published}
            onChange={editor.setPublished}
            disabled={
              editor.isSaving ||
              !editor.canMutate ||
              (mode === 'edit' && !editor.isEditing)
            }
          />
        </div>
      </header>

      {editor.formError ? (
        <p className={styles.formError}>{editor.formError}</p>
      ) : null}

      {editor.isEditing && editor.conflictItem ? (
        <Button
          type="button"
          variant="secondary"
          onClick={editor.applyLatest}
          className={styles.conflictAction}
        >
          {labels.bloggerViewLatest}
        </Button>
      ) : null}

      <div className={styles.metaRow}>
        <InputField
          className={styles.titleField}
          label={labels.bloggerTitleLabel}
          value={editor.currentTitle}
          onChange={editor.setTitle}
          disabled={
            editor.isSaving ||
            !editor.canMutate ||
            (mode === 'edit' && !editor.isEditing)
          }
        />
        <Select
          className={styles.languageField}
          label={labels.bloggerLanguageLabel}
          options={editor.languageOptions}
          value={editor.editLanguage}
          onChange={editor.setEditLanguage}
          disabled={editor.isSaving || !editor.canMutate}
        />
      </div>

      <RichTextEditorEX
        className={styles.bodyEditor}
        ref={editor.editorRef}
        value={editor.currentBody}
        onChange={editor.setBody}
        aria-label={labels.bloggerBodyAriaLabel}
        placeholder={labels.bloggerBodyPlaceholder}
        disabled={
          editor.isSaving ||
          !editor.canMutate ||
          (mode === 'edit' && !editor.isEditing)
        }
      />

      <ConfirmDialog
        isOpen={mode === 'create' && editor.deleteConfirmOpen}
        title={labels.bloggerDraftDeleteTitle}
        onClose={() => editor.setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void editor.deleteDraft();
        }}
        closeLabel={labels.bloggerClose}
        cancelLabel={labels.bloggerCancel}
        confirmLabel={labels.bloggerDelete}
      >
        <p>{labels.bloggerDraftDeleteConfirm}</p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={mode === 'edit' && editor.deleteConfirmOpen}
        title={labels.bloggerDeleteTitle}
        onClose={() => editor.setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void editor.deleteItem();
        }}
        closeLabel={labels.bloggerClose}
        cancelLabel={labels.bloggerCancel}
        confirmLabel={labels.bloggerDelete}
      >
        <p>{labels.bloggerDeleteConfirm}</p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={mode === 'edit' && editor.discardDraftConfirmOpen}
        title={labels.bloggerEditDraftDiscardTitle}
        onClose={() => editor.setDiscardDraftConfirmOpen(false)}
        onConfirm={() => {
          void editor.discardEditDraft();
        }}
        closeLabel={labels.bloggerClose}
        cancelLabel={labels.bloggerCancel}
        confirmLabel={labels.bloggerDiscardDraft}
      >
        <p>{labels.bloggerEditDraftDiscardConfirm}</p>
      </ConfirmDialog>
    </main>
  );
}
