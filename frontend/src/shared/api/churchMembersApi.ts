import { apiClient } from '../lib/axios';

export type ChurchMember = {
  id: string;
  name: string;
  email: string | null;
  birthDate: string;
  phone: string | null;
};

export type CreateChurchMemberPayload = {
  name: string;
  email?: string | null;
  birthDate: string;
  phone?: string | null;
};

export type UpdateChurchMemberPayload = CreateChurchMemberPayload;

export async function fetchChurchMembers(): Promise<ChurchMember[]> {
  const response = await apiClient.get<ChurchMember[]>('/admin/members');
  return response.data;
}

export async function createChurchMember(
  payload: CreateChurchMemberPayload,
): Promise<ChurchMember> {
  const response = await apiClient.post<ChurchMember>(
    '/admin/members',
    payload,
  );
  return response.data;
}

export async function updateChurchMember(
  id: string,
  payload: UpdateChurchMemberPayload,
): Promise<ChurchMember> {
  const response = await apiClient.put<ChurchMember>(
    `/admin/members/${encodeURIComponent(id)}`,
    payload,
  );
  return response.data;
}

export async function deleteChurchMember(id: string): Promise<void> {
  await apiClient.delete(`/admin/members/${encodeURIComponent(id)}`);
}
