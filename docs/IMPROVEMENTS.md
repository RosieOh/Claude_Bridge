# CSM 프로젝트 개선 제안

Phase 2 완료 기준으로, 이미 반영된 항목과 **추가로 개선할 수 있는 점**을 정리했습니다.

---

## ✅ 이미 반영된 개선

| 항목 | 상태 |
|------|------|
| Phase 1: 세션·토큰 기록, /internal/status 실데이터, 세션 리스트·상세 UI | ✅ |
| 메뉴바 툴팁(토큰/비용) | ✅ |
| 프록시 URL 환경 변수(`VITE_PROXY_URL`) | ✅ |
| 최초 로딩 "Loading…" 표시 | ✅ |
| Phase 2: Summarize Now(실제 Claude 요약), 80% 자동 요약, Pinned 메시지 | ✅ |

---

## 1. Phase 3 / 로드맵 (기능)

| 개선 | 설명 | 난이도 |
|------|------|--------|
| **Budget Guard** | 일/월 예산 설정, Soft(경고) / Hard(초과 시 402 등 차단), policies 테이블 연동 | 중 |
| **Spike 감지** | 시간대별 토큰 급증 감지, 대시보드에 이벤트 로그 또는 알림 | 중 |
| **Export/Import** | 세션·메시지·요약 JSON/Markdown 내보내기, (선택) 가져오기 | 하 |
| **GET /internal/usage** | `from`/`to` 쿼리로 기간별 토큰·비용 집계 (대시보드 그래프용) | 하 |
| **Policies UI** | 자동 요약 임계치(70/80/90), 로깅 레벨, PII 규칙 설정 화면 | 중 |

---

## 2. 요약·컨텍스트 (Phase 2 보강)

| 개선 | 설명 |
|------|------|
| **요약 시 Pinned 제외** | 현재는 전체 메시지로 요약. 스펙대로 “pinned 제외” 후 요약하면, pinned는 항상 원문 유지 가능. |
| **요약 실패 재시도** | `runSummarization` 실패 시 재시도 횟수/백오프 정책 (자동 요약·Summarize Now 공통). |
| **컨텍스트 빌드 규칙** | 프록시가 “Claude에 보낼 메시지”를 **System + Pinned + Mid-term Summary + Short-term** 순으로 조합해 `/v1/messages` body 구성 (Phase 2 확장). |
| **요약 본문 길이 제한** | 매우 긴 대화 시 `buildSummaryUserPrompt`에서 최근 N턴 또는 토큰 상한 적용해 API 한도 회피. |

---

## 3. 코드·품질

| 개선 | 설명 |
|------|------|
| **에러 바운더리** | React 앱 전역 에러 처리, 에러 시 폴백 UI 표시. |
| **타입 공유** | `Status`, `SessionSummary` 등 API 타입을 `shared/` 또는 패키지로 분리해 proxy·app 동일 사용. |
| **프록시 요청 ID** | 요청마다 `x-request-id` 또는 내부 ID 부여, 로그·Request 메타에 기록해 디버깅 용이하게. |
| **비동기 DB 쓰기** | `/v1/messages` 처리 시 Request/Message 저장을 non-blocking(큐/백그라운드)로 해서 p95 지연 완화. |
| **Claude 재시도** | Claude API 5xx/타임아웃 시 제한된 재시도 + (선택) 서킷 브레이커. |

---

## 4. UX / UI

| 개선 | 설명 |
|------|------|
| **재시도 버튼** | 프록시 연결 실패 시 "Retry" 버튼으로 수동 재연결. |
| **대시보드 그래프** | 시간대별 토큰·세션별 비용 차트 (GET /internal/usage 연동). |
| **이벤트 테이블** | Spike/에러/요약 실행 등 이벤트 로그 목록 (테이블 또는 타임라인). |
| **세션 삭제** | 세션 상세에서 "Delete session" 후 목록 갱신. |
| **토큰 게이지** | 현재 세션 토큰을 progress bar(70% warn, 90% critical 색)로 표시. |

---

## 5. 운영·배포

| 개선 | 설명 |
|------|------|
| **앱에서 프록시 자동 기동** | Tauri에서 프록시 프로세스 start/stop 제어해, 사용자가 터미널에서 따로 켜지 않아도 되게. |
| **GET /internal/health** | 단순 200 + `{ status: "ok" }` 등 헬스 엔드포인트 (모니터링/재시작용). |
| **테스트** | 프록시 라우트 단위 테스트(Vitest 등), 요약·세션 로직 테스트. |
| **CHANGELOG** | 버전별 변경 사항 정리. |

---

## 6. 보안

| 개선 | 설명 |
|------|------|
| **API 키 Keychain** | macOS Keychain에 API 키 저장 옵션 (현재는 .env). |
| **내부 API** | `/internal/*`는 로컬 전용 가정 유지, 필요 시 localhost 검증 또는 간단 토큰. |
| **기동 시 API 키 검증** | 프록시 시작 시 `ANTHROPIC_API_KEY` 없으면 로그 경고 (현재 503은 호출 시 반환). |

---

## 7. 문서

| 개선 | 설명 |
|------|------|
| **README 스크린샷** | 실행 후 대시보드·메뉴바 한 장 추가 시 온보딩 개선. |
| **Integrations 가이드** | CLI/SDK 연동 예시, `x-csm-session-id` 사용법, 프록시 엔드포인트 정리. |
| **CONTRIBUTING** | 기여 시 브랜치/커밋 규칙 (팀·오픈소스 시). |

---

## 8. 우선 적용 추천 (작은 것부터) — ✅ 반영 완료

1. **재시도 버튼** — ✅ 프록시 실패 화면에 "Retry" 추가.
2. **GET /internal/usage** — ✅ 기간별 집계 API (`from`, `to` 쿼리).
3. **요약 시 pinned 제외** — ✅ — `runSummarization`에서 pinned 메시지 제외 후 요약 (선택: 요약 본문에 “pinned N개 제외” 명시).
4. **세션 삭제** — ✅ DELETE /internal/sessions/:id + UI "Delete" 버튼.
5. **헬스 엔드포인트** — ✅ GET /internal/health → { status: "ok" }.

추가로 적용할 항목은 1~7절에서 선택하면 된다.
