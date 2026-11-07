import { apiClient } from '../lib/axios';
import type { Language } from '../types/Language';
import type { CmsFileRole, CmsUser } from './authApi';

export type { CmsFileRole, CmsUser };

export async function fetchCmsUsers(): Promise<CmsUser[]> {
  const response = await apiClient.get<CmsUser[]>('/cms-users');
  return response.data;
}

export async function fetchAssignablePages(): Promise<string[]> {
  const response = await apiClient.get<{ pages: string[] }>(
    '/cms-users/assignable-pages'
  );
  return response.data.pages;
}

export async function createCmsUser(payload: {
  email: string;
  name: string;
  role?: CmsFileRole;
  pages: string[];
  adminLanguage?: Language;
}): Promise<CmsUser> {
  const response = await apiClient.post<CmsUser>('/cms-users', payload);
  return response.data;
}

export async function updateCmsUser(
  email: string,
  payload: {
    name: string;
    role: CmsFileRole;
    pages: string[];
  }
): Promise<CmsUser | null> {
  const response = await apiClient.put<CmsUser>(
    `/cms-users/${encodeURIComponent(email)}`,
    payload
  );
  // 204 when page_admin merge/revoke removes the last page (account deleted).
  if (response.status === 204 || !response.data) {
    return null;
  }
  return response.data;
}

export async function deleteCmsUser(email: string): Promise<void> {
  await apiClient.delete(`/cms-users/${encodeURIComponent(email)}`);
}
