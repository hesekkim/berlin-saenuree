export type RelativeDays = {
  prefix: string;
  value: string;
};

export function formatRelativeDays(
  iso: string,
  language: string,
): RelativeDays {
  const diffDays = Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  if (!Number.isFinite(diffDays)) {
    return { prefix: '', value: iso };
  }

  const parts = new Intl.RelativeTimeFormat(language, {
    numeric: 'auto',
  }).formatToParts(diffDays, 'day');
  const amountIndex = parts.findIndex((part) => part.type === 'integer');
  if (amountIndex === -1) {
    return { prefix: '', value: parts.map((part) => part.value).join('') };
  }

  return {
    prefix: parts
      .slice(0, amountIndex)
      .map((part) => part.value)
      .join(''),
    value: parts
      .slice(amountIndex)
      .map((part) => part.value)
      .join(''),
  };
}
