# Berlin Saenuree 티켓 작성 기준

사이트 작업을 이 문서의 규칙에 따라 티켓으로 나눠 관리한다.

- 작업 하나를 `.todo/` 루트의 Markdown 파일 하나로 관리한다.
- 파일명은 `NNN-짧은-제목.md` 형식으로 작성한다.
- 상태는 `대기` / `진행` / `보류` / `완료` 중 하나를 사용한다.
- 미완료 작업만 `.todo/` 루트에 둔다.
- 완료된 작업은 `done/`으로 이동한다.
- 새 작업 번호는 기존 번호 다음 순서로 지정한다. 아직 티켓이 없으면 `001`부터 시작한다.

## 레거시 프론트엔드 이관 방향

- `legacy-frontend/`는 기존 페이지 구성과 데이터의 참고 자료다. 페이지와 데이터는 유지하면서 현재 프로젝트의 `frontend/`와 `backend/` 구조에 맞게 이관한다.
- `reference-frontend/`는 폰트, 색상 등 시각 디자인만 참고한다. 페이지 구성과 데이터는 가져오지 않는다.
- `legacy-frontend/`와 `reference-frontend/`는 로컬 참고 프로젝트이며 Git 커밋에 포함하지 않는다.
- 레거시 다크모드는 이관하지 않으며 다크모드 기능을 추가하지 않는다.
- 한국어만을 전제로 구현하지 않는다. 현재 프로젝트의 CMS와 사이트 설정에서 지원하는 언어를 사용하고, 프론트엔드에 번역 맵을 하드코딩하지 않는다.
- CSS 색상값을 컴포넌트 스타일에 직접 하드코딩하지 않는다. `frontend/src/index.css`에 정의된 공통 CSS custom property를 사용하며, 새 색상이 필요하면 공통 토큰 체계에 추가한다.
- 티켓에 별도로 명시되지 않는 한 기존 페이지 구성과 데이터의 범위를 변경하지 않는다.

## 티켓 분할 순서

1. Navbar, Footer 등 여러 페이지에서 쓰는 공통 컴포넌트를 먼저 티켓으로 만든다.
2. 공통 컴포넌트가 준비되면 각 페이지를 별도 티켓으로 나눠 이관한다. 페이지 티켓은 해당 페이지의 레거시 구성·데이터를 유지하고 공통 컴포넌트를 재사용한다.
3. 각 티켓은 현재 프로젝트의 기존 프론트엔드·백엔드 API와 구조에 연결한다. 별도 데이터 소스나 백엔드를 만들지 않는다.

## 티켓 작성 기준

- 한 티켓은 한 가지 독립적으로 검토 가능한 결과물을 다룬다. 공통 컴포넌트 작업과 개별 페이지 이관을 한 티켓에 섞지 않는다.
- 티켓에 범위와 완료 조건을 명확히 적는다. 페이지 티켓은 이관 대상 페이지, 레거시에서 보존할 구성·데이터, 필요한 기존 API 연결을 명시한다.
- 완료된 티켓만 `done/`으로 이동한다.

## 완료된 작업

- [001-navbar-legacy-navigation.md](./done/001-navbar-legacy-navigation.md): Navbar 확장 및 메뉴 목적지 임시 화면 연결
- [002-footer-legacy-content.md](./done/002-footer-legacy-content.md): 레거시 교회 정보와 언어별 문구를 사용하는 반응형 Footer 구현
- [003-home-page-legacy-content.md](./done/003-home-page-legacy-content.md): Home 사진 슬라이드·콘텐츠 및 CMS 편집 기능
- [004-worship-and-location-page.md](./done/004-worship-and-location-page.md): 예배 및 오시는 길 페이지 통합
- [005-church-history-page.md](./done/005-church-history-page.md): 고정 연혁과 모든 지원 언어의 CMS 추가 연혁을 제공하는 교회 역사 페이지
- [006-shared-page-header.md](./done/006-shared-page-header.md): Visit·ChurchHistory 공통 페이지 헤더
- [007-senior-pastor-page.md](./done/007-senior-pastor-page.md): 정적 콘텐츠 기반 담임목사 소개 페이지
- [008-visit-admin-editor-tabs.md](./done/008-visit-admin-editor-tabs.md): Visit 관리자 편집기의 예배 일정·위치 정보 탭 분리
- [009-church-vision-page.md](./done/009-church-vision-page.md): CMS 기반 교회 비전 페이지, 새 URL과 반응형 디자인
- [010-saenuree-news-posts-blogger.md](./done/010-saenuree-news-posts-blogger.md): CMS Posts 기반 사진 소식과 조건부 Blogger 공개 페이지
- [011-church-vision-header-and-cms.md](./done/011-church-vision-header-and-cms.md): 교회 비전 헤더 문구 및 CMS 편집기 정리

## 대기 중인 티켓
- 없음
