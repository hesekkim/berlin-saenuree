# 010. 새누리 소식: 사진 소식과 교회 이야기

- 상태: 완료
- 유형: 페이지
- 선행 작업: 없음

## 목적

새누리 소식 페이지를 현재 프로젝트의 CMS Posts와 Blogger 데이터에 연결한다. 레거시 News 페이지는 이관하지 않는다. 공개 페이지와 CMS 내비게이션은 각 화면의 문맥에 맞는 이름을 사용한다.

## 참고

- 공개 페이지: `frontend/src/pages/SaenureeNews/`
- 공개 경로 연결: `frontend/src/app/router.tsx`
- 공개 Navbar 설정 및 게시된 Blogger 확인: `frontend/src/shared/config/navbar-items.ts`, `frontend/src/shared/components/Navbar/useNavbarChrome.ts`
- 관리자 메뉴 라벨: `frontend/src/pages/Admin/adminNav.ts`, `frontend/src/pages/Admin/translations.ts`
- Posts/Blogger API와 공개 응답 모델: `frontend/src/shared/api/`, `backend/api/v1/endpoints/`, `backend/models/`
- Posts/Blogger 서비스: `backend/services/posts_service.py`, `backend/services/blogger_service.py`
- CMS 페이지 접근 권한 트리: `backend/services/page_catalog.py`

## 범위

1. `/saenuree-news`는 `/saenuree-news/posts`로 이동한다. 공개 경로는 `/saenuree-news/posts`와 `/saenuree-news/blogger` 및 글 상세 경로 `/saenuree-news/blogger/:id`로 구성한다.
2. 공개 Navbar는 `새누리 소식` 아래에 사진 소식과 교회 이야기 경로를 둔다. 사진 소식 하위 메뉴는 `사진 앨범` / `Photo Gallery` / `Fotogalerie`, 교회 이야기 하위 메뉴는 `교회 이야기` / `Church Stories` / `Geschichten aus der Gemeinde`를 사용한다. 관리자 내비게이션의 Posts/Blogger 라벨은 `사진 소식` / `Photo News` / `Fotonews`, `교회 이야기` / `Church Stories` / `Geschichten aus der Gemeinde`를 사용한다. 페이지 정적 문구는 한국어·영어·독일어를 지원하고 기존 언어 fallback 규칙을 따른다.
3. 사진 소식은 기존 CMS Posts와 게시된 이미지·본문을 재사용한다. 공개 읽기 API는 게시된 항목만 반환하며 공개 응답 모델에서 CMS 전용 메타데이터를 제외한다. 목록은 페이지네이션을 지원한다.
4. 데스크톱 사진 소식은 게시물 Grid로 시작한다. 항목을 선택하면 사진과 본문을 보여주는 전체 화면 사진 보기 Dialog가 열리고, 여러 이미지 탐색과 이전·다음 게시물 이동을 지원한다. 목록은 스크롤에 따라 다음 페이지를 불러온다.
5. 모바일 사진 소식은 게시물을 세로로 나열한다. 각 게시물은 이미지 중심이며 여러 이미지 탐색과 본문 더 보기를 지원한다. 데스크톱 Dialog는 모바일에서 사용하지 않는다.
6. 교회 이야기는 기존 CMS Blogger의 게시된 글을 사용한다. 목록은 페이지당 10건이며 제목·작성일·본문 일부를 표시하고, 상세 경로에서 제목·본문을 제공한다. 공개 응답은 CMS 전용 메타데이터를 포함하지 않는다.
7. 게시된 Blogger가 한 건 이상 있을 때 공개 Navbar에 교회 이야기 항목을 표시한다. 미게시 초안·휴지통 항목은 노출 여부를 결정하는 데이터에 포함하지 않는다. Blogger가 없는 동안 `/saenuree-news/blogger`에 직접 접근하면 빈 상태를 제공하고, 없는 글 상세 경로에는 찾을 수 없다는 안내를 제공한다.
8. CMS의 기존 Posts/Blogger 관리 경로와 권한을 유지한다. 관리자 내비게이션 라벨만 방문자용 이름과 맞추며, 데이터 모델·작성 흐름을 중복 구현하지 않는다.
9. 레이아웃과 색상은 현재 프로젝트의 공통 컴포넌트와 CSS 토큰을 사용하고, 반응형·접근성 동작을 고려한다.

## 제외 범위

- `legacy-frontend` News 화면, Blogger API, 외부 Instagram 피드 이관
- Posts 또는 Blogger 데이터의 별도 저장소·중복 업로드 기능
- 미게시 Posts/Blogger의 공개
- Blogger의 별도 편집기 또는 CMS 작성 흐름 변경
- Instagram의 브랜드 자산이나 외부 서비스에 대한 의존성 추가

## 완료 조건

- `/saenuree-news` 진입 시 사진 소식으로 이동하고, 사진 소식·교회 이야기 공개 경로가 동작한다.
- 데스크톱에서 게시물 Grid, 전체 화면 상세 Dialog, 다중 이미지 탐색, 게시물 간 이동 및 추가 목록 로딩이 동작한다.
- 모바일에서 세로 피드와 다중 이미지 탐색이 동작하고 본문을 펼쳐 읽을 수 있다.
- 미게시 게시물과 내부 CMS 메타데이터가 공개 응답과 화면에 나타나지 않는다.
- 게시된 Blogger가 있을 때만 공개 Navbar에 교회 이야기 메뉴가 나타나고, 목록·상세 경로가 동작한다. Blogger가 없거나 글을 찾을 수 없을 때 적절한 안내를 제공한다.
- 공개 Navbar와 CMS 관리자 내비게이션의 라벨이 화면 문맥 및 한국어·영어·독일어 설정에 맞게 표시된다.
- 기존 CMS 권한과 관리자 동작이 유지되고 사이트 지원 언어의 fallback 규칙이 적용된다.

## 검증

- 프런트엔드 `npm run build` 및 `npm run lint` 통과
- 관련 Vitest 8개 통과: 새누리 소식 화면, 사진 탐색, Blogger 목록 페이지네이션, Navbar 표시
- 백엔드 공개 API pytest 3개 통과: 응답 필드 제한, 게시 항목 필터링, 미게시 글의 404 응답
