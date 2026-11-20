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
APP_BACKUP_ROOT=
APP_BACKUP_PASSWORD=<강한 임의 문자열>
APP_BACKUP_MAX_ARCHIVE_BYTES=536870912
APP_BACKUP_MAX_EXPANDED_BYTES=2147483648
APP_POSTS_TRASH_RETENTION_DAYS=30
APP_BLOGGER_TRASH_RETENTION_DAYS=30
APP_MEDIA_MAX_FILE_BYTES=209715200
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

## Sermon Live relay

- `APP_RELAY_PUBLISHER_CREDENTIAL`은 Local PC backend와 공유하는 32자 이상의 무작위 service credential이다. CMS/JWT 비밀과 재사용하지 않는다.
- `APP_RELAY_LISTENER_TOKEN_SECRET`은 Listener JWT 전용 32자 이상의 무작위 서명 키다. Publisher credential 및 CMS JWT 키와 분리한다.
- `APP_RELAY_LISTENER_TOKEN_MINUTES`는 기본 90분이며 1~90분으로 제한된다. 만료 시 연결된 Listener WebSocket도 닫힌다. 현재 자동 갱신은 없으므로 만료 후에는 공유 session link로 다시 접속해야 한다. 세션 종료나 갱신 시 기존 Listener 권한은 무효화된다.
- `APP_RELAY_ALLOWED_ORIGINS`에는 Listener의 production origin과 필요한 개발 origin만 정확히 지정한다. Preview를 허용할 때는 해당 배포 origin을 명시적으로 추가한다. `APP_RELAY_ALLOWED_ORIGIN_SUFFIXES`도 설정하면 해당 HTTPS suffix의 Preview가 WebSocket 및 token 발급 CORS에서 모두 허용된다. 이는 suffix 전체를 신뢰하는 것이므로 팀이 통제하는 suffix만 설정한다.
- relay 세션·rate-limit 상태와 worker 간 임시 relay 이벤트는 SQLite DB `APP_DATA_ROOT/data/relay_auth.sqlite3`에 저장된다. relay 이벤트(자막·Opus frame)는 worker 간 fan-out을 위해 최대 120초 보관된다. Listener 접근은 공유 session ID로 하며, 별도 Listener 비밀번호는 사용하지 않는다. `APP_DATA_ROOT`는 영구 디스크로 지정해야 한다. 여러 worker는 동일한 로컬 SQLite 파일을 공유할 수 있지만, 서로 다른 디스크를 사용하는 별도 인스턴스 간 relay fan-out은 지원하지 않으므로 relay를 여러 인스턴스로 분리하지 않는다.
- session ID는 공유 링크에 포함되는 bearer access이므로 의도된 청중에게만 전달한다. 단기 Listener token과 Publisher credential은 URL이나 응답에 노출하지 않는다.
- relay는 단일 Render worker / 단일 instance 메모리 상태를 전제로 한다. 수평 확장 시 relay session과 listener 상태를 공유하는 Redis 또는 유사 공유 relay가 필요하며, 로컬 SQLite만으로 instance 간 fan-out을 활성화하지 않는다.
- `APP_RELAY_MAX_SESSIONS`(기본 100), `APP_RELAY_MAX_PUBLISHERS`(기본 100), `APP_RELAY_MAX_LISTENERS`(기본 1000)는 동시 세션 및 연결 상한이다. 초과 시 명시적인 503 또는 1013 종료를 사용하며 기존 CMS HTTP 요청은 독립적으로 처리한다.
- `APP_RELAY_IDLE_TIMEOUT_SECONDS`(기본 60초) 동안 Publisher 또는 Listener WebSocket 활동이 없으면 해당 연결과 session 자원을 정리하고 복구 가능한 종료 상태를 전달한다. Listener에는 최대 256개 제어/대기 메시지와 세션당 144KB 오디오 backlog를 적용하며 초과되면 오래된 오디오를 버리거나 느린 Listener를 닫는다.

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
- `APP_MEDIA_MAX_FILE_BYTES`(기본 200MiB): 미디어 파일 업로드 상한이다. multipart 업로드는 이 값에 멀티파트 오버헤드 1MiB를 더해 본문을 제한하고, Posts의 raw 동영상 업로드는 파일 상한을 그대로 적용한다. Posts MP4 동영상은 최대 200MiB까지 허용하며, 사진은 Posts 화면에서 파일당 10MiB로 제한한다. 배포 환경에서 이 변수를 별도로 설정했다면 업로드 상한에 맞춰 갱신해야 한다.
- Posts MP4 동영상은 재인코딩 없이 원본 그대로 저장한다. 업로드는 원본 요청 본문을 임시 디스크 파일로 스트리밍하며, 임시 경로는 `APP_DATA_ROOT/.media-upload-tmp`다. 저장 전 동영상은 24시간 lease로 보호하고 편집기가 열린 동안 6시간마다 갱신한다. lease가 만료된 미참조 Posts 동영상은 `APP_MEDIA_GC_DRY_RUN` 설정과 관계없이 유지보수 작업에서 삭제하며, 게시물에서 참조 중인 파일은 보존한다. 별도 FFmpeg 설치는 필요하지 않다. Windows 로컬 설치와 Render 설정은 [DEPLOY.md](./DEPLOY.md)의 안내를 따른다.
- `APP_BACKUP_MAX_ARCHIVE_BYTES`(기본 512MB): 백업 ZIP 업로드 상한이다. 압축 해제 데이터는 `APP_BACKUP_MAX_EXPANDED_BYTES`(기본 2GB)를 넘을 수 없다.
- FastAPI는 인증 검사 전에 본문을 파싱하므로, 이 제한은 로그인하지 않은 요청에도 적용된다.

