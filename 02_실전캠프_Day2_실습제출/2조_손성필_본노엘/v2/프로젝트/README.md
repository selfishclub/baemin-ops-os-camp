# bakery-manual-book

베이커리 4개 매장 신입 직원용 매뉴얼북 웹사이트입니다.

기획 문서: [PRD_전체.md](./PRD_전체.md) · [v1/PRD.md](./v1/PRD.md) · [v2/PRD.md](./v2/PRD.md) · [v1/사용메모.md](./v1/사용메모.md)

## 기능

- **직원 화면** — 검색(띄어쓰기·대소문자 무시: "컵 홀더"로 쳐도 "컵홀더"가 나옴), 카테고리별 보기, "신입 필수" 모아 보기, 매뉴얼 상세(사진·유튜브 영상·단계별 설명·태그)
- **확인했어요** — 매뉴얼 끝에서 매장 → 본인 이름을 고르고 누르면 누가 언제 봤는지 기록. 같은 사람이 두 번 누르면 "이미 확인했어요". 확인한 사람 목록은 매장별로 공개 표시
- **관리자 화면** (비밀번호) — 매뉴얼 추가·수정·삭제, "신입 필수" 지정, 사진 업로드, 유튜브 링크, 카테고리·매장·직원 명단·포장 비품 관리
- **포장 비품** — 자주 쓰는 포장재·용기 사진을 라이브러리로 등록해두고, 매뉴얼 편집 화면에서 골라 붙임. 직원 화면에서 "완성 사진"과 "필요한 비품"을 같이 보여줌
- **신입 진행률** — 직원마다 "신입 필수" 매뉴얼 N개 중 M개 확인, 남은 매뉴얼, 입사 며칠째(직원 명단에 `hire_on`이 있으면 그 날짜 기준). 입사 7일이 지났는데 남은 게 있으면 빨간 표시
- **미확인 알림 배지** — 입사 7일 지났는데 필수 매뉴얼이 남은 신입이 있으면 "관리자" 버튼과 "신입 진행률" 탭에 빨간 숫자 배지 표시 (외부 발송 없이 화면 표시만)
- **이해도 퀴즈** — 매뉴얼마다 O/X·객관식 문제를 등록해두면 직원이 확인하기 전에 풀이. 매뉴얼별로 "통과해야 확인 인정"을 켜고 끌 수 있음 (켜면 다 맞아야 확인 버튼이 열림, 끄면 참고용)
- **확인 현황** — 매뉴얼 하나 기준으로 누가 봤고 누가 안 봤는지

## 배포 및 데이터 저장 구조

`index.html`은 기존 [bonnoel-manager-logbook](../bonnoel-manager-logbook) 로그북과 **같은 Supabase 계정**을 사용합니다(같은 프로젝트에 매뉴얼북 전용 테이블만 새로 추가). 어떤 기기·브라우저로 접속해도 같은 매뉴얼/확인 기록을 보고 저장할 수 있습니다.

- **데이터베이스**: Supabase 프로젝트(`caetlljnyxsusswqhtci`)의 `manual_categories`, `manuals`, `manual_branches`, `manual_staff`, `manual_confirmations`, `manual_supplies`, `manual_quiz_questions` 테이블. `manual_staff`는 같은 프로젝트의 운영 앱(bonnoel-ops)과 같이 씀 — `hire_on`(입사일)·`active`(재직 여부)는 그쪽에서 채워짐
- **사진 저장**: Supabase Storage `manual-photos` 버킷 (public)
- `index.html`에 박혀 있는 Supabase URL과 `anon`/`publishable` 키는 공개되어도 안전한 값입니다(Row Level Security 정책으로 접근을 제어). **`service_role` 키는 절대 이 파일에 넣지 마세요.**

## 처음 한 번만 하면 되는 준비 작업

Supabase 대시보드 → 로그북과 같은 프로젝트 → 왼쪽 메뉴 **SQL Editor** → New query → 아래 파일을 **순서대로** 하나씩 전체 복사해서 붙여넣고 **Run**

1. [`supabase-setup.sql`](./supabase-setup.sql) — 기본 테이블·보안 정책
2. **Storage** → New bucket → 이름 `manual-photos` → **Public bucket 켜기** → Create (그다음 `supabase-setup.sql` 맨 아래 "Storage 버킷 설정" 부분 실행. 1번에서 전체를 한 번에 실행했다면 이미 끝난 상태)
3. [`supabase-migration-branches.sql`](./supabase-migration-branches.sql) — 매장(지점) 기능
4. [`supabase-migration-required.sql`](./supabase-migration-required.sql) — "신입 필수" 표시 + 직원 ID 기반 확인 기록 (이름이 명단과 일치하는 옛 기록은 자동 연결)
5. [`supabase-migration-supplies.sql`](./supabase-migration-supplies.sql) — 포장 비품 사진 라이브러리
6. [`supabase-migration-quiz.sql`](./supabase-migration-quiz.sql) — 매뉴얼별 이해도 퀴즈 + 확인 기록에 퀴즈 시도 횟수

이미 이전 파일들을 실행한 상태라면 새로 추가된 번호만 실행하면 됩니다.

## 관리자 비밀번호

`index.html` 안의 `ADMIN_PIN` 값을 원하는 비밀번호로 바꿔서 사용하세요. 메모장으로 파일을 열어 `var ADMIN_PIN = '...';` 줄만 수정하면 됩니다. 사장님과 매니저가 같은 비밀번호를 씁니다(매장별 권한 나누기는 v2).

## 파일 구성

- `index.html` — 매뉴얼북 전체 (HTML + CSS + JS 단일 파일)
- `supabase-setup.sql` — 기본 테이블/보안 정책 (최초 1회)
- `supabase-migration-branches.sql` — 매장 기능 추가 (최초 1회)
- `supabase-migration-required.sql` — 신입 필수·직원 ID 확인 기록 (최초 1회)
- `supabase-migration-supplies.sql` — 포장 비품 라이브러리 (최초 1회)
- `supabase-migration-quiz.sql` — 이해도 퀴즈 (최초 1회)
- `manifest.json`, `sw.js`, `icon-*.png` — 폰 홈 화면에 추가(PWA)용

## 배포 방법 (로그북과 동일)

1. 이 폴더를 GitHub 저장소로 push
2. https://vercel.com 에서 이 저장소를 Import → 배포
3. 이후 `main` 브랜치에 push할 때마다 Vercel이 자동으로 재배포합니다
