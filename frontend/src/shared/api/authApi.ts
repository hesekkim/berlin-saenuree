import { apiClient } from '../lib/axios';
import type { Language } from '../types/Language';

export type CmsFileRole = 'page_admin' | 'page_manager';
export type CmsRole = 'site_admin' | CmsFileRole;

export type CmsMeResponse = {
  email: string;
  is_authenticated: boolean;
  name: string | null;
  role: CmsRole;
  pages: string[];
  effectivePages: string[];
  adminLanguage: Language;
  darkMode: boolean | null;
};

export type CmsUser = {
  email: string;
  name: string;
  role: CmsFileRole;
  pages: string[];
};

interface SendCodeResponse {
  message: string;
  email: string;
  email_sent?: boolean;
}

interface VerifyCodeResponse {
  access_token: string;
  token_type: string;
}

export async function sendVerificationCode(
  email: string,
): Promise<SendCodeResponse> {
  const response = await apiClient.post<SendCodeResponse>('/auth/send-code', {
    email,
  });
  return response.data;
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<VerifyCodeResponse> {
  const response = await apiClient.post<VerifyCodeResponse>(
    '/auth/verify-code',
    {
      email,
      code,
    },
  );
  return response.data;
}

export async function fetchMe(token?: string): Promise<CmsMeResponse> {
  const response = await apiClient.get<CmsMeResponse>('/auth/me', {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  return response.data;
}

export async function updateMyAdminLanguage(
  adminLanguage: Language,
): Promise<CmsMeResponse> {
  const response = await apiClient.patch<CmsMeResponse>('/auth/me', {
    adminLanguage,
  });
  return response.data;
}

export async function updateMyDarkMode(
  darkMode: boolean,
): Promise<CmsMeResponse> {
  const response = await apiClient.patch<CmsMeResponse>('/auth/me', {
    darkMode,
  });
  return response.data;
}

/** @deprecated Prefer fetchMe */
export async function verifyToken(token: string): Promise<CmsMeResponse> {
  return fetchMe(token);
}
