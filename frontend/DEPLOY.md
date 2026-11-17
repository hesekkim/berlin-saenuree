# Frontend 배포

Vite React 앱을 Vercel 등에 배포하는 기본 가이드다.

## 배포 전

```bash
cd frontend
npm install
npm run build
npm run preview
```

환경 변수:

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

로컬 예시는 `.env.example` 참고.

## Vercel

backend와 frontend는 별도 저장소로 나누지 않아도 된다. 통합 저장소 `berlin-saenuree`를 Render와 Vercel 양쪽에 연결하고, 서비스별 Root Directory를 다르게 설정한다. 두 플랫폼은 같은 브랜치의 변경을 각각 독립적으로 빌드·배포한다.

1. Vercel에서 통합 GitHub 저장소를 연결해 프로젝트를 생성한다.
2. Framework Preset: `Vite`
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. 환경 변수 `VITE_API_BASE_URL`에 Render backend의 실제 origin을 설정한다 (예: `https://your-backend.onrender.com`).

SPA 라우팅은 `vercel.json` rewrite로 `index.html`에 넘긴다.

### 공개 CMS 페이지 fallback

공개 페이지는 마지막으로 정상 조회한 콘텐츠를 브라우저에 저장하고, 첫 방문 또는 캐시가 없는 경우 `src/shared/content/fallbacks/`의 기본 콘텐츠를 표시한다. 기본 사진은 `public/images/cms-fallback/`에 있다. 기본 CMS 콘텐츠나 사진을 바꾸면 두 fallback 경로도 함께 갱신해 frontend를 배포한다.

### 보안 헤더 (CSP) 설정

`vercel.json`의 `Content-Security-Policy`에는 API 주소가 들어 있다. 빌드 환경변수를 읽을 수 없으므로 **배포하는 사이트마다 직접 바꿔야 한다.** `https://your-backend.example.com`을 Render backend origin으로 바꾼다.

- 실제 backend origin(`VITE_API_BASE_URL`과 같은 값)을 `img-src`, `media-src`, `connect-src`에 설정한다.
- 바꾸지 않으면 API 요청과 이미지가 CSP에 막힌다.
- Posts 동영상 재생에는 `media-src`의 backend origin이 필요하다. 업로드 전 브라우저에서 동영상 메타데이터를 읽으므로 `blob:`도 허용한다.
- Home의 YouTube 썸네일은 `i.ytimg.com`, 영상 재생은 `www.youtube-nocookie.com`을 허용해야 한다.
- `style-src`/`font-src`는 현재 Google Fonts(`index.html`)를 허용한다. 폰트를 바꾸면 여기도 맞춘다.
- 다른 헤더: `X-Frame-Options: DENY`, `frame-ancestors 'none'` (다른 사이트에 끼워 넣기 금지), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(카메라·마이크·위치 차단).
- 배포 후 브라우저 콘솔에 `Content Security Policy` 위반이 없는지 확인한다 (로그인, 에디터 이미지, 팝업).

## 배포 후 확인

- `/` → `/home` 리다이렉트
- `/admin` 로그인 모달
- `/privacy-policy`
- 존재하지 않는 경로 → NotFound

## Backend CORS

Render backend의 `APP_ALLOWED_ORIGINS`에 Vercel frontend의 실제 origin을 넣는다. 이 값에는 경로를 포함하지 않는다.

```env
APP_ALLOWED_ORIGINS=["https://your-frontend.vercel.app"]
```
