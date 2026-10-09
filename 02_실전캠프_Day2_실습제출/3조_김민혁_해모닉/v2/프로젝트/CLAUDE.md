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
- 안양점 2인(갑각류 관리자+주방) 담당은 `data.js` `ANYANG_TWO` 표를 따른다(관리자 23 · 주방 20 · 공통 2, 힘든 일은 관리자). 안산점은 기존 규칙(홀→관리자, role2). `HEAVY_TASKS`는 💪 표시용.
- 근무표 최소 인원 기준은 쓰지 않는다 (캘린더대로 2명·3명).
- 할 일 순서·시각·이름 변경과 미션 승인은 사장님 PIN으로 잠근다. 10분 뒤 자동 잠김.
- 업무 카테고리(+대시보드) 밖의 카테고리(인사관리·운영·서비스 교육·회계·설정)는 **사장님 비밀번호**(아이디 없음, 해시만 `shared:issues` 문서의 `SH.owner.hash`에 저장, 두 매장 공통)를 넣어야 열린다(2026-10-08, `ownerOn()`, `viewLocked`). 풀린 상태는 탭별 sessionStorage, **5분 무사용 시 자동 잠김**(`OWNER_IDLE_MS`). 비밀번호가 있으면 순서 PIN 대신 이 비밀번호를 쓴다. 서버 이메일 계정 로그인은 더 이상 사장님 모드와 무관. 주의: 데이터는 매장 문서 하나에 다 들어 있어 화면만 잠그는 것이며, API로는 익명 세션도 읽을 수 있다 — 진짜 분리는 민감 정보를 별도 문서로 나누고 RLS에서 is_anonymous 를 막아야 한다(미구현). 매출 입력·공유 게시판(구 트러블시트)은 직원이 쓰므로 업무 카테고리에 둔다. 게시판 글·덧글은 익명 가능, 삭제는 PIN.
- 주 n회 업무는 매일 보이되 해당 없는 요일은 자동 완료. 수조·이끼 상태 확인은 월·수·금.
- **기기 등록제**(2026-10-08): `서버/supabase_devices.sql`. 등록된 기기만 docs·events RLS 통과(`device_ok()`, 헤더 x-device-key 해시 ↔ `devices` 표). 등록된 기기가 0개면 모두 허용(과도기). 열쇠는 기기 localStorage `hm.devkey`. 등록은 `device_register(사장님 비밀번호 해시, 이름, 매장)` RPC — 비밀번호 없으면 첫 등록 때 만들어짐. 실시간은 `docs_poke` 표 신호 → 기기 열쇠로 재조회. 등록 안 된 기기는 `LIMITED` 모드: 기기 등록 + 교육 자료만(`training_doc`/`training_save` RPC). 사장님 기기 등록·끊기는 설정 › 등록된 기기. `?view=register`로 등록 화면 바로 열기.
- 기본 자리표시 직원(사장님·홀 1·주방 1·매니저·점장, id s1~s3)은 실제 직원이 있으면 hydrate에서 자동 삭제, mergeDocs에서는 양쪽에 다 있을 때만 유지(2026-10-08). 새 기기 첫 연결 때 되살아나던 문제.
- 직원 잠금(2026-10-08, `STAFF_BLOCK`·`staffLocked()`, 설정 `staffLock` 기본 켜짐): 사장님 모드가 아니면 내용 변경 동작은 숨기고 막는다. 직원에게 남는 것 = 할 일 체크·건너뜀·되돌리기·메모, 완료 창 숫자, 수조·폐사 기록, 매출·식자재 매입 입력, 게시판.
- 원가 관리 두 판(2026-10-08): 업무 › 원가 관리(식자재) = 직원용, 갑각류(`CRAB_CATS`) 제외 / 운영 › 총원가 = 사장님용, 갑각류+식자재 합계·원가율, 갑각류 매입 입력. 같은 `S.purchases`를 분류로 나눔.
- 폐사 기록: 할 일 폐사 입력(inst.ev deaths) + 직접 기록 `S.deaths[]`, 사용 처리 `S.deadUse[key]`. 폐사일+3일이 사용 기한(`DEAD_DAYS`), 수조 관리표 섹션·`tankAlerts`에 오늘/지남 표시(2026-10-08).
- 할 일 완료 때 "어떻게 했나요" 메모(`inst.note`): 설정 `doneMemo` req(기본·필수)/opt/off. 카드 📝 버튼·⋯ 메뉴로 완료 뒤에도 남기거나 고침(2026-10-08).
- 교육: 영상 90% 이상 재생 후 "내일 적용할 것 한 줄" → 월 3개 개인 미션 → 본인 체크 → 사장님 확인 → 완료·달성 때만 텔레그램 공유.
- 마감 리포트는 서버가 21:50(KST)에 보낸다(앱 설정 reportAt을 서버 cron이 읽음). 서버 연결 중이면 앱은 직접 보내지 않는다.
- 서버 연결은 로그인 없이 자동(익명 세션, 2026-10-07). Supabase › Authentication › Allow anonymous sign-ins 가 켜져 있어야 한다. RLS는 authenticated 역할 기준이라 익명 세션도 통과한다.

## 고칠 때 순서
1. `node --check app.js` 로 문법 확인 → 로컬에서 화면 확인 → `index.html` 버전 올리기 → 커밋 → push → `curl`로 Vercel에 새 버전이 보일 때까지 확인.
2. 루틴(`data.js` TEMPLATES)을 바꾸면 `ROUTINE_VER`를 올리고, 사장님이 앱에서 고친 값(`edited`)·순서(`ord`)·매장 구분(`scope`)·직접 만든 업무(`custom`)는 유지되는지 본다.
3. 서버 SQL을 바꾸면 Supabase SQL Editor에서 실행해야 반영된다 (코드 배포만으로는 안 됨).
