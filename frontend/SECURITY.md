# Frontend 보안

클라이언트 측 요청 제한과 인증 토큰 취급 요약이다.

## Rate Limiting

위치: `src/shared/utils/rateLimiter.ts`

메모리 기반이다. axios interceptor에서 서버 호출 전에 과도한 요청을 막는다.

예시:

```typescript
await apiClient.get('/api/v1/auth/me');
```

## 재시도

네트워크 오류 / 429에 대해 exponential backoff로 재시도한다. (axios 설정 참고)

## 인증

- LoginModal → `send-code` / `verify-code`
- JWT는 localStorage에 저장되고 axios가 `Authorization` 헤더에 붙인다
- Admin 페이지가 `isLoading` / `isAuthenticated`로 로그인 모달을 분기한다
- 세션 확인(`refreshMe`)은 401/403에서만 토큰을 지운다. 네트워크 오류·5xx는 로그아웃시키지 않는다. 초기 로드가 실패하면 비인증으로 보이지만 토큰은 남겨 다음 로드에서 다시 확인한다.
- 로그아웃은 localStorage의 토큰을 지우는 것뿐이다. 서버는 토큰을 폐기하지 않는다 (`backend/docs/SECURITY.md`).

## 보안 헤더

`vercel.json`에 CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`를 둔다. CSP의 API origin은 배포 사이트마다 바꿔야 하며 절차는 `DEPLOY.md`에 있다.

- `script-src 'self'`: 인라인 스크립트와 외부 스크립트를 허용하지 않는다. 서드파티 스크립트를 추가하면 CSP도 함께 고친다.
- `dangerouslySetInnerHTML`은 서버 sanitize 결과(`services/rich_text.py`)와 프론트 sanitize를 거친 HTML에만 쓴다. CSP는 이때 스크립트 실행을 한 번 더 막는다.

## 체크리스트

- [ ] 프로덕션에서 `VITE_API_BASE_URL`이 HTTPS backend를 가리킨다
- [ ] CORS가 backend `ALLOWED_ORIGINS`와 맞다
- [ ] 브라우저 콘솔에 토큰/시크릿을 로그하지 않는다
