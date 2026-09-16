# 2단계 · Supabase 데이터 창고 연결하기

**데이터를 저장해야 하는 도구만** 합니다. (근무표 저장, 정산 기록 누적, 매뉴얼 내용 수정 등)
화면만 있고 저장이 없으면 건너뜁니다.

Supabase(수파베이스)는 **엑셀 시트 같은 온라인 창고**입니다. 어느 컴퓨터, 어느 폰에서 열어도 같은 데이터를 봅니다.

## 1. 가입하고 프로젝트 만들기 (사장님이 직접, 3분)

1. https://supabase.com → **Start your project** → **Continue with GitHub** (GitHub 계정으로 로그인)
2. **New project** 클릭
3. 이름: 내 도구 이름 (예: `staff-schedule`)
4. Database Password: **새로 만들고 어딘가 적어 둡니다.** (이건 AI에게도 GitHub에도 주지 않습니다)
5. Region: **Northeast Asia (Seoul)** 선택
6. **Create new project** → 1~2분 기다림

## 2. 열쇠 두 개 복사하기

프로젝트가 열리면 왼쪽 아래 **Project Settings(톱니)** → **API**.

| 이름 | 어디에 쓰나 | 공개해도 되나 |
|---|---|---|
| **Project URL** | 창고 주소 | 됨 |
| **anon public** 키 | 화면에서 창고에 접근하는 열쇠 | 됨 (공개용으로 만들어진 열쇠) |
| **service_role** 키 | 관리자 열쇠 | **절대 안 됨.** 복사하지 않습니다 |

URL과 anon 키 **둘만** 복사합니다.

## 3. AI에게 연결 시키기

> Supabase를 연결해 줘. 주소는 `[Project URL]`, anon 키는 `[anon 키]`야.
> `.env.local` 파일에 넣고, 그 파일이 `.gitignore`에 있는지 확인해 줘. 코드에 직접 적지 마.

## 4. 테이블 만들기 — AI에게

무슨 표가 필요한지 AI가 PRD를 보고 압니다.

> PRD.md를 보고 필요한 테이블을 Supabase에 만들어 줘. 만들 SQL을 보여 주면 내가 Supabase의 SQL Editor에 붙여넣을게.

AI가 준 SQL을 Supabase 화면의 **SQL Editor**에 붙여넣고 **Run**. 초록색 "Success"가 뜨면 됩니다.

## 5. 잠그기 — 중요

anon 키는 공개용이라 **테이블에 잠금(RLS)**을 걸어야 남이 내 데이터를 못 봅니다.

> 방금 만든 테이블에 RLS를 켜고, 이 도구에서 필요한 최소한의 규칙만 만들어 줘. SQL로 보여 줘.

시연용 가짜 데이터만 넣더라도 습관으로 켭니다.

## Vercel에도 같은 값을

3단계에서 Vercel 환경변수 칸에 **같은 URL과 anon 키**를 넣습니다. 내 컴퓨터의 `.env.local`은 Vercel이 못 보기 때문입니다.

## 막힐 때

- **"Invalid API key"** → anon 키를 잘못 복사. 앞뒤 공백 없이 다시.
- **화면은 뜨는데 저장이 안 됨** → RLS 규칙이 너무 엄격. AI에게 오류 메시지 그대로 붙여넣기.
- **비밀번호를 잊음** → Supabase에서 재설정 가능. 코드에는 원래 안 들어가므로 영향 없음.

다음 → [3단계 Vercel](3_Vercel_인터넷주소받기.md)
