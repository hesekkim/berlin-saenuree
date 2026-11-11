# 007. 담임목사 소개 페이지

- 상태: 완료
- 유형: 페이지
- 선행 작업: [006-shared-page-header.md](./006-shared-page-header.md)

## 목적

레거시 담임목사 소개를 현재 frontend에 이관해 `/about/senior-pastor`에서 확인할 수 있게 한다. 내용 변경이 드물기 때문에 CMS 없이 정적 콘텐츠로 제공한다.

## 참고 및 현재 구현

- 레거시 페이지 및 콘텐츠: `legacy-frontend/src/pages/introduce/Pastor/Pastor.jsx`
- 레거시 스타일 참고: `legacy-frontend/src/pages/introduce/Pastor/Pastor.module.css`
- 프로필 사진 참고: `legacy-frontend/src/pages/introduce/Pastor/img/avatar.jpg`
- 현재 페이지 placeholder: `frontend/src/pages/SeniorPastor/SeniorPastor.tsx`
- 공통 페이지 헤더: `frontend/src/shared/components/PageHeader/` (티켓 006에서 구현)

legacy-frontend는 콘텐츠와 기존 이미지의 참고 자료이며 실행 시 참조하지 않는다. 필요한 프로필 이미지는 frontend가 관리하는 페이지 asset으로 둔다. 레거시의 교회 배경 hero와 그 타이틀은 사용하지 않고 공통 페이지 헤더를 페이지 제목으로 사용한다.

## 범위

1. 기존 `/about/senior-pastor` 경로의 placeholder를 실제 소개 페이지로 교체한다.
2. 공통 페이지 헤더를 사용하고 제목은 `toContentLanguage`에 따른 한국어·영어·독일어 문구로 표시한다.
3. 레거시 프로필 소개를 유지한다.
   - 이한주 담임목사 프로필 사진과 이름
   - `Pastor, Lee Hanju` 직함
   - 레거시 소개 문단
4. 레거시의 `소명 간증서` 전체 본문과 소제목을 순서대로 보존해 읽기 쉬운 시맨틱 콘텐츠로 표시한다.
5. 페이지의 정적 문구와 콘텐츠는 한국어·영어·독일어를 지원하고, 사이트의 현재 콘텐츠 언어 fallback 규칙을 따른다.
6. 이미지 대체 텍스트, 제목 계층 및 모바일에서 읽기 쉬운 프로필·본문 레이아웃을 제공한다. CSS 색상은 공통 custom property를 사용한다.
7. 별도 API나 CMS 편집 기능을 추가하지 않는다.

## 제외 범위

- CMS 페이지 문서, 관리자 편집기, backend API 및 데이터 모델 변경
- 레거시 배경 hero 이미지와 hero 타이틀
- legacy-frontend 경로를 런타임 asset 또는 모듈로 참조
- 다크모드 추가

## 완료 조건

- `/about/senior-pastor`에서 placeholder 대신 프로필, 소개 문단, 전체 소명 간증 본문이 표시된다.
- 레거시 소개 및 간증의 한국어 원문과 순서가 보존되고 페이지 문구와 콘텐츠는 한국어·영어·독일어 및 기존 fallback 규칙을 따른다.
- 공통 페이지 헤더를 사용하며 레거시 배경 hero가 중복 표시되지 않는다.
- 프로필 사진은 현재 frontend의 asset으로 제공되며 legacy-frontend 런타임 의존성이 없다.
- CMS 및 backend 변경 없이 페이지가 동작하고 데스크톱·모바일에서 콘텐츠를 읽을 수 있다.
- 관련 frontend 빌드와 타입 검사가 통과한다.

## 검증

- `/about/senior-pastor` 직접 진입 및 새로고침 확인
- 한국어·영어·독일어 문구와 콘텐츠 언어 fallback 확인
- 모바일 및 데스크톱 프로필·간증 표시 확인
- `npm run build`, 변경 파일 ESLint, `npm test` 실행
  - 빌드 및 타입 검사 통과
  - 변경된 TypeScript 파일 ESLint 통과
  - Vitest 49개 파일, 263개 테스트 통과