## 백업과 복구

- `APP_DATA_ROOT` 아래 `data/`가 실제 데이터, `backups/`가 생성된 백업 ZIP 저장소다. `APP_BACKUP_ROOT`로 저장 경로를 바꿀 수 있다. 두 경로 모두 영구 디스크에 두되 백업 저장소는 `data/` 디렉터리와 분리한다.
- 자동 백업은 UTC 기준 매월 1회 생성한다. 실행이 누락되면 앱의 정기 유지보수에서 보충한다. 자동·수동·복구 직전 안전 백업을 합쳐 최대 12개를 보관한다.
- `APP_BACKUP_PASSWORD`는 복구와 백업 삭제에 필요하다. 수동 백업, 목록, 다운로드, ZIP 업로드 검증에는 별도 비밀번호가 필요하지 않으며 모두 site admin 로그인은 필요하다.
- ZIP 자체는 암호화되지 않으며 CMS 계정 정보와 콘텐츠를 포함한다. 다운로드한 파일과 외부 보관 위치의 접근을 제한한다. 백업 비밀번호는 ZIP을 암호화하지 않는다.
- Render 디스크 자체가 유실되면 그 안의 백업도 함께 사라질 수 있다. CMS에서 백업 ZIP을 다운로드해 관리자 PC나 별도 저장소에 보관한다. 복원할 때는 동일한 `APP_SITE_ID`와 관리자 로그인 설정을 준비하고 CMS 설정에서 ZIP을 업로드한 뒤 비밀번호로 복구한다.
- 업로드한 ZIP을 적용하기 전에 현재 데이터의 안전 백업을 생성한다. 안전 백업 생성에 실패하면 복구하지 않는다. OTP 임시 코드는 백업에 포함하지 않는다.

## 참고

환경 변수 prefix는 `APP_` 이다. 서비스 이름 변수는 prefix가 겹쳐 `APP_APP_NAME`이다.

## 정기 작업

- APP_MAINTENANCE_ENABLED(기본 True): 정기 작업 전체를 실행한다. 휴지통·임시 업로드·만료된 Posts 동영상 lease 정리, orphan 미디어 sweep, 자동 백업이 포함된다. 끄면 lease 정리를 포함한 모든 정기 작업이 멈춘다.
- APP_MEDIA_GC_DRY_RUN(기본 True): 일반 orphan 미디어 sweep만 제어한다. True면 삭제 대상만 로그로 남기며, False면 orphan을 삭제한다. 만료된 Posts 동영상 lease 정리에는 적용되지 않는다.
