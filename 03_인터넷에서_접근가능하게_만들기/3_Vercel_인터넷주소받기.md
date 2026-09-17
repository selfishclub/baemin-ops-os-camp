# 3단계 · Vercel로 인터넷 주소 받기

Vercel(버셀)은 **내 GitHub 저장소를 읽어서 인터넷 주소를 만들어 주는 서비스**입니다.
한 번 연결하면 그 뒤로는 **push만 하면 자동으로 새 버전이 올라갑니다.**

## 1. 가입 (사장님이 직접, 1분)

https://vercel.com → **Sign Up** → **Continue with GitHub**.
GitHub 접근 허용 화면이 나오면 **Authorize**.

## 2. 저장소 가져오기 (3분)

1. **Add New… → Project**
2. 내 GitHub 저장소 목록이 보입니다. 1단계에서 만든 저장소 옆 **Import**.
   - 목록에 없으면 **Adjust GitHub App Permissions** → 그 저장소를 허용.
3. **Framework Preset**은 보통 자동으로 잡힙니다 (Next.js 등). 그대로 둡니다.

## 3. 환경변수 넣기 (Supabase를 썼을 때만)

**Environment Variables** 칸을 펼치고, `.env.local`에 있던 것과 **같은 이름, 같은 값**을 **사장님이 직접** 붙여넣습니다.
AI에게 "Vercel 환경변수 칸 열어 줘"라고 하면 Claude in Chrome이 칸까지 열어 두고 멈춥니다. 값은 Supabase 열쇠 화면(Project Settings → API)에서 복사해 옵니다.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 |

이름이 다를 수 있으니 AI에게 물어봅니다:
> Vercel 환경변수에 넣어야 할 이름과 값을 표로 알려 줘. `.env.local`에 있는 것 기준으로.

service_role 키는 넣지 않습니다.

## 4. Deploy

**Deploy** 버튼 → 1~3분 기다림 → 폭죽 화면과 함께 주소가 나옵니다.
예: `https://staff-schedule-abc123.vercel.app`

**이 주소를 제출서에 적습니다.**

## 5. 확인

- 그 주소를 **내 폰에서** 엽니다. 열리면 성공.
- 옆 사장님 폰에서도 열어 봅니다. 열리면 진짜 성공.

## 실패했을 때 (빨간 화면)

1. **View Build Logs** 또는 오류 메시지를 **복사**합니다.
2. AI에게:
   > Vercel 배포가 실패했어. 로그는 이거야: [붙여넣기]. 고쳐서 다시 push해 줘.
3. push하면 Vercel이 **자동으로 다시** 시도합니다. 다시 Deploy 누를 필요 없습니다.

자주 나오는 원인: 환경변수 빠짐, 내 컴퓨터에서는 되는데 빌드 오류, 파일 이름 대소문자.

## 앞으로

- 코드를 고치고 push → 1~2분 뒤 같은 주소에 새 버전. v2도 같은 주소입니다.
- 주소를 예쁘게 바꾸고 싶으면 Vercel 프로젝트 **Settings → Domains**에서 `내이름.vercel.app`으로 변경 가능.

## 비용

무료 플랜은 개인·비상업용입니다. 캠프 실습과 시연은 무료로 충분합니다.
실제 가게 운영에 계속 쓰게 되면 그때 Pro(월 $20)를 생각합니다.

다음 → [제출 전 체크리스트](제출전_체크리스트.md)
