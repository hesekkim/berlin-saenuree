# 예배 및 오시는 길 페이지 통합

- 상태: 대기
- 유형: 페이지

## 목적

예배 시간과 교회 위치 정보를 `/visit` 한 페이지에서 확인할 수 있도록 기존 예배 안내와 위치 안내를 통합한다. 방문자가 예배 일정과 방문에 필요한 위치 정보를 한 흐름으로 빠르게 확인할 수 있게 한다.

## 참고 기준

- 레거시 예배 안내: `legacy-frontend/src/pages/Worship/`
- 레거시 위치 안내: `legacy-frontend/src/pages/Location/`
- 레거시 교통·장소 이미지: `legacy-frontend/src/pages/Location/img/`, `legacy-frontend/src/components/Map/img/`
- 현재 페이지 라우트: `frontend/src/app/router.tsx`
- 현재 Navbar: `frontend/src/shared/config/navbar-items.ts`
- CMS 페이지 콘텐츠: `frontend/src/shared/api/cmsApi.ts`와 기존 페이지 콘텐츠 API
- CMS 페이지 권한·콘텐츠 편집기: `backend/services/page_catalog.py`, `frontend/src/pages/Admin/adminNav.ts`, 기존 Admin 페이지 편집 패턴
- 별도 데이터 소스나 백엔드 API를 추가하지 않는다.

## 작업 범위

1. `/visit`을 예배·위치 정보 통합 페이지로 구현하고 Navbar에는 `예배 및 오시는 길` 항목 하나만 노출한다.
2. `/worship`, `/location` 라우트와 기존 페이지 컴포넌트를 제거한다. 호환 redirect나 섹션 앵커는 만들지 않는다.
3. 레거시 예배 일정을 보존하고 방문자가 요일과 시간을 먼저 알아볼 수 있는 현대적인 반응형 카드로 표시한다.
   - 주일 예배: 주일 11:30, GROSSER SAAL
   - 주일 학교: 주일 11:30, GROSSER SAAL
   - 새벽 예배: 월요일부터 토요일까지 7:00, GROSSER SAAL
4. CMS 관리자가 지원 언어별 예배 일정과 위치 정보를 수정할 수 있도록 `visit` 페이지 콘텐츠와 관리자 편집 화면을 추가한다. 공용 콘텐츠 모델과 기존 페이지 API·권한 체계를 확장하고, UI 문구는 기존 언어별 UI 번역 규칙을 따른다.
5. 주소를 표시하고, 대중교통은 주요 경로와 보조 경로로 나눈다.
   - 주소: Borsigstraße 5, 10115 Berlin
   - 주요 경로: S-Bahn S1·S2, Nordbahnhof역에서 도보 4분; U-Bahn U6, Oranienburger Tor역에서 도보 7분
   - 보조 경로: Tram M5, Oranienburger Tor역에서 도보 6분; Bus 142, Tucholskystraße 정류장에서 도보 2분. 보조 경로는 기본 화면에서 접힌 상태로 제공한다.
   - 노선·역 이름·도보 시간은 CMS에서 지원 언어별로 수정할 수 있게 한다.
6. Google 지도는 정적 스크린샷으로 표시하고 확대·축소 버튼으로 레거시의 네 가지 확대 수준을 전환한다. Google 지도 열기 버튼은 제공하되 BVG 링크, Google Maps Embed API, API 키 및 지도 iframe은 추가하지 않는다.
7. GROSSER SAAL 사진 네 장을 기존 자산으로 재사용해 슬라이드로 표시한다. 데스크톱에서는 화살표와 페이지 점, 모바일에서는 스와이프와 페이지 점으로 조작하며 자동 재생은 하지 않는다.
8. 화면은 `예배 시간` 다음에 `오시는 길`이 이어지는 한 페이지 흐름으로 구성한다. 데스크톱과 모바일에서 읽고 조작하기 쉬워야 한다.
9. 페이지 제목, 정적 UI 문구와 CMS 콘텐츠는 한국어·영어·독일어를 지원하고, 현재 콘텐츠 언어 fallback 규칙을 따른다.
10. 색상은 공통 CSS custom property를 사용하며 다크모드 기능은 추가하지 않는다.

## 제외 범위

- 교회 비전, 교회 역사, 담임목사 소개 등 다른 페이지의 콘텐츠 변경
- Home 콘텐츠나 관리자 Posts 기능 변경
- `/worship`, `/location` 주소 호환 redirect 및 섹션 앵커
- BVG 링크, Google Maps Embed API, 지도 API 키 또는 새로운 지도 서비스 추가

## 완료 조건

- Navbar에는 통합 페이지 진입 항목 하나만 있으며 `/visit`에서 세 가지 예배 일정과 장소가 확인된다.
- CMS 관리자에서 지원 언어별 예배 일정, 주소, 교통 안내와 Google 지도 링크를 조회·수정할 수 있다.
- 위치 섹션은 주소와 Google 지도 열기 버튼을 먼저 제공하고, S-Bahn·U-Bahn 주요 경로를 눈에 띄게 표시한다. Tram·Bus는 사용자가 펼쳐 확인한다.
- BVG 링크, 지도 iframe, Google Maps Embed API 및 API 키 의존성이 없다.
- 지도 스크린샷은 접근 가능한 확대·축소 버튼으로 네 가지 확대 수준을 전환한다.
- GROSSER SAAL 슬라이드는 데스크톱 화살표·페이지 점, 모바일 스와이프·페이지 점을 지원하고 자동 재생하지 않는다.
- `/worship`, `/location` 라우트와 기존 placeholder 페이지가 제거되고, 해당 URL은 통합 페이지의 특정 섹션으로 이동시키지 않는다.
- 외부 링크는 새 탭 사용 시 적절한 보안 속성을 가지며 이미지 및 인터랙티브 요소에 접근성 이름을 제공한다.
- 정적 UI와 CMS 콘텐츠가 한국어·영어·독일어 및 기존 fallback 규칙을 따르며, 일부 콘텐츠가 비어도 오류 없이 표시된다.
- Navbar와 Footer 등 공용 레이아웃을 유지하고 관련 frontend/backend 테스트, 타입 검사 및 lint가 통과한다.

## 검증

- `/visit`의 예배 일정, CMS 언어별 콘텐츠 및 fallback 동작 확인
- 주요·보조 교통 정보와 Google 지도 열기 링크 확인
- 지도 확대·축소와 데스크톱 화살표/모바일 스와이프 사진 슬라이드 사용성 확인
- 제거된 두 라우트가 더는 `/visit`의 특정 섹션으로 연결되지 않는지 확인
- 관련 frontend/backend 테스트, frontend 타입 검사 및 lint 실행
