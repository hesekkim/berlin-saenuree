import { apiClient } from '../lib/axios';

export type BloggerCopy = {
  title: string;
  body: string;
};

export type BloggerResponse = {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contentRevision: number;
  published: boolean;
  copies: Record<string, BloggerCopy>;
};

export type BloggerDraftResponse = {
  id: string;
  sourceBloggerId: string | null;
  sourceContentRevision: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contentRevision: number;
  published: boolean;
  copies: Record<string, BloggerCopy>;
};

export type BloggerListResponse = {
  items: BloggerResponse[];
  total: number;
  limit: number;
  offset: number;
};

export type BloggerTrashItem = {
  id: string;
  deletedAt: string;
  deletedBy: string;
  expiresAt: string;
  blogger: BloggerResponse;
};

export type BloggerTrashResponse = {
  items: BloggerTrashItem[];
  total: number;
};

export type BloggerUpsert = {
  published: boolean;
  contentRevision?: number | null;
  copies: Record<string, BloggerCopy>;
};

export type BloggerDraftUpsert = {
  published: boolean;
  contentRevision?: number | null;
  sourceContentRevision?: number | null;
  copies: Record<string, BloggerCopy>;
};

export type FetchAdminBloggerParams = {
  limit?: number;
  offset?: number;
  q?: string;
  created_by?: string;
  from?: string;
  to?: string;
  published?: boolean;
};

export async function fetchAdminBlogger(
  params: FetchAdminBloggerParams = {},
): Promise<BloggerListResponse> {
  const response = await apiClient.get<BloggerListResponse>('/admin/blogger', {
    params: {
      limit: params.limit,
      offset: params.offset,
      ...(params.q?.trim() ? { q: params.q.trim() } : {}),
      ...(params.created_by?.trim()
        ? { created_by: params.created_by.trim() }
        : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(params.published !== undefined
        ? { published: params.published }
        : {}),
    },
  });
  return response.data;
}

export async function fetchAdminBloggerItem(
  id: string,
): Promise<BloggerResponse> {
  const response = await apiClient.get<BloggerResponse>(`/admin/blogger/${id}`);
  return response.data;
}

export async function createAdminBlogger(
  payload: BloggerUpsert,
): Promise<BloggerResponse> {
  const response = await apiClient.post<BloggerResponse>(
    '/admin/blogger',
    payload,
  );
  return response.data;
}

export async function updateAdminBlogger(
  id: string,
  payload: BloggerUpsert,
): Promise<BloggerResponse> {
  const response = await apiClient.put<BloggerResponse>(
    `/admin/blogger/${id}`,
    payload,
  );
  return response.data;
}

export async function deleteAdminBlogger(id: string): Promise<void> {
  await apiClient.delete(`/admin/blogger/${id}`);
}

export async function fetchAdminBloggerTrash(): Promise<BloggerTrashResponse> {
  const response = await apiClient.get<BloggerTrashResponse>(
    '/admin/blogger/trash',
  );
  return response.data;
}

export async function restoreAdminBloggerTrash(
  id: string,
): Promise<BloggerResponse> {
  const response = await apiClient.post<BloggerResponse>(
    `/admin/blogger/trash/${id}/restore`,
  );
  return response.data;
}

export async function purgeAdminBloggerTrash(id: string): Promise<void> {
  await apiClient.delete(`/admin/blogger/trash/${id}`);
}

export async function fetchMyBloggerDraft(): Promise<BloggerDraftResponse | null> {
  const response = await apiClient.get<BloggerDraftResponse | null>(
    '/admin/blogger/drafts/me',
  );
  return response.data;
}

export async function fetchMyBloggerDrafts(): Promise<BloggerDraftResponse[]> {
  const response = await apiClient.get<BloggerDraftResponse[]>(
    '/admin/blogger/drafts',
  );
  return response.data;
}

export async function upsertMyBloggerDraft(
  payload: BloggerDraftUpsert,
): Promise<BloggerDraftResponse> {
  const response = await apiClient.put<BloggerDraftResponse>(
    '/admin/blogger/drafts/me',
    payload,
  );
  return response.data;
}

export async function deleteMyBloggerDraft(): Promise<void> {
  await apiClient.delete('/admin/blogger/drafts/me');
}

export async function fetchMyBloggerEditDraft(
  bloggerId: string,
): Promise<BloggerDraftResponse | null> {
  const response = await apiClient.get<BloggerDraftResponse | null>(
    `/admin/blogger/${bloggerId}/drafts/me`,
  );
  return response.data;
}

export async function upsertMyBloggerEditDraft(
  bloggerId: string,
  payload: BloggerDraftUpsert,
): Promise<BloggerDraftResponse> {
  const response = await apiClient.put<BloggerDraftResponse>(
    `/admin/blogger/${bloggerId}/drafts/me`,
    payload,
  );
  return response.data;
}

export async function deleteMyBloggerEditDraft(
  bloggerId: string,
): Promise<void> {
  await apiClient.delete(`/admin/blogger/${bloggerId}/drafts/me`);
}
