# 빈숲 레시피OS · v2

카페 직원 교육용 레시피북. 직원은 로그인해서 메뉴별 정량·제조 순서·주의사항을 보고, 사장은 레시피를 편집·게시합니다.
레시피는 가게 영업 비밀이라 **로그인한 재직 직원만** 볼 수 있고, 저장소·시연 데이터에는 가짜 레시피만 들어 있습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000

- `.env.local` 이 **없으면 시연 모드**: 로그인 없이 가짜 레시피를 보여 주고, 편집은 그 브라우저에만 저장되는 미리보기로 됩니다. 다른 사장님이 구경할 때는 이 상태면 충분합니다.
- `.env.local` 에 Supabase 열쇠를 넣으면 **실제 모드**: 로그인 화면이 켜지고, 사장 계정으로 레시피를 편집·게시할 수 있습니다.

## 로그인 잠깐 끄기 (둘러보기 모드)

다른 사람이 로그인 없이 기능을 살펴보게 하고 싶을 때. 로그인 코드는 지우지 않고 스위치로만 끕니다.

- 끄기: 환경변수 `NEXT_PUBLIC_LOGIN_OFF=1` 을 넣고 다시 배포 (내 컴퓨터는 `.env.local` 에 한 줄 추가)
- 켜기: 그 환경변수를 지우고 다시 배포
- 꺼 둔 동안: 데이터 창고를 읽지 않고 가짜 레시피만 보입니다. 레시피 보기·검색·단면도·영상 프롬프트(종류별 지침서)·레시피 물어보기·워터마크는 그대로 되고, 읽음 확인·교육 기록처럼 저장이 필요한 기능은 안내 문구만 나옵니다
- 꺼 둔 동안 **미리보기**: 관리자 편집(`/recipes/admin`)과 메뉴 잠금 설정(`/manage/menus`)은 로그인 없이 눌러 볼 수 있습니다. 고친 레시피·지침·게시·복구는 브라우저 저장소(`beansoop-preview-workspace-v1`)에, 잠금은 쿠키(`bs_preview_locks`)에만 남고 데이터 창고에는 쓰지 않습니다. 로그인 모드에서는 이 쿠키를 읽지 않으므로 실제 잠금을 풀 수 없습니다. 사진·영상 올리기는 미리보기에서 막혀 있습니다

## 메뉴 잠금

- 로그인 모드: 사장이 관리의 "메뉴 잠금 설정"(`/manage/menus`)에서 큰 메뉴마다 열림/잠김을 고른다 (데이터 창고 표 `portal_locks`)
- 둘러보기 모드(로그인 꺼 둠): 서버 환경변수 `LOCKED_SECTIONS=recipes` (쉼표로 여러 개) 를 넣고 다시 배포하면 고정 잠금. 그 밖에 `/manage/menus` 에서 누르는 잠금은 그 브라우저에서만 보이는 미리보기
- 잠글 수 있는 메뉴: 사장 전용 관리 메뉴를 뺀 전부 (`recipes`, `training`, `exam` 등 — `app/portal-sections.ts` 의 id). 기본은 전부 열림

## 데이터 창고(Supabase) 연결 — 사장님만 한 번

1. Supabase 프로젝트를 만들고 **SQL Editor** 에 `supabase/schema.sql` 을 통째로 붙여넣어 실행 (표·잠금·사진 파일함이 만들어집니다)
2. `.env.local.example` 을 복사해 `.env.local` 로 만들고, 대시보드 **Project Settings → API** 의 Project URL 과 anon 키를 붙여넣기 (`service_role` 은 절대 금지)
3. **Authentication → Users → Add user** 로 사장 계정을 먼저 만들기 (Email: `아이디@beansoop.local`, Auto Confirm 켜기). **첫 계정이 자동으로 사장(owner)** 이 됩니다
4. 같은 방법으로 직원 계정을 만들면 직원(staff)으로 들어갑니다. 앱의 **직원 계정 관리**(`/recipes/staff`)에서 퇴사 처리·역할 변경

## 화면

| 주소 | 누가 | 무엇 |
|---|---|---|
| `/login` | 모두 | 아이디·비밀번호 로그인 |
| `/` | 재직 직원 | 빈숲 OS 홈 — 영역별 큰 버튼. 사장은 영역을 잠그기/열기 |
| `/recipes` | 재직 직원 | 레시피 목록·검색·상세, 영상 프롬프트 생성, 레시피 물어보기 (잠겨 있으면 사장만) |
| `/recipes/admin` | 사장 | 레시피 편집·사진 올리기·초안 저장·공식 게시·버전 복구 |
| `/manage/menus` | 사장 | 메뉴 잠금 설정 — 큰 메뉴마다 직원에게 열림/잠김 |
| `/recipes/staff` | 사장 | 직원 계정 재직/중지, 역할 |
| `/recipes/changes` | 사장 | 바뀐 레시피를 누가 확인했는지 |
| `/recipes/training` | 재직 직원 · 사장 | 신입 메뉴 체크리스트(만들어 봤음 → 사장 확인함) + 레시피 퀴즈 |

## 구조

- `app/recipes/recipes-page.tsx` 직원 화면 (클라이언트) · `app/recipes/admin/studio.tsx` 관리자 화면
- `app/auth.ts` 로그인·역할 확인 · `proxy.ts` 로그인 안 한 요청을 `/login` 으로
- `db/recipe-store.ts` 저장 층 (Supabase Postgres) · `supabase/schema.sql` 표와 잠금
- `lib/supabase/` 열쇠 읽기와 클라이언트

## v1과 달라진 것

- ChatGPT 계정 연동 → Supabase 아이디·비밀번호 로그인, 사장/직원 권한
- Cloudflare D1/R2 → Supabase Postgres/Storage. Vercel 에 그대로 올릴 수 있는 일반 Next.js
- 단면도: 재료 이름으로 색 자동(16색)·직접 색·얼음 조각, 잔 아래(1층)부터 쌓는 순서
