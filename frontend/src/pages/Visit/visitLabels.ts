import { Language } from '../../shared/types/Language';
import { toContentLanguage } from '../../shared/config/siteLanguages';

const labels = {
  [Language.KO]: {
    heading: '함께 예배드리기 위해 방문하시는 길을 안내합니다',
    scheduleTitle: '예배 시간',
    locationTitle: '오시는 길',
    timeLabel: '예배 시간',
    placeLabel: '장소',
    addressLabel: '주소',
    primaryTransitTitle: '가까운 대중교통',
    secondaryTransitTitle: '다른 대중교통',
    showSecondaryTransit: '다른 교통편 보기',
    hideSecondaryTransit: '다른 교통편 접기',
    openMaps: 'Google 지도에서 길찾기',
    mapTitle: '교회 주변 지도',
    zoomIn: '지도 확대',
    zoomOut: '지도 축소',
    venueTitle: '예배 장소',
    previousPhoto: '이전 사진',
    nextPhoto: '다음 사진',
    photoSlide: 'GROSSER SAAL 사진 {current} / {total}',
    photoPicker: '{number}번째 사진 보기',
    contentUnavailable: '페이지 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  },
  [Language.EN]: {
    heading: 'Everything you need to join us for worship',
    scheduleTitle: 'Service Times',
    locationTitle: 'How to Find Us',
    timeLabel: 'Service time',
    placeLabel: 'Location',
    addressLabel: 'Address',
    primaryTransitTitle: 'Nearby public transport',
    secondaryTransitTitle: 'Other public transport',
    showSecondaryTransit: 'Show other routes',
    hideSecondaryTransit: 'Hide other routes',
    openMaps: 'Get directions with Google Maps',
    mapTitle: 'Map around the church',
    zoomIn: 'Zoom in on map',
    zoomOut: 'Zoom out on map',
    venueTitle: 'Worship Venue',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    photoSlide: 'GROSSER SAAL photo {current} of {total}',
    photoPicker: 'Show photo {number}',
    contentUnavailable: 'Could not load page information. Please try again later.',
  },
  [Language.DE]: {
    heading: 'Alle Informationen für Ihren Besuch beim Gottesdienst',
    scheduleTitle: 'Gottesdienstzeiten',
    locationTitle: 'Anfahrt',
    timeLabel: 'Gottesdienstzeit',
    placeLabel: 'Ort',
    addressLabel: 'Adresse',
    primaryTransitTitle: 'Öffentliche Verkehrsmittel in der Nähe',
    secondaryTransitTitle: 'Weitere Verkehrsmittel',
    showSecondaryTransit: 'Weitere Verbindungen anzeigen',
    hideSecondaryTransit: 'Weitere Verbindungen ausblenden',
    openMaps: 'Route mit Google Maps öffnen',
    mapTitle: 'Karte rund um die Gemeinde',
    zoomIn: 'Karte vergrößern',
    zoomOut: 'Karte verkleinern',
    venueTitle: 'Gottesdienstraum',
    previousPhoto: 'Vorheriges Foto',
    nextPhoto: 'Nächstes Foto',
    photoSlide: 'GROSSER SAAL – Foto {current} von {total}',
    photoPicker: 'Foto {number} anzeigen',
    contentUnavailable: 'Seiteninformationen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.',
  },
};

export function getVisitLabels(language: string) {
  return labels[toContentLanguage(language)];
}

export function formatVisitLabel(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? ''),
  );
}
