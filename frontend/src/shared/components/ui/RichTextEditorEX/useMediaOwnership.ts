import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef } from 'react';
import { deleteMediaFile, deleteOptimizedImage } from '../../../api/mediaApi';

/**
 * Grace period before a removed upload is deleted remotely, so an undo right
 * after Delete/Backspace restores a node whose file still exists.
 */
export const MEDIA_DELETE_GRACE_MS = 5000;

export function collectDocumentMediaIds(editor: Editor): Set<string> {
  const mediaIds = new Set<string>();
  editor.state.doc.descendants((node) => {
    const mediaId = node.attrs.mediaId;
    if (typeof mediaId === 'string' && mediaId) {
      mediaIds.add(mediaId);
    }
    const imageId = node.attrs.imageId;
    if (typeof imageId === 'string' && imageId) {
      mediaIds.add(imageId);
    }
  });
  return mediaIds;
}

type OwnedMediaKind = 'file' | 'image';

export type MediaOwnership = {
  /** Track a freshly uploaded file as owned by this editor session. */
  track: (mediaId: string, imageId?: string) => void;
  /** Delete a file that never made it into the document. */
  discardOne: (mediaId: string) => Promise<void>;
  /** Hand ownership to the saved document; nothing more is deleted. */
  commit: () => void;
  /** Drop every file uploaded in this session (cancel). */
  discardAll: () => Promise<void>;
  getTrackedIds: () => string[];
};

/**
 * Owns the files uploaded during one editing session. Files leave the document
 * on user edits only, so a programmatic `setContent` (external value sync,
 * form reset after save) never deletes media the saved document still uses.
 */
export function useMediaOwnership(editor: Editor | null): MediaOwnership {
  const ownedRef = useRef<Map<string, OwnedMediaKind>>(new Map());
  const pendingRef = useRef<
    Map<string, { kind: OwnedMediaKind; timer: ReturnType<typeof setTimeout> }>
  >(new Map());

  const cancelPending = useCallback((mediaId: string) => {
    const entry = pendingRef.current.get(mediaId);
    if (entry) {
      clearTimeout(entry.timer);
      pendingRef.current.delete(mediaId);
    }
  }, []);

  const deleteNow = useCallback(
    async (mediaId: string) => {
      cancelPending(mediaId);
      const kind = ownedRef.current.get(mediaId) ?? 'file';
      ownedRef.current.delete(mediaId);
      if (kind === 'image') {
        await deleteOptimizedImage(mediaId).catch(() => undefined);
        return;
      }
      await deleteMediaFile(mediaId).catch(() => undefined);
    },
    [cancelPending],
  );

  const track = useCallback((mediaId: string, imageId?: string) => {
    ownedRef.current.set(mediaId, 'file');
    if (imageId) {
      ownedRef.current.set(imageId, 'image');
    }
  }, []);

  const commit = useCallback(() => {
    for (const { timer } of pendingRef.current.values()) {
      clearTimeout(timer);
    }
    pendingRef.current.clear();
    ownedRef.current.clear();
  }, []);

  const discardAll = useCallback(async () => {
    const mediaIds = [...ownedRef.current.keys()];
    await Promise.all(mediaIds.map((mediaId) => deleteNow(mediaId)));
  }, [deleteNow]);

  const getTrackedIds = useCallback(() => [...ownedRef.current.keys()], []);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    // `update` fires for user edits only; the external value sync dispatches
    // with `emitUpdate: false` and must not look like a deletion.
    const syncOwnedMedia = () => {
      const present = collectDocumentMediaIds(editor);
      for (const [mediaId, kind] of ownedRef.current.entries()) {
        if (present.has(mediaId)) {
          cancelPending(mediaId);
        } else if (!pendingRef.current.has(mediaId)) {
          pendingRef.current.set(mediaId, {
            kind,
            timer: setTimeout(() => {
              void deleteNow(mediaId);
            }, MEDIA_DELETE_GRACE_MS),
          });
        }
      }
    };

    editor.on('update', syncOwnedMedia);
    return () => {
      editor.off('update', syncOwnedMedia);
    };
  }, [editor, cancelPending, deleteNow]);

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      // Unmounting cannot undo, so flush removals instead of orphaning them.
      for (const [mediaId, { kind, timer }] of pending) {
        clearTimeout(timer);
        if (kind === 'image') {
          void deleteOptimizedImage(mediaId).catch(() => undefined);
        } else {
          void deleteMediaFile(mediaId).catch(() => undefined);
        }
      }
      pending.clear();
    };
  }, []);

  return { track, discardOne: deleteNow, commit, discardAll, getTrackedIds };
}
