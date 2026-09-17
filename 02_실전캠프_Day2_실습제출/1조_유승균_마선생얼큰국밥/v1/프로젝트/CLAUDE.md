# 리뷰 콘텐츠 스튜디오

배달앱(배민 1순위·쿠팡이츠 2순위)·네이버 플레이스 리뷰를 수집·분류·보관하고,
리뷰 1개 → 인스타 캐러셀 / 릴스 대본 / 네이버·당근 새소식 3종을 AI로 한 번에 생성하는 Next.js 앱. 포트 3400.

## 원칙

1. **리뷰에 없는 내용을 지어내지 않는다.** 프롬프트(`src/lib/ai/prompts/`)의 절대 규칙을 약화시키지 말 것. 가게 정보는 설정(settings)에 입력된 값만 사용.
2. **닉네임 보호** — 콘텐츠·프롬프트에는 `maskName`으로 가린 이름만 전달.
3. **플랫폼 자동화 최소화** — 크롤러는 읽기만 한다. 답글 등록·클릭 자동화는 기존 크롬 확장(부모 폴더)의 역할.
4. `npm run build`를 직접 돌리지 말고 **`npm run verify`** 사용 (dev 서버의 `.next`를 덮어쓰면 서버가 죽음).
5. 사용자는 비개발자 사장님 — UI 문구·오류 메시지는 쉬운 한국어로.

## 구조

- `src/lib/db.ts` — `node:sqlite` (Node 22.13+ 내장). 테이블: reviews / contents / weekly_best / settings. `STUDIO_DATA_DIR`로 경로 변경 가능(테스트용).
- `src/lib/classify.ts` — 규칙 기반 카테고리·감정·소재점수. 새 키워드는 여기에.
- `src/lib/ingest.ts` — 확장/크롤러 공통 입력 → 분류 → upsert. 기존 확장의 `sendToAdmin` 페이로드와 호환.
- `src/lib/ai/client.ts` — Anthropic(`messages.parse` + zodOutputFormat) 우선, OpenAI(`chat.completions.parse`) 폴백. 스키마는 `src/lib/types.ts`의 Zod.
- `src/lib/crawler/runner.ts` — `scripts/crawl-*.mjs`를 자식 프로세스로 실행, 로그를 메모리에 보관. 한 번에 한 작업.
- `scripts/crawl-baemin.mjs` — 사용자의 실제 크롬을 전용 프로필(`data/browser-profiles/baemin`)로 띄워 로그인 상태 유지. 페이지에 "리뷰번호"가 보일 때까지 대기 후 스크롤 수집. 파싱 로직은 부모 폴더 `popup.js`의 `scrapeBaeminReviews`에서 가져와 답변완료 리뷰까지 확장.
- 콘텐츠 3종은 한 번의 구조화 호출(`ContentBundleSchema`)로 생성 후 kind별 3행으로 저장. 같은 `created_at`이 한 묶음.

## 작업 후

`npm run verify` 통과 확인. 데이터 구조 변경 시 `src/lib/types.ts` → `db.ts` migrate 순서로.
