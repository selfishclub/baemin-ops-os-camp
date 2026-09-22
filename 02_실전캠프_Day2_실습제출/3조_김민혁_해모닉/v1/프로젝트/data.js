/* 해모닉 업무 체크리스트 — 기본 데이터
   사장님 검토본(2026-09) 기준 40개 루틴 + 휴식 1 / 중요 9개 / 하루 알림 5건 */

/* 근무 편성·직원에게 배정되는 역할 */
/* 점장 역할은 2026-09-12 부터 갑각류 관리자로 부른다 — 이 역할이 맡는 일이 갑각류 상태·수조·염도 관리이기 때문.
   저장된 옛 기록의 옛 이름은 앱이 열릴 때 자동으로 바꿔 읽는다 (LEGACY_ROLES). */
const ROLE_MGR = '갑각류 관리자';
const LEGACY_ROLES = { '점장': ROLE_MGR };
const ROLES = [ROLE_MGR, '홀', '주방'];

/* 특정 역할이 아니라 그날 있는 사람이 하는 업무.
   역할 필터를 무엇으로 놓아도 항상 보이고, 근무 편성에서 담당을 따지지 않는다. */
const ROLE_ANY = '공통';
const ROLE_OPTS = [...ROLES, ROLE_ANY];

/* 원가(매입) 분류·단위 */
const PURCHASE_CATS = ['대게', '킹크랩', '랍스터', '수산물', '식자재', '주류·음료', '소모품', '기타'];
const PURCHASE_UNITS = ['kg', '미', '박스', '개', '병', 'L'];

/* 이슈 분류 */
const ISSUE_CATS = ['고객 컴플레인', '서비스', '시설·장비', '수조·상품', '직원·교육', '기타'];

/* 레시피 분류 */
const RECIPE_CATS = ['대게', '킹크랩', '랍스터', '사이드', '소스·장', '기타'];

/* 근로계약서 — 최저임금은 해마다 바뀐다. 설정에서 고칠 수 있고 여기 값은 기본값(2026년 고시). */
const MIN_WAGE = { year: 2026, hour: 10320 };
const CONTRACT_TYPES = { regular: '기간의 정함이 없는 근로계약', fixed: '기간제 근로계약', part: '단시간(아르바이트) 근로계약' };
const PAY_TYPES = { hour: '시급', day: '일급', month: '월급' };
const DUTY_BY_ROLE = { [ROLE_MGR]: '갑각류(수조) 관리 및 매장 운영 관리', '홀': '홀 서빙 및 고객 응대, 매장 청결 관리', '주방': '조리 및 주방 위생 관리' };

/* 폐사 집계 어종 — 여기만 고치면 입력칸·리포트·그래프가 전부 따라간다 */
const SPECIES = ['대게', '킹크랩', '랍스터'];

const SLOTS = [
  { key: 'open',  name: '오픈',   from: '11:00' },
  { key: 'noon',  name: '미들',   from: '15:00' },
  { key: 'close', name: '마감',   from: '20:00' },
];

/* 루틴 데이터 버전 — 올리면 저장된 기존 루틴을 새 목록으로 갈아끼운다 */
const ROUTINE_VER = 8;   // 8판: 안양점 17:00 입구·계단 불 켜기 추가 — 2026-09-22   // 6판: 안양점 전용 마감 루틴 2개(계단 쓸기 · 찜기 물 배출) 추가 — 2026-09-22 사장님 요청

/* time    : 화면에 보이는 시각
   sort    : 정렬 기준 (마감 후 / 퇴점 전 처리용)
   due     : 알림·지연 판정 기준. null 이면 알림 없음
   grace   : 지연 판정 유예(분)
   ev      : none | number | money | kakao | deaths(어종별 폐사)
   repeat  : {t:'daily'} | {t:'weekly', days:[0=일 ... 6=토]}
   role2   : 2인 근무일 때의 담당. 없으면 role 그대로 쓴다
   rest    : 휴식 — 완료율 분모에서 빠지고 알림도 울리지 않는다                  */

