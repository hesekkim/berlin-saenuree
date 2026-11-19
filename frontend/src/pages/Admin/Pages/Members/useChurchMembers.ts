import { useCallback, useEffect, useState } from 'react';
import {
  createChurchMember,
  deleteChurchMember,
  fetchChurchMembers,
  updateChurchMember,
  type ChurchMember,
  type CreateChurchMemberPayload,
  type UpdateChurchMemberPayload,
} from '../../../../shared/api/churchMembersApi';
import { useToast } from '../../../../shared/components/ui/Toast/ToastProvider';
import { readErrorDetail } from '../../../../shared/context/AuthContext';
import type { AdminTranslations } from '../../translations';

function sortMembers(members: ChurchMember[]): ChurchMember[] {
  return members.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

export default function useChurchMembers(
  labels: AdminTranslations,
  enabled: boolean,
) {
  const [members, setMembers] = useState<ChurchMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const toast = useToast();

  const loadMembers = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setMembers(await fetchChurchMembers());
      setLoadError(null);
    } catch {
      setLoadError(labels.membersLoadFailed);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, labels.membersLoadFailed]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const addMember = async (payload: CreateChurchMemberPayload) => {
    setIsMutating(true);
    try {
      const created = await createChurchMember(payload);
      setMembers((current) => sortMembers([...current, created]));
      toast.info(labels.membersAdded);
      return true;
    } catch (error: unknown) {
      toast.error(readErrorDetail(error, labels.membersSaveFailed));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const editMember = async (
    memberId: string,
    payload: UpdateChurchMemberPayload,
  ) => {
    setIsMutating(true);
    try {
      const updated = await updateChurchMember(memberId, payload);
      setMembers((current) =>
        sortMembers(
          current.map((member) => (member.id === memberId ? updated : member)),
        ),
      );
      toast.info(labels.membersUpdated);
      return true;
    } catch (error: unknown) {
      toast.error(readErrorDetail(error, labels.membersSaveFailed));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const removeMember = async (member: ChurchMember) => {
    setIsMutating(true);
    try {
      await deleteChurchMember(member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast.info(labels.membersDeleted);
      return true;
    } catch (error: unknown) {
      toast.error(readErrorDetail(error, labels.membersDeleteFailed));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const removeMembers = async (memberIds: string[]) => {
    const targets = members.filter((member) => memberIds.includes(member.id));
    if (targets.length === 0 || isMutating) {
      return targets.length === 0 ? [] : memberIds;
    }

    setIsMutating(true);
    try {
      const results = await Promise.allSettled(
        targets.map((member) => deleteChurchMember(member.id)),
      );
      const failedIds = targets.flatMap((member, index) =>
        results[index].status === 'rejected' ? [member.id] : [],
      );
      const successfulIds = targets
        .filter((member) => !failedIds.includes(member.id))
        .map((member) => member.id);

      setMembers((current) =>
        current.filter((member) => !successfulIds.includes(member.id)),
      );

      const successCount = successfulIds.length;
      const message =
        failedIds.length === targets.length
          ? labels.membersBulkDeleteFailure.replace(
              '{count}',
              String(failedIds.length),
            )
          : failedIds.length > 0
            ? labels.membersBulkDeletePartial
                .replace('{success}', String(successCount))
                .replace('{failed}', String(failedIds.length))
            : labels.membersBulkDeleteSuccess.replace(
                '{count}',
                String(successCount),
              );
      if (failedIds.length === targets.length) {
        toast.error(message);
      } else if (failedIds.length > 0) {
        toast.warning(message);
      } else {
        toast.info(message);
      }

      return failedIds;
    } finally {
      setIsMutating(false);
    }
  };

  return {
    members,
    isLoading,
    loadError,
    isMutating,
    loadMembers,
    addMember,
    editMember,
    removeMember,
    removeMembers,
  };
}
