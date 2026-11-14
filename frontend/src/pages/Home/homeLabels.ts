import { Language } from '../../shared/types/Language';
import { toContentLanguage } from '../../shared/config/siteLanguages';

const labels = {
  [Language.KO]: {
    yearMotto: '올해의 표어',
    heroSlides: '첫 화면 사진 슬라이드',
    heroSlide: '사진',
    worship: '교회 찬양',
    philosophy: '목회 철학',
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
