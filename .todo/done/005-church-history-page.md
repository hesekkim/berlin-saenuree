# 005. 교회 역사 페이지

- 상태: 완료
- 유형: 페이지

## 목적

레거시 교회 소개와 연혁을 현재 React/FastAPI 구조로 옮긴다. 이미 확정된 역사 5건은 읽기 전용 기본 데이터로 보호하고, CMS는 이후 추가되는 연혁만 관리한다.

## 참고 및 현재 구현

- 레거시 콘텐츠·이미지·동작 참고:
  - `legacy-frontend/src/pages/introduce/Greetings/Greetings.jsx`
  - `legacy-frontend/src/components/Timeline/Timeline.jsx`
  - `legacy-frontend/src/pages/introduce/Greetings/img/`
- 현재 공개 페이지:
  - `frontend/src/pages/ChurchHistory/ChurchHistory.tsx`
  - `frontend/src/pages/ChurchHistory/ChurchHistory.module.css`
  - `frontend/src/pages/ChurchHistory/churchHistoryLabels.ts`
  - `frontend/src/pages/ChurchHistory/useChurchHistoryContent.ts`
- 고정 연혁 데이터: `backend/data/seed/church-history.json`
- CMS 추가 연혁: `backend/data/pages/church-history.json`에 저장되는 페이지 콘텐츠
- 공개 연혁 API: `GET /api/v1/pages/church-history/public`
- CMS 연혁 API: `GET/PUT /api/v1/pages/church-history`
- 관리자 편집기:
  - `frontend/src/pages/Admin/Pages/ChurchHistory/ChurchHistoryPageEditor.tsx`
  - `frontend/src/pages/Admin/Pages/ChurchHistory/useChurchHistoryPageEditor.ts`

legacy-frontend는 콘텐츠·이미지·기존 화면 동작을 확인하는 참고 자료다. 현재 화면은 React로 구현하며 legacy 컴포넌트나 경로를 런타임에서 참조하지 않는다.

## 범위

1. `/about/church-history`에 교회 소개와 연혁 페이지를 제공한다.
2. legacy 페이지의 소개 문구와 성경 구절은 현재 `churchHistoryLabels.ts`에서 한국어·영어·독일어로 표시한다. 이 소개 문구는 CMS 편집 대상이 아니다.
3. 과거 연혁 5건의 날짜·설명·사진은 백엔드의 버전 관리 기본 데이터로 제공한다.
   - 2013.05.12: 동베를린 담임목사 사택에서 개척예배 시작
   - 2013.10.25: Bundesplatz에서 창립예배
   - 2015.01.25: Alexanderplatz로 예배당 이전
   - 2020.12.13: Hoffnungskirche로 예배당 이전
   - 2021.07.04: Theologisches Konvikt으로 예배당 이전
4. 고정 연혁은 공개 API 응답에 포함하되 CMS 조회·저장 대상에서는 분리한다. CMS API에 기존 고정 ID가 제출되어도 저장 콘텐츠에서 제외해 날짜·설명·사진이 변경되거나 삭제되지 않게 한다.
5. 관리자 편집기는 이후 추가할 연혁만 관리한다. 추가 연혁은 지원 언어별 날짜와 설명, 공유 사진을 편집하고 추가·삭제할 수 있다. 제목 필드와 연혁 순서 변경 기능은 두지 않는다.
6. 새 사진은 기존 미디어 업로드 및 WebP 최적화 API를 사용한다. 기존 연혁 사진은 프런트엔드 정적 이미지 자산으로 제공한다.
7. 공개 페이지는 고정 연혁 뒤에 CMS 추가 연혁을 이어 붙여 표시한다. 추가 연혁은 모든 지원 언어의 날짜와 설명을 각각 제공하며, 한 언어의 내용이 다른 언어의 고정 연혁 때문에 입력된 것으로 간주되지 않게 한다.
8. 현재 페이지 디자인의 데스크톱 교차형 타임라인, 모바일 단일 열 배치, 활성 연혁에 따른 배경 이미지 전환 및 스크롤 reveal 효과를 유지한다. 모션 감소 설정에서는 reveal 효과를 비활성화한다.
9. 관리자 메뉴·페이지 할당은 backend `page_catalog`와 프런트엔드 관리자 페이지 트리를 함께 사용한다. CMS 저장은 기존 권한, optimistic revision, 충돌 처리 및 미사용 미디어 정리 규칙을 따른다.

## 제외 범위

- legacy 컴포넌트 직접 사용 또는 legacy 경로를 런타임 자산으로 참조
- 고정 연혁 5건의 CMS 편집·삭제·재정렬
- 연혁 제목 필드 및 순서 변경 UI
- 교회 소개 문구의 CMS 편집
- 지원 언어 중 일부에만 추가 연혁을 입력하는 방식
- 담임목사 소개, 교회 비전, 새누리 소식 등 다른 페이지 변경
- Home·예배 및 오시는 길 페이지 변경
- 다크모드 추가

## 완료 조건

- 공개 페이지에서 한국어·영어·독일어 고정 연혁 5건과 해당 사진을 확인할 수 있다.
- 관리자 편집기에서는 추가 연혁만 편집할 수 있고, 고정 ID를 사용한 변경·삭제 요청이 고정 콘텐츠에 영향을 주지 않는다.
- 추가 연혁은 공개 API 응답에서 고정 연혁 뒤에 표시되며, 모든 지원 언어의 날짜·설명과 공유 사진이 유지된다.
- 추가 연혁을 저장하려면 모든 지원 언어에서 각 이벤트의 날짜·설명과 사진을 입력해야 한다.
- 업로드 사진은 WebP 최적화되며, 대체·삭제 시 사용하지 않는 미디어를 정리한다.
- 관리자 메뉴 및 페이지 권한, revision 충돌 처리와 모바일 레이아웃이 현재 프로젝트 규칙을 따른다.
- 프런트엔드 빌드와 관련 frontend/backend 테스트가 통과한다.

## 검증

- 고정 기본 데이터가 세 언어에 각각 5건 있고 CMS 페이지 문서에는 포함되지 않는지 확인
- CMS API가 추가 연혁만 반환하며 고정 ID의 변경·삭제 시도를 저장하지 않는지 확인
- 공개 API가 고정 연혁과 CMS 추가 연혁을 결합해 반환하는지 확인
- 모든 지원 언어에 날짜·설명·사진이 입력된 경우에만 저장 가능한지 확인
- 추가 연혁 저장·삭제, 이미지 최적화·정리 및 revision 충돌을 확인
- 프런트엔드 빌드와 Church History 콘텐츠 및 backend 페이지 콘텐츠 테스트 실행
