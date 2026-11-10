# Home 페이지 레거시 콘텐츠 이관 및 CMS 연결

- 상태: 완료
- 유형: 페이지

## 목적

레거시 Home의 핵심 콘텐츠를 현재 프로젝트로 이관하고 reference의 시각 디자인을 참고한다. Home 전용 콘텐츠는 기존 CMS 페이지 콘텐츠와 미디어 API로 관리한다.

## 참고 기준

- 레거시 Home: `legacy-frontend/src/pages/Home/`
- 레거시 표어·말씀·찬양: `legacy-frontend/src/components/Verse/`, `YoutubeVideo/`
- 디자인 참고: `reference-frontend/src/index.css`, `features/Home/`
- 현재 Home/CMS: `frontend/src/pages/Home/`, `frontend/src/pages/Admin/Pages/Home/`
- 현재 페이지 콘텐츠 API: `backend/api/v1/endpoints/pages.py`, `backend/services/page_content_service.py`

참고 프로젝트를 런타임에서 import하거나 URL로 참조하지 않는다. 다크모드는 이관하지 않는다. Navbar의 교회명과 중복되는 별도 교회 소개는 Home에 추가하지 않는다.

## 작업 범위

1. Home에 올해의 표어와 성경 말씀, 교회 찬양 영상, 목회 철학을 표시한다.
2. 첫 화면 사진은 CMS에서 여러 장 관리한다. 기본 대체 사진은 사용하지 않으며, 사진이 둘 이상이면 3.5초 간격으로 자동 순환하고 현재 사진을 하단 대시 인덱스로 표시한다.
3. Home 하단 파노라마 사진을 CMS로 관리한다.
4. Home 디자인은 reference의 폰트·색상·시각적 위계를 참고하고, 색상은 공통 CSS custom property를 사용한다. 현재 Home의 콘텐츠와 디자인을 유지한다.
5. CMS에서 지원 언어별 표어·말씀·참조 구절을 편집할 수 있게 한다. 저장 파일의 언어별 항목에는 이 세 문구만 두고, 첫 화면 슬라이드 사진·파노라마 사진·찬양 영상 URL은 최상위 `sharedMedia`에 한 번만 저장한다. 이미지는 기존 미디어 업로드·최적화 API를 사용한다.
6. 찬양 영상 URL도 언어에 종속되지 않는 공용 콘텐츠로 관리한다. CMS에서 최대 3개의 URL 또는 ID를 지정·고정하고, 빈 입력은 미등록으로 취급하며 유효한 YouTube 영상 ID만 임베드한다. 기본 YouTube API 키나 외부 영상 검색은 추가하지 않는다.
7. 모바일 찬양 영상은 중앙 정렬되는 가로 스와이프 카드로 표시한다. 다른 영상 카드로 이동하면 이전 영상 재생을 종료한다.
8. 미저장 업로드의 새로고침 복구와 교체·삭제 시 미디어 정리, CMS 저장 충돌 처리를 유지한다.
9. SaenureeNews 사진 및 Posts 공개 API는 이번 티켓 범위에서 제외한다. Home 콘텐츠나 Posts 관리 기능 변경과 결합하지 않는다.

## 완료 조건

- Home에 표어·성경 말씀·찬양 영상·목회 철학이 표시된다.
- 기본 첫 화면 대체 이미지는 없으며, CMS에 등록된 여러 사진은 모든 언어에서 동일하게 3.5초 간격으로 순환하고 하단 인덱스로 위치를 표시한다.
- 첫 화면 사진과 파노라마 사진을 CMS에서 언어별 문구와 독립적으로 업로드·저장·삭제할 수 있다. 저장하지 않은 미디어도 복구 과정에서 정리된다.
- CMS 영상 URL은 최대 3개이며 모든 언어에서 동일하게 표시·수정된다. 비어 있는 항목은 무시하고, 잘못된 URL은 임베드하지 않는다.
- 모바일 찬양 영상 카드는 좌우 끝을 포함해 선택한 카드가 화면 중앙에 정렬되며, 다른 카드로 이동하면 기존 재생을 종료한다.
- CMS 문구는 기존 언어 fallback 동작을 유지한다.
- 콘텐츠가 비어 있어도 페이지가 깨지지 않으며 Navbar, Footer, Home 팝업을 유지한다.
- 뉴스 사진을 Home에 노출하는 Posts 공개 API나 Posts 관리자 기능 변경은 포함하지 않는다.
- 신규 UI 문구는 한국어·영어·독일어를 지원하고, 다크모드와 외부 YouTube API 키 의존성을 추가하지 않는다.
- 관련 frontend/backend 테스트, 타입 검사 및 lint가 통과한다.

## 검증

- backend unit: 페이지 콘텐츠 보존, 미디어 참조 보호·정리, 기존 단일 이미지 데이터 호환 확인
- frontend unit: CMS 콘텐츠 fallback, 미저장 업로드 복구, YouTube URL/ID 검증 확인
- frontend typecheck/lint와 backend 관련 unit 테스트 실행
