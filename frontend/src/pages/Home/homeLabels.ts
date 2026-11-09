import { Language } from '../../shared/types/Language';
import { toContentLanguage } from '../../shared/config/siteLanguages';

const labels = {
  [Language.KO]: {
    yearMotto: '올해의 표어',
    heroSlides: '첫 화면 사진 슬라이드',
    heroSlide: '사진',
    worship: '교회 찬양',
    philosophy: '목회 철학',
    philosophyItems: [
      '날마다 개척하는 마음으로 교회를 섬깁니다',
      '매 예배의 설교를 마지막처럼 여기고 복음을 전합니다',
      '만나게 하신 한 영혼, 한 영혼마다 최선을 다해 사랑합니다',
    ],
    bibleVerse: '올해의 말씀',
    videoUnavailable: '찬양 영상이 아직 등록되지 않았습니다.',
    videoTitle: '베를린 새누리교회 찬양 영상',
    playVideo: '찬양 영상 재생',
    panoramaLabel: '베를린 새누리교회 공동체',
  },
  [Language.EN]: {
    yearMotto: 'This year’s motto',
    heroSlides: 'Homepage slideshow',
    heroSlide: 'Slide',
    worship: 'Worship',
    philosophy: 'Our Pastoral Philosophy',
    philosophyItems: [
      'We serve the church each day with a pioneering spirit.',
      'We preach the gospel in every service as if it were our last.',
      'We wholeheartedly love every person God brings into our lives.',
    ],
    bibleVerse: 'Bible verse',
    videoUnavailable: 'No worship video has been selected yet.',
    videoTitle: 'Berlin Saenuree Church worship video',
    playVideo: 'Play worship video',
    panoramaLabel: 'Berlin Saenuree Church community',
  },
  [Language.DE]: {
    yearMotto: 'Jahresmotto',
    heroSlides: 'Startseiten-Slideshow',
    heroSlide: 'Bild',
    worship: 'Lobpreis',
    philosophy: 'Unsere pastorale Leitidee',
    philosophyItems: [
      'Wir dienen der Gemeinde jeden Tag mit einem Pioniergeist.',
      'In jedem Gottesdienst verkündigen wir das Evangelium, als wäre es unsere letzte Gelegenheit.',
      'Wir lieben jeden einzelnen Menschen, den Gott uns begegnen lässt, von ganzem Herzen.',
    ],
    bibleVerse: 'Bibelvers',
    videoUnavailable: 'Es wurde noch kein Lobpreisvideo ausgewählt.',
    videoTitle: 'Lobpreisvideo der Berlin Saenuree Gemeinde',
    playVideo: 'Lobpreisvideo abspielen',
    panoramaLabel: 'Gemeinschaft der Berlin Saenuree Gemeinde',
  },
};

export function getHomeLabels(language: string) {
  return labels[toContentLanguage(language)];
}