const TEMPLATES = [
  // ── 오픈 (15) ─────────────────────────────────────────────
  { id:'t01', slot:'open', time:'11:00', sort:'11:00', title:'당일 예약 확인 및 룸·좌석 배정', role:ROLE_MGR, support:'홀' },
  { id:'t02', slot:'open', time:'11:00', sort:'11:00', title:'홀 조명·음악·냉장고 LED·포스·티오더 전원 켜기', role:'홀' },
  { id:'t03', slot:'open', time:'11:05', sort:'11:05', title:'부재중 전화 콜백하기', role:ROLE_MGR },
  { id:'t04', slot:'open', time:'11:05', sort:'11:05', title:'테이블·의자·유아의자·티오더·카트 청소', role:'홀', role2:'주방' },
  { id:'t05', slot:'open', time:'11:05', sort:'11:05', title:'갑각류·식재·반찬·소스 재고 확인', role:ROLE_MGR, support:'주방' },
  { id:'t19', slot:'open', time:'11:10', sort:'11:10', title:'입구·와인장·문유리·손잡이·카운터 청소', role:'홀', role2:'주방' },
  { id:'t08', slot:'open', time:'11:20', sort:'11:20', title:'식재·주류·소모품 부족 여부 확인', role:'주방', support:ROLE_MGR },
  { id:'t09', slot:'open', time:'11:30', sort:'11:30', title:'음식 상태 및 맛 체크', role:'공통' },
  { id:'t10', slot:'open', time:'11:30', sort:'11:30', title:'화장실 청소 및 휴지·비품 확인', memo:'하루씩 돌아가며 진행', role:'공통' },
  { id:'t13', slot:'open', time:'11:40', sort:'11:40', title:'갑각류 상태 확인', memo:'폐사 개체 즉시 제거 · 집게 반응과 활력도 · 마릿수 · 탈피 개체 격리', role:ROLE_MGR, crit:true, due:'11:40', grace:20, ev:'deaths', deadline:'12:00' },
  { id:'t14', slot:'open', time:'11:40', sort:'11:40', title:'염도 확인', memo:'굴절계·비중계로 측정 후 사진을 카톡방에 전송', role:ROLE_MGR, crit:true, due:'11:40', grace:20, ev:'kakao', deadline:'12:00' },
  { id:'t15', slot:'open', time:'11:50', sort:'11:50', title:'작업대·싱크·바닥·쓰레기 상태 정리', role:'주방' },
  { id:'t16', slot:'open', time:'오픈 전', sort:'11:58', title:'홀·주방 오픈 완료 최종 점검', role:ROLE_MGR },
  { id:'t17', slot:'open', time:'12:00', sort:'12:00', title:'와인잔·수저 정리 및 홀 집기 점검', role:'홀' },
  { id:'t18', slot:'open', time:'12:30', sort:'12:30', title:'수조·이끼 상태 확인', memo:'이끼 · 수온 · 여과기와 산소발생기 작동음 · 물 탁도 · 배관 누수 / 수온계 사진 카톡 전송', role:ROLE_MGR, crit:true, due:'12:30', grace:30, ev:'kakao', note:true },

  // ── 미들 (10 + 휴식) ──────────────────────────────────────
  // 15:00~16:00 은 휴식으로 비워 두고, 원래 이 시간에 있던 일은 16시 뒤로 밀었다
  { id:'t51', slot:'noon', time:'15:00', sort:'15:00', title:'휴식 (고객 없을 경우)', memo:'15:00~16:00 사이 고객이 없으면 교대로 쉽니다. 손님이 들어오면 바로 중단합니다.', role:'공통', rest:true },
  { id:'t20', slot:'noon', time:'16:00', sort:'16:00', title:'갑각류 중간체크', memo:'폐사 제거 · 활력 저하 개체 격리', role:ROLE_MGR, crit:true, due:'16:00', grace:30, ev:'deaths' },
  { id:'t27', slot:'noon', time:'16:00', sort:'16:00', title:'손님 빠진 자리 청소 및 재세팅', role:'홀' },
  { id:'t21', slot:'noon', time:'16:10', sort:'16:10', title:'저녁 예약 최종 확인 및 룸·좌석 재배정', role:ROLE_MGR },
  { id:'t25', slot:'noon', time:'16:10', sort:'16:10', title:'부족한 반찬·소스·사이드 메뉴 재준비', role:'주방' },
  { id:'t22', slot:'noon', time:'16:20', sort:'16:20', title:'저녁 피크용 갑각류·식재 재점검', role:ROLE_MGR, support:'주방' },
  { id:'t24', slot:'noon', time:'16:20', sort:'16:20', title:'소주·주류·음료·물병 여유분 정리', role:'홀', role2:'주방' },
  { id:'t29', slot:'noon', time:'16:30', sort:'16:30', title:'룸 벽면·오염 구역 청소', memo:'고객 사용한 좌석은 반드시 체크', role:'홀', role2:'주방' },
  { id:'t28', slot:'noon', time:'16:40', sort:'16:40', title:'예약 상차림 사전 준비', role:'주방', support:'홀' },
  { id:'t30', slot:'noon', time:'17:00', sort:'17:00', title:'재고·발주 필요 항목 체크', role:ROLE_MGR, support:'주방' },
  { id:'t32', slot:'noon', time:'17:00', sort:'17:00', title:'작업대·바닥·쓰레기 정리', role:'주방' },
  { id:'t55', slot:'noon', time:'17:00', sort:'17:01', title:'매장 입구·계단 불 켜기', memo:'입구 간판·계단 조명 ON · 안 켜지는 등이 있으면 트러블시트에 적기', role:ROLE_ANY, store:'anyang' },

  // ── 마감 (15) ─────────────────────────────────────────────
  { id:'t33', slot:'close', time:'20:00', sort:'20:00', title:'갑각류 중간체크', memo:'폐사 제거 · 활력 저하 개체 격리', role:ROLE_MGR, crit:true, due:'20:00', grace:30, ev:'deaths' },
  { id:'t34', slot:'close', time:'20:30', sort:'20:30', title:'테이블·의자·유아의자·티오더·카트 청소', role:'홀' },
  { id:'t35', slot:'close', time:'20:30', sort:'20:30', title:'작업대·화구·싱크·바닥 청소', role:'주방', support:ROLE_MGR },
  { id:'t36', slot:'close', time:'20:50', sort:'20:50', title:'룸 의자 정리 및 다음날 예약석 선세팅', role:'홀' },
  { id:'t37', slot:'close', time:'20:50', sort:'20:50', title:'식기 세척 및 다음날 오픈용 식기 정리', role:'주방' },
  { id:'t38', slot:'close', time:'21:00', sort:'21:00', title:'남은 식재 밀폐·냉장·폐기 정리', role:'주방' },
  { id:'t39', slot:'close', time:'21:10', sort:'21:10', title:'홀 바닥 쓸기·닦기', role:'홀' },
  { id:'t41', slot:'close', time:'21:20', sort:'21:20', title:'음식물·일반·재활용 분리수거 및 배출', role:'주방' },
  { id:'t42', slot:'close', time:'21:25', sort:'21:25', title:'주문 마감 안내 및 추가주문 최종 확인', role:ROLE_MGR, support:'홀' },
  { id:'t43', slot:'close', time:'21:30', sort:'21:30', title:'수조 최종 점검', memo:'갑각류·수족관 상태 · 폐사 개체 완전 제거 · 산소와 여과기 작동 · 수온 · 저울과 장비 OFF', role:ROLE_MGR, support:'주방', crit:true, due:'21:30', grace:30, ev:'deaths' },
  { id:'t44', slot:'close', time:'21:30', sort:'21:30', title:'가스·전기·냉장고 문·주방 전원 최종 확인', role:'주방', crit:true, due:'21:30', grace:30 },
  /* 안양점 전용 — store 가 있으면 그 매장에서만 목록에 들어간다 */
  { id:'t53', slot:'close', time:'21:35', sort:'21:35', title:'계단 쓸기 (10분)', memo:'외부 계단 빗자루로 쓸고 쓰레기·담배꽁초 정리 · 젖어 있으면 물기 제거', role:ROLE_ANY, store:'anyang' },
  { id:'t54', slot:'close', time:'21:45', sort:'21:45', title:'찜기 물 배출 (10분)', memo:'찜기 물 완전히 빼고 밸브 잠금 · 찜기 내부 헹굼 · 바닥 물기 정리', role:'주방', store:'anyang' },
  { id:'t47', slot:'close', time:'마감 후', sort:'22:10', title:'포스 마감·매출 정산·특이사항 기록', role:ROLE_MGR, crit:true, ev:'money', evLabel:'매출 금액' },
  { id:'t48', slot:'close', time:'마감 후', sort:'22:11', title:'갑각류·주류·소모품 잔량 및 발주 메모', role:ROLE_MGR, support:'주방', note:true },
  { id:'t49', slot:'close', time:'퇴점 전', sort:'22:19', title:'홀·주방 마감 완료 최종 확인', role:ROLE_MGR },
  { id:'t50', slot:'close', time:'퇴점 전', sort:'22:20', title:'전원·문잠금·냉난방·다음날 예약 시트작성', role:ROLE_MGR, crit:true },
];

