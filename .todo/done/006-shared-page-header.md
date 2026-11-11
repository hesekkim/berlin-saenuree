# 006. 공통 페이지 헤더

- 상태: 완료
- 유형: 공통 컴포넌트

## 목적

Visit 페이지에서 사용하는 `BERLIN SAENUREE CHURCH` eyebrow와 페이지 제목을 재사용 가능한 공통 헤더로 분리해, 같은 디자인을 쓰는 페이지에서 일관되게 사용한다.

## 참고 및 현재 구현

- 기준 디자인 및 문구: `frontend/src/pages/Visit/Visit.tsx`, `frontend/src/pages/Visit/Visit.module.css`
- 같은 헤더 패턴을 사용하는 페이지: `frontend/src/pages/ChurchHistory/ChurchHistory.tsx`
- 다음 티켓에서 사용할 페이지: `frontend/src/pages/SeniorPastor/SeniorPastor.tsx`
- 페이지 UI 문구는 기존 언어 설정과 `toContentLanguage` 규칙을 따른다.

## 범위

1. eyebrow와 페이지 제목을 표시하는 공통 헤더 컴포넌트를 만든다. 헤더 제목은 페이지가 제공하고, 공통 eyebrow는 `BERLIN SAENUREE CHURCH`로 표시한다.
2. Visit에서 공통 컴포넌트를 사용하고 기존 반응형 타이포그래피와 레이아웃을 유지한다.
3. ChurchHistory에서도 공통 컴포넌트를 사용하되, 현재의 배경·인트로 구성과 헤더 배치는 유지한다.
4. 컴포넌트는 페이지별 제목 크기와 배치 차이를 지원하되, 페이지별 마크업이나 스타일을 중복 구현하지 않도록 한다.
5. SeniorPastor 페이지의 사용은 별도 티켓 `007-senior-pastor-page.md`에서 진행한다.

## 제외 범위

- 담임목사 소개 콘텐츠 구현
- 다른 페이지의 헤더 디자인 개편
- CMS 및 백엔드 변경
- 다크모드 추가

## 완료 조건

- Visit과 ChurchHistory가 공통 헤더 컴포넌트를 사용한다.
- 두 페이지의 제목, eyebrow, 현재 반응형 배치 및 가독성이 유지된다.
- 공통 헤더의 제목은 기존 페이지별 언어 문구와 콘텐츠 언어 fallback을 유지한다.
- 컴포넌트 스타일은 기존 CSS custom property를 사용하며 색상값을 직접 하드코딩하지 않는다.
- 접근 가능한 페이지 제목 구조와 기존 페이지 동작이 유지된다.

## 검증

- Visit과 ChurchHistory에서 한국어·영어·독일어 제목 표시 확인
- 데스크톱 및 모바일 폭에서 두 페이지 헤더 배치 확인
- 관련 frontend 테스트와 빌드·타입 검사가 통과하는지 확인
