export type ChurchHistoryEvent = {
  id: string;
  date: string;
  description: string;
  imageUrl: string;
  imageId: string;
  sourceFileId: string;
};

export type ChurchHistoryCopy = {
  events: ChurchHistoryEvent[];
};

export type ChurchHistoryContentByLanguage = Record<string, ChurchHistoryCopy>;
export type ChurchHistoryContentDocument = {
  content: Record<string, Record<string, unknown>>;
  sharedMedia: {
    events: Record<string, Pick<ChurchHistoryEvent, 'imageId' | 'sourceFileId'>>;
  };
};

export function createEmptyChurchHistoryCopy(): ChurchHistoryCopy {
  return { events: [] };
}

export function normalizeChurchHistoryEvent(value: unknown): ChurchHistoryEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const event = value as Partial<ChurchHistoryEvent>;
  if (typeof event.id !== 'string' || !event.id) {
    return null;
  }
  return {
    id: event.id,
    date: typeof event.date === 'string' ? event.date : '',
    description: typeof event.description === 'string' ? event.description : '',
    imageUrl: typeof event.imageUrl === 'string' ? event.imageUrl : '',
    imageId: typeof event.imageId === 'string' ? event.imageId : '',
    sourceFileId:
      typeof event.sourceFileId === 'string' ? event.sourceFileId : '',
  };
}

export function normalizeChurchHistoryCopy(value: unknown): ChurchHistoryCopy {
  if (!value || typeof value !== 'object') {
    return createEmptyChurchHistoryCopy();
  }
  const copy = value as Partial<ChurchHistoryCopy>;
  return {
    events: Array.isArray(copy.events)
      ? copy.events
          .map(normalizeChurchHistoryEvent)
          .filter((event): event is ChurchHistoryEvent => event !== null)
      : [],
  };
}

export function normalizeChurchHistoryContent(
  content: Record<string, Record<string, unknown>>,
  languages: string[] = [],
  sharedMedia?: unknown,
): ChurchHistoryContentByLanguage {
  const copies = Object.fromEntries(
    [...new Set([...Object.keys(content), ...languages])].map((language) => [
      language,
      normalizeChurchHistoryCopy(content[language]),
    ]),
  ) as ChurchHistoryContentByLanguage;
  const eventIds = [
    ...new Set(
      Object.values(copies).flatMap((copy) =>
        copy.events.map((event) => event.id),
      ),
    ),
  ];
  const sharedEvents = new Map<
    string,
    Pick<ChurchHistoryEvent, 'imageUrl' | 'imageId' | 'sourceFileId'>
  >();
  const storedEvents =
    sharedMedia &&
    typeof sharedMedia === 'object' &&
    'events' in sharedMedia &&
    sharedMedia.events &&
    typeof sharedMedia.events === 'object'
      ? sharedMedia.events
      : {};
  for (const [id, value] of Object.entries(storedEvents)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const media = value as { imageId?: unknown; sourceFileId?: unknown };
    sharedEvents.set(id, {
      imageUrl: '',
      imageId: typeof media.imageId === 'string' ? media.imageId : '',
      sourceFileId:
        typeof media.sourceFileId === 'string' ? media.sourceFileId : '',
    });
  }
  for (const id of eventIds) {
    const shared = Object.values(copies)
      .flatMap((copy) => copy.events)
      .find((event) => event.id === id && (event.imageUrl || event.imageId || event.sourceFileId));
    const existing = sharedEvents.get(id);
    sharedEvents.set(id, {
      imageUrl: existing?.imageUrl || shared?.imageUrl || '',
      imageId: existing?.imageId || shared?.imageId || '',
      sourceFileId: existing?.sourceFileId || shared?.sourceFileId || '',
    });
  }

  return Object.fromEntries(
    Object.entries(copies).map(([language, copy]) => [
      language,
      {
        ...copy,
        events: eventIds.map((id) => {
          const current = copy.events.find((event) => event.id === id);
          const shared = sharedEvents.get(id) ?? {
            imageUrl: '',
            imageId: '',
            sourceFileId: '',
          };
          return {
            id,
            date: current?.date ?? '',
            description: current?.description ?? '',
            ...shared,
          };
        }),
      },
    ]),
  );
}

export function serializeChurchHistoryContent(
  content: ChurchHistoryContentByLanguage,
): ChurchHistoryContentDocument {
  const events: ChurchHistoryContentDocument['sharedMedia']['events'] = {};
  for (const copy of Object.values(content)) {
    for (const event of copy.events) {
      if (event.imageId || event.sourceFileId) {
        events[event.id] = {
          imageId: event.imageId,
          sourceFileId: event.sourceFileId,
        };
      }
    }
  }
  return {
    content: Object.fromEntries(
      Object.entries(content).map(([language, copy]) => [
        language,
        {
          events: copy.events.map(({ id, date, description }) => ({
            id,
            date,
            description,
          })),
        },
      ]),
    ),
    sharedMedia: { events },
  };
}

export function hasCompleteChurchHistoryContent(
  content: ChurchHistoryContentByLanguage,
  languages: string[],
): boolean {
  return (
    languages.length > 0 &&
    languages.every((language) => {
      const copy = content[language];
      return (
        copy !== undefined &&
        copy.events.every(
          (event) =>
            event.date.trim() !== '' &&
            event.description.trim() !== '' &&
            Boolean(event.imageId),
        )
      );
    })
  );
}

export function resolveChurchHistoryCopy(
  content: Record<string, unknown>,
  language: string,
): ChurchHistoryCopy {
  const normalizedContent = normalizeChurchHistoryContent(
    Object.fromEntries(
      Object.entries(content).map(([code, copy]) => [
        code,
        normalizeChurchHistoryCopy(copy),
      ]),
    ),
  );
  const preferred = normalizedContent[language] ?? createEmptyChurchHistoryCopy();
  if (hasChurchHistoryContent(preferred)) {
    return preferred;
  }

  for (const code of [
    'en',
    ...Object.keys(normalizedContent).filter(
      (key) => key !== language && key !== 'en',
    ),
  ]) {
    const candidate = normalizedContent[code];
    if (candidate && hasChurchHistoryContent(candidate)) {
      return candidate;
    }
  }
  return preferred;
}

function hasChurchHistoryContent(copy: ChurchHistoryCopy): boolean {
  return copy.events.some((event) =>
    [event.date, event.description].some((value) => value.trim()),
  );
}