/* 운영 방침 — 공지사항 필독 화면 맨 위에 보여주는 사장님 안내문 */
const POLICY_NOTE = [
  '요즘 안산점과 안양점 모두 업무 기준이 조금씩 흐려지고 일부 직원분들께 업무가 몰리는 경우가 생기고 있는 것 같습니다. 모두가 조금 더 공평하고 편하게 일할 수 있도록, 앞으로는 아래와 같은 일별 업무 체크리스트를 함께 운영해보려고 합니다.',
  '목표는 "규칙 속의 자유"를 유지 했으면 좋겠습니다.',
];

/* 기본 운영 룰 — 사장님 검토본(엑셀 '기본 운영 룰' 시트) 기준
   scope : 'all' = 두 매장 공통 / 'ansan' · 'anyang' = 그 매장에서만 보인다
   title : 한 줄 제목
   body  : 무엇을 어떻게 하는지 — 문단이 여럿이면 배열 (없으면 제목만)
   note  : 비고 — 굵게 따라붙는 부연 (없으면 생략)                            */
const BASE_RULES = [
  { scope:'all', title:'저녁 피크 시간대 흡연 제한',
    note:'저녁 피크 시간대(17:30~20:30)에는 흡연을 삼갑니다. 주말은 12:00~15:00 에도 삼갑니다.' },
  { scope:'all', title:'근무 중 개인 휴대폰 사용 안내',
    body:[
      '위생 관리와 고객 응대에 집중하기 위해, 근무 중에는 개인 휴대폰 사용을 최대한 자제해 주세요. 휴게 시간이나 업무용엔 자유롭게 사용하셔도 됩니다.',
      '가족 연락 등 급한 용무가 있을 때는 함께 일하는 동료에게 먼저 말씀해 주시고, 홀·주방을 벗어나 잠시 사용해 주세요. 예약 확인 등 업무상 필요한 사용은 예외입니다.',
    ],
    note:'체크리스트 업무를 완료하지 않은 상태에서 휴대폰을 장시간 사용하는 경우, 근무 태만으로 간주합니다. 간단히 본인 할 일 다 해두고 사용 시엔 아무도 터치 안 합니다.' },
  { scope:'all', title:'상호 존중과 바른 언어 사용',
    note:'바쁜 시간대일수록 홀과 주방 간 반말과 고성을 삼가고, 서로 존중하는 언어를 사용합니다.' },
  { scope:'all', title:'안전 구호 준수 및 사고 예방',
    body:'뜨거운 용기나 칼을 옮길 때, 바닥이 미끄러울 때에는 "뜨겁습니다", "지나갑니다" 등의 안전 구호를 반드시 외칩니다.',
    note:'안전사고 발생 시 안전 구호를 이행했는지 여부는 사고 경위와 책임 소재를 판단하는 기준이 될 수 있습니다.' },
  { scope:'all', title:'손 씻기 및 개인위생 철저',
    body:'근무 시작 전, 화장실 이용 후, 식기·식자재 취급 전후에는 반드시 손을 씻습니다.' },
  { scope:'all', title:'사용 물품 제자리 정리',
    body:'조리 도구, 조미료, 홀 집기 등 모든 물품은 사용 직후 지정된 위치에 둡니다.',
    note:'본인이 사용한 물품은 본인이 직접 정리하는 것을 원칙으로 합니다. 정리를 다른 직원에게 미루는 행위는 동료의 업무 부담을 가중시키므로 엄격히 금합니다.' },
  { scope:'all', title:'오염물 발견 즉시 청소',
    body:'바닥·작업대·테이블의 이물질과 액체는 교차 오염과 낙상 사고를 예방하기 위해 발견 즉시 제거합니다.' },
  { scope:'all', title:'업무 체크리스트 완료율 95% 이상',
    body:'일일 할 일 리스트는 모든 항목의 수행을 원칙으로 하며, 완료율 95% 이상을 목표로 합니다.',
    note:'업무를 수행하지 않고 완료로 체크하는 행위(허위 체크)가 확인될 경우 근무 태만으로 간주하며, 개별 인사평가에 반영합니다.' },

  // ── 안산점 전용 ──
  { scope:'ansan', title:'고객이 오고 갈 때 항상 큰소리로 인사합니다.' },

  // ── 안양점 전용 ──
  { scope:'anyang', title:'고객이 오고 갈 때 항상 큰소리로 인사합니다.' },
  { scope:'anyang', title:'룸 안내 시 성함 확인 → 룸 안내 순으로 반드시 이행합니다.',
    body:'그후 2층 인원에게 무전으로 공유합니다.',
    note:'그냥 2층으로 올라가라는 안내 형태는 절대 금지입니다.' },
  { scope:'anyang', title:'주방 전표가 나올 경우 조리 부문은 꼭 주방 벨지 꽂이에 꽂아둡니다.' },
  { scope:'anyang', title:'바쁜 시간대 찜기 알람이 울릴 경우, 알람을 끄는 게 목적이 아니라 반드시 담당자에게 완료되었다고 공유합니다.',
    body:'고객에게 음식이 늦어지지 않는 것을 원칙으로 합니다.' },
  { scope:'anyang', title:'갑각류 관리자 시간관리 엄수',
    body:'선주문을 받았을 경우 고객 착석 후 최대 10분 이내에 메인을 내는 것을 원칙으로 하며, 현장 주문 발생 시엔 최대 30분 이내에 메인 메뉴를 내는 것을 목표로 합니다.',
    note:'약간의 속도 업그레이드와 시간 계산이 주요 포인트이니 해당 역량 잘 길러주시기 바랍니다.' },
];

