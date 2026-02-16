# CSM(Claude Session Manager) 스펙 분석서

## 1. 제품 요약

| 항목 | 내용 |
|------|------|
| **목적** | Claude API 호출을 프록시로 통과시키고, 세션별 토큰/비용/컨텍스트를 자동 관리하는 맥 메뉴바 앱 |
| **핵심 가치** | 원인 추적(요청 단위), 자동 압축(컨텍스트 품질), 예산 통제(Budget Guard) |
| **MVP 스택(문서 권장)** | Tauri(UI) + React, Node.js + Fastify(프록시), SQLite + Prisma, IPC로 프록시 제어 |

---

## 2. IA(정보 구조) 분석

### 2.1 메뉴바 vs 상세창 역할 분리

- **메뉴바**: “지금 상태만 보고, 즉시 액션” — 토큰/한도/오늘 사용량/경고, Summarize Now, New Session, 최근 세션 10개, 빠른 설정, 대시보드 진입점.
- **상세창**: “깊은 분석·설정” — 대시보드, 세션 리스트/상세, 정책, 연동, 설정.

**주의점**: 메뉴바에 넣을 정보가 많음. 옵션으로 “표시(토큰/비용/모델/경고)”를 사용자가 선택하게 하면 복잡도 완화.

### 2.2 상세창 6개 영역 의존성

| 영역 | 선행 필요 | 비고 |
|------|-----------|------|
| (A) Dashboard | 세션·요청·비용 데이터 | MVP Phase 1에서 기본 카드/그래프 |
| (B) Sessions | sessions 테이블 | Phase 1 핵심 |
| (C) Session Detail | messages, summaries, requests | Phase 1 기본, Phase 2에서 요약/고정 |
| (D) Policies | policies 테이블, 엔진에서 정책 적용 | Phase 2·3 |
| (E) Integrations | 프록시 엔드포인트 고정 후 | 문서/가이드 위주 |
| (F) Settings | API 키, DB 경로 등 | Phase 0~1에서 최소 설정 |

---

## 3. 시스템 설계 분석

### 3.1 구성요소 관계

```
[Client: App/SDK/CLI]
        ↓
[Local Proxy] ←→ [State Engine] ←→ [Local Storage: SQLite]
        ↓
[Claude API]
        ↑
[Tauri UI] —— IPC/polling ——→ [Proxy 내부 API /internal/*]
```

- **프록시**: 모든 `/v1/messages` 트래픽을 받아 기록 후 Claude로 전달. 내부 API(`/internal/*`)로 UI에 상태 제공.
- **State Engine**: “세션 상태 계산 + 자동 압축 트리거”를 누가 할지가 중요. 프록시 내부 모듈로 두는 것이 자연스러움(DB·요청 컨텍스트 직접 접근).
- **Tauri**: 프록시 프로세스 생명주기(start/stop) 제어 + 주기적 status poll. 메뉴바는 Tray, 상세창은 Window.

### 3.2 데이터 흐름 상의 결정 사항

1. **세션 식별**: `x-csm-session-id` (헤더) 또는 body meta. 미제공 시 “default” 또는 새 UUID 생성 정책 필요.
2. **압축 큐**: 동기(요청 직후 80% 초과 시 즉시 요약 후 재시도) vs 비동기(큐에 넣고 다음 요청 전에 반영). MVP는 “버튼 클릭 시 동기 요약”으로 시작하고, 자동 트리거는 Phase 2에서 비동기 큐 고려.
3. **실시간 표시**: Tauri → GET /internal/status 폴링(예: 2~5초). 필요 시 WebSocket은 후순위.

---

## 4. 핵심 기능별 분석

### 4.1 세션 상태 모델 (Memory Layers)

| 레이어 | 설명 | MVP 반영 |
|--------|------|----------|
| Short-term | 최근 N턴(8~12) | messages 테이블로 보관, N은 정책에서 설정 |
| Mid-term | 요약본 1개 + 불릿 | summaries 테이블, Phase 2 |
| Pinned | 사용자 고정 메시지 | messages.pinned, Phase 2 |
| Long-term | 벡터 DB (옵션) | V1 이후 |

