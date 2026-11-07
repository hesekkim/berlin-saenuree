import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type Step = 'email' | 'code';

type LoginStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'warning'; message: string };

const idleStatus: LoginStatus = { kind: 'idle' };

export function useLoginModal(onCancel?: () => void) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('email');
  const [status, setStatus] = useState<LoginStatus>(idleStatus);
  const { sendVerificationCode, verifyCode } = useAuth();

  const isLoading = status.kind === 'loading';

  const resetForm = () => {
    setEmail('');
    setCode('');
    setStatus(idleStatus);
    setStep('email');
  };

  const handleSendCode = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: 'loading' });

    const result = await sendVerificationCode(email);

    if (result.success) {
      if (result.data?.email_sent === false) {
        setStatus({
          kind: 'warning',
          message:
            'Email could not be sent. Check server logs for the verification code.',
        });
      } else {
        setStatus({
          kind: 'success',
          message: 'Verification code sent! Check your email.',
        });
      }
      setStep('code');
    } else {
      setStatus({
        kind: 'error',
        message: result.error || 'Failed to send verification code',
      });
    }
  };

  const handleVerifyCode = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: 'loading' });

    const result = await verifyCode(email, code);

    if (result.success) {
      setStatus({ kind: 'success', message: 'Login successful!' });
      setTimeout(() => {
        resetForm();
      }, 500);
    } else {
      setStatus({
        kind: 'error',
        message: result.error || 'Invalid verification code',
      });
    }
  };

  const handleCancel = () => {
    resetForm();
    onCancel?.();
  };

  const handleBackToEmail = () => {
    setCode('');
    setStatus(idleStatus);
    setStep('email');
  };

  return {
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
  };
}