/* 근무 구간 (MORAK 구조) — adj: 인원 기준(2인/3인) 대비 필요 인원 보정, peak: 토·일·공휴일 +1
   실제 값은 앱의 운영 기준 화면에서 매장별로 고친다. */
const SEGMENTS_DEFAULT = [
  { key: 'prep',   name: '오픈준비', time: '10:30–11:30', adj: -1, peak: false },
  { key: 'lunch',  name: '점심',     time: '11:30–15:00', adj: 0,  peak: true },
  { key: 'dprep',  name: '저녁준비', time: '15:00–17:00', adj: -1, peak: false },
  { key: 'dinner', name: '저녁',     time: '17:00–20:30', adj: 0,  peak: true },
  { key: 'night',  name: '야간',     time: '20:30–22:00', adj: 0,  peak: false },
  { key: 'close',  name: '마감',     time: '22:00–22:30', adj: -1, peak: false },
];
/* 고용 형태 */
const EMP_TYPES = { regular: '정규·고정', fixed_part_time: '고정 파트타임', urgent: '긴급 지원', short: '단기 근무', part: '시간제', standby: '대기 인력', dispatch: '파견 근무' };
const EMP_TYPE_CLS = { regular: 'neutral', fixed_part_time: 'part', urgent: 'urgent', short: 'temporary', part: 'temporary', standby: 'waiting', dispatch: 'temporary' };
/* 공휴일 기본 등록 (2026) — 운영 기준 화면에서 고칠 수 있다 */
const HOLIDAYS_KR = [
  { date: '2026-01-01', name: '신정', type: '법정공휴일' },
  { date: '2026-02-16', name: '설날 연휴', type: '법정공휴일' }, { date: '2026-02-17', name: '설날', type: '법정공휴일' }, { date: '2026-02-18', name: '설날 연휴', type: '법정공휴일' },
  { date: '2026-03-01', name: '삼일절', type: '법정공휴일' }, { date: '2026-03-02', name: '대체공휴일', type: '대체공휴일' },
  { date: '2026-05-05', name: '어린이날', type: '법정공휴일' }, { date: '2026-05-24', name: '부처님오신날', type: '법정공휴일' }, { date: '2026-05-25', name: '대체공휴일', type: '대체공휴일' },
  { date: '2026-06-03', name: '지방선거', type: '임시공휴일' }, { date: '2026-06-06', name: '현충일', type: '법정공휴일' },
  { date: '2026-08-15', name: '광복절', type: '법정공휴일' }, { date: '2026-08-17', name: '대체공휴일', type: '대체공휴일' },
  { date: '2026-09-24', name: '추석 연휴', type: '법정공휴일' }, { date: '2026-09-25', name: '추석', type: '법정공휴일' }, { date: '2026-09-26', name: '추석 연휴', type: '법정공휴일' },
  { date: '2026-10-03', name: '개천절', type: '법정공휴일' }, { date: '2026-10-05', name: '대체공휴일', type: '대체공휴일' }, { date: '2026-10-09', name: '한글날', type: '법정공휴일' },
  { date: '2026-12-25', name: '성탄절', type: '법정공휴일' },
];

