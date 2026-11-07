import { apiClient } from '../lib/axios';

export type PopupType = 'poster' | 'notice';

export type PopupCopy = {
  /** Rich HTML subset from RichTextEditor (sanitized on save/load). */
  body: string;
};

export type Popup = {
  id: string;
  name: string;
  type: PopupType;
  enabled: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  contentRevision: number;
  imageId: string | null;
  sourceFileId: string | null;
  backgroundColor: string | null;
  copies: Record<string, PopupCopy>;
};

/** Public home contract from GET /popups */
export type PublishedPopup = {
  id: string;
  type: PopupType;
  sortOrder: number;
  imageId: string | null;
  backgroundColor: string | null;
  copies: Record<string, PopupCopy>;
};

export type PopupUpsert = {
  name: string;
  type: PopupType;
  enabled: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  imageId: string | null;
  sourceFileId: string | null;
  backgroundColor: string | null;
  copies: Record<string, PopupCopy>;
};

export async function fetchPublishedPopups(): Promise<PublishedPopup[]> {
  const response = await apiClient.get<PublishedPopup[]>('/popups');
  return response.data;
}

export async function fetchAdminPopups(): Promise<Popup[]> {
  const response = await apiClient.get<Popup[]>('/admin/popups');
  return response.data;
}

export async function createAdminPopup(payload: PopupUpsert): Promise<Popup> {
  const response = await apiClient.post<Popup>('/admin/popups', payload);
  return response.data;
}

export async function updateAdminPopup(
  id: string,
  payload: PopupUpsert
): Promise<Popup> {
  const response = await apiClient.put<Popup>(`/admin/popups/${id}`, payload);
  return response.data;
}

export async function deleteAdminPopup(id: string): Promise<void> {
  await apiClient.delete(`/admin/popups/${id}`);
}

export async function reorderAdminPopups(orderedIds: string[]): Promise<Popup[]> {
  const response = await apiClient.put<Popup[]>('/admin/popups/reorder', {
    orderedIds,
  });
  return response.data;
}
