import homeFallbackResponse from './fallbacks/home.json';
import visitFallbackDocument from './fallbacks/visit.json';
import churchHistoryFallbackContent from './fallbacks/church-history.json';
import churchVisionFallbackDocument from './fallbacks/church-vision.json';
import {
  pageDocumentFromResponse,
  type EditablePageContent,
  type EditablePageDocument,
  type PageContentResponse,
} from '../api/cmsApi';
import {
  normalizeHomeCopy,
  normalizeSharedHomeMedia,
  type HomeContentByLanguage,
} from './homeContent';
import {
  normalizeVisitSharedMedia,
  type VisitSharedMedia,
} from './visitContent';

type RecordValue = Record<string, unknown>;

export type VisitPageContent = EditablePageDocument & {
  sharedMedia: VisitSharedMedia;
};

const homeResponse = {
  ...homeFallbackResponse,
  slug: 'home',
} as PageContentResponse;
const visitFallbackRecord: RecordValue = isRecord(visitFallbackDocument)
  ? visitFallbackDocument
  : {};

export const HOME_FALLBACK_CONTENT =
  pageDocumentFromResponse(homeResponse).content;

export const VISIT_FALLBACK_DOCUMENT: VisitPageContent = {
  contentRevision:
    typeof visitFallbackRecord.contentRevision === 'number'
      ? visitFallbackRecord.contentRevision
      : 0,
  content: normalizeEditableContent(visitFallbackRecord.content),
  sharedMedia: normalizeVisitSharedMedia(visitFallbackRecord.sharedMedia),
};

export const CHURCH_HISTORY_FALLBACK_CONTENT = normalizeEditableContent(
  churchHistoryFallbackContent,
);

const churchVisionContent = isRecord(churchVisionFallbackDocument)
  ? churchVisionFallbackDocument.content
  : undefined;

export const CHURCH_VISION_FALLBACK_CONTENT = normalizeEditableContent(
  churchVisionContent,
);

export function normalizeHomePageContent(value: unknown): HomeContentByLanguage {
  if (!isRecord(value)) {
    return HOME_FALLBACK_CONTENT;
  }

  const content = Object.fromEntries(
    Object.entries(value).map(([language, copy]) => [
      language,
      normalizeHomeCopy(isRecord(copy) ? copy : undefined),
    ]),
  ) as HomeContentByLanguage;

  return normalizeSharedHomeMedia(content);
}

export function normalizeVisitDocument(value: unknown): VisitPageContent {
  if (!isRecord(value) || !isRecord(value.content)) {
    return VISIT_FALLBACK_DOCUMENT;
  }

  return {
    contentRevision:
      typeof value.contentRevision === 'number'
        ? value.contentRevision
        : VISIT_FALLBACK_DOCUMENT.contentRevision,
    content: normalizeEditableContent(value.content),
    sharedMedia: normalizeVisitSharedMedia(value.sharedMedia),
  };
}

export function normalizeEditableContent(value: unknown): EditablePageContent {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([language, copy]) => [
      language,
      isRecord(copy) ? copy : {},
    ]),
  );
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