**컨텍스트 빌드 순서**: System + Pinned + Mid-term Summary + Short-term (+ Long-term). 프록시가 “Claude에 보낼 메시지 배열”을 이 규칙으로 조합하는 모듈이 필요.

### 4.2 자동 압축 정책

- **임계치**: Warn 70% / Trigger 80% / Critical 90%. policies 테이블에 저장.
- **대상**: 오래된 short-term, pinned 제외. “이미 요약된 영역”은 diff 요약은 Phase 2 이후로 미뤄도 됨.
- **요약 호출**: “요약 전용” Claude 호출(별도 system prompt). 비용·토큰도 requests에 기록해야 함.

### 4.3 토큰/비용 계산

- **우선순위**: API usage → tokenizer 추정 → 문자 수 근사.
- **Claude API**: Messages API는 usage 필드 제공. 이를 우선 사용하면 됨.
- **단가 테이블**: 앱 설정(또는 policies)에 모델별 input/output 단가. 업데이트 가능하게.

### 4.4 Budget Guard

- 일/월 예산 → Soft(경고) / Hard(차단 또는 강제 요약 후 진행).
- 차단 시 HTTP 402 또는 429 유사 응답으로 클라이언트에 알리는 방식 명확히 할 것.

### 4.5 로깅/프라이버시

- **Minimal**: 본문 미저장(content null 가능), 메타만. messages.content는 optional로 스키마 반영.
- **PII 마스킹**: Standard/Full에서 적용. 패턴(이메일, 전화, API 키, 사용자 regex)은 policies.pii_redaction_rules(JSON).

---

## 5. 데이터 모델 검토

### 5.1 테이블 보완 제안

| 테이블 | 보완 제안 |
|--------|------------|
| sessions | `client_id`, `tags` (json) 추가 시 필터/그룹핑 유리 |
| messages | `summary_id` (이 메시지가 어느 요약에 포함됐는지) 있으면 diff 요약에 유리 |
| requests | `request_id` (Claude request_id 매핑) 있으면 디버깅·중복 방지에 유리 |
| policies | 전역 1행 vs “정책 프로파일” 다수는 V1에서 1행(전역)으로 충분 |

### 5.2 인덱스 권장

- `messages(session_id, created_at)`, `messages(session_id, pinned)`
- `requests(session_id, created_at)`, `requests(created_at)` (대시보드 시간대별)
- `sessions(updated_at)`, `sessions(created_at)`

---

## 6. API 설계 정리

### 6.1 프록시 공개 API (클라이언트용)

- `POST /v1/messages` — Claude Messages API와 동일한 입출력. 헤더 `x-csm-session-id`, `x-csm-tags` (선택).

### 6.2 내부 API (UI/엔진용)

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | /internal/status | 메뉴바용: 현재 세션, 토큰, 오늘 사용량, 경고, 프록시 on/off |
| GET | /internal/sessions | 목록 (query: range=today\|all, limit) |
| GET | /internal/sessions/:id | 세션 상세 + 메시지/요약/요청 요약 |
| POST | /internal/sessions/new | 새 세션 생성 (body: name?, model?) |
| POST | /internal/sessions/:id/summarize | 즉시 요약 실행 |
| PATCH | /internal/policies | 정책 일부 업데이트 |
| GET | /internal/usage | from/to 쿼리로 사용량·비용 집계 |

세션 “고정”은 `PATCH /internal/sessions/:id/messages/:msgId` 로 `pinned: true` 등으로 두면 됨.

---

## 7. 화면(와이어) 요약

- **메뉴 드롭다운**: 현재 세션 카드(게이지) → 빠른 액션 3개 → 최근 세션 리스트 → 설정/대시보드.
- **Dashboard**: 카드 4 + 그래프 2 + 이벤트 테이블. MVP는 카드 4 + 간단 테이블만 해도 됨.
- **Session Detail**: 왼쪽 요약/정책/액션, 오른쪽 턴별 히스토리 + pinned. Phase 1에서는 리스트 + 토큰 바만.

---

## 8. 기술 스택 검토

### 8.1 문서 권장(MVP): Tauri + React, Node + Fastify, SQLite + Prisma

