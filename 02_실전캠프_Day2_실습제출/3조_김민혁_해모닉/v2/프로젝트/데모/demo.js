/* 해모닉 업무 체크리스트 — 데모판 스위치 + 가상 자료 만들기 (한 파일).
   이 파일이 먼저 실리면 앱은 서버에 붙지 않고, 저장소도 'haemonic-demo'로 따로 쓰며,
   매일 처음 열 때 가짜 두 매장(안산점·안양점) 자료를 "오늘 날짜 기준"으로 새로 만든다. 사장님 비밀번호 1234.

   숫자를 바꾸고 싶으면 아래 CFG 만 고치면 된다. 자료를 만드는 코드는 HM_DEMO_SEED 하나다.
   앱(app.js)은 demoSeed() 에서 이 함수를 부르고, 저장만 맡는다. */
window.HM_DEMO = true;

window.HM_DEMO_CFG = {
  pw: '1234',
  days: { tasks: 42, sales: 420, purchases: 56, crabHistory: 420, rosterBack: 42, rosterAhead: 14 },   // 매출·갑각류 매입은 14개월 — 명절 앞 단가 패턴·필요량(매입 인사이트)용. 할 일·식자재는 6~8주   // 오늘 기준 지난 6주 + 앞으로 2주 근무표
  staff: {   // 가상 이름 — 실제 직원 이름과 겹치지 않게 확인함(10/11)
    ansan: [
      { id: 'd1', name: '김하늘', roles: ['갑각류 관리자'], pay: { type: 'month', amount: 3200000 }, pattern: '오전·마감 (주 6일)' },
      { id: 'd2', name: '박서준', roles: ['홀 매니저'], pay: { type: 'hour', amount: 11000 }, pattern: '오후 조' },
      { id: 'd3', name: '이도윤', roles: ['주방 실장'], pay: { type: 'hour', amount: 11500 }, pattern: '오전 조' },
      { id: 'd4', name: '최유나', roles: ['고정알바'], pay: { type: 'hour', amount: 10500 }, pattern: '주말 고정알바' },
      { id: 'd5', name: '정민호', roles: ['주방 실장'], pay: { type: 'hour', amount: 11000 }, pattern: '오후 조' },
    ],
    anyang: [
      { id: 'd1', name: '한지우', roles: ['갑각류 관리자', '홀 매니저'], pay: { type: 'month', amount: 3000000 }, pattern: '매니저' },
      { id: 'd2', name: '오세린', roles: ['주방 실장'], pay: { type: 'hour', amount: 11000 }, pattern: '오전 조' },
      { id: 'd3', name: '윤태오', roles: ['홀 매니저', '고정알바'], pay: { type: 'hour', amount: 10500 }, pattern: '오후·주말' },
    ],
  },
  sales: {
    base: { ansan: 2600000, anyang: 1700000 },            // 평일 하루 총매출(원)
    weekday: { 0: 1.25, 1: 0.75, 2: 0.9, 3: 1, 4: 1.05, 5: 1.45, 6: 1.6 },   // 일~토
    holiday: 1.4, rain: 0.72, rainOffsets: [3, 11, 19, 27, 38, 47],      // 공휴일 ×1.4 · 비 오는 날(오늘 기준 n일 전) ×0.72
    holidays: ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25', '2026-09-24', '2026-09-25', '2026-09-26', '2027-02-06', '2027-02-07', '2027-02-08'],
    delivShare: [0.18, 0.28], takeShare: [0.04, 0.08], liquorOfStore: 0.16,
    avgTicket: { store: 98000, deliv: 72000 },           // 주문 1건 평균(원) → 주문 건수
    kgPer: { crab: 95000, king: 210000 },                 // 매출 1kg 당 원 → 판매 kg
    kgSplit: { deliv: 0.14, take: 0.06 },                 // kg 중 배달·포장 비율
  },
  purchases: {
    crabEvery: { ansan: 2, anyang: 3 }, crabKg: { ansan: 19, anyang: 12 }, crabUnit: [68000, 77000],
    kingProb: 0.6, kingKg: { ansan: 7, anyang: 4.5 }, kingUnit: [118000, 132000],
    spikeAgo: 5, spikeKg: 2.2, spikeUnit: 86000,          // 원가율 튄 날 — 주말 단체 예약 대비 대량 매입 + 시세 상승
    vendors: { crab: '데모수산', food: '데모상회', veg: '데모청과' },
    food: [['식자재', '양파·대파·마늘', 38000], ['식자재', '쌀 20kg', 62000], ['식자재', '버터·치즈', 45000], ['수산물', '전복·새우', 120000], ['주류·음료', '소주·맥주', 180000], ['소모품', '비닐장갑·랩·호일', 42000], ['식자재', '소스류', 56000], ['식자재', '계란 30구', 9000], ['소모품', '포장용기', 54000]],
    vegEvery: 3, vegItems: [['대파', 3500], ['쪽파', 4000], ['미나리', 3000]],   // 단 단위
  },
  tasks: {
    doneRate: [0.8, 0.98], todayRate: 0.93, lateProb: 0.12, noteProb: 0.85,
    missedCloseAgo: { ansan: 3, anyang: 4 },              // 마감 체크 빠진 날 — 리포트·7일 완료율에 보임
    subAgo: 2,                                            // 대타 근무한 날
    keepTodo: ['부족 여부', '룸 의자 정리', '분리수거'],      // 오늘은 이 업무를 남겨 둔다 — 시연 장면 1 (체크하기)
    notes: {   // 업무 제목에 들어 있는 말 → 메모 예시
      '부족': ['소주 2박스 부족 — 발주함', '랩·호일 바닥 — 내일 입고', '소스 재고 넉넉', '포장용기 1박스 남음 — 주문함'],
      '수조': ['수온 11.8℃ · 이끼 조금', '여과기 소리 정상 · 수온 12.1℃', '산소발생기 점검 · 이상 없음', '물 탁해서 해수 교체 당김'],
      '갑각류': ['전부 활력 좋음', '킹크랩 1마리 활력 저하 — 먼저 사용', '대게 다리 빠진 것 2마리 포장용으로', '이상 없음 · 사진 카톡 전송'],
      '정산': ['카드 매출 포스와 일치', '현금 2,000원 차이 — 거스름돈 실수', '배달 정산 확인', '이상 없음'],
      '청소': ['바닥 물기까지 닦음', '기름기 세제로 한 번 더', '화구 분리 세척', '정상 완료'],
      '쓰레기': ['음식물 2봉 · 재활용 분리', '봉투 교체', '정상 완료'],
      '예약': ['내일 룸 2팀 예약 세팅', '단체 12명 예약 — 룸 합침', '예약 없음'],
      '가스': ['가스 밸브·냉장고 문 확인', '주방 전원 OFF 확인'],
    },
    notesDefault: ['특이사항 없음', '정상 완료', '확인 완료 · 이상 없음', '사진 찍어 단톡방 공유', '부족분 바로 채움', '평소보다 오래 걸림 — 손님 몰림', '같이 한 사람과 나눠서 끝냄', '처음 해 봐서 매니저에게 물어보고 함'],
  },
  tanks: {   // [수조번호-칸]: [품종, 라벨, 마리, kg, n일 전 입고]
    ansan: { '1-top': [['대게', '러시아', 14, 18.2, 2], ['대게', '국내산', 6, 7.1, 1]], '1-bottom': [['대게', '러시아', 9, 11.6, 3]], '2-top': [['킹크랩', '레드', 5, 12.4, 2], ['킹크랩', '브라운', 4, 8.9, 1]], '2-bottom': [['랍스터', '', 12, 7.2, 4]], '3-top': [['대게', '러시아', 11, 14.3, 1]], '3-bottom': [['대게', '국내산', 5, 5.8, 2]], '4-top': [['킹크랩', '레드', 3, 7.8, 5]], '4-bottom': [['랍스터', '', 6, 3.6, 1]] },
    anyang: { '1-top': [['대게', '러시아', 10, 12.8, 1]], '1-bottom': [['대게', '러시아', 7, 8.9, 3]], '2-top': [['킹크랩', '레드', 3, 7.4, 2], ['킹크랩', '브라운', 2, 4.6, 2]], '2-bottom': [['대게', '국내산', 4, 4.7, 1]], '3-top': [['킹크랩', '레드', 2, 5.1, 4]], '3-bottom': [['랍스터', '', 8, 4.9, 5]] },
    count: { ansan: 4, anyang: 3 },
  },
  health: { issuedAgo: [320, 40, 350, null, 200], memo: { 0: { ansan: '상록수보건소', anyang: '동안구보건소' }, 2: '만료 전 재발급 예약함' } },   // null = 미등록
  scenes: [   // 시연 장면 3개 — 발표·캡처용 (데모 안내 줄에도 나온다)
    { n: 1, title: '할 일 체크 → 이름 → "어떻게 했나요"', view: 'today', why: '누가 무엇을 어떻게 했는지 그날 바로 남는다' },
    { n: 2, title: '폐사 기록 → 3일 사용 기한 → 사용 완료', view: 'tanks', why: '폐사한 갑각류를 3일 안에 쓰게 직원이 바로 알아본다' },
    { n: 3, title: '오류 신고 → 접수 목록 → 처리 완료', view: 'guide', why: '직원 신고가 앱 안에 쌓이고 그날 고쳐진다' },
  ],
};

