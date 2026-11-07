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

1. GitHub 저장소 연결
2. Framework: Vite
3. Root Directory: `frontend` (monorepo인 경우)
4. Build: `npm run build`
5. Output: `dist`
6. Env: `VITE_API_BASE_URL`

SPA 라우팅은 `vercel.json` rewrite로 `index.html`에 넘긴다.

### 보안 헤더 (CSP) 설정

`vercel.json`의 `Content-Security-Policy`에는 API 주소가 들어 있다. 빌드 환경변수를 읽을 수 없으므로 **배포하는 사이트마다 직접 바꿔야 한다.**

- `https://your-backend.example.com`을 실제 backend origin(`VITE_API_BASE_URL`과 같은 값)으로 `img-src`와 `connect-src` 두 곳에서 바꾼다.
- 바꾸지 않으면 API 요청과 이미지가 CSP에 막힌다.
- `style-src`/`font-src`는 현재 Google Fonts(`index.html`)를 허용한다. 폰트를 바꾸면 여기도 맞춘다.
- 다른 헤더: `X-Frame-Options: DENY`, `frame-ancestors 'none'` (다른 사이트에 끼워 넣기 금지), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(카메라·마이크·위치 차단).
- 배포 후 브라우저 콘솔에 `Content Security Policy` 위반이 없는지 확인한다 (로그인, 에디터 이미지, 팝업).

## 배포 후 확인

- `/` → `/home` 리다이렉트
- `/admin` 로그인 모달
- `/privacy-policy`
- 존재하지 않는 경로 → NotFound

## Backend CORS

frontend 도메인을 backend `APP_ALLOWED_ORIGINS`에 넣는다.

```env
APP_ALLOWED_ORIGINS=["https://your-frontend.vercel.app"]
```
