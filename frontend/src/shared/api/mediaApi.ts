import { apiClient } from '../lib/axios';

export type MediaFileResponse = {
  id: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
};

export type UploadMediaFileOptions = {
  accept?: string;
  maxSizeBytes?: number;
};

export async function uploadMediaFile(
  file: File,
  options: UploadMediaFileOptions = {},
): Promise<MediaFileResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const params: Record<string, string | number> = {};
  if (options.accept) {
    params.accept = options.accept;
  }
  if (options.maxSizeBytes != null) {
    params.max_size_bytes = options.maxSizeBytes;
  }

  const response = await apiClient.post<MediaFileResponse>(
    '/media/files',
    formData,
    {
      params,
      transformRequest: [
        (data, headers) => {
          if (data instanceof FormData && headers) {
            delete headers['Content-Type'];
          }
          return data;
        },
      ],
    },
  );
  return response.data;
}

export async function deleteMediaFile(fileId: string): Promise<void> {
  await apiClient.delete(`/media/files/${fileId}`);
}

export function mediaFileAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = (
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000'
  ).replace(/\/$/, '');
  return pathOrUrl.startsWith('/')
    ? `${base}${pathOrUrl}`
    : `${base}/${pathOrUrl}`;
}

/** Cross-origin safe download (blob). Uses attachment disposition. */
export async function downloadMediaFile(
  file: Pick<MediaFileResponse, 'id' | 'originalName'>,
): Promise<void> {
  const response = await apiClient.get<Blob>(`/media/files/${file.id}`, {
    params: { download: true },
    responseType: 'blob',
  });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.originalName || 'download';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export type OptimizedImageResponse = {
  imageId: string;
  sourceFileId: string;
  displayUrl: string;
  thumbUrl: string | null;
  variants: Array<'display' | 'thumb'>;
  width: number;
  height: number;
};

export type OptimizeImageVariants =
  | ['display']
  | ['display', 'thumb']
  | ['thumb', 'display'];

export async function optimizeMediaImage(
  fileId: string,
  variants: OptimizeImageVariants = ['display'],
): Promise<OptimizedImageResponse> {
  const response = await apiClient.post<OptimizedImageResponse>(
    '/media/images/optimize',
    { fileId, variants },
  );
  return response.data;
}

export async function deleteOptimizedImage(imageId: string): Promise<void> {
  await apiClient.delete(`/media/images/${imageId}`);
}

export function mediaImageAbsoluteUrl(
  imageIdOrUrl: string,
  variant: 'display' | 'thumb' = 'display',
): string {
  if (imageIdOrUrl.startsWith('/') || /^https?:\/\//i.test(imageIdOrUrl)) {
    return mediaFileAbsoluteUrl(imageIdOrUrl);
  }
  return mediaFileAbsoluteUrl(
    `/api/v1/media/images/${imageIdOrUrl}/${variant}`,
  );
}
