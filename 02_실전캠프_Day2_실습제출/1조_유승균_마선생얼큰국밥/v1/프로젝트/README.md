# 리뷰 콘텐츠 스튜디오

배달앱(배민·쿠팡이츠)·네이버 플레이스 리뷰를 자동으로 모아두고, 리뷰 하나를 고르면
**인스타 캐러셀 · 릴스/쇼츠 대본 · 네이버/당근 새소식 문구** 3가지를 AI가 한 번에 만들어주는 웹앱입니다.

## 켜는 방법 (매번)

1. 바탕화면의 **`review-studio-start.bat`** 을 더블클릭합니다.
2. 검은 창이 뜨고 잠시 뒤 브라우저에 `http://localhost:3400` 이 열립니다.
3. 검은 창은 닫지 말고 그대로 둡니다. (닫으면 서버가 꺼집니다)

## 처음 한 번만

1. `.env.local` 파일에 AI 키가 들어 있는지 확인합니다. (`ANTHROPIC_API_KEY` 또는 `OPENAI_API_KEY`)
2. 화면 오른쪽 위 **설정**에서 가게 이름·대표 메뉴·인스타 계정·네이버 플레이스 주소를 넣고 저장합니다.

## 사용 흐름

| 단계 | 어디서 | 무엇을 |
|---|---|---|
| ① 리뷰 수집 | 대시보드 → **배민 수집** | 크롬 창이 열립니다. 배민 사장님 사이트에 로그인하고 **리뷰** 메뉴를 열면 자동으로 끝까지 스크롤하며 읽어옵니다. 로그인은 처음 한 번만 (전용 프로필에 저장) |
| | **쿠팡이츠 수집** | 같은 방식. 페이지를 넘기며 읽어옵니다 |
| | **네이버 수집** | 로그인 없이 공개 방문자 리뷰를 읽어옵니다 (설정에 플레이스 주소 필요) |
| ② 분류·보관 | 대시보드 | 맛/양/포장/배달/서비스/가격/재주문/사진/불만 태그가 자동으로 붙습니다. 좋은 리뷰는 ☆ 를 눌러 **리뷰 수집함**에 담아두세요 |
| ③ 주간 베스트 | **주간 베스트** | 월요일에 **AI로 Top 5 선정**을 누르면 지난주 리뷰 요약 + 콘텐츠 소재 5개가 나옵니다 |
| ④ 콘텐츠 생성 | 리뷰 카드의 **콘텐츠 만들기** | 캐러셀(3~5장 문구 + 이미지 프롬프트 + 캡션) · 릴스 대본(장면별 대사/자막/BGM) · 네이버/당근 새소식이 한 번에 만들어집니다. **복사** 버튼으로 바로 붙여넣기 |

### 크롬 확장(배달 리뷰 자동답글 도우미)으로 보내기

이미 쓰고 있는 확장의 **전송 URL**에 `http://localhost:3400/api/reviews/ingest` 를 넣고
"어드민으로 전송"을 누르면 확장이 수집한 리뷰가 이 앱에 저장됩니다. 토큰은 `.env.local`의 `INGEST_TOKEN`과 같게 (비워두면 검사 안 함).

## 꼭 알아두세요

- AI는 **리뷰에 실제로 적힌 내용만** 씁니다. 손님 닉네임은 콘텐츠에 넣지 않습니다.
- 생성된 문구는 초안입니다. 올리기 전에 한 번 읽어보고 다듬어 주세요.
- 수집 중 열리는 크롬 창은 화면에 보이게 두세요. 최소화하면 느려지거나 멈출 수 있습니다.
- 배민/쿠팡 사이트가 개편되면 수집이 안 될 수 있습니다. 그때는 "기록 보기"의 내용을 개발자에게 전달해 주세요.

## 인터넷에 올리기 (항상 같은 주소로 쓰기)

리뷰 저장소는 **Turso(클라우드 SQLite)** 로 옮길 수 있습니다. `TURSO_DATABASE_URL` 이 있으면 클라우드 DB, 없으면 노트북 파일(`data/studio.db`)을 씁니다.

1. GitHub 저장소 `review-content-studio` 를 Vercel에서 **Import** 합니다.
2. Vercel → 프로젝트 → **Storage** 탭 → **Turso** 연결(Marketplace). 환경변수 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 이 자동으로 들어갑니다.
3. **Settings → Environment Variables** 에 아래를 추가하고 **Redeploy** 합니다.
   - `ANTHROPIC_API_KEY` (또는 `OPENAI_API_KEY`)
   - `APP_PASSWORD` — 접속 비밀번호
   - `INGEST_TOKEN` — 노트북 크롤러가 리뷰를 올릴 때 쓰는 토큰 (노트북 `.env.local` 과 같은 값)
4. 노트북 `.env.local` 에 아래 두 줄을 넣습니다. 그러면 노트북에서 "배민 수집"을 눌렀을 때 결과가 인터넷 서버로 바로 올라갑니다.
   ```
   STUDIO_INGEST_URL=https://<배포주소>/api/reviews/ingest
   TURSO_DATABASE_URL=...   (Vercel 환경변수와 같은 값, 노트북 화면도 클라우드 DB를 보게 하려면)
   TURSO_AUTH_TOKEN=...
   ```
5. 지금까지 노트북에 모인 리뷰를 클라우드로 복사: `npm run migrate:cloud`

인터넷 서버에서는 크롬을 열 수 없으므로 **수집은 항상 노트북에서**, 보기·콘텐츠 생성은 어디서나 됩니다.

## 개발자용

```bash
npm install
npm run dev          # http://localhost:3400
npm run verify       # typecheck + test + build (.next-verify 별도 폴더)
npm run crawl:baemin -- --ingest http://127.0.0.1:3400/api/reviews/ingest
npm run crawl:naver  -- --url https://naver.me/xxxx --ingest http://127.0.0.1:3400/api/reviews/ingest
```

- 저장: `data/studio.db` (SQLite, Node 내장 `node:sqlite`) — 별도 설치 불필요
- 크롤러: `scripts/crawl-*.mjs` (playwright-core + 사용자의 실제 크롬, 프로필은 `data/browser-profiles/`)
- AI: `src/lib/ai/client.ts` — Anthropic 우선, 실패 시 OpenAI. 프롬프트는 `src/lib/ai/prompts/`
- 분류 규칙: `src/lib/classify.ts`

- 네이버 페이지 구조가 바뀌어 수집이 안 되면: `node scripts/debug-naver.mjs <플레이스ID>` → `data/debug/naver-dump.json` 을 개발자에게 전달
