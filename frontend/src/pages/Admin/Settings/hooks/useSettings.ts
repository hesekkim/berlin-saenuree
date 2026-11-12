import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  createCmsUser,
  deleteCmsUser,
  fetchAssignablePages,
  fetchCmsUsers,
  updateCmsUser,
  type CmsFileRole,
  type CmsUser,
} from '../../../../shared/api/cmsUsersApi';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import { useAuth } from '../../../../shared/context/AuthContext';
import { useConfig } from '../../../../shared/context/ConfigContext';
import { useCmsConfig } from '../../../../shared/context/CmsConfigContext';
import { getLanguageLabel } from '../../../../shared/config/siteLanguages';
import {
  WORLD_LANGUAGES,
  getWorldLanguageOptionLabel,
} from '../../../../shared/config/worldLanguages';
import { Language } from '../../../../shared/types/Language';
import { parseLanguage } from '../../../../shared/utils/parseLanguage';
import { getPageNode } from '../../adminNav';
import { adminTranslations, type AdminTranslations } from '../../translations';
import type { PageAdminRow } from '../components/PageAdminSection';
import {
  canMutateCmsAccount,
  canShowCmsAccountsSection,
  pagesForCmsUserSave,
} from '../utils/cmsAccountsAccess';

const LANGUAGE_OPTIONS = [
  { value: Language.EN, label: 'English' },
  { value: Language.KO, label: '한국어' },
  { value: Language.DE, label: 'Deutsch' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_ADMIN_FILE_ROLES: CmsFileRole[] = ['page_admin', 'page_manager'];
const PAGE_ADMIN_FILE_ROLES: CmsFileRole[] = ['page_manager'];

function pageLabel(slug: string, labels: AdminTranslations): string {
  const node = getPageNode(slug);
  if (node?.labelKey === 'home') {
    return labels.pageLabelHome;
  }
  if (node?.labelKey === 'visit') {
    return labels.pageLabelVisit;
  }
  if (node?.labelKey === 'churchHistory') {
    return labels.pageLabelChurchHistory;
  }
  if (node?.labelKey === 'posts') {
    return labels.pageLabelPosts;
  }
  if (node?.labelKey === 'blogger') {
    return labels.pageLabelBlogger;
  }
  return slug;
}

function roleLabel(role: CmsFileRole, labels: AdminTranslations): string {
  return role === 'page_manager'
    ? labels.emailsRolePageManager
    : labels.emailsRolePageAdmin;
}

export function useSettings() {
  const { role } = useAuth();
  const isSiteAdmin = role === 'site_admin';
  const defaultFileRole: CmsFileRole = isSiteAdmin
    ? 'page_admin'
    : 'page_manager';
  const fileRoles = isSiteAdmin ? SITE_ADMIN_FILE_ROLES : PAGE_ADMIN_FILE_ROLES;
  const { language, setLanguage, darkMode, setDarkMode } = useCmsConfig();
  const {
    availableLanguages,
    defaultLanguage,
    addAvailableLanguage,
    removeAvailableLanguage,
    setDefaultLanguage,
    pageAdminEnabled,
  } = useConfig();
  const toast = useToast();
  const labels = adminTranslations[language];
  const showCmsAccountsSection = canShowCmsAccountsSection(
    role,
    pageAdminEnabled,
  );

  const [pendingRemoveCode, setPendingRemoveCode] = useState<string | null>(
    null,
  );

  const [cmsUsers, setCmsUsers] = useState<CmsUser[]>([]);
  const [assignablePages, setAssignablePages] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [canManageCmsAccounts, setCanManageCmsAccounts] = useState(false);

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogEmail, setDialogEmail] = useState('');
  const [dialogRole, setDialogRole] = useState<CmsFileRole>('page_admin');
  const [dialogPages, setDialogPages] = useState<string[]>([]);
  const [readOnlyDialogPages, setReadOnlyDialogPages] = useState<string[]>([]);
  const [initialDialogName, setInitialDialogName] = useState('');
  const [initialDialogRole, setInitialDialogRole] =
    useState<CmsFileRole>('page_admin');
  const [initialDialogPages, setInitialDialogPages] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [pendingDeleteEmail, setPendingDeleteEmail] = useState<string | null>(
    null,
  );

  const reloadUsers = () => {
    if (!showCmsAccountsSection) {
      return;
    }
    setUsersLoading(true);
    Promise.all([fetchCmsUsers(), fetchAssignablePages()])
      .then(([users, pages]) => {
        setCmsUsers(users);
        setAssignablePages(pages);
        setCanManageCmsAccounts(true);
      })
      .catch(() => {
        toast.error(labels.emailsLoadFailed);
        setCmsUsers([]);
        setAssignablePages([]);
        setCanManageCmsAccounts(false);
      })
      .finally(() => {
        setUsersLoading(false);
      });
  };

  useEffect(() => {
    if (!showCmsAccountsSection) {
      setCanManageCmsAccounts(false);
      return;
    }
    reloadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when CMS accounts UI opens
  }, [showCmsAccountsSection]);

  const handleLanguageChange = (value: string) => {
    const next = parseLanguage(value);
    if (next) {
      setLanguage(next);
    }
  };

  const siteLanguageOptions = WORLD_LANGUAGES.filter(
    (item) => !availableLanguages.includes(item.code),
  ).map((item) => ({
    value: item.code,
    label: getWorldLanguageOptionLabel(item.code),
  }));

  const selectedSiteLanguages = availableLanguages.map((code) => {
    const isDefault = code === defaultLanguage;
    return {
      code,
      label: getLanguageLabel(code),
      isDefault,
      canRemove: availableLanguages.length > 1 && !isDefault,
    };
  });

  const defaultLanguageOptions = availableLanguages.map((code) => ({
    value: code,
    label: getLanguageLabel(code),
  }));

  const pendingRemoveName = pendingRemoveCode
    ? getLanguageLabel(pendingRemoveCode)
    : '';

  const removeConfirmMessage = pendingRemoveCode
    ? labels.siteLanguagesRemoveConfirm.replaceAll('{name}', pendingRemoveName)
    : '';

  const handleAddSiteLanguage = (code: string) => {
    const name = getLanguageLabel(code);
    void addAvailableLanguage(code)
      .then(() => {
        toast.info(labels.siteLanguagesAddSuccess.replaceAll('{name}', name));
      })
      .catch(() => {
        toast.error(labels.siteLanguagesAddFailed.replaceAll('{name}', name));
      });
  };

  const handleDefaultLanguageChange = (code: string) => {
    if (code === defaultLanguage) {
      return;
    }
    const name = getLanguageLabel(code);
    void setDefaultLanguage(code)
      .then(() => {
        toast.info(
          labels.siteLanguagesDefaultChanged.replaceAll('{name}', name),
        );
      })
      .catch(() => {
        toast.error(labels.siteLanguagesDefaultFailed);
      });
  };

  const handleRemoveSiteLanguage = (code: string) => {
    if (
      availableLanguages.length <= 1 ||
      !availableLanguages.includes(code) ||
      code === defaultLanguage
    ) {
      return;
    }
    setPendingRemoveCode(code);
  };

  const handleCancelRemoveSiteLanguage = () => {
    setPendingRemoveCode(null);
  };

  const handleConfirmRemoveSiteLanguage = () => {
    if (!pendingRemoveCode) {
      return;
    }

    const code = pendingRemoveCode;
    const name = getLanguageLabel(code);
    setPendingRemoveCode(null);

    void removeAvailableLanguage(code)
      .then(() => {
        toast.info(
          labels.siteLanguagesRemoveSuccess.replaceAll('{name}', name),
        );
      })
      .catch(() => {
        toast.error(
          labels.siteLanguagesRemoveFailed.replaceAll('{name}', name),
        );
      });
  };

  const pageOptions = assignablePages
    .filter((slug) => !dialogPages.includes(slug))
    .map((slug) => ({
      value: slug,
      label: pageLabel(slug, labels),
    }));

  const selectedDialogPages = [
    ...dialogPages.map((slug) => ({
      code: slug,
      label: pageLabel(slug, labels),
      readOnly: false,
    })),
    ...readOnlyDialogPages.map((slug) => ({
      code: slug,
      label: pageLabel(slug, labels),
      readOnly: true,
    })),
  ];

  const resetUserDialogFields = () => {
    setEditingEmail(null);
    setDialogName('');
    setDialogEmail('');
    setDialogRole(defaultFileRole);
    setDialogPages([]);
    setReadOnlyDialogPages([]);
    setInitialDialogName('');
    setInitialDialogRole(defaultFileRole);
    setInitialDialogPages([]);
    setNameError(null);
    setEmailError(null);
    setPagesError(null);
  };

  const canMutateUser = (userRole: CmsFileRole) =>
    canMutateCmsAccount(role, userRole, canManageCmsAccounts);

  const pagesForSavePayload = (pages: string[]) =>
    pagesForCmsUserSave(isSiteAdmin, pages, assignablePages);

  const openAddUserDialog = () => {
    if (!canManageCmsAccounts) {
      return;
    }
    resetUserDialogFields();
    setIsUserDialogOpen(true);
  };

  const openEditUserDialog = (user: PageAdminRow) => {
    if (!canMutateUser(user.role)) {
      return;
    }
    const existing = cmsUsers.find((item) => item.email === user.email);
    const pages = existing ? [...existing.pages] : [];
    const allowed = new Set(assignablePages);
    const editable = pages.filter((slug) => allowed.has(slug));
    const readOnly = pages.filter((slug) => !allowed.has(slug));
    setEditingEmail(user.email);
    setDialogName(user.name);
    setDialogEmail(user.email);
    setDialogRole(user.role);
    setDialogPages(editable);
    setReadOnlyDialogPages(readOnly);
    setInitialDialogName(user.name);
    setInitialDialogRole(user.role);
    setInitialDialogPages(editable);
    setNameError(null);
    setEmailError(null);
    setPagesError(null);
    setIsUserDialogOpen(true);
  };

  const closeUserDialog = () => {
    if (isSavingUser) {
      return;
    }
    setIsUserDialogOpen(false);
    resetUserDialogFields();
  };

  const handleDialogEmailChange = (value: string) => {
    setDialogEmail(value);
    if (!editingEmail) {
      setEmailError(
        value.trim() && !EMAIL_RE.test(value.trim())
          ? labels.emailsEmailInvalid
          : null,
      );
    }
  };

  const handleAddDialogPage = (slug: string) => {
    if (
      dialogPages.includes(slug) ||
      readOnlyDialogPages.includes(slug) ||
      !assignablePages.includes(slug)
    ) {
      return;
    }
    setDialogPages((current) => [...current, slug]);
    setPagesError(null);
  };

  const handleRemoveDialogPage = (slug: string) => {
    if (readOnlyDialogPages.includes(slug)) {
      return;
    }
    setDialogPages((current) => current.filter((item) => item !== slug));
  };

  const pagesEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) {
      return false;
    }
    const left = [...a].sort();
    const right = [...b].sort();
    return left.every((slug, index) => slug === right[index]);
  };

  const isDialogUnchanged =
    Boolean(editingEmail) &&
    dialogName.trim() === initialDialogName.trim() &&
    dialogRole === initialDialogRole &&
    pagesEqual(dialogPages, initialDialogPages);

  const handleSaveUser = () => {
    if (!canManageCmsAccounts) {
      return;
    }
    const email = dialogEmail.trim().toLowerCase();
    const name = dialogName.trim();
    let valid = true;

    if (!name) {
      setNameError(labels.emailsNameRequired);
      valid = false;
    } else {
      setNameError(null);
    }

    if (!editingEmail) {
      if (!email) {
        setEmailError(labels.emailsEmailRequired);
        valid = false;
      } else if (!EMAIL_RE.test(email)) {
        setEmailError(labels.emailsEmailInvalid);
        valid = false;
      } else {
        setEmailError(null);
      }
    }

    const pagesPayload = pagesForSavePayload(dialogPages);
    // Empty pages on edit would delete via merge; revoke must use Delete API.
    if (pagesPayload.length === 0) {
      setPagesError(labels.emailsPagesRequired);
      valid = false;
    } else {
      setPagesError(null);
    }

    if (isDialogUnchanged) {
      return;
    }

    if (!valid) {
      return;
    }

    setIsSavingUser(true);

    const request = editingEmail
      ? updateCmsUser(editingEmail, {
          name,
          role: dialogRole,
          pages: pagesPayload,
        })
      : createCmsUser({
          email,
          name,
          role: dialogRole,
          pages: pagesPayload,
        });

    void request
      .then(() => {
        toast.info(
          editingEmail ? labels.emailsUpdateSuccess : labels.emailsAddSuccess,
        );
        setIsUserDialogOpen(false);
        resetUserDialogFields();
        reloadUsers();
      })
      .catch((error) => {
        if (
          !editingEmail &&
          axios.isAxiosError(error) &&
          error.response?.status === 409
        ) {
          setEmailError(labels.emailsEmailDuplicate);
          return;
        }
        toast.error(
          editingEmail ? labels.emailsUpdateFailed : labels.emailsAddFailed,
        );
      })
      .finally(() => {
        setIsSavingUser(false);
      });
  };

  const handleConfirmDeleteUser = () => {
    if (!pendingDeleteEmail || !canManageCmsAccounts) {
      return;
    }
    const target = cmsUsers.find((user) => user.email === pendingDeleteEmail);
    if (!target || !canMutateUser(target.role)) {
      setPendingDeleteEmail(null);
      return;
    }
    const email = pendingDeleteEmail;
    setPendingDeleteEmail(null);

    void deleteCmsUser(email)
      .then(() => {
        toast.info(
          isSiteAdmin ? labels.emailsDeleteSuccess : labels.emailsRevokeSuccess,
        );
        reloadUsers();
      })
      .catch(() => {
        toast.error(
          isSiteAdmin ? labels.emailsDeleteFailed : labels.emailsRevokeFailed,
        );
      });
  };

  const userRows: PageAdminRow[] = cmsUsers.map((user) => ({
    email: user.email,
    name: user.name,
    role: user.role,
    roleLabel: roleLabel(user.role, labels),
    pagesLabel: user.pages.map((slug) => pageLabel(slug, labels)).join(', '),
    canMutate: canMutateUser(user.role),
  }));

  const roleOptions = fileRoles.map((fileRole) => ({
    value: fileRole,
    label: roleLabel(fileRole, labels),
  }));

  const canSaveUser = (() => {
    if (isSavingUser || !dialogName.trim()) {
      return false;
    }
    const pagesPayload = pagesForSavePayload(dialogPages);
    if (pagesPayload.length === 0) {
      return false;
    }
    if (editingEmail) {
      return !isDialogUnchanged;
    }
    return EMAIL_RE.test(dialogEmail.trim());
  })();

  return {
    labels,
    isSiteAdmin,
    showCmsAccountsSection,
    canManageCmsAccounts,
    usersLoading,
    language,
    darkMode,
    setDarkMode,
    languageOptions: LANGUAGE_OPTIONS,
    handleLanguageChange,
    siteLanguageOptions,
    selectedSiteLanguages,
    defaultLanguage,
    defaultLanguageOptions,
    handleDefaultLanguageChange,
    handleAddSiteLanguage,
    handleRemoveSiteLanguage,
    isRemoveDialogOpen: pendingRemoveCode !== null,
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
    setDialogEmail: handleDialogEmailChange,
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
  };
}
