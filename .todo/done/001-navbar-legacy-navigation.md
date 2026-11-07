# 레거시 페이지 내비게이션을 위한 Navbar 확장

- 상태: 완료
- 유형: 공통 컴포넌트

## 목적

현재 프로젝트에 이미 있는 Navbar를 재사용해 레거시 사이트의 주요 페이지로 이동할 수 있게 한다. 레거시 페이지의 본 구현은 이 티켓 범위에 포함하지 않으며, 각 페이지의 이름만 보여주는 임시 화면을 연결해 메뉴와 URL이 실제로 동작하도록 한다.

## 참고 기준

- 기존 Navbar 구현: `frontend/src/shared/components/Navbar/`
- 현재 라우터 및 앱 셸: `frontend/src/app/router.tsx`, `frontend/src/app/App.tsx`
- Navbar 항목 구조: `frontend/src/shared/config/navbar-items.ts`
- 레거시 메뉴 구조와 로고: `legacy-frontend/src/App.jsx`, `legacy-frontend/src/components/Navbar/`
- 시각 디자인 기준: `reference-frontend/src/index.css`, `reference-frontend/src/shared/components/Navbar/`

`legacy-frontend/`와 `reference-frontend/`는 Git에서 제외된 참고 프로젝트다. 실행 중 이 디렉터리를 import하거나 URL로 참조하지 않는다. 필요한 레거시 로고만 `frontend/`의 관리 대상 asset으로 가져온다.

## 작업 범위

1. 기존 Navbar 컴포넌트와 메뉴 항목 설정을 확장한다. 별도의 Navbar를 새로 만들지 않는다.
2. Navbar 왼쪽에 레거시의 교회 로고와 `베를린 새누리교회` 이름을 표시하고 홈으로 이동하도록 한다. 다크모드가 없으므로 밝은 배경에 맞는 로고만 사용한다.
3. 메뉴 이름과 각 목적지 경로를 다음과 같이 구성한다. 영문·독문에서 교회 이름은 `Saenuree` 표기를 사용한다.

   | 메뉴 | 하위 메뉴 및 경로 |
   | --- | --- |
   | 교회 소개 | 교회역사 `/about/church-history`, 담임목사 소개 `/about/senior-pastor` |
   | 우리의 소명 | 목회 철학 `/calling/pastoral-philosophy`, 교회 비전 `/calling/church-vision` |
   | 새누리 소식 (`Saenuree News`) | `/saenuree-news` |
   | 예배 안내 | `/worship` |
   | 위치 안내 | `/location` |

4. 위 표의 각 목적지에 페이지 이름만 표시하는 임시 화면을 연결한다. 실제 레거시 페이지 레이아웃, 콘텐츠, 데이터 이관은 하지 않는다. 기존 `/home` 페이지는 유지하고 Navbar의 로고에서 접근할 수 있게 한다.
5. 중첩 메뉴는 데스크톱에서 마우스와 키보드로 이용할 수 있게 하고, 모바일에서는 기존 반응형 메뉴 안에서 열고 선택할 수 있게 한다. 선택 후 모바일 메뉴를 닫는다.
6. Language 메뉴도 일반 submenu와 같은 패널 디자인을 사용한다. 모바일에서 submenu 항목을 구분하는 divider를 표시하고, 화면 크기 전환 시 열린 메뉴를 닫는다.
7. Navbar 배경은 Footer와 같은 밝은 배경으로 한다. 처음에는 하단 divider가 없고, 스크롤한 뒤에만 약간 투명한 배경과 divider를 표시한다.
8. 폰트와 색상은 `reference-frontend`의 시각 기준을 따른다. 영문·독문 메뉴에는 전역 본문 폰트를 사용하고 한국어에는 한국어 폰트를 유지한다. 색상은 CSS에 직접 입력하지 말고 현재 frontend의 전역 CSS custom property(예: `--color-bg`, `--color-bg-secondary`, `--color-text`, `--color-primary`, `--color-accent`, `--color-border`)를 사용한다. 필요한 색상 토큰이 없으면 기존 공통 토큰 체계에 추가하고 컴포넌트 CSS에는 색상 값을 하드코딩하지 않는다. 폰트는 현재 frontend의 폰트 로딩 구조에 통합한다.
9. Navbar의 교회 이름 표기는 브랜드명으로 한국어 `베를린 새누리교회`를 유지한다. 메뉴·페이지 이름은 현재 프로젝트의 언어 설정에 맞춰 표시하고, 화면 코드에 별도의 번역 맵을 추가하지 않는다. 기존 CMS/언어 설정의 페이지 제목 및 fallback 규칙을 따른다.

