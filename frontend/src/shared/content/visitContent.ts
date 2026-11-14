import { publicPageImageUrl } from './publicPageImage';

export type VisitService = {
  id: string;
  name: string;
  day: string;
  time: string;
  place: string;
};

export type VisitTransitRoute = {
  id: string;
  type: string;
  line: string;
  station: string;
  walkingTime: string;
};

export type VisitCopy = {
  services: VisitService[];
  address: string;
  primaryTransit: VisitTransitRoute[];
  secondaryTransit: VisitTransitRoute[];
  googleMapsUrl: string;
};

export type VisitImage = {
  imageId: string;
  sourceFileId: string;
};

export type VisitSharedMedia = {
  mapImages: VisitImage[];
  venueImages: VisitImage[];
};

export type VisitContentByLanguage = Record<string, VisitCopy>;

export function visitImageUrl(image: VisitImage): string {
  return image.imageId ? publicPageImageUrl(image.imageId, 'display') : '';
}

export function normalizeVisitSharedMedia(value: unknown): VisitSharedMedia {
  if (!value || typeof value !== 'object') {
    return { mapImages: [], venueImages: [] };
  }
  const media = value as Partial<VisitSharedMedia>;
  return {
    mapImages: normalizeVisitImages(media.mapImages),
    venueImages: normalizeVisitImages(media.venueImages),
  };
}

function normalizeVisitImages(value: unknown): VisitImage[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const image = item as Partial<VisitImage>;
          const normalized = {
            imageId: typeof image.imageId === 'string' ? image.imageId : '',
            sourceFileId:
              typeof image.sourceFileId === 'string' ? image.sourceFileId : '',
          };
          return normalized.imageId && normalized.sourceFileId
            ? normalized
            : null;
        })
        .filter((image): image is VisitImage => image !== null)
    : [];
}

export function createEmptyVisitCopy(): VisitCopy {
  return {
    services: [],
    address: '',
    primaryTransit: [],
    secondaryTransit: [],
    googleMapsUrl: '',
  };
}

export function normalizeVisitCopy(value: unknown): VisitCopy {
  if (!value || typeof value !== 'object') {
    return createEmptyVisitCopy();
  }
  const copy = value as Partial<VisitCopy>;
  return {
    services: Array.isArray(copy.services)
      ? copy.services.filter(isVisitService)
      : [],
    address: typeof copy.address === 'string' ? copy.address : '',
    primaryTransit: Array.isArray(copy.primaryTransit)
      ? copy.primaryTransit.filter(isTransitRoute)
      : [],
    secondaryTransit: Array.isArray(copy.secondaryTransit)
      ? copy.secondaryTransit.filter(isTransitRoute)
      : [],
    googleMapsUrl:
      typeof copy.googleMapsUrl === 'string' ? copy.googleMapsUrl : '',
  };
}

function isVisitService(value: unknown): value is VisitService {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const service = value as Partial<VisitService>;
  return ['id', 'name', 'day', 'time', 'place'].every(
    (key) => typeof service[key as keyof VisitService] === 'string',
  );
}

function isTransitRoute(value: unknown): value is VisitTransitRoute {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const route = value as Partial<VisitTransitRoute>;
  return ['id', 'type', 'line', 'station', 'walkingTime'].every(
    (key) => typeof route[key as keyof VisitTransitRoute] === 'string',
  );
}

export function resolveVisitCopy(
  content: Record<string, unknown>,
  language: string,
): VisitCopy {
  const preferred = normalizeVisitCopy(content[language]);
  if (hasVisitContent(preferred)) {
    return preferred;
  }

  const fallbackCodes = [
    'en',
    ...Object.keys(content).filter((code) => code !== language && code !== 'en'),
  ];
  for (const code of fallbackCodes) {
    const candidate = normalizeVisitCopy(content[code]);
    if (hasVisitContent(candidate)) {
      return candidate;
    }
  }
  return preferred;
}

function hasVisitContent(copy: VisitCopy): boolean {
  return Boolean(
    copy.services.some((service) =>
      [service.name, service.day, service.time, service.place].some((value) =>
        value.trim(),
      ),
    ) ||
      copy.address.trim() ||
      [...copy.primaryTransit, ...copy.secondaryTransit].some((route) =>
        [route.type, route.line, route.station, route.walkingTime].some(
          (value) => value.trim(),
        ),
      ) ||
      copy.googleMapsUrl.trim(),
  );
}

export function isSafeGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['google.com', 'www.google.com', 'maps.app.goo.gl'].includes(
        url.hostname,
      ) &&
      (url.hostname === 'maps.app.goo.gl' || url.pathname.startsWith('/maps'))
    );
  } catch {
    return false;
  }
}
