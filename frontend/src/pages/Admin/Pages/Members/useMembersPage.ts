import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChurchMember,
  CreateChurchMemberPayload,
} from '../../../../shared/api/churchMembersApi';
import { usePageSelection } from '../../hooks/usePageSelection';
import type { AdminTranslations } from '../../translations';
import {
  validateMemberForm,
  type MemberFormErrors,
  type MemberFormValues,
} from './memberValidation';
import { filterChurchMembers } from './memberFilters';
import useChurchMembers from './useChurchMembers';

const MEMBERS_PAGE_SIZE = 10;

type PrintRequest = {
  scope: 'selected' | 'filtered';
  members: ChurchMember[];
};

type ExportScope = PrintRequest['scope'];

export default function useMembersPage(
  labels: AdminTranslations,
  language: string,
  canView: boolean,
) {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const {
    selectedIds,
    toggle: toggleSelection,
    toggleAll: toggleAllSelection,
    replace: replaceSelection,
  } = usePageSelection();
  const membersState = useChurchMembers(labels, canView);
  const { members, isMutating, removeMember, removeMembers } = membersState;
  const [birthMonth, setBirthMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const filteredMembers = filterChurchMembers(
    members,
    { birthMonth, searchTerm },
    language,
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredMembers.length / MEMBERS_PAGE_SIZE),
  );

  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ChurchMember | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChurchMember | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope | null>(null);
  const [form, setForm] = useState<MemberFormValues>({
    name: '',
    email: '',
    birthDate: '',
    phone: '',
  });
  const [formErrors, setFormErrors] = useState<MemberFormErrors>({});

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const openAddDialog = () => {
    setEditingMember(null);
    setForm({ name: '', email: '', birthDate: '', phone: '' });
    setFormErrors({});
    setIsMemberDialogOpen(true);
  };

  const openEditDialog = (member: ChurchMember) => {
    setEditingMember(member);
    setForm({
      name: member.name,
      email: member.email ?? '',
      birthDate: member.birthDate,
      phone: member.phone ?? '',
    });
    setFormErrors({});
    setIsMemberDialogOpen(true);
  };

  const closeMemberDialog = () => {
    if (!isMutating) {
      setIsMemberDialogOpen(false);
      setEditingMember(null);
    }
  };

  const openBulkDelete = () => setIsBulkDeleteOpen(true);
  const closeBulkDelete = () => setIsBulkDeleteOpen(false);
  const closePendingDelete = () => {
    if (!isMutating) {
      setPendingDelete(null);
    }
  };
  const requestMemberDelete = (member: ChurchMember) =>
    setPendingDelete(member);

  const updateFormField = <K extends keyof MemberFormValues>(
    field: K,
    value: MemberFormValues[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const saveMember = async () => {
    const errors = validateMemberForm(form, labels);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload: CreateChurchMemberPayload = {
      name: form.name.trim(),
      birthDate: form.birthDate,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };
    const saved = editingMember
      ? await membersState.editMember(editingMember.id, payload)
      : await membersState.addMember(payload);
    if (saved) {
      setIsMemberDialogOpen(false);
      setEditingMember(null);
    }
  };

  const confirmMemberDelete = async () => {
    if (pendingDelete && (await removeMember(pendingDelete))) {
      toggleSelection(pendingDelete.id, false);
      setPendingDelete(null);
    }
  };

  const confirmBulkDelete = async () => {
    setIsBulkDeleteOpen(false);
    replaceSelection(await removeMembers([...selectedIds]));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    pageContainerRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const updateBirthMonth = (value: string) => {
    setBirthMonth(value);
    setPage(1);
  };
  const updateSearchTerm = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };
  const requestPrint = (scope: PrintRequest['scope']) => {
    const printMembers =
      scope === 'selected'
        ? members.filter((member) => selectedIds.has(member.id))
        : filteredMembers;
    if (printMembers.length > 0) {
      setPrintRequest({ scope, members: printMembers });
    }
  };
  const clearPrintRequest = useCallback(() => setPrintRequest(null), []);

  const formatBirthDate = (value: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00.000Z`));

  const hasMemberChanges =
    editingMember !== null &&
    (form.name.trim() !== editingMember.name.trim() ||
      form.birthDate !== editingMember.birthDate ||
      (form.email.trim() || null) !==
        (editingMember.email?.trim() || null) ||
      (form.phone.trim() || null) !==
        (editingMember.phone?.trim() || null));
  const canSaveMember =
    !isMutating &&
    Boolean(form.name.trim()) &&
    Boolean(form.birthDate) &&
    (editingMember === null || hasMemberChanges);
  const selectedCount = members.filter((member) =>
    selectedIds.has(member.id),
  ).length;
  const openExportDialog = () => {
    setExportScope(
      selectedCount === 0 && filteredMembers.length > 0 ? 'filtered' : null,
    );
    setIsExportDialogOpen(true);
  };
  const closeExportDialog = () => setIsExportDialogOpen(false);
  const confirmExport = () => {
    if (exportScope) {
      requestPrint(exportScope);
      setIsExportDialogOpen(false);
    }
  };
  const currentPage = Math.min(page, pageCount);
  const pageMembers = filteredMembers.slice(
    (currentPage - 1) * MEMBERS_PAGE_SIZE,
    currentPage * MEMBERS_PAGE_SIZE,
  );
  const selectedPageCount = pageMembers.filter((member) =>
    selectedIds.has(member.id),
  ).length;
  const allSelected =
    pageMembers.length > 0 && selectedPageCount === pageMembers.length;
  const indeterminate = selectedPageCount > 0 && !allSelected;
  const memberIds = pageMembers.map((member) => member.id);
  const toggleAllMembers = (checked: boolean) =>
    toggleAllSelection(memberIds, checked);
  const bulkDeleteLabel = labels.bulkDeleteHint.replace(
    '{count}',
    String(selectedCount),
  );
  const selectedCountLabel = labels.bulkSelectedCount.replace(
    '{count}',
    String(selectedCount),
  );
  const selectionControlsProps = {
    selectedCount,
    selectedCountLabel,
    deleteLabel: bulkDeleteLabel,
    onDelete: openBulkDelete,
    alwaysVisible: true,
    showWhenEmpty: true,
    disabled: isMutating,
  };

  return {
    members,
    filteredMembers,
    isLoading: membersState.isLoading,
    loadError: membersState.loadError,
    isMutating,
    loadMembers: membersState.loadMembers,
    pageContainerRef,
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
    birthMonth,
    searchTerm,
    hasActiveFilters:
      Boolean(birthMonth) ||
      Boolean(searchTerm.trim()),
    printRequest,
    isExportDialogOpen,
    exportScope,
    allSelected,
    indeterminate,
    selectedCount,
    form,
    formErrors,
    canSaveMember,
    selectionControlsProps,
    bulkDeleteConfirmMessage: labels.membersBulkDeleteConfirm.replace(
      '{count}',
      String(selectedCount),
    ),
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
    requestPrint,
    clearPrintRequest,
    openExportDialog,
    closeExportDialog,
    setExportScope,
    confirmExport,
    formatBirthDate,
  };
}