- **장점**: 개발 속도 빠름, 프록시와 UI를 별도 프로세스로 분리해 디버깅·재시작 유연.
- **단점**: 배포 시 Node 런타임 동봉 또는 사용자 설치 필요. “단일 바이너리”는 아님.

### 8.2 대안: Rust 올인원 (Tauri + Axum + sqlx)

- **장점**: 단일 바이너리, 메모리/성능 예측 용이.
- **단점**: Claude API 호출·JSON 처리·토큰 추정 등 구현량과 디버깅 부담 증가.

**권장**: MVP는 문서대로 **Node 프록시 + Tauri(React)** 로 시작. 동작 검증 후 필요 시 프록시만 Rust로 이전하는 단계적 접근.

### 8.3 기타 선택

- **토큰 추정**: Claude는 usage 반환하므로 MVP에서 별도 tokenizer는 선택. 나중에 “usage 없을 때” 대비해 `tiktoken` 또는 `@anthropic-ai/tokenizer` 추가.
- **로컬 DB 암호화**: SQLCipher는 Phase 3 또는 V1. Keychain은 API 키 저장부터 적용 권장.

---

## 9. 로드맵과 리스크

### 9.1 Phase 0 (1~2일)

- Tauri 메뉴바 뼈대, 트레이 아이콘, 드롭다운(플레이스홀더).
- Node(Fastify) 프록시: `POST /v1/messages` → Claude로 그대로 전달(echo). API 키는 env 또는 설정 파일.
- **리스크**: Claude API 키·네트워크 없을 때 프록시 실패 처리 미비.

### 9.2 Phase 1 (MVP)

- DB 스키마(sessions, messages, requests) 적용, 프록시에서 세션/요청/토큰 메타 기록.
- 메뉴바에 “현재 세션 토큰/퍼센트” 표시.
- 상세창: 세션 리스트, 세션 상세(기본).
- **리스크**: 세션 ID 미전달 클라이언트 처리(기본 세션 vs 새 세션 생성 규칙).

### 9.3 Phase 2

- 자동 요약 트리거(80%), “Summarize Now”, pinned 메시지, 컨텍스트 빌드 규칙 적용.
- **리스크**: 요약 호출 실패 시 재시도·롤백 정책.

### 9.4 Phase 3

- Budget Guard, Spike 감지, Export/Import.
- **리스크**: 402/429 응답을 쓰는 클라이언트가 없을 수 있음 → 문서화·SDK 예시 제공.

### 9.5 비기능

- **성능**: 프록시 p95 +50ms → 로깅/DB 쓰기를 비동기·배치로.
- **안정성**: Claude 재시도/서킷브레이커는 프록시 레이어에서 옵션으로.
- **보안**: Keychain(Mac) API 키, DB 암호화는 옵션으로 뒤로.

---

## 10. 분석 종합 및 다음 단계 제안

### 10.1 스펙의 강점

- 목표와 IA가 명확하고, 메뉴바 vs 상세창 역할 분리가 잘 되어 있음.
- 데이터 모델과 API가 MVP 범위와 확장(정책, Budget, PII)을 함께 고려하고 있음.
- Phase 단위 로드맵이 있어 단계별 검증이 가능함.

### 10.2 반드시 정리할 것

1. **세션 ID 미제공 시 정책**: 매 요청 새 세션 vs “default” 단일 세션 vs 거부.
2. **요약 실패 시**: 재시도 횟수, 실패 시 “그대로 진행” vs “요청 거부”.
3. **Budget Hard 시 HTTP 코드**: 402 vs 429 vs 503, body에 `code: "BUDGET_EXCEEDED"` 등 명세.

### 10.3 권장 진행 순서

1. **Phase 0**: Tauri 트레이 + Fastify 프록시(Claude echo)까지 동작 확인.
2. **Phase 1**: Prisma 스키마 적용, 프록시에서 세션/메시지/요청 기록, 메뉴바 토큰 표시, 세션 리스트/상세 창.
3. 이후 Phase 2에서 요약·pinned·자동 트리거를 올리고, Phase 3에서 Budget/Spike/Export.

이 분석을 바탕으로 Phase 0 + Phase 1 초기 뼈대(프로젝트 구조, 설정 파일, 최소 코드)를 바로 제안할 수 있다.
