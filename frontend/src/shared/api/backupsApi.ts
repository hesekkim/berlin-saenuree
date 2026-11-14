import { apiClient } from '../lib/axios';

export type BackupKind = 'automatic' | 'manual' | 'pre_restore';

export type BackupSummary = {
  id: string;
  kind: BackupKind;
  createdAt: string;
  sizeBytes: number;
  isValid: boolean;
};

export type BackupListResponse = {
  backups: BackupSummary[];
  maxBackups: number;
};

export type ImportPreview = {
  importId: string;
  createdAt: string;
  siteId: string;
  fileCount: number;
  expandedSizeBytes: number;
};

export type BackupRestoreResponse = {
  restored: boolean;
  safetyBackupId: string;
};

export async function fetchBackups(): Promise<BackupListResponse> {
  const response = await apiClient.get<BackupListResponse>('/admin/backups');
  return response.data;
}

export async function createBackup(
  signal?: AbortSignal,
): Promise<BackupSummary> {
  const response = await apiClient.post<BackupSummary>(
    '/admin/backups',
    undefined,
    { signal, timeout: 30 * 60 * 1000 },
  );
  return response.data;
}

export async function downloadBackup(backupId: string): Promise<Blob> {
  const response = await apiClient.get(
    `/admin/backups/${encodeURIComponent(backupId)}/download`,
    { responseType: 'blob', timeout: 300000 },
  );
  return response.data;
}

export async function stageBackupImport(
  file: File,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total?: number) => void,
): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<ImportPreview>(
    '/admin/backups/import',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      timeout: 300000,
      onUploadProgress: ({ loaded, total }) => onProgress?.(loaded, total),
    },
  );
  return response.data;
}

export async function restoreBackup(
  backupId: string,
  password: string,
): Promise<BackupRestoreResponse> {
  const response = await apiClient.post<BackupRestoreResponse>(
    `/admin/backups/${encodeURIComponent(backupId)}/restore`,
    { password },
    { timeout: 300000 },
  );
  return response.data;
}

export async function restoreImportedBackup(
  importId: string,
  password: string,
): Promise<BackupRestoreResponse> {
  const response = await apiClient.post<BackupRestoreResponse>(
    `/admin/backups/import/${encodeURIComponent(importId)}/restore`,
    { password },
    { timeout: 300000 },
  );
  return response.data;
}

export async function deleteBackup(
  backupId: string,
  password: string,
): Promise<void> {
  await apiClient.delete(`/admin/backups/${encodeURIComponent(backupId)}`, {
    data: { password },
  });
}
