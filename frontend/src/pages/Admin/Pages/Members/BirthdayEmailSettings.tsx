import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import Button from '../../../../shared/components/ui/Button/Button';
import InputField from '../../../../shared/components/ui/InputField/InputField';
import LoadingSpinner from '../../../../shared/components/LoadingSpinner/LoadingSpinner';
import SlideToggle from '../../../../shared/components/ui/SlideToggle/SlideToggle';
import type { BirthdayEmailDelivery } from '../../../../shared/api/birthdayEmailApi';
import type { AdminTranslations } from '../../translations';
import useBirthdayEmailSettings from './useBirthdayEmailSettings';
import styles from './BirthdayEmailSettings.module.css';

type Props = {
  labels: AdminTranslations;
  language: string;
  canManage: boolean;
};

function RecipientAddressList({
  title,
  addresses,
}: {
  title: string;
  addresses: string[];
}) {
  return (
    <section className={styles.recipientAddressSection}>
      <h4>{title}</h4>
      {addresses.length > 0 ? (
        <ul>
          {addresses.map((address) => (
            <li key={address}>{address}</li>
          ))}
        </ul>
      ) : (
        <span>—</span>
      )}
    </section>
  );
}

function DeliveryRecipientSummary({
  delivery,
  labels,
}: {
  delivery: BirthdayEmailDelivery;
  labels: AdminTranslations;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHovered = useRef(false);
  const openedByClick = useRef(false);
  const popoverId = `birthday-email-recipients-${delivery.month}`;
  const recipients = delivery.recipients ?? [];
  const sentRecipients = delivery.sentRecipients ?? [];
  const failedRecipients = delivery.failedRecipients ?? [];
  const countLabel = labels.birthdayEmailRecipientSummary
    .replace('{count}', String(delivery.recipientCount))
    .replace('{failed}', String(delivery.failedRecipientCount));

  const cancelScheduledClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openOnHover = () => {
    cancelScheduledClose();
    isHovered.current = true;
    setIsOpen(true);
  };

  const scheduleClose = () => {
    isHovered.current = false;
    cancelScheduledClose();
    closeTimer.current = setTimeout(() => {
      if (!openedByClick.current) {
        setIsOpen(false);
      }
    }, 120);
  };

  const closePopover = () => {
    cancelScheduledClose();
    isHovered.current = false;
    openedByClick.current = false;
    setIsOpen(false);
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) {
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const padding = 16;
      const left = Math.max(
        padding,
        Math.min(
          triggerRect.left,
          window.innerWidth - popoverRect.width - padding,
        ),
      );
      let top = triggerRect.bottom + 8;
      if (top + popoverRect.height > window.innerHeight - padding) {
        top = Math.max(padding, triggerRect.top - popoverRect.height - 8);
      }
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const dismiss = (restoreFocus = false) => {
      cancelScheduledClose();
      isHovered.current = false;
      openedByClick.current = false;
      setIsOpen(false);
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    };
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (triggerRef.current?.contains(target) ||
          popoverRef.current?.contains(target))
      ) {
        return;
      }
      dismiss();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss(true);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(
    () => () => {
      cancelScheduledClose();
    },
    [],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.recipientSummary}
        aria-label={countLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        onFocus={() => setIsOpen(true)}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (
            nextTarget instanceof Node &&
            popoverRef.current?.contains(nextTarget)
          ) {
            return;
          }
          if (!isHovered.current) {
            closePopover();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            openOnHover();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            scheduleClose();
          }
        }}
        onClick={(event) => {
          if (event.detail === 0 || isHovered.current) {
            setIsOpen(true);
            return;
          }
          openedByClick.current = !openedByClick.current;
          setIsOpen(openedByClick.current);
        }}
      >
        <strong>{delivery.recipientCount}</strong>
        <span>{labels.birthdayEmailRecipientUnit}</span>
        {delivery.failedRecipientCount > 0 ? (
          <span className={styles.failedRecipientSummary}>
            {labels.birthdayEmailFailedRecipientSummary.replace(
              '{count}',
              String(delivery.failedRecipientCount),
            )}
          </span>
        ) : null}
      </button>
      {isOpen
        ? createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            className={styles.recipientDetailsPopover}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${popoverId}-title`}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                openOnHover();
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') {
                scheduleClose();
              }
            }}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                (triggerRef.current?.contains(nextTarget) ||
                  popoverRef.current?.contains(nextTarget))
              ) {
                return;
              }
              if (!isHovered.current) {
                closePopover();
              }
            }}
          >
            <header className={styles.recipientDetailsHeader}>
              <h3 id={`${popoverId}-title`}>
                {labels.birthdayEmailRecipientDetails}
              </h3>
            </header>
          {delivery.status === 'sending' ? (
            <RecipientAddressList
              title={labels.birthdayEmailRecipients}
              addresses={recipients}
            />
          ) : (
            <>
              <RecipientAddressList
                title={labels.birthdayEmailSentRecipients}
                addresses={sentRecipients}
              />
              <RecipientAddressList
                title={labels.birthdayEmailFailedRecipients}
                addresses={failedRecipients}
              />
              {sentRecipients.length + failedRecipients.length <
              delivery.recipientCount ? (
                <p className={styles.recipientDetailsHint}>
                  {labels.birthdayEmailNoRecipientDetails}
                </p>
              ) : null}
            </>
          )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function getStatusLabel(
  status: BirthdayEmailDelivery['status'],
  labels: AdminTranslations,
) {
  return {
    sending: labels.birthdayEmailStatusSending,
    sent: labels.birthdayEmailStatusSent,
    failed: labels.birthdayEmailStatusFailed,
  }[status];
}

function getErrorLabel(
  error: BirthdayEmailDelivery['error'],
  labels: AdminTranslations,
) {
  if (!error) {
    return '';
  }
  return (
    {
      email_sending_disabled: labels.birthdayEmailSendingDisabled,
      smtp_not_configured: labels.birthdayEmailSmtpNotConfigured,
      smtp_delivery_failed: labels.birthdayEmailSmtpDeliveryFailed,
    }[error] ?? labels.birthdayEmailSmtpDeliveryFailed
  );
}

export default function BirthdayEmailSettings({
  labels,
  language,
  canManage,
}: Props) {
  const {
    settings,
    enabled,
    updateEnabled,
    recipientInputs,
    recipientErrors,
    addRecipient,
    updateRecipient,
    removeRecipient,
    isLoading,
    isSaving,
    isUpdatingEnabled,
    error,
    saved,
    hasChanges,
    loadSettings,
    saveSettings,
  } = useBirthdayEmailSettings(labels, canManage);
  const isBusy = isSaving || isUpdatingEnabled;
  const history = settings?.deliveryHistory ?? [];
  const formatDeliveryTime = (value: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    }).format(new Date(value));

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headingRow}>
          <h2 className={styles.title}>{labels.birthdayEmailTitle}</h2>
          {canManage ? (
            <SlideToggle
              label={labels.birthdayEmailEnabled}
              checked={enabled}
              onChange={updateEnabled}
              disabled={isLoading || isBusy}
            />
          ) : (
            <p className={enabled ? styles.enabled : styles.disabled}>
              {enabled
                ? labels.birthdayEmailEnabledStatus
                : labels.birthdayEmailDisabledStatus}
            </p>
          )}
        </div>
        <p className={styles.schedule}>{labels.birthdayEmailSchedule}</p>
      </header>

      {isLoading ? (
        <LoadingSpinner text={labels.birthdayEmailLoading} />
      ) : error && !settings ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <Button type="button" variant="secondary" onClick={loadSettings}>
            {labels.membersRetry}
          </Button>
        </div>
      ) : (
        <div className={styles.content}>
          <section className={styles.settingsSection}>
            {canManage ? (
              <>
                <div className={styles.recipientSection}>
                  <div className={styles.recipientHeading}>
                    <h3 className={styles.sectionTitle}>
                      {labels.birthdayEmailRecipients}
                    </h3>
                    <button
                      type="button"
                      className={styles.addButton}
                      aria-label={labels.birthdayEmailAddRecipient}
                      title={labels.birthdayEmailAddRecipient}
                      disabled={isSaving}
                      onClick={addRecipient}
                    >
                      <FiPlus aria-hidden />
                    </button>
                  </div>
                  <div className={styles.recipientList}>
                    {recipientInputs.map((recipient, index) => {
                      const recipientLabel =
                        labels.birthdayEmailRecipientLabel.replace(
                          '{number}',
                          String(index + 1),
                        );
                      const recipientId = `birthday-email-recipient-${recipient.id}`;
                      return (
                        <div
                          className={styles.recipientItem}
                          key={recipient.id}
                        >
                          <label
                            className={styles.recipientLabel}
                            htmlFor={recipientId}
                          >
                            {recipientLabel}
                          </label>
                          <div className={styles.recipientRow}>
                            <InputField
                              id={recipientId}
                              label={recipientLabel}
                              hideLabel
                              type="email"
                              value={recipient.value}
                              onChange={(value) =>
                                updateRecipient(recipient.id, value)
                              }
                              maxLength={254}
                              autoComplete="email"
                              disabled={isSaving}
                              error={Boolean(recipientErrors[recipient.id])}
                              errorMessage={recipientErrors[recipient.id]}
                              className={styles.recipientField}
                            />
                            <button
                              type="button"
                              className={styles.removeRecipient}
                              aria-label={labels.birthdayEmailRemoveRecipient.replace(
                                '{number}',
                                String(index + 1),
                              )}
                              title={labels.birthdayEmailRemoveRecipient.replace(
                                '{number}',
                                String(index + 1),
                              )}
                              disabled={isSaving}
                              onClick={() => removeRecipient(recipient.id)}
                            >
                              <FiTrash2 aria-hidden />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className={styles.hint}>
                    {labels.birthdayEmailRecipientsHint}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={saveSettings}
                  disabled={isBusy || !hasChanges}
                >
                  {isSaving ? labels.birthdayEmailSaving : labels.membersSave}
                </Button>
              </>
            ) : null}
            {error ? (
              <p className={styles.errorMessage} role="alert">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className={styles.successMessage} role="status">
                {labels.birthdayEmailSaved}
              </p>
            ) : null}
          </section>
          <section className={styles.historySection}>
            <h3 className={styles.sectionTitle}>
              {labels.birthdayEmailHistory}
            </h3>
            {history.length > 0 ? (
              <div className={styles.historyScroller}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th scope="col">{labels.birthdayEmailMonth}</th>
                      <th scope="col">{labels.birthdayEmailResult}</th>
                      <th scope="col">{labels.birthdayEmailRecipientsCount}</th>
                      <th scope="col">{labels.birthdayEmailAttemptedAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((delivery) => (
                      <tr
                        key={delivery.month}
                      >
                        <td data-label={labels.birthdayEmailMonth}>
                          {delivery.month}
                        </td>
                        <td data-label={labels.birthdayEmailResult}>
                          <div className={styles.deliveryResult}>
                            <span
                              className={`${styles.status} ${styles[delivery.status]}`}
                            >
                              {getStatusLabel(delivery.status, labels)}
                            </span>
                            {delivery.error ? (
                              <span className={styles.errorHint}>
                                {getErrorLabel(delivery.error, labels)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td data-label={labels.birthdayEmailRecipientsCount}>
                          <DeliveryRecipientSummary
                            delivery={delivery}
                            labels={labels}
                          />
                        </td>
                        <td data-label={labels.birthdayEmailAttemptedAt}>
                          {formatDeliveryTime(delivery.attemptedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyHistory}>
                {labels.birthdayEmailNoDelivery}
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
