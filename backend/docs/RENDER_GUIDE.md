# Render 플랜 가이드

Render Web Service의 Free / Starter 전환 요약이다.

## Free vs Starter

| 항목 | Free | Starter |
|------|------|---------|
| 비용 | $0/월 | 유료 (예: $7/월) |
| Sleep | 비활성 후 Sleep | Sleep 없음 |
| 콜드 스타트 | 첫 요청 수 초 지연 가능 | 상시 활성 |
| SMTP | 막힐 수 있음 | 보통 가능 |

## 전환

1. [Render Dashboard](https://dashboard.render.com) 접속
2. Web Service → Settings → Instance Type
3. Free ↔ Starter 선택 후 확인

전환은 보통 즉시 적용되고, 서비스가 잠시 재시작될 수 있다.

## 프록시와 rate limit

Render는 앞단 프록시를 거친다. `APP_TRUSTED_PROXY_HOPS`의 기본값은 1이지만, 환경 변수에 `APP_TRUSTED_PROXY_HOPS=1`을 명시해 두는 것을 권장한다. 0으로 두면 모든 방문자가 같은 IP로 집계되어 동시 접속자가 몇 명만 있어도 사이트 전체가 15분 차단될 수 있다. 자세한 내용은 [ENV_SETUP.md](./ENV_SETUP.md)를 본다.

## 이 프로젝트 기준

- 현재 골격은 auth OTP + 정적 홈 페이지 수준이다
- Sleep이 있어도 치명적이지 않을 수 있다. SMTP/상시 가동이 필요하면 Starter를 쓴다
- 데이터는 `APP_DATA_ROOT`가 가리키는 경로에 JSON으로 저장된다. 플랜 변경만으로 파일이 자동 삭제되지는 않지만, ephemeral disk면 재배포 시 유실될 수 있다
