import { apiClient } from '../lib/axios';
import type { HomeContentByLanguage } from '../content/homeContent';
import type { Language } from '../types/Language';

export type PageContentResponse = {
  slug: string;
  contentRevision: number;
  content: HomeContentByLanguage;
};

export type PageDocument = {
  contentRevision: number;
  content: HomeContentByLanguage;
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
  return { contentRevision: data.contentRevision, content: data.content };
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
  const response = await apiClient.put<PageContentResponse>(`/pages/${slug}`, {
    contentRevision: document.contentRevision,
    content: document.content,
  });
  return pageDocumentFromResponse(response.data);
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
