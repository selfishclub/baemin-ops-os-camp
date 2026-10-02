# 해모닉 업무 체크리스트 — 작업 규칙 (CLAUDE.md)

해모닉(대게·킹크랩 전문점, 안산점·안양점) 매장 운영 앱. 사장님은 GitHub 초보 — git 작업은 쉬운 말로 짧게 설명한다.

## 구조
- 바닐라 JS 단일 페이지: `index.html` → `data.js`(루틴·설정 기본값) → `vendor/supabase.min.js` → `store.js`(저장·동기화) → `app.js`(화면·동작) → `style.css`.
- 저장: 기기 IndexedDB 캐시 + Supabase `docs` 표(`state:ansan`, `state:anyang`, `shared:issues`). 알림은 `events` 표에 넣으면 서버(pg_cron·트리거)가 텔레그램으로 보낸다. 서버 SQL은 `서버/supabase.sql`, `서버/supabase_alerts.sql`.
- 배포: GitHub `SUSANOO123/haemonic-ops` → Vercel `https://haemonic-ops.vercel.app` 자동 배포. 캐시 깨기: `index.html`의 `?v=YYYYMMDDx`를 바꾼다.
- 2026-10-02 이후 코드는 이 저장소에서 고친다. 캠프 공동 저장소의 `v2/프로젝트/`는 10/2 스냅샷.

## 절대 규칙
- 실제 직원·손님 이름, 실제 매출·매입 파일, 비밀번호, API 키는 코드·문서·커밋에 넣지 않는다. 직원 이름은 앱 데이터(서버)에만 있다.
- Supabase `service_role` 키는 어디에도 쓰지 않는다. publishable(anon) 키와 주소는 기기 localStorage(`hm.supa`)에만 저장한다. 텔레그램 봇 토큰은 앱 설정(매장 문서)에 저장되고 서버가 읽는다.
- `git push --force`, `reset --hard`, `--no-verify` 금지. `git add -A` 대신 바꾼 파일만 add. 커밋 메시지는 한국어 한 줄.

## 사장님이 정한 운영 규칙 (코드에 반영됨)
- 오후 조는 17:00부터. 인원 기준은 시간대별: 오픈 = 오전 조, 미들·마감 = 오후 조. 2인이면 홀 업무는 관리자 겸직(일부 주방).
- 근무표 최소 인원 기준은 쓰지 않는다 (캘린더대로 2명·3명).
- 할 일 순서·시각·이름 변경과 미션 승인은 사장님 PIN으로 잠근다. 10분 뒤 자동 잠김.
- 주 n회 업무는 매일 보이되 해당 없는 요일은 자동 완료. 수조·이끼 상태 확인은 월·수·금.
- 교육: 영상 90% 이상 재생 후 "내일 적용할 것 한 줄" → 월 3개 개인 미션 → 본인 체크 → 사장님 확인 → 완료·달성 때만 텔레그램 공유.
- 마감 리포트는 서버가 21:30(KST)에 보낸다. 서버 로그인 중이면 앱은 직접 보내지 않는다.

## 고칠 때 순서
1. `node --check app.js` 로 문법 확인 → 로컬에서 화면 확인 → `index.html` 버전 올리기 → 커밋 → push → `curl`로 Vercel에 새 버전이 보일 때까지 확인.
2. 루틴(`data.js` TEMPLATES)을 바꾸면 `ROUTINE_VER`를 올리고, 사장님이 앱에서 고친 값(`edited`)·순서(`ord`)·매장 구분(`scope`)·직접 만든 업무(`custom`)는 유지되는지 본다.
3. 서버 SQL을 바꾸면 Supabase SQL Editor에서 실행해야 반영된다 (코드 배포만으로는 안 됨).
