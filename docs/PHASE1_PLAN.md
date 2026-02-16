# Phase 1 설계·작업 순서

Phase 1 목표: **세션/요청/토큰 메타 기록** + **메뉴바·대시보드에 실데이터 표시** + **세션 리스트·상세(기본)**.

아래 순서대로 진행하면 의존성이 깨지지 않습니다.

---

## 0. 사전 결정(정책)

| 항목 | 결정 | 비고 |
|------|------|------|
| 세션 ID 미제공 시 | **매 요청마다 새 세션 생성** (또는 "default" 단일 세션 1개 재사용) | 추천: **default 단일 세션** — 클라이언트가 헤더 안 보내도 동작 |
| 현재 세션 정의 | **가장 최근에 요청이 들어온 세션** = "현재 세션" | `/internal/status`에서 사용 |
| 로깅 레벨 | Phase 1에서는 **standard** 고정 (본문 저장) | policies는 Phase 2에서 연동 |

---

## 1. 설계·작업 순서 (체크리스트)

### Step 1 — DB·Prisma 준비

- [x] **1.1** Prisma 클라이언트가 프록시에서 이미 사용 가능한지 확인 (`npx prisma generate`).
- [ ] **1.2** (선택) 스키마 인덱스 추가: `messages(session_id, created_at)`, `requests(session_id, created_at)`, `sessions(updated_at)`.
- [x] **1.3** 프록시 진입점(`index.ts`)에서 Prisma 클라이언트 **싱글톤** 생성·주입 (또는 `fastify.decorate('prisma', prisma)`).

**산출물:** 프록시 내 모든 라우트에서 `prisma` 사용 가능.

---

### Step 2 — 세션 확보 로직 (공용)

- [x] **2.1** `proxy/src/lib/session.ts` (또는 `services/session.ts`) 추가.
  - `getOrCreateSession(sessionId: string | null, options?: { name?, model? }): Promise<Session>`
  - `sessionId`가 있으면 해당 세션 조회(없으면 생성하지 않고 새 UUID로 생성).
  - `sessionId`가 없으면 **"default"** ID로 1개 세션 조회 또는 생성.
- [x] **2.2** 세션 생성 시 `model`은 요청 body의 `model` 또는 기본값(`claude-sonnet-4-20250514`), `tokenLimit`은 모델별 기본값(예: 200000) 저장.

**산출물:** `getOrCreateSession()` 호출만으로 요청별로 사용할 세션이 정해짐.

---

### Step 3 — POST /v1/messages 에서 기록

- [x] **3.1** `proxy/src/routes/proxy.ts`에서 Claude 호출 **전**에 `getOrCreateSession(x-csm-session-id, { model })` 호출.
- [x] **3.2** Claude 응답 수신 후:
  - `usage`: `input_tokens`, `output_tokens` 있으면 사용.
  - 없으면 0 또는 (선택) 문자 수 근사.
- [x] **3.3** `Request` 레코드 생성: `sessionId`, `endpoint`, `inputTokens`, `outputTokens`, `cost`(Phase 1에서는 0 또는 단가 테이블 연동), `latencyMs`, `requestMeta`/`responseMeta`(필요 시 축약본만 JSON).
- [x] **3.4** `Session` 업데이트: `tokenUsedInput += inputTokens`, `tokenUsedOutput += outputTokens`, `costEstimated += cost`, `updatedAt`, 필요 시 `status`(tokenUsed/tokenLimit 비율로 ok/warn/critical).
- [x] **3.5** (Phase 1 범위) 요청 body의 `messages` 배열을 순회해 **Message** 레코드 생성/보강. 이미 있는 메시지는 `hash` 또는 순서로 스킵 가능. `role`, `content`, `tokenCountEst`(usage에서 나누거나 0).

**산출물:** `/v1/messages` 한 번 호출 시 sessions / requests / messages 에 데이터 적재.

---

### Step 4 — /internal/status 실데이터

- [x] **4.1** `GET /internal/status`에서:
  - **현재 세션**: `updated_at` 기준 최근 1개 세션 조회.
  - **오늘 토큰/비용**: `requests`에서 `created_at`이 오늘인 것 합산 (`input_tokens`+`output_tokens`, `cost`).
  - **API 키**: 기존처럼 `!!process.env.ANTHROPIC_API_KEY`.
  - **경고**: 현재 세션의 `status`가 warn/critical이면 `warning` 문자열 반환.
- [x] **4.2** 응답 JSON 스키마는 기존과 동일 유지 (`currentSession: { id, tokens, limit }` 등).

