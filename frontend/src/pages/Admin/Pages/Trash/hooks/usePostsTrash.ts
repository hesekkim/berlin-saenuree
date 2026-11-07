import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import {
  fetchAdminPostsTrash,
  purgeAdminPostTrash,
  restoreAdminPostTrash,
  type PostTrashItem,
} from '../../../../../shared/api/postsApi';
import { adminTranslations } from '../../../translations';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';

export function usePostsTrash() {
  const { language } = useCmsConfig();
  const toast = useToast();
  const labels = adminTranslations[language];
  const [trashItems, setTrashItems] = useState<PostTrashItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reloadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAdminPostsTrash();
      setTrashItems(response.items);
    } catch {
      toast.error(labels.postsTrashLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.postsTrashLoadFailed, toast]);

  useEffect(() => {
    void reloadTrash();
  }, [reloadTrash]);

  const restoreTrashItem = useCallback(
    async (id: string) => {
      try {
        await restoreAdminPostTrash(id);
        toast.info(labels.postsTrashRestoreSuccess);
        setTrashItems((current) => current.filter((item) => item.id !== id));
        await reloadTrash();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          toast.error(labels.postsTrashRestoreConflict);
          return;
        }
        toast.error(labels.postsTrashRestoreFailed);
      }
    },
    [labels, reloadTrash, toast],
  );

  const purgeTrashItem = useCallback(
    async (id: string) => {
      try {
        await purgeAdminPostTrash(id);
        toast.info(labels.postsTrashPurgeSuccess);
        setTrashItems((current) => current.filter((item) => item.id !== id));
        await reloadTrash();
      } catch {
        toast.error(labels.postsTrashPurgeFailed);
      }
    },
    [labels, reloadTrash, toast],
  );

  return {
    trashItems,
    loading,
    restoreTrashItem,
    purgeTrashItem,
    reloadTrash,
  };
}
