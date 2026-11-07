# Backend 배포

Render 등 PaaS에 FastAPI를 올리는 기본 가이드다.

## 빠른 설정

1. GitHub에 backend 코드 push
2. Web Service 생성
3. Build: `pip install -r requirements.txt` (운영에는 `requirements-dev.txt`를 쓰지 않는다)
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## 필수 환경 변수

자세한 목록은 [ENV_SETUP.md](./ENV_SETUP.md)와 `.env.example`을 본다.

최소값:

```env
APP_DEBUG=false
APP_ALLOWED_ORIGINS=["https://your-frontend.example.com"]
APP_ADMIN_EMAILS=admin@example.com
APP_PAGE_ADMIN_ENABLED=false
APP_JWT_SECRET_KEY=<랜덤 긴 문자열, 32자 이상, 사이트마다 고유>
APP_SITE_ID=<사이트 식별자, 예: brand-kr. 비우면 APP_NAME의 slug>
APP_SMTP_HOST=smtp.gmail.com
APP_SMTP_PORT=587
APP_SMTP_USERNAME=...
APP_SMTP_PASSWORD=...
APP_SMTP_FROM_EMAIL=...
APP_SEND_REAL_EMAIL=true
APP_TRUSTED_PROXY_HOPS=1
```

JWT 키 생성 (사이트마다 새로 만든다. 다른 사이트의 키를 재사용하지 않는다):

```python
import secrets
print(secrets.token_urlsafe(32))
```

- 이 버전부터 토큰에 `iss`(`APP_SITE_ID`)·`aud`·`typ` claim이 들어간다. 배포하면 기존 토큰은 모두 무효이므로 관리자는 다시 로그인해야 한다.
- 로그아웃은 브라우저에서 토큰을 지우는 것뿐이다. 서버는 토큰을 폐기하지 않는다 (`SECURITY.md`).

## 확인

```bash
curl https://your-api.example.com/health
```

API docs: `https://your-api.example.com/docs`

## 휴지통 자동 정리와 미디어 정리

게시물·Blogger 휴지통은 APP_POSTS_TRASH_RETENTION_DAYS(기본 30일) 동안 보관된다. 만료 항목 정리와 orphan 미디어 수거는 **앱 프로세스 안**에서 6시간마다 실행된다 (첫 실행은 시작 5분 후). 별도 Cron Job은 만들지 않는다. Render Cron Job은 웹 서비스의 디스크에 접근할 수 없다.

- 끄려면 APP_MAINTENANCE_ENABLED=False
- orphan 미디어는 참조 없이 생성 후 24시간이 지난 것만 삭제한다. 편집 중 업로드와 참조 중인 미디어는 지우지 않는다.
- APP_MEDIA_GC_DRY_RUN=True(기본)면 삭제하지 않고 삭제 대상만 서버 로그(info)에 남긴다. 로그를 확인한 뒤 False로 바꾸면 삭제가 시작된다.

수동 실행이 필요하면 backend/에서 python -m scripts.purge_expired_trash를 실행한다. 서버가 실행 중일 때는 실행하지 않는다. 같은 JSON 파일을 두 프로세스가 동시에 쓰면 안 된다.
## 워커 수 (단일 워커 전제)

- 백엔드는 **워커 1개**로 실행한다 (`uvicorn` `--workers 1`, uvicorn 기본값). JSON store의 잠금(`core/store_lock.py`)은 프로세스 안에서만 유효하다.
- 워커를 여러 개 띄우면 같은 JSON 파일을 프로세스끼리 동시에 쓰게 되어 데이터가 유실될 수 있다. 멀티 워커 전환은 파일 lock 또는 DB 전환을 별도 작업으로 다룬 뒤에 한다.
- 휴지통 정리·orphan 미디어 수거 스케줄러도 프로세스마다 돌아가므로 워커가 1개여야 중복 실행이 없다.
## 데이터 디렉터리

`APP_DATA_ROOT`(기본: backend 루트) 아래 `data/`에 JSON이 생긴다.

- 영구 디스크에 `data/`를 두고, 앱 유저만 읽기/쓰기
- `cms_users.json`·`site_settings.json`·`pages/` 백업 권장
- 상세·위협 모델은 [SECURITY.md](./SECURITY.md)의 「데이터 파일」

## 참고

- SMTP(Gmail App Password)가 필요하면 free tier에서 포트가 막힐 수 있다
- 영구 디스크가 필요하면 플랜/디스크 설정을 확인한다
- 플랜 전환 세부 절차는 [RENDER_GUIDE.md](./RENDER_GUIDE.md)
