import { apiClient } from '../lib/axios';
import {
  normalizeSharedHomeMedia,
  normalizeHomeCopy,
  createEmptyHomeSharedMedia,
  type HomeContentByLanguage,
  type HomeSharedMedia,
} from '../content/homeContent';
import type { Language } from '../types/Language';

export type PageContentResponse = {
  slug: string;
  contentRevision: number;
  content: Record<
    string,
    Partial<HomeContentByLanguage[string]> & { youtubeVideoUrl?: string }
  >;
  sharedMedia?: Partial<HomeSharedMedia> | ChurchHistorySharedMedia | null;
};

export type ChurchHistorySharedMedia = {
  events: Record<string, { imageId: string; sourceFileId: string }>;
};

export type PageDocument = {
  contentRevision: number;
  content: HomeContentByLanguage;
};

export type EditablePageContent = Record<string, Record<string, unknown>>;

export type EditablePageDocument = {
  contentRevision: number;
  content: EditablePageContent;
  sharedMedia?: unknown;
};

export type SiteSettingsResponse = {
  availableLanguages: string[];
  adminLanguage: Language;
  defaultLanguage: string;
  pageAdminEnabled: boolean;
};

export type SiteSettingsUpdate = {
  availableLanguages?: string[];
  adminLanguage?: Language;
  defaultLanguage?: string;
};

export function pageDocumentFromResponse(
  data: PageContentResponse
): PageDocument {
  const content = Object.fromEntries(
    Object.entries(data.content).map(([language, copy]) => [
      language,
      {
        ...normalizeHomeCopy(copy),
        youtubeVideoUrls:
          copy.youtubeVideoUrls ??
          (copy.youtubeVideoUrl ? [copy.youtubeVideoUrl] : []),
      },
    ])
  );
  let normalizedContent = normalizeSharedHomeMedia(
    content as HomeContentByLanguage
  );
  if (data.slug === 'home' && data.sharedMedia) {
    const sharedMedia = {
      ...createEmptyHomeSharedMedia(),
      ...data.sharedMedia,
    };
    normalizedContent = Object.fromEntries(
      Object.entries(normalizedContent).map(([language, copy]) => [
        language,
        { ...copy, ...sharedMedia },
      ])
    );
  }
  return {
    contentRevision: data.contentRevision,
    content: normalizedContent,
  };
}

export async function fetchPageDocument(slug: string): Promise<PageDocument> {
  const response = await apiClient.get<PageContentResponse>(`/pages/${slug}`);
  return pageDocumentFromResponse(response.data);
}

export async function fetchPageContent(
  slug: string
): Promise<HomeContentByLanguage> {
  const document = await fetchPageDocument(slug);
  return document.content;
}

/** Rejects with an axios error whose response status is 409 when the revision is stale. */
export async function savePageDocument(
  slug: string,
  document: PageDocument
): Promise<PageDocument> {
  let content = document.content;
  let sharedMedia: HomeSharedMedia | undefined;
  if (slug === 'home') {
    content = normalizeSharedHomeMedia(content);
    const sharedCopy = Object.values(content)[0];
    sharedMedia = sharedCopy
      ? {
          heroImages: sharedCopy.heroImages,
          panoramaImageId: sharedCopy.panoramaImageId,
          panoramaSourceFileId: sharedCopy.panoramaSourceFileId,
          youtubeVideoUrls: sharedCopy.youtubeVideoUrls,
        }
      : createEmptyHomeSharedMedia();
    const sharedFields = new Set([
      'heroImages',
      'panoramaImageId',
      'panoramaSourceFileId',
      'youtubeVideoUrls',
    ]);
    content = Object.fromEntries(
      Object.entries(content).map(([language, copy]) => [
        language,
        Object.fromEntries(
          Object.entries(copy).filter(([key]) => !sharedFields.has(key))
        ),
      ])
    ) as HomeContentByLanguage;
  }
  const response = await apiClient.put<PageContentResponse>(`/pages/${slug}`, {
    contentRevision: document.contentRevision,
    content,
    ...(sharedMedia ? { sharedMedia } : {}),
  });
  return pageDocumentFromResponse(response.data);
}

export async function fetchEditablePageDocument(
  slug: string,
): Promise<EditablePageDocument> {
  const response = await apiClient.get<PageContentResponse>(`/pages/${slug}`);
  return {
    contentRevision: response.data.contentRevision,
    content: response.data.content,
    sharedMedia: response.data.sharedMedia,
  };
}

export async function fetchPublicChurchHistoryContent(): Promise<EditablePageContent> {
  const response = await apiClient.get<PageContentResponse>(
    '/pages/church-history/public',
  );
  return response.data.content;
}

export async function saveEditablePageDocument(
  slug: string,
  document: EditablePageDocument,
): Promise<EditablePageDocument> {
  const response = await apiClient.put<PageContentResponse>(`/pages/${slug}`, {
    contentRevision: document.contentRevision,
    content: document.content,
    ...(document.sharedMedia ? { sharedMedia: document.sharedMedia } : {}),
  });
  return {
    contentRevision: response.data.contentRevision,
    content: response.data.content,
    sharedMedia: response.data.sharedMedia,
  };
}

export async function fetchSiteSettings(): Promise<SiteSettingsResponse> {
  const response = await apiClient.get<SiteSettingsResponse>('/site-settings');
  return response.data;
}

export async function saveSiteSettings(
  update: SiteSettingsUpdate
): Promise<SiteSettingsResponse> {
  const response = await apiClient.put<SiteSettingsResponse>(
    '/site-settings',
    update
  );
  return response.data;
}
