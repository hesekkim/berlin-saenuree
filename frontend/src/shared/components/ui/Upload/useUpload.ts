import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AxiosError } from 'axios';
import {
  deleteMediaFile,
  mediaFileAbsoluteUrl,
  uploadMediaFile,
  type MediaFileResponse,
} from '../../../api/mediaApi';
import { validateUploadFile } from './uploadValidation';

export type UploadItemStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

export type UploadItemErrorCode =
  | 'type_not_allowed'
  | 'size_exceeded'
  | 'upload_failed'
  | 'unauthorized'
  | 'download_failed';

export type UploadItem = {
  key: string;
  file: File;
  status: UploadItemStatus;
  errorCode?: UploadItemErrorCode;
  uploaded?: MediaFileResponse;
  previewUrl?: string;
  /** When true, replace/remove will not DELETE the remote file (caller owns lifecycle). */
  retainRemote?: boolean;
};

export type UseUploadParams = {
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  autoUpload?: boolean;
  /** Seed the list with already-uploaded files (e.g. form edit). */
  defaultFiles?: MediaFileResponse[];
  /** Mark defaultFiles as retainRemote so replace/remove skips DELETE. */
  retainDefaultRemotes?: boolean;
  /** After a successful upload, mark the item retainRemote (caller owns lifecycle). */
  retainUploadedRemotes?: boolean;
  /** Keep Posts video uploads protected while the editor session is active. */
  leaseVideoUploads?: boolean;
  onUploaded?: (
    files: MediaFileResponse[],
    items: UploadItem[],
  ) => void | Promise<void>;
  onItemsChange?: (items: UploadItem[]) => void;
  maxSizeBytesForFile?: (file: File) => number;
};

function createItemKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

function itemFromMediaFile(
  file: MediaFileResponse,
  options?: { retainRemote?: boolean }
): UploadItem {
  const placeholder = new File([], file.originalName, {
    type: file.contentType,
  });
  const previewUrl = file.contentType.startsWith('image/')
    ? mediaFileAbsoluteUrl(file.url)
    : file.contentType === 'video/mp4'
      ? mediaFileAbsoluteUrl(file.url)
    : undefined;
  return {
    key: `remote-${file.id}`,
    file: placeholder,
    status: 'uploaded',
    uploaded: file,
    previewUrl,
    retainRemote: options?.retainRemote,
  };
}

function revokePreview(item: UploadItem) {
  if (item.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

async function deleteRemoteUploads(items: UploadItem[]) {
  await Promise.all(
    items.map(async (item) => {
      if (!item.uploaded?.id || item.retainRemote) {
        return;
      }
      try {
        await deleteMediaFile(item.uploaded.id);
      } catch {
        // UI already dropped the item; orphan cleanup can be retried later by ops.
      }
    })
  );
}

function needsUpload(item: UploadItem): boolean {
  return (
    item.status === 'pending' ||
    (item.status === 'error' && item.errorCode === 'upload_failed')
  );
}

export function filesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) {
    return [];
  }
  const direct = Array.from(dataTransfer.files ?? []);
  if (direct.length > 0) {
    return direct;
  }
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/**
 * Highlight-only check. Never gate preventDefault on this: some Windows drag
 * sources expose no types until drop, and skipping preventDefault during
 * dragover makes the OS show a not-allowed cursor.
 */
export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return true;
  }
  const types = Array.from(dataTransfer.types ?? []);
  return types.length === 0 || types.includes('Files');
}

