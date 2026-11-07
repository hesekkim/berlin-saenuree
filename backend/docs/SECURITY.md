# 보안

## Backend Rate Limiting

`middleware/rate_limiter.py`는 프로덕션에서만 동작한다. `DEBUG=True`면 비활성화된다.

하드코딩된 한도:

- 초당 10회 이상 → 15분 IP 차단
- 분당 300회 이상 → 15분 IP 차단
- 소켓 주소가 localhost이면 허용한다. `APP_TRUSTED_PROXY_HOPS`가 0보다 크면 이 예외는 적용하지 않는다 (같은 호스트의 프록시를 거친 요청이 모두 localhost로 보이기 때문).
- 클라이언트 IP는 `X-Forwarded-For`의 오른쪽에서 `APP_TRUSTED_PROXY_HOPS`번째 값이다. 기본값은 `1`이다(프록시 뒤 배포 가정). 프록시 없이 직접 실행하면 `0`으로 설정한다 (`ENV_SETUP.md`).
- 1,000회 요청마다 60초 이상 쓰이지 않은 집계 키와 만료된 차단 항목을 정리한다.

환경 변수로 rate limit 수치를 바꾸지 않는다. (구버전 `APP_RATE_LIMIT_*`는 사용하지 않음)

## 인증

- Site Admin / CMS 계정(`page_admin`, `page_manager`)은 email OTP → JWT
- 보호된 API는 `Authorization: Bearer <token>` 필요
- site admin의 언어·다크모드는 `cms_users.json`의 `siteAdminPreferences`에만 저장한다. `users`에 레코드를 만들지 않으므로 `APP_ADMIN_EMAILS`에서 뺀 이메일은 CMS 접근이 남지 않는다. 구버전이 만든 `name: "Site Admin"` 레코드는 시작 시(그리고 읽을 때) 이 키로 옮긴다. `APP_ADMIN_EMAILS`에 없는 이메일의 같은 이름 레코드는 자동 판별할 수 없어 경고 로그만 남기므로 Settings의 CMS 계정 목록에서 확인해 정리한다.
- JWT에는 email만 넣고, role·pages는 매 요청 `cms_users.json` / `APP_ADMIN_EMAILS`에서 재조회 (삭제·회수 즉시 반영)
- JWT 기본 유효 시간은 30분이며, 인증된 요청이 있으면 만료 시각을 연장한다. 프론트엔드는 화면이 보이고 최근 5분 이내 사용자 입력이 있을 때 5분마다 세션을 확인해 장시간 작업 중에도 연장한다. 마지막 연장 후 30분이 지나면 만료된다.
- JWT claim: `iss`=`APP_SITE_ID`, `aud`=`cms`, `typ`=`access`, `sub`=이메일, `iat`, `exp`. 검증할 때 `iss`·`aud`·`typ`·`sub`·`exp`·`iat`가 모두 맞아야 한다. 다른 사이트(`iss`가 다름)에서 발급한 토큰, claim이 없는 토큰은 거절한다. 같은 `APP_JWT_SECRET_KEY`를 여러 사이트가 쓰더라도 `APP_SITE_ID`가 다르면 토큰은 서로 통하지 않는다. 그래도 사이트마다 고유한 secret을 쓴다.
- 로그아웃은 클라이언트가 `auth_token`을 지우는 것뿐이다. 서버는 토큰을 폐기하거나 블랙리스트에 올리지 않는다. 따라서 토큰이 탈취되면 만료 시각까지 유효하며, 세션 연장 때문에 사용이 계속되면 그만큼 더 길어질 수 있다. 서버 측 세션 저장소와 토큰 폐기는 도입하지 않았다.
- JWT 라이브러리는 `PyJWT`다. 이 버전 이전에 발급된 토큰(claim 없음)은 무효이므로 배포 후 관리자는 다시 로그인해야 한다.
- `/me` role: `site_admin` | `page_admin` | `page_manager`

로그인 코드 정책 (`services/auth_service.py`, 값은 상수):

