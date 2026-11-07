const EXACT_CLASS_MAP: Record<string, string> = {
  niedrig: 'tag--niedrig',
  mittel: 'tag--mittel',
  gut: 'tag--gut',
  'sehr gut': 'tag--sehr-gut',
  hoch: 'tag--hoch',
};

const RATING_TOKEN_PATTERN = 'sehr gut|niedrig|mittel|hoch|gut';

const LEADING_RATING_PATTERN = new RegExp(
  `^(${RATING_TOKEN_PATTERN})(?:[.\\s]|$)`
);

const RANGE_RATING_PATTERN = new RegExp(
  `^(${RATING_TOKEN_PATTERN})\\s+bis\\s+(${RATING_TOKEN_PATTERN})\\b`
);

function mapTokenToClass(token: string): string {
  return EXACT_CLASS_MAP[token] ?? 'tag--range';
}

export function getRatingClassName(ratingText?: string | null): string {
  const normalized = ratingText?.trim().toLowerCase() ?? '';

  if (!normalized) {
    return 'tag--range';
  }

  if (EXACT_CLASS_MAP[normalized]) {
    return EXACT_CLASS_MAP[normalized];
  }

  const rangeMatch = normalized.match(RANGE_RATING_PATTERN);
  if (rangeMatch) {
    const lower = rangeMatch[1];
    const upper = rangeMatch[2];
    const classKey = upper === 'hoch' ? upper : lower;
    return mapTokenToClass(classKey);
  }

  const leadingMatch = normalized.match(LEADING_RATING_PATTERN);
  if (leadingMatch) {
    return mapTokenToClass(leadingMatch[1]);
  }

  return 'tag--range';
}
