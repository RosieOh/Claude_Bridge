# CSM — Claude Session Manager

Claude(및 추후 멀티 LLM) API 호출을 **프록시**로 통과시키고, 세션별 **토큰/비용/컨텍스트**를 관리하는 맥 메뉴바 앱입니다.

## 구조

- **`app/`** — Tauri 2 + React (메뉴바 트레이 + 대시보드 창)
- **`proxy/`** — Node.js + Fastify (Claude API 프록시 + 내부 API)
- **`docs/`** — 스펙 분석 및 설계 문서

## 사전 요구사항

- Node.js 18+
- **Rust** (Tauri 빌드용) — 설치 필요 시:
  ```bash
  curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
  source ~/.cargo/env  # 또는 새 터미널 열기
  ```
- [Prerequisites for Tauri](https://v2.tauri.app/start/prerequisites/) (macOS: Xcode Command Line Tools 필요)

## 빠른 시작

**아래 명령은 모두 프로젝트 루트(`CSM/`)에서 실행하세요.** (`app/` 안이 아님)

```bash
cd ~/Desktop/CSM   # 또는 프로젝트 루트로 이동
```

### 1. 의존성 설치

```bash
npm install
cd proxy && npm install && cp .env.example .env
# proxy/.env에 ANTHROPIC_API_KEY=sk-ant-... 추가
cd ../app && npm install
cd ..   # 루트로 복귀
```

### 2. DB 초기화 (프록시)

```bash
# 루트(CSM)에서
cd proxy
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'PORT=37891' >> .env
# .env에 ANTHROPIC_API_KEY=sk-ant-... 추가
npx prisma generate
npx prisma db push
cd ..
```

### 3. 실행

**반드시 프로젝트 루트(`CSM`)에서 실행:**

**터미널 1 — 프록시**

```bash
cd ~/Desktop/CSM
npm run dev:proxy
```

**터미널 2 — Tauri 앱**

```bash
cd ~/Desktop/CSM
npm run dev:app
```

메뉴바에 CSM 아이콘이 나타나고, 클릭 시 "Open Dashboard" / "Quit" 메뉴가 열립니다. 대시보드 창에서는 프록시 `/internal/status`를 5초마다 폴링해 표시합니다.

### 4. 프록시만 테스트 (Claude echo)

```bash
cd proxy && npm run dev
# 다른 터미널에서:
curl -X POST http://127.0.0.1:37891/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

(실제 호출 시 프록시가 `ANTHROPIC_API_KEY`로 Claude에 전달합니다.)

## 로드맵

| Phase | 내용 |
|-------|------|
| **0** | ✅ Tauri 메뉴바 뼈대, 프록시 Claude echo |
| **1** | 세션/요청/토큰 메타 기록, 메뉴바 토큰 표시, 세션 리스트·상세 창 |
| **2** | 자동 요약 트리거, Summarize Now, pinned 메시지 |
| **3** | Budget Guard, Spike 감지, Export/Import |

## 문서

- [스펙 분석 (SPEC_ANALYSIS.md)](docs/SPEC_ANALYSIS.md) — 제품 요약, IA/시스템 설계, 데이터 모델, 리스크, 권장 진행 순서

## 라이선스

MIT
