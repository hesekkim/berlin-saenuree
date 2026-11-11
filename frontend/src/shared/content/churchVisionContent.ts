export type ChurchVisionGoalId = string;
export type ChurchVisionGoal = {
  id: ChurchVisionGoalId;
  title: string;
  quotation: string;
  reference: string;
};

export type ChurchVisionCopy = {
  heading: string;
  goals: ChurchVisionGoal[];
};

export type ChurchVisionContentByLanguage = Record<string, ChurchVisionCopy>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function createEmptyChurchVisionCopy(): ChurchVisionCopy {
  return { heading: '', goals: [] };
}

export function normalizeChurchVisionCopy(value: unknown): ChurchVisionCopy {
  if (!isRecord(value)) {
    return createEmptyChurchVisionCopy();
  }
  const rawGoals = Array.isArray(value.goals) ? value.goals : [];
  const seenIds = new Set<string>();
  return {
    heading: text(value.heading),
    goals: rawGoals.flatMap((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        !item.id ||
        seenIds.has(item.id)
      ) {
        return [];
      }
      seenIds.add(item.id);
      return [{
        id: item.id,
        title: text(item.title),
        quotation: text(item.quotation),
        reference: text(item.reference),
      }];
    }),
  };
}

export function normalizeChurchVisionContent(
  content: Record<string, unknown>,
  languages: string[] = [],
): ChurchVisionContentByLanguage {
  const copies = Object.fromEntries(
    [...new Set([...Object.keys(content), ...languages])].map((language) => [
      language,
      normalizeChurchVisionCopy(content[language]),
    ]),
  ) as ChurchVisionContentByLanguage;
  const goalIds = [
    ...new Set(
      Object.values(copies).flatMap((copy) =>
        copy.goals.map((goal) => goal.id),
      ),
    ),
  ];

  return Object.fromEntries(
    Object.entries(copies).map(([language, copy]) => [
      language,
      {
        ...copy,
        goals: goalIds.map(
          (id) =>
            copy.goals.find((goal) => goal.id === id) ?? {
              id,
              title: '',
              quotation: '',
              reference: '',
            },
        ),
      },
    ]),
  );
}

export function addChurchVisionGoal(
  content: ChurchVisionContentByLanguage,
  languages: string[],
  id: ChurchVisionGoalId,
): ChurchVisionContentByLanguage {
  const normalized = normalizeChurchVisionContent(
    content,
    languages,
  );
  return Object.fromEntries(
    Object.entries(normalized).map(([language, copy]) => [
      language,
      {
        ...copy,
        goals: [...copy.goals, { id, title: '', quotation: '', reference: '' }],
      },
    ]),
  );
}

export function removeChurchVisionGoal(
  content: ChurchVisionContentByLanguage,
  id: ChurchVisionGoalId,
): ChurchVisionContentByLanguage {
  return Object.fromEntries(
    Object.entries(content).map(([language, copy]) => [
      language,
      { ...copy, goals: copy.goals.filter((goal) => goal.id !== id) },
    ]),
  );
}

export function hasCompleteChurchVisionContent(
  content: ChurchVisionContentByLanguage,
  languages: string[],
): boolean {
  return (
    languages.length > 0 &&
    languages.every((language) => {
      const copy = content[language];
      return (
        copy !== undefined &&
        copy.goals.every(
          (goal) =>
            goal.title.trim() !== '' &&
            goal.quotation.trim() !== '' &&
            goal.reference.trim() !== '',
        )
      );
    })
  );
}

function hasCopy(copy: ChurchVisionCopy): boolean {
  return Boolean(
    copy.heading.trim() ||
      copy.goals.some(
        (goal) =>
          goal.title.trim() ||
          goal.quotation.trim() ||
          goal.reference.trim(),
      ),
  );
}

export function resolveChurchVisionCopy(
  content: Record<string, Record<string, unknown>>,
  language: string,
): ChurchVisionCopy {
  const normalized = normalizeChurchVisionContent(content);
  const preferred = normalized[language];
  if (preferred && hasCopy(preferred)) {
    return preferred;
  }
  const fallback = normalized.en
    ? [normalized.en, ...Object.values(normalized).filter((copy) => copy !== normalized.en)]
    : Object.values(normalized);
  return fallback.find(hasCopy) ?? preferred ?? createEmptyChurchVisionCopy();
}
