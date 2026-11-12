import { useEffect, useRef } from 'react';
import type { CmsFileRole } from '../../../../shared/api/cmsUsersApi';
import Button from '../../../../shared/components/ui/Button/Button';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select, {
  type SelectOption,
} from '../../../../shared/components/ui/Select/Select';
import TagSelector from '../../../../shared/components/ui/TagSelector/TagSelector';
import type { AdminTranslations } from '../../translations';
import styles from '../Settings.module.css';

type PageAdminUserDialogProps = {
  labels: AdminTranslations;
  isOpen: boolean;
  editingEmail: string | null;
  dialogName: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  dialogEmail: string;
  onEmailChange: (value: string) => void;
  emailError: string | null;
  dialogRole: CmsFileRole;
  onRoleChange: (value: CmsFileRole) => void;
  roleOptions: SelectOption[];
  pagesError: string | null;
  pageOptions: SelectOption[];
  selectedPages: { code: string; label: string; readOnly?: boolean }[];
  onAddPage: (slug: string) => void;
  onRemovePage: (slug: string) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  canSave: boolean;
};

export default function PageAdminUserDialog({
  labels,
  isOpen,
  editingEmail,
  dialogName,
  onNameChange,
  nameError,
  dialogEmail,
  onEmailChange,
  emailError,
  dialogRole,
  onRoleChange,
  roleOptions,
  pagesError,
  pageOptions,
  selectedPages,
  onAddPage,
  onRemovePage,
  onClose,
  onSave,
  isSaving,
  canSave,
}: PageAdminUserDialogProps) {
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (emailError) {
      emailInputRef.current?.focus();
    }
  }, [emailError]);

  return (
    <Dialog
      isOpen={isOpen}
      title={
        editingEmail
          ? labels.emailsDialogEditTitle
          : labels.emailsDialogAddTitle
      }
      onClose={onClose}
      closeLabel={labels.dialogCloseLabel}
      className="cms-theme"
      closeOnOverlayClick={false}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {labels.emailsCancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSave}
            disabled={!canSave}
          >
            {labels.emailsSave}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <InputField
          label={labels.emailsNameLabel}
          type="text"
          value={dialogName}
          onChange={onNameChange}
          placeholder={labels.emailsNamePlaceholder}
          disabled={isSaving}
          error={Boolean(nameError)}
          errorMessage={nameError ?? undefined}
        />
        <InputField
          label={labels.emailsEmailLabel}
          type="email"
          value={dialogEmail}
          onChange={onEmailChange}
          placeholder={labels.emailsEmailPlaceholder}
          disabled={Boolean(editingEmail) || isSaving}
          error={Boolean(emailError)}
          errorMessage={emailError ?? undefined}
          ref={emailInputRef}
        />
        {roleOptions.length > 1 ? (
          <Select
            label={labels.emailsRoleLabel}
            options={roleOptions}
            value={dialogRole}
            onChange={(value) => onRoleChange(value as CmsFileRole)}
            openOptionsLabel={labels.selectOpenOptionsLabel}
            closeOptionsLabel={labels.selectCloseOptionsLabel}
            disabled={isSaving}
          />
        ) : null}
        <Select
          label={labels.emailsPagesLabel}
          options={pageOptions}
          value={null}
          onChange={onAddPage}
          placeholder={labels.emailsPagesPlaceholder}
          openOptionsLabel={labels.selectOpenOptionsLabel}
          closeOptionsLabel={labels.selectCloseOptionsLabel}
          disabled={isSaving}
        />
        {pagesError ? <p className={styles.fieldError}>{pagesError}</p> : null}
        {selectedPages.length > 0 ? (
          <div className={styles.tagList}>
            {selectedPages.map((item) => (
              <TagSelector
                key={item.code}
                label={item.label}
                selected
                disabled={item.readOnly || isSaving}
                onRemove={
                  item.readOnly ? undefined : () => onRemovePage(item.code)
                }
                removeLabel={`${labels.emailsPagesRemoveLabel} ${item.label}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
