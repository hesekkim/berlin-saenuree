import type { PointerEvent } from 'react';
import { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { MdDragIndicator } from 'react-icons/md';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import Checkbox from '../../../../shared/components/ui/Checkbox/Checkbox';
import Upload from '../../../../shared/components/ui/Upload/Upload';
import RichTextEditor, {
  DEFAULT_RICH_TEXT_LABELS,
  DE_RICH_TEXT_LABELS,
  KO_RICH_TEXT_LABELS,
} from '../../../../shared/components/ui/RichTextEditor';
import {
  getPopupVisibilityStatus,
  type PopupVisibilityStatus,
} from '../../../../shared/popups/popupVisibility';
import { usePopupsAdmin } from './usePopupsAdmin';
import styles from '../Settings.module.css';
import popupStyles from './Popups.module.css';

function richTextLabelsForAdmin(language: string) {
  if (language === 'ko') {
    return KO_RICH_TEXT_LABELS;
  }
  if (language === 'de') {
    return DE_RICH_TEXT_LABELS;
  }
  return DEFAULT_RICH_TEXT_LABELS;
}

function visibilityLabel(
  status: PopupVisibilityStatus,
  labels: {
    popupsStatusLive: string;
    popupsStatusScheduled: string;
    popupsStatusEnded: string;
    popupsStatusDisabled: string;
  }
): string {
  switch (status) {
    case 'live':
      return labels.popupsStatusLive;
    case 'scheduled':
      return labels.popupsStatusScheduled;
    case 'ended':
      return labels.popupsStatusEnded;
    default:
      return labels.popupsStatusDisabled;
  }
}

export default function Popups() {
  const {
    labels,
    language,
    isSiteAdmin,
    loading,
    popups,
    siteLanguages,
    isDialogOpen,
    editingId,
    form,
    formError,
    isSaving,
    isOptimizing,
    canSave,
    pendingDeleteId,
    setPendingDeleteId,
    imageAccept,
    imageMaxBytes,
    uploadKey,
    uploadDefaults,
    draggingId,
    isReordering,
    openAdd,
    openEdit,
    closeDialog,
    updateForm,
    updateCopyBody,
    handleUploaded,
    handleUploadItemsChange,
    handleSave,
    handleConfirmDelete,
    handlePointerDragStart,
    handlePointerDragMove,
    handlePointerDragEnd,
  } = usePopupsAdmin();

  const pointerMoveRef = useRef(handlePointerDragMove);
  const pointerEndRef = useRef(handlePointerDragEnd);
  pointerMoveRef.current = handlePointerDragMove;
  pointerEndRef.current = handlePointerDragEnd;

  if (!isSiteAdmin) {
    return <Navigate to="/admin/settings" replace />;
  }

  const languageOptions = siteLanguages.map((code) => ({
    value: code,
    label: code,
  }));
  const typeOptions = [
    { value: 'notice', label: labels.popupsTypeNotice },
    { value: 'poster', label: labels.popupsTypePoster },
  ];
  const currentCopy = form.copies[form.editLanguage] ?? { body: '' };
  const formVisibility = getPopupVisibilityStatus({
    enabled: form.enabled,
    startsAt: form.startsAt
      ? new Date(`${form.startsAt}T00:00:00`).toISOString()
      : null,
    endsAt: form.endsAt
      ? new Date(`${form.endsAt}T23:59:59`).toISOString()
      : null,
  });

  const onHandlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    popupId: string
  ) => {
    if (isReordering || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handleEl = event.currentTarget;
    const pointerId = event.pointerId;
    handlePointerDragStart(popupId, event.clientX, event.clientY);

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      pointerMoveRef.current(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      handleEl.blur();
      void pointerEndRef.current();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>{labels.popupsTitle}</h1>
            <p className={styles.subtitle}>{labels.popupsSubtitle}</p>
          </div>
          <Button
            type="button"
            variant="primary"
            className={styles.sectionHeaderAction}
            onClick={openAdd}
            disabled={loading || popups.length >= 4}
          >
            {labels.popupsAdd}
          </Button>
        </div>
      </header>

      {loading ? (
        <p className={styles.emptyMessage}>…</p>
      ) : popups.length === 0 ? (
        <p className={styles.emptyMessage}>{labels.popupsEmpty}</p>
      ) : (
        <>
          {popups.length > 1 ? (
            <p className={popupStyles.listHint}>{labels.popupsReorderHint}</p>
          ) : null}
          <ul className={popupStyles.list}>
            {popups.map((popup) => {
              const preview =
                popup.name.trim() ||
                (popup.type === 'poster'
                  ? labels.popupsTypePoster
                  : labels.popupsTypeNotice);
              const typeLabel =
                popup.type === 'poster'
                  ? labels.popupsTypePoster
                  : labels.popupsTypeNotice;
              const status = getPopupVisibilityStatus(popup);
              const itemClass = [
                popupStyles.item,
                draggingId === popup.id ? popupStyles.itemDragging : '',
                isReordering ? popupStyles.itemDisabled : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <li
                  key={popup.id}
                  data-popup-id={popup.id}
                  className={itemClass}
                >
                  <button
                    type="button"
                    className={[
                      popupStyles.dragHandle,
                      draggingId === popup.id
                        ? popupStyles.dragHandleActive
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={isReordering}
                    aria-label={labels.popupsDragHandle}
                    onPointerDown={(event) =>
                      onHandlePointerDown(event, popup.id)
                    }
                  >
                    <MdDragIndicator aria-hidden="true" />
                  </button>
                  <div className={popupStyles.meta}>
                    <span className={popupStyles.name}>{preview}</span>
                    <span className={popupStyles.detail}>
                      {typeLabel}
                      {' · '}
                      {visibilityLabel(status, labels)}
                    </span>
                  </div>
                  <div className={popupStyles.actions}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openEdit(popup)}
                      disabled={isReordering}
                    >
                      {labels.popupsEdit}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setPendingDeleteId(popup.id)}
                      disabled={isReordering}
                    >
                      {labels.popupsDelete}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog
        isOpen={isDialogOpen}
        title={
          editingId ? labels.popupsDialogEditTitle : labels.popupsDialogAddTitle
        }
        onClose={() => closeDialog()}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        closeOnEscape={!isSaving && !isOptimizing}
        closeOnOverlayClick={!isSaving && !isOptimizing}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving || isOptimizing}
              onClick={() => closeDialog()}
            >
              {labels.popupsCancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canSave}
              onClick={() => {
                void handleSave();
              }}
            >
              {isSaving || isOptimizing
                ? labels.popupsSaving
                : labels.popupsSave}
            </Button>
          </>
        }
      >
        <div className={popupStyles.form}>
          {editingId ? (
            <div className={popupStyles.enabledBlock}>
              <label className={popupStyles.checkRow}>
                <Checkbox
                  checked={form.enabled}
                  onChange={(checked) => updateForm({ enabled: checked })}
                  ariaLabel={labels.popupsEnabledLabel}
                />
                <span>{labels.popupsEnabledLabel}</span>
              </label>
              <p className={popupStyles.fieldHint}>{labels.popupsEnabledHint}</p>
              {formVisibility === 'ended' ? (
                <p className={popupStyles.visibilityWarn} role="status">
                  {labels.popupsVisibilityEndedHint}
                </p>
              ) : null}
              {formVisibility === 'scheduled' ? (
                <p className={popupStyles.visibilityWarn} role="status">
                  {labels.popupsVisibilityScheduledHint}
                </p>
              ) : null}
            </div>
          ) : null}
          <InputField
            label={labels.popupsNameLabel}
            value={form.name}
            onChange={(value) => updateForm({ name: value })}
          />
          {!editingId ? (
            <Select
              label={labels.popupsTypeLabel}
              options={typeOptions}
              value={form.type}
              onChange={(value) =>
                updateForm({ type: value as 'notice' | 'poster' })
              }
            />
          ) : null}
          <InputField
            label={labels.popupsStartsAtLabel}
            type="date"
            value={form.startsAt}
            onChange={(value) => updateForm({ startsAt: value })}
          />
          <InputField
            label={labels.popupsEndsAtLabel}
            type="date"
            value={form.endsAt}
            onChange={(value) => updateForm({ endsAt: value })}
          />
          <p className={popupStyles.scheduleHint}>{labels.popupsScheduleHint}</p>

          {form.type === 'notice' ? (
            <>
              <Select
                label={labels.popupsLanguageLabel}
                options={languageOptions}
                value={form.editLanguage}
                onChange={(value) => updateForm({ editLanguage: value })}
              />
              <div className={popupStyles.richTextField}>
                <span className={popupStyles.richTextLabel}>
                  {labels.popupsBodyLabel}
                </span>
                <RichTextEditor
                  key={`${editingId ?? 'new'}-${form.editLanguage}`}
                  value={currentCopy.body}
                  onChange={updateCopyBody}
                  placeholder={labels.popupsBodyPlaceholder}
                  labels={richTextLabelsForAdmin(language)}
                  aria-label={labels.popupsBodyLabel}
                  disabled={isSaving || isOptimizing}
                />
              </div>
              <label className={popupStyles.colorRow}>
                <span className={popupStyles.colorLabel}>
                  {labels.popupsBackgroundColorLabel}
                </span>
                <input
                  type="color"
                  className={popupStyles.colorInput}
                  value={form.backgroundColor}
                  onChange={(event) =>
                    updateForm({ backgroundColor: event.target.value })
                  }
                  aria-label={labels.popupsBackgroundColorLabel}
                />
                <span className={popupStyles.colorValue}>
                  {form.backgroundColor}
                </span>
              </label>
            </>
          ) : null}

          <div className={popupStyles.imageBlock}>
            <p className={popupStyles.imageLabel}>{labels.popupsImageLabel}</p>
            <Upload
              key={uploadKey}
              accept={imageAccept}
              maxSizeBytes={imageMaxBytes}
              multiple={false}
              autoUpload
              defaultFiles={uploadDefaults}
              retainDefaultRemotes
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
              onUploaded={(files) => {
                void handleUploaded(files);
              }}
              onItemsChange={handleUploadItemsChange}
            />
          </div>

          {formError ? (
            <p className={popupStyles.error} role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        isOpen={Boolean(pendingDeleteId)}
        title={labels.popupsDeleteTitle}
        onClose={() => setPendingDeleteId(null)}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        showFooterDivider={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingDeleteId(null)}
            >
              {labels.popupsCancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                void handleConfirmDelete();
              }}
            >
              {labels.popupsDeleteConfirmAction}
            </Button>
          </>
        }
      >
        <p className={styles.confirmMessage}>{labels.popupsDeleteConfirm}</p>
      </Dialog>
    </div>
  );
}
