export type PopupScheduleFields = {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

/** How the popup appears on Home right now (enabled + optional schedule). */
export type PopupVisibilityStatus =
  | 'disabled'
  | 'live'
  | 'scheduled'
  | 'ended';

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPopupVisibilityStatus(
  popup: PopupScheduleFields,
  now: Date = new Date()
): PopupVisibilityStatus {
  if (!popup.enabled) {
    return 'disabled';
  }

  const startsAt = parseInstant(popup.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return 'scheduled';
  }

  const endsAt = parseInstant(popup.endsAt);
  if (endsAt && endsAt.getTime() < now.getTime()) {
    return 'ended';
  }

  return 'live';
}
