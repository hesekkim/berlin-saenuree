# Render 플랜 가이드

Render Web Service의 Free와 유료 compute 플랜을 비교하고 이 프로젝트에 필요한 설정을 안내한다. 가격은 바뀔 수 있으므로 [Render 가격표](https://render.com/pricing#compute)를 확인한다.

## Free vs 유료 플랜

| 항목 | Free | 유료 |
|------|------|------|
| 비용 | 무료 | 플랜 및 디스크 가격은 [가격표](https://render.com/pricing#compute) 참고 |
| 비활성 처리 | 15분 동안 인바운드 트래픽이 없으면 sleep | sleep 없음 |
| 콜드 스타트 | 다음 요청에서 다시 시작하며 보통 약 1분 소요 | 해당 없음 |
| SMTP | 아웃바운드 25, 465, 587 포트 차단 | Free 전용 제한은 적용되지 않지만 SMTP 제공자 정책 확인 필요 |
| 영구 디스크 | 사용할 수 없음 | 연결 가능 |

Render는 2026년 8월부터 compute 플랜의 새 이름을 도입했다. 기존 `Starter` 이름도 계속 사용할 수 있고, 새 플랜 ID는 사양을 나타낸다 (예: `0.5c-512mb`). 요금과 사양은 [compute 플랜 안내](https://render.com/docs/compute-plans)를 확인한다.

Free는 테스트나 데모용이다. 이 프로젝트는 JSON 파일과 업로드 미디어를 로컬 파일 시스템에 저장하고 이메일 OTP를 사용하므로, 실제 운영에는 유료 Web Service와 영구 디스크를 권장한다. Render는 포트 25를 모든 서비스에서 차단하므로 SMTP에는 587 등 허용되는 포트를 사용한다.

## 플랜 변경

1. [Render Dashboard](https://dashboard.render.com)에서 Web Service를 연다.
2. **Compute** 페이지에서 **Edit**를 선택한다.
3. 원하는 compute 플랜을 선택하고 저장한다.

변경은 다음 배포가 성공한 뒤 적용된다. 영구 디스크가 연결된 서비스는 플랜 변경 중 잠시 중단될 수 있다. 자세한 내용은 [compute 플랜 변경 안내](https://render.com/docs/compute-plans#changing-a-services-compute-plan)를 확인한다.

## 데이터 영구 저장

Free Web Service는 영구 디스크를 지원하지 않는다. 파일 시스템 변경 사항은 재배포·재시작뿐 아니라 sleep 시에도 유실될 수 있다.

유료 서비스에 영구 디스크를 연결하고, 디스크의 mount path와 `APP_DATA_ROOT`를 같은 경로로 설정한다. 예를 들어 mount path를 `/var/data`로 정했다면 `APP_DATA_ROOT=/var/data`로 설정한다. 이 경로 아래의 `data/`와 `backups/`가 디스크에 저장된다. Render 디스크의 mount path와 제한은 [영구 디스크 안내](https://render.com/docs/disks)를 확인한다.

## 프록시와 rate limit

Render는 앞단 프록시를 사용하며, 이 프로젝트의 `APP_TRUSTED_PROXY_HOPS` 기본값은 `1`이다. 배포 환경에는 `APP_TRUSTED_PROXY_HOPS=1`을 명시하는 것을 권장한다.

`0`으로 설정하면 프록시 뒤에서 모든 요청이 같은 IP로 집계될 수 있다. 일반 API 요청은 초당 10건 또는 분당 300건을 넘으면 해당 IP가 15분 차단될 수 있다. 자세한 설정은 [ENV_SETUP.md](./ENV_SETUP.md)를 참고한다.

## 이 프로젝트 기준

- 현재 backend는 OTP 인증, CMS, 게시물·미디어, Blogger 관리 기능 등을 제공한다.
- `APP_DATA_ROOT` 아래에 JSON 데이터와 업로드 파일을 저장하므로, 운영에서는 영구 디스크를 사용하고 백업도 별도 위치에 보관한다.
- 실제 이메일 OTP를 보내려면 SMTP 환경 변수와 이메일 제공자 설정이 필요하다.
- JSON 저장소와 유지보수 작업은 단일 워커를 전제로 한다. 여러 워커로 실행하지 않는다. 자세한 배포 설정과 백업 절차는 [DEPLOY.md](./DEPLOY.md)를 참고한다.
