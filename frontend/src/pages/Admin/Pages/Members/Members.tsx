import { Navigate } from 'react-router-dom';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Checkbox from '../../../../shared/components/ui/Checkbox/Checkbox';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { canAccessMembers, canManageMembers } from '../../adminNav';
import BulkDeleteDialog from '../../components/BulkDeleteDialog';
import PageSelectionControls from '../../components/PageSelectionControls';
import useMembersPage from './useMembersPage';
import styles from './Members.module.css';

export default function Members() {
  const { role, effectivePages } = useAuth();
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const canView = canAccessMembers(role, effectivePages);
  const canManage = canManageMembers(role, effectivePages);
  const {
    pageContainerRef,
    members,
    isLoading,
    loadError,
    isMutating,
    loadMembers,
    selectedIds,
    toggleSelection,
    isBulkDeleteOpen,
    isMemberDialogOpen,
    editingMember,
    pendingDelete,
    expandedIds,
    pageCount,
    currentPage,
    pageMembers,
    allSelected,
    indeterminate,
    form,
    formErrors,
    canSaveMember,
    selectionControlsProps,
    bulkDeleteConfirmMessage,
    openAddDialog,
    openEditDialog,
    closeMemberDialog,
    updateFormField,
    saveMember,
    confirmMemberDelete,
    confirmBulkDelete,
    closeBulkDelete,
    closePendingDelete,
    requestMemberDelete,
    toggleExpanded,
    toggleAllMembers,
    goToPage,
    formatBirthDate,
  } = useMembersPage(labels, language, canView);

  if (!canView) {
    return <Navigate to="/admin/settings" replace />;
  }

  return (
    <div ref={pageContainerRef} className={styles.page}>
      <header className={styles.header}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{labels.membersTitle}</h1>
            {!isLoading && !loadError ? (
              <p className={styles.total}>
                {labels.membersTotal.replace('{count}', String(members.length))}
              </p>
            ) : null}
          </div>
          {canManage ? (
            <Button
              type="button"
              variant="primary"
              className={styles.headerAction}
              onClick={openAddDialog}
              disabled={isLoading || isMutating}
            >
              {labels.membersAdd}
            </Button>
          ) : null}
        </div>
        <div className={styles.descriptionRow}>
          <p className={styles.description}>{labels.membersDescription}</p>
          {canManage && !isLoading && !loadError && members.length > 0 ? (
            <PageSelectionControls
              {...selectionControlsProps}
              className={styles.memberBulkControls}
            />
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <LoadingSpinner text={labels.membersLoading} />
      ) : loadError ? (
        <div className={styles.loadError} role="alert">
          <p>{loadError}</p>
          <Button type="button" variant="secondary" onClick={loadMembers}>
            {labels.membersRetry}
          </Button>
        </div>
      ) : members.length > 0 ? (
        <>
          <div className={styles.memberList}>
            <ul className={styles.memberListBody}>
              <li
                className={[
                  styles.memberColumnHeader,
                  canManage ? styles.memberColumnHeaderSelectable : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {canManage ? (
                  <div className={styles.memberColumnHeaderSelection}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={indeterminate}
                      disabled={isMutating}
                      ariaLabel={labels.membersBulkSelectAll}
                      onChange={toggleAllMembers}
                    />
                  </div>
                ) : null}
                {canManage ? (
                  <PageSelectionControls
                    {...selectionControlsProps}
                    className={styles.memberBulkControlsMobile}
                  />
                ) : null}
                <span>{labels.membersName}</span>
                <span>{labels.membersEmailColumn}</span>
                <span>{labels.membersBirthDate}</span>
                <span>{labels.membersPhoneColumn}</span>
                {canManage ? (
                  <span
                    className={styles.memberActionsColumnSizer}
                    aria-hidden="true"
                  >
                    <span>{labels.membersEdit}</span>
                    <span>{labels.membersDeleteAction}</span>
                  </span>
                ) : null}
              </li>
              {pageMembers.map((member) => {
                const expanded = expandedIds.includes(member.id);
                const detailsId = `member-details-${member.id}`;
                const formattedBirthDate = formatBirthDate(member.birthDate);

                return (
                  <li
                    key={member.id}
                    className={[
                      styles.memberRow,
                      canManage ? styles.memberRowSelectable : '',
                      expanded ? styles.memberRowExpanded : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className={styles.memberRowTop}>
                      {canManage ? (
                        <div className={styles.memberSelection}>
                          <Checkbox
                            checked={selectedIds.has(member.id)}
                            disabled={isMutating}
                            ariaLabel={labels.membersBulkSelectItem.replace(
                              '{name}',
                              member.name,
                            )}
                            onChange={(checked) =>
                              toggleSelection(member.id, checked)
                            }
                          />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={styles.memberExpandToggle}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        aria-label={`${member.name}, ${labels.membersBirthDate}: ${formattedBirthDate}, ${
                          expanded
                            ? labels.membersCollapseRow
                            : labels.membersExpandRow
                        }`}
                        onClick={() => toggleExpanded(member.id)}
                      >
                        <span className={styles.memberIdentity}>
                          <span className={styles.memberName}>
                            {member.name}
                          </span>
                          <span
                            className={styles.memberDateMobile}
                            aria-label={`${labels.membersBirthDate}: ${formattedBirthDate}`}
                          >
                            {formattedBirthDate}
                          </span>
                        </span>
                        <span className={styles.memberChevron} aria-hidden>
                          {expanded ? '▾' : '▸'}
                        </span>
                      </button>
                      <span
                        className={`${styles.memberName} ${styles.memberNameDesktop}`}
                      >
                        {member.name}
                      </span>
                      <span
                        className={styles.memberDateDesktop}
                        aria-label={`${labels.membersBirthDate}: ${formattedBirthDate}`}
                      >
                        {formattedBirthDate}
                      </span>
                      {canManage ? (
                        <div className={styles.memberActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            className={styles.memberActionText}
                            onClick={() => openEditDialog(member)}
                            disabled={isMutating}
                          >
                            {labels.membersEdit}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className={styles.memberActionText}
                            onClick={() => requestMemberDelete(member)}
                            disabled={isMutating}
                          >
                            {labels.membersDeleteAction}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className={styles.memberActionIcon}
                            icon={<FiEdit2 />}
                            aria-label={labels.membersEdit}
                            title={labels.membersEdit}
                            onClick={() => openEditDialog(member)}
                            disabled={isMutating}
                          />
                          <Button
                            type="button"
                            variant="danger"
                            className={styles.memberActionIcon}
                            icon={<FiTrash2 />}
                            aria-label={labels.membersDeleteAction}
                            title={labels.membersDeleteAction}
                            onClick={() => requestMemberDelete(member)}
                            disabled={isMutating}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div id={detailsId} className={styles.memberDetails}>
                      <span
                        className={`${styles.memberCell} ${styles.memberEmail}`}
                        data-label={labels.membersEmailColumn}
                      >
                        {member.email || '—'}
                      </span>
                      <span
                        className={`${styles.memberCell} ${styles.memberPhone}`}
                        data-label={labels.membersPhoneColumn}
                      >
                        {member.phone || '—'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <nav
            className={styles.pagination}
            aria-label={labels.membersPaginationLabel}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading || isMutating}
            >
              {labels.membersPagePrevious}
            </Button>
            <span className={styles.paginationLabel}>
              {currentPage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => goToPage(currentPage + 1)}
              disabled={
                currentPage >= pageCount || isLoading || isMutating
              }
            >
              {labels.membersPageNext}
            </Button>
          </nav>
        </>
      ) : (
        <p className={styles.emptyMessage}>{labels.membersEmpty}</p>
      )}

      <Dialog
        isOpen={isMemberDialogOpen}
        title={
          editingMember ? labels.membersEditTitle : labels.membersAddTitle
        }
        onClose={closeMemberDialog}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        closeOnOverlayClick={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeMemberDialog}
              disabled={isMutating}
            >
              {labels.membersCancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={saveMember}
              disabled={!canSaveMember}
            >
              {labels.membersSave}
            </Button>
          </>
        }
      >
        <div className={styles.dialogBody}>
          <InputField
            label={labels.membersName}
            value={form.name}
            onChange={(value) => updateFormField('name', value)}
            required
            maxLength={120}
            disabled={isMutating}
            error={Boolean(formErrors.name)}
            errorMessage={formErrors.name}
          />
          <InputField
            label={labels.membersBirthDate}
            type="date"
            value={form.birthDate}
            onChange={(value) => updateFormField('birthDate', value)}
            required
            disabled={isMutating}
            error={Boolean(formErrors.birthDate)}
            errorMessage={formErrors.birthDate}
          />
          <InputField
            label={labels.membersEmail}
            type="email"
            value={form.email}
            onChange={(value) => updateFormField('email', value)}
            maxLength={254}
            disabled={isMutating}
            error={Boolean(formErrors.email)}
            errorMessage={formErrors.email}
          />
          <InputField
            label={labels.membersPhone}
            type="tel"
            value={form.phone}
            onChange={(value) => updateFormField('phone', value)}
            maxLength={40}
            disabled={isMutating}
            error={Boolean(formErrors.phone)}
            errorMessage={formErrors.phone}
          />
        </div>
      </Dialog>

      <BulkDeleteDialog
        isOpen={isBulkDeleteOpen}
        isBusy={isMutating}
        title={labels.membersBulkDeleteTitle}
        message={bulkDeleteConfirmMessage}
        closeLabel={labels.dialogCloseLabel}
        cancelLabel={labels.bulkDeleteCancel}
        confirmLabel={labels.bulkDelete}
        onClose={closeBulkDelete}
        onConfirm={confirmBulkDelete}
      />

      <Dialog
        isOpen={pendingDelete !== null}
        title={labels.membersDeleteTitle}
        onClose={closePendingDelete}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        closeOnOverlayClick={false}
        showFooterDivider={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closePendingDelete}
              disabled={isMutating}
            >
              {labels.membersDeleteCancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmMemberDelete}
              disabled={!pendingDelete || isMutating}
            >
              {labels.membersDeleteAction}
            </Button>
          </>
        }
      >
        <p className={styles.confirmMessage}>
          {labels.membersDeleteMessage.replaceAll(
            '{name}',
            pendingDelete?.name ?? '',
          )}
        </p>
      </Dialog>
    </div>
  );
}