/* api: 앱 내부 도우미 (app.js demoSeed 가 넘겨준다) */
window.HM_DEMO_SEED = async function (api) {
  const C = window.HM_DEMO_CFG;
  const { dateKey, shift, nowMin, minutesOf, pad, newId, TANK_DEFAULT, ROUTINE_VER, ROLE_MGR, DEMO_VER, monthNow } = api;
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const today = dateKey(), now = nowMin(), mon = monthNow();
  const wdOf = (k) => new Date(k + 'T00:00:00').getDay();
  const isHoliday = (k) => C.sales.holidays.includes(k.slice(5)) || C.sales.holidays.includes(k);
  const isRain = (k) => C.sales.rainOffsets.some((n) => shift(today, -n) === k);
  const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const docs = {};

  for (const st of ['ansan', 'anyang']) {
    const R = rng(st === 'ansan' ? 17 : 29);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const S = api.freshState(st); api.setS(S);
    const storeName = st === 'ansan' ? '안산점' : '안양점';
    S.created = shift(today, -C.days.rosterBack);
    S.staff = C.staff[st].map((x) => ({ id: x.id, name: x.name, roles: x.roles.slice(), pay: x.pay, active: true }));
    S.settings = { ...S.settings, askWho: true, askWhoV2: 1, reportAt: '21:50', reportAtV2: 1, doneMemo: 'req', staffLock: true, crew: st === 'ansan' ? 3 : 2 };
    S.routineVer = ROUTINE_VER;
    S.demo = { ver: DEMO_VER, day: today };
    const mgr = S.staff[0], rest = S.staff.slice(1);

    /* 근무 편성 — 지난 6주 · 앞으로 2주. 오전 조·오후 조·주말 알바 패턴 */
    for (let i = -C.days.rosterBack; i <= C.days.rosterAhead; i++) {
      const k = shift(today, i), wd = wdOf(k), busy = wd === 5 || wd === 6 || isHoliday(k);
      let am, pm;
      if (st === 'ansan') {
        const [hall1, kit1, hallWk, kit2] = rest;   // 박서준(오후) · 이도윤(오전) · 최유나(주말) · 정민호(오후)
        am = [mgr, kit1, busy ? hallWk : hall1];
        pm = [mgr, hall1, kit2].concat(busy ? [hallWk] : []);
        if (wd === 2) am = [kit1, hall1];   // 화요일은 관리자 휴무
        if (wd === 2) pm = [hall1, kit2];
      } else {
        const [kit, hallKit] = rest;
        am = [mgr, kit]; pm = [mgr, hallKit].concat(busy ? [kit] : []);
        if (wd === 1) { am = [kit, hallKit]; pm = [hallKit, kit]; }   // 월요일은 매니저 휴무
      }
      const sub = i === -C.tasks.subAgo && st === 'ansan';
      if (sub) pm = pm.concat([rest[2]]);   // 대타: 박서준 휴가 → 최유나가 대신 (박서준은 휴가·부재로 표시)
      api.applyShiftDay(k, [...new Set(am.map((x) => x.name))], [...new Set(pm.map((x) => x.name))]);
      if (sub) { const dd = (api.schedOf().days || {})[k]; if (dd) Object.values(dd.segs).forEach((seg) => { if (seg.workers.some((w) => w.name === rest[0].name)) seg.leave = [rest[0].name]; }); }
    }

    /* 할 일 기록 — 지난 6주 + 오늘(지금 시각 이전 것만). 메모는 업무 종류에 맞게 */
    const noteFor = (t) => { const key = Object.keys(C.tasks.notes).find((kw) => (t.title || '').includes(kw)); return pick(key ? C.tasks.notes[key] : C.tasks.notesDefault); };
    const missedAgo = C.tasks.missedCloseAgo[st];
    for (let i = C.days.tasks; i >= 0; i--) {
      const k = shift(today, -i), day = api.ensureDay(k);
      const crew = (S.roster[k] || []).map((e) => S.staff.find((x) => x.id === e.staffId)).filter(Boolean);
      const pDay = i === 0 ? C.tasks.todayRate : C.tasks.doneRate[0] + R() * (C.tasks.doneRate[1] - C.tasks.doneRate[0]);
      const closeIds = Object.keys(day.inst).filter((id) => (api.tpl(id) || {}).slot === 'close' && day.inst[id].s === 'todo').sort((a, b) => (api.tpl(a).sort || '').localeCompare(api.tpl(b).sort || ''));
      Object.keys(day.inst).forEach((tid) => {
        const rec = day.inst[tid], t = api.tpl(tid); if (!t || rec.s !== 'todo' || t.rest) return;
        const m = minutesOf(t.sort); if (m == null) return;
        if (i === 0 && m > now - 5) return;
        if (i === 0 && C.tasks.keepTodo.some((kw) => (t.title || '').includes(kw))) return;   // 시연용으로 남겨 둠
        if (i === missedAgo && closeIds.slice(-3).includes(tid)) {   // 마감 체크 빠진 날: 마지막 3개 중 1개는 건너뜀, 2개는 안 함
          if (tid === closeIds[closeIds.length - 3]) { rec.s = 'skip'; rec.reason = '단체 손님 마감 늦어짐'; rec.by = (crew[0] || mgr).name; rec.at = '21:40'; }
          return;
        }
        if (R() > (t.crit ? Math.min(0.98, pDay + 0.08) : pDay)) return;
        const late = R() < C.tasks.lateProb ? 35 + Math.floor(R() * 40) : Math.floor(R() * 22) - 4;
        const at = Math.max(0, Math.min(23 * 60 + 50, m + late));
        const who = pick(crew.length ? crew : S.staff);
        rec.s = 'done'; rec.by = who.name; rec.at = hhmm(at);
        if (R() < C.tasks.noteProb) rec.note = noteFor(t);
        if (t.ev === 'deaths') rec.ev = { 대게: R() < 0.1 ? 1 : 0, 킹크랩: R() < 0.04 ? 1 : 0, 랍스터: 0 };
      });
    }

    /* 매출 — 지난 8주. 요일·공휴일·비 오는 날에 따라 다르고, 하루는 미입력 */
    S.sales = {};
    const SC = C.sales, base = SC.base[st];
    for (let i = C.days.sales; i >= 1; i--) {
      const k = shift(today, -i), wd = wdOf(k);
      if (i === 6) continue;   // 미입력 하루 — 매출 입력 화면 "미입력" 칸에 보인다
      let mul = SC.weekday[wd] || 1; if (isHoliday(k)) mul *= SC.holiday; if (isRain(k)) mul *= SC.rain;
      const tot = Math.round(base * mul * (0.86 + R() * 0.28) / 1000) * 1000;
      const deliv = Math.round(tot * (SC.delivShare[0] + R() * (SC.delivShare[1] - SC.delivShare[0])) / 100) * 100;
      const take = Math.round(tot * (SC.takeShare[0] + R() * (SC.takeShare[1] - SC.takeShare[0])) / 100) * 100;
      const store = tot - deliv - take;
      const oS = Math.round(store / SC.avgTicket.store), oD = Math.round(deliv / SC.avgTicket.deliv);
      const crab = Math.round(tot / SC.kgPer.crab * 10) / 10, king = Math.round(tot / SC.kgPer.king * 10) / 10, lob = Math.round(R() * 3 * 10) / 10;
      const sp = (v) => { const d1 = Math.round(v * SC.kgSplit.deliv * 10) / 10, p1 = Math.round(v * SC.kgSplit.take * 10) / 10; return [Math.round((v - d1 - p1) * 10) / 10, d1, p1]; };
      const [crabS, crabD, crabP] = sp(crab), [kingS, kingD, kingP] = sp(king);
      const cash = Math.round(store * (0.08 + R() * 0.1) / 10000) * 10000, transfer = R() < 0.35 ? Math.round(store * 0.04 / 10000) * 10000 : null, voucher = R() < 0.25 ? 50000 * (1 + Math.floor(R() * 3)) : null, gifticon = R() < 0.15 ? 30000 : null;   // 결제 수단 (포스 정산 메시지)
      S.sales[k] = { orders: oS + oD, ordersS: oS, ordersD: oD, store, deliv, take, total: tot, liquor: Math.round(store * SC.liquorOfStore / 100) * 100, crab, king, lob, crabS, crabD, crabP, kingS, kingD, kingP, lobS: lob, lobD: 0, lobP: 0,
        cash, transfer, voucher, gifticon, petty: 50000, priceCrab: 100000 + Math.round(R() * 12) * 1000, priceKing: 128000 + Math.round(R() * 10) * 1000, priceLob: 118000 + Math.round(R() * 8) * 1000,
        note: i === 2 ? '잔돈 없어 직원에게 1만원 빌림 — 내일 갚기' : voucher ? '상품권 손님 ' + (voucher / 50000) + '팀' : undefined, by: pick(S.staff).name, at: k + ' 21:40', src: 'demo' };
      const d = S.days[k]; const mt = S.templates.find((x) => x.ev === 'money'); if (d && mt && d.inst[mt.id] && d.inst[mt.id].s === 'done') d.inst[mt.id].ev = tot;
    }

    /* 매입 — 갑각류(2~3일마다, 하루는 대량 매입으로 원가율이 튐) + 식자재 + 야채('단') */
    S.purchases = [];
    const PC = C.purchases;
    const row = (o) => S.purchases.push({ id: newId('p'), vendor: PC.vendors.food, memo: '', by: pick(S.staff).name, createdAt: Date.now(), src: 'demo', ...o });
    for (let i = C.days.crabHistory; i >= 0; i--) {
      const k = shift(today, -i);
      if (i > C.days.purchases) {   // 오래된 기간은 갑각류만, 명절 2주 전은 단가 10~15% 높게
        const nearEv0 = i % 4 === 0; if (nearEv0) { const nearEv = C.sales.holidays.some((hd) => { const ev = hd.length === 5 ? k.slice(0, 4) + '-' + hd : hd; const dd = (new Date(ev + 'T00:00:00') - new Date(k + 'T00:00:00')) / 864e5; return dd >= 0 && dd <= 14; }); const kg = Math.round(PC.crabKg[st] * (0.8 + R() * 0.4) * 10) / 10, unit = Math.round((PC.crabUnit[0] - 6000 + R() * 9000) * (nearEv ? 1.12 : 1) + (C.days.crabHistory - i) * 12); row({ date: k, cat: '대게', name: '대게(러시아)', qty: kg, unit: 'kg', amount: Math.round(kg * unit / 100) * 100, vendor: PC.vendors.crab, by: mgr.name }); }
        if (i % 12 === 5) { const lk = Math.round((st === 'ansan' ? 4 : 2.5) * (0.8 + R() * 0.4) * 10) / 10; row({ date: k, cat: '랍스터', name: '랍스터(캐나다)', qty: lk, unit: 'kg', amount: Math.round(lk * (52000 + R() * 8000) / 100) * 100, vendor: PC.vendors.crab, by: mgr.name }); }
        if (i % 8 === 2) { const kk = Math.round(PC.kingKg[st] * (0.8 + R() * 0.4) * 10) / 10, ku = PC.kingUnit[0] - 8000 + Math.round(R() * 16000); row({ date: k, cat: '킹크랩', name: '킹크랩', qty: kk, unit: 'kg', amount: Math.round(kk * ku / 100) * 100, vendor: PC.vendors.crab, by: mgr.name }); }
        continue;
      }
      if (i % PC.crabEvery[st] === 0) {
        const spike = i === PC.spikeAgo;
        const kg = Math.round(PC.crabKg[st] * (spike ? PC.spikeKg : 0.8 + R() * 0.4) * 10) / 10, unit = spike ? PC.spikeUnit : PC.crabUnit[0] + Math.round(R() * (PC.crabUnit[1] - PC.crabUnit[0]) + (C.days.purchases - i) * 60);
        row({ date: k, cat: '대게', name: '대게(러시아)', qty: kg, unit: 'kg', amount: Math.round(kg * unit / 100) * 100, vendor: PC.vendors.crab, by: mgr.name, memo: spike ? '주말 단체 예약 대비 — 시세 올라 단가 높음' : '' });
        if (R() < PC.kingProb) { const kk = Math.round(PC.kingKg[st] * (0.8 + R() * 0.4) * 10) / 10, ku = PC.kingUnit[0] + Math.round(R() * (PC.kingUnit[1] - PC.kingUnit[0])); row({ date: k, cat: '킹크랩', name: '킹크랩', qty: kk, unit: 'kg', amount: Math.round(kk * ku / 100) * 100, vendor: PC.vendors.crab, by: mgr.name }); }
      }
      if (i % 12 === 5) { const lk = Math.round((st === 'ansan' ? 4 : 2.5) * (0.8 + R() * 0.4) * 10) / 10; row({ date: k, cat: '랍스터', name: '랍스터(캐나다)', qty: lk, unit: 'kg', amount: Math.round(lk * (52000 + R() * 8000) / 100) * 100, vendor: PC.vendors.crab, by: mgr.name }); }
      if (i % PC.vegEvery === 0) { const v = pick(PC.vegItems), q = 2 + Math.floor(R() * 3); row({ date: k, cat: '식자재', name: v[0], qty: q, unit: '단', amount: q * v[1], vendor: PC.vendors.veg }); }
      if (i % 2 === 1) { const f = pick(PC.food); row({ date: k, cat: f[0], name: f[1], qty: null, unit: 'kg', amount: Math.round(f[2] * 1.6 * (0.85 + R() * 0.3) / 100) * 100 }); }
    }

    /* 수조 — 칸마다 묶음 여러 개(레드·브라운 섞임), 입고·꺼내기·옮기기 이력, 폐사(오늘 1건은 아직 처리 전) */
    const T = TANK_DEFAULT(); T.count = C.tanks.count[st]; T.items = []; T.care = []; T.log = [];
    for (let n = 1; n <= T.count; n++) {
      const w = shift(today, -(2 + n * 2)), c = shift(today, -(8 + n * 7));
      T.items.push({ n, water: { date: w, by: mgr.name }, clean: { date: c, by: mgr.name } });
      T.care.push({ id: 'cw' + n, date: w, n, kind: 'water', by: mgr.name }, { id: 'cc' + n, date: c, n, kind: 'clean', by: mgr.name });
    }
    const lotRows = [];
    Object.entries(C.tanks[st]).forEach(([key, arr]) => {
      const [n, pos] = key.split('-'); const it = T.items[Number(n) - 1]; if (!it) return;
      if (!it[pos]) it[pos] = { lots: [] };
      arr.forEach(([species, label, qty, kg, ago], j) => { const l = { id: `lt${n}${pos}${j}`, species, label, qty, kg, date: shift(today, -ago), dead: 0, by: mgr.name }; it[pos].lots.push(l); lotRows.push([Number(n), pos, l]); });
    });
    lotRows.sort((a, b) => a[2].date.localeCompare(b[2].date)).forEach(([n, pos, l]) => T.log.push({ id: 'lg' + l.id, date: l.date, n, pos, kind: 'in', species: l.species, label: l.label, qty: l.qty, kg: l.kg, dead: 0, by: l.by, at: '11:20', note: '' }));
    T.log.push({ id: 'lgout1', date: shift(today, -1), n: 1, pos: 'bottom', kind: 'out', species: '대게', label: '러시아', qty: 8, kg: 10.4, dead: 0, by: mgr.name, at: '18:40', note: '주말 판매분 소진' });
    T.log.push({ id: 'lgmv1', date: today, n: 2, pos: 'top', kind: 'move', species: '킹크랩', label: '레드', qty: 3, kg: 7.4, dead: 0, by: mgr.name, at: '10:05', note: '하단 → 상단 (수온 안정 칸으로)' });
    S.tanks = T;
    S.deaths = [
      { id: 'dd1', date: shift(today, -1), sp: '대게', n: 2, tank: '2', note: '활력 저하 후 폐사', by: mgr.name, at: shift(today, -1) + ' 16:05' },
      { id: 'dd2', date: today, sp: '킹크랩', n: 1, tank: '2', note: '아침 확인 때 뒤집혀 있음', by: mgr.name, at: today + ' 11:10' },   // 오늘 폐사 — 시연 장면 2 (사용 완료 처리)
    ];
    S.deadUse = {};
    api.deadEntries(30).forEach((e) => { if (e.date < shift(today, -1)) S.deadUse[e.key] = { at: e.date + ' 18:30', by: mgr.name, how: pick(['찜 요리로 사용', '직원 식사', '폐기 — 상태 나쁨']) }; });

    /* 보건증 · 위생교육 · 사업장 정보 */
    S.health = S.staff.map((x, idx) => { const ago = C.health.issuedAgo[idx]; const m = C.health.memo[idx]; return { id: 'h:' + x.id, staffId: x.id, name: x.name, issued: ago == null ? '' : shift(today, -ago), memo: m ? (typeof m === 'string' ? m : m[st]) : '' }; });
    S.hygiene = { owner: { done: shift(today, -210), every: 12, org: '한국외식업중앙회', memo: '온라인 보수교육' }, staff: { d2: { done: shift(today, -100), memo: '' }, d3: { done: shift(today, -330), memo: '다음 달 재교육' } } };
    S.settings.biz = { name: '해모닉 ' + storeName, rep: '김데모', reg: '000-00-00000', addr: st === 'ansan' ? '경기 안산시 상록구 데모로 12' : '경기 안양시 동안구 데모대로 34', phone: st === 'ansan' ? '031-000-0001' : '031-000-0002' };

    /* 공지 · 교육 진도 · 퀴즈 · 미션 */
    const subDay = shift(today, -C.tasks.subAgo);
    S.notices = [
      { id: 'n1', month: mon, title: '이번 달 목표 — 할 일 완료율 95%', body: '중요 표시 업무는 시간대 시작할 때 먼저 끝냅니다.', pin: true, by: mgr.name, createdAt: Date.now() - 864e5 * 6 },
      { id: 'n2', month: mon, title: '주말 단체 예약 많음 — 룸 세팅 30분 일찍', body: '금·토 17:00 전까지 룸 세팅 완료', pin: false, by: mgr.name, createdAt: Date.now() - 864e5 * 2 },
      ...(st === 'ansan' ? [{ id: 'n3', month: subDay.slice(0, 7), title: `${Number(subDay.slice(5, 7))}/${Number(subDay.slice(8))} 오후 대타 — 박서준 → 최유나`, body: '박서준 개인 사정. 오후 조 홀은 최유나가 대신 근무.', pin: false, by: mgr.name, createdAt: Date.now() - 864e5 * C.tasks.subAgo - 3600e3 * 5 }] : []),
    ];
    api.seedTraining(true);
    const urls = (S.training || []).map((x) => x.url).filter(Boolean);
    S.trainDone = {}; S.trainQuiz = {};
    S.staff.forEach((x, idx) => { S.trainDone[x.name] = {}; S.trainQuiz[x.name] = {}; urls.slice(0, Math.max(idx === S.staff.length - 1 ? 0 : 2, 9 - idx * 2)).forEach((u, j) => { S.trainDone[x.name][u] = shift(today, -(j + 1)); if (api.quizOf(u)) S.trainQuiz[x.name][u] = { tries: j % 3 === 0 ? 2 : 1, at: shift(today, -(j + 1)) }; }); });   // 마지막 직원은 아직 한 편도 안 봄
    // 첫 코스는 관리자가 완주(배지 1) — 대시보드·랭킹에 배지가 보이게
    (api.trackSteps(api.TRAIN_TRACKS[0]) || []).forEach((u, j) => { S.trainDone[mgr.name][u] = shift(today, -(20 - j)); if (api.quizOf(u)) S.trainQuiz[mgr.name][u] = { tries: 1, at: shift(today, -(20 - j)) }; });
    S.missions = S.staff.slice(1, 4).map((x, j) => ({ id: 'ms' + j, who: x.name, text: ['손님 오시면 3초 안에 인사하기', '퇴근 전 작업대 물기까지 닦기', '대게 손질 순서 외워서 혼자 해 보기'][j] || '오늘 배운 것 적용하기', cat: '서비스', month: mon, createdAt: Date.now() - 864e5 * (j + 1), status: ['done', 'claimed', 'open'][j] || 'open', doneAt: j === 0 ? Date.now() - 864e5 : undefined }));
    if (st === 'ansan') S.missions.push({ id: 'ms9', who: '박서준', text: '외국인 손님 알레르기 질문 — 영어 안내문 만들어 카운터에 두기', cat: '서비스', month: mon, createdAt: Date.now() - 3600e3 * 30, status: 'open' });
    /* 레시피 4개 */
    S.recipes = [
      { id: 'r1', name: '대게찜 (2인)', cat: '대게', ingredients: '대게 1.2kg\n청주 50ml\n물 1L', steps: '1. 수조에서 꺼내 찬물에 10분 기절\n2. 배가 위로 가게 찜기에 올림\n3. 센 불 15분 → 불 끄고 3분 뜸\n4. 다리 가위로 손질해 접시에 부채꼴로', tip: '배를 위로 해야 게장이 안 흐른다. 찌는 중에 뚜껑 열지 않기', updatedAt: Date.now() - 864e5 * 12, by: mgr.name },
      { id: 'r2', name: '킹크랩찜 (3~4인)', cat: '킹크랩', ingredients: '킹크랩 2.5kg\n청주 80ml', steps: '1. 기절 10분\n2. 찜기 배 위로, 센 불 22분\n3. 뜸 5분 후 몸통·다리 분리', tip: '레드와 브라운은 같은 시간. 2.5kg 넘으면 3분 추가', updatedAt: Date.now() - 864e5 * 9, by: mgr.name },
      { id: 'r3', name: '게딱지 볶음밥', cat: '사이드', ingredients: '밥 1공기\n게 내장·살 2큰술\n김가루·참기름·날치알', steps: '1. 게딱지에 밥 넣고 내장과 비빔\n2. 버터 두른 팬에 2분 볶음\n3. 김가루·날치알 올려 딱지째 서빙', tip: '내장 양이 적으면 참기름 반 큰술 더', updatedAt: Date.now() - 864e5 * 6, by: S.staff[S.staff.length - 1].name },
      { id: 'r4', name: '초간장 (게 찍는 장)', cat: '소스·장', ingredients: '간장 100ml\n식초 40ml\n설탕 1큰술\n레몬즙 약간', steps: '1. 재료 섞어 설탕 녹임\n2. 냉장 보관 3일', tip: '랍스터는 버터소스 따로', updatedAt: Date.now() - 864e5 * 20, by: mgr.name },
    ];
    /* 지난달 급여 확정 — 근무표 합계 그대로 (근무 기록 합계 = 급여) */
    const prevM = (() => { const d = new Date(today.slice(0, 4), Number(today.slice(5, 7)) - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();
    try { const L = api.laborCalc(prevM); if (L && L.rows.length) { S.payroll = { [prevM]: { at: shift(today, -Number(today.slice(8)) + 3) + ' 10:30', by: '사장님', sig: L.sig, rows: L.rows, total: L.total } }; } } catch (e) { console.warn('데모 급여 확정 실패', e); }
    /* 대표자 도장 — 예시 이미지(그림으로 그린 것) */
    const seal = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><circle cx='80' cy='80' r='70' fill='none' stroke='#c8372d' stroke-width='6'/><text x='80' y='72' text-anchor='middle' font-family='serif' font-size='40' font-weight='700' fill='#c8372d'>해모닉</text><text x='80' y='112' text-anchor='middle' font-family='serif' font-size='28' fill='#c8372d'>김데모</text><text x='80' y='150' text-anchor='middle' font-family='sans-serif' font-size='11' fill='#999'>예시 이미지</text></svg>`;
    S.settings.seal = api.putBlob('seal', 'data:image/svg+xml;utf8,' + encodeURIComponent(seal));
    /* 근로계약서 — 한 명은 초안(진행 중) */
    S.contracts = [];
    try { const c = api.newContract(S.staff[1]); c.f.start = shift(today, -40); c.f.pay = S.staff[1].pay.amount; c.by = mgr.name; } catch (e) { console.warn('데모 계약서 실패', e); }
    docs[st] = S;
  }

  /* 두 매장 공용 — 사장님 비밀번호 · 게시판 (직원 신고와 처리 완료 이력, 컴플레인, 외국인 손님 질문) */
  const h = await api.hashPw(C.pw), t0 = Date.now();
  const shared = { owner: { hash: h, at: t0 }, issues: [
    { id: 'i1', cat: '앱 오류', title: '할 일 체크가 가끔 풀림', body: '📍 어느 화면 : 업무 › 할 일 › 미들\n👆 무엇을 눌렀나 : 갑각류 중간체크 완료\n❗ 어떻게 됐나 : 체크됐다가 2초 뒤 풀림\n✅ 이렇게 되면 좋겠다 : 한 번 누르면 그대로\n📱 기기 : 매장 아이패드\n🔁 다시 해도 같은가 : 가끔', status: 'done', replies: [{ text: '다른 기기 저장이 올 때 화면이 초기화되던 문제 — 고쳤습니다', by: '사장님', at: t0 - 864e5, fix: true }], by: '박서준', anon: false, createdAt: t0 - 864e5 * 2, store: '안산점', updatedAt: t0 - 864e5 },
    { id: 'i2', cat: '앱 건의', title: '근무표에 내 이름 눌러서 넣기', body: '📍 어느 화면 : 인사관리 › 월간 근무표\n❗ 어떻게 됐나 : 이름을 매번 타자로 침\n✅ 이렇게 되면 좋겠다 : 직원 명단에서 눌러서 넣기', status: 'done', replies: [{ text: '직원 칩으로 바꿨습니다', by: '사장님', at: t0 - 864e5 * 3, fix: true }], by: '', anon: true, team: true, createdAt: t0 - 864e5 * 4, store: '안양점', updatedAt: t0 - 864e5 * 3 },
    { id: 'i3', cat: '앱 오류', title: '폐사 기록 후 3일 표시가 안 보임', body: '📍 어느 화면 : 업무 › 수조 관리표\n❗ 어떻게 됐나 : 폐사 적었는데 사용 기한 표시 없음\n📱 기기 : 매장 포스', status: 'open', replies: [], by: '오세린', anon: false, createdAt: t0 - 3600e3 * 5, store: '안양점', updatedAt: t0 - 3600e3 * 5 },
    { id: 'i5', cat: '수조·상품', title: '2번 수조 킹크랩 레드·브라운 같이 들어옴', body: '한 칸에 두 종류라 따로 적고 싶음. 오늘 입고 레드 5미 · 브라운 4미', status: 'done', replies: [{ text: '수조 칸마다 묶음을 여러 개 넣을 수 있게 바꿨습니다. 입고 추가로 따로 적어 주세요', by: '사장님', at: t0 - 3600e3 * 20, fix: true }], by: '한지우', anon: false, createdAt: t0 - 864e5 - 3600e3 * 2, store: '안양점', updatedAt: t0 - 3600e3 * 20 },
    { id: 'i6', cat: '앱 오류', title: '보건증 메모 적으면 사라짐', body: '📍 어느 화면 : 업무 › 보건증 관리\n👆 무엇을 눌렀나 : 메모 칸에 보건소 이름 입력\n❗ 어떻게 됐나 : 날짜 넣으니 메모가 지워짐\n📱 기기 : 매장 포스', status: 'done', replies: [{ text: '기기마다 기록이 따로 생겨 합쳐질 때 빈 쪽이 보이던 문제 — 직원당 하나로 합치고 메모는 즉시 저장되게 고쳤습니다', by: '사장님', at: t0 - 3600e3 * 6, fix: true }], by: '최유나', anon: false, createdAt: t0 - 3600e3 * 9, store: '안산점', updatedAt: t0 - 3600e3 * 6 },
    { id: 'i7', cat: '앱 건의', title: '매입 단위에 "단" 추가', body: '📍 어느 화면 : 운영 › 원가 관리 › 매입 입력\n✅ 이렇게 되면 좋겠다 : 파 두 단처럼 단 단위로 적고 싶음', status: 'done', replies: [{ text: '단위 목록에 단을 넣었습니다', by: '사장님', at: t0 - 864e5 * 2, fix: true }], by: '', anon: true, team: true, createdAt: t0 - 864e5 * 2 - 3600e3, store: '안산점', updatedAt: t0 - 864e5 * 2 },
    { id: 'i8', cat: '고객 컴플레인', title: '룸 3번 — 대게 다리 빠져 있다고 불만', body: '찜 나갈 때 다리 2개 떨어져 있었음. 사과 후 랍스터 반 마리 서비스. 배달앱 리뷰 1점 달림 → 사장님 답글 필요', status: 'open', replies: [{ text: '손질 때 다리 묶는 순서 교육 영상 다시 보게 할게요. 리뷰 답글은 내가 답니다', by: '김하늘', at: t0 - 3600e3 * 3 }], by: '박서준', anon: false, createdAt: t0 - 3600e3 * 4, store: '안산점', updatedAt: t0 - 3600e3 * 3 },
    { id: 'i9', cat: '서비스', title: '외국인 손님이 갑각류 알레르기·소스 재료 물어봄', body: '영어로 설명이 안 돼서 번역앱으로 함. 영어 안내문(알레르기·소스 재료·조리법) 있으면 좋겠음', status: 'open', replies: [{ text: '개인 미션으로 걸었습니다. 안내문 초안은 사장님이 보내 드릴게요', by: '한지우', at: t0 - 3600e3 * 26 }], by: '윤태오', anon: false, createdAt: t0 - 3600e3 * 28, store: '안양점', updatedAt: t0 - 3600e3 * 26 },
    { id: 'i10', cat: '직원·교육', title: '오전 조 지각 2회 — 오픈 준비가 늦어짐', body: '이번 주 두 번 11:10 넘어 도착. 수조 확인이 밀려서 12:30 갑각류 점검이 늦게 됨. 근무표 조정 상의 요청', status: 'open', replies: [], by: '', anon: true, team: true, createdAt: t0 - 864e5 - 3600e3 * 6, store: '안산점', updatedAt: t0 - 864e5 - 3600e3 * 6 },
    { id: 'i4', cat: '시설·장비', title: '2번 수조 산소발생기 소리 큼', body: '어제부터 덜덜거림. 업체 점검 필요해 보임', status: 'open', replies: [{ text: '내일 오전 업체 방문 예정', by: '김하늘', at: t0 - 3600e3 * 2 }], by: '이도윤', anon: false, createdAt: t0 - 864e5, store: '안산점', updatedAt: t0 - 3600e3 * 2 },
  ] };
  return { docs, shared };
};
