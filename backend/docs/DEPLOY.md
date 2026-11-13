# Backend 배포

Render 등 PaaS에 FastAPI를 올리는 기본 가이드다.

## 로컬 동영상 업로드 설정

로컬에서는 `backend` 디렉터리에서 백엔드 의존성을 설치한다. MP4 동영상은 원본 그대로 저장하며 FFmpeg 같은 별도 인코더가 필요하지 않다.

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`.venv`가 없다면 먼저 `python -m venv .venv`를 실행한다. 기존 가상환경에서 패키지를 설치한 뒤 백엔드 서버를 다시 시작한다.

## 빠른 설정

backend와 frontend는 별도 저장소로 나누지 않아도 된다. 통합 저장소 `berlin-saenuree`를 Render와 Vercel 양쪽에 연결하고, 서비스별 Root Directory를 다르게 설정한다. 두 플랫폼은 같은 브랜치의 변경을 각각 독립적으로 빌드·배포한다.

1. Render에서 통합 GitHub 저장소를 연결해 Web Service를 생성한다.
2. Root Directory를 `backend`로 설정한다.
3. Build Command: `pip install -r requirements.txt` (운영에는 `requirements-dev.txt`를 쓰지 않는다)
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. 아래 필수 환경 변수를 설정한다. `APP_ALLOWED_ORIGINS`에는 Vercel에 배포할 frontend의 실제 origin을 넣는다.

Vercel 배포 설정과 `VITE_API_BASE_URL`, CSP, CORS를 맞추는 방법은 [frontend 배포 가이드](../../frontend/DEPLOY.md)를 참고한다.

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
- APP_MEDIA_GC_DRY_RUN=True(기본)면 일반 orphan 미디어 sweep은 삭제하지 않고 대상만 서버 로그(info)에 남긴다. 로그 확인 후 False로 바꾸면 해당 orphan 삭제가 시작된다. 이 설정은 만료된 Posts 동영상 lease 정리에는 적용되지 않는다.

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

## Posts 동영상 업로드

- Posts MP4 업로드는 최대 200MiB이며 동영상은 재인코딩 없이 원본 바이트 그대로 저장한다.
- Posts 동영상은 원본 요청 본문을 임시 파일에 직접 스트리밍하므로 multipart 파싱용 파일 복사본을 만들지 않는다. 임시 파일은 `APP_DATA_ROOT/.media-upload-tmp`에 두고, 영구 저장 경로와 같은 파일시스템에서 이동한다. 24시간이 지난 임시 디렉터리는 정기 유지보수에서 제거한다.
- 게시물 저장 전 동영상은 24시간 lease로 보호하며 편집기가 열려 있는 동안 6시간마다 lease를 갱신한다. 응답 유실 등으로 클라이언트가 파일 ID를 받지 못한 업로드는 lease가 만료된 뒤 정기 유지보수에서 삭제한다. 게시물에서 참조 중인 동영상은 lease 만료와 관계없이 보존한다.
- 브라우저 재생 호환성은 원본 MP4의 코덱에 따라 달라진다.

## 백업·복구

- `APP_DATA_ROOT` 아래 `data/`와 `backups/`가 모두 영구 디스크에 있도록 설정한다. `APP_BACKUP_ROOT`로 백업 ZIP 위치를 별도 지정할 수 있으며, `data/` 안에 두지 않는다.
- `APP_BACKUP_PASSWORD`를 강한 임의 문자열로 설정한다. 비밀번호는 복구 및 백업 삭제에만 사용한다.
- 자동 백업은 UTC 기준 매월 생성되고 전체 백업은 최대 12개 보관된다. `APP_MAINTENANCE_ENABLED=true`가 필요하다.
- 내보낸 ZIP은 Render 디스크와 분리된 관리자 PC 또는 별도 저장소에도 보관한다. 같은 디스크의 백업은 디스크 유실을 복구할 수 없다.
- 새 디스크에서 복구할 때는 동일한 `APP_SITE_ID`, `APP_ADMIN_EMAILS`, 백업 비밀번호 및 이메일 인증 설정을 먼저 구성한다. CMS에 로그인해 설정의 백업 파일 업로드에서 ZIP을 검증한 다음 복구한다. 복구 직전 현재 `data/`의 안전 백업이 생성된다.
- 업로드 제한은 기본 512MB, 압축 해제 데이터 제한은 기본 2GB이며 `APP_BACKUP_MAX_ARCHIVE_BYTES`, `APP_BACKUP_MAX_EXPANDED_BYTES`로 조정할 수 있다.

## 참고

- SMTP(Gmail App Password)가 필요하면 free tier에서 포트가 막힐 수 있다
- 영구 디스크가 필요하면 플랜/디스크 설정을 확인한다
- 플랜 전환 세부 절차는 [RENDER_GUIDE.md](./RENDER_GUIDE.md)
