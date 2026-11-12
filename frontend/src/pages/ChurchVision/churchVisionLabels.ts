import { toContentLanguage } from '../../shared/config/siteLanguages';
import { Language } from '../../shared/types/Language';

const labels = {
  [Language.KO]: {
    title: '교회 비전',
    pageHeading: '“예배는 선교의 동력이자 선교의 목표”를 중심으로',
    contentUnavailable: '교회 비전 콘텐츠를 불러오지 못했습니다.',
  },
  [Language.EN]: {
    title: 'Church Vision',
    pageHeading: 'With the conviction that worship is both the driving force and the goal of mission',
    contentUnavailable: 'Church vision content could not be loaded.',
  },
  [Language.DE]: {
    title: 'Gemeindevision',
    pageHeading: 'In der Überzeugung, dass Anbetung sowohl die Kraft als auch das Ziel der Mission ist',
    contentUnavailable: 'Der Inhalt zur Gemeindevision konnte nicht geladen werden.',
  },
};

export function getChurchVisionLabels(language: string) {
  return labels[toContentLanguage(language)];
}
