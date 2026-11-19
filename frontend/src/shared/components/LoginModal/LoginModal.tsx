import Button from '../ui/Button/Button';
import Dialog from '../ui/Dialog/Dialog';
import InputField from '../ui/InputField/InputField';
import styles from './LoginModal.module.css';
import { useLoginModal } from './useLoginModal';

export interface LoginModalProps {
  isOpen: boolean;
  onCancel?: () => void;
}

export default function LoginModal({ isOpen, onCancel }: LoginModalProps) {
  const {
    email,
    setEmail,
    code,
    setCode,
    step,
    status,
    isLoading,
    handleSendCode,
    handleVerifyCode,
    handleCancel,
    handleBackToEmail,
  } = useLoginModal(onCancel);

  const statusBanner =
    status.kind === 'error' || status.kind === 'success' ? (
      <div className={styles[status.kind]}>{status.message}</div>
    ) : null;

  return (
    <Dialog
      isOpen={isOpen}
      title="Admin Login"
      onClose={handleCancel}
      closeLabel="Close"
      className={`cms-theme ${styles.dialog}`}
    >
      {step === 'email' ? (
        <form onSubmit={handleSendCode} className={styles.form}>
          <div className={styles.field}>
            <InputField
              label="Admin Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="Enter your admin email"
              autoFocus
              required
              disabled={isLoading}
            />
          </div>

          {statusBanner}

          <div className={styles.footer}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Code'}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className={styles.form}>
          <div className={styles.field}>
            <InputField
              label="Verification Code"
              type="text"
              value={code}
              onChange={setCode}
              placeholder="Enter 6-digit code"
              maxLength={6}
              pattern="[0-9]{6}"
              inputMode="numeric"
              autoFocus
              required
              disabled={isLoading}
            />
            <p className={styles.hint}>Code sent to: {email}</p>
          </div>

          {statusBanner}

          <div className={styles.footer}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleBackToEmail}
              disabled={isLoading}
            >
              Back
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify & Login'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
