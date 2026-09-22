# 서버(Supabase) 연결 — 실시간 동기화

매장 아이패드 · 사장님 폰 · PC가 같은 기록을 보게 하는 v2 1단계. 한 번만 하면 됩니다.

## 사장님이 하는 것 (10분)

1. https://supabase.com → **Sign in with GitHub** → **New project**: 이름 `haemonic`, Region **Northeast Asia (Seoul)**, DB 비밀번호는 아무거나 정해 메모.
2. 만들어지면 왼쪽 **SQL Editor** → **New query** → `supabase.sql` 내용을 통째로 붙여넣고 **Run**. "Success" 가 뜨면 끝.
3. **Authentication → Users → Add user → Create new user**: 매장 공용 로그인 (이메일 아무거나, 비밀번호 정하기). **Auto Confirm User** 체크.
4. **Project Settings → API** 에서 **Project URL** 과 **anon public** 키 복사.

## 기기마다 하는 것 (2분)

앱 → 설정 → **서버 연결** 에 Project URL 과 anon 키를 붙여넣고 → **로그인** → 3번에서 만든 이메일·비밀번호 입력.
처음 연결하는 기기의 기록이 서버에 올라가고, 그 뒤 연결하는 기기는 서버 기록을 받아 옵니다.
**기록이 있는 기기(매장 아이패드)를 가장 먼저 연결하세요.**

## 알아둘 것

- anon 키는 공개용 키입니다. 진짜 비밀인 `service_role` 키는 어디에도 넣지 않습니다.
- 열쇠는 각 기기 브라우저에만 저장됩니다(코드·GitHub 에 없음).
- 인터넷이 끊기면 기기 안에 저장했다가 연결되면 올립니다. 같은 문서를 두 기기가 동시에 고치면 나중 저장이 이깁니다.
- 무료 구간: 500MB DB · 월 5GB 전송 — 두 매장 규모면 충분합니다.
