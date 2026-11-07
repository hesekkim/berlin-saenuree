# 로컬 테스트 실행

backend unit, frontend unit, e2e를 로컬에서 돌리는 방법이다.

## 사전 준비

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements-dev.txt
```

### Frontend

```bash
cd frontend
npm install
npx playwright install chromium   # e2e용, 최초 1회
```

## 테스트 실행

### 1. Backend unit (pytest)

서버를 띄울 필요 없다.

```bash
cd backend
.\.venv\Scripts\activate
python -m pytest tests/unit
```

### 2. Frontend unit (Vitest)

서버를 띄울 필요 없다.

```bash
cd frontend
npm test
```

감시 모드:

```bash
npm run test:watch
```

### 3. E2E (Playwright)

프론트 dev 서버가 필요하다. `npm run test:e2e`가 없으면 자동으로 `npm run dev`(port 9090)를 띄운다. 이미 `npm run dev`가 떠 있으면 그걸 재사용한다.

```bash
cd frontend
npm run test:e2e
```

UI 모드:

```bash
npm run test:e2e:ui
```

현재 e2e는 홈 진입과 admin 로그인 모달 진입만 본다. OTP 전체 로그인 플로우는 포함하지 않는다. backend가 없어도 동작한다.

## 한 번에 돌리기 (요약)

| 종류 | 위치 | 명령 |
|------|------|------|
| backend unit | `backend/` | `python -m pytest tests/unit` |
| frontend unit | `frontend/` | `npm test` |
| e2e | `frontend/` | `npm run test:e2e` |

PowerShell 예시:

```powershell
cd c:\dev\test-page\backend
.\.venv\Scripts\activate
python -m pytest tests/unit

cd c:\dev\test-page\frontend
npm test
npm run test:e2e
```

## 범위

자세한 원칙은 `.cursor/rules/testing-strategy.mdc`를 따른다. 중요한 로직만 테스트하고 coverage %는 목표로 두지 않는다.
