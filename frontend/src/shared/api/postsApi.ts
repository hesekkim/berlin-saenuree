import { apiClient } from '../lib/axios';

export type PostImage = {
  type: 'image';
  imageId: string;
  sourceFileId: string;
  width: number;
  height: number;
};

export type PostVideo = {
  type: 'video';
  fileId: string;
  width: number;
  height: number;
};

export type PostMedia = PostImage | PostVideo;

export type PostCopy = {
  body: string;
};

export type PostResponse = {
  id: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contentRevision: number;
  published: boolean;
  media: PostMedia[];
  copies: Record<string, PostCopy>;
};

export type PostListResponse = {
  items: PostResponse[];
  total: number;
  limit: number;
  offset: number;
};

export type PublicPostImage = Pick<
  PostImage,
  'type' | 'imageId' | 'width' | 'height'
>;
export type PublicPostVideo = PostVideo;
export type PublicPostMedia = PublicPostImage | PublicPostVideo;

export type PublicPostResponse = {
  id: string;
  createdAt: string;
  media: PublicPostMedia[];
  copies: Record<string, PostCopy>;
};

export type PublicPostListResponse = {
  items: PublicPostResponse[];
  total: number;
  limit: number;
  offset: number;
};

export type PostTrashItem = {
  id: string;
  deletedAt: string;
  expiresAt: string;
  deletedBy: string;
  post: PostResponse;
};

export type PostTrashListResponse = {
  items: PostTrashItem[];
  total: number;
};

export type PostUpsert = {
  published: boolean;
  pinned: boolean;
  contentRevision?: number | null;
  media: PostMedia[];
  copies: Record<string, PostCopy>;
};

export type FetchAdminPostsParams = {
  limit?: number;
  offset?: number;
  q?: string;
  created_by?: string;
  from?: string;
  to?: string;
  published?: boolean;
  pinned?: boolean;
};

export async function fetchPublicPosts(
  params: { limit?: number; offset?: number } = {},
): Promise<PublicPostListResponse> {
  const response = await apiClient.get<PublicPostListResponse>('/posts', {
    params,
  });
  return response.data;
}

export async function fetchAdminPosts(
  params: FetchAdminPostsParams = {},
): Promise<PostListResponse> {
  const queryParams = {
    limit: params.limit,
    offset: params.offset,
    ...(params.q?.trim() ? { q: params.q.trim() } : {}),
    ...(params.created_by?.trim()
      ? { created_by: params.created_by.trim() }
      : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.published !== undefined ? { published: params.published } : {}),
    ...(params.pinned !== undefined ? { pinned: params.pinned } : {}),
  };
  const response = await apiClient.get<PostListResponse>('/admin/posts', {
    params: queryParams,
  });
  return response.data;
}

export async function fetchAdminPost(id: string): Promise<PostResponse> {
  const response = await apiClient.get<PostResponse>(`/admin/posts/${id}`);
  return response.data;
}

export async function createAdminPost(
  payload: PostUpsert,
): Promise<PostResponse> {
  const response = await apiClient.post<PostResponse>('/admin/posts', payload);
  return response.data;
}

export async function updateAdminPost(
  id: string,
  payload: PostUpsert,
): Promise<PostResponse> {
  const response = await apiClient.put<PostResponse>(
    `/admin/posts/${id}`,
    payload,
  );
  return response.data;
}

export async function deleteAdminPost(id: string): Promise<void> {
  await apiClient.delete(`/admin/posts/${id}`);
}

export async function fetchAdminPostsTrash(): Promise<PostTrashListResponse> {
  const response =
    await apiClient.get<PostTrashListResponse>('/admin/posts/trash');
  return response.data;
}

export async function restoreAdminPostTrash(id: string): Promise<PostResponse> {
  const response = await apiClient.post<PostResponse>(
    `/admin/posts/trash/${id}/restore`,
  );
  return response.data;
}

export async function purgeAdminPostTrash(id: string): Promise<void> {
  await apiClient.delete(`/admin/posts/trash/${id}`);
}
