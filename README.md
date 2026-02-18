<div align="center">

# 💬 CSM — Claude Session Manager

**Claude(및 추후 멀티 LLM) 세션의 토큰·비용·컨텍스트를 한 번에 관리하는 macOS 메뉴바 앱**

[![Tauri](https://img.shields.io/badge/Tauri-2.0-ffc131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=20232a)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-Server-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Platform](https://img.shields.io/badge/macOS-Sonoma+-000000?style=flat-square&logo=apple&logoColor=white)](https://www.apple.com/macos/)

</div>

---

## ✨ 주요 기능

| | 기능 |
|---|------|
| 🧠 | Claude(및 추후 다른 LLM) API 프록시 라우팅 |
| 📈 | 세션·요청별 토큰/비용 메타데이터 기록 |
| 🕒 | 메뉴바에서 실시간 사용량·토큰 카운트 확인 |
| 📋 | 세션 리스트 / 상세 뷰 & pinned 메시지 |
| 🧾 | 자동 요약 트리거 및 `Summarize Now` 액션 |
| 🛡 | (예정) Budget Guard, Spike 감지, Export/Import |

---

## 🧱 프로젝트 구조

- **`app/`** — Tauri 2 + React (macOS 메뉴바 트레이 + 대시보드 창)
- **`proxy/`** — Node.js + Fastify (Claude API 프록시 + 내부 API)
- **`docs/`** — 스펙 분석 및 설계 문서 모음

---

## 🛠 기술 스택

<table>
<tr>
<td width="50%">

#### 💻 앱 (Tauri + React)

| 기술 | 설명 |
|------|------|
| ![Tauri](https://img.shields.io/badge/Tauri-2.0-ffc131?style=flat-square&logo=tauri&logoColor=white) | macOS 네이티브 메뉴바 앱 |
| ![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=20232a) | 대시보드 UI |
| ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white) | 정적 타입 시스템 |
| ![Vite](https://img.shields.io/badge/Vite-Bundler-646CFF?style=flat-square&logo=vite&logoColor=white) | 프론트엔드 번들러/Dev 서버 |

</td>
<td width="50%">

#### 🌐 프록시 (Node + Fastify)

| 기술 | 역할 |
|------|------|
| ![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white) | 런타임 |
| ![Fastify](https://img.shields.io/badge/Fastify-API-000000?style=flat-square&logo=fastify&logoColor=white) | HTTP 서버 & 라우팅 |
| ![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white) | DB ORM (스키마 관리) |
| ![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?style=flat-square&logo=sqlite&logoColor=white) | 기본 로컬 DB(`file:./dev.db`) |

</td>
</tr>
</table>

---

## 🚀 시작하기

### 📋 사전 요구사항

- **Node.js 18+**
- **Rust** (Tauri 빌드용) — 설치 필요 시:

  ```bash
  curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
  source ~/.cargo/env  # 또는 새 터미널 열기
  ```

- [Tauri 2 Prerequisites](https://v2.tauri.app/start/prerequisites/)  
  (macOS: Xcode Command Line Tools 필수)

---

### ⚙️ 설치

> **모든 명령은 프로젝트 루트(`CSM/`)에서 실행합니다.** (`app/` 안이 아님)

```bash
cd ~/Desktop/CSM   # 또는 프로젝트 루트로 이동
```

#### 1️⃣ 의존성 설치

```bash
npm install

cd proxy
npm install
cp .env.example .env
# proxy/.env에 ANTHROPIC_API_KEY=sk-ant-... 추가

cd ../app
npm install

cd ..   # 루트로 복귀
```

#### 2️⃣ DB 초기화 (프록시)

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

---

### ▶️ 실행

> **반드시 프로젝트 루트(`CSM`)에서 실행하세요.**

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

- 메뉴바에 **CSM 아이콘**이 나타납니다.
- 아이콘 클릭 시 **"Open Dashboard" / "Quit"** 메뉴가 표시됩니다.
- 대시보드 창에서는 프록시의 `/internal/status`를 **5초마다 폴링**하여 상태를 보여줍니다.

프록시 포트를 변경한 경우(`proxy/.env`의 `PORT`)에는 앱 쪽에서 다음을 설정하세요.

```bash
# app/.env 또는 app/.env.local
VITE_PROXY_URL=http://127.0.0.1:원하는포트
```

---

### 🧪 프록시만 테스트 (Claude echo)

```bash
cd proxy
npm run dev

# 다른 터미널에서:
curl -X POST http://127.0.0.1:37891/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

실제 호출 시 프록시가 `.env`에 설정된 `ANTHROPIC_API_KEY`를 사용해 Claude API로 요청을 전달합니다.

---

## 🗺 로드맵

| Phase | 내용 |
|-------|------|
| **0** | ✅ Tauri 메뉴바 뼈대, 프록시 Claude echo |
| **1** | ✅ 세션/요청/토큰 메타 기록, 메뉴바 토큰 표시, 세션 리스트·상세 창 |
| **2** | ✅ 자동 요약 트리거(80%), Summarize Now(Claude 호출), pinned 메시지 |
| **3** | ⏳ Budget Guard, Spike 감지, Export/Import |

---

## 📚 문서

- [스펙 분석 (SPEC_ANALYSIS.md)](docs/SPEC_ANALYSIS.md)  
  → 제품 요약, IA/시스템 설계, 데이터 모델, 리스크, 권장 진행 순서
- [개선 제안 (IMPROVEMENTS.md)](docs/IMPROVEMENTS.md)  
  → 기능·코드·UX·운영·보안 개선 포인트
- [Phase 1 설계·작업 순서 (PHASE1_PLAN.md)](docs/PHASE1_PLAN.md)  
  → 세션/토큰 기록·status 실데이터·세션 리스트 구현 순서
- [Phase 2 설계·작업 순서 (PHASE2_PLAN.md)](docs/PHASE2_PLAN.md)  
  → Budget Guard, 알림, 모니터링 등 후속 기능 계획

---

## 📄 라이선스

이 프로젝트는 **MIT License** 하에 배포됩니다.

---

## 📞 연락처 & 피드백

- 문의: **[dhxogns920@gmail.com](mailto:dhxogns920@gmail.com)**
- 버그 제보·기능 제안은 Issue 또는 PR로 언제든 환영합니다.

