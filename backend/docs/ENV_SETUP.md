# Backend 환경 변수 설정

`backend/.env` 예시 (`.env.example`과 동일):

```env
APP_HOST=0.0.0.0
APP_PORT=9000
APP_APP_NAME=Berlin Saenuree Server
APP_API_VERSION=v1
APP_ALLOWED_ORIGINS=["http://localhost:9090"]
APP_ADMIN_EMAILS=change-this@example.com
APP_PAGE_ADMIN_ENABLED=false
APP_JWT_SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
APP_SITE_ID=
APP_JWT_ALGORITHM=HS256
APP_JWT_EXPIRATION_MINUTES=30
APP_SMTP_HOST=smtp.gmail.com
APP_SMTP_PORT=587
APP_SMTP_USERNAME=change-this-admin-name
APP_SMTP_PASSWORD=change-this-secure-password
APP_SMTP_FROM_EMAIL=change-this-admin-email
APP_SMTP_FROM_NAME=Berlin Saenuree
APP_SEND_REAL_EMAIL=False
APP_DATA_ROOT=
APP_POSTS_TRASH_RETENTION_DAYS=30
APP_BLOGGER_TRASH_RETENTION_DAYS=30
APP_MEDIA_MAX_FILE_BYTES=20971520
APP_MAX_REQUEST_BODY_BYTES=5242880
APP_MAINTENANCE_ENABLED=True
APP_MEDIA_GC_DRY_RUN=True
APP_TRUSTED_PROXY_HOPS=1
APP_DEBUG=True
```

## 인증

- Site admin 로그인은 email OTP (`APP_ADMIN_EMAILS` + SMTP)
- `APP_ADMIN_EMAILS`는 콤마 구분. trim·소문자로 정규화한다. **항상 최소 1개, 복수 허용**
- `APP_PAGE_ADMIN_ENABLED=false`(기본): CMS 계정(`cms_users.json`) 로그인·API·Settings UI 비활성
- `APP_PAGE_ADMIN_ENABLED=true`: Settings에서 CMS 계정 추가·로그인 가능
- 레거시 `APP_ADMIN_EMAIL` / `APP_MULTI_ADMIN_ENABLED`는 사용하지 않는다
- JWT로 세션 유지 (`APP_JWT_SECRET_KEY`는 32자 이상 랜덤 문자열이며 사이트마다 달라야 한다. 32자 미만이면 debug에서는 경고, 운영에서는 시작에 실패한다). 기본 만료 시간은 30분이며, 활성 세션은 요청/사용자 활동이 있을 때 연장된다. 마지막 세션 연장 후 30분 동안 요청이 없으면 만료된다.
- `APP_SITE_ID`는 토큰의 `iss` 값이다. 비우면 `APP_NAME`을 slug로 바꾼 값을 쓴다 (예: `Berlin Saenuree` → `berlin-saenuree`). 여러 사이트가 같은 secret을 써도 `APP_SITE_ID`가 다르면 서로의 토큰을 거절한다. 값을 바꾸면 기존 로그인은 모두 무효가 된다.
- 토큰 형식을 바꾸는 배포 뒤에는 기존 토큰이 무효다. 관리자는 다시 로그인해야 한다.

## 이메일

- `APP_SEND_REAL_EMAIL=False`면 실제 메일을 보내지 않는다 (`email_sent: false`)
- debug면 인증 코드를 서버 로그에만 출력한다
- Gmail을 쓸 경우 App Password를 `APP_SMTP_PASSWORD`에 넣는다

## 프록시

- `APP_TRUSTED_PROXY_HOPS`는 앞단 신뢰 프록시 개수다. 기본값은 `1`(프록시 뒤 배포를 가정)이다. 프록시 없이 직접 실행하면 `0`으로 바꾼다. `0`이면 `X-Forwarded-For`를 무시하고 소켓 주소를 쓴다. 프록시가 없는데 `1`로 두면 클라이언트가 헤더를 위조해 IP 기준 rate limit을 피할 수 있다.
- `N>0`이면 `X-Forwarded-For`를 오른쪽에서 N번째 값으로 읽는다 (프록시가 덧붙인 값이라 클라이언트가 위조할 수 없다). 값이 모자라거나 IP 형식이 아니면 소켓 주소를 쓴다. `X-Real-IP`는 쓰지 않는다.
- Render 같은 PaaS 뒤에서는 `1`로 설정한다. 설정하지 않으면 모든 방문자가 프록시 IP 하나로 집계되어 rate limit에 걸린다.
- 프록시가 없는데 `N>0`으로 두면 클라이언트가 헤더를 위조해 rate limit을 피할 수 있다. 실제 프록시 개수와 맞춘다.
- 구버전 `APP_TRUST_PROXY_HEADERS`는 `APP_TRUSTED_PROXY_HOPS`가 없을 때만 쓴다 (`True`면 1, `False`면 0). 시작 시 경고를 남기므로 새 설정으로 바꾼다.

## 요청 크기 제한

- `APP_MAX_REQUEST_BODY_BYTES`(기본 5MB): 미디어 업로드를 뺀 모든 요청 본문의 상한이다. 초과하면 `413`을 돌려준다.
- `APP_MEDIA_MAX_FILE_BYTES`(기본 20MB): 미디어 파일 업로드 상한이다. 업로드 endpoint는 이 값에 멀티파트 오버헤드 1MB를 더해 본문을 제한한다.
- FastAPI는 인증 검사 전에 본문을 파싱하므로, 이 제한은 로그인하지 않은 요청에도 적용된다.

## 참고

환경 변수 prefix는 `APP_` 이다. 서비스 이름 변수는 prefix가 겹쳐 `APP_APP_NAME`이다.

## 정기 작업

- APP_MAINTENANCE_ENABLED(기본 True): 휴지통 만료 정리와 orphan 미디어 수거를 6시간마다 앱 안에서 실행한다. 끄면 두 작업 모두 멈춘다.
- APP_MEDIA_GC_DRY_RUN(기본 True): True면 orphan 미디어를 삭제하지 않고 로그로만 남긴다. 로그 확인 후 False로 바꾼다.