## 완료 조건

- 기존 Navbar가 유지·확장되고, 로고와 교회 이름이 왼쪽에 표시되며 로고 클릭 시 기존 홈 페이지로 이동한다.
- 다크모드 토글이나 다크모드 상태·스타일을 추가하지 않는다.
- 레거시 메뉴의 모든 목적지에 Navbar 링크가 있고, 링크 클릭과 URL 직접 진입/새로고침 모두 해당 경로의 임시 화면을 표시한다.
- 임시 화면에는 해당 페이지 이름만 표시한다. 실제 페이지 콘텐츠나 임의의 레거시 데이터는 추가하지 않는다.
- 기존 `/home`, `/privacy-policy`, `/admin` 동작을 깨뜨리지 않는다. Admin 경로는 기존처럼 공개 Navbar/Footer 셸을 표시하지 않는다.
- 데스크톱 및 모바일 폭에서 메뉴가 화면 밖으로 잘리거나 본문 조작을 막지 않는다. 링크와 메뉴 열기/닫기를 키보드로 사용할 수 있고, 현재 선택 경로를 구분할 수 있다.
- Language와 일반 submenu가 데스크톱에서 같은 패널 스타일을 사용하고, submenu 폭은 가장 긴 항목에 맞는다. 선택된 언어는 현재 선택된 submenu와 같은 강조색으로 표시한다.
- 모바일에서 하위 메뉴를 열 수 있고 항목 구분 divider를 표시한다. 화면 크기를 모바일에서 데스크톱으로 바꾸면 열린 언어 메뉴가 닫힌다.
- Navbar는 처음에 divider가 없고 Footer와 같은 배경색을 사용한다. 스크롤 뒤에만 약간 투명한 배경과 divider가 나타난다.
- 적용한 폰트·색상이 reference의 시각 방향과 일치하며 현재 프로젝트 전역 스타일과 충돌하지 않는다. CSS에 색상값을 직접 하드코딩하지 않고 공통 토큰을 사용한다.
- 이관한 로고 asset 외에 `legacy-frontend/` 또는 `reference-frontend/`를 런타임 의존성으로 추가하지 않는다.

## 제외 범위

- 각 페이지의 실제 디자인·콘텐츠·백엔드 API 이관
- ArticleNews 상세 화면 등 메뉴에 없는 레거시 페이지 경로
- 다크모드 기능
- Footer 변경 (별도 티켓 `002-footer-legacy-content.md`)

## 검증

- 공개 Navbar의 각 링크와 새 경로를 확인한다: `/about/church-history`, `/about/senior-pastor`, `/calling/pastoral-philosophy`, `/calling/church-vision`, `/saenuree-news`, `/worship`, `/location`.
- 데스크톱과 모바일 viewport에서 상위/하위 메뉴, Language 메뉴 스타일과 선택 언어 표시, 화면 크기 전환 시 메뉴 닫힘을 확인한다.
- Navbar의 스크롤 전·후 배경 및 divider와 기존 홈, 개인정보 처리방침, admin 진입을 확인한다.
- `npm run build`, 관련 파일 ESLint, frontend unit tests를 실행한다.