- 코드는 6자리 숫자(`^[0-9]{6}$`)이고 10분간 유효하다. 형식이 다르면 422.
- 이메일별 재발송 쿨다운 60초, 시간당 발송 5회. 초과하면 429와 `Retry-After`.
- 코드 하나당 틀린 입력은 5회까지이고, 5회째에 그 코드는 폐기된다. 새 코드는 발송 상한(시간당 5회)을 거쳐서만 나온다. 따라서 이메일 하나에 대한 추측은 시간당 최대 25회다.
- 이메일 단위 실패 잠금은 두지 않는다. 틀린 코드를 보내 관리자 로그인을 막을 수 없게 하기 위해서다. 올바른 코드는 폐기 전까지 항상 통한다.
- 로그인에 성공하면 해당 이메일의 실패·발송 기록을 지운다.
- 허용되지 않은 이메일도 같은 경로로 처리한다. `send-code`는 코드·메일 없이 같은 200을 반환하고, `verify-code`는 401(코드 오류와 동일)을 반환한다. 제한 기록도 똑같이 쌓이므로 429 여부로 허용 이메일을 알아낼 수 없다. 허용되지 않은 이메일 기록은 최대 500개까지만 유지한다(오래된 것부터 제거, 허용 이메일 기록은 제거하지 않음).
- `email_sent` 값은 `APP_DEBUG`일 때만 실제 발송 결과를 보여 준다.
- 한계: 공격자가 발송 쿨다운(60초)과 시간당 상한을 계속 쓰면 관리자가 코드를 받지 못할 수 있다. 이메일만으로 OTP를 쓰는 한 완전히 막기 어렵다. 다음 단계는 `send-code`에 CAPTCHA를 붙이거나 관리자 로그인에 TOTP·패스키를 추가하는 것이다.
- 상태는 `verification_codes.json`에 저장하며 단일 프로세스 기준이다.

엔드포인트:

| 경로 | 인증 |
|------|------|
| `GET /health` | 없음 |
| `POST /api/v1/auth/send-code` | 없음 (허용 이메일에만 코드 발송, 응답은 동일) |
| `POST /api/v1/auth/verify-code` | 없음 (허용 이메일만 성공) |
| `GET/PATCH /api/v1/auth/me` | JWT (CMS 사용자) |
| `PUT /api/v1/pages/{slug}` | JWT + page 권한 |
| `PUT /api/v1/site-settings` | JWT + site admin |
| `/api/v1/cms-users*` | JWT + site_admin 또는 page_admin (`APP_PAGE_ADMIN_ENABLED`) |

## 미디어 (`/api/v1/media`)

- 업로드·최적화·삭제는 CMS 사용자 JWT가 필요하다. 조회(`GET /api/v1/media/files/{file_id}`와 파생 이미지 URL)는 인증 없이 공개다.
- 공개 정책은 의도된 설계다. 파일 ID는 UUID이므로 추측하기 어렵지만, URL 자체는 공개 페이지 HTML, 공유 링크, Referer, 로그에 노출될 수 있다고 본다. 따라서 민감한 파일은 미디어로 올리지 않는다.
- 공개 조회 대상에는 draft·휴지통·아직 게시하지 않은 콘텐츠의 미디어도 포함된다. 참조가 있는 파일은 참조 중인 콘텐츠가 사라질 때까지 남고, 참조가 없는 orphan은 `maintenance_service`가 생성 후 24시간이 지나면 지운다.
- 목록 API는 없다. 파일 ID를 모르면 찾을 수 없다. 공개 posts·blogger 조회 API는 아직 없다 (별도 작업).
- MIME은 `;` 파라미터를 제거한 뒤 판정한다. `image/jpeg|png|webp|gif`, `application/pdf`만 `inline`으로 서빙하고, 나머지는 항상 `attachment` + `application/octet-stream`이다. HTML·SVG·JS·XML 계열은 업로드 자체를 거부한다.
- 업로드·최적화 시 `meta.json`에 `uploadedBy`(email)를 기록한다.
- 삭제 규칙: 참조 중이면 409. 미참조일 때 `site_admin`은 모두 삭제할 수 있고, 그 외는 `uploadedBy`가 본인인 것만 삭제할 수 있다 (아니면 403). `uploadedBy`가 없는 기존 파일은 `site_admin`만 삭제할 수 있다.
- 모든 JSON store와 참조 확인·미디어 삭제는 `core/store_lock.py`의 단일 `STORE_LOCK`(재진입 가능)으로 직렬화한다. lock이 하나라서 중첩 획득 순서가 없어 deadlock 경로가 없다. 이미지 최적화(publish)는 lock 밖에서 수행하고, 저장 직전에 `contentRevision`을 다시 확인해 사이의 수정을 거절한다.
- 참조 집합은 `services/media_refs.py`의 `collect_active_media_refs()` 한 곳이다. posts, posts 휴지통, blogger, blogger 휴지통, blogger draft, popups를 모두 포함한다. 미디어를 지우는 모든 코드는 이 함수를 거쳐야 한다.

