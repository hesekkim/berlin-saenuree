# Frontend 환경 변수

## 로컬

`frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:9000
```

## 프로덕션

배포 플랫폼 환경 변수에 설정:

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

`VITE_` 접두사가 있어야 클라이언트 번들에 포함된다.

## 확인

```bash
cd frontend
npm run dev
```

Network 탭에서 `VITE_API_BASE_URL` 기준으로 `/api/v1/auth/...` 또는 `/health` 요청이 가는지 본다.

CORS 에러면 backend `.env`의 `APP_ALLOWED_ORIGINS`에 frontend origin을 추가한다.

```env
APP_ALLOWED_ORIGINS=["http://localhost:9090"]
```

## 주의

- API 키, SMTP 비밀번호, JWT secret은 frontend에 두지 않는다
- 환경 변수 변경 후엔 dev 서버 재시작 또는 재빌드가 필요하다