export function useUpload({
  accept,
  maxSizeBytes,
  multiple = false,
  disabled = false,
  autoUpload = true,
  defaultFiles,
  retainDefaultRemotes = false,
  retainUploadedRemotes = false,
  leaseVideoUploads = false,
  onUploaded,
  onItemsChange,
  maxSizeBytesForFile,
}: UseUploadParams) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [items, setItems] = useState<UploadItem[]>(() =>
    (defaultFiles ?? []).map((file) =>
      itemFromMediaFile(file, { retainRemote: retainDefaultRemotes })
    )
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const replaceGenerationRef = useRef(0);
  const uploadRunningRef = useRef(false);
  const uploadAgainRef = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  const onItemsChangeRef = useRef(onItemsChange);
  onUploadedRef.current = onUploaded;
  onItemsChangeRef.current = onItemsChange;

  useEffect(() => {
    onItemsChangeRef.current?.(items);
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach(revokePreview);
    };
  }, []);

  const replaceItems = (next: UploadItem[]) => {
    setItems((prev) => {
      const nextKeys = new Set(next.map((item) => item.key));
      prev.forEach((item) => {
        if (!nextKeys.has(item.key)) {
          revokePreview(item);
        }
      });
      return next;
    });
  };

  const buildItemsFromFiles = (fileList: File[]): UploadItem[] => {
    return fileList.map((file) => {
      const validation = validateUploadFile(file, {
        accept,
        maxSizeBytes: maxSizeBytesForFile?.(file) ?? maxSizeBytes,
      });
      const previewUrl =
        file.type.startsWith('image/') || file.type === 'video/mp4'
        ? URL.createObjectURL(file)
        : undefined;
      if (!validation.ok) {
        return {
          key: createItemKey(file),
          file,
          status: 'error' as const,
          errorCode: validation.code,
          previewUrl,
        };
      }
      return {
        key: createItemKey(file),
        file,
        status: 'pending' as const,
        previewUrl,
      };
    });
  };

  const uploadItem = async (item: UploadItem): Promise<UploadItem> => {
    if (item.status === 'uploaded' || item.uploaded) {
      return { ...item, status: 'uploaded', errorCode: undefined };
    }
    if (item.status === 'error' && item.errorCode !== 'upload_failed') {
      return item;
    }
    try {
      const uploaded = await uploadMediaFile(item.file, {
        accept,
        maxSizeBytes: maxSizeBytesForFile?.(item.file) ?? maxSizeBytes,
        leaseVideoUpload: leaseVideoUploads,
      });
      return {
        ...item,
        status: 'uploaded',
        uploaded,
        errorCode: undefined,
        retainRemote: retainUploadedRemotes || item.retainRemote,
      };
    } catch (error) {
      const status = error instanceof AxiosError ? error.response?.status : undefined;
      const unauthorized = status === 401 || status === 403;
      return {
        ...item,
        status: 'error',
        errorCode: unauthorized ? 'unauthorized' : 'upload_failed',
      };
    }
  };

  const runUploadQueue = async () => {
    if (uploadRunningRef.current) {
      uploadAgainRef.current = true;
      return;
    }
    uploadRunningRef.current = true;
    try {
      do {
        uploadAgainRef.current = false;
        const snapshot = itemsRef.current;
        const toUploadKeys = new Set(
          snapshot.filter(needsUpload).map((item) => item.key)
        );
        if (toUploadKeys.size === 0) {
          continue;
        }

        const uploading = snapshot.map((item) =>
          toUploadKeys.has(item.key)
            ? { ...item, status: 'uploading' as const, errorCode: undefined }
            : item
        );
        replaceItems(uploading);
        itemsRef.current = uploading;

        const results: UploadItem[] = [];
        const newlyUploaded: MediaFileResponse[] = [];

        for (let index = 0; index < uploading.length; index += 1) {
          const item = uploading[index];
          if (!toUploadKeys.has(item.key)) {
            const live = itemsRef.current.find((entry) => entry.key === item.key);
            results.push(live ?? item);
            continue;
          }

          // Pace uploads so production media rate limits are less likely to trip
          // when many small files finish in the same second.
          if (results.some((entry) => toUploadKeys.has(entry.key))) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          const next = await uploadItem(item);
          results.push(next);
          if (next.status === 'uploaded' && next.uploaded) {
            newlyUploaded.push(next.uploaded);
          }

          const tail = itemsRef.current.slice(results.length);
          const merged = [...results, ...tail];
          replaceItems(merged);
          itemsRef.current = merged;
        }

        if (newlyUploaded.length > 0) {
          const uploadedItems = itemsRef.current.filter(
            (item) =>
              item.uploaded &&
              newlyUploaded.some((file) => file.id === item.uploaded?.id),
          );
          const processing = onUploadedRef.current?.(
            newlyUploaded,
            uploadedItems,
          );
          if (processing) {
            const processingIds = new Set(newlyUploaded.map((file) => file.id));
            const processingItems = itemsRef.current.map((item) =>
              item.uploaded && processingIds.has(item.uploaded.id)
                ? { ...item, status: 'uploading' as const }
                : item
            );
            replaceItems(processingItems);
            itemsRef.current = processingItems;

            try {
              await processing;
            } finally {
              const completedItems = itemsRef.current.map((item) =>
                item.uploaded &&
                processingIds.has(item.uploaded.id) &&
                item.status === 'uploading'
                  ? { ...item, status: 'uploaded' as const }
                  : item
              );
              replaceItems(completedItems);
              itemsRef.current = completedItems;
            }
          }
        }
      } while (uploadAgainRef.current);
    } finally {
      uploadRunningRef.current = false;
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    if (disabled) {
      return;
    }
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    const selected = multiple ? files : files.slice(0, 1);
    const nextItems = buildItemsFromFiles(selected);
    if (multiple) {
      const combined = [...itemsRef.current, ...nextItems];
      replaceItems(combined);
      itemsRef.current = combined;
      if (autoUpload) {
        void runUploadQueue();
      }
      return;
    }

    const previous = itemsRef.current;
    const generation = ++replaceGenerationRef.current;
    replaceItems(nextItems);
    itemsRef.current = nextItems;
    void (async () => {
      await deleteRemoteUploads(previous);
      if (generation !== replaceGenerationRef.current) {
        return;
      }
      if (autoUpload) {
        await runUploadQueue();
      }
    })();
  };

  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;

  useEffect(() => {
    const dropzone = dropzoneRef.current;
    if (!dropzone) {
      return;
    }

    const resetDrag = () => {
      dragDepthRef.current = 0;
      setIsDragging(false);
    };

    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepthRef.current += 1;
      if (!disabled && isFileDrag(event.dataTransfer)) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }
    };

    const handleDragLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      resetDrag();
      if (disabled) {
        return;
      }
      const files = filesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) {
        addFilesRef.current(files);
      }
    };

    // Dropping outside the dropzone would otherwise navigate away and discard the form.
    const handleWindowDragOver = (event: DragEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
    };

    const handleWindowDrop = (event: DragEvent) => {
      resetDrag();
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
    };

    dropzone.addEventListener('dragenter', handleDragEnter);
    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('dragleave', handleDragLeave);
    dropzone.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('dragend', resetDrag);

    return () => {
      dropzone.removeEventListener('dragenter', handleDragEnter);
      dropzone.removeEventListener('dragover', handleDragOver);
      dropzone.removeEventListener('dragleave', handleDragLeave);
      dropzone.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragend', resetDrag);
    };
  }, [disabled]);

  const openFilePicker = () => {
    if (disabled) {
      return;
    }
    inputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files) {
      addFiles(files);
    }
    event.target.value = '';
  };

  const removeItem = async (key: string) => {
    const target = itemsRef.current.find((item) => item.key === key);
    if (!target) {
      return;
    }
    const next = itemsRef.current.filter((item) => item.key !== key);
    replaceItems(next);
    itemsRef.current = next;
    await deleteRemoteUploads([target]);
  };

  const clearItems = () => {
    const previous = itemsRef.current;
    previous.forEach(revokePreview);
    replaceItems([]);
    itemsRef.current = [];
    void deleteRemoteUploads(previous);
  };

  const setItemDownloadError = (key: string, failed: boolean) => {
    const next = itemsRef.current.map((item) => {
      if (item.key !== key) {
        return item;
      }
      if (failed) {
        return { ...item, errorCode: 'download_failed' as const };
      }
      if (item.errorCode === 'download_failed') {
        return { ...item, errorCode: undefined };
      }
      return item;
    });
    replaceItems(next);
    itemsRef.current = next;
  };

  const retryUpload = () => {
    if (disabled) {
      return;
    }
    void runUploadQueue();
  };

  const isUploading = items.some((item) => item.status === 'uploading');

  return {
    inputId,
    inputRef,
    dropzoneRef,
    items,
    isDragging,
    isUploading,
    openFilePicker,
    handleInputChange,
    removeItem,
    clearItems,
    retryUpload,
    addFiles,
    setItemDownloadError,
  };
}
