# 레거시 교회 정보와 언어별 문구를 사용하는 반응형 Footer 구현 (완료)

- 상태: 완료
- 유형: 공통 컴포넌트

## 목적

현재 프로젝트에 이미 있는 Footer 컴포넌트를 확장해 reference의 전체 레이아웃과 반응형 배치를 적용하고, 표시할 교회 정보와 링크는 레거시 Footer의 값을 사용한다.

## 참고 기준

- 기존 Footer: `frontend/src/shared/components/Footer/`
- 앱 셸 연결: `frontend/src/app/App.tsx`
- 레거시 데이터와 Footer: `legacy-frontend/src/components/Footer/Footer.jsx`
- 레거시 배치 참고: `legacy-frontend/src/components/Footer/Footer.module.css`
- 목표 레이아웃 참고: `reference-frontend/src/shared/components/Footer/Footer.tsx`, `reference-frontend/src/shared/components/Footer/Footer.module.css`
- reference 폰트·색상: `reference-frontend/src/index.css`

두 참고 프로젝트를 런타임에서 import하거나 URL로 참조하지 않는다. Footer를 별도로 새로 만들지 않고 기존 컴포넌트를 확장한다.

## 작업 범위

1. 기존 Footer를 확장해 reference의 전체 정보 구조와 반응형 배치를 적용한다.
   - 왼쪽: 교회 이름
   - 오른쪽: 주소, 연락처, 채널 영역
   - 여백, 정렬, 구분선, 아이콘 배치와 화면 폭별 재배치를 적용한다.
2. reference의 폰트와 밝은 색상 체계를 따른다. 색상은 CSS에 직접 입력하지 말고 현재 frontend의 전역 CSS custom property(예: `--color-bg-secondary`, `--color-text`, `--color-primary`, `--color-accent`, `--color-border`)를 사용한다. 필요한 색상 토큰이 없으면 기존 공통 토큰 체계에 추가하고 Footer CSS에는 색상 값을 하드코딩하지 않는다. 폰트는 현재 frontend의 전역 폰트 로딩 구조에 통합하며, reference 전용 다크모드 스타일은 가져오지 않는다.
3. 표시 데이터는 레거시 Footer 값을 사용한다. reference의 개인 이름, 이메일, 제작자 정보 및 소셜 계정은 사용하지 않는다.

   | 항목 | 레거시 값 |
   | --- | --- |
   | 한국어 교회 이름 | 베를린 새누리교회 |
   | 영어 교회 이름 | Berlin saenuree Church |
   | 독일어 교회 이름 | Berliner saenuree-Gemeinde |
   | 주소 | Borsigstraße 5, 10115 Berlin, Germany |
   | 전화 | Tel.: +49-1767-2169883 |
   | 이메일 | hanjoorang@daum.net |
   | YouTube | `https://www.youtube.com/@berlinsaenuree` |
   | Instagram | `https://www.instagram.com/saenuree_berlin/` |
   | Facebook | `https://www.facebook.com/profile.php?id=100066258201031` |
   | 제작자 표기 | 사용하지 않음 |
   | 제작자 URL | 사용하지 않음 |

4. 주소, 전화, 이메일, 채널 링크는 적절한 링크 동작을 제공한다. 외부 링크는 새 탭으로 열 경우 `target="_blank"`와 `rel="noopener noreferrer"`를 설정한다. 이메일은 `mailto:`, 전화는 `tel:` 링크를 사용한다.
5. YouTube, Instagram, Facebook 아이콘은 각 링크의 접근 가능한 이름을 제공한다. 레거시 값에 없는 데이터나 reference 프로젝트의 채널을 보충하지 않는다.
6. Desktop에서는 reference의 좌우 구성과 정보/채널 배치를 유지한다. 태블릿·모바일에서는 항목을 세로로 재배치해 겹침, 잘림, 가로 스크롤이 없도록 한다.
7. Footer는 현재 앱 셸의 공개 페이지에서 일관되게 사용하고, 기존처럼 admin 화면에는 표시하지 않는다.
8. 교회 이름과 Footer 섹션 제목은 한국어·영어·독일어별로 표시한다. 교회 이름은 공통 `CHURCH_NAMES` 설정을 사용하고, 지원하지 않는 사이트 언어는 `toContentLanguage`에 따라 영어로 표시한다. 연락처 영역 제목은 `연락처` / `Contact` / `Kontakt`로 번역한다.

## 완료 조건

- 기존 Footer가 확장되어 reference의 전체 정보 구조와 반응형 배치를 갖는다. 모바일에서도 내용은 왼쪽 정렬한다.
- Footer의 모든 텍스트와 링크 대상이 위 레거시 값과 일치하고 reference의 데이터가 남아 있지 않다.
- 교회 이름과 섹션 제목은 한국어·영어·독일어로 표시되고, 그 외 언어에서는 영어로 fallback한다.
- 이메일·전화·외부 채널 링크가 올바르게 동작하고, 아이콘 링크는 스크린 리더에서 목적을 식별할 수 있다.
- Desktop, tablet, mobile 화면에서 콘텐츠가 겹치거나 잘리지 않고 가로 스크롤이 생기지 않는다.
- 기존 공개 페이지에서 Footer가 유지되고 admin 화면에는 나타나지 않는다.
- Footer CSS에 색상값을 직접 하드코딩하지 않고 공통 토큰을 사용한다.
- 교회 이름에 Navbar와 같은 전역 폰트를 적용하고, 섹션 제목은 읽기 쉬운 크기로 표시한다.
- 다크모드 동작·스타일을 추가하지 않으며 reference/legacy 폴더에 대한 런타임 의존성을 추가하지 않는다.

## 제외 범위

- Navbar와 페이지별 임시 화면 (별도 티켓 `001-navbar-legacy-navigation.md`)
- Footer의 교회 정보 CMS 편집 기능 또는 백엔드 API 추가
- Footer 정적 UI 문구의 번역 편집 기능
- 레거시 이외의 교회 정보·채널 추가
- 다크모드 기능

## 검증

- Desktop, tablet, mobile viewport에서 Footer의 정렬, 줄바꿈, 링크 접근성을 확인한다.
- 모든 표시 정보와 링크 대상이 레거시 값과 일치하는지 확인한다.
- 한국어·영어·독일어 교회 이름과 섹션 제목 및 미지원 언어의 영어 fallback을 확인한다.
- 공개 페이지에서는 표시되고 admin 경로에서는 표시되지 않는지 확인한다.