const DEFAULT_SETTINGS = {
  crew: 2,              // 편성이 없는 날 적용할 인원 기준 (2 | 3). 매장마다 다르다
  budget: 6,
  sound: true,
  askWho: true,        // true 면 체크할 때마다 완료자를 고른다
  reportAt: '21:30',    // 마감 리포트 시각 (PC를 22:00에 끄므로 그 전에)
  reportOff: false,
  tgToken: '',          // 텔레그램 봇 토큰 — 사장님이 직접 발급해 붙여넣는다
  tgChat: '',           // 보낼 대화방 ID (단체방은 음수)
  lastBackup: null,
  openTime: '11:00',
  closeTime: '22:00',
};

const DEFAULT_STAFF = [
  { id: 's1', name: '사장님', roles: [ROLE_MGR, '홀'], active: true },
  { id: 's2', name: '직원 1', roles: ['주방'], active: true },
];

/* 매장별 초기 구성 — 매장을 처음 열 때만 쓰인다.
   안산점은 관리자·홀·주방을 따로 두는 3인, 안양점은 매니저(관리자)가 홀을 겸하는 2인으로 돌린다.
   이미 쓰던 매장의 직원 명단은 건드리지 않는다. */
const STORE_SETUP = {
  ansan: {
    crew: 3,
    staff: [
      { id: 's1', name: '사장님',  roles: [ROLE_MGR], active: true },
      { id: 's2', name: '홀 1',    roles: ['홀'],   active: true },
      { id: 's3', name: '주방 1',  roles: ['주방'], active: true },
    ],
  },
  anyang: {
    crew: 2,
    staff: [
      { id: 's1', name: '매니저', roles: [ROLE_MGR, '홀'], active: true },
      { id: 's2', name: '주방 1', roles: ['주방'],       active: true },
    ],
  },
};
