import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoginModal } from '../../src/shared/components/LoginModal/useLoginModal';

const sendVerificationCode = vi.fn();
const verifyCode = vi.fn();

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => ({
    sendVerificationCode,
    verifyCode,
  }),
}));

function submitEvent() {
  return {
    preventDefault: vi.fn(),
  } as unknown as React.SubmitEvent<HTMLFormElement>;
}

describe('useLoginModal', () => {
  beforeEach(() => {
    sendVerificationCode.mockReset();
    verifyCode.mockReset();
  });

  it('moves to code step on successful send', async () => {
    sendVerificationCode.mockResolvedValue({ success: true, data: { email_sent: true } });

    const { result } = renderHook(() => useLoginModal());

    act(() => {
      result.current.setEmail('admin@example.com');
    });

    await act(async () => {
      await result.current.handleSendCode(submitEvent());
    });

    expect(result.current.step).toBe('code');
    expect(result.current.status).toEqual({
      kind: 'success',
      message: 'If this email is authorized, a verification code has been sent.',
    });
  });

  it('uses the same neutral message when email delivery is not confirmed', async () => {
    sendVerificationCode.mockResolvedValue({
      success: true,
      data: { email_sent: false },
    });

    const { result } = renderHook(() => useLoginModal());

    await act(async () => {
      await result.current.handleSendCode(submitEvent());
    });

    expect(result.current.step).toBe('code');
    expect(result.current.status).toEqual({
      kind: 'success',
      message: 'If this email is authorized, a verification code has been sent.',
    });
  });

  it('stays on email step when send fails', async () => {
    sendVerificationCode.mockResolvedValue({
      success: false,
      error: 'Not an admin email',
    });

    const { result } = renderHook(() => useLoginModal());

    await act(async () => {
      await result.current.handleSendCode(submitEvent());
    });

    expect(result.current.step).toBe('email');
    expect(result.current.status).toEqual({
      kind: 'error',
      message: 'Not an admin email',
    });
  });

  it('sets error when verification fails', async () => {
    verifyCode.mockResolvedValue({ success: false, error: 'Invalid code' });

    const { result } = renderHook(() => useLoginModal());

    act(() => {
      result.current.setEmail('admin@example.com');
      result.current.setCode('000000');
    });

    await act(async () => {
      await result.current.handleVerifyCode(submitEvent());
    });

    expect(result.current.status).toEqual({
      kind: 'error',
      message: 'Invalid code',
    });
  });

  it('resets form and calls onCancel', () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() => useLoginModal(onCancel));

    act(() => {
      result.current.setEmail('admin@example.com');
      result.current.setCode('123456');
      result.current.handleCancel();
    });

    expect(result.current.email).toBe('');
    expect(result.current.code).toBe('');
    expect(result.current.step).toBe('email');
    expect(result.current.status).toEqual({ kind: 'idle' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
