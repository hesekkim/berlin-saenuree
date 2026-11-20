import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Navigate } from 'react-router-dom';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import Checkbox from '../../../../shared/components/ui/Checkbox/Checkbox';
import Dialog from '../../../../shared/components/ui/Dialog/Dialog';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import Select from '../../../../shared/components/ui/Select/Select';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { adminTranslations } from '../../translations';
import { canAccessMembers, canManageMembers } from '../../adminNav';
import BulkDeleteDialog from '../../components/BulkDeleteDialog';
import PageSelectionControls from '../../components/PageSelectionControls';
import BirthdayEmailSettings from './BirthdayEmailSettings';
import useMembersPage from './useMembersPage';
import styles from './Members.module.css';

export default function Members() {
  const { role, effectivePages } = useAuth();
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const canView = canAccessMembers(role, effectivePages);
  const canManage = canManageMembers(role, effectivePages);
  const canViewBirthdayEmail = role === 'site_admin' || role === 'page_admin';
  const [activeTab, setActiveTab] = useState<'directory' | 'birthdays'>(
    'directory',
  );
  const tabIdPrefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const {
    pageContainerRef,
    members,
    filteredMembers,
    isLoading,
    loadError,
    isMutating,
    loadMembers,
    selectedIds,
    selectedCount,
    toggleSelection,
    isBulkDeleteOpen,
    isMemberDialogOpen,
    editingMember,
    pendingDelete,
    expandedIds,
    pageCount,
    currentPage,
    pageMembers,
    birthMonth,
    searchTerm,
    hasActiveFilters,
    printRequest,
    isExportDialogOpen,
    exportScope,
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
    updateBirthMonth,
    updateSearchTerm,
    clearPrintRequest,
    openExportDialog,
    closeExportDialog,
    setExportScope,
    confirmExport,
    formatBirthDate,
  } = useMembersPage(labels, language, canView);
  useEffect(() => {
    if (!printRequest) {
      return;
    }

    const handleAfterPrint = () => clearPrintRequest();
    window.addEventListener('afterprint', handleAfterPrint);
    window.print();
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [clearPrintRequest, printRequest]);

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(language, {
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2020, index, 1))),
  );
  const monthOptions = [
    { value: '', label: labels.membersAllMonths },
    ...monthNames.map((monthName, index) => ({
      value: String(index + 1).padStart(2, '0'),
      label: monthName,
    })),
  ];
  const printFilterSummary =
    printRequest?.scope === 'filtered'
      ? [
          birthMonth
            ? `${labels.membersBirthMonthFilter}: ${monthNames[Number(birthMonth) - 1]}`
            : '',
          searchTerm.trim()
            ? `${labels.membersSearchLabel}: ${searchTerm.trim()}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ') || labels.membersPrintNoFilters
      : labels.membersPrintNoFilters;
  const printDate = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
  }).format(new Date());
  const tabs: { id: 'directory' | 'birthdays'; label: string }[] = [
    { id: 'directory' as const, label: labels.membersTab },
    ...(canViewBirthdayEmail
      ? [{ id: 'birthdays' as const, label: labels.birthdayEmailTab }]
      : []),
  ];

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  if (!canView) {
    return <Navigate to="/admin/settings" replace />;
  }

  return (
    <div ref={pageContainerRef} className={styles.page}>
      <header className={styles.header}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{labels.membersTitle}</h1>
            {activeTab === 'directory' && !isLoading && !loadError ? (
              <p className={styles.total}>
                {labels.membersTotal.replace('{count}', String(members.length))}
              </p>
            ) : null}
          </div>
          {canManage && activeTab === 'directory' ? (
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
        {activeTab === 'directory' ? (
          <div className={styles.descriptionRow}>
            <p className={styles.description}>{labels.membersDescription}</p>
          </div>
        ) : null}
      </header>

      {canViewBirthdayEmail ? (
        <div
          className={`${styles.tabs} ${
            activeTab === 'birthdays' ? styles.tabsConstrained : ''
          }`}
          role="tablist"
          aria-label={labels.membersTitle}
        >
          {tabs.map((tab, index) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`${tabIdPrefix}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
                tabIndex={isSelected ? 0 : -1}
                className={`${styles.tab} ${isSelected ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <section
        id={`${tabIdPrefix}-directory-panel`}
        className={styles.tabPanel}
        role={canViewBirthdayEmail ? 'tabpanel' : undefined}
        aria-labelledby={
          canViewBirthdayEmail ? `${tabIdPrefix}-directory-tab` : undefined
        }
        hidden={canViewBirthdayEmail && activeTab !== 'directory'}
        tabIndex={canViewBirthdayEmail ? 0 : undefined}
      >
        <div
          className={styles.filterToolbar}
          role="group"
          aria-label={labels.membersFilterLabel}
        >
          <div className={styles.filters}>
            <InputField
              label={labels.membersSearchLabel}
              type="search"
              value={searchTerm}
              onChange={updateSearchTerm}
              className={styles.filterSearch}
            />
            <Select
              label={labels.membersBirthMonthFilter}
              options={monthOptions}
              value={birthMonth}
              onChange={updateBirthMonth}
              className={styles.filterSelect}
            />
          </div>
          <div className={styles.filterActions}>
            <span className={styles.filterResultCount}>
              {labels.membersFilterResults.replace(
                '{count}',
                String(filteredMembers.length),
              )}
            </span>
            {canManage && !isLoading && !loadError && members.length > 0 ? (
              <PageSelectionControls
                {...selectionControlsProps}
                className={styles.memberBulkControls}
              />
            ) : null}
            {canView ? (
              <Button
                type="button"
                variant="secondary"
                onClick={openExportDialog}
                disabled={
                  isLoading ||
                  Boolean(loadError) ||
                  members.length === 0 ||
                  (selectedCount === 0 && filteredMembers.length === 0)
                }
              >
                {labels.membersExportButton}
              </Button>
            ) : null}
          </div>
        </div>
        {isLoading ? (
          <LoadingSpinner text={labels.membersLoading} />
        ) : loadError ? (
          <div className={styles.loadError} role="alert">
            <p>{loadError}</p>
            <Button type="button" variant="secondary" onClick={loadMembers}>
              {labels.membersRetry}
            </Button>
          </div>
        ) : filteredMembers.length > 0 ? (
          <>
            <div className={styles.memberList}>
              <ul className={styles.memberListBody}>
                <li
                  className={[
                    styles.memberColumnHeader,
                    canView ? styles.memberColumnHeaderSelectable : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {canView ? (
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
                        canView ? styles.memberRowSelectable : '',
                        expanded ? styles.memberRowExpanded : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className={styles.memberRowTop}>
                        {canView ? (
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
          <p className={styles.emptyMessage}>
            {members.length === 0
              ? labels.membersEmpty
              : labels.membersFilterEmpty}
          </p>
        )}
      </section>

      {canViewBirthdayEmail ? (
        <section
          id={`${tabIdPrefix}-birthdays-panel`}
          className={styles.tabPanel}
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-birthdays-tab`}
          hidden={activeTab !== 'birthdays'}
        >
          {activeTab === 'birthdays' ? (
            <BirthdayEmailSettings
              labels={labels}
              language={language}
              canManage={role === 'site_admin'}
            />
          ) : null}
        </section>
      ) : null}

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
        isOpen={isExportDialogOpen}
        title={labels.membersExportDialogTitle}
        onClose={closeExportDialog}
        closeLabel={labels.dialogCloseLabel}
        className="cms-theme"
        showFooterDivider={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeExportDialog}
            >
              {labels.membersCancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={confirmExport}
              disabled={exportScope === null}
            >
              {labels.membersExportConfirm}
            </Button>
          </>
        }
      >
        <fieldset className={styles.exportOptions}>
          <legend>{labels.membersExportDialogDescription}</legend>
          <label className={styles.exportOption}>
            <input
              type="radio"
              name="member-export-scope"
              value="selected"
              checked={exportScope === 'selected'}
              disabled={selectedCount === 0}
              onChange={() => setExportScope('selected')}
            />
            <span>
              {labels.membersExportSelectedCount.replace(
                '{count}',
                String(selectedCount),
              )}
            </span>
          </label>
          <label className={styles.exportOption}>
            <input
              type="radio"
              name="member-export-scope"
              value="filtered"
              checked={exportScope === 'filtered'}
              disabled={filteredMembers.length === 0}
              onChange={() => setExportScope('filtered')}
            />
            <span>
              {(hasActiveFilters
                ? labels.membersExportFilteredCount
                : labels.membersExportAllCount
              ).replace('{count}', String(filteredMembers.length))}
            </span>
          </label>
        </fieldset>
      </Dialog>

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
      {printRequest ? (
        <div className={styles.printDocument} aria-hidden="true">
          <h1>{labels.membersPrintTitle}</h1>
          <p>
            {(printRequest.scope === 'selected'
              ? labels.membersPrintSelected
              : labels.membersPrintFiltered
            ).replace('{count}', String(printRequest.members.length))}
          </p>
          <p>
            {labels.membersPrintGenerated.replace('{date}', printDate)}
          </p>
          <p>
            {labels.membersPrintFilters}: {printFilterSummary}
          </p>
          <table>
            <colgroup>
              <col className={styles.printNameColumn} />
              <col className={styles.printBirthDateColumn} />
              <col className={styles.printEmailColumn} />
              <col className={styles.printPhoneColumn} />
            </colgroup>
            <thead>
              <tr>
                <th>{labels.membersName}</th>
                <th>{labels.membersBirthDate}</th>
                <th>{labels.membersEmailColumn}</th>
                <th>{labels.membersPhoneColumn}</th>
              </tr>
            </thead>
            <tbody>
              {printRequest.members.map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{formatBirthDate(member.birthDate)}</td>
                  <td>{member.email || '—'}</td>
                  <td>{member.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
