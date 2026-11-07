import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../../../../shared/components/ui/Toast/ToastProvider';
import {
  fetchAdminBloggerTrash,
  purgeAdminBloggerTrash,
  restoreAdminBloggerTrash,
  type BloggerTrashItem,
} from '../../../../../shared/api/bloggerApi';
import { adminTranslations } from '../../../translations';
import { useCmsConfig } from '../../../../../shared/context/CmsConfigContext';

export function useBloggerTrash() {
  const { language } = useCmsConfig();
  const labels = adminTranslations[language];
  const toast = useToast();
  const [items, setItems] = useState<BloggerTrashItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await fetchAdminBloggerTrash()).items);
    } catch {
      toast.error(labels.bloggerTrashLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.bloggerTrashLoadFailed, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = useCallback(
    async (id: string) => {
      try {
        await restoreAdminBloggerTrash(id);
        toast.info(labels.bloggerTrashRestoreSuccess);
        await reload();
      } catch (error) {
        toast.error(
          axios.isAxiosError(error) && error.response?.status === 409
            ? labels.bloggerTrashRestoreConflict
            : labels.bloggerTrashRestoreFailed,
        );
      }
    },
    [labels, reload, toast],
  );

  const purge = useCallback(
    async (id: string) => {
      try {
        await purgeAdminBloggerTrash(id);
        toast.info(labels.bloggerTrashPurgeSuccess);
        await reload();
      } catch {
        toast.error(labels.bloggerTrashPurgeFailed);
      }
    },
    [labels, reload, toast],
  );

  return {
    items,
    loading,
    restore,
    purge,
  };
}
