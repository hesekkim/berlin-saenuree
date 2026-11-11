# 009. 교회 비전 페이지

- 상태: 완료
- 유형: 페이지
- 선행 작업: [006-shared-page-header.md](./done/006-shared-page-header.md)

## 목적

레거시 교회 비전 페이지를 현재 React/FastAPI 구조에 맞게 이관해 `/church-vision`에서 제공한다. 기존 메뉴 그룹 대신 교회 비전 페이지를 직접 내비게이션에 노출하고 현재 사이트의 공통 페이지 디자인과 CMS 콘텐츠 관리 패턴을 사용한다.

## 참고

- 레거시 페이지 및 콘텐츠: `legacy-frontend/src/pages/Vision/Vision.jsx`
- 레거시 스타일 참고: `legacy-frontend/src/pages/Vision/Vision.module.css`
- 현재 페이지 placeholder: `frontend/src/pages/ChurchVision/ChurchVision.tsx`
- 공통 페이지 헤더: `frontend/src/shared/components/PageHeader/`
- CMS 페이지 콘텐츠: `frontend/src/shared/api/cmsApi.ts`
- 관리자 페이지 트리: `frontend/src/pages/Admin/adminNav.ts`
- 백엔드 페이지 카탈로그: `backend/services/page_catalog.py`

legacy-frontend는 콘텐츠와 기존 이미지의 참고 자료이며 실행 시 참조하지 않는다. 레거시 다크모드와 진입 애니메이션은 이관하지 않는다.

## 범위

1. `/church-vision`에서 교회 비전 페이지를 제공한다. 기존 `/calling/church-vision` 요청은 새 경로로 redirect한다.
2. 공통 `PageHeader`를 사용하고 한국어·영어·독일어 제목을 지원한다.
3. 레거시 비전의 핵심 문구와 성경 인용 4개를 유지한다.
   - 하나님께서 기뻐하시는 참된 예배 회복 — 로마서 12:1
   - 하나님께서 기뻐하시는 올바른 기독교 문화 회복 — 로마서 12:2
   - 영혼의 치유와 회복 — 이사야 40:1
   - 새벽이슬 같은 주의 청년을 하나님 나라의 신실한 일꾼으로 세움 — 시편 110:3
4. `church-vision`의 편집 가능한 기본 문서는 Git에 포함되는 `backend/data/pages/church-vision.json`에 둔다. 기존 CMS 페이지 API로 조회·저장하고 관리자 편집 화면을 제공한다. 관리자는 비전 항목을 제한 없이 추가·삭제할 수 있으며, 항목 구조는 지원 언어 전체에서 동기화한다. 항목 문구와 성경 구절·출처는 각 지원 언어에 입력해야 저장할 수 있고, 공개 페이지는 현재 CMS fallback 규칙을 따른다.
5. 페이지 디자인은 번호·비전 제목을 왼쪽에, 성경 인용·출처를 오른쪽에 둔 세로 목록으로 표시한다. 중립색 구분선을 사용하고 모바일에서는 한 열로 쌓는다. 레거시 배경 이미지는 필요한 경우 현재 프로젝트가 소유하는 asset으로 이관한다.
6. 기존 권한, optimistic revision 및 충돌 처리 규칙을 사용한다. 별도 API나 데이터 소스를 추가하지 않는다.

## 제외 범위

- legacy `/calling/church-vision`에서 별도 페이지 콘텐츠 제공 (새 URL로 redirect)
- legacy-frontend 모듈·이미지 경로를 런타임에서 직접 참조
- 다크모드 및 레거시 진입 애니메이션
- 비전 문구나 성경 인용의 의미 변경

## 완료 조건

- `/church-vision`에 CMS에서 설정한 수의 비전이 왼쪽 제목·오른쪽 성경 인용의 세로 목록으로 표시된다.
- 시편 인용은 시편 110:3으로 표기된다.
- 제목과 본문은 한국어·영어·독일어를 지원하고 사이트 콘텐츠 언어 fallback을 따른다.
- CMS 관리자에서 페이지 콘텐츠를 조회·수정할 수 있고, 공개 페이지는 CMS 콘텐츠를 표시한다.
- CMS 관리자에서 비전 항목을 추가·삭제할 수 있고, 항목 변경은 모든 지원 언어에 반영된다.
- 관리자 메뉴와 페이지 접근 권한이 backend `page_catalog` 및 frontend 관리자 페이지 트리와 일치한다.
- 기존 공통 디자인 토큰을 사용하고 데스크톱 양열·모바일 단일 열 레이아웃에서 콘텐츠를 읽을 수 있다.
- frontend 빌드·타입 검사와 관련 CMS/backend 테스트가 통과한다. 백엔드 전체 테스트에서 기존 익명 업로드 관련 테스트 2개가 403/401 불일치로 실패한다.

## 검증

- `/church-vision` 직접 진입 및 기존 경로 redirect 확인
- 한국어·영어·독일어 콘텐츠와 fallback 표시
- CMS 편집·저장 후 공개 페이지 반영, revision 충돌 처리
- 관리자 페이지 할당 및 접근 권한 확인
- 브라우저에서 모바일 단일 열·데스크톱 양열 확인
- 프런트엔드 빌드, 전체 Vitest, 변경 파일 ESLint 통과
- 관련 backend 테스트 57개 통과. 전체 backend 테스트는 440개 통과, 기존 업로드 테스트 2개 실패
