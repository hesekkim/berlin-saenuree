import { useState } from 'react';
import type { CmsFileRole } from '../../../../shared/api/cmsUsersApi';
import Button from '../../../../shared/components/ui/Button/Button';
import type { AdminTranslations } from '../../translations';
import styles from '../Settings.module.css';

export type PageAdminRow = {
  email: string;
  name: string;
  role: CmsFileRole;
  roleLabel: string;
  pagesLabel: string;
  canMutate: boolean;
};

type PageAdminSectionProps = {
  labels: AdminTranslations;
  userRows: PageAdminRow[];
  usersLoading: boolean;
  canManage: boolean;
  isSiteAdmin: boolean;
  onAdd: () => void;
  onEdit: (user: PageAdminRow) => void;
  onDelete: (email: string) => void;
};

export default function PageAdminSection({
  labels,
  userRows,
  usersLoading,
  canManage,
  isSiteAdmin,
  onAdd,
  onEdit,
  onDelete,
}: PageAdminSectionProps) {
  const [expandedEmails, setExpandedEmails] = useState<string[]>([]);

  const toggleExpanded = (email: string) => {
    setExpandedEmails((current) =>
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email],
    );
  };

  const removeLabel = isSiteAdmin
    ? labels.emailsDeleteLabel
    : labels.emailsRevokeLabel;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{labels.emailsSectionTitle}</h2>
        <Button
          type="button"
          variant="primary"
          className={styles.sectionHeaderAction}
          onClick={onAdd}
          disabled={!canManage || usersLoading}
        >
          {labels.emailsAddButton}
        </Button>
      </div>
      <p className={styles.sectionDesc}>{labels.emailsSectionDesc}</p>

      {userRows.length > 0 ? (
        <div className={styles.userList}>
          <ul className={styles.userListBody}>
            {userRows.map((user) => {
              const expanded = expandedEmails.includes(user.email);
              const detailsId = `cms-user-details-${user.email}`;

              return (
                <li
                  key={user.email}
                  className={`${styles.userRow}${
                    expanded ? ` ${styles.userRowExpanded}` : ''
                  }`}
                >
                  <div className={styles.userRowTop}>
                    <button
                      type="button"
                      className={styles.userExpandToggle}
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      aria-label={
                        expanded
                          ? `${user.name}, ${labels.emailsCollapseRow}`
                          : `${user.name}, ${labels.emailsExpandRow}`
                      }
                      onClick={() => toggleExpanded(user.email)}
                    >
                      <span className={styles.userName}>{user.name}</span>
                      <span className={styles.userExpandChevron} aria-hidden>
                        {expanded ? '▾' : '▸'}
                      </span>
                    </button>
                    <span
                      className={`${styles.userName} ${styles.userNameDesktop}`}
                    >
                      {user.name}
                    </span>
                    {user.canMutate ? (
                      <div className={styles.userActions}>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onEdit(user)}
                        >
                          {labels.emailsEditLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => onDelete(user.email)}
                        >
                          {removeLabel}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div id={detailsId} className={styles.userDetails}>
                    <span
                      className={`${styles.userCell} ${styles.userMeta} ${styles.userEmail}`}
                      data-label={labels.emailsEmailLabel}
                    >
                      {user.email}
                    </span>
                    <span
                      className={`${styles.userCell} ${styles.userMeta} ${styles.userRole}`}
                      data-label={labels.emailsRoleLabel}
                    >
                      {user.roleLabel}
                    </span>
                    <span
                      className={`${styles.userCell} ${styles.userMeta} ${styles.userPages}`}
                      data-label={labels.emailsPagesColumnLabel}
                    >
                      {user.pagesLabel || '—'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : !usersLoading ? (
        canManage ? (
          <p className={styles.emptyMessage}>{labels.emailsEmptyList}</p>
        ) : (
          <p className={styles.errorMessage} role="alert">
            {labels.emailsUnavailable}
          </p>
        )
      ) : null}
    </section>
  );
}
