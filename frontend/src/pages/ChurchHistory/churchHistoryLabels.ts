import { toContentLanguage } from '../../shared/config/siteLanguages';
import { Language } from '../../shared/types/Language';

const labels = {
  [Language.KO]: {
    tagline: '창립부터 오늘까지, 예배의 자리를 따라가 봅니다',
    timeline: '교회 연혁',
    timelineSubtitle: 'Berlin Saenuree',
    introductionLabel: '교회 소개',
    fallbackNotice: '서버에 연결할 수 없어 저장된 교회 역사 콘텐츠를 표시하고 있습니다.',
    introduction: [
      {
        quotation: '“위로하라, 내 백성을 위로하라”',
        reference: '이사야, 40장 1절',
        explanation:
          '베를린을 중심으로 한 영혼, 한 영혼에게 위로가 되는 교회를 만들고자 합니다.',
      },
      {
        quotation: '“너희는 세상의 빛과 소금이라”',
        reference: '마태복음, 5장 13-14절',
        explanation:
          '이웃과 사회에 빛과 소금의 역할을 하는 교회를 만들고자 합니다.',
      },
      {
        quotation: '“보라, 내가 새 일을 행하리니 이제 나타낼 것이다”',
        reference: '이사야, 43장 19절',
        explanation:
          '지역사회에서 하나님의 십자가를 지고 세상을 섬기고자 합니다.',
      },
    ],
  },
  [Language.EN]: {
    tagline: 'A story of faith and the places we have worshiped.',
    timeline: 'Our History',
    timelineSubtitle: 'Berlin Saenuree',
    introductionLabel: 'About the church',
    fallbackNotice: 'The server is unavailable. Showing saved church history content.',
    introduction: [
      {
        quotation: '“Comfort, comfort my people,” says your God.',
        reference: 'Isaiah 40:1',
        explanation: 'We hope to be a church that brings comfort to each person in Berlin.',
      },
      {
        quotation: '“You are the salt of the earth and the light of the world.”',
        reference: 'Matthew 5:13–14',
        explanation:
          'We hope to be a church that is salt and light to our neighbors and society.',
      },
      {
        quotation: '“See, I am doing a new thing!”',
        reference: 'Isaiah 43:19',
        explanation:
          'We seek to serve the world and our community, bearing the cross of God.',
      },
    ],
  },
  [Language.DE]: {
    tagline: 'Ein Weg des Glaubens und unserer Gottesdienstorte',
    timeline: 'Unsere Geschichte',
    timelineSubtitle: 'Berlin Saenuree',
    introductionLabel: 'Über die Gemeinde',
    fallbackNotice: 'Der Server ist nicht erreichbar. Gespeicherte Inhalte zur Gemeindegeschichte werden angezeigt.',
    introduction: [
      {
        quotation: '„Tröstet, tröstet mein Volk!“, spricht euer Gott.',
        reference: 'Jesaja 40,1',
        explanation:
          'Wir möchten eine Gemeinde sein, die jedem Menschen in Berlin Trost schenkt.',
      },
      {
        quotation: '„Ihr seid das Salz der Erde und das Licht der Welt.“',
        reference: 'Matthäus 5,13–14',
        explanation:
          'Wir möchten für unsere Nachbarn und die Gesellschaft Salz und Licht sein.',
      },
      {
        quotation: '„Siehe, ich wirke Neues!“',
        reference: 'Jesaja 43,19',
        explanation:
          'Wir möchten das Kreuz Gottes tragen und unserer Stadt und Welt dienen.',
      },
    ],
  },
};

export function getChurchHistoryLabels(language: string) {
  return labels[toContentLanguage(language)];
}
