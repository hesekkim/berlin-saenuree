import { toContentLanguage } from '../../shared/config/siteLanguages';
import { Language } from '../../shared/types/Language';

const labels = {
  [Language.KO]: {
    title: '교회 비전',
    pageHeading: '“예배는 선교의 동력이자 선교의 목표”를 중심으로',
    fallbackNotice: '서버에 연결할 수 없어 저장된 교회 비전 콘텐츠를 표시하고 있습니다.',
  },
  [Language.EN]: {
    title: 'Church Vision',
    pageHeading: 'With the conviction that worship is both the driving force and the goal of mission',
    fallbackNotice: 'The server is unavailable. Showing saved church vision content.',
  },
  [Language.DE]: {
    title: 'Gemeindevision',
    pageHeading: 'In der Überzeugung, dass Anbetung sowohl die Kraft als auch das Ziel der Mission ist',
    fallbackNotice: 'Der Server ist nicht erreichbar. Gespeicherte Inhalte zur Gemeindevision werden angezeigt.',
  },
};

export function getChurchVisionLabels(language: string) {
  return labels[toContentLanguage(language)];
}
