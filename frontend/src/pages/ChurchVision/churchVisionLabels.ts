import { toContentLanguage } from '../../shared/config/siteLanguages';
import { Language } from '../../shared/types/Language';

const labels = {
  [Language.KO]: {
    title: '교회 비전',
    contentUnavailable: '교회 비전 콘텐츠를 불러오지 못했습니다.',
  },
  [Language.EN]: {
    title: 'Church Vision',
    contentUnavailable: 'Church vision content could not be loaded.',
  },
  [Language.DE]: {
    title: 'Gemeindevision',
    contentUnavailable: 'Der Inhalt zur Gemeindevision konnte nicht geladen werden.',
  },
};

export function getChurchVisionLabels(language: string) {
  return labels[toContentLanguage(language)];
}
