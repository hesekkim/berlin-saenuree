import Button from '../../../shared/components/ui/Button/Button';
import Dialog from '../../../shared/components/ui/Dialog/Dialog';
import Select from '../../../shared/components/ui/Select/Select';
import TagSelector from '../../../shared/components/ui/TagSelector/TagSelector';
import SlideToggle from '../../../shared/components/ui/SlideToggle/SlideToggle';
import PageAdminDeleteDialog from './components/PageAdminDeleteDialog';
import PageAdminSection from './components/PageAdminSection';
import PageAdminUserDialog from './components/PageAdminUserDialog';
import { useSettings } from './hooks/useSettings';
import styles from './Settings.module.css';

export default function Settings() {
  const {
    labels,
    isSiteAdmin,
    showCmsAccountsSection,
    canManageCmsAccounts,
    usersLoading,
    language,
    darkMode,
    setDarkMode,
    languageOptions,
    handleLanguageChange,
    siteLanguageOptions,
    selectedSiteLanguages,
    defaultLanguage,
    defaultLanguageOptions,
    handleDefaultLanguageChange,
    handleAddSiteLanguage,
    handleRemoveSiteLanguage,
    isRemoveDialogOpen,
    removeConfirmMessage,
    handleCancelRemoveSiteLanguage,
    handleConfirmRemoveSiteLanguage,
    userRows,
    openAddUserDialog,
    openEditUserDialog,
    pendingDeleteEmail,
    setPendingDeleteEmail,
    handleConfirmDeleteUser,
    isUserDialogOpen,
    editingEmail,
    dialogName,
    setDialogName,
    nameError,
    dialogEmail,
    setDialogEmail,
    emailError,
    dialogRole,
    setDialogRole,
    roleOptions,
    pagesError,
    pageOptions,
    selectedDialogPages,
    handleAddDialogPage,
    handleRemoveDialogPage,
    closeUserDialog,
    handleSaveUser,
    isSavingUser,
    canSaveUser,
  } = useSettings();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{labels.settingsTitle}</h1>
          <SlideToggle
            label={labels.darkModeLabel}
            checked={darkMode}
            onChange={setDarkMode}
          />
        </div>
        {isSiteAdmin ? (
          <p className={styles.subtitle}>{labels.settingsSubtitle}</p>
        ) : null}
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{labels.languageSectionTitle}</h2>
        <p className={styles.sectionDesc}>{labels.languageSectionDesc}</p>
        <div className={styles.control}>
          <Select
            label={labels.languageLabel}
            options={languageOptions}
            value={language}
            onChange={handleLanguageChange}
          />
        </div>
      </section>

      {isSiteAdmin ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {labels.siteLanguagesSectionTitle}
          </h2>
          <p className={styles.sectionDesc}>
            {labels.siteLanguagesSectionDesc}
          </p>
          <div className={styles.control}>
            <Select
              label={labels.siteLanguagesLabel}
              options={siteLanguageOptions}
              value={null}
              onChange={handleAddSiteLanguage}
              placeholder={labels.siteLanguagesPlaceholder}
              searchable
              searchPlaceholder={labels.siteLanguagesSearchPlaceholder}
              emptyMessage={labels.siteLanguagesEmptyMessage}
              openOptionsLabel={labels.selectOpenOptionsLabel}
              closeOptionsLabel={labels.selectCloseOptionsLabel}
            />
          </div>
          <div className={styles.control}>
            <Select
              label={labels.siteLanguagesDefaultLabel}
              options={defaultLanguageOptions}
              value={defaultLanguage}
              onChange={handleDefaultLanguageChange}
              openOptionsLabel={labels.selectOpenOptionsLabel}
              closeOptionsLabel={labels.selectCloseOptionsLabel}
            />
          </div>
          <p className={styles.sectionDesc}>
            {labels.siteLanguagesDefaultHint}
          </p>
          {selectedSiteLanguages.length > 0 ? (
            <div className={styles.tagList}>
              {selectedSiteLanguages.map((item) => (
                <TagSelector
                  key={item.code}
                  label={
                    item.isDefault
                      ? `${item.label} (${labels.siteLanguagesDefaultBadge})`
                      : item.label
                  }
                  selected
                  disabled={!item.canRemove}
                  onRemove={() => handleRemoveSiteLanguage(item.code)}
                  removeLabel={`${labels.siteLanguagesRemoveLabel} ${item.label}`}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {showCmsAccountsSection ? (
        <PageAdminSection
          labels={labels}
          userRows={userRows}
          usersLoading={usersLoading}
          canManage={canManageCmsAccounts}
          isSiteAdmin={isSiteAdmin}
          onAdd={openAddUserDialog}
          onEdit={openEditUserDialog}
          onDelete={setPendingDeleteEmail}
        />
      ) : null}

      <Dialog
        isOpen={isRemoveDialogOpen}
        title={labels.siteLanguagesRemoveTitle}
        onClose={handleCancelRemoveSiteLanguage}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        showFooterDivider={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancelRemoveSiteLanguage}
            >
              {labels.siteLanguagesRemoveCancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmRemoveSiteLanguage}
            >
              {labels.siteLanguagesRemoveConfirmAction}
            </Button>
          </>
        }
      >
        <p className={styles.confirmMessage}>{removeConfirmMessage}</p>
      </Dialog>

      <PageAdminUserDialog
        labels={labels}
        isOpen={isUserDialogOpen}
        editingEmail={editingEmail}
        dialogName={dialogName}
        onNameChange={setDialogName}
        nameError={nameError}
        dialogEmail={dialogEmail}
        onEmailChange={setDialogEmail}
        emailError={emailError}
        dialogRole={dialogRole}
        onRoleChange={setDialogRole}
        roleOptions={roleOptions}
        pagesError={pagesError}
        pageOptions={pageOptions}
        selectedPages={selectedDialogPages}
        onAddPage={handleAddDialogPage}
        onRemovePage={handleRemoveDialogPage}
        onClose={closeUserDialog}
        onSave={handleSaveUser}
        isSaving={isSavingUser}
        canSave={canSaveUser}
      />

      <PageAdminDeleteDialog
        labels={labels}
        email={pendingDeleteEmail}
        isRevoke={!isSiteAdmin}
        onClose={() => setPendingDeleteEmail(null)}
        onConfirm={handleConfirmDeleteUser}
      />
    </div>
  );
}