**산출물:** 대시보드에서 "오늘 사용량·현재 세션 토큰/한도"가 실제 값으로 표시됨.

---

### Step 5 — /internal/sessions 목록·상세

- [x] **5.1** `GET /internal/sessions?range=today|all&limit=10`:
  - Prisma로 `Session` 목록 조회, `range=today`면 `created_at` 또는 `updated_at`이 오늘인 것만.
  - `limit` 기본 10, 정렬 `updated_at desc`.
  - 각 세션에 `tokenUsedInput`, `tokenUsedOutput`, `tokenLimit`, `costEstimated`, `status`, `model` 포함.
- [x] **5.2** `GET /internal/sessions/:id`:
  - 해당 세션 + `messages` (역할/시간순) + `summaries` (Phase 2까지는 빈 배열 가능).
  - 메시지 본문이 크면 잘라서 보내거나, Phase 1에서는 전부 반환.
- [x] **5.3** `POST /internal/sessions/new`: body에 `name`, `model` 선택. 새 Session 생성 후 반환 (이 세션 ID를 클라이언트가 이후 `x-csm-session-id`로 사용).

**산출물:** UI에서 "세션 목록" 및 "세션 상세" API 호출 가능.

---

### Step 6 — 대시보드 UI (세션 리스트·카드)

- [x] **6.1** 대시보드 상단에 **카드 4개** (와이어 스펙): Today Tokens, Today Cost, Current Session(토큰/한도), Spike/경고(있을 때만).
- [x] **6.2** `GET /internal/sessions?range=today&limit=10` 호출해 **세션 리스트** 표시 (세션명 또는 ID, 모델, 토큰 used/limit, 비용).
- [x] **6.3** 세션 행 클릭 시 `GET /internal/sessions/:id` 호출해 **세션 상세** 패널 또는 모달 표시 (메시지 목록, 턴별 토큰 등).
- [x] **6.4** (선택) "New Session" 버튼 → `POST /internal/sessions/new` 호출 후, 반환된 ID를 어딘가에 표시(클립보드 또는 상태에 저장)해 사용자가 클라이언트에 붙여넣을 수 있게 함.

**산출물:** 메뉴바에서 "Open Dashboard" 시 세션·토큰·비용이 한 화면에 보임.

---

### Step 7 — 메뉴바 토큰 표시 (선택)

- [ ] **7.1** 트레이 **툴팁**에 "토큰 used/limit · 오늘 비용" 등 표시. (폴링으로 `/internal/status` 이미 쓰고 있으므로, 같은 데이터로 툴팁 문자열만 갱신.)
- [ ] **7.2** 또는 Tauri 쪽에서 주기적으로 status를 가져와 트레이 `set_tooltip()` 호출.

**산출물:** 메뉴바 아이콘에 마우스 오버 시 현재 상태 요약 표시.

---

## 2. 작업 순서 요약 (의존성 순)

```
Step 1 (DB/Prisma)
    → Step 2 (세션 확보)
        → Step 3 (POST /v1 기록)
        → Step 4 (/internal/status 실데이터)
        → Step 5 (/internal/sessions API)
            → Step 6 (대시보드 UI)
            → Step 7 (메뉴바 툴팁, 선택)
```

- **Step 1 → 2 → 3** 까지 완료하면, curl로 `/v1/messages` 호출 시 DB에 세션·요청·메시지가 쌓임.
- **Step 4** 완료 시 대시보드의 "오늘/현재 세션" 숫자가 실데이터로 바뀜.
- **Step 5** 완료 후 **Step 6**에서 세션 리스트·상세 UI만 붙이면 Phase 1 핵심 완료.

---

## 3. 비용·단가 (Phase 1)

- 비용은 **0으로 두거나**, 모델별 단가 테이블을 `proxy`에 상수로 두고 `input_tokens * 단가_input + output_tokens * 단가_output` 계산.
- 단가 테이블은 나중에 Policies 또는 설정으로 옮겨도 됨.

---

## 4. 완료 기준

- [x] 클라이언트가 `x-csm-session-id` 없이/있게 `POST /v1/messages` 호출 시 세션·요청·메시지가 DB에 저장됨.
- [x] `GET /internal/status`에 오늘 토큰/비용, 현재 세션 토큰/한도가 실데이터로 나옴.
- [x] 대시보드에 세션 리스트가 보이고, 클릭 시 세션 상세(메시지 등)가 표시됨.
- [x] (선택) 메뉴바 트레이 툴팁에 토큰/비용 요약 표시.

이 순서대로 진행하면 설계 일관성을 유지하면서 Phase 1을 완료할 수 있습니다.
