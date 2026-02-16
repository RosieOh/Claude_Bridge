# Phase 2 구현 요약

## 구현 내용

### 1. 요약 서비스 (`proxy/src/lib/summary.ts`)
- **`runSummarization(prisma, sessionId)`**: 세션 메시지를 조회해 Claude Messages API로 요약 요청
- System prompt: 사실/결정/요구사항/미해결 질문 추출, Markdown 출력
- 성공 시 `Summary` 레코드 생성, `Request` 기록, `Session` 토큰 누적

### 2. POST /internal/sessions/:id/summarize (실제 동작)
- `runSummarization` 호출 후 `summaryId`, `inputTokens`, `outputTokens` 반환
- 실패 시 500 + `SUMMARY_ERROR`

### 3. 자동 요약 트리거 (80%)
- **`proxy/src/routes/proxy.ts`**: `/v1/messages` 처리 후 세션 토큰 사용률이 **80% 이상**이면 `maybeTriggerAutoSummary()` 호출
- 같은 세션 중복 요약 방지용 `summarizingSessions` Set 사용
- 요약은 **비동기** 실행(응답 블로킹 없음)

### 4. Pinned 메시지
- **PATCH /internal/sessions/:id/messages/:msgId** — body `{ pinned: true | false }` 로 고정/해제
- DB `messages.pinned` 업데이트

### 5. UI
- **세션 상세**:
  - **Summaries**: 요약 목록(버전, 토큰 수, 생성일, 본문)
  - **Messages**: 각 메시지에 **Pin** / **📌 Pinned** 버튼, 클릭 시 PATCH 호출 후 로컬 상태 갱신
  - Summarize Now 성공 시 "✓ Summary generated and saved." 표시

## 사용 방법

1. 세션 상세에서 **Summarize Now** → 해당 세션 메시지로 Claude 요약 호출 후 Summary 저장
2. 세션 토큰이 80% 넘으면 다음 `/v1/messages` 처리 후 자동으로 요약 실행
3. 메시지 **Pin** 클릭 → 고정(요약/압축 시 제외 대상으로 활용 가능)

## 참고

- 요약 시 사용하는 모델은 세션의 `model` 필드(기본 `claude-sonnet-4-20250514`)
- 요약 호출 비용/토큰도 `requests` 및 `sessions`에 반영됨