## 데이터 파일 (`backend/data/`)

JSON으로 사이트 설정·페이지 콘텐츠·CMS 계정·OTP 코드를 저장한다. DB는 쓰지 않는다.

| 파일 | 내용 |
|------|------|
| `site_settings.json` | 지원 언어, Admin UI 언어 |
| `pages/*.json` | 페이지 문구 |
| `cms_users.json` | CMS 계정(`users`: name, role, email, 할당 main pages)과 site admin 환경설정(`siteAdminPreferences`: 이메일별 언어·다크모드) |
| `verification_codes.json` | OTP 임시 코드 |

운영:

- `data/`는 웹 공개 경로 밖에 두고, **앱 프로세스 유저만** 읽기/쓰기
- 실데이터는 git에 올리지 않는다 (`backend/data/` ignore)
- 이 파일을 쓸 수 있으면 이론상 CMS 계정 이메일을 넣을 수 있다. 다만 OTP 수신과 호스트/`APP_JWT_SECRET_KEY` 보호가 본 방어선이다
- 배포 후 `cms_users.json` 백업을 권장한다

저장과 손상 처리 (`core/json_store.py`):

- 모든 JSON 저장은 임시 파일 작성, fsync, `os.replace` 순서의 원자적 쓰기다. 쓰는 도중 프로세스가 죽어도 기존 파일이 남는다.
- 파일이 있는데 파싱할 수 없으면(잘림, 수동 편집 오류, `null`, 잘못된 형태) 빈 값으로 대체하지 않고 `JsonStoreCorruptError`를 낸다. 요청은 503(`Data store is temporarily unavailable`)으로 끝나고 원본 파일은 건드리지 않는다. 경로와 원인은 서버 error 로그에만 남는다.
- 예외 두 가지는 읽기에서 기본값으로 동작한다. `site_settings.json`, `pages/*.json`은 기본값으로 응답하되 저장은 거절한다. `cms_users.json`은 인증 경로에서 page 계정을 "없음"으로 처리하고(접근 거절) site admin 로그인은 계속 가능하다.
- 미디어 정리는 참조 저장소를 읽지 못하면 삭제를 건너뛴다. 삭제 API는 503으로 실패한다.
- 복구: 서버를 멈추거나 쓰기를 막은 뒤, error 로그의 파일명을 찾아 마지막 백업으로 되돌리거나 JSON 문법을 고친다. 자동 복구와 백업 로테이션은 없다.

## Frontend

- `src/shared/utils/rateLimiter.ts` + axios interceptor로 클라이언트 측 요청 제한
- JWT는 localStorage (`auth_token`)에 저장

## 배포 체크리스트

- [ ] `APP_DEBUG=false`
- [ ] `APP_JWT_SECRET_KEY` 교체 (32자 이상, 사이트마다 고유한 값)
- [ ] `APP_SITE_ID` 설정 (사이트마다 다른 값, 비우면 `APP_NAME`의 slug)
- [ ] `APP_ADMIN_EMAILS` 설정 (최소 1개, 복수 허용)
- [ ] CMS 계정(page_admin / page_manager)이 필요하면 `APP_PAGE_ADMIN_ENABLED=true`
- [ ] `APP_ALLOWED_ORIGINS`를 실제 frontend URL로 제한
- [ ] HTTPS 사용
- [ ] `APP_SEND_REAL_EMAIL`은 필요할 때만 `true`
- [ ] `data/` 디렉터리 권한·백업 확인 (`cms_users.json` 포함)
