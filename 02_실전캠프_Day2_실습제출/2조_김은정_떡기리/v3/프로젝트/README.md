# 떡기리 직원 온라인북 · v3 (다점포)

v2 와 같은 정적 웹앱(빌드 도구 없음)입니다. 실제 주소: https://tteokgiri-onlinebook-v3.vercel.app

## 세 가지 입구 (주소 하나)
| 누가 | 어떻게 | 보는 것 |
|---|---|---|
| 직원 | 지점 전용 링크 `…/#/s/<지점코드>` (QR) → 이름만 고름 | 공통 매뉴얼 + 📍 우리 지점 추가사항, 오픈·마감 체크, 교육표 |
| 점주 | 같은 링크 → 맨 아래 "점주 화면" → PIN 6자리 | 오늘 점검 · 직원관리 · 우리 지점 추가사항 · 설정(PIN·링크·QR·안내문) |
| 본사 | `…/#/hq` → 본사 이메일 + 비밀번호 | 전 지점 현황 · 지점 상세 · 공통 매뉴얼 편집/이력/되돌리기 · 지점 등록·PIN 초기화·중지 |

- 직원은 코드·번호를 입력하지 않습니다(링크 안에 코드가 있음). 6자리를 손으로 넣는 건 점주 PIN뿐.
- 앱은 Supabase 표를 직접 읽지 않고 **서버 함수**만 부릅니다. 직원용은 지점 코드(`db/05`), 점주용은 코드+PIN→12시간 토큰(`db/06`), 본사용은 로그인 이메일이 `hq_admins`에 있을 때만(`db/07`). 다른 지점 데이터는 받을 방법이 없습니다.
- 매뉴얼 = 본사 공통(`manual_pages`, 저장마다 `manual_history`에 자동 보관) + 지점 추가사항(`store_manual_notes`).
- 기록 저장은 v2 칸(`store` 글자)도 같이 채워 v2 사장 점검표에서도 그대로 보입니다.

## 파일
`index.html` · `app.js`(화면 전부) · `style.css` · `content.js`(DB가 비었을 때 예비 매뉴얼) · `qrcode.min.js`(QR, MIT) · `config.js`(열쇠, `make-config.js`가 `.env.local`/환경변수에서 생성, 커밋 안 함)

## 실행
`열쇠_예시.txt` 대로 `.env.local` 을 만들고 `node make-config.js` → `index.html` 을 열고 `#/s/<코드>` 로 들어갑니다. Vercel 은 환경변수 SUPABASE_URL, SUPABASE_ANON_KEY(Publishable key) 만 있으면 됩니다. 본사 계정은 Supabase 대시보드 Authentication → Users → Add user → Create new user(이메일·비밀번호·Auto Confirm)로 만들고, 같은 이메일을 `hq_admins`에 넣습니다(가입은 꺼 둔 상태 유지).

## 본사 관리자 바꾸기
`hq_admins` 표의 이메일을 고치고, Supabase Users 에 그 이메일 계정(비밀번호)을 만들면 됩니다.
