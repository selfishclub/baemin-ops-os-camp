# bakery-manual-book

베이커리 4개 매장 신입 직원용 매뉴얼북 웹사이트입니다.

기획 문서: [PRD_전체.md](./PRD_전체.md) · [v1/PRD.md](./v1/PRD.md) · [v2/PRD.md](./v2/PRD.md) · [v1/사용메모.md](./v1/사용메모.md)

## 기능

- **직원 화면** — 검색(띄어쓰기·대소문자 무시: "컵 홀더"로 쳐도 "컵홀더"가 나옴), 카테고리별 보기, "신입 필수" 모아 보기, 매뉴얼 상세(사진·유튜브 영상·단계별 설명·태그)
- **확인했어요** — 매뉴얼 끝에서 매장 → 본인 이름을 고르고 누르면 누가 언제 봤는지 기록. 같은 사람이 두 번 누르면 "이미 확인했어요". 확인한 사람 목록은 매장별로 공개 표시
- **관리자 화면** (비밀번호) — 매뉴얼 추가·수정·삭제, "신입 필수" 지정, 사진 업로드, 유튜브 링크, 카테고리·매장·직원 명단 관리
- **신입 진행률** — 직원마다 "신입 필수" 매뉴얼 N개 중 M개 확인, 남은 매뉴얼, 등록 며칠째. 등록 7일이 지났는데 남은 게 있으면 빨간 표시
- **확인 현황** — 매뉴얼 하나 기준으로 누가 봤고 누가 안 봤는지

## 배포 및 데이터 저장 구조

`index.html`은 기존 [bonnoel-manager-logbook](../bonnoel-manager-logbook) 로그북과 **같은 Supabase 계정**을 사용합니다(같은 프로젝트에 매뉴얼북 전용 테이블만 새로 추가). 어떤 기기·브라우저로 접속해도 같은 매뉴얼/확인 기록을 보고 저장할 수 있습니다.

- **데이터베이스**: Supabase 프로젝트(`caetlljnyxsusswqhtci`)의 `manual_categories`, `manuals`, `manual_branches`, `manual_staff`, `manual_confirmations` 테이블
- **사진 저장**: Supabase Storage `manual-photos` 버킷 (public)
- `index.html`에 박혀 있는 Supabase URL과 `anon`/`publishable` 키는 공개되어도 안전한 값입니다(Row Level Security 정책으로 접근을 제어). **서비스 롤(service role) 키는 절대 이 파일에 넣지 마세요.**

## 처음 한 번만 하면 되는 준비 작업

Supabase 대시보드 → 로그북과 같은 프로젝트 → 왼쪽 메뉴 **SQL Editor** → New query → 아래 파일을 **순서대로** 하나씩 전체 복사해서 붙여넣고 **Run**

1. [`supabase-setup.sql`](./supabase-setup.sql) — 기본 테이블·보안 정책
2. **Storage** → New bucket → 이름 `manual-photos` → **Public bucket 켜기** → Create (그다음 `supabase-setup.sql` 맨 아래 "Storage 버킷 설정" 부분 실행. 1번에서 전체를 한 번에 실행했다면 이미 끝난 상태)
3. [`supabase-migration-branches.sql`](./supabase-migration-branches.sql) — 매장(지점) 기능
4. [`supabase-migration-required.sql`](./supabase-migration-required.sql) — "신입 필수" 표시 + 직원 ID 기반 확인 기록 (이름이 명단과 일치하는 옛 기록은 자동 연결)

이미 1~3을 실행한 상태라면 4번만 실행하면 됩니다.

## 관리자 비밀번호

`index.html` 안의 `ADMIN_PIN` 값을 원하는 비밀번호로 바꿔서 사용하세요. 메모장으로 파일을 열어 `var ADMIN_PIN = '...';` 줄만 수정하면 됩니다. 사장님과 매니저가 같은 비밀번호를 씁니다(매장별 권한 나누기는 v2).

## 파일 구성

- `index.html` — 매뉴얼북 전체 (HTML + CSS + JS 단일 파일)
- `supabase-setup.sql` — 기본 테이블/보안 정책 (최초 1회)
- `supabase-migration-branches.sql` — 매장 기능 추가 (최초 1회)
- `supabase-migration-required.sql` — 신입 필수·직원 ID 확인 기록 (최초 1회)
- `manifest.json`, `sw.js`, `icon-*.png` — 폰 홈 화면에 추가(PWA)용

## 배포 방법 (로그북과 동일)

1. 이 폴더를 GitHub 저장소로 push
2. https://vercel.com 에서 이 저장소를 Import → 배포
3. 이후 `main` 브랜치에 push할 때마다 Vercel이 자동으로 재배포합니다
