/* 해모닉 업무 체크리스트 — 메인 로직 */

const App = (() => {
  let S = null;                 // 전체 상태
  let view = 'today';
  let tickTimer = null;

  /* ── 유틸 ────────────────────────────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  function minutesOf(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
  function shift(key, n) { const d = new Date(key + 'T00:00:00'); d.setDate(d.getDate() + n); return dateKey(d); }

  /* 보고 있는 날짜. 마감 업무를 다음 날 아침에 채워 넣는 일이 잦아서 날짜 이동이 필요하다.
     알림은 이 값과 무관하게 항상 실제 오늘 기준으로 돈다. */
  const viewKey = () => (S.ui && S.ui.date) || dateKey();
  const minKey = () => (S.created && S.created < dateKey() ? S.created : dateKey());
  const maxKey = () => dateKey(new Date(Date.now() + 14 * 86400000));
  function diffDays(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

  /* 폐사 기록 다루기 — 새 기록은 {대게:n, ...} 객체, 예전 기록은 숫자 하나.
     둘 다 읽을 수 있어야 이미 쌓인 데이터가 깨지지 않는다. */
  function deathsTotal(ev) {
    if (ev == null) return 0;
    if (typeof ev === 'number') return ev;
    return Object.values(ev).reduce((a, b) => a + (Number(b) || 0), 0);
  }
  function deathsLabel(ev) {
    const total = deathsTotal(ev);
    if (typeof ev === 'object' && ev) {
      const parts = SPECIES.filter((sp) => Number(ev[sp])).map((sp) => `${sp} ${ev[sp]}`);
      return parts.length ? `폐사 ${parts.join(' · ')}` : '폐사 없음';
    }
    return `폐사 ${total}마리`;
  }

  /* ── 상태 ────────────────────────────────────────────────── */
  /* 루틴 원본에서 이 매장 것만 — store 가 없는 루틴은 두 매장 공통, 있으면 그 매장 전용 */
  function storeTemplates(storeId) {
    const id = storeId || (Store.meta && Store.meta.current);
    return TEMPLATES.filter((x) => !x.store || x.store === id);
  }
  function freshState(storeId) {
    const setup = STORE_SETUP[storeId || (Store.meta && Store.meta.current)] || null;
    return {
      v: 1,
      created: dateKey(),
      templates: storeTemplates(storeId).map((t) => ({ ...t, active: true, repeat: t.repeat || { t: 'daily' } })),
      staff: (setup ? setup.staff : DEFAULT_STAFF).map((s) => ({ ...s, roles: s.roles.slice() })),
      settings: { ...DEFAULT_SETTINGS, ...(setup ? { crew: setup.crew } : {}) },
      roster: {},
      days: {},
      ui: { who: null, whoDate: null, filter: 'all' },
    };
  }

  const tpl = (id) => S.templates.find((t) => t.id === id);

  /* ── 할 일 순서 — 사장님이 끌어서 바꾼 순서(ord)가 있으면 그걸, 없으면 시각순 ──
     ord 는 루틴(template)에 붙어 매장 문서와 함께 모든 기기에 동기화된다. */
  const ordOf = (t) => (t && t.ord != null ? Number(t.ord) : 1e9);
  const byOrderT = (a, b) => (ordOf(a) - ordOf(b)) || (a.sort || '').localeCompare(b.sort || '');
  const byOrder = (a, b) => byOrderT(tpl(a), tpl(b));
  /* 잠금: 순서 편집은 PIN 으로 풀고, 10분 지나거나 새로고침하면 다시 잠긴다 (이 기기에서만) */
  const ORDER_UNLOCK_MS = 10 * 60 * 1000;
  let orderUnlockedAt = 0;
  const orderUnlocked = () => Date.now() - orderUnlockedAt < ORDER_UNLOCK_MS;
  const pinOk = (v) => /^\d{4,6}$/.test(v || '');

  function orderUnlockModal() {
    if (!pinOk(S.settings.orderPin)) { orderPinModal(true); return; }
    modal('순서 잠금 풀기', `<p class="hint" style="margin-top:0">할 일 순서를 바꾸려면 사장님 PIN 을 넣으세요. 10분 뒤 자동으로 다시 잠깁니다.</p>
      <label>PIN<input id="opIn" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="숫자 4~6자리"></label>`, () => {
      const v = $('#opIn').value.trim();
      if (v !== String(S.settings.orderPin)) { alert('PIN 이 다릅니다.'); return false; }
      orderUnlockedAt = Date.now(); render();
    }, '풀기');
    setTimeout(() => { const i = $('#opIn'); if (i) i.focus(); }, 50);
  }

  /* PIN 만들기·바꾸기. 처음이면 새 PIN 두 번, 이미 있으면 현재 PIN 확인 뒤 새 PIN 두 번 */
  function orderPinModal(thenUnlock) {
    const has = pinOk(S.settings.orderPin);
    modal(has ? '순서 잠금 PIN 바꾸기' : '순서 잠금 PIN 만들기', `
      <p class="hint" style="margin-top:0">${has ? '현재 PIN 을 확인한 뒤 새 PIN 을 넣습니다.' : '할 일 순서는 이 PIN 을 아는 사람만 바꿀 수 있습니다. 직원에게는 알려주지 마세요.'}</p>
      ${has ? `<label>현재 PIN<input id="opCur" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>` : ''}
      <label>새 PIN (숫자 4~6자리)<input id="opNew" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <label>새 PIN 한 번 더<input id="opNew2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>`, () => {
      if (has && $('#opCur').value.trim() !== String(S.settings.orderPin)) { alert('현재 PIN 이 다릅니다.'); return false; }
      const n = $('#opNew').value.trim();
      if (!pinOk(n)) { alert('PIN 은 숫자 4~6자리로 넣어 주세요.'); return false; }
      if (n !== $('#opNew2').value.trim()) { alert('두 번 넣은 PIN 이 서로 다릅니다.'); return false; }
      S.settings.orderPin = n; save();
      if (thenUnlock) orderUnlockedAt = Date.now();
      banner(has ? 'PIN 을 바꿨습니다' : 'PIN 을 만들었습니다', thenUnlock ? '이제 손잡이(⠿)를 끌어 순서를 바꾸세요. 10분 뒤 자동으로 잠깁니다.' : '할 일 화면의 "순서 바꾸기"에서 씁니다.');
      render();
    }, '저장');
  }

  /* 끌어 놓은 결과(보이는 항목 id 순서)를 루틴 순서(ord)로 굳힌다.
     안 보이는 항목(완료·다른 역할)은 제자리를 지키고, 보이는 항목끼리만 새 순서로 바꾼다. */
  function applyOrder(seq, movedId, groupTime) {
    if (!seq.length) return;
    const slotKey = tpl(seq[0]).slot;
    const all = S.templates.filter((t) => t.slot === slotKey).sort(byOrderT);
    const vis = new Set(seq); let i = 0;
    const out = all.map((t) => (vis.has(t.id) ? tpl(seq[i++]) : t));
    out.forEach((t, idx) => { t.ord = (idx + 1) * 10; });
    /* 다른 시각 묶음에 놓았으면 그 묶음의 시각으로 업무 시각을 옮긴다 — 알림·마감 시각도 같은 간격만큼 */
    const mt = movedId ? tpl(movedId) : null;
    if (mt && /^\d{1,2}:\d{2}$/.test(groupTime || '') && mt.time !== groupTime) retime(mt, groupTime);
    save(); render();
  }
  /* 시각을 손으로 적어 바꿨을 때 — 사장님 순서(ord)가 있는 시간대면 새 시각에 맞는 자리로 옮겨 순서를 다시 매긴다 */
  function placeByTime(t) {
    const list = S.templates.filter((x) => x.slot === t.slot && x !== t).sort(byOrderT);
    if (!list.some((x) => x.ord != null)) { delete t.ord; return; }     // 시각순 그대로면 손댈 것 없음
    let idx = list.findIndex((x) => (x.sort || '') > (t.sort || ''));
    if (idx < 0) idx = list.length;
    list.splice(idx, 0, t);
    list.forEach((x, i) => { x.ord = (i + 1) * 10; });
  }
  function timeModal(id) {
    const t = tpl(id); if (!t) return;
    modal('시각 바꾸기 — ' + t.title, `
      <label>시각<input type="time" id="cT" value="${esc(t.time || t.sort || '')}"></label>
      <label>시간대<select id="cS">${SLOTS.map((sl) => `<option value="${sl.key}"${sl.key === t.slot ? ' selected' : ''}>${sl.name}</option>`).join('')}</select></label>
      <p class="hint">매일 · 모든 기기에 같이 적용됩니다. 중요 업무의 알림 시각이 업무 시각과 같으면 알림도 함께 옮깁니다.</p>`, () => {
      const v = $('#cT').value, sl = $('#cS').value;
      if (!/^\d{2}:\d{2}$/.test(v)) { alert('시각을 넣어 주세요 (예: 11:20).'); return false; }
      const slotChanged = sl !== t.slot, timeChanged = v !== (t.time || t.sort);
      if (slotChanged) { t.slot = sl; t.edited = { ...(t.edited || {}), slot: true }; }
      if (timeChanged) retime(t, v);
      if (slotChanged || timeChanged) placeByTime(t);
      if (slotChanged && !timeChanged) banner(`${SLOTS.find((s) => s.key === sl).name} 시간대로 옮겼습니다`, t.title);
      save(); render();
    }, '저장');
  }
  function retime(t, hhmm) {
    const old = t.time || t.sort || hhmm;
    const delta = minutesOf(hhmm) - (minutesOf(old) || 0);
    const shift = (v) => { const m = minutesOf(v); if (m == null) return v; const n = Math.max(0, Math.min(23 * 60 + 59, m + delta)); return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`; };
    const dueMoved = !!(t.due && t.due === old);
    if (dueMoved) t.due = hhmm;
    if (t.deadline && delta) t.deadline = shift(t.deadline);
    t.time = hhmm; t.sort = hhmm;
    t.edited = { ...(t.edited || {}), time: true, sort: true, due: true, deadline: true };
    banner(`시각을 ${old} → ${hhmm} 으로 바꿨습니다`, `${t.title}${dueMoved ? ' · 알림 시각도 함께 옮겼습니다' : ''}`);
  }

  /* 손잡이(⠿)를 누른 채 끌기 — 마우스·아이패드 손가락 모두 pointer 이벤트로 처리 */
  let dragSt = null;
  document.addEventListener('pointerdown', (e) => {
    const hnd = e.target.closest('.dragH'); if (!hnd || !orderUnlocked()) return;
    e.preventDefault();
    const cardEl = hnd.closest('.tcard'), col = cardEl.closest('.colBody');
    if (!col) return;                                   // 지연 묶음 등 목록 밖 카드는 끌지 않는다
    dragSt = { card: cardEl, col, moved: false, id: e.pointerId };
    try { hnd.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    cardEl.classList.add('dragging');
  });
  document.addEventListener('pointermove', (e) => {
    if (!dragSt) return;
    e.preventDefault(); dragSt.moved = true;
    /* 손가락이 어느 시각 묶음 위에 있는지부터 정한다 (묶음 사이 빈틈이면 가까운 쪽).
       그 묶음 안에서 손가락 아래쪽 첫 카드 앞에 끼우고, 없으면 묶음 맨 끝에 붙인다. */
    const groups = [...dragSt.col.querySelectorAll('.tgroup')];
    if (!groups.length) return;
    let over = null, best = Infinity;
    groups.forEach((g) => {
      const r = g.getBoundingClientRect();
      const dist = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      if (dist < best) { best = dist; over = g; }
    });
    dragSt.group = over;
    const others = [...over.querySelectorAll('.tcard.drag')].filter((c) => c !== dragSt.card);
    let before = null;
    for (const c of others) { const r = c.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = c; break; } }
    if (before) { if (before.previousElementSibling !== dragSt.card) over.insertBefore(dragSt.card, before); }
    else if (over.lastElementChild !== dragSt.card) over.appendChild(dragSt.card);
  }, { passive: false });
  const dragEnd = () => {
    if (!dragSt) return;
    const d = dragSt; dragSt = null;
    d.card.classList.remove('dragging');
    if (!d.moved) return;
    const grp = d.group || d.card.closest('.tgroup');
    const lbl = grp ? (grp.querySelector('.tgTime') || {}).textContent : '';
    applyOrder([...d.col.querySelectorAll('.tcard.drag')].map((c) => c.dataset.tid), d.card.dataset.tid, (lbl || '').trim());
  };
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', dragEnd);

  function runsOn(t, d) {
    if (!t.active) return false;
    const r = t.repeat || { t: 'daily' };
    if (r.t === 'weekly') return (r.days || []).includes(d.getDay());
    return true;
  }

  function ensureDay(key) {
    if (S.days[key]) return S.days[key];
    const d = new Date(key + 'T00:00:00');
    const inst = {};
    S.templates.forEach((t) => { if (runsOn(t, d)) inst[t.id] = { s: 'todo' }; });
    S.days[key] = { inst, extras: [], notified: {} };
    return S.days[key];
  }

  /* 앱을 며칠 안 열어도 기록에 구멍이 나지 않도록 최대 7일 소급 생성 */
  function backfill() {
    for (let i = 7; i >= 0; i--) {
      const k = dateKey(daysAgo(i));
      if (k >= S.created) ensureDay(k);
    }
  }

  const today = () => ensureDay(dateKey());

  function dayFor(key) {
    if (key <= dateKey()) return ensureDay(key);
    const d = new Date(key + 'T00:00:00'), inst = {};
    S.templates.forEach((t) => { if (runsOn(t, d)) inst[t.id] = { s: 'todo' }; });
    return { inst, extras: [], notified: {}, preview: true };
  }

  /* 그날 몇 명이 일하는가 — 편성 인원에서 자동으로 정한다.
     3명 이상이면 관리자·홀·주방을 따로 두고, 2명 이하면 홀 업무 일부를 주방이 나눠 맡는다. */
  /* 인원 기준(2인/3인) — 시간대별로 본다.
     오픈 = 오전 조 인원, 미들·마감 = 오후 조 인원 (사장님 결정 2026-09-23: 오후 조는 17:00 출근, 미들은 오후 인원 기준).
     근무표에 구간별 배치가 있으면 그걸로, 없으면 옛 편성(roster) 인원, 그것도 없으면 매장 기본값. */
  const pmStart = () => minutesOf((S.settings && S.settings.pmStart) || '17:00');
  const segStartMin = (seg) => minutesOf(String(seg.time || '').split(/[–\-~]/)[0].trim());
  const segIsPm = (seg) => { const m = segStartMin(seg); return m != null && m >= pmStart(); };
  function dayCrewSplit(date) {
    if (!S.sched || !S.sched.days || !S.sched.days[date]) return null;
    const am = new Set(), pm = new Set();
    dayRows(date).forEach((r) => r.active.forEach((w) => (segIsPm(r.seg) ? pm : am).add(w.name)));
    if (!am.size && !pm.size) return null;
    return { am: [...am], pm: [...pm] };
  }
  function crewOf(key, slotKey) {
    const sp = dayCrewSplit(key);
    if (sp) {
      const n = (slotKey === 'open' ? sp.am : sp.pm).length || Math.max(sp.am.length, sp.pm.length);
      return n >= 3 ? 3 : 2;
    }
    const r = S.roster[key];
    if (r && r.length) return r.length >= 3 ? 3 : 2;
    return S.settings && S.settings.crew === 3 ? 3 : 2;   // 편성 전에는 매장 기본값
  }

  /* 오늘 항목의 실제 담당 — 그날만 바꾼 재배정이 있으면 그걸 우선,
     없으면 인원 기준(2인/3인)에 맞는 담당을 쓴다 */
  function roleOf(key, tid) {
    const rec = S.days[key]?.inst[tid];
    if (rec && rec.role) return rec.role;
    const t = tpl(tid);
    if (!t) return undefined;
    /* 2인 시간대: 홀 담당이 따로 없다. 홀 업무는 관리자가 겸하고(설정의 "관리자가 홀 겸직"), 주방이 맡기로 정한 것(role2)만 주방으로.
       그래서 2인일 때 담당은 갑각류 관리자 · 주방 · 공통 셋뿐이다 — 사장님 요청 2026-09-23 (낮 2명인데 셋으로 쪼개져 보이던 문제) */
    if (crewOf(key, t.slot) === 2) { if (t.role2) return t.role2; if (t.role === '홀') return ROLE_MGR; }
    return t.role;
  }

  function isOverdue(key, tid) {
    const rec = S.days[key]?.inst[tid];
    if (!rec || rec.s !== 'todo') return false;
    const t = tpl(tid);
    if (!t || t.rest) return false;
    if (key < dateKey()) return true;
    if (key > dateKey()) return false;
    const due = minutesOf(t.due || t.sort);
    return due != null && nowMin() > due + (t.grace || 30);
  }

  /* ── 근무 편성 ───────────────────────────────────────────── */
  const rosterOf = (key) => S.roster[key] || null;

  /* 그날 해당하는 항목 id 목록 — 저장된 날은 저장본, 아니면 템플릿에서 계산.
     월간 근무표가 미래 날짜를 보면서 데이터를 만들어 버리지 않게 하기 위함. */
  function idsFor(key) {
    if (S.days[key]) return Object.keys(S.days[key].inst).filter((id) => tpl(id) && !tpl(id).rest);
    const d = new Date(key + 'T00:00:00');
    return S.templates.filter((t) => runsOn(t, d) && !t.rest).map((t) => t.id);
  }

  function unassignedRoles(key) {
    const r = rosterOf(key);
    if (!r) return ROLES.slice();
    const covered = new Set();
    r.forEach((e) => (e.roles || []).forEach((x) => covered.add(x)));
    // 그날 실제로 항목이 있는 역할만 따진다
    const needed = new Set();
    idsFor(key).forEach((tid) => needed.add((S.days[key]?.inst[tid]?.role) || tpl(tid)?.role));
    return ROLES.filter((x) => needed.has(x) && !covered.has(x));
  }

  function loadByStaff(key) {
    const r = rosterOf(key) || [];
    const count = {};
    idsFor(key).forEach((tid) => {
      const role = (S.days[key]?.inst[tid]?.role) || tpl(tid)?.role;
      count[role] = (count[role] || 0) + 1;
    });
    return r.map((e) => {
      const n = (e.roles || []).reduce((a, x) => a + (count[x] || 0), 0);
      const st = S.staff.find((s) => s.id === e.staffId);
      return { name: st ? st.name : (e.name || '(미지정)'), roles: e.roles || [], n };
    });
  }

  /* ── 알림 ────────────────────────────────────────────────── */
  function alarmGroups() {
    const m = {};
    S.templates.forEach((t) => {
      if (!t.active || !t.crit || !t.due) return;
      (m[t.due] = m[t.due] || []).push(t);
    });
    return m;                              // { '11:40': [t13, t14], ... }
  }
  const alarmCount = () => Object.keys(alarmGroups()).length;

  function beep() {
    if (!S.settings.sound) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.28].forEach((off) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = 784; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ac.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + off + 0.22);
        o.start(ac.currentTime + off); o.stop(ac.currentTime + off + 0.24);
      });
    } catch (e) { /* 소리는 실패해도 알림 자체는 뜬다 */ }
  }

  function fire(title, body) {
    beep();
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: title + body, requireInteraction: true });
      }
    } catch (e) { /* noop */ }
    banner(title, body);
  }

  function banner(title, body) {
    const el = $('#alarmBar');
    el.innerHTML = `<div class="ab-t">${esc(title)}</div><div class="ab-b">${esc(body)}</div>
      <button class="ab-x" data-act="closeBar" aria-label="알림 닫기">✕</button>`;
    el.hidden = false;
  }

  function checkAlarms() {
    const key = dateKey(), day = ensureDay(key), n = nowMin();
    const groups = alarmGroups();
    Object.entries(groups).forEach(([due, list]) => {
      const mine = list.filter((t) => day.inst[t.id]);
      if (!mine.length) return;
      const dm = minutesOf(due);
      const names = mine.map((t) => t.title).join(' · ');

      if (n >= dm && !day.notified[due + ':pre']) {
        day.notified[due + ':pre'] = Date.now();
        fire(`[중요] ${due} · ${mine.length}건`, names);
        save();
      }
      const grace = Math.max(...mine.map((t) => t.grace || 30));
      const undone = mine.filter((t) => day.inst[t.id].s === 'todo');
      if (n >= dm + grace && undone.length && !day.notified[due + ':rem']) {
        day.notified[due + ':rem'] = Date.now();
        fire(`아직 안 됐습니다 — ${due} · ${undone.length}건`, undone.map((t) => t.title).join(' · '));
        save();
        const critUndone = undone.filter((t) => t.crit);
        if (critUndone.length && S.settings.tgInstant !== false && (S.settings.tgToken || '').trim() && (S.settings.tgChat || '').trim()) {
          sendTelegram(`[${storeName()}] ⚠️ 중요 업무 지연 — ${due} 기준 ${critUndone.length}건\n` + critUndone.map((t) => '· ' + t.title).join('\n'), 'late').catch(() => {});
        }
      }
    });
  }

  /* 마감 리포트 시각이 되면 한 번만 띄운다. 알림과 같은 방식으로 하루 1회 기록해 중복을 막는다. */
  async function checkReport() {
    if (S.settings.reportOff) return;
    const key = dateKey(), day = ensureDay(key);
    const at = minutesOf(S.settings.reportAt || '21:30');
    if (at == null || nowMin() < at) return;
    if (day.notified['reportSent']) return;                       // 이미 성공
    const hasTg = (S.settings.tgToken || '').trim() && (S.settings.tgChat || '').trim();
    if (hasTg && serverSends()) return;                            // 서버가 21:30 에 보낸다 — 여기서 또 보내면 두 통

    if (hasTg) {
      // 전송 성공할 때까지 30초 틱마다 재시도한다. PC가 22:00에 꺼지므로 조용히 미루지 않는다.
      if (day.notified['reportSending']) return;                  // 이번 틱 중복 방지
      day.notified['reportSending'] = 1;
      const rep = buildReport(key);
      const r = await sendTelegram(rep.text);
      delete day.notified['reportSending'];
      if (r.ok) {
        day.notified['reportSent'] = Date.now(); save();
        fire('마감 리포트를 텔레그램으로 보냈습니다', `전체 ${rep.pct}% · 중요 ${rep.critLeft ? '미완료 ' + rep.critLeft + '건' : '전부 완료'}`);
      } else {
        save();
        if (!day.notified['reportFailShown']) {                   // 실패 안내는 한 번만, 재시도는 계속
          day.notified['reportFailShown'] = Date.now(); save();
          fire('텔레그램 전송 실패 — 재시도합니다', r.err);
          if (view === 'today' && viewKey() === key) showReport(key);   // 수동 복사로 대체할 수 있게
        }
      }
      return;
    }

    // 텔레그램 미설정: 기존처럼 문구를 띄워 수동 전송
    if (day.notified['report']) return;
    day.notified['report'] = Date.now(); save();
    const rep = buildReport(key);
    fire('마감 리포트가 준비됐습니다', `전체 ${rep.pct}% · 중요 ${rep.critLeft ? '미완료 ' + rep.critLeft + '건' : '전부 완료'}`);
    if (view === 'today' && viewKey() === key) showReport(key);
  }

  /* ── 저장 ────────────────────────────────────────────────── */
  function save() { Store.save(S); }

  /* 접기·펼치기 상태를 화면 다시 그리기 전후로 유지한다.
     체크 한 번에 화면 전체를 다시 그리는 구조라, 이걸 기억하지 않으면
     오후에 오픈 항목을 정리할 때 한 건 체크할 때마다 묶음이 접혀버린다. */
  const openState = {};
  const isOpen = (k, dflt) => (k in openState ? openState[k] : dflt);
  const attrOpen = (k, dflt) => (isOpen(k, dflt) ? ' open' : '');

  /* ── 마감 리포트 ──────────────────────────────────────────
     22:30에 하루 결과를 카톡으로 보낼 수 있게 문구를 만들어 둔다. */
  function buildReport(key) {
    const day = S.days[key]; if (!day) return null;
    const ids = Object.keys(day.inst).filter((t) => tpl(t) && !tpl(t).rest);

    /* 리포트를 21:30에 보내므로, 그 시점에 아직 할 시간이 안 된 업무(마감 정산·문잠금 등)를
       미완료로 세면 매일 억울한 리포트가 나간다. '이후 예정'으로 분리하고 분모에서도 뺀다. */
    const isPending = (t) => {
      if (key !== dateKey()) return false;
      const rec = day.inst[t];
      if (rec.s !== 'todo') return false;
      const m = minutesOf(tpl(t)?.sort);
      return m != null && m >= nowMin();
    };
    const pending = ids.filter(isPending);

    const cnt = (f) => ids.filter(f).length;
    const done = cnt((t) => day.inst[t].s === 'done');
    const skip = cnt((t) => day.inst[t].s === 'skip');
    const base = ids.length - skip - pending.length;   // 건너뜀·이후 예정은 분모에서 뺀다
    const pct = base ? Math.round((done / base) * 100) : 0;

    const critIds = ids.filter((t) => tpl(t)?.crit && !isPending(t));
    const critDone = critIds.filter((t) => day.inst[t].s === 'done');
    const critLeft = critIds.filter((t) => day.inst[t].s === 'todo');
    const left = ids.filter((t) => day.inst[t].s === 'todo' && !tpl(t)?.crit && !isPending(t));

    const d = new Date(key + 'T00:00:00');
    const L = [];
    L.push(`🦀 해모닉 ${storeName()} ${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) 마감 리포트`);
    L.push('');
    L.push(`전체 ${done}/${base}  ${pct}%`);
    L.push(critLeft.length
      ? `중요 ${critDone.length}/${critIds.length}  ⚠️ 미완료 ${critLeft.length}건`
      : `중요 ${critDone.length}/${critIds.length}  ✅ 전부 완료`);

    if (critLeft.length) {
      L.push('');
      L.push('⚠️ 중요 미완료');
      critLeft.forEach((t) => L.push(`· ${tpl(t).title} (${roleOf(key, t)})`));
    }
    if (left.length) {
      L.push('');
      L.push(`미완료 ${left.length}건`);
      left.slice(0, 8).forEach((t) => L.push(`· ${tpl(t).title} (${roleOf(key, t)})`));
      if (left.length > 8) L.push(`· 외 ${left.length - 8}건`);
    }
    if (skip) L.push('', `건너뜀 ${skip}건`);
    if (pending.length) L.push('', `⏳ 이후 예정 ${pending.length}건 — ` + pending.map((t) => tpl(t).title).slice(0, 4).join(', ') + (pending.length > 4 ? ' 외' : ''));

    // 수치가 있는 항목은 따로 모아 보여준다
    const spSum = {}; let spLegacy = 0, spAny = false;
    S.templates.filter((t) => t.ev === 'deaths').forEach((t) => {
      const id = t.id;
      const r = day.inst[id]; if (!r || r.s !== 'done' || r.ev == null) return;
      spAny = true;
      if (typeof r.ev === 'object') SPECIES.forEach((sp) => { spSum[sp] = (spSum[sp] || 0) + (Number(r.ev[sp]) || 0); });
      else spLegacy += Number(r.ev) || 0;      // 예전 기록(총 마릿수만)
    });
    const extra = [];
    if (spAny) {
      const parts = SPECIES.filter((sp) => spSum[sp]).map((sp) => `${sp} ${spSum[sp]}`);
      if (spLegacy) parts.push(`기타 ${spLegacy}`);
      const total = Object.values(spSum).reduce((a, b) => a + b, 0) + spLegacy;
      extra.push(total ? `폐사 ${total}마리 (${parts.join(' · ')})` : '폐사 없음 ✅');
    }
    const salesT = S.templates.find((t) => t.ev === 'money');
    const sales = salesT ? day.inst[salesT.id] : null;
    if (sales && sales.s === 'done' && sales.ev != null) extra.push(`매출 ${Number(sales.ev).toLocaleString('ko-KR')}원`);
    if (extra.length) L.push('', extra.join(' · '));

    const r = rosterOf(key);
    if (r && r.length) {
      L.push('', '근무 ' + r.map((e) => {
        const st = S.staff.find((x) => x.id === e.staffId);
        return `${st ? st.name : '?'}(${(e.roles || []).join('·')})`;
      }).join(' '));
    }
    return { text: L.join('\n'), pct, critLeft: critLeft.length, done, base };
  }

  const serverSends = () => !!(Store.supa && Store.supa.signedIn);
  async function sendTelegram(text, kind, direct) {
    const tk = (S.settings.tgToken || '').trim(), ch = (S.settings.tgChat || '').trim();
    if (!tk || !ch) return { ok: false, err: '봇 토큰과 대화방 ID를 설정에서 먼저 입력하세요.' };
    if (serverSends() && !direct) {
      // 서버 경유: events 표에 넣으면 서버가 바로 보내고, 실패하면 1분마다 3회까지 다시 보낸다
      const r = await Store.supaEvent(kind || 'msg', text);
      if (r.ok) return r;
      // 서버에 못 넣었으면(인터넷 순간 끊김 등) 직접 보내기로 넘어간다
    }
    try {
      // URLSearchParams 본문은 CORS 사전요청(preflight) 없이 나가는 단순 요청이라
      // 브라우저·네트워크 환경을 가장 덜 탄다.
      const r = await fetch(`https://api.telegram.org/bot${tk}/sendMessage`, {
        method: 'POST',
        body: new URLSearchParams({ chat_id: ch, text }),
      });
      const j = await r.json();
      return j.ok ? { ok: true } : { ok: false, err: j.description || ('HTTP ' + r.status) };
    } catch (e) { return { ok: false, err: '인터넷 연결을 확인하세요 (' + e.message + ')' }; }
  }

  /* getUpdates 로 봇이 최근 받은 메시지의 대화방 목록을 긁어온다.
     사장님이 대화방 ID를 직접 알아낼 방법이 없으므로 이 버튼이 사실상 필수다. */
  async function findChats() {
    const tk = (S.settings.tgToken || '').trim();
    if (!tk) { alert('봇 토큰을 먼저 입력하세요.'); return; }
    let list = [], updates = null;
    if (serverSends()) {                       // 서버가 대신 물어본다 — 이 브라우저가 텔레그램에 못 닿아도 된다
      await Store.flush();
      const r = await Store.supaTgUpdates();
      if (r.ok) updates = r.result;
      else if (!/토큰이 없습니다|로그인/.test(r.err)) { alert('서버로 대화방을 못 찾았습니다: ' + r.err); return; }
    }
    if (!updates) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tk}/getUpdates`);
        const j = await r.json();
        if (!j.ok) { alert('토큰이 올바르지 않습니다: ' + (j.description || '')); return; }
        updates = j.result || [];
      } catch (e) {
        alert('이 브라우저에서 텔레그램 서버(api.telegram.org)에 닿지 못했습니다.\n\n' +
          '· 다른 브라우저(크롬·사파리)에서 같은 주소를 열어 설정하거나\n' +
          '· 아래 "대화방 ID 직접 입력" 칸에 ID를 넣어 주세요.');
        return;
      }
    }
    const seen = {};
    updates.forEach((u) => {
      const c = (u.message || u.my_chat_member || u.channel_post || {}).chat;
      if (c && !seen[c.id]) { seen[c.id] = 1; list.push(c); }
    });
    if (!list.length) {
      alert('대화방을 못 찾았습니다.\n\n1) 휴대폰 텔레그램에서 봇에게 아무 메시지나 보내거나\n2) 단체방에 봇을 초대하고 아무 메시지나 올린 뒤\n다시 눌러 주세요.');
      return;
    }
    modal('대화방 선택', `<p class="hint">리포트를 보낼 곳을 고르세요. 단체방을 고르면 직원도 함께 받습니다.</p>
      <div class="pick">${list.map((c) =>
        `<button class="btn big" data-tgchat="${esc(String(c.id))}">${esc(c.title || ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.username || c.id)}
         <span class="opt">${c.type === 'private' ? '개인' : '단체방'}</span></button>`).join('')}</div>`, null);
  }

  function showReport(key) {
    const rep = buildReport(key);
    if (!rep) { alert('그날 기록이 없습니다.'); return; }
    modal('마감 리포트', `
      <p class="hint">아래 문구를 복사해 카카오톡 대화방에 붙여넣으세요.</p>
      <textarea id="repText" class="reptext" rows="14" readonly>${esc(rep.text)}</textarea>
      <div class="rowbtns">
        <button class="btn primary" data-act="sendReportNow">텔레그램으로 보내기</button>
        <button class="btn" data-act="copyReport">문구 복사</button>
      </div>
      <p class="hint" id="copyMsg"></p>`, null);
    $('#modal').dataset.repkey = key;
  }

  /* ── 렌더 ────────────────────────────────────────────────── */
  /* 왼쪽 메뉴: 대카테고리(g) 아래 하위 메뉴(items). 대카테고리를 누르면 접었다 펼친다.
     g 가 null 이면 헤더 없이 바로 버튼(설정). */
  const MENU = [
    { id: 'work', g: '업무', ic: '🗂️', items: [['rules', '공지사항 필독', '📌'], ['tanks', '수조 관리표', '🐟'], ['today', '할 일', '✅'], ['report', '기록', '📊']] },
    { id: 'people', g: '직원', ic: '👥', items: [['month', '월간 근무표', '📅'], ['staff', '직원 명단', '🧑‍🍳'], ['contracts', '근로계약서', '📄'], ['payslip', '급여명세서', '💳'], ['health', '보건증 관리', '🩺'], ['hygiene', '위생교육 일정관리', '🧼']] },
    { id: 'ops', g: '운영', ic: '🏪', items: [['costs', '원가 관리', '💰'], ['buyInsight', '갑각류 매입 인사이트', '🦀'], ['notices', '월간 공지', '📢'], ['issues', '트러블시트', '📝']] },
    { id: 'kitchen', g: '서비스 교육', ic: '🎓', items: [['training', '교육 자료', '🎓'], ['recipes', '레시피 관리', '📖']] },
    { id: 'acct', g: '회계', ic: '💵', items: [['salesIn', '매출 입력', '🧾'], ['salesStat', '매출 분석', '📈'], ['pnl', '월 손익', '📘'], ['labor', '인건비', '👷']] },
    { id: 'sys', g: '설정', ic: '⚙️', items: [['settings', '설정', '⚙️'], ['routines', '루틴', '🔁']] },
  ];
  const groupOf = (k) => MENU.find((m) => m.items.some(([x]) => x === k));

  /* 펼쳐진 대카테고리 목록. 기기마다 따로 기억(localStorage) — 동기화 대상 아님. */
  const NAV_OPEN_KEY = 'hm.navOpen';
  let navOpen = (() => {
    try { const v = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || 'null'); if (Array.isArray(v)) return new Set(v); } catch (_) { /* 무시 */ }
    return null;   // 저장된 게 없으면 render 에서 현재 화면의 그룹만 연다
  })();
  let lastNavView = null;
  function saveNavOpen() { try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify([...navOpen])); } catch (_) { /* 무시 */ } }
  function toggleGroup(gid) {
    if (navOpen.has(gid)) navOpen.delete(gid); else navOpen.add(gid);
    saveNavOpen();
  }

  function sideMenu() {
    const item = ([k, n, ic]) => `<button class="sitem${view === k ? ' on' : ''}" data-act="view" data-v="${k}"><span class="sic">${ic}</span>${n}</button>`;
    const cur = groupOf(view);
    return MENU.map((m) => {
      if (!m.g) return `<div class="sgap"></div>${m.items.map(item).join('')}`;
      const open = navOpen.has(m.id), here = cur && cur.id === m.id;
      return `<button class="sgrp${open ? ' open' : ''}${here ? ' here' : ''}" data-act="navGroup" data-g="${m.id}" aria-expanded="${open}">
          <span class="sic">${m.ic}</span><span class="sgname">${m.g}</span><span class="sgcnt">${m.items.length}</span><span class="scaret">›</span>
        </button>
        <div class="ssub"${open ? '' : ' hidden'}>${m.items.map(item).join('')}</div>`;
    }).join('');
  }

  /* 모바일 상단: 1줄은 대카테고리, 2줄은 선택한 대카테고리의 하위 메뉴 */
  function topNav() {
    const cur = groupOf(view);
    const gs = MENU.map((m) => `<button class="tab g${cur === m ? ' on' : ''}" data-act="navGroupM" data-g="${m.id}">${m.ic || '⚙️'} ${m.g || '설정'}</button>`).join('');
    const subs = cur && cur.g ? `<div class="navs">${cur.items.map(([k, n, ic]) =>
      `<button class="tab s${view === k ? ' on' : ''}" data-act="view" data-v="${k}">${ic} ${n}</button>`).join('')}</div>` : '';
    return `<div class="navg">${gs}</div>${subs}`;
  }

  const storeName = () => {
    const m = Store.meta; if (!m) return '';
    return (m.stores.find((x) => x.id === m.current) || {}).name || '';
  };

  function render() {
    const who = S.ui.whoDate === dateKey() ? S.ui.who : null;
    const whoBtn = `<button class="whoBtn" data-act="pickWho">${who ? esc(who) : '지금 누구세요?'}</button>`;

    const mt = Store.meta;
    const storeBtns = mt ? mt.stores.map((st) =>
      `<button class="stb${st.id === mt.current ? ' on' : ''}" data-act="storeSwitch" data-id="${st.id}">${esc(st.name)}</button>`).join('') : '';

    /* 화면이 바뀌면 그 화면이 속한 대카테고리는 자동으로 펼친다(직접 접는 건 그대로 둔다) */
    const g = groupOf(view);
    if (!navOpen) navOpen = new Set(g ? [g.id] : []);
    else if (view !== lastNavView && g && !navOpen.has(g.id)) { navOpen.add(g.id); saveNavOpen(); }
    lastNavView = view;

    $('#side').innerHTML = `<div class="slogo">🦀 해모닉<small>업무 체크리스트</small></div>
      <div class="sstore">${storeBtns}</div>
      <nav class="smenu">${sideMenu()}</nav>
      <div class="sfoot"><div class="sfl">지금 사용 중</div>${whoBtn}</div>`;

    $('#nav').innerHTML = topNav();
    $('#who').innerHTML = whoBtn;
    const sb = $('#storebar'); if (sb) sb.innerHTML = `<div class="sstore top">${storeBtns}</div>`;

    const y = window.scrollY;
    $('#main').innerHTML = ({ rules: vRules, tanks: vTanks, today: vToday, staff: vStaff, contracts: vContracts, month: vMonth, costs: vCosts, notices: vNotices, issues: vIssues, recipes: vRecipes, routines: vRoutines, report: vReport, salesIn: vSalesIn, salesStat: vSalesStat, pnl: vPnl, labor: vLabor, payslip: vPayslip, health: vHealth, hygiene: vHygiene, buyInsight: vBuyInsight, training: vTraining, settings: vSettings })[view]();
    /* 지금 어느 매장 데이터를 보고 있는지 화면마다 박아둔다.
       직원·기록이 매장별로 따로인데 표시가 없으면 공유되는 것처럼 오해한다. */
    const h2 = $('#main .hd h2');
    if (h2 && !h2.querySelector('.chip.store')) h2.insertAdjacentHTML('beforeend', `<span class="chip store">${esc(storeName())}</span>`);
    window.scrollTo(0, y);   // 체크할 때마다 화면이 위로 튀지 않게
    if (view === 'contracts') bindEditor();
  }

  /* ── 수조 관리표 ─────────────────────────────────────────── */
  /* 매장마다 S.tanks 하나. 수조는 위아래로 나뉘어 있어 입고는 top/bottom 두 칸.
     { count, cycle:{water:{every,late}, clean:{every,late}},
       items:[{ n, water:{date,by}, clean:{date,by}, top:{date,species,qty,dead}, bottom:{...} }] } */
  const TANK_DEFAULT = () => ({ count: 4, cycle: { water: { every: 7, late: 14 }, clean: { every: 30, late: 45 } }, items: [] });

  function tanksOf() {
    if (!S.tanks) S.tanks = TANK_DEFAULT();
    const T = S.tanks;
    if (!T.cycle) T.cycle = TANK_DEFAULT().cycle;
    T.items = T.items || [];
    while (T.items.length < T.count) T.items.push({ n: T.items.length + 1 });
    if (T.items.length > T.count) T.items.length = T.count;
    if (!T.care) {
      T.care = [];
      T.items.forEach((it) => ['water', 'clean'].forEach((kind) => {
        const c = it[kind];
        if (c && c.date) T.care.push({ id: 'c' + Date.now() + kind + it.n, date: c.date, n: it.n, kind, by: c.by || '' });
      }));
    }
    if (!T.log) {
      T.log = [];
      T.items.forEach((it) => ['top', 'bottom'].forEach((pos) => {
        const c = it[pos];
        if (c && c.species) T.log.push({ id: 'l' + Date.now() + pos + it.n, date: c.date || dateKey(), n: it.n, pos, species: c.species, qty: c.qty || 0, kg: c.kg, dead: c.dead || 0, by: '' });
      }));
    }
    return T;
  }
  const fmtKg = (v) => (v == null || v === '' || isNaN(v)) ? '' : (Math.round(Number(v) * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + ' kg';

  const md = (k) => k ? `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}` : '';
  const addDays = (k, n) => { const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() + n); return dateKey(d); };

  function ageBadge(date, warnAfter, badAfter) {
    if (!date) return '';
    const n = diffDays(date, dateKey());
    const cls = n > badAfter ? 'bad' : n > warnAfter ? 'warn' : 'ok';
    return `<span class="tkAgo ${cls}">${n === 0 ? '오늘' : n + '일 전'}</span>`;
  }

  /* 같은 품종 중 가장 먼저 들어온 칸 — 두 칸 이상 있을 때만 표시한다 */
  function fifoSet(T) {
    const bySp = {};
    T.items.forEach((it) => ['top', 'bottom'].forEach((pos) => {
      const c = it[pos]; if (c && c.species && c.qty > 0 && c.date) (bySp[c.species] = bySp[c.species] || []).push({ key: it.n + pos, date: c.date });
    }));
    const out = new Set();
    Object.values(bySp).forEach((list) => { if (list.length >= 2) out.add(list.slice().sort((a, b) => a.date.localeCompare(b.date))[0].key); });
    return out;
  }

  function tankAlerts() {
    const T = S.tanks; if (!T || !T.items) return [];
    const c = T.cycle || TANK_DEFAULT().cycle, tk = dateKey(), out = [];
    T.items.forEach((it) => {
      if (it.water && it.water.date && diffDays(it.water.date, tk) > c.water.late) out.push(`수조 ${it.n} 해수 교체`);
      if (it.clean && it.clean.date && diffDays(it.clean.date, tk) > c.clean.late) out.push(`수조 ${it.n} 청소`);
    });
    return out;
  }

  function vTanks() {
    const T = tanksOf(), c = T.cycle, fifo = fifoSet(T), tk = dateKey();
    const dateCell = (it, kind) => {
      const r = it[kind] || {}, cy = c[kind];
      const n = r.date ? diffDays(r.date, tk) : null;
      const due = r.date ? addDays(r.date, cy.every) : null;
      const over = due ? diffDays(due, tk) : null;
      return `<td><button class="tkCell" data-act="tankDate" data-n="${it.n}" data-kind="${kind}">
        ${r.date ? `<div class="tkDate">${md(r.date)}</div>${ageBadge(r.date, cy.every, cy.late)}
          <div class="tkSub">${over > 0 ? `예정 ${md(due)} — ${over}일 지남` : `다음 예정 ${md(due)}`}</div>
          ${r.by ? `<div class="tkSub">${esc(r.by)}</div>` : ''}`
          : `<div class="tkEmpty">기록 없음</div><div class="tkSub">눌러서 기록</div>`}
      </button></td>`;
    };
    const stockCell = (it, pos) => {
      const r = it[pos] || {};
      const first = fifo.has(it.n + pos);
      return `<td class="${first ? 'fifo' : ''}"><button class="tkCell" data-act="tankStock" data-n="${it.n}" data-pos="${pos}">
        ${r.species && r.qty > 0 ? `<div class="tkSp">${esc(r.species)}<small>${r.qty}미</small></div>
          ${r.kg ? `<div class="tkKg">${fmtKg(r.kg)}</div>` : ''}
          <div class="tkDate sm">${md(r.date)} ${ageBadge(r.date, 10, 9999)}</div>
          <div class="tkSub">폐사 ${r.dead || 0}${r.by ? ` · ${esc(r.by)}` : ''}</div>
          ${first ? '<div class="tkFirst">먼저 사용 ①</div>' : ''}`
          : `<div class="tkEmpty">비어 있음</div><div class="tkSub">눌러서 입고</div>`}
      </button></td>`;
    };
    const row = (label, sub, cells) => `<tr><th><div class="tkLabel">${label}</div>${sub ? `<div class="tkSub">${sub}</div>` : ''}</th>${cells}</tr>`;

    const alerts = tankAlerts();
    return `<div class="hd">
      <div><h2>수조 관리표</h2><div class="sub">칸을 누르면 바로 기록됩니다. 색 배지는 며칠 지났는지 — 초록 주기 안 · 노랑 주기 지남 · 빨강 오늘 처리.</div></div>
    </div>
    ${alerts.length ? `<div class="notice warn"><b>오늘 처리할 것 ${alerts.length}건</b> — ${alerts.map(esc).join(' · ')}</div>` : ''}
    <div class="tkWrap"><table class="tk">
      <tr><th class="corner"></th>${T.items.map((it) => `<th class="tkHead"><div class="tkNo">수조 번호</div><div class="tkN">${it.n}</div></th>`).join('')}</tr>
      ${row('해수 교체일', `주기 ${c.water.every}일 · ${c.water.late}일 넘으면 빨강`, T.items.map((it) => dateCell(it, 'water')).join(''))}
      ${row('수조 청소일', `주기 ${c.clean.every}일 · ${c.clean.late}일 넘으면 빨강`, T.items.map((it) => dateCell(it, 'clean')).join(''))}
      ${row('입고일 <span class="tkHalf">상단</span>', '', T.items.map((it) => stockCell(it, 'top')).join(''))}
      ${row('입고일 <span class="tkHalf">하단</span>', '', T.items.map((it) => stockCell(it, 'bottom')).join(''))}
    </table></div>
    <div class="tkLegend"><span class="tkAgo ok">주기 안</span><span class="tkAgo warn">주기 지남</span><span class="tkAgo bad">많이 지남 — 오늘 처리</span>
      <span class="tkFirst inl">먼저 사용 ①</span><span class="hint" style="margin:0">= 같은 품종 중 가장 먼저 들어온 칸. 주문 나가면 여기서 먼저 뺍니다</span></div>

    <p class="hint">수조 개수와 교체·청소 주기는 <b>설정 → 수조 관리</b>에서 바꿉니다.</p>

    <div class="hd sub2"><h3>해수 교체 · 청소 기록</h3><span class="hint" style="margin:0">위 칸에서 기록할 때마다 한 줄씩 · 최근 것이 위</span></div>
    ${T.care.length ? `<div class="tkLogWrap"><table class="tkLog">
      <thead><tr><th>날짜</th><th>수조</th><th>구분</th><th>누가</th><th>기록 시각</th><th></th></tr></thead>
      <tbody>${T.care.slice().sort((a, b) => (b.date + (b.at || '')).localeCompare(a.date + (a.at || ''))).map((C) => `<tr>
        <td>${C.date.slice(5).replace('-', '/')} (${WD[new Date(C.date + 'T00:00:00').getDay()]})</td>
        <td>${C.n}</td><td><span class="chip ${C.kind === 'water' ? 'kit' : 'hall'}">${C.kind === 'water' ? '해수 교체' : '수조 청소'}</span></td>
        <td><b>${esc(C.by || '—')}</b></td><td class="mut">${C.at || ''}</td>
        <td><button class="more" data-act="tankCareDel" data-id="${C.id}" aria-label="삭제">✕</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">합계 ${T.care.length}건</td><td colspan="4">해수 교체 ${T.care.filter((x) => x.kind === 'water').length} · 청소 ${T.care.filter((x) => x.kind === 'clean').length}</td></tr></tfoot>
    </table></div>` : '<div class="tkEmptyLog">아직 기록이 없습니다. 위 해수 교체·청소 칸을 눌러 기록하세요.</div>'}

    <div class="hd sub2"><h3>입고 기록</h3><span class="hint" style="margin:0">위 입고 칸에서 기록할 때마다 한 줄씩 쌓입니다 · 최근 것이 위</span></div>
    ${T.log.length ? `<div class="tkLogWrap"><table class="tkLog">
      <thead><tr><th>날짜</th><th>수조</th><th>위치</th><th>품종</th><th class="r">마릿수</th><th class="r">kg</th><th class="r">폐사</th><th>기록</th><th></th></tr></thead>
      <tbody>${T.log.slice().sort((a, b) => (b.date + (b.at || '')).localeCompare(a.date + (a.at || ''))).map((L) => `<tr>
        <td>${L.date.slice(5).replace('-', '/')} (${WD[new Date(L.date + 'T00:00:00').getDay()]})</td>
        <td>${L.n}</td><td>${L.pos === 'top' ? '상단' : '하단'}</td><td><b>${esc(L.species)}</b></td>
        <td class="r">${L.qty}</td><td class="r">${L.kg != null && L.kg !== '' ? (Math.round(L.kg * 10) / 10) : '—'}</td><td class="r">${L.dead || 0}</td>
        <td class="mut">${esc(L.by || '')}${L.at ? ' ' + L.at : ''}</td>
        <td><button class="more" data-act="tankLogDel" data-id="${L.id}" aria-label="삭제">✕</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">합계 ${T.log.length}건</td><td class="r">${T.log.reduce((a, L) => a + (Number(L.qty) || 0), 0)}</td><td class="r">${Math.round(T.log.reduce((a, L) => a + (Number(L.kg) || 0), 0) * 10) / 10}</td><td class="r">${T.log.reduce((a, L) => a + (Number(L.dead) || 0), 0)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>` : '<div class="tkEmptyLog">아직 입고 기록이 없습니다. 위 입고 칸을 눌러 첫 기록을 남기세요.</div>'}`;
  }

  /* 수조 기록의 입력자 — 직접 적는다. 직원 이름 칩은 누르면 칸에 채워지는 보조일 뿐이다. */
  function whoInput(preset) {
    return `<label>누가 입력하나요?<input id="tkWhoIn" value="${esc(preset || '')}" placeholder="이름을 적어 주세요" autocomplete="off"></label>
      <div class="roles wrap sm" id="tkWhoChips">${S.staff.filter((x) => x.active).map((x) => `<button type="button" class="rl" data-who="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>`;
  }
  function bindWhoChips() {
    const box = $('#tkWhoChips'); if (!box) return;
    box.addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; $('#tkWhoIn').value = b.dataset.who; $('#tkWhoIn').focus(); });
  }
  const whoValue = () => ($('#tkWhoIn') ? $('#tkWhoIn').value.trim() : '');

  function tankDateModal(n, kind) {
    const T = tanksOf(), it = T.items[n - 1], r = it[kind] || {};
    const label = kind === 'water' ? '해수 교체' : '수조 청소';
    const who = (S.ui.whoDate === dateKey() ? S.ui.who : '') || r.by || '';
    modal(`수조 ${n} — ${label}`, `
      <label>날짜<input type="date" id="tkD" value="${r.date || dateKey()}" max="${dateKey()}"></label>
      ${whoInput(who)}
      ${r.date ? `<button type="button" class="btn danger sm" id="tkClear" style="margin-top:12px">기록 지우기</button>` : ''}
    `, () => {
      const d = $('#tkD').value; if (!d) { alert('날짜를 골라 주세요.'); return false; }
      const by = whoValue();
      if (!by) { alert('누가 했는지 적어 주세요.'); return false; }
      it[kind] = { date: d, by };
      const now = new Date(), at = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const dup = T.care.find((x) => x.n === n && x.kind === kind && x.date === d);
      if (dup) { dup.by = by; dup.at = at; }
      else T.care.push({ id: 'c' + Date.now(), date: d, n, kind, by, at });
      save(); render();
    }, '기록');
    bindWhoChips();
    const cl = $('#tkClear'); if (cl) cl.addEventListener('click', () => { delete it[kind]; save(); closeModal(); render(); });
  }

  function tankStockModal(n, pos) {
    const T = tanksOf(), it = T.items[n - 1], r = it[pos] || {};
    modal(`수조 ${n} ${pos === 'top' ? '상단' : '하단'} — 입고`, `
      <div class="mlabel">품종</div>
      <div class="roles big wrap" id="tkSp">${SPECIES.map((x) => `<button type="button" class="rl${x === r.species ? ' on' : ''}" data-sp="${esc(x)}">${esc(x)}</button>`).join('')}
        <input id="tkSpOther" placeholder="다른 품종 직접 입력" value="${r.species && !SPECIES.includes(r.species) ? esc(r.species) : ''}" style="flex:1 1 100%;margin-top:6px"></div>
      <div class="row2">
        <label>마릿수<input type="number" id="tkQty" min="0" step="1" inputmode="numeric" value="${r.qty != null ? r.qty : ''}" placeholder="예: 8"></label>
        <label>킬로수 (kg)<input type="number" id="tkKg" min="0" step="0.1" inputmode="decimal" value="${r.kg != null ? r.kg : ''}" placeholder="예: 25.6"></label>
      </div>
      <label>입고일<input type="date" id="tkD" value="${r.date || dateKey()}" max="${dateKey()}"></label>
      <label>폐사 (입고 후 누적)<input type="number" id="tkDead" min="0" step="1" inputmode="numeric" value="${r.dead || 0}"></label>
      ${whoInput((S.ui.whoDate === dateKey() ? S.ui.who : '') || r.by || '')}
      ${r.species ? `<button type="button" class="btn danger sm" id="tkClear" style="margin-top:12px">비우기 (다 나갔음)</button>` : ''}
    `, () => {
      const sel = document.querySelector('#tkSp .rl.on');
      const sp = ($('#tkSpOther').value.trim()) || (sel ? sel.dataset.sp : '');
      const qty = Number($('#tkQty').value), d = $('#tkD').value;
      if (!sp) { alert('품종을 골라 주세요.'); return false; }
      if (!(qty > 0)) { alert('마릿수를 적어 주세요.'); return false; }
      if (!d) { alert('입고일을 골라 주세요.'); return false; }
      const kgRaw = $('#tkKg').value.trim(), kg = kgRaw === '' ? undefined : Math.max(0, Number(kgRaw) || 0);
      const dead = Math.max(0, Number($('#tkDead').value) || 0);
      const who = whoValue();
      if (!who) { alert('누가 입력하는지 적어 주세요.'); return false; }
      const prev = it[pos] || {};
      it[pos] = { species: sp, qty, date: d, dead, kg, by: who };
      // 새 입고(품종·마릿수·kg·날짜 중 하나라도 바뀜)면 기록에 한 줄 추가, 폐사만 고친 거면 그 줄만 갱신
      const same = prev.species === sp && prev.qty === qty && prev.date === d && (prev.kg == null ? kg == null : prev.kg === kg);
      const now = new Date(), at = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (!same || !T.log.length) {
        T.log.push({ id: 'l' + Date.now(), date: d, n, pos, species: sp, qty, kg, dead, by: who, at });
      } else {
        const L = T.log.slice().reverse().find((x) => x.n === n && x.pos === pos && x.date === d && x.species === sp);
        if (L) { L.dead = dead; L.by = who; L.at = at; }
      }
      save(); render();
    }, '기록');
    $('#tkSp').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return;
      $('#tkSp').querySelectorAll('.rl').forEach((x) => x.classList.remove('on')); b.classList.add('on'); $('#tkSpOther').value = ''; });
    bindWhoChips();
    const cl = $('#tkClear'); if (cl) cl.addEventListener('click', () => { delete it[pos]; save(); closeModal(); render(); });
  }

  /* ── 공지사항 필독 ───────────────────────────────────────── */
  function vRules() {
    const sid = Store.meta ? Store.meta.current : 'ansan';
    const stores = Store.meta ? Store.meta.stores : [{ id: 'ansan', name: '안산점' }, { id: 'anyang', name: '안양점' }];
    const common = BASE_RULES.filter((r) => r.scope === 'all');

    const card = (r, i) => `<li class="rcard">
      <span class="rnum">${i + 1}</span>
      <div class="rbody">
        <div class="rtitle">${esc(r.title)}</div>
        ${[].concat(r.body || []).map((b) => `<p class="rtext">${esc(b)}</p>`).join('')}
        ${r.note ? `<p class="rnote">${esc(r.note)}</p>` : ''}
      </div></li>`;

    const storeBlock = (st) => {
      const mine = BASE_RULES.filter((r) => r.scope === st.id);
      const on = st.id === sid;
      return `<section class="rstore${on ? ' on' : ''}">
        <div class="rsHead"><h3>${esc(st.name)}</h3>${on ? '<span class="chip store">지금 보는 매장</span>' : ''}<span class="rcnt">${mine.length}가지</span></div>
        ${mine.length ? `<ol class="rlist">${mine.map(card).join('')}</ol>`
          : '<div class="rempty">아직 정한 룰이 없습니다.</div>'}
      </section>`;
    };

    return `<div class="hd">
      <div><h2>공지사항 필독</h2><div class="sub">시간과 무관하게 항상 지키는 것. 처음 오신 분은 여기부터 읽어주세요.</div></div>
    </div>

    ${POLICY_NOTE.length ? `<div class="rpolicy">
      <div class="rpHead">운영 방침 안내</div>
      ${POLICY_NOTE.map((t) => `<p>${esc(t)}</p>`).join('')}
    </div>` : ''}

    <section class="rsec">
      <div class="rsHead"><h3>기본 운영 룰 · 공통</h3><span class="rcnt">두 매장 모두 · ${common.length}가지</span></div>
      <ol class="rlist">${common.map(card).join('')}</ol>
    </section>

    <div class="rsHead top"><h3>매장별 룰</h3><span class="rcnt">${esc(storeName())}에서 집중적으로 지켜야 할 것</span></div>
    <div class="rstores">${storeBlock(stores.find((st) => st.id === sid) || stores[0])}</div>`;
  }

  /* ── 오늘 ────────────────────────────────────────────────── */
  function vToday() {
    const key = viewKey(), day = dayFor(key), d = new Date(key + 'T00:00:00');
    const isToday = key === dateKey(), isPast = key < dateKey(), isFuture = key > dateKey();
    const ids = Object.keys(day.inst);
    let filter = S.ui.filter;

    /* 지금 시각이 속한 시간대 — 슬롯 탭의 기본 선택 */
    const curSlot = SLOTS.slice().reverse().find((sl) => nowMin() >= minutesOf(sl.from)) || SLOTS[0];
    const slotKey = S.ui.slot || (isToday ? curSlot.key : SLOTS[0].key);
    const slot = SLOTS.find((sl) => sl.key === slotKey) || SLOTS[0];

    const inSlot = (sk) => ids.filter((t) => tpl(t)?.slot === sk);
    // 휴식은 해도 그만 안 해도 그만이라 완료율 분모에 넣지 않는다
    const real = (list) => list.filter((t) => !tpl(t)?.rest);
    const doneN = (list) => real(list).filter((t) => day.inst[t].s !== 'todo').length;

    let h = '';

    if (Store.cloud && Store.cloudErr) {
      h += `<div class="notice warn"><b>클라우드에 올리지 못했습니다.</b> 이 기기에는 저장되지만 다른 기기에는 아직 안 보입니다.
        <div class="hint">인터넷을 확인하고 잠시 뒤 다시 체크해 보세요. (${esc(Store.cloudErr)})</div></div>`;
    }
    if (!Store.ok) {
      h += `<div class="notice danger"><b>지금 기록이 저장되지 않습니다.</b>
        체크한 내용이 창을 닫으면 사라집니다.
        <div class="hint">앱을 파일로 바로 열면 브라우저가 저장을 막는 경우가 있습니다.
        폴더 안의 <b>실행하기</b> 파일로 다시 열어주세요. 그래도 같으면 크롬이나 엣지로 열어보세요.</div></div>`;
    }

    { const sp = Store.supa; if (sp.configured && !sp.signedIn && sp.libLoaded) h += `<div class="notice warn"><b>서버 로그인이 풀렸습니다.</b> 지금은 이 기기에만 저장됩니다. <button class="btn sm" data-act="supaLogin">로그인</button></div>`; }
    const ta = tankAlerts();
    if (isToday && ta.length) {
      h += `<button class="notice pin" data-act="view" data-v="tanks">🐟 <b>수조 ${ta.length}건 오늘 처리</b> — ${ta.map(esc).join(' · ')}</button>`;
    }
    const sa = staffAlerts();
    if (isToday && sa.length) h += sa.slice(0, 3).map((a) => `<button class="notice pin" data-act="view" data-v="${a.v}">🩺 <b>${esc(a.text)}</b> — 눌러서 확인</button>`).join('');

    /* 백업 안내 배너는 서버(v2) 단계 전까지 두지 않는다 — 설정 › 백업에서 여전히 내보낼 수 있다 */

    const pins = (S.notices || []).filter((n) => n.month === key.slice(0, 7) && n.pin);
    if (pins.length && isToday) {
      h += pins.slice(0, 2).map((n) => `<button class="notice pin" data-act="view" data-v="notices">📌 <b>${esc(n.title)}</b>${n.body ? ` — ${esc(n.body.split('\n')[0].slice(0, 40))}` : ''}</button>`).join('');
    }

    /* 근무 편성 안내 배너도 두지 않는다 — 근무표 화면에서 부족 인원을 직접 본다 */

    /* 날짜 이동 */
    h += `<div class="datebar">
      <button class="dnav" data-act="dateGo" data-d="-1" aria-label="이전 날"${key <= minKey() ? ' disabled' : ''}>‹</button>
      <input type="date" class="dpick" data-act="datePick" value="${key}" min="${minKey()}" max="${maxKey()}" aria-label="날짜 선택">
      <button class="dnav" data-act="dateGo" data-d="1" aria-label="다음 날"${key >= maxKey() ? ' disabled' : ''}>›</button>
      ${isToday ? '' : `<button class="btn sm" data-act="dateToday">오늘로</button>`}
      <span class="dwd">${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일${isToday ? ' <i class="todayTag">오늘</i>' : ''}</span>
    </div>`;

    if (isPast) h += `<div class="notice past"><b>지난 날짜를 보고 있습니다.</b> 빠뜨린 항목을 지금 채워 넣을 수 있습니다.</div>`;
    if (isFuture) h += `<div class="notice past"><b>아직 오지 않은 날짜입니다.</b> 그날 어떤 업무가 잡혀 있는지만 볼 수 있습니다.</div>`;

    /* 하루 전체 진행률 — 시간대 상관없이 오늘 총작업량 기준 (휴식 제외) */
    const allReal = real(ids), allDone = doneN(ids), allLeft = allReal.length - allDone;
    const allPct = allReal.length ? Math.round(allDone / allReal.length * 100) : 0;
    h += `<div class="progCard dayTotal${allLeft === 0 && allReal.length ? ' done' : ''}">
      <div class="pcTop"><div><b>오늘 진행률</b><div class="pcSub">완료 <b>${allDone}</b> / ${allReal.length}건 · 남은 업무 <b class="left">${allLeft}건</b>${allLeft === 0 && allReal.length ? ' — 전부 마쳤습니다 🎉' : ''}</div></div>
        <div class="pcNum">${allPct}<small>%</small></div></div>
      <div class="bar"><i style="width:${allPct}%"></i></div></div>`;

    /* 오픈 / 미들 / 마감 — 시간대 탭. 탭 안에 그 시간대의 완료 수와 막대가 있어 따로 진행률 카드를 두지 않는다 */
    h += `<div class="slotTabs">${SLOTS.map((sl) => {
      const list = inSlot(sl.key), dn = doneN(list), rn = real(list).length, pc = rn ? Math.round(dn / rn * 100) : 0;
      return `<button class="slotTab${sl.key === slot.key ? ' on' : ''}${rn && dn === rn ? ' full' : ''}" data-act="slotPick" data-s="${sl.key}">
        <span class="stRow"><span class="stName">${sl.name}</span><span class="stCnt">${dn}/${rn}${rn && dn === rn ? ' ✓' : ''}</span></span>
        <span class="stBar"><i style="width:${pc}%"></i></span></button>`;
    }).join('')}</div>`;
    const list0 = inSlot(slot.key);

    /* 역할 필터 */
    const crew = crewOf(key, slot.key);
    const split = dayCrewSplit(key);
    const roleBtns = crew === 2 ? ROLES.filter((r) => r !== '홀') : ROLES;   // 2인이면 홀 담당이 없다
    if (crew === 2 && filter === '홀') filter = 'all';
    h += `<div class="filters">
      ${['all', ...roleBtns].map((r) => `<button class="fl${filter === r ? ' on' : ''}" data-act="filter" data-r="${r}">${r === 'all' ? '전체' : r}</button>`).join('')}
      <button class="crewTag" data-act="view" data-v="month" title="근무표의 오전·오후 조 인원에 따라 시간대별로 정해집니다">${crew}인 기준${split ? ` (${slot.key === 'open' ? '오전' : '오후'} 조 ${(slot.key === 'open' ? split.am : split.pm).length}명)` : ''}${crew === 2 ? ' · 홀 업무는 관리자가, 일부는 주방이' : ''}</button>
    </div>`;

    /* 중요 지연 — 오늘일 때만, 어느 시간대든 위로 올린다 */
    if (isToday) {
      const over = ids.filter((t) => isOverdue(key, t) && tpl(t)?.crit)
        .sort((a2, b2) => tpl(a2).sort.localeCompare(tpl(b2).sort));
      if (over.length) {
        h += `<div class="tgroup late"><div class="tgHead"><span class="tgTime late">지연</span>
          <span class="tgLabel">중요 항목 ${over.length}건이 지났습니다</span></div>
          ${over.map((t) => card(key, t, { isPast, isFuture })).join('')}</div>`;
      }
    }

    /* 시간별 그룹 — 왼쪽 할 일 / 오른쪽 완료 2단 */
    let items = list0;
    // '공통'은 그날 있는 사람이 하는 일이라 어떤 역할을 골라도 남긴다
    if (filter !== 'all') items = items.filter((t) => { const r = roleOf(key, t); return r === filter || r === ROLE_ANY; });
    items.sort(byOrder);

    const todoIds = items.filter((t) => day.inst[t].s === 'todo');
    const doneIds = items.filter((t) => day.inst[t].s !== 'todo')
      .sort((a2, b2) => {
        const ra = day.inst[a2], rb = day.inst[b2];
        return String(rb.at || '').localeCompare(String(ra.at || ''))   // 최근 완료가 위로
          || (tpl(a2).sort || '').localeCompare(tpl(b2).sort || '');
      });

    /* 시간 배지로 묶어 그린다 (완료 칸은 시간순 대신 완료순이라 묶지 않는다) */
    const byTime = (list) => {
      const groups = [];
      list.forEach((t) => {
        const lbl = tpl(t).time;
        const g = groups[groups.length - 1];
        if (g && g.label === lbl) g.items.push(t);
        else groups.push({ label: lbl, items: [t] });
      });
      return groups.map((g) => `<div class="tgroup">
        <div class="tgHead"><span class="tgTime">${esc(g.label)}</span></div>
        ${g.items.map((t) => card(key, t, { isPast, isFuture })).join('')}
      </div>`).join('');
    };

    /* 순서 바꾸기 — 잠금 상태에서는 손잡이가 없다. 사장님 PIN 으로 풀면 10분 동안 끌어서 바꿀 수 있다 */
    const unlocked = orderUnlocked();
    const hasCustom = S.templates.some((t) => t.ord != null);
    h += `<div class="orderBar${unlocked ? ' on' : ''}">${unlocked
      ? `<span>🔓 <b>순서 편집 중</b> — 손잡이(⠿)를 끌어 순서를 바꾸세요. 다른 시각 묶음에 놓으면 그 시각으로 바뀝니다. 모든 기기·매일 그대로 갑니다.</span>
         <span class="obBtns">${hasCustom ? `<button class="btn sm" data-act="orderReset">시간순으로 되돌리기</button>` : ''}<button class="btn sm primary" data-act="orderLock">잠그기</button></span>`
      : `<span class="hint">🔒 순서 잠김${hasCustom ? ' · 사장님이 정한 순서' : ' · 시각순'}</span><button class="btn sm" data-act="orderUnlock">순서 바꾸기</button>`}</div>`;

    h += `<div class="splitCols">
      <section class="colBox todoCol">
        <div class="colHead"><h3>해야 할 일</h3><span class="colCnt">${real(todoIds).length}</span></div>
        <div class="colBody">
          ${todoIds.length
            ? byTime(todoIds)
            : `<div class="colEmpty">${filter === 'all'
                ? `${slot.name} 시간대는 다 끝냈습니다. 👍`
                : `${filter} 담당은 남은 항목이 없습니다.`}</div>`}
        </div>
      </section>

      <section class="colBox doneCol">
        <div class="colHead"><h3>완료</h3><span class="colCnt ok">${doneIds.length}</span></div>
        <div class="colBody">
          ${doneIds.length
            ? doneIds.map((t) => card(key, t, { isPast, isFuture })).join('')
            : `<div class="colEmpty">아직 완료한 항목이 없습니다.<br><span class="hint">왼쪽에서 네모를 누르면 이쪽으로 넘어옵니다.</span></div>`}
        </div>
      </section>
    </div>`;

    /* 오늘만 할 일 */
    const ex = day.extras || [];
    h += `<div class="tgroup"><div class="tgHead"><span class="tgTime alt">추가</span>
      <span class="tgLabel">오늘만 할 일 ${ex.filter((e) => e.s === 'done').length}/${ex.length}</span></div>
      ${ex.map((e) => `<div class="tcard${e.s === 'done' ? ' done' : ''}">
        <button class="ck" data-act="ckExtra" data-id="${e.id}" aria-label="완료">${e.s === 'done' ? '✓' : ''}</button>
        <div class="tcMain"><div class="tcTitle">${esc(e.title)}</div>
        ${e.by ? `<div class="tcBy">${esc(e.by)} · ${e.at}</div>` : ''}</div>
        <button class="more" data-act="delExtra" data-id="${e.id}" aria-label="삭제">✕</button></div>`).join('')}
      <button class="add" data-act="addExtra">+ 할 일 추가</button></div>`;

    /* 기본 운영 룰은 '공지사항 필독' 화면에 있다 — 여기선 링크만 */
    h += `<button class="notice rlink" data-act="view" data-v="rules">📌 <b>공지사항 필독</b>
      <span class="hint">운영 방침과 기본 운영 룰 ${BASE_RULES.filter((r) => r.scope === 'all').length + BASE_RULES.filter((r) => r.scope === (Store.meta ? Store.meta.current : 'ansan')).length}가지 — 시간과 무관하게 항상 지키는 것</span></button>`;

    return h;
  }

  /* 항목 카드 — 참고 화면과 같은 구조: 체크 | 역할·제목 | 주기 · 펼침 */
  function card(key, tid, opt = {}) {
    const t = tpl(tid), rec = dayFor(key).inst[tid];
    if (!t || !rec) return '';
    const late = isOverdue(key, tid) && key === dateKey();
    const missed = opt.isPast && rec.s === 'todo';
    const role = roleOf(key, tid);
    const rc = { [ROLE_MGR]: 'mgr', '홀': 'hall', '주방': 'kit', '공통': 'any' }[role] || 'mgr';
    const rep = t.repeat || { t: 'daily' };
    const repLabel = rep.t === 'weekly' ? `주 ${rep.days.length}회` : '매일';

    const evLabel = { deaths: '폐사 마릿수 입력', kakao: '카톡 사진 전송 확인', money: '금액 입력', number: '숫자 입력' }[t.ev];

    const canDrag = orderUnlocked() && rec.s === 'todo' && !opt.isFuture;
    return `<div class="tcard${t.rest ? ' rest' : ''}${rec.s === 'done' ? ' done' : ''}${rec.s === 'skip' ? ' skipped' : ''}${t.crit ? ' crit' : ''}${late ? ' late' : ''}${opt.isFuture ? ' preview' : ''}${canDrag ? ' drag' : ''}" data-tid="${tid}">
      ${canDrag ? `<span class="dragH" data-drag="${tid}" title="끌어서 순서 바꾸기">⠿</span>` : ''}
      <button class="ck" data-act="toggle" data-id="${tid}" aria-label="${esc(t.title)} 완료"${opt.isFuture ? ' disabled' : ''}>${rec.s === 'done' ? '✓' : rec.s === 'skip' ? '–' : ''}</button>
      <button class="tcMain" data-act="cardOpen" data-id="${tid}">
        <div class="tcTitle"><span class="chip ${rc}">${role}</span>${esc(t.title)}${t.crit ? '<span class="chip crit">중요</span>' : ''}${late ? '<span class="chip late">지연</span>' : ''}${missed ? '<span class="chip missed">미완료</span>' : ''}</div>
        ${rec.s === 'done' ? `<div class="tcBy ok">${rec.by ? esc(rec.by) + ' · ' : ''}${rec.at || ''}${rec.ev != null ? ` · ${t.ev === 'deaths' || typeof rec.ev === 'object' ? esc(deathsLabel(rec.ev)) : esc(t.evLabel || '입력') + ' ' + esc(rec.ev)}` : ''}${rec.note ? ` · ${esc(rec.note)}` : ''}</div>` : ''}
        ${rec.s === 'skip' ? `<div class="tcBy warn">건너뜀 — ${esc(rec.reason || '')}</div>` : ''}
        <div class="tcBody">
          ${t.memo ? `<div class="tcMemo">${esc(t.memo)}</div>` : ''}
          <div class="tcMeta">담당 ${role}${t.support ? ` · 보조 ${t.support}` : ''}${t.deadline ? ` · 마감 ${t.deadline}` : ''}${evLabel ? ` · ${evLabel}` : ''}</div>
        </div>
      </button>
      <span class="tcRight">
        ${canDrag ? `<button class="tTime" data-act="cardTime" data-id="${tid}" title="시각 바꾸기">${esc(t.time || '')} ✎</button>` : ''}
        <span class="repBadge">${repLabel}</span>
        ${opt.isFuture ? '' : `<button class="more" data-act="menu" data-id="${tid}" aria-label="더보기">⋯</button>`}
      </span>
    </div>`;
  }

  /* ── 월간 근무표 ─────────────────────────────────────────── */
  function monthKey() { return S.ui.month || dateKey().slice(0, 7); }
  function monthShiftKey(m, n) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  const mdateKey = () => S.ui.mdate || dateKey();

  function dayStatus(key) {
    if (!idsFor(key).length) return { t: 'none' };
    const r = rosterOf(key);
    if (!r || !r.length) return { t: 'empty' };
    const miss = unassignedRoles(key);
    return miss.length ? { t: 'miss', miss } : { t: 'ok' };
  }

  /* ── 월간 근무표 — MORAK 근무관리 구조 ─────────────────────
     하루를 근무 구간(오픈준비·점심·저녁준비·저녁·야간·마감)으로 나누고, 구간×요일별 최소 필요 인원과
     비교해 충족/부족을 자동 판정한다. 달력 셀 → 우측 상세 → 구간별 배치 편집.
     S.sched = { segments[{key,name,time,need{weekday,friday,saturday,holiday}}], holidays[{date,name,type}],
                 days{ 'YYYY-MM-DD': { segs{ key: { workers[{name,staffId,type,leader,special,note}], leave[name] } } } },
                 log[{at,by,summary}] }
     예전 편성(S.roster)은 여기서 자동으로 요약해 채운다 — 할 일 담당·인원 기준·리포트가 그걸 본다. */
  function schedOf() {
    if (!S.sched) S.sched = {};
    const sc = S.sched;
    if (!sc.segments || !sc.segments.length) {
      const crew = (S.settings && S.settings.crew) || 2;
      sc.segments = SEGMENTS_DEFAULT.map((sg) => {
        const base = Math.max(1, crew + sg.adj), peak = Math.max(1, crew + sg.adj + (sg.peak ? 1 : 0));
        return { key: sg.key, name: sg.name, time: sg.time, need: { weekday: base, friday: base, saturday: peak, holiday: peak } };
      });
    }
    /* 최소 인원 기준은 쓰지 않는다 — 사장님 결정 2026-09-23: 근무표는 캘린더대로 2명·3명을 그대로 넣고 부족 표시는 없앤다.
       한 번만 0으로 맞추고 표시해 둔다. 운영 기준 화면에서 다시 숫자를 넣으면 부족 표시가 되살아난다. */
    if ((sc.needVer || 0) < 2) {
      sc.segments.forEach((sg) => { sg.need = { weekday: 0, friday: 0, saturday: 0, holiday: 0 }; });
      sc.needVer = 2;
    }
    if (!sc.holidays) sc.holidays = HOLIDAYS_KR.map((h) => ({ ...h }));
    if (!sc.days) sc.days = {};
    if (!sc.log) sc.log = [];
    return sc;
  }
  const segList = () => schedOf().segments;
  const holidayOf = (date) => schedOf().holidays.find((h) => h.date === date);
  const KIND_LABEL = { weekday: '평일', friday: '금요일', saturday: '토요일', holiday: '일요일·공휴일' };
  function dayKind(date) {
    if (holidayOf(date)) return 'holiday';
    const d = new Date(date + 'T00:00:00').getDay();
    return d === 0 ? 'holiday' : d === 6 ? 'saturday' : d === 5 ? 'friday' : 'weekday';
  }
  function segCell(date, key, create) {
    const sc = schedOf();
    let d = sc.days[date];
    if (!d) { if (!create) return { workers: [], leave: [] }; d = sc.days[date] = { segs: {} }; }
    if (!d.segs) d.segs = {};
    let x = d.segs[key];
    if (!x) { if (!create) return { workers: [], leave: [] }; x = d.segs[key] = { workers: [], leave: [] }; }
    x.workers = x.workers || []; x.leave = x.leave || [];
    return x;
  }
  function segRow(date, seg) {
    const x = segCell(date, seg.key, false);
    const active = x.workers.filter((w) => !x.leave.includes(w.name));
    const minimum = Number((seg.need || {})[dayKind(date)]) || 0;
    return { date, seg, workers: x.workers, leave: x.leave, active, assigned: active.length, minimum, diff: active.length - minimum };
  }
  const dayRows = (date) => segList().map((sg) => segRow(date, sg));
  const needsOn = () => segList().some((sg) => Object.values(sg.need || {}).some((v) => Number(v) > 0));
  function dayState(rows) {
    const short = rows.filter((r) => r.diff < 0).sort((p2, q) => p2.diff - q.diff);
    if (short.length) return { state: 'short', text: `${short[0].seg.name} ${-short[0].diff}명 부족`, count: short.length };
    return { state: 'ok', text: '전체 구간 충족', count: 0 };
  }
  const dayHasAny = (date) => dayRows(date).some((r) => r.workers.length);
  const dayNames = (date) => [...new Set(dayRows(date).flatMap((r) => r.active.map((w) => w.name)))];
  const fmtNote = (n) => (n || '').replace(/(\d{1,2})시출근/g, '$1:00 출근').replace(/(\d{1,2})시퇴근/g, '$1:00 퇴근').trim();
  const empLabel = (t) => EMP_TYPES[t] || t || EMP_TYPES.regular;
  const empCls = (t) => EMP_TYPE_CLS[t] || 'neutral';
  const isOffDay = (st, date) => !!st && (st.offDays || []).includes(new Date(date + 'T00:00:00').getDay());
  const mdLabel = (k) => { const [, mo2, d2] = k.split('-'); return `${Number(mo2)}월 ${Number(d2)}일`; };
  const monthLabel = (m) => { const [y2, mo2] = m.split('-').map(Number); return `${y2}년 ${mo2}월`; };
  function monthDates(m) {
    const [y2, mo2] = m.split('-').map(Number), n = new Date(y2, mo2, 0).getDate(), out = [];
    for (let d = 1; d <= n; d++) out.push(`${m}-${pad(d)}`);
    return out;
  }
  const weekIdxOf = (date) => { const d = new Date(date + 'T00:00:00'); const first = new Date(d.getFullYear(), d.getMonth(), 1); const lead = (first.getDay() + 6) % 7; return Math.floor((lead + d.getDate() - 1) / 7); };

  function rosterNames(key) {
    const r = rosterOf(key) || [];
    const names = r.map((e) => (S.staff.find((x) => x.id === e.staffId) || {}).name || e.name).filter(Boolean);
    if (!names.length) return '';
    return names.length > 2 ? `${names[0]}, ${names[1]} 외 ${names.length - 2}명` : names.join(', ');
  }
  function syncRoster(date) {
    const names = dayNames(date);
    if (!names.length) { delete S.roster[date]; return; }
    S.roster[date] = names.map((n) => { const st = S.staff.find((x) => x.name === n); return st ? { staffId: st.id, roles: (st.roles || []).slice() } : { name: n, roles: [] }; });
  }
  function logSched(summary) {
    const sc = schedOf();
    sc.log.unshift({ at: stamp(), by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '', summary });
    if (sc.log.length > 300) sc.log.length = 300;
  }
  function addWorker(date, keys, w) {
    let n = 0;
    keys.forEach((k) => { const x = segCell(date, k, true); if (x.workers.some((v) => v.name === w.name)) return; x.workers.push({ ...w }); n++; });
    syncRoster(date);
    return n;
  }

  /* ── 오전·오후 조 — 사장님 근무표 방식 ──
     오전 조 = 오후 조 시작(기본 17:00) 전 구간, 오후 조 = 그 이후 구간. 이름을 넣으면 해당 구간 전부에 배치한다.
     명단에 없는 이름은 직원 명단에 자동으로 추가된다 (담당 역할은 직원 화면에서 나중에 정한다). */
  const splitNames = (s) => String(s || '').split(/[,、·\/\n]+/).map((x) => x.trim()).filter(Boolean);
  function ensureStaff(name) {
    let st = S.staff.find((x) => x.name === name);
    if (!st) { st = { id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), name, roles: [], active: true, type: 'regular' }; S.staff.push(st); }
    return st;
  }
  function applyShiftDay(date, am, pm) {
    const sc = schedOf();
    const mk = (n) => { const st = ensureStaff(n); return { name: n, staffId: st.id, type: st.type || 'regular', leader: false, special: isOffDay(st, date), note: '' }; };
    const segs = {};
    segList().forEach((sg) => { const ws = (segIsPm(sg) ? pm : am).map(mk); if (ws.length) segs[sg.key] = { workers: ws, leave: [] }; });
    if (Object.keys(segs).length) sc.days[date] = { segs }; else delete sc.days[date];
    syncRoster(date);
  }
  const patternOf = () => { const sc = schedOf(); if (!sc.pattern) sc.pattern = {}; return sc.pattern; };
  function fillMonthFromPattern(m, overwrite) {
    const pat = patternOf(); let n = 0;
    monthDates(m).forEach((k) => {
      const dow = String(new Date(k + 'T00:00:00').getDay());
      const p2 = pat[dow]; if (!p2 || (!(p2.am || []).length && !(p2.pm || []).length)) return;
      if (!overwrite && dayHasAny(k)) return;
      applyShiftDay(k, p2.am || [], p2.pm || []); n++;
    });
    return n;
  }
  function patternModal() {
    const pat = patternOf(), m = monthKey();
    const rows = [1, 2, 3, 4, 5, 6, 0].map((d) => `<tr><th>${WD[d]}</th>
      <td><input data-pat="${d}:am" value="${esc((pat[d] || {}).am ? pat[d].am.join(', ') : '')}" placeholder="이름, 이름" autocomplete="off"></td>
      <td><input data-pat="${d}:pm" value="${esc((pat[d] || {}).pm ? pat[d].pm.join(', ') : '')}" placeholder="이름, 이름" autocomplete="off"></td></tr>`).join('');
    modal('요일별 오전·오후 조 패턴', `
      <p class="hint" style="margin-top:0">매주 같은 사람이 나오는 기본 패턴입니다. 이름은 쉼표로 나눠 적으세요. 오후 조는 <b>${esc(S.settings.pmStart || '17:00')}</b>부터입니다 (설정 › 인원 기준에서 변경).</p>
      <div class="tkLogWrap"><table class="tkLog patTbl"><thead><tr><th>요일</th><th>오전 조</th><th>오후 조 (${esc(S.settings.pmStart || '17:00')}~)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="patOver"> 이미 배치된 날도 패턴으로 덮어쓰기 (병원·대체 같은 예외가 지워집니다)</label>
      <div class="rowbtns" style="margin-top:8px"><button type="button" class="btn primary" data-act="patFill">${monthLabel(m)} 채우기</button>
        <button type="button" class="btn" data-act="patFillNext">${monthLabel(monthShiftKey(m, 1))}도 채우기</button></div>
      <p class="hint">채운 뒤 병원·대체 근무 같은 예외는 달력에서 날짜를 누르고 <b>오전·오후 조 편집</b>으로 고치면 됩니다.</p>`, () => {
      readPattern(); save(); render();
    }, '패턴만 저장');
  }
  function readPattern() {
    const pat = patternOf();
    document.querySelectorAll('[data-pat]').forEach((inp) => {
      const [d, k] = inp.dataset.pat.split(':');
      pat[d] = pat[d] || { am: [], pm: [] }; pat[d][k] = splitNames(inp.value);
    });
  }
  function shiftDayModal(date) {
    const sp = dayCrewSplit(date) || { am: [], pm: [] };
    const d = new Date(date + 'T00:00:00');
    modal(`${mdLabel(date)} ${WD[d.getDay()]}요일 — 오전·오후 조`, `
      <label>오전 조<input id="sdAm" value="${esc(sp.am.join(', '))}" placeholder="이름, 이름" autocomplete="off"></label>
      <label>오후 조 (${esc(S.settings.pmStart || '17:00')}~)<input id="sdPm" value="${esc(sp.pm.join(', '))}" placeholder="이름, 이름" autocomplete="off"></label>
      <p class="hint">저장하면 이 날의 구간별 배치를 통째로 다시 만듭니다. 오픈 업무는 오전 조 인원, 미들·마감 업무는 오후 조 인원 기준으로 담당이 정해집니다.</p>`, () => {
      const am = splitNames($('#sdAm').value), pm = splitNames($('#sdPm').value);
      applyShiftDay(date, am, pm);
      logSched(`${mdLabel(date)} 오전 ${am.length}명 · 오후 ${pm.length}명 편성`);
      save(); render();
    }, '저장');
  }

  let schedTab = 'cal';
  function vMonth() {
    const m = monthKey(), sc = schedOf(), todayK = dateKey(), sel = mdateKey();
    const dates = monthDates(m);
    const allRows = dates.flatMap(dayRows);
    // 배치가 하나도 없는 지난 날은 부족으로 세지 않는다 — 오늘 이후 빈 날과 배치된 날만
    const shortRows = allRows.filter((r) => r.diff < 0 && (r.date >= todayK || dayHasAny(r.date)));
    const shortDays = new Set(shortRows.map((r) => r.date)).size;
    const people = new Set(allRows.flatMap((r) => r.active.map((w) => w.name)));
    const leaveN = allRows.reduce((acc, r) => acc + r.leave.length, 0);
    const holN = sc.holidays.filter((h) => h.date.startsWith(m)).length;

    let h = `<div class="hd">
      <div><h2>월간 근무표</h2><div class="sub">날짜를 누르면 오른쪽에서 구간별 배치를 보고 바로 고칠 수 있습니다. 필요 인원보다 적으면 빨간색으로 표시됩니다.</div></div>
      <div class="mnav">
        <button class="dnav" data-act="monthNav" data-d="-1" aria-label="이전 달">‹</button>
        <span class="mtitle">${monthLabel(m)}</span>
        <button class="dnav" data-act="monthNav" data-d="1" aria-label="다음 달">›</button>
        ${m === todayK.slice(0, 7) ? '' : '<button class="btn sm" data-act="monthToday">이번 달</button>'}
      </div>
    </div>
    <div class="rowbtns" style="margin:0 0 12px">
      <button class="btn sm" data-act="sePrint">🖨 인쇄용 보기</button>
      <button class="btn sm primary" data-act="sePattern">📅 오전·오후 조 패턴</button>
      <button class="btn sm" data-act="seMonth">📋 월 관리 (복사·자동 채우기)</button>
      <button class="btn sm" data-act="seRules">⚙ 운영 기준·공휴일</button>
    </div>`;

    const nOn = needsOn();
    h += `<div class="ovGrid">
      ${nOn ? `<button class="ov red" data-act="schedTab" data-t="short"><span class="ovIcon">!</span><span><small>${monthLabel(m)} 부족 현황</small><b>${shortDays}일 · ${shortRows.length}개 구간</b><em>필요한 날짜만 모아서 확인</em></span></button>`
        : `<div class="ov"><span class="ovIcon green">✓</span><span><small>최소 인원 기준</small><b>사용 안 함</b><em>캘린더대로 넣습니다 · 운영 기준에서 켤 수 있음</em></span></div>`}
      <div class="ov"><span class="ovIcon blue">人</span><span><small>이번 달 배치 근무자</small><b>총 ${people.size}명</b><em>실제 배치된 고유 인원</em></span></div>
      <div class="ov"><span class="ovIcon amber">休</span><span><small>휴가·부재 표시</small><b>${leaveN}건</b><em>배치 인원에서 자동 제외</em></span></div>
      <div class="ov"><span class="ovIcon green">✓</span><span><small>등록 공휴일</small><b>${holN}일</b><em>일요일과 같은 기준 적용</em></span></div>
    </div>`;

    h += `<div class="filters" style="margin:12px 0 10px">
      ${[['cal', '달력'], ...(nOn ? [['short', `부족 인원 ${shortRows.length}`]] : []), ['log', '변경 이력']].map(([k, n]) => `<button class="fl${schedTab === k ? ' on' : ''}" data-act="schedTab" data-t="${k}">${n}</button>`).join('')}
    </div>`;

    if (schedTab === 'short') {
      h += `<div class="hd sub2"><h3>${monthLabel(m)} 부족 인원</h3><span class="hint" style="margin:0">조치가 필요한 구간만 · 총 ${shortRows.reduce((acc, r) => acc - r.diff, 0)}명·구간 부족</span></div>`;
      h += shortRows.length ? `<div class="tkLogWrap"><table class="tkLog cList"><thead><tr><th>날짜</th><th>시간대</th><th>현재 상태</th><th>근무자</th><th></th></tr></thead>
        <tbody>${shortRows.map((r) => `<tr><td><b>${mdLabel(r.date)}</b> <span class="mut">${WD[new Date(r.date + 'T00:00:00').getDay()]}요일${holidayOf(r.date) ? ' · ' + esc(holidayOf(r.date).name) : ''}</span></td>
          <td><b>${esc(r.seg.name)}</b> <span class="mut">${esc(r.seg.time)}</span></td>
          <td><span class="cst none">${-r.diff}명 부족</span> <span class="mut">배치 ${r.assigned}명 · 필요 ${r.minimum}명</span></td>
          <td>${r.active.slice(0, 3).map((w) => esc(w.name)).join(', ')}${r.assigned > 3 ? ` 외 ${r.assigned - 3}명` : ''}${r.assigned ? '' : '<span class="mut">배치 없음</span>'}</td>
          <td><button class="btn sm" data-act="seOpen" data-k="${r.date}" data-seg="${r.seg.key}">근무 편집</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="notice ok"><b>현재 배치 기준으로 부족한 구간이 없습니다.</b></div>`;
      return h;
    }
    if (schedTab === 'log') {
      const logs = sc.log.filter((l) => !l.month || l.month === m);
      h += `<div class="hd sub2"><h3>변경 이력</h3><span class="hint" style="margin:0">근무표·운영 기준 변경을 한곳에서 · 최근 것이 위</span></div>`;
      h += sc.log.length ? `<div class="audit">${sc.log.slice(0, 100).map((l) => `<div class="auditRow"><i></i><div><b>${esc(l.summary)}</b><div class="mut">${esc(l.by || '누군가')} · ${l.at}</div></div></div>`).join('')}</div>`
        : `<div class="tkEmptyLog">아직 변경 이력이 없습니다. 근무를 배치하면 변경자와 시간이 이곳에 남습니다.</div>`;
      return h;
    }

    /* 달력 + 상세 */
    const [y2, mo2] = m.split('-').map(Number);
    const first = new Date(y2, mo2 - 1, 1), daysInM = new Date(y2, mo2, 0).getDate();
    const lead = (first.getDay() + 6) % 7, rows = Math.ceil((lead + daysInM) / 7);
    const start = new Date(first); start.setDate(1 - lead);

    h += `<div class="wsGrid"><div class="calPanel">
      <div class="calHead"><div><div class="eyebrow">월간 근무표</div><b>${monthLabel(m)}</b></div>
        ${nOn ? `<div class="legend"><span class="legOk">인원 충족</span><span class="legShort">인원 부족</span></div>` : `<div class="legend"><span class="mut" style="font-size:12px">빨간 날짜 = 주말·공휴일</span></div>`}</div>
      <div class="wdRow">${['월', '화', '수', '목', '금', '토', '일'].map((w, i) => `<span class="${i >= 5 ? 'we' : ''}">${w}</span>`).join('')}</div>
      <div class="calGrid">`;
    for (let i = 0; i < rows * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = dateKey(d), inM = k.slice(0, 7) === m, hol = holidayOf(k);
      const names = inM ? dayNames(k) : [], any = inM && dayHasAny(k);
      const st = any ? dayState(dayRows(k)) : null;
      const red = d.getDay() === 0 || d.getDay() === 6 || !!hol;   // 주말·공휴일은 날짜 숫자를 빨갛게
      h += `<button class="dc${inM ? '' : ' out'}${k === sel ? ' sel' : ''}${k === todayK ? ' now' : ''}${red ? ' red' : ''}" data-act="mpick" data-k="${k}" aria-label="${mdLabel(k)}">
        <span class="dl"><b>${d.getDate()}</b>${hol ? `<em>${esc(hol.name)}</em>` : ''}${k === todayK ? '<i>오늘</i>' : ''}</span>
        ${names.length ? `<span class="pl">${names.slice(0, 2).map(esc).join(', ')}${names.length > 2 ? ` 외 ${names.length - 2}명` : ''}</span>` : ''}
        ${!inM ? '' : st ? (nOn ? `<span class="sl ${st.state}"><i>${st.state === 'short' ? '!' : '✓'}</i>${st.text}</span>` : (() => { const sp = dayCrewSplit(k); return sp ? `<span class="sl ok"><i>·</i>오전 ${sp.am.length} · 오후 ${sp.pm.length}</span>` : ''; })()) : `<span class="sl empty">배치 없음</span>`}
      </button>`;
    }
    h += `</div></div>`;
    h += `<div class="detail">${schedDetail(sel)}</div></div>`;
    return h;
  }

  function schedDetail(date) {
    const rows = dayRows(date), st = dayState(rows), hol = holidayOf(date), any = dayHasAny(date);
    const d = new Date(date + 'T00:00:00');
    let h = `<div class="dtHead"><div><div class="eyebrow">선택한 날짜</div><h3>${mdLabel(date)} ${WD[d.getDay()]}요일</h3></div>
      ${hol ? `<span class="holBadge">${esc(hol.name)}</span>` : `<span class="mut" style="font-size:12px">${KIND_LABEL[dayKind(date)]} 기준</span>`}</div>`;
    h += !any ? `<div class="dayAlert empty"><span>·</span><div><b>아직 배치가 없습니다</b><small>아래 버튼으로 오전·오후 조를 넣거나 전날 배치를 복사하세요</small></div></div>`
      : !needsOn() ? ''
      : st.state === 'short' ? `<div class="dayAlert"><span>!</span><div><b>${st.count}개 시간대에 인력이 부족합니다</b><small>${esc(st.text)}</small></div></div>`
      : `<div class="dayAlert ok"><span>✓</span><div><b>모든 시간대 인원이 충족됐습니다</b><small>휴가자와 퇴사자는 배치 인원에서 제외됩니다</small></div></div>`;
    h += `<div class="shiftList">${rows.map((r) => `<section class="shiftRow">
      <div class="shiftTitle"><span><b>${esc(r.seg.name)}</b><small>${esc(r.seg.time)}</small></span>
        ${needsOn() ? `<span class="avail ${r.diff < 0 ? 'short' : 'ok'}">${r.diff < 0 ? `${-r.diff}명 부족` : r.diff > 0 ? `${r.diff}명 여유` : '인원 충족'}</span>` : `<span class="avail ok">${r.assigned}명</span>`}</div>
      <div class="wchips">${r.active.map((w) => `<span class="wchip"><b>${esc(w.name)}</b>${w.leader ? '<em>구간 책임자</em>' : ''}${w.special ? '<em>휴무일 출근</em>' : ''}${w.type && w.type !== 'regular' ? `<em class="tb ${empCls(w.type)}">${esc(empLabel(w.type))}</em>` : ''}${w.note ? `<small>${esc(fmtNote(w.note))}</small>` : ''}</span>`).join('') || '<span class="mut" style="font-size:12.5px">배치 없음</span>'}</div>
      ${r.leave.length ? `<div class="leaveLine"><b>휴가·부재</b> ${r.leave.map(esc).join(', ')} <small>배치 인원에서 제외</small></div>` : ''}
      ${needsOn() ? `<div class="countLine"><span>배치 ${r.assigned}명</span><span>필요 ${r.minimum}명</span></div>` : ''}
    </section>`).join('')}</div>`;
    { const sp = dayCrewSplit(date);
      h += `<div class="notice" style="margin-top:8px"><b>오전 조</b> ${sp && sp.am.length ? sp.am.map(esc).join(', ') : '<span class="mut">없음</span>'} <span class="mut">(${sp ? sp.am.length : 0}명)</span><br>
        <b>오후 조</b> ${sp && sp.pm.length ? sp.pm.map(esc).join(', ') : '<span class="mut">없음</span>'} <span class="mut">(${sp ? sp.pm.length : 0}명 · ${esc(S.settings.pmStart || '17:00')}~)</span></div>`; }
    h += `<button class="btn primary" style="width:100%;margin-top:8px" data-act="seShift" data-k="${date}">오전·오후 조 편집</button>
      <button class="btn" style="width:100%;margin-top:6px" data-act="seOpen" data-k="${date}">구간별 상세 편집</button>
      <div class="rowbtns" style="margin:8px 0 0"><button class="btn sm ghost" data-act="seCopyPrev" data-k="${date}">전날 배치 복사</button>
      ${S.days[date] && date <= dateKey() ? `<button class="btn sm ghost" data-act="jumpDate" data-k="${date}">이날 할 일 보기</button>` : ''}
      ${any ? `<button class="btn sm ghost danger" data-act="seClearDay" data-k="${date}">이 날 비우기</button>` : ''}</div>`;
    return h;
  }

  /* ── 근무 배치 편집 (구간 탭) ── */
  let seKey = null;
  function schedEdit(date, key) {
    const rows = dayRows(date);
    const seg = segList().find((x) => x.key === (key || seKey)) || segList()[0];
    seKey = seg.key;
    const r = rows.find((x) => x.seg.key === seg.key);
    const cand = S.staff.filter((x) => x.active && !r.workers.some((w) => w.name === x.name));
    const d = new Date(date + 'T00:00:00');
    const body = `
      <div class="segTabs">${rows.map((x) => `<button type="button" class="${x.seg.key === seg.key ? 'on' : ''}" data-act="seTab" data-k="${date}" data-seg="${x.seg.key}">${esc(x.seg.name)}<small class="${x.diff < 0 ? 'short' : ''}">${!needsOn() ? `${x.assigned}명` : x.diff < 0 ? `${-x.diff}명 부족` : '충족'}</small></button>`).join('')}</div>
      <div class="edStat ${r.diff < 0 ? 'short' : 'ok'}"><b>${!needsOn() ? `배치 ${r.assigned}명` : r.diff < 0 ? `${-r.diff}명 부족` : r.diff > 0 ? `${r.diff}명 여유` : '필요 인원 충족'}</b><span>${needsOn() ? `배치 ${r.assigned}명 · 필요 ${r.minimum}명 (${KIND_LABEL[dayKind(date)]}) · ` : ''}${esc(seg.time)}</span></div>
      <div class="mlabel">배치된 근무자</div>
      <div class="edWorkers">${r.workers.length ? r.workers.map((w) => { const onLeave = r.leave.includes(w.name); return `<article class="${onLeave ? 'onLeave' : ''}">
        <div><b>${esc(w.name)}</b> <span class="tb ${empCls(w.type)}">${esc(empLabel(w.type))}</span>${w.note ? `<small>${esc(fmtNote(w.note))}</small>` : ''}</div>
        <div class="wflags">
          <label><input type="checkbox" data-act="seFlag" data-k="${date}" data-n="${esc(w.name)}" data-f="leader"${w.leader ? ' checked' : ''}> 구간 책임자</label>
          <label><input type="checkbox" data-act="seFlag" data-k="${date}" data-n="${esc(w.name)}" data-f="special"${w.special ? ' checked' : ''}> 휴무일 출근</label>
          <label><input type="checkbox" data-act="seFlag" data-k="${date}" data-n="${esc(w.name)}" data-f="leave"${onLeave ? ' checked' : ''}> 휴가·부재</label>
        </div>
        <div class="rowbtns" style="margin:6px 0 0"><button type="button" class="btn sm ghost" data-act="seNote" data-k="${date}" data-n="${esc(w.name)}">시간 메모</button><button type="button" class="btn sm ghost danger" data-act="seRemove" data-k="${date}" data-n="${esc(w.name)}">배치 제외</button></div>
      </article>`; }).join('') : '<div class="tkEmptyLog">이 구간에 배치된 근무자가 없습니다.</div>'}</div>
      <div class="mlabel">근무자 추가</div>
      <div class="addWorker">
        <label>직원<select id="seStaff">${cand.map((x) => `<option value="${x.id}">${esc(x.name)} (${(x.roles || []).join('·')})${isOffDay(x, date) ? ' — 고정 휴무일' : ''}${healthOf(x).level === 'expired' ? ' — ⚠️ 보건증 만료' : ''}</option>`).join('')}<option value="__new">직접 입력 (명단에 없는 사람)</option></select></label>
        <label id="seNameWrap" hidden>이름<input id="seName" placeholder="근무자 이름" autocomplete="off"></label>
        <div class="frow">
          <label>근무 형태<select id="seType">${Object.entries(EMP_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>시간 메모 <span class="opt">선택</span><input id="seNoteIn" placeholder="예: 10시출근 · 14시퇴근" autocomplete="off"></label>
        </div>
        <label class="chk"><input type="checkbox" id="seAll" checked> 오늘 모든 구간에 함께 배치</label>
        <button type="button" class="btn primary" style="width:100%" data-act="seAdd" data-k="${date}" data-seg="${seg.key}">+ 배치 추가</button>
      </div>`;
    modal(`${mdLabel(date)} ${WD[d.getDay()]}요일 근무 배치`, body, null, '완료');
    const sel = $('#seStaff');
    const syncType = () => { const st = S.staff.find((x) => x.id === sel.value); $('#seNameWrap').hidden = sel.value !== '__new'; if (st && st.type) $('#seType').value = st.type; };
    sel.addEventListener('change', syncType); syncType();
    $('#modal').dataset.sched = date;
  }

  function seAddFrom(date, segKey) {
    const sel = $('#seStaff'); if (!sel) return;
    let st = null, name = '';
    if (sel.value === '__new') { name = $('#seName').value.trim(); if (!name) { alert('이름을 적어 주세요.'); return; } }
    else { st = S.staff.find((x) => x.id === sel.value); if (!st) { alert('추가할 직원이 없습니다.'); return; } name = st.name; }
    const w = { name, staffId: st ? st.id : undefined, type: $('#seType').value, leader: false, special: isOffDay(st, date), note: $('#seNoteIn').value.trim() };
    const keys = $('#seAll').checked ? (st && st.segs && st.segs.length ? st.segs : segList().map((x) => x.key)) : [segKey];
    const n = addWorker(date, keys, w);
    logSched(`${mdLabel(date)} ${name} 배치 (${n}개 구간)`);
    save(); render(); schedEdit(date, segKey);
  }

  /* 이전 달 패턴 복사 — 같은 주차·같은 요일끼리. 휴가·메모·휴무일 출근 표시는 복사하지 않는다 */
  function copyMonthPreview(srcM, dstM) {
    const sc = schedOf();
    const bySlot = {};
    Object.entries(sc.days).filter(([k]) => k.startsWith(srcM)).forEach(([k, d]) => { bySlot[`${weekIdxOf(k)}:${new Date(k + 'T00:00:00').getDay()}`] = d; });
    const maxWeek = {};
    Object.keys(bySlot).forEach((slot) => { const [w, dow] = slot.split(':'); maxWeek[dow] = Math.max(maxWeek[dow] || 0, Number(w)); });
    const out = {}; let copiedDays = 0, copiedAssignments = 0, excluded = 0;
    monthDates(dstM).forEach((k) => {
      const dow = new Date(k + 'T00:00:00').getDay();
      let src = bySlot[`${weekIdxOf(k)}:${dow}`] || (maxWeek[dow] != null ? bySlot[`${maxWeek[dow]}:${dow}`] : null);
      if (!src || !src.segs) return;
      const segs = {}; let any = false;
      Object.entries(src.segs).forEach(([key, x]) => {
        const ws = (x.workers || []).filter((w) => { const st = S.staff.find((s2) => s2.name === w.name); if (st && !st.active) { excluded++; return false; } return true; })
          .map((w) => ({ name: w.name, staffId: w.staffId, type: w.type, leader: !!w.leader, special: false, note: '' }));
        if (ws.length) { segs[key] = { workers: ws, leave: [] }; any = true; copiedAssignments += ws.length; }
      });
      if (any) { out[k] = { segs }; copiedDays++; }
    });
    let shortSegs = 0;
    Object.keys(out).forEach((k) => segList().forEach((sg) => { const x = out[k].segs[sg.key] || { workers: [] }; if (x.workers.length < (Number((sg.need || {})[dayKind(k)]) || 0)) shortSegs++; }));
    return { days: out, copiedDays, copiedAssignments, excluded, shortSegs };
  }
  let cmPrev = null;
  function schedMonthModal() {
    const m = monthKey(), sc = schedOf();
    const months = [...new Set(Object.keys(sc.days).filter((k) => sc.days[k] && sc.days[k].segs && Object.keys(sc.days[k].segs).length).map((k) => k.slice(0, 7)))].filter((x) => x !== m).sort().reverse();
    const filled = monthDates(m).filter(dayHasAny).length;
    modal(`${monthLabel(m)} 월 관리`, `
      <div class="mlabel">새 달 초안 만들기 — 이전 달 패턴 복사</div>
      ${months.length ? `<div class="frow"><label>가져올 원본 월<select id="cmSrc">${months.map((x) => `<option value="${x}"${cmPrev && cmPrev.src === x ? ' selected' : ''}>${monthLabel(x)}</option>`).join('')}</select></label>
        <button type="button" class="btn" style="align-self:end" data-act="cmPreview">복사 결과 미리보기</button></div>` : '<p class="hint">복사할 수 있는 다른 달 근무표가 아직 없습니다.</p>'}
      ${cmPrev && cmPrev.dst === m ? `<div class="copyPrev"><div class="cpHead"><b>${monthLabel(m)} 초안 미리보기</b><span>아직 저장되지 않았습니다</span></div>
        <div class="cpStats"><span><b>${cmPrev.copiedDays}일</b>패턴 적용</span><span><b>${cmPrev.copiedAssignments}건</b>근무 배치</span><span><b>${cmPrev.excluded}건</b>퇴사·비활성으로 제외</span><span><b>${cmPrev.shortSegs}곳</b>인원 부족</span></div>
        <p class="hint">휴가·시간 메모·휴무일 출근 표시는 복사하지 않았고, 공휴일과 필요 인원은 새달 기준으로 다시 계산했습니다.${filled ? ` <b style="color:var(--crit)">이미 배치된 ${filled}일은 덮어씁니다.</b>` : ''}</p>
        <button type="button" class="btn primary" style="width:100%" data-act="cmApply">이대로 ${monthLabel(m)}에 적용</button></div>` : ''}
      <div class="mlabel" style="margin-top:20px">빈 날 자동 채우기</div>
      <p class="hint">배치가 없는 날(오늘 이후)에 재직 직원을 고정 휴무일을 피해 넣습니다. 직원 명단에서 정한 <b>기본 구간</b>이 있으면 그 구간에만, 없으면 모든 구간에 넣습니다.</p>
      <button type="button" class="btn" style="width:100%" data-act="cmAuto">빈 날 자동 채우기</button>
      <div class="mlabel" style="margin-top:20px">초기화</div>
      <button type="button" class="btn danger" style="width:100%" data-act="cmClear">${monthLabel(m)} 배치 전부 비우기 (${filled}일)</button>
    `, null, '닫기');
  }

  function schedRulesModal() {
    const sc = schedOf();
    modal('운영 기준 · 공휴일', `
      <div class="mlabel">시간대별 최소 필요 인원 <span class="opt">저장 즉시 모든 날짜에 다시 계산</span></div>
      <div class="tkLogWrap"><table class="tkLog rulesT"><thead><tr><th>근무 구간</th><th>평일</th><th>금</th><th>토</th><th>일·공휴일</th></tr></thead>
        <tbody>${sc.segments.map((sg) => `<tr><td style="text-align:left"><input class="rlName" data-rule="${sg.key}:name" value="${esc(sg.name)}"><input class="rlTime" data-rule="${sg.key}:time" value="${esc(sg.time)}"></td>
          ${['weekday', 'friday', 'saturday', 'holiday'].map((k) => `<td><input type="number" class="rlN" min="0" max="20" data-rule="${sg.key}:${k}" value="${sg.need[k]}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">구간 이름과 시간도 여기서 바꿀 수 있습니다. 인원 기준(2인/3인)은 설정에서 바꾸면 처음 기본값에만 반영되고, 이 표가 우선입니다.</p>
      <div class="mlabel" style="margin-top:18px">공휴일 관리 <span class="opt">등록한 날짜는 요일과 관계없이 일요일·공휴일 기준</span></div>
      <div id="hdList">${sc.holidays.slice().sort((p2, q) => p2.date.localeCompare(q.date)).map((hd, i) => `<div class="frow hdRow"><label>날짜<input type="date" data-hd="${i}:date" value="${hd.date}"></label><label>이름<input data-hd="${i}:name" value="${esc(hd.name)}" placeholder="예: 광복절"></label><button type="button" class="more" data-act="hdDel" data-i="${i}" aria-label="삭제" style="align-self:end">✕</button></div>`).join('')}</div>
      <button type="button" class="btn sm" data-act="hdAdd">+ 공휴일 추가</button>
    `, () => {
      const segs = sc.segments.map((sg) => ({ ...sg, need: { ...sg.need } }));
      document.querySelectorAll('[data-rule]').forEach((el) => {
        const [key, k] = el.dataset.rule.split(':'); const sg = segs.find((x) => x.key === key); if (!sg) return;
        if (k === 'name') sg.name = el.value.trim() || sg.name; else if (k === 'time') sg.time = el.value.trim(); else sg.need[k] = Math.max(0, Number(el.value) || 0);
      });
      const hds = sc.holidays.slice().sort((p2, q) => p2.date.localeCompare(q.date));
      document.querySelectorAll('[data-hd]').forEach((el) => { const [i, k] = el.dataset.hd.split(':'); if (hds[i]) hds[i][k] = el.value.trim(); });
      sc.segments = segs; sc.holidays = hds.filter((x) => x.date && x.name);
      logSched('운영 기준·공휴일 수정'); save(); render();
    }, '저장');
  }

  /* ── 인쇄용 보기 (A4 가로 · 주차별 한 페이지) ── */
  function printSchedule() {
    const m = monthKey(), dates = monthDates(m), weeks = {};
    dates.forEach((k) => { (weeks[weekIdxOf(k)] = weeks[weekIdxOf(k)] || []).push(k); });
    const html = `<div class="pwPages">${Object.entries(weeks).map(([w, ks]) => `<section class="pw">
      <header><div><b>🦀 해모닉 ${esc(storeName())}</b><h3>${monthLabel(m)} 근무표 · ${Number(w) + 1}주차</h3></div><span>출력일 ${new Date().toLocaleDateString('ko-KR')}</span></header>
      <div class="pwGrid">${ks.map((k) => { const d = new Date(k + 'T00:00:00'), hol = holidayOf(k); return `<article style="grid-column:${((d.getDay() + 6) % 7) + 1}">
        <div class="pwDay"><b>${d.getDate()}일</b><span>${WD[d.getDay()]}요일${hol ? ' · ' + esc(hol.name) : ''}</span></div>
        ${dayRows(k).map((r) => `<div class="pwShift"><span><b>${esc(r.seg.name)}</b><small>${esc(r.seg.time)}</small></span><p>${r.active.map((w2) => esc(w2.name) + (w2.note ? ` <small>(${esc(fmtNote(w2.note))})</small>` : '')).join(', ') || '배치 없음'}</p><em class="${r.diff < 0 ? 'short' : 'ok'}">${r.diff < 0 ? `${-r.diff}명 부족` : '충족'}</em></div>`).join('')}
      </article>`; }).join('')}</div></section>`).join('')}</div>`;
    let box = $('#printBox');
    if (!box) { box = document.createElement('div'); box.id = 'printBox'; document.body.appendChild(box); }
    box.innerHTML = html;
    document.body.classList.add('printMode');
    const land = document.createElement('style'); land.id = 'pageLand'; land.textContent = '@page{size:A4 landscape;margin:10mm}'; document.head.appendChild(land);
    const done = () => { document.body.classList.remove('printMode'); window.removeEventListener('afterprint', done); box.innerHTML = ''; land.remove(); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { alert('이 화면에서는 인쇄가 막혀 있습니다.'); } setTimeout(done, 1500); }, 50);
  }

  /* ── 원가 관리 (매입) ─────────────────────────────────────── */
  const fmtWon = (n) => (Number(n) || 0).toLocaleString('ko-KR') + '원';

  function vCosts() {
    const m = S.ui.cmonth || dateKey().slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const list = (S.purchases || []).filter((x) => (x.date || '').slice(0, 7) === m)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

    const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
    // 같은 달 매출(회계 › 매출 입력 + 마감 정산 입력분) → 원가율
    const sales = monthSales(m);
    const byCat = {};
    list.forEach((x) => { byCat[x.cat] = (byCat[x.cat] || 0) + (Number(x.amount) || 0); });

    let h = `<div class="hd">
      <div><h2>원가 관리</h2><div class="sub">매입한 것을 그때그때 적어두면 월말에 원가율이 저절로 나옵니다. 직원 누구나 입력할 수 있습니다.</div></div>
      <div class="mnav">
        <button class="dnav" data-act="cmonthNav" data-d="-1" aria-label="이전 달">‹</button>
        <span class="mtitle">${y}년 ${mo}월</span>
        <button class="dnav" data-act="cmonthNav" data-d="1" aria-label="다음 달">›</button>
        <button class="btn" data-act="purchaseCsv">CSV 가져오기</button>
        <button class="btn primary" data-act="purchaseAdd">+ 매입 입력</button>
      </div>
    </div>`;

    h += `<div class="cards m4">
      <div class="card"><div class="cl">이번 달 매입</div><div class="cv sm2">${fmtWon(total)}</div><div class="cs">${list.length}건</div></div>
      <div class="card"><div class="cl">이번 달 매출</div><div class="cv sm2">${sales ? fmtWon(sales) : '–'}</div><div class="cs">회계 › 매출 입력 기준</div></div>
      <div class="card${sales && total / sales > 0.45 ? ' warn' : ''}"><div class="cl">원가율</div>
        <div class="cv">${sales ? Math.round(total / sales * 100) : '–'}<small>${sales ? '%' : ''}</small></div>
        <div class="cs">매입 ÷ 매출</div></div>
      <div class="card"><div class="cl">최다 분류</div>
        <div class="cv sm2">${Object.keys(byCat).length ? Object.entries(byCat).sort((a, b) => b[1] - a[1])[0][0] : '–'}</div></div>
    </div>`;

    if (Object.keys(byCat).length) {
      const mx = Math.max(...Object.values(byCat), 1);
      h += `<div class="hd sub2"><h3>분류별 매입</h3></div><div class="loads">
        ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="lrow"><span class="ln">${esc(c)}</span>
          <span class="lbar"><i style="width:${v / mx * 100}%"></i></span><span class="lv">${fmtWon(v)}</span></div>`).join('')}</div>`;
    }

    h += `<div class="hd sub2"><h3>매입 내역</h3><span class="hint" style="margin:0">분류 · 품목 · <b>수량</b> · <b>거래처</b> · 금액 · 기록자 — 줄을 누르면 수정</span></div>`;
    if (!list.length) {
      h += `<div class="notice"><b>이번 달 매입 기록이 없습니다.</b>
        <div class="hint">입고될 때마다 <b>+ 매입 입력</b>으로 바로 적어두세요. 영수증이 쌓이고 나서 몰아 적으면 반드시 빠집니다.</div></div>`;
    } else {
      let lastDate = '';
      h += `<div class="plist">`;
      list.forEach((x) => {
        if (x.date !== lastDate) {
          lastDate = x.date;
          const d = new Date(x.date + 'T00:00:00');
          h += `<div class="pdate">${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}</div>`;
        }
        h += `<button class="prow" data-act="purchaseEdit" data-id="${x.id}">
          <span class="chip cat">${esc(x.cat)}</span>
          <span class="pnm">${esc(x.name)}</span>
          <span class="pqty">${x.qty ? `${esc(x.qty)}<small>${esc(x.unit || '')}</small>` : '<small class="dim">수량 없음</small>'}</span>
          <span class="pvendor">${x.vendor ? `🏷 ${esc(x.vendor)}` : '<small class="dim">거래처 없음</small>'}</span>
          <span class="pamt">${fmtWon(x.amount)}</span>
          <span class="pby">${esc(x.by || '')}</span>
        </button>`;
      });
      h += `</div>`;
    }
    return h;
  }

  function purchaseForm(x) {
    const isNew = !x; x = x || { date: dateKey(), cat: PURCHASE_CATS[0], unit: 'kg' };
    modal(isNew ? '매입 입력' : '매입 수정', `
      <div class="frow">
        <label>날짜<input type="date" id="puD" value="${esc(x.date)}"></label>
        <label>분류<select id="puC">${PURCHASE_CATS.map((c) => `<option${c === x.cat ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <label>품목<input id="puN" value="${esc(x.name || '')}" placeholder="예: 러시아 대게 활"></label>
      <div class="frow">
        <label>수량 <span class="opt">선택</span><input type="number" id="puQ" min="0" step="0.1" value="${x.qty ?? ''}" inputmode="decimal"></label>
        <label>단위<select id="puU">${PURCHASE_UNITS.map((u) => `<option${u === x.unit ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
      </div>
      <label>금액 (원)<input type="number" id="puA" min="0" step="100" value="${x.amount ?? ''}" inputmode="numeric" placeholder="예: 480000"></label>
      <label>거래처 <span class="opt">선택</span><input id="puV" value="${esc(x.vendor || '')}"></label>
      <label>메모 <span class="opt">선택</span><input id="puM" value="${esc(x.memo || '')}"></label>
      ${isNew ? '' : `<div class="rowbtns"><button class="btn danger sm" data-act="purchaseDel" data-id="${x.id}">이 내역 삭제</button></div>`}
    `, () => {
      const name = $('#puN').value.trim();
      const amount = Number($('#puA').value);
      if (!name) { alert('품목을 입력하세요.'); return false; }
      if (!amount) { alert('금액을 입력하세요.'); return false; }
      const rec = {
        id: x.id || 'p' + Date.now(), date: $('#puD').value || dateKey(), cat: $('#puC').value,
        name, qty: $('#puQ').value ? Number($('#puQ').value) : null, unit: $('#puU').value,
        amount, vendor: $('#puV').value.trim(), memo: $('#puM').value.trim(),
        by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || x.by || '', createdAt: x.createdAt || Date.now(),
      };
      if (x.id) S.purchases = S.purchases.map((p2) => (p2.id === x.id ? rec : p2));
      else S.purchases.push(rec);
      S.ui.cmonth = rec.date.slice(0, 7);
      save(); render();
    }, '저장');
  }

  /* ── 월간 공지 ───────────────────────────────────────────── */
  function vNotices() {
    const m = S.ui.nmonth || dateKey().slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const list = (S.notices || []).filter((n) => n.month === m)
      .sort((a, b) => (b.pin - a.pin) || (b.createdAt || 0) - (a.createdAt || 0));

    let h = `<div class="hd">
      <div><h2>월간 공지</h2><div class="sub">이번 달 모두가 알아야 할 것 — 가격 변동, 행사, 주의사항. 📌 고정하면 할 일 화면 맨 위에도 보입니다.</div></div>
      <div class="mnav">
        <button class="dnav" data-act="nmonthNav" data-d="-1" aria-label="이전 달">‹</button>
        <span class="mtitle">${y}년 ${mo}월</span>
        <button class="dnav" data-act="nmonthNav" data-d="1" aria-label="다음 달">›</button>
        <button class="btn primary" data-act="noticeAdd">+ 공지 추가</button>
      </div>
    </div>`;

    if (!list.length) {
      h += `<div class="notice"><b>${mo}월 공지가 없습니다.</b>
        <div class="hint">예: "이번 주 킹크랩 시세 인상 — 안내 멘트 통일", "15일 단체 예약 30명" 처럼 한 달 동안 반복해서 말하게 되는 것을 올려두세요.</div></div>`;
    } else {
      h += list.map((n) => `<button class="ncard${n.pin ? ' pinned' : ''}" data-act="noticeOpen" data-id="${n.id}">
        <div class="rcTop"><span class="rcName">${n.pin ? '📌 ' : ''}${esc(n.title)}</span></div>
        ${n.body ? `<div class="nbody">${esc(n.body.split('\n')[0])}</div>` : ''}
        <div class="rcMeta">${esc(n.by || '')}${n.createdAt ? ' · ' + new Date(n.createdAt).toLocaleDateString('ko-KR') : ''}</div>
      </button>`).join('');
    }
    return h;
  }

  function noticeForm(n) {
    const isNew = !n; n = n || { month: S.ui.nmonth || dateKey().slice(0, 7) };
    modal(isNew ? '공지 추가' : '공지 수정', `
      <label>제목<input id="noT" value="${esc(n.title || '')}" placeholder="예: 킹크랩 시세 인상 안내"></label>
      <label>내용 <span class="opt">선택</span><textarea id="noB" rows="4">${esc(n.body || '')}</textarea></label>
      <label class="chk"><input type="checkbox" id="noP"${n.pin ? ' checked' : ''}> 📌 이번 달 내내 할 일 화면 위에 고정</label>
      ${isNew ? `<label class="chk"><input type="checkbox" id="noTg" checked> 텔레그램 방에도 바로 알리기</label>` : ''}
    `, () => {
      const title = $('#noT').value.trim();
      if (!title) { alert('제목을 입력하세요.'); return false; }
      const rec = {
        id: n.id || 'n' + Date.now(), month: n.month, title, body: $('#noB').value.trim(),
        pin: $('#noP').checked, by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || n.by || '',
        createdAt: n.createdAt || Date.now(),
      };
      if (n.id) S.notices = S.notices.map((x) => (x.id === n.id ? rec : x));
      else S.notices.push(rec);
      save(); render();
      const tg = $('#noTg');
      if (tg && tg.checked) {
        sendTelegram(`\u{1F4E2} [${storeName()} 공지] ${rec.title}${rec.body ? '\n' + rec.body : ''}${rec.by ? '\n- ' + rec.by : ''}`)
          .then((r) => banner(r.ok ? '공지를 텔레그램으로 보냈습니다' : '텔레그램 전송 실패', r.ok ? rec.title : r.err));
      }
    }, '저장');
  }

  function noticeShow(id) {
    const n = (S.notices || []).find((x) => x.id === id); if (!n) return;
    modal(n.title, `
      ${n.body ? `<div class="rcBody">${esc(n.body)}</div>` : ''}
      <p class="hint">${esc(n.by || '')}${n.createdAt ? ' · ' + new Date(n.createdAt).toLocaleDateString('ko-KR') : ''}${n.pin ? ' · 📌 고정됨' : ''}</p>
      <div class="rowbtns">
        <button class="btn" data-act="noticeEdit" data-id="${n.id}">수정</button>
        <button class="btn" data-act="noticeSend" data-id="${n.id}">텔레그램 전송</button>
        <button class="btn danger" data-act="noticeDel" data-id="${n.id}">삭제</button>
      </div>`, null);
  }

  /* ── 이슈 노트 ───────────────────────────────────────────── */
  let issueFilter = 'open', issueCat = 'all';

  function vIssues() {
    let list = issuesAll().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (issueStore !== 'all') list = list.filter((x) => (x.store || '') === issueStore);
    const openN = list.filter((x) => x.status !== 'done').length;
    if (issueFilter === 'open') list = list.filter((x) => x.status !== 'done');
    if (issueFilter === 'done') list = list.filter((x) => x.status === 'done');
    if (issueCat !== 'all') list = list.filter((x) => x.cat === issueCat);

    let h = `<div class="hd">
      <div><h2>트러블시트</h2><div class="sub">두 매장이 같이 보는 기록입니다. 크고 작은 일을 그날 바로 적고, 어떻게 해결했는지까지 남기세요. 같은 실수가 줄어듭니다.</div></div>
      <button class="btn primary" data-act="issueAdd" style="margin-left:auto">+ 트러블 등록</button>
    </div>`;

    h += `<div class="rcbar">
      <div class="filters">
        ${[['all', '두 매장 전부'], ...(Store.meta ? Store.meta.stores.map((st) => [st.name, st.name]) : [])].map(([k, n]) =>
          `<button class="fl${issueStore === k ? ' on' : ''}" data-act="issueStoreF" data-s="${esc(k)}">${esc(n)}</button>`).join('')}
      </div>
      <div class="filters">
        ${[['open', `진행 중 ${openN}`], ['done', '해결 완료'], ['all', '전체']].map(([k, n]) =>
          `<button class="fl${issueFilter === k ? ' on' : ''}" data-act="issueFilter" data-f="${k}">${n}</button>`).join('')}
      </div>
      <div class="filters">
        ${['all', ...ISSUE_CATS, ...[...new Set(issuesAll().map((i2) => i2.cat).filter((c) => c && !ISSUE_CATS.includes(c)))]].map((c) => `<button class="fl${issueCat === c ? ' on' : ''}" data-act="issueCatF" data-c="${esc(c)}">${c === 'all' ? '분류 전체' : esc(c)}</button>`).join('')}
      </div>
    </div>`;

    if (!list.length) {
      h += `<div class="notice"><b>${issueFilter === 'open' ? '진행 중인 트러블이 없습니다.' : '기록이 없습니다.'}</b>
        <div class="hint">예: "룸2 에어컨 소음 — 손님 컴플레인", "찜 시간 안내가 사람마다 다름". 잘잘못을 따지는 곳이 아니라 <b>다음에 어떻게 할지</b>를 남기는 곳입니다.</div></div>`;
    } else {
      h += list.map((x) => `<button class="icard" data-act="issueOpen" data-id="${x.id}">
        <div class="rcTop">
          <span class="ipill${x.status === 'done' ? ' done' : ''}">${x.status === 'done' ? '해결 완료' : '진행 중'}</span>
          <span class="chip store">${esc(x.store || '')}</span><span class="chip cat">${esc(x.cat)}</span>
          <span class="rcMeta" style="margin-left:auto">${esc(x.by || '')} · ${new Date(x.createdAt).toLocaleDateString('ko-KR')}</span>
        </div>
        <div class="rcName">${esc(x.title)}</div>
        ${x.body ? `<div class="nbody">${esc(x.body.split('\n')[0])}</div>` : ''}
        ${(x.replies || []).length ? `<div class="rcMeta">💬 덧글 ${x.replies.length}</div>` : ''}
      </button>`).join('');
    }
    return h;
  }

  function issueForm(x) {
    const isNew = !x; x = x || { cat: ISSUE_CATS[0] };
    const curBy = x.by || (S.ui.whoDate === dateKey() ? S.ui.who : '') || '';
    modal(isNew ? '트러블 등록' : '트러블 수정', `
      <div class="mlabel">종류</div>
      <div class="roles wrap" id="isCats">${ISSUE_CATS.map((c) => `<button type="button" class="rl${c === x.cat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <input id="isCOther" placeholder="다른 종류 직접 입력" value="${x.cat && !ISSUE_CATS.includes(x.cat) ? esc(x.cat) : ''}" style="margin-top:6px">
      <label>제목<input id="isT" value="${esc(x.title || '')}" placeholder="예: 룸2 에어컨 소음 — 손님 컴플레인"></label>
      <label>무슨 일이 있었나요<textarea id="isB" rows="4" placeholder="상황을 그대로 적으세요. 잘잘못보다 다음에 어떻게 할지가 중요합니다.">${esc(x.body || '')}</textarea></label>
      <label>작성자<input id="isBy" value="${esc(curBy)}" placeholder="이름을 적어 주세요" autocomplete="off"></label>
      <div class="roles wrap sm" id="isByChips">${S.staff.filter((st) => st.active).map((st) => `<button type="button" class="rl" data-who="${esc(st.name)}">${esc(st.name)}</button>`).join('')}</div>
      ${isNew ? `<label class="chk"><input type="checkbox" id="isTg" checked> 텔레그램 방에 공유 (다른 매장도 봅니다)</label>` : ''}
    `, () => {
      const title = $('#isT').value.trim();
      if (!title) { alert('제목을 입력하세요.'); return false; }
      const catSel = document.querySelector('#isCats .rl.on');
      const cat = $('#isCOther').value.trim() || (catSel ? catSel.dataset.cat : '');
      if (!cat) { alert('종류를 골라 주세요.'); return false; }
      const by = $('#isBy').value.trim();
      if (!by) { alert('작성자를 적어 주세요.'); return false; }
      const rec = {
        id: x.id || 'i' + Date.now(), cat, title, body: $('#isB').value.trim(),
        status: x.status || 'open', replies: x.replies || [],
        by, createdAt: x.createdAt || Date.now(), store: x.store || storeName(), updatedAt: Date.now(),
      };
      if (x.id) SH.issues = issuesAll().map((i2) => (i2.id === x.id ? rec : i2));
      else issuesAll().push(rec);
      saveShared(); render();
      const tg = $('#isTg');
      if (tg && tg.checked) {
        sendTelegram(`\u{1F4DD} [${rec.store} 트러블] ${rec.cat} — ${rec.title}${rec.body ? '\n' + rec.body : ''}${rec.by ? '\n- ' + rec.by : ''}`)
          .then((r) => banner(r.ok ? '텔레그램으로 공유했습니다' : '텔레그램 전송 실패', r.ok ? rec.title : r.err));
      }
    }, '저장');
    $('#isCats').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return;
      $('#isCats').querySelectorAll('.rl').forEach((el) => el.classList.remove('on')); b.classList.add('on'); $('#isCOther').value = ''; });
    $('#isCOther').addEventListener('input', () => { if ($('#isCOther').value.trim()) $('#isCats').querySelectorAll('.rl').forEach((el) => el.classList.remove('on')); });
    $('#isByChips').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; $('#isBy').value = b.dataset.who; });
  }

  function issueShow(id) {
    const x = issuesAll().find((i2) => i2.id === id); if (!x) return;
    modal(x.title, `
      <div class="rcTop"><span class="ipill${x.status === 'done' ? ' done' : ''}">${x.status === 'done' ? '해결 완료' : '진행 중'}</span>
        <span class="chip store">${esc(x.store || '')}</span><span class="chip cat">${esc(x.cat)}</span>
        <span class="opt">${esc(x.by || '')} · ${new Date(x.createdAt).toLocaleDateString('ko-KR')}</span></div>
      ${x.body ? `<div class="rcBody">${esc(x.body)}</div>` : ''}
      ${(x.replies || []).map((r) => `<div class="irep${r.fix ? ' fix' : ''}">${r.fix ? '✅ ' : ''}${esc(r.text)}
        <div class="rcMeta">${esc(r.by || '')} · ${new Date(r.at).toLocaleDateString('ko-KR')}</div></div>`).join('')}
      <label>덧글 · 해결 내용<textarea id="isR" rows="2" placeholder="해본 것, 알게 된 것을 남기세요"></textarea></label>
      <div class="rowbtns">
        <button class="btn" data-act="issueReply" data-id="${x.id}">덧글 남기기</button>
        ${x.status === 'done'
          ? `<button class="btn ghost" data-act="issueReopen" data-id="${x.id}">다시 열기</button>`
          : `<button class="btn primary" data-act="issueDone" data-id="${x.id}">해결 완료로</button>`}
      </div>
      <div class="rowbtns">
        <button class="btn sm" data-act="issueEdit" data-id="${x.id}">수정</button>
        <button class="btn sm" data-act="issueSend" data-id="${x.id}">텔레그램 공유</button>
        <button class="btn sm danger" data-act="issueDel" data-id="${x.id}">삭제</button>
      </div>`, null);
  }

  /* ── 설정: 직원 매장 탭 ──────────────────────────────────── */
  let staffTab = null, otherDoc = null, otherDocId = null;

  /* 다른 매장의 직원 명단을 고치려면 그 매장 문서를 불러와야 한다.
     아직 한 번도 연 적 없는 매장이면 기본 상태를 만들어 저장해 둔다 — 그래야 나중에 전환했을 때 그 직원이 그대로 있다. */
  async function loadOtherDoc(id) {
    otherDocId = id;
    let doc = await Store.loadStore(id);
    if (!doc) { doc = freshState(id); await Store.saveStore(id, doc); }
    if (!doc.staff) doc.staff = DEFAULT_STAFF.map((x) => ({ ...x }));
    migrateRoles(doc);
    if (otherDocId === id) { otherDoc = doc; render(); }
  }

  /* 직원 편집 대상 — 현재 매장이면 S, 아니면 불러온 다른 매장 문서 */
  function staffCtx(storeId) {
    const mt = Store.meta;
    if (!mt || !storeId || storeId === mt.current) return { doc: S, cur: true };
    return { doc: otherDoc, cur: false, id: storeId };
  }
  function staffCommit(ctx) {
    if (ctx.cur) { save(); render(); }
    else { Store.saveStore(ctx.id, ctx.doc); render(); }
  }

  /* ── 직원 명단 ───────────────────────────────────────────── */
  /* 매장 탭으로 나눠 두 매장을 한 화면에서 관리한다.
     현재 매장은 S.staff, 다른 매장은 그 매장의 저장 문서를 직접 읽어 고친다. */
  function staffSection() {
    const mt = Store.meta;
    const tab = staffTab || (mt ? mt.current : 'ansan');
    const isCur = !mt || tab === mt.current;
    const tabName = mt ? (mt.stores.find((x) => x.id === tab) || {}).name : '';
    let h = '';
    h += `<div class="hd sub2"><h3>직원</h3></div>
      <p class="hint">매장 이름은 <b>안산점 · 안양점</b>으로 고정되어 있습니다. 직원 명단은 매장마다 따로이며, 아래 탭을 눌러 각 매장 직원을 입력하세요.</p>
      <div class="filters stabs">${(mt ? mt.stores : []).map((st) =>
        `<button class="fl${st.id === tab ? ' on' : ''}" data-act="staffTab" data-id="${st.id}">${esc(st.name)} 직원${st.id === mt.current ? ' <small>(현재 매장)</small>' : ''}</button>`).join('')}</div>`;

    const list = isCur ? S.staff : (otherDoc && otherDoc.staff) || null;
    if (!list) {
      h += `<div class="notice"><span class="hint">${esc(tabName)} 직원 명단을 불러오는 중…</span></div>`;
    } else {
      h += `<div class="staffbox${isCur ? '' : ' other'}"><div class="sbhead">${esc(tabName)} 직원 ${list.length}명${isCur ? '' : ' — 여기서 고친 내용은 ' + esc(tabName) + '으로 전환했을 때 그대로 반영됩니다'}</div>`;
      h += list.map((s2) => `<div class="rcard">
        <input class="sel" data-act="staffName" data-store="${tab}" data-id="${s2.id}" value="${esc(s2.name)}" aria-label="이름">
        <div class="roles">${ROLES.map((x) => `<button class="rl${(s2.roles || []).includes(x) ? ' on' : ''}" data-act="staffRole" data-store="${tab}" data-id="${s2.id}" data-r="${x}">${x}</button>`).join('')}</div>
        <button class="more" data-act="staffDel" data-store="${tab}" data-id="${s2.id}" aria-label="삭제">✕</button>
        <div class="stRule">
          <label>고용 형태<select class="stSel" data-act="staffType" data-store="${tab}" data-id="${s2.id}">${Object.entries(EMP_TYPES).map(([k, v]) => `<option value="${k}"${(s2.type || 'regular') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
          <div><span class="stLbl">고정 휴무</span><div class="roles sm">${WD.map((n, i) => `<button class="rl${(s2.offDays || []).includes(i) ? ' on' : ''}" data-act="staffOff" data-store="${tab}" data-id="${s2.id}" data-d="${i}">${n}</button>`).join('')}</div></div>
          <div><span class="stLbl">기본 구간 <small>(비우면 모든 구간)</small></span><div class="roles sm">${SEGMENTS_DEFAULT.map((sg) => `<button class="rl${(s2.segs || []).includes(sg.key) ? ' on' : ''}" data-act="staffSeg" data-store="${tab}" data-id="${s2.id}" data-k="${sg.key}">${(segList().find((x) => x.key === sg.key) || sg).name}</button>`).join('')}</div></div>
          <label>이메일 <small>(급여명세서용 · 다음 버전)</small><input type="email" class="stSel" data-act="staffEmail" data-store="${tab}" data-id="${s2.id}" value="${esc(s2.email || '')}" placeholder="name@example.com"></label>
        </div></div>`).join('');
      h += `<button class="add" data-act="staffAdd" data-store="${tab}">+ ${esc(tabName)} 직원 추가</button></div>`;
    }

    return h;
  }

  function vStaff() {
    let h = `<div class="hd"><div><h2>직원 명단</h2><div class="sub">매장마다 따로 관리합니다. 이름을 고치면 할 일·근무표에 바로 반영됩니다.</div></div>
      <button class="btn" data-act="view" data-v="contracts" style="margin-left:auto">📄 근로계약서</button></div>`;
    h += staffSection();
    const noC = S.staff.filter((st) => st.active && !(S.contracts || []).some((c) => c.staffId === st.id && contractStatus(c).k === 'done'));
    if (noC.length) h += `<div class="notice warn" style="margin-top:16px"><b>체결된 근로계약서가 없는 직원 ${noC.length}명</b> — ${noC.map((x) => esc(x.name)).join(' · ')}
      <div class="hint">근로기준법 제17조: 근로계약은 서면(전자문서 포함)으로 명시하고 교부해야 합니다. <button class="btn sm" data-act="view" data-v="contracts">지금 작성하기</button></div></div>`;
    return h;
  }

  /* ── 근로계약서 (전자 체결) ──────────────────────────────── */
  /* 참고: 스시메이커 전자 근로계약서 페이지 구조를 따른다 —
     6단계 카드 · 단계마다 확인 체크 · 진행률 · 사업주 정보는 고정 · 대표자 도장은 설정에 한 번 등록 ·
     근로자가 직접 입력하고 화면에 서명 · 임시 저장 · 서명 완료 → 인쇄(PDF).
     S.contracts[] : { id, staffId, staffName, f:{...}, status:'draft'|'void', sig:{employer, worker},
                       emp{스냅샷}, frozen, hash, doneAt, files[{id,chunks,kind,name,type,size}], delivered[] }
     S.blobs[id]   : 서명·도장·첨부 dataURL — 클라우드에는 조각으로 따로 (store.js)
     주민등록번호는 서명 완료 때 뒷자리를 가려 저장하고, 전체 번호는 그 순간 인쇄본에만 들어간다. */
  let cOpen = null, cFilter = 'all', cMode = null;   // cMode 'edit' = 작성 화면(다시 그리지 않는다)
  let edSens = { front: '', back: '' };               // 주민번호 — 메모리에만
  let edFull = null;                                  // 서명 직후 인쇄 한 번에만 쓰는 전체 주민번호

  const fmtNum = (n) => (Number(n) || 0).toLocaleString('ko-KR');
  const kdate = (k) => { if (!k) return ''; const [y, m, d] = k.split('-'); return `${y}년 ${Number(m)}월 ${Number(d)}일`; };
  const newId = (pf) => pf + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stamp = () => { const d = new Date(); return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const minWage = () => Number(S.settings.minWage) || MIN_WAGE.hour;

  const DUTY_OPTS = ['갑각류(수조) 관리', '홀 서빙·고객 응대', '주방 조리', '주방 보조', '카운터·예약 응대', '청소·마감'];
  const DUTY_BY_ROLE2 = { [ROLE_MGR]: ['갑각류(수조) 관리', '카운터·예약 응대'], '홀': ['홀 서빙·고객 응대', '청소·마감'], '주방': ['주방 조리', '주방 보조'] };
  const WORK_TYPES = ['주간근무제', '교대근무제', '야간근무제', '격일근무제', '기타'];
  const WEEKLY_NOTE = '주휴수당은 4주 평균 1주 소정근로시간이 15시간 이상이고 해당 주의 소정근로일을 개근하는 등 관계 법령상 요건을 충족할 때 적용합니다. 약정하지 않은 대타 근무는 당초 약정한 소정근로시간에 포함되는지에 따라 판단하며, 주휴수당 산정 대상이 아닌 대타 근로시간은 약정 시급을 기준으로 지급합니다.';
  const ACKS = [
    ['주민등록번호·신분증 처리 확인', '세무·4대보험 신고를 위한 민감정보 제출 목적과 안전한 보관 필요성을 확인했습니다.'],
    ['계약기간 및 담당업무 확인', '근로계약기간, 근무 장소, 담당업무와 수습 적용 여부를 확인했습니다.'],
    ['근로시간 및 휴게시간 확인', '근무일별 근로시간과 휴게시간을 확인했습니다.'],
    ['임금과 휴일 확인', '임금 구성, 계산·지급 방법, 지급일 및 휴일·휴가 내용을 확인했습니다.'],
    ['계약서 교부 확인', '서명 완료 후 근로자가 같은 계약서를 PDF로 저장하거나 교부받을 수 있음을 확인했습니다.'],
    ['전자문서·전자서명 동의', '본인이 입력한 전자서명을 이 근로계약서에 사용하는 것에 동의합니다.'],
    ['전체 계약조건 최종 확인', '위 계약조건을 읽고 이해했으며 사실과 일치함을 확인했습니다.'],
  ];

  function bizOf() {
    if (!S.settings.biz) S.settings.biz = { name: '해모닉 ' + storeName(), rep: '', reg: '', addr: '', phone: '' };
    const b = S.settings.biz;
    ['name', 'rep', 'reg', 'addr', 'phone'].forEach((k) => { if (b[k] == null) b[k] = ''; });
    return b;
  }
  const bizReady = () => { const b = bizOf(); return !!(b.name && b.rep && b.addr); };
  const sealRef = () => (S.settings.seal && S.settings.seal.id ? S.settings.seal : null);

  async function sha256(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return 'fnv-' + h.toString(16);
    }
  }
  function putBlob(prefix, dataUrl) {
    if (!S.blobs) S.blobs = {};
    const id = newId(prefix);
    S.blobs[id] = dataUrl;
    return { id, chunks: Math.max(1, Math.ceil(dataUrl.length / Store.BLOB_CHUNK)) };
  }
  const blobUrl = (ref) => (ref && ref.id && S.blobs && S.blobs[ref.id]) || '';
  function dropBlob(ref) { if (ref && ref.id && S.blobs) delete S.blobs[ref.id]; }

  function contractStatus(c) {
    if (c.status === 'void') return { k: 'void', l: '무효', cls: 'void' };
    const e = c.sig && c.sig.employer, w = c.sig && c.sig.worker;
    if (e && w) return { k: 'done', l: '체결 완료', cls: 'done' };
    if (e || w) return { k: 'half', l: e ? '근로자 서명 대기' : '사업주 날인 대기', cls: 'wait' };
    return { k: 'draft', l: '작성 중', cls: 'draft' };
  }
  const isSigned = (c) => !!(c.sig && (c.sig.employer || c.sig.worker));
  const cById = (id) => (S.contracts || []).find((c) => c.id === id);
  const staffById = (id) => S.staff.find((x) => x.id === id);
  const cName = (c) => (c.f && c.f.worker && c.f.worker.name) || c.staffName || (staffById(c.staffId) || {}).name || '(이름 없음)';
  const acksDone = (c) => (c.f.acks || []).filter(Boolean).length;

  function breakMinutes(f) {
    if (f.breakFrom && f.breakTo) { let m = minutesOf(f.breakTo) - minutesOf(f.breakFrom); if (m < 0) m += 1440; return m; }
    return Number(f.breakMin) || 0;
  }
  function weeklyHours(f) {
    const a = minutesOf(f.from), b = minutesOf(f.to);
    if (a == null || b == null) return 0;
    let m = b - a; if (m < 0) m += 1440;
    m -= breakMinutes(f);
    return Math.max(0, Math.round((m * (f.days || []).length) / 6) / 10);
  }
  const payLabel = (f) => `${PAY_TYPES[f.payType] || '시급'} ${fmtNum(f.pay)}원`;
  const dutiesOf = (f) => (f.duties && f.duties.length ? f.duties : (f.duty ? [f.duty] : []));
  const payDayText = (f) => f.payDayText || (f.payDay ? `매월 ${f.payDay}일` : '');
  const weeklyOffText = (f) => f.weeklyOffText || (f.weeklyOff != null ? `매주 ${WD[f.weeklyOff]}요일` : '');
  const typeOf = (f) => (f.end ? 'fixed' : (f.type === 'part' ? 'part' : 'regular'));

  function contractDefaults(st) {
    const role = (st && st.roles && st.roles[0]) || '홀';
    const prev = st ? (S.contracts || []).filter((c) => c.staffId === st.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] : null;
    const pw = (prev && prev.f && prev.f.worker) || {};
    const bz = bizOf();
    return {
      start: dateKey(), end: '',
      place: bz.name + (bz.addr ? ' (' + bz.addr + ')' : ''),
      duties: (DUTY_BY_ROLE2[role] || ['홀 서빙·고객 응대']).slice(), dutyOther: '',
      probMonths: 0, probPay: '',
      days: [1, 2, 3, 4, 5, 6], from: S.settings.openTime || '11:00', to: S.settings.closeTime || '22:00', breakFrom: '15:00', breakTo: '16:00', workType: '주간근무제',
      payType: 'hour', pay: minWage(), payDayText: '매월 10일', payHow: 'bank', weeklyOffText: '매주 일요일', leaveRule: '관계 법령과 취업규칙에 따름', allowance: '',
      ins: { ei: true, wc: true, np: true, hi: true },
      worker: { name: st ? st.name : '', phone: pw.phone || '', addr: pw.addr || '', rrn: '' },
      extra: '이 계약서에 정하지 않은 사항은 취업규칙 및 관계 법령에 따릅니다.',
      acks: ACKS.map(() => false), finalAgree: false, signer: st ? st.name : '', signDate: dateKey(),
    };
  }
  function newContract(st) {
    const rec = { id: newId('k'), staffId: st.id, staffName: st.name, f: contractDefaults(st), status: 'draft', sig: {}, files: [], delivered: [],
      createdAt: Date.now(), by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '' };
    S.contracts.push(rec);
    return rec;
  }

  /* ── 목록 ── */
  function vContracts() {
    const list = (S.contracts || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (cOpen) {
      const c = cById(cOpen);
      if (c && cMode === 'edit' && !isSigned(c) && c.status !== 'void') return contractEditor(c);
      cMode = null;
      if (c) return contractDetail(c);
      cOpen = null;
    }

    let h = `<div class="hd">
      <div><h2>근로계약서</h2><div class="sub">직원별 근로계약서를 한곳에 모아 두고, 근로자가 직접 확인·입력하고 화면에서 서명해 체결합니다.</div></div>
      <button class="btn primary" data-act="cAdd" style="margin-left:auto">+ 새 계약서</button>
    </div>`;

    if (!bizReady() || !sealRef()) h += `<div class="notice warn"><b>${!bizReady() ? '사업장 정보(상호·대표자·주소)가 비어 있습니다.' : '대표자 도장이 아직 없습니다.'}</b>
      ${!sealRef() ? '도장을 등록해 두면 근로자가 서명하는 순간 자동으로 날인되어 사장님이 따로 서명하지 않아도 됩니다.' : ''}
      <button class="btn sm" data-act="view" data-v="settings">설정에서 입력</button></div>`;

    const act = S.staff.filter((x) => x.active);
    h += `<div class="cgrid">
      <button class="ccard${cFilter === 'all' ? ' on' : ''}" data-act="cFilter" data-s="all"><div class="ccName">전체</div><div class="ccMeta">${list.length}건</div></button>
      ${act.map((st) => {
        const mine = list.filter((c) => c.staffId === st.id);
        const done = mine.find((c) => contractStatus(c).k === 'done');
        const half = mine.find((c) => contractStatus(c).k === 'half');
        const badge = done ? `<span class="cst done">체결 ${done.doneAt ? done.doneAt.slice(0, 10) : ''}</span>`
          : half ? `<span class="cst wait">${contractStatus(half).l}</span>`
          : mine.length ? '<span class="cst draft">작성 중</span>' : '<span class="cst none">계약서 없음</span>';
        return `<button class="ccard${cFilter === st.id ? ' on' : ''}" data-act="cFilter" data-s="${st.id}">
          <div class="ccName">${esc(st.name)}<small>${(st.roles || []).join('·')}</small></div><div class="ccMeta">${badge}</div></button>`;
      }).join('')}
    </div>`;

    const rows = cFilter === 'all' ? list : list.filter((c) => c.staffId === cFilter);
    h += `<div class="hd sub2"><h3>계약서 목록</h3><span class="hint" style="margin:0">${cFilter === 'all' ? '전체' : esc((staffById(cFilter) || {}).name || '')} ${rows.length}건 · 줄을 누르면 열립니다</span></div>`;
    if (!rows.length) {
      h += `<div class="tkEmptyLog">아직 계약서가 없습니다. <b>+ 새 계약서</b>로 시작하세요.<div class="hint">기존 종이 계약서는 새 계약서를 만든 뒤 <b>첨부</b>로 사진·PDF를 넣어 두면 됩니다.</div></div>`;
    } else {
      h += `<div class="tkLogWrap"><table class="tkLog cList">
        <thead><tr><th>직원</th><th>종류</th><th>근로기간</th><th>근무</th><th>임금</th><th>확인</th><th>상태</th><th>체결일</th><th>교부</th><th>첨부</th></tr></thead>
        <tbody>${rows.map((c) => { const st = contractStatus(c), f = c.f; return `<tr class="cRow" data-act="cOpen" data-id="${c.id}">
          <td><b>${esc(cName(c))}</b></td>
          <td>${{ regular: '무기', fixed: '기간제', part: '단시간' }[typeOf(f)]}</td>
          <td>${f.start ? f.start.slice(2) : ''} ~ ${f.end ? f.end.slice(2) : '∞'}</td>
          <td class="mut">주 ${(f.days || []).length}일 · ${weeklyHours(f)}h</td>
          <td class="r">${esc(payLabel(f))}</td>
          <td class="mut">${acksDone(c)}/${ACKS.length}</td>
          <td><span class="cst ${st.cls}">${st.l}</span></td>
          <td class="mut">${c.doneAt ? c.doneAt.slice(0, 10) : '—'}</td>
          <td class="mut">${(c.delivered || []).length ? '✓ ' + c.delivered[c.delivered.length - 1].at.slice(0, 10) : '—'}</td>
          <td class="mut">${(c.files || []).length ? '📎 ' + c.files.length : ''}</td></tr>`; }).join('')}</tbody>
      </table></div>`;
    }
    h += `<details class="notice" style="margin-top:20px"><summary><b>전자 근로계약, 이렇게 하면 됩니다</b></summary>
      <ol class="std">
        <li>설정에서 <b>사업장 정보</b>와 <b>대표자 도장</b>을 한 번만 등록합니다. 모든 계약서에 고정으로 들어갑니다.</li>
        <li><b>+ 새 계약서</b>로 직원을 고르면 6단계 화면이 열립니다. 근로자가 매장 아이패드·PC에서 직접 인적사항을 넣고, 단계마다 <b>확인 체크</b>를 합니다. 조건은 사장님이 미리 넣어 두어도 됩니다.</li>
        <li>마지막 단계에서 근로자가 화면에 <b>서명</b>하면 대표자 도장이 함께 날인되어 체결됩니다. 그 순간 내용이 잠기고 확인번호(SHA-256)가 붙습니다.</li>
        <li>바로 <b>인쇄/PDF</b> 창이 열립니다. 저장한 PDF를 직원에게 주면 교부(근로기준법 제17조)까지 끝납니다. 언제든 다시 인쇄·내려받기할 수 있습니다.</li>
      </ol>
      <div class="hint">주민등록번호는 서명 완료 시점에 뒷자리를 가려 저장하고(예: 900101-1******), 전체 번호는 그때 만드는 인쇄본에만 들어갑니다. 신분증·증빙사진은 계약서와 함께 보관됩니다.</div>
    </details>`;
    return h;
  }

  /* ── 상세 (체결본 보기) ── */
  function contractDetail(c) {
    const st = contractStatus(c), f = c.f, name = cName(c);
    const e = c.sig && c.sig.employer, w = c.sig && c.sig.worker;
    const step = (on, done, label, sub) => `<div class="step${done ? ' done' : on ? ' on' : ''}"><div class="stDot">${done ? '✓' : ''}</div><div><div class="stL">${label}</div><div class="stS">${sub || ''}</div></div></div>`;

    let h = `<div class="hd">
      <div><button class="btn sm ghost" data-act="cBack" style="margin:0 0 6px">‹ 목록</button>
        <h2>${esc(name)} 근로계약서</h2><div class="sub">${CONTRACT_TYPES[typeOf(f)] || ''} · ${esc(payLabel(f))} · <span class="cst ${st.cls}">${st.l}</span></div></div>
    </div>`;

    h += `<div class="steps">
      ${step(st.k === 'draft', st.k !== 'draft', '작성 · 확인', `${acksDone(c)}/${ACKS.length} 확인` + (c.by ? ' · ' + esc(c.by) : ''))}
      ${step(!!w && !e, !!w, '근로자 서명', w ? esc(w.name) + ' · ' + w.at : '대기')}
      ${step(!!w && !e, !!e, '사업주 날인', e ? esc(e.name) + (e.seal ? ' (인)' : ' 서명') + ' · ' + e.at : '대기')}
      ${step(false, st.k === 'done', '체결 · 교부', st.k === 'done' ? ((c.delivered || []).length ? '교부 ' + c.delivered[c.delivered.length - 1].at.slice(0, 10) : '아직 교부 전') : '')}
    </div>`;

    if (st.k === 'void') h += `<div class="notice warn"><b>무효 처리된 계약서입니다.</b> ${c.voidAt ? c.voidAt + ' · ' : ''}${esc(c.voidWhy || '')} 기록으로만 남습니다.</div>`;
    else if (st.k === 'done') h += `<div class="notice ok"><b>체결 완료.</b> 아래 문서는 서명 시점에 잠겼습니다. <span id="cVerify" class="hint" style="margin:0">위·변조 확인 중…</span>
      ${(c.delivered || []).length ? '' : '<div class="hint">아직 직원에게 사본을 주지 않았습니다. 인쇄하거나 파일로 내려받아 전달한 뒤 <b>교부 완료</b>를 눌러 두세요.</div>'}</div>`;
    else if (st.k === 'half') h += `<div class="notice"><b>${st.l}.</b> ${w ? (sealRef() ? '<b>도장 날인</b>을 누르면 체결됩니다.' : '설정에 대표자 도장을 등록하고 <b>도장 날인</b>을 누르거나, <b>사업주 서명</b>을 직접 하면 체결됩니다.') : '근로자가 작성 화면을 열어 서명하면 체결됩니다.'} 서명이 들어간 뒤에는 내용을 고칠 수 없습니다 — 고치려면 <b>복사해서 새 계약서</b>를 만드세요.</div>`;
    else h += `<div class="notice"><b>작성 중.</b> <b>작성 화면 열기</b>에서 근로자가 내용을 확인하고 서명합니다.</div>`;

    if (f.payType === 'hour' && Number(f.pay) < minWage()) h += `<div class="notice danger"><b>시급 ${fmtNum(f.pay)}원이 최저시급 ${fmtNum(minWage())}원보다 낮습니다.</b> 최저임금법 위반이 됩니다.</div>`;

    h += `<div class="rowbtns cActs">
      ${st.k === 'draft' ? `<button class="btn primary" data-act="cEdit" data-id="${c.id}">✏️ 작성 화면 열기</button>` : ''}
      ${st.k === 'half' && w && !e && sealRef() ? `<button class="btn primary" data-act="cStamp" data-id="${c.id}">🔴 도장 날인</button>` : ''}
      ${st.k === 'half' && w && !e ? `<button class="btn" data-act="cSign" data-id="${c.id}" data-who="employer">🖊 사업주 서명 (직접)</button>` : ''}
      <button class="btn" data-act="cPrint" data-id="${c.id}">🖨 인쇄 / PDF</button>
      <button class="btn" data-act="cDown" data-id="${c.id}">⬇ 파일 내려받기</button>
      ${st.k === 'done' ? `<button class="btn" data-act="cDeliver" data-id="${c.id}">📬 교부 완료 표시</button>` : ''}
      <button class="btn ghost" data-act="cCopy" data-id="${c.id}">복사해서 새 계약서</button>
      ${st.k === 'draft' ? `<button class="btn ghost danger" data-act="cDel" data-id="${c.id}">삭제</button>`
        : st.k === 'void' ? `<button class="btn ghost danger" data-act="cDel" data-id="${c.id}">기록 삭제</button>`
        : `<button class="btn ghost danger" data-act="cVoid" data-id="${c.id}">무효 처리</button>`}
    </div>`;

    h += contractPaper(c);

    const files = c.files || [];
    h += `<div class="hd sub2"><h3>첨부 파일</h3><span class="hint" style="margin:0">${files.length}개 · 사진은 자동으로 줄여 저장합니다</span>
      <button class="btn sm" data-act="cAttach" data-id="${c.id}" style="margin-left:auto">+ 첨부</button></div>`;
    h += files.length ? `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>구분</th><th>파일</th><th class="r">크기</th><th>올린 사람</th><th>일시</th><th></th><th></th></tr></thead>
      <tbody>${files.map((fl) => `<tr><td>${{ id: '신분증', photo: '증빙사진' }[fl.kind] || '첨부'}</td><td><b>${esc(fl.name)}</b></td><td class="r">${Math.round((fl.size || 0) / 1024)} KB</td>
        <td>${esc(fl.by || '')}</td><td class="mut">${fl.at || ''}</td>
        <td><button class="btn sm" data-act="cFileOpen" data-id="${c.id}" data-fid="${fl.id}">열기</button></td>
        <td><button class="more" data-act="cFileDel" data-id="${c.id}" data-fid="${fl.id}" aria-label="삭제">✕</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="tkEmptyLog">첨부가 없습니다. 예전에 종이로 쓴 계약서가 있으면 사진으로 찍어 넣어 두세요.</div>`;

    if ((c.delivered || []).length) h += `<div class="hd sub2"><h3>교부 기록</h3></div><div class="loads">${c.delivered.map((d) => `<div class="lrow"><span class="ln">${d.at}</span><span class="lv" style="min-width:0;text-align:left">${esc(d.how)}</span></div>`).join('')}</div>`;
    if (c.hash) setTimeout(() => verifyContract(c), 0);
    return h;
  }

  async function verifyContract(c) {
    const el = $('#cVerify'); if (!el) return;
    const cur = JSON.stringify(frozenPayload(c));
    const ok = cur === c.frozen && (await sha256(c.frozen)) === c.hash;
    el.innerHTML = ok ? `✅ 위·변조 없음 · 확인번호 <code>${c.hash.slice(0, 12)}</code>` : `❌ 서명 이후 내용이 바뀌었습니다. 확인번호 <code>${c.hash.slice(0, 12)}</code>`;
    el.style.color = ok ? '' : 'var(--crit)';
  }
  const frozenPayload = (c) => ({ v: 2, staffName: cName(c), f: c.f, emp: c.emp });

  /* ── 작성 화면 (6단계) — 근로자가 직접 채우고 서명한다 ── */
  function contractEditor(c) {
    const f = c.f, bz = bizOf(), st = staffById(c.staffId);
    if (!f.acks || f.acks.length !== ACKS.length) f.acks = ACKS.map((_, i) => !!(f.acks || [])[i]);
    const fld = (label, inner, full, note) => `<div class="edField${full ? ' full' : ''}"><label>${label}</label>${inner}${note ? `<small class="edNote">${note}</small>` : ''}</div>`;
    const fixed = (label, v) => fld(label, `<input value="${esc(v)}" readonly>`, false, '고정 정보 — 설정에서 바꿉니다');
    const ack = (i) => `<label class="clause"><input type="checkbox" class="ack" data-i="${i}"${f.acks[i] ? ' checked' : ''}><span><strong>${ACKS[i][0]}</strong><small>${ACKS[i][1]}</small></span></label>`;
    const sel = (id, opts, cur) => `<select id="${id}">${opts.map((o) => Array.isArray(o) ? `<option value="${o[0]}"${String(o[0]) === String(cur) ? ' selected' : ''}>${esc(o[1])}</option>` : `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const idFile = (c.files || []).find((x) => x.kind === 'id'), photos = (c.files || []).filter((x) => x.kind === 'photo');
    const done = acksDone(c), pct = Math.round(done / ACKS.length * 100);
    const seal = sealRef();

    return `<div class="edHero"><div class="edEye">HAEMONIC · E-CONTRACT</div><h2>해모닉 근로계약서 <span class="chip store">${esc(storeName())}</span></h2>
      <p>계약 내용을 한 단계씩 확인하고 이 화면에서 직접 서명할 수 있습니다.</p>
      <button class="btn sm ghost edBack" data-act="cSaveBack" data-id="${c.id}">‹ 저장하고 목록으로</button></div>
    <div id="cEd" data-id="${c.id}">
    <div class="edProg"><div class="edProgRow"><span id="edProgT">필수 확인 ${done} / ${ACKS.length}</span><span id="edProgP">${pct}%</span></div><div class="bar"><i id="edProgB" style="width:${pct}%"></i></div></div>
    <div class="edWarn">관리자 확인: 수습기간 임금·계약해지 조항은 근로형태에 따라 적용이 달라질 수 있어 자동 문구로 확정하지 않았습니다. 실제 사용 전 노무사 검토를 권합니다.</div>

    <section class="edCard"><h3><span class="edStep">1</span>사용자 및 근로자</h3><div class="edGrid">
      ${fixed('상호', bz.name)}${fixed('대표자', bz.rep)}
      ${fld('사업장 주소', `<input value="${esc(bz.addr)}" readonly>`, true, '고정 정보')}
      ${fld('근로자 성명', `<input data-f="worker.name" value="${esc(f.worker.name || '')}" placeholder="성명" required>`)}
      ${fld('연락처', `<input data-f="worker.phone" value="${esc(f.worker.phone || '')}" inputmode="tel" placeholder="010-0000-0000" required>`)}
      ${fld('근로자 주소', `<input data-f="worker.addr" value="${esc(f.worker.addr || '')}" placeholder="주소" required>`, true)}
      ${fld('주민등록번호 <small>(선택)</small>', `<div class="rrn"><input id="edRrnF" inputmode="numeric" maxlength="6" placeholder="앞 6자리" value="${esc(edSens.front)}" autocomplete="off"><span class="rrnSep">-</span><input id="edRrnB" type="password" inputmode="numeric" maxlength="7" placeholder="뒤 7자리" value="${esc(edSens.back)}" autocomplete="off"></div>
        <button type="button" class="btn sm ghost" id="edRrnToggle" style="margin:6px 0 0">뒷자리 표시</button>
        <p class="edSens">세무·4대보험 신고 목적의 민감정보입니다. 저장본에는 뒷자리를 가려(●●●●●●) 남기고, 전체 번호는 서명 완료 때 만드는 인쇄본에만 들어갑니다.</p>`, true)}
      ${fld('신분증 사본 첨부', `<input type="file" id="edIdFile" accept="image/*,.pdf" capture="environment"><small>사진은 계약서 인쇄본에 함께 표시됩니다. PDF는 파일명만 남습니다.</small>
        <img id="edIdPrev" class="edPrev${idFile && blobUrl(idFile) && !(idFile.type || '').includes('pdf') ? ' show' : ''}" src="${idFile && !(idFile.type || '').includes('pdf') ? blobUrl(idFile) : ''}" alt="신분증 미리보기">
        ${idFile ? `<div class="hint">첨부됨: ${esc(idFile.name)}</div>` : ''}`, true)}
      ${fld('근로자 사진·계약 관련 증빙사진 첨부 <span class="opt">최대 3장</span>', `<input type="file" id="edPhotoFile" accept="image/*" capture="environment"><small>카메라로 찍거나 사진첩에서 고릅니다. 첨부한 사진은 인쇄본에도 함께 표시됩니다.</small>
        <div class="edPhotos" id="edPhotos">${photos.map((p2) => `<img src="${blobUrl(p2)}" alt="${esc(p2.name)}">`).join('')}</div>`, true)}
    </div>${ack(0)}</section>

    <section class="edCard"><h3><span class="edStep">2</span>계약기간과 업무</h3><div class="edGrid">
      ${fld('근로계약 시작일', `<input type="date" data-f="start" value="${f.start}" required>`)}
      ${fld('근로계약 종료일', `<input type="date" data-f="end" value="${f.end || ''}">`, false, '기간의 정함이 없으면 비워 두세요.')}
      ${fld('근무 장소', `<input data-f="place" value="${esc(f.place)}">`, true)}
      ${fld('업무 내용 <span class="opt">복수 선택</span>', `<div class="edDuties" id="edDuties">${DUTY_OPTS.map((d) => `<button type="button" class="rl${dutiesOf(f).includes(d) ? ' on' : ''}" data-d="${esc(d)}">${esc(d)}</button>`).join('')}</div>
        <input data-f="dutyOther" value="${esc(f.dutyOther || '')}" placeholder="그 밖의 업무 직접 입력" style="margin-top:8px">`, true)}
      ${fld('수습기간', sel('edProb', [[0, '없음'], ...Array.from({ length: 12 }, (_, i) => [i + 1, (i + 1) + '개월'])], f.probMonths || 0))}
      ${fld('수습기간 임금', `<input data-f="probPay" value="${esc(f.probPay || '')}" placeholder="예: 정한 임금의 90% (1년 이상 계약 시)">`)}
    </div>${ack(1)}</section>

    <section class="edCard"><h3><span class="edStep">3</span>근무일·근로시간·휴게시간</h3><div class="edGrid">
      ${fld('근무 요일', `<div class="edDays" id="edDays">${WD.map((n, i) => `<button type="button" class="rl day${(f.days || []).includes(i) ? ' on' : ''}" data-d="${i}">${n}</button>`).join('')}</div>`, true)}
      ${fld('근무 시작', `<input type="time" data-f="from" value="${f.from}" required>`)}${fld('근무 종료', `<input type="time" data-f="to" value="${f.to}" required>`)}
      ${fld('휴게 시작', `<input type="time" data-f="breakFrom" value="${f.breakFrom || ''}">`)}${fld('휴게 종료', `<input type="time" data-f="breakTo" value="${f.breakTo || ''}">`)}
      ${fld('근무형태', sel('edWorkType', WORK_TYPES, f.workType || WORK_TYPES[0]), true)}
      <div class="edField full"><div class="hint" id="edHours" style="margin:0"></div></div>
    </div>${ack(2)}</section>

    <section class="edCard"><h3><span class="edStep">4</span>임금·지급일·휴일</h3><div class="edGrid">
      ${fld('임금 형태', sel('edPayType', Object.entries(PAY_TYPES).map(([k, v]) => [k, v + '제']), f.payType))}
      ${fld('기본 임금 (원)', `<input type="number" data-f="pay" inputmode="numeric" min="0" step="10" value="${f.pay}" required>`, false, '<span id="edWage"></span>')}
      ${fld('임금 지급일', `<input data-f="payDayText" value="${esc(payDayText(f))}" placeholder="예: 매월 10일" required>`)}
      ${fld('지급 방법', sel('edPayHow', [['bank', '근로자 명의 계좌 지급'], ['cash', '직접 지급']], f.payHow))}
      ${fld('주휴일', `<input data-f="weeklyOffText" value="${esc(weeklyOffText(f))}" placeholder="예: 매주 일요일">`)}
      ${fld('휴일·휴가', `<input data-f="leaveRule" value="${esc(f.leaveRule || '')}">`)}
      ${fld('4대보험', `<div class="edDuties" id="edIns">${[['ei', '고용보험'], ['wc', '산재보험'], ['np', '국민연금'], ['hi', '건강보험']].map(([k, l]) => `<button type="button" class="rl${f.ins && f.ins[k] ? ' on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>`, true, '주 15시간 미만 단시간 근로자는 국민연금·건강보험 의무가입 대상이 아닐 수 있습니다. 산재보험은 항상 적용됩니다.')}
      ${fld('수당 및 기타 임금 조건', `<textarea data-f="allowance" placeholder="연장·야간·휴일근로 수당, 식대 등">${esc(f.allowance || '')}</textarea>`, true)}
      ${fld('주휴수당 적용 안내', `<textarea readonly>${WEEKLY_NOTE}</textarea>`, true, '고정 문구')}
    </div>${ack(3)}</section>

    <section class="edCard"><h3><span class="edStep">5</span>기타 조건 및 최종 확인</h3>
      ${fld('기타 합의사항', `<textarea data-f="extra">${esc(f.extra || '')}</textarea>`, true)}
      ${ack(4)}${ack(5)}${ack(6)}</section>

    <section class="edCard"><h3><span class="edStep">6</span>대표자 도장 및 근로자 서명</h3><div class="edGrid">
      ${fld('서명자 성명', `<input data-f="signer" value="${esc(f.signer || f.worker.name || '')}" placeholder="근로자 본인 성명" required>`)}
      ${fld('서명일', `<input type="date" data-f="signDate" value="${f.signDate || dateKey()}" required>`)}
    </div>
      <p class="hint">대표자 도장은 계약서에 고정되어 있으며, 근로자는 아래 공간에 손가락 또는 마우스로 직접 서명합니다.</p>
      <div class="edSigs">
        <div><div class="sealBox">${seal ? `<img src="${blobUrl(seal)}" alt="대표자 도장">` : `<div class="sealNone">도장 미등록<small>설정 → 사업장 정보에서 등록하면 서명 즉시 자동 날인됩니다. 없으면 사장님이 나중에 직접 서명합니다.</small></div>`}</div><p class="sealLabel">대표자 ${esc(bz.rep)} (인)</p></div>
        <div><div class="signBox"><canvas id="edCv" aria-label="근로자 서명 입력란"></canvas><div class="signActs"><span id="edSignHint">서명 전</span><button type="button" class="btn sm ghost" id="edClear">서명 지우기</button></div></div><p class="sealLabel">근로자 서명</p></div>
      </div>
      <label class="agreement"><input type="checkbox" id="edFinal"${f.finalAgree ? ' checked' : ''}><span>본인은 위 근로계약 내용을 모두 확인했으며, 작성한 전자서명을 본인의 서명으로 사용하는 데 동의합니다.</span></label>
      <div class="edActions"><button type="button" class="btn" data-act="cSaveBack" data-id="${c.id}">임시 저장</button><button type="button" class="btn primary" id="edComplete">서명 완료 · PDF 저장</button></div>
      <div class="edStatus" id="edStatus"></div>
    </section>
    </div>`;
  }

  /* 작성 화면의 입력은 화면을 다시 그리지 않고 상태에 바로 쓴다 — 다시 그리면 서명이 지워진다 */
  function bindEditor() {
    const box = $('#cEd'); if (!box) return;
    const c = cById(box.dataset.id); if (!c) return;
    const f = c.f;
    const setPath = (path, v) => { const ks = path.split('.'); let o = f; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; o[ks[ks.length - 1]] = v; };
    const status = (t) => { const el = $('#edStatus'); if (el) el.textContent = t; };
    const hours = () => { const el = $('#edHours'); if (el) el.innerHTML = `1주 소정근로시간 약 <b>${weeklyHours(f)}시간</b> (주 ${(f.days || []).length}일 · 휴게 ${breakMinutes(f)}분 제외)${weeklyHours(f) >= 15 ? ' · 주휴수당 요건(15시간 이상)에 해당' : ' · 15시간 미만'}`; };
    const wage = () => {
      const el = $('#edWage'); if (!el) return; const mw = minWage(), v = Number(f.pay) || 0;
      if (f.payType === 'hour') el.innerHTML = v && v < mw ? `<b style="color:var(--crit)">최저시급 ${fmtNum(mw)}원보다 낮습니다</b>` : `최저시급 ${fmtNum(mw)}원 · 월 환산 약 ${fmtNum(Math.round(v * weeklyHours(f) * 4.345))}원`;
      else if (f.payType === 'month') el.textContent = `참고: 최저임금 월 환산(209시간) ${fmtNum(mw * 209)}원`;
      else el.textContent = '';
    };
    const progress = () => {
      const n = acksDone(c), p = Math.round(n / ACKS.length * 100);
      $('#edProgT').textContent = `필수 확인 ${n} / ${ACKS.length}`; $('#edProgP').textContent = p + '%'; $('#edProgB').style.width = p + '%';
    };

    const saved = () => { save(); const d = new Date(); status(`자동 저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`); };
    /* input 과 change 를 둘 다 받는다 — 아이패드·아이폰 사파리는 날짜·시간 칸에서 input 을 보내지 않는다 */
    box.querySelectorAll('[data-f]').forEach((el) => ['input', 'change'].forEach((ev) => el.addEventListener(ev, () => {
      let v = el.value; if (el.type === 'number') v = Number(v) || 0;
      setPath(el.dataset.f, typeof v === 'string' ? v.trim() : v);
      if (['from', 'to', 'breakFrom', 'breakTo', 'pay'].includes(el.dataset.f)) { hours(); wage(); }
      saved();
    })));
    $('#edProb').addEventListener('change', (e) => { f.probMonths = Number(e.target.value) || 0; save(); });
    $('#edWorkType').addEventListener('change', (e) => { f.workType = e.target.value; save(); });
    $('#edPayType').addEventListener('change', (e) => { f.payType = e.target.value; wage(); save(); });
    $('#edPayHow').addEventListener('change', (e) => { f.payHow = e.target.value; save(); });
    $('#edDuties').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; b.classList.toggle('on'); f.duties = [...box.querySelectorAll('#edDuties .rl.on')].map((x) => x.dataset.d); save(); });
    $('#edDays').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; b.classList.toggle('on'); f.days = [...box.querySelectorAll('#edDays .rl.on')].map((x) => Number(x.dataset.d)); hours(); wage(); save(); });
    $('#edIns').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; b.classList.toggle('on'); f.ins = Object.fromEntries([...box.querySelectorAll('#edIns .rl')].map((x) => [x.dataset.k, x.classList.contains('on')])); save(); });
    box.querySelectorAll('.ack').forEach((el) => el.addEventListener('change', () => { f.acks[Number(el.dataset.i)] = el.checked; progress(); save(); }));
    $('#edFinal').addEventListener('change', (e) => { f.finalAgree = e.target.checked; save(); });

    // 주민번호 — 메모리에만
    $('#edRrnF').addEventListener('input', (e) => { edSens.front = e.target.value.replace(/\D/g, '').slice(0, 6); e.target.value = edSens.front; });
    $('#edRrnB').addEventListener('input', (e) => { edSens.back = e.target.value.replace(/\D/g, '').slice(0, 7); e.target.value = edSens.back; });
    $('#edRrnToggle').addEventListener('click', () => { const b = $('#edRrnB'); const show = b.type === 'password'; b.type = show ? 'text' : 'password'; $('#edRrnToggle').textContent = show ? '뒷자리 숨기기' : '뒷자리 표시'; });

    // 첨부 — 신분증 1장(교체), 증빙사진 최대 3장
    $('#edIdFile').addEventListener('change', async (e) => {
      const fl = e.target.files[0]; if (!fl) return;
      const r = await fileToBlob(fl); if (!r) return;
      const old = (c.files || []).find((x) => x.kind === 'id'); if (old) { dropBlob(old); c.files = c.files.filter((x) => x !== old); }
      c.files = c.files || []; c.files.push({ ...r.ref, kind: 'id', name: fl.name, type: r.type, size: r.size, at: stamp(), by: f.worker.name || '' });
      const im = $('#edIdPrev'); if (r.type.startsWith('image/')) { im.src = S.blobs[r.ref.id]; im.classList.add('show'); } else { im.classList.remove('show'); }
      status(`신분증 첨부됨: ${fl.name}`); save();
    });
    $('#edPhotoFile').addEventListener('change', async (e) => {
      const fl = e.target.files[0]; if (!fl) return;
      if ((c.files || []).filter((x) => x.kind === 'photo').length >= 3) { status('증빙사진은 3장까지입니다. 상세 화면에서 지운 뒤 다시 넣어 주세요.'); return; }
      const r = await fileToBlob(fl); if (!r) return;
      c.files = c.files || []; c.files.push({ ...r.ref, kind: 'photo', name: fl.name, type: r.type, size: r.size, at: stamp(), by: f.worker.name || '' });
      $('#edPhotos').insertAdjacentHTML('beforeend', `<img src="${S.blobs[r.ref.id]}" alt="">`);
      status(`사진 첨부됨: ${fl.name}`); save();
    });

    const cv = $('#edCv'); initSigPad(cv, $('#edClear'), (drawn) => { $('#edSignHint').textContent = drawn ? '서명 입력됨' : '서명 전'; });

    $('#edComplete').addEventListener('click', () => {
      /* 빠진 것을 전부 모아 한 번에 보여준다 — 하나씩 조용히 막으면 "안 된다"로만 보인다 */
      box.querySelectorAll('.edField.miss').forEach((el) => el.classList.remove('miss'));
      const miss = []; let firstEl = null;
      const mark = (sel, label) => { miss.push(label); const el = sel ? box.querySelector(sel) : null; if (el) { (el.closest('.edField') || el.closest('.edCard') || el).classList.add('miss'); if (!firstEl) firstEl = el; } };
      const need = [['worker.name', '근로자 성명'], ['worker.phone', '연락처'], ['worker.addr', '근로자 주소'], ['start', '근로계약 시작일'], ['from', '근무 시작'], ['to', '근무 종료'], ['payDayText', '임금 지급일'], ['signer', '서명자 성명'], ['signDate', '서명일']];
      for (const [k, l] of need) { const v = k.split('.').reduce((o, x) => (o || {})[x], f); if (!v) mark(`[data-f="${k}"]`, l); }
      if (!(Number(f.pay) > 0)) mark('[data-f="pay"]', '기본 임금');
      if (f.end && f.end < f.start) mark('[data-f="end"]', '종료일이 시작일보다 앞섭니다');
      if (!dutiesOf(f).length && !f.dutyOther) mark('#edDuties', '업무 내용 (하나 이상 선택)');
      if (!(f.days || []).length) mark('#edDays', '근무 요일 (하나 이상 선택)');
      /* 주민등록번호는 선택 — 넣었다면 13자리가 맞아야 한다 */
      const rrnTyped = edSens.front || edSens.back;
      if (rrnTyped && (!/^\d{6}$/.test(edSens.front) || !/^\d{7}$/.test(edSens.back))) mark('#edRrnF', '주민등록번호 (앞 6자리 · 뒤 7자리, 비워도 됩니다)');
      const ackLeft = f.acks.filter((x) => !x).length; if (ackLeft) mark('.ack', `계약조건 확인란 ${ackLeft}개 체크`);
      if (!cv._drawn) mark('#edCv', '근로자 서명 (서명 칸에 손가락이나 마우스로)');
      if (!f.finalAgree) mark('#edFinal', '전자서명 최종 동의 체크');
      if (f.signer && f.worker.name && f.signer.replace(/\s/g, '') !== f.worker.name.replace(/\s/g, '')) mark('[data-f="signer"]', '서명자 성명이 근로자 성명과 다릅니다');
      if (miss.length) {
        const msg = `아직 ${miss.length}가지가 남았습니다.\n\n· ${miss.join('\n· ')}\n\n붉게 표시된 칸을 채운 뒤 다시 눌러 주세요.`;
        status(`남은 항목 ${miss.length}개: ${miss.join(' · ')}`);
        banner(`서명을 완료하려면 ${miss.length}가지가 더 필요합니다`, miss.join(' · '));
        alert(msg);
        if (firstEl) { firstEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (firstEl.focus) setTimeout(() => firstEl.focus(), 300); }
        return;
      }
      if (f.payType === 'hour' && Number(f.pay) < minWage() && !confirm(`시급이 최저시급(${fmtNum(minWage())}원)보다 낮습니다. 최저임금법 위반이 될 수 있습니다. 그래도 진행할까요?`)) return;

      f.worker.rrn = rrnTyped ? `${edSens.front}-${edSens.back[0]}******` : '';
      edFull = rrnTyped ? `${edSens.front}-${edSens.back}` : null;
      c.emp = { ...bizOf() }; c.staffName = f.worker.name;
      c.sig = c.sig || {};
      c.sig.worker = { img: putBlob('sg', sigPng(cv)), name: f.signer, at: stamp() };
      const seal = sealRef();
      if (seal) c.sig.employer = { img: { ...seal }, name: bizOf().rep, at: stamp(), seal: true };
      edSens = { front: '', back: '' };
      finalizeSign(c, true);
    });

    hours(); wage(); progress();
  }

  async function fileToBlob(fl) {
    if (fl.size > 8 * 1024 * 1024) { alert('8MB 이하 파일만 넣을 수 있습니다.'); return null; }
    let dataUrl = await new Promise((res) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(fl); });
    let type = fl.type || 'application/octet-stream';
    if (type.startsWith('image/')) { dataUrl = await shrinkImage(fl, dataUrl); type = dataUrl.slice(5, dataUrl.indexOf(';')); }
    if (!type.includes('pdf') && dataUrl.length > 1.5 * 1024 * 1024) { alert('사진이 너무 큽니다. 다시 찍어 주세요.'); return null; }
    return { ref: putBlob('fl', dataUrl), type, size: Math.round(dataUrl.length * 0.75) };
  }
  /* 사진은 긴 변 1280px, 흰 배경 JPEG로 줄인다. createImageBitmap 은 휴대폰 사진의 회전 정보를 알아서 반영한다 */
  async function shrinkImage(fl, dataUrl) {
    try {
      let im;
      if ('createImageBitmap' in window) { try { im = await createImageBitmap(fl, { imageOrientation: 'from-image' }); } catch (e) { im = await createImageBitmap(fl); } }
      else im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const w = im.width || im.naturalWidth, h = im.height || im.naturalHeight;
      const r = Math.min(1, 1280 / Math.max(w, h));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * r)); cv.height = Math.max(1, Math.round(h * r));
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height);
      if (im.close) im.close();
      return cv.toDataURL('image/jpeg', 0.8);
    } catch (e) { return dataUrl; }
  }
  async function shrinkSeal(fl) {
    const im = await createImageBitmap(fl);
    const r = Math.min(1, 320 / Math.max(im.width, im.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(im.width * r); cv.height = Math.round(im.height * r);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }

  /* 사업주가 나중에 직접 서명하는 경우 (도장이 없을 때) */
  function signModal(c, who) {
    const f = c.f, name = who === 'employer' ? (c.emp ? c.emp.rep : bizOf().rep) : cName(c);
    const label = who === 'employer' ? '사업주' : '근로자';
    if (who === 'employer' && !bizReady()) { alert('설정 → 사업장 정보(상호·대표자·주소)를 먼저 채워 주세요.'); return; }
    modal(`${label} 서명 — ${name}`, `
      <div class="sgSum">
        <div><span>계약</span><b>${esc(CONTRACT_TYPES[typeOf(f)] || '')}</b></div>
        <div><span>기간</span><b>${kdate(f.start)}${f.end ? ' ~ ' + kdate(f.end) : ' ~ (정함 없음)'}</b></div>
        <div><span>근무</span><b>주 ${(f.days || []).length}일 · ${f.from}~${f.to} · 휴게 ${breakMinutes(f)}분</b></div>
        <div><span>임금</span><b>${esc(payLabel(f))} · ${esc(payDayText(f))}</b></div>
      </div>
      <label class="chk"><input type="checkbox" id="sgAgree"> 위 조건을 포함한 계약서 전문을 모두 읽고 이해했으며, 이 내용으로 근로계약을 체결하는 데 동의합니다.</label>
      <div class="mlabel">아래 칸에 손가락(또는 마우스)으로 서명하세요</div>
      <div class="sigPad"><canvas id="sgCv"></canvas><button type="button" class="btn sm ghost" id="sgClear">지우기</button></div>
      <label>서명자 이름 (본인 확인)<input id="sgName" placeholder="${esc(name)}" autocomplete="off"></label>
    `, () => {
      if (!$('#sgAgree').checked) { alert('계약 내용에 동의하는 칸을 체크해 주세요.'); return false; }
      const pad = $('#sgCv'); if (!pad._drawn) { alert('서명을 그려 주세요.'); return false; }
      const typed = $('#sgName').value.replace(/\s/g, '');
      if (!typed) { alert('서명자 이름을 적어 주세요.'); return false; }
      if (name && typed !== name.replace(/\s/g, '')) { alert(`이름이 계약서의 ${label} 이름(${name})과 다릅니다.`); return false; }
      if (!c.sig) c.sig = {};
      if (!isSigned(c)) { c.emp = { ...bizOf() }; c.staffName = cName(c); }
      c.sig[who] = { img: putBlob('sg', sigPng(pad)), name: typed, at: stamp() };
      finalizeSign(c, false);
    }, '서명 완료');
    initSigPad($('#sgCv'), $('#sgClear'));
  }
  function stampSeal(c) {
    const seal = sealRef(); if (!seal) { alert('설정 → 사업장 정보에서 대표자 도장을 먼저 등록하세요.'); return; }
    if (!c.sig) c.sig = {};
    if (!isSigned(c)) { c.emp = { ...bizOf() }; c.staffName = cName(c); }
    c.sig.employer = { img: { ...seal }, name: bizOf().rep, at: stamp(), seal: true };
    finalizeSign(c, false);
  }

  async function finalizeSign(c, printAfter) {
    if (!c.frozen) { c.frozen = JSON.stringify(frozenPayload(c)); c.hash = await sha256(c.frozen); }
    const st = contractStatus(c);
    if (st.k === 'done') {
      c.doneAt = stamp();
      sendTelegram(`\u{1F4C4} [${storeName()} 근로계약] ${cName(c)} — ${CONTRACT_TYPES[typeOf(c.f)] || ''} 체결 완료 (${payLabel(c.f)})`).then((r) => { if (r.ok) banner('근로계약 체결을 텔레그램으로 알렸습니다', cName(c)); });
    }
    cMode = null; save(); render(); window.scrollTo(0, 0);
    banner(st.k === 'done' ? '근로계약이 체결되었습니다' : '서명을 저장했습니다',
      st.k === 'done' ? `${cName(c)} · 인쇄 창에서 PDF로 저장해 직원에게 교부하세요.` : st.l + (st.k === 'half' && !c.sig.employer ? ' — 설정에 도장을 등록하면 바로 날인할 수 있습니다.' : ''));
    if (printAfter) setTimeout(() => printContract(c), 400);
  }

  function initSigPad(cv, clearBtn, onChange) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let on = false, last = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => { on = true; last = pt(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(last.x + 0.1, last.y); ctx.stroke(); cv._drawn = true; if (onChange) onChange(true); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (!on) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault(); });
    const up = () => { on = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
    clearBtn.addEventListener('click', () => { ctx.clearRect(0, 0, cv.width, cv.height); cv._drawn = false; if (onChange) onChange(false); });
  }
  function sigPng(cv) {
    const out = document.createElement('canvas'); out.width = 480; out.height = Math.round(480 * cv.height / cv.width);
    out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  /* ── 계약서 본문 (화면·인쇄·파일 공통) ── */
  const PAPER_CSS = `
.paper{background:#fff;color:#111;max-width:760px;margin:16px auto;padding:36px 40px;border:1px solid #d9d9d9;border-radius:4px;font-family:"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;font-size:14.5px;line-height:1.75;word-break:keep-all}
.paper h1{text-align:center;font-size:24px;letter-spacing:.3em;margin:0 0 18px;font-weight:800}
.paper .pIntro{margin:0 0 14px}
.paper ol.clauses{padding-left:0;list-style:none;margin:0;counter-reset:cl}
.paper ol.clauses>li{counter-increment:cl;margin:0 0 9px;padding-left:28px;position:relative}
.paper ol.clauses>li::before{content:counter(cl) ".";position:absolute;left:0;font-weight:700}
.paper ol.clauses ul{margin:2px 0 0;padding-left:16px}
.paper ol.clauses ul li{margin:0 0 2px;list-style:"- "}
.paper .pDate{text-align:center;margin:26px 0 18px;font-weight:600}
.paper .pSig{display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:13.5px}
.paper .pSig>div{border-top:1px solid #333;padding-top:10px}
.paper .pSig b{display:block;font-size:14.5px;margin-bottom:4px}
.paper .sigLine{display:flex;align-items:flex-end;gap:10px;margin-top:6px;min-height:64px}
.paper .sigLine img{height:60px;max-width:180px;object-fit:contain;background:transparent}
.paper .sigLine img.seal{height:84px;max-width:84px}
.paper .sigLine .sigEmpty{color:#999;border-bottom:1px solid #bbb;min-width:150px;height:44px;display:inline-block}
.paper .sigWhen{font-size:11.5px;color:#666}
.paper .pHash{margin:22px 0 0;padding-top:10px;border-top:1px dashed #bbb;font-size:11.5px;color:#555;text-align:center;font-family:ui-monospace,Menlo,monospace}
.paper .pNote{font-size:12px;color:#666;margin:4px 0 0}
.paper .pAtt{margin-top:22px;padding-top:12px;border-top:1px solid #ccc}
.paper .pAtt h4{margin:0 0 8px;font-size:13px;color:#444}
.paper .pAtt .pImgs{display:flex;flex-wrap:wrap;gap:10px}
.paper .pAtt img{max-width:100%;max-height:260px;border:1px solid #ddd;border-radius:6px;object-fit:contain}
.paper .pAtt figure{margin:0;font-size:11.5px;color:#666;text-align:center}
@media (max-width:640px){.paper{padding:22px 16px}.paper .pSig{grid-template-columns:1fr}.paper h1{font-size:20px;letter-spacing:.15em}}
@media print{.paper .pAtt{break-before:page}}`;

  function contractPaper(c, opt = {}) {
    const f = c.f, emp = c.emp || bizOf(), w = f.worker || {}, name = cName(c);
    const e = c.sig && c.sig.employer, wk = c.sig && c.sig.worker;
    const dayNames = (f.days || []).slice().sort().map((d) => WD[d]).join('·');
    const tp = typeOf(f);
    const title = tp === 'part' ? '단시간근로자 표준근로계약서' : tp === 'fixed' ? '표준근로계약서 (기간제)' : '표준근로계약서';
    const ins = [['ei', '고용보험'], ['wc', '산재보험'], ['np', '국민연금'], ['hi', '건강보험']]
      .map(([k, l]) => `${f.ins && f.ins[k] ? '☑' : '☐'} ${l}`).join('  ');
    const sigBox = (sg, isEmp) => sg && blobUrl(sg.img)
      ? `<img class="${sg.seal ? 'seal' : ''}" src="${blobUrl(sg.img)}" alt="${sg.seal ? '도장' : '서명'}"><span class="sigWhen">${esc(sg.name)} ${sg.seal ? '(인)' : '(전자서명)'}<br>${sg.at}</span>`
      : `<span class="sigEmpty"></span><span class="sigWhen">${isEmp ? '(인)' : '(서명)'}</span>`;
    const signDate = f.signDate || ((wk && e) ? (wk.at > e.at ? wk.at : e.at).slice(0, 10) : dateKey());
    const duties = dutiesOf(f).concat(f.dutyOther ? [f.dutyOther] : []).join(', ');
    const rrn = opt.rrnFull || w.rrn || '';
    const files = c.files || [];
    const idF = files.find((x) => x.kind === 'id' && !(x.type || '').includes('pdf') && blobUrl(x));
    const photos = files.filter((x) => x.kind === 'photo' && blobUrl(x));

    return `<div class="paper">
      <h1>${title}</h1>
      <p class="pIntro"><b>${esc(emp.name)}</b> (이하 "사업주"라 함)과(와) <b>${esc(name)}</b> (이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.</p>
      <ol class="clauses">
        <li><b>근로계약기간</b> : ${f.end ? `${kdate(f.start)}부터 ${kdate(f.end)}까지` : `${kdate(f.start)}부터 (기간의 정함이 없음)`}
          ${Number(f.probMonths) > 0 ? `<div class="pNote">수습기간 ${f.probMonths}개월${f.probPay ? ` · 수습기간 임금 : ${esc(f.probPay)}` : ''}</div>` : ''}</li>
        <li><b>근무장소</b> : ${esc(f.place)}</li>
        <li><b>업무의 내용</b> : ${esc(duties || '—')}</li>
        <li><b>소정근로시간</b> : ${f.from}부터 ${f.to}까지 (휴게시간 ${f.breakFrom && f.breakTo ? `${f.breakFrom}~${f.breakTo}` : `${breakMinutes(f)}분`}) · ${esc(f.workType || '주간근무제')} · 1주 소정근로시간 약 ${weeklyHours(f)}시간</li>
        <li><b>근무일 / 휴일</b> : 매주 ${dayNames || '—'}요일 근무 (주 ${(f.days || []).length}일), 주휴일 ${esc(weeklyOffText(f) || '—')}</li>
        <li><b>임금</b>
          <ul>
            <li>${PAY_TYPES[f.payType] || '시급'} : ${fmtNum(f.pay)}원</li>
            <li>수당 및 기타 임금 조건 : ${f.allowance ? esc(f.allowance).replace(/\n/g, '<br>') : '없음'}</li>
            <li>임금지급일 : ${esc(payDayText(f))} (휴일의 경우는 전일 지급)</li>
            <li>지급방법 : ${f.payHow === 'cash' ? '근로자에게 직접 지급' : '근로자 명의 예금통장에 입금'}</li>
          </ul>
          <div class="pNote">주휴수당 : ${WEEKLY_NOTE}</div></li>
        <li><b>휴일·휴가</b> : ${esc(f.leaveRule || '관계 법령과 취업규칙에 따름')}. 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여한다.</li>
        <li><b>사회보험 적용여부</b> : ${ins}</li>
        <li><b>근로계약서 교부</b> : 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부한다. (근로기준법 제17조 이행)</li>
        <li><b>근로계약, 취업규칙 등의 성실한 이행의무</b> : 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 한다.</li>
        <li><b>기타</b> : ${f.extra ? esc(f.extra).replace(/\n/g, '<br>') : '이 계약에 정함이 없는 사항은 근로기준법령에 의한다.'}</li>
      </ol>
      <p class="pDate">${kdate(signDate)}</p>
      <div class="pSig">
        <div><b>(사업주)</b>사업체명 : ${esc(emp.name)}${emp.phone ? ` (전화 : ${esc(emp.phone)})` : ''}<br>주소 : ${esc(emp.addr)}<br>${emp.reg ? `사업자등록번호 : ${esc(emp.reg)}<br>` : ''}대표자 : ${esc(emp.rep)}
          <div class="sigLine">${sigBox(e, true)}</div></div>
        <div><b>(근로자)</b>주소 : ${esc(w.addr || '')}<br>연락처 : ${esc(w.phone || '')}<br>${rrn ? `주민등록번호 : ${esc(rrn)}<br>` : ''}성명 : ${esc(name)}
          <div class="sigLine">${sigBox(wk, false)}</div></div>
      </div>
      ${c.hash ? `<p class="pHash">전자문서 확인번호 ${c.hash}<br>${wk ? `근로자 전자서명 ${wk.at}` : ''}${e && wk ? ' · ' : ''}${e ? `사업주 ${e.seal ? '날인' : '전자서명'} ${e.at}` : ''} · 해모닉 운영 OS에서 작성·체결</p>` : ''}
      ${idF || photos.length ? `<div class="pAtt"><h4>첨부</h4><div class="pImgs">
        ${idF ? `<figure><img src="${blobUrl(idF)}" alt="신분증 사본"><figcaption>신분증 사본</figcaption></figure>` : ''}
        ${photos.map((p2, i) => `<figure><img src="${blobUrl(p2)}" alt="증빙사진"><figcaption>증빙사진 ${i + 1}</figcaption></figure>`).join('')}
      </div></div>` : ''}
    </div>`;
  }

  /* ── 인쇄 · 파일 · 첨부 ── */
  function contractHtml(c, opt) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>근로계약서 - ${esc(cName(c))}</title><style>body{margin:0;background:#f3f3f3}${PAPER_CSS}@media print{body{background:#fff}.paper{border:0;margin:0;max-width:none}}</style></head>
<body>${contractPaper(c, opt)}</body></html>`;
  }
  function markDelivered(c, how) {
    if (contractStatus(c).k !== 'done') return;
    c.delivered = c.delivered || [];
    c.delivered.push({ at: stamp(), how, by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '' });
    save();
  }
  /* 서명 직후 한 번은 전체 주민번호가 들어간 인쇄본을 만든다(교부용). 그 뒤로는 가린 번호만 */
  function printContract(c) {
    const opt = edFull ? { rrnFull: edFull } : {}; edFull = null;
    let box = $('#printBox');
    if (!box) { box = document.createElement('div'); box.id = 'printBox'; document.body.appendChild(box); }
    box.innerHTML = contractPaper(c, opt);
    document.body.classList.add('printMode');
    const done = () => { document.body.classList.remove('printMode'); window.removeEventListener('afterprint', done); box.innerHTML = ''; };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { alert('이 화면에서는 인쇄가 막혀 있습니다. 파일 내려받기를 쓰세요.'); } setTimeout(done, 1500); }, 50);
    markDelivered(c, '인쇄 (또는 PDF 저장)'); render();
  }
  async function downloadContract(c) {
    const name = `근로계약서_${cName(c)}_${(c.f.start || dateKey()).replace(/-/g, '')}.html`;
    const html = contractHtml(c);
    const dl = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null;
    if (dl) {
      try { await dl.save({ filename: name, data: html }); markDelivered(c, '파일 내려받기'); render(); }
      catch (e) { if (e && e.code !== 'declined') alert('내려받기에 실패했습니다: ' + (e.message || e.code)); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    markDelivered(c, '파일 내려받기'); render();
  }
  function attachFile(c) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,application/pdf';
    inp.onchange = async () => {
      const fl = inp.files[0]; if (!fl) return;
      const r = await fileToBlob(fl); if (!r) return;
      c.files = c.files || [];
      c.files.push({ ...r.ref, kind: 'etc', name: fl.name, type: r.type, size: r.size, at: stamp(), by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '' });
      save(); render();
    };
    inp.click();
  }
  function openFile(c, fid) {
    const fl = (c.files || []).find((x) => x.id === fid); const data = blobUrl(fl); if (!fl || !data) { alert('파일 내용이 아직 이 기기에 없습니다. 잠시 뒤 다시 열어 보세요.'); return; }
    const bin = atob(data.split(',')[1]), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: fl.type || 'application/octet-stream' }));
    modal(fl.name, fl.type && fl.type.includes('pdf')
      ? `<iframe src="${url}" class="fileView" title="${esc(fl.name)}"></iframe><p class="hint">안 보이면 <a href="${url}" target="_blank" rel="noopener">새 창에서 열기</a></p>`
      : `<img src="${data}" alt="${esc(fl.name)}" class="fileImg">`, null);
  }
  function uploadSeal() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const fl = inp.files[0]; if (!fl) return;
      try {
        const png = await shrinkSeal(fl);
        dropBlob(S.settings.seal);
        S.settings.seal = putBlob('seal', png);
        save(); render();
      } catch (e) { alert('이미지를 읽지 못했습니다: ' + e.message); }
    };
    inp.click();
  }

  /* ── 레시피 관리 ─────────────────────────────────────────── */
  let recipeQ = '', recipeCat = 'all';

  function vRecipes() {
    const list = (S.recipes || [])
      .filter((r) => recipeCat === 'all' || r.cat === recipeCat)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    let h = `<div class="hd">
      <div><h2>레시피 관리</h2><div class="sub">누가 만들어도 같은 맛이 나게 — 재료·순서를 여기에 적어두세요.</div></div>
      <button class="btn primary" data-act="recipeAdd" style="margin-left:auto">+ 레시피 추가</button>
    </div>`;

    h += `<div class="rcbar">
      <input id="rq" class="rsearch" placeholder="레시피 검색" value="${esc(recipeQ)}" autocomplete="off">
      <div class="filters">
        ${['all', ...RECIPE_CATS].map((c) => `<button class="fl${recipeCat === c ? ' on' : ''}" data-act="recipeCat" data-c="${c}">${c === 'all' ? '전체' : c}</button>`).join('')}
      </div>
    </div>`;

    if (!list.length) {
      h += `<div class="notice"><b>아직 레시피가 없습니다.</b>
        <div class="hint">위 <b>+ 레시피 추가</b>로 시작하세요. 자주 흔들리는 메뉴부터 — 찜 시간, 소스 비율처럼 사람마다 달라지는 것부터 적어두면 효과가 큽니다.</div></div>`;
    } else {
      h += `<div class="rgrid">${list.map((r) => `
        <button class="rcRow" data-act="recipeOpen" data-id="${r.id}" data-name="${esc((r.name + ' ' + (r.ingredients || '')).toLowerCase())}">
          <div class="rcTop"><span class="rcName">${esc(r.name)}</span><span class="chip cat">${esc(r.cat || '기타')}</span></div>
          ${r.ingredients ? `<div class="rcIng">${esc(r.ingredients.split('\n').slice(0, 2).join(' · '))}</div>` : ''}
          <div class="rcMeta">${r.by ? esc(r.by) + ' · ' : ''}${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('ko-KR') : ''}</div>
        </button>`).join('')}</div>`;
    }
    return h;
  }

  function recipeForm(r) {
    const isNew = !r; r = r || { cat: RECIPE_CATS[0] };
    modal(isNew ? '레시피 추가' : '레시피 수정', `
      <label>이름<input id="rcN" value="${esc(r.name || '')}" placeholder="예: 대게찜 (2인)"></label>
      <label>분류<select id="rcC">${RECIPE_CATS.map((c) => `<option${c === r.cat ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>재료 · 분량 <span class="opt">한 줄에 하나</span><textarea id="rcI" rows="4" placeholder="대게 1.2kg\n청주 50ml">${esc(r.ingredients || '')}</textarea></label>
      <label>만드는 순서<textarea id="rcS" rows="6" placeholder="1. 수조에서 꺼내 10분 기절\n2. 찜기에 배 위로 15분">${esc(r.steps || '')}</textarea></label>
      <label>주의 · 팁 <span class="opt">선택</span><textarea id="rcT" rows="2">${esc(r.tip || '')}</textarea></label>
    `, () => {
      const name = $('#rcN').value.trim();
      if (!name) { alert('이름을 입력하세요.'); return false; }
      const rec = {
        id: r.id || 'r' + Date.now(), name, cat: $('#rcC').value,
        ingredients: $('#rcI').value.trim(), steps: $('#rcS').value.trim(), tip: $('#rcT').value.trim(),
        updatedAt: Date.now(), by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || r.by || '',
      };
      if (r.id) S.recipes = S.recipes.map((x) => (x.id === r.id ? rec : x));
      else S.recipes.push(rec);
      save(); render();
    }, '저장');
  }

  function recipeShow(id) {
    const r = (S.recipes || []).find((x) => x.id === id); if (!r) return;
    const sec = (title, body) => body ? `<div class="mlabel">${title}</div><div class="rcBody">${esc(body)}</div>` : '';
    modal(r.name, `
      <div class="rcTop"><span class="chip cat">${esc(r.cat || '기타')}</span>
        <span class="opt">${r.by ? esc(r.by) + ' · ' : ''}${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('ko-KR') + ' 수정' : ''}</span></div>
      ${sec('재료 · 분량', r.ingredients)}
      ${sec('만드는 순서', r.steps)}
      ${r.tip ? `<div class="mmemo">${esc(r.tip)}</div>` : ''}
      <div class="rowbtns">
        <button class="btn" data-act="recipeEdit" data-id="${r.id}">수정</button>
        <button class="btn danger" data-act="recipeDel" data-id="${r.id}">삭제</button>
      </div>`, null);
  }

  /* ── 루틴 ────────────────────────────────────────────────── */
  function vRoutines() {
    const groups = alarmGroups();
    const n = alarmCount();
    const budget = S.settings.budget;

    let h = `<div class="hd"><div><h2>루틴 ${S.templates.filter((t) => t.active).length}개</h2>
      <div class="sub">중요로 지정한 항목만 알림이 갑니다.</div></div></div>`;

    h += `<div class="notice${n > budget ? ' warn' : ' ok'}">
      <b>하루 알림 ${n}건</b> / 예산 ${budget}건
      ${n > budget ? ' — 예산을 넘었습니다. 중요 항목을 줄이세요.' : ''}
      <div class="sched">${Object.entries(groups).sort().map(([due, list]) =>
        `<span class="pill">${due} · ${list.length}건</span>`).join('')}</div>
      <div class="hint">같은 시각 항목은 한 건으로 묶여 발송됩니다. 항목이 늘어도 알림 수는 늘지 않습니다.</div>
    </div>`;

    h += `<details class="notice" data-k="critStd"${attrOpen('critStd', false)}><summary><b>중요로 지정하는 기준</b></summary>
      <ul class="std"><li><b>돈</b> — 놓치면 금전 손실 (갑각류·염도·수조, 마감 정산)</li>
      <li><b>안전</b> — 사고나 행정처분 (가스·전기 최종 확인, 문잠금)</li>
      <li><b>되돌릴 수 없음</b> — 그 시각을 놓치면 그날 안에 만회 불가</li></ul>
      <div class="hint">나머지는 전부 일반입니다. 일반 항목도 체크리스트에 뜨고 완료율에 집계됩니다.</div></details>`;

    SLOTS.forEach((slot) => {
      const list = S.templates.filter((t) => t.slot === slot.key).sort(byOrderT);
      h += `<details class="grp" data-k="rt:${slot.key}"${attrOpen('rt:' + slot.key, true)}><summary><h3>${slot.name} <span class="cnt">${list.filter((t) => t.active).length}</span></h3></summary>`;
      h += list.map((t) => {
        const rep = t.repeat || { t: 'daily' };
        const repLabel = rep.t === 'weekly' ? `주 ${rep.days.length}회 (${rep.days.map((d) => WD[d]).join('·')})` : '매일';
        const rc = { [ROLE_MGR]: 'mgr', '홀': 'hall', '주방': 'kit' }[t.role];
        return `<div class="task rt${t.active ? '' : ' off'}">
          <button class="ck sw${t.crit ? ' on' : ''}" data-act="critToggle" data-id="${t.id}" aria-label="중요 지정">${t.crit ? '중요' : '일반'}</button>
          <div class="tb"><div class="tt">${esc(t.title)}</div>
            <div class="tm"><span class="chip ${rc}">${t.role}</span><span class="tmt">${t.time}</span> · ${repLabel}${t.ev ? ` · ${{ number: '숫자 입력', money: '금액 입력', kakao: '카톡 전송 확인' }[t.ev]}` : ''}</div></div>
          <button class="more" data-act="editTpl" data-id="${t.id}" aria-label="수정">⋯</button>
        </div>`;
      }).join('');
      h += `</details>`;
    });
    return h;
  }

  /* ── 기록 ────────────────────────────────────────────────── */
  function vReport() {
    const keys = Object.keys(S.days).filter((k) => k <= dateKey()).sort();
    const span = (n) => keys.slice(-n);

    function stat(ks) {
      let tot = 0, dn = 0, ct = 0, cd = 0;
      ks.forEach((k) => Object.entries(S.days[k].inst).forEach(([tid, r]) => {
        if (r.s === 'skip') return;
        tot++; if (r.s === 'done') dn++;
        if (tpl(tid)?.crit) { ct++; if (r.s === 'done') cd++; }
      }));
      return { tot, dn, ct, cd, p: tot ? Math.round(dn / tot * 100) : 0, cp: ct ? Math.round(cd / ct * 100) : 0 };
    }
    const w = stat(span(7)), m = stat(span(30));

    let h = `<div class="hd"><div><h2>기록</h2><div class="sub">${keys.length}일치 누적</div></div>
      <button class="btn" data-act="showReport" data-k="${dateKey()}" style="margin-left:auto">오늘 마감 리포트</button></div>`;
    h += `<div class="cards">
      ${[['최근 7일', w], ['최근 30일', m]].map(([lb, x]) => `<div class="card">
        <div class="cl">${lb}</div>
        <div class="cv">${x.p}<small>%</small></div>
        <div class="cs">전체 ${x.dn}/${x.tot}</div>
        <div class="cs crit">중요 ${x.cp}% (${x.cd}/${x.ct})</div></div>`).join('')}
    </div>`;

    /* 자주 놓치는 항목 — 개선 지점을 짚어준다 */
    const miss = {};
    span(30).forEach((k) => Object.entries(S.days[k].inst).forEach(([tid, r]) => {
      if (r.s === 'todo' && k < dateKey()) miss[tid] = (miss[tid] || 0) + 1;
    }));
    const top = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 5);
    h += `<div class="hd sub2"><h3>자주 놓치는 항목</h3></div>`;
    h += top.length ? `<div class="loads">${top.map(([tid, c]) => {
      const t = tpl(tid);
      return `<div class="lrow"><span class="ln">${t ? esc(t.title) : tid}</span>
        <span class="lbar miss"><i style="width:${c / top[0][1] * 100}%"></i></span><span class="lv">${c}회</span></div>`;
    }).join('')}</div>` : `<p class="hint">아직 놓친 항목이 없습니다.</p>`;

    /* 폐사 마릿수 추이 — 수질 이상을 미리 잡는 유일한 데이터 */
    const deaths = span(30).map((k) => {
      const per = {}; let v = 0;
      S.templates.filter((t) => t.ev === 'deaths').map((t) => t.id).forEach((id) => {
        const r = S.days[k].inst[id];
        if (!r || r.s !== 'done' || r.ev == null) return;
        if (typeof r.ev === 'object') SPECIES.forEach((sp) => { const n = Number(r.ev[sp]) || 0; per[sp] = (per[sp] || 0) + n; v += n; });
        else v += Number(r.ev) || 0;
      });
      return { k, v, per };
    }).filter((x) => S.days[x.k]);
    if (deaths.some((x) => x.v > 0)) {
      const mx = Math.max(...deaths.map((x) => x.v), 1);
      h += `<div class="hd sub2"><h3>일별 폐사 마릿수</h3></div>
        <div class="spark">${deaths.map((x) => `<span class="sb" title="${x.k} · ${x.v}마리${SPECIES.filter((sp) => x.per[sp]).map((sp) => ` ${sp} ${x.per[sp]}`).join('')}"><i style="height:${Math.max(2, x.v / mx * 100)}%"></i></span>`).join('')}</div>
        <p class="hint">최근 30일 · 최대 ${mx}마리. 막대에 마우스를 올리면 어종별 수치가 보입니다.</p>`;
      // 어종별 30일 합계
      const tot = {}; deaths.forEach((x) => SPECIES.forEach((sp) => { tot[sp] = (tot[sp] || 0) + (x.per[sp] || 0); }));
      if (SPECIES.some((sp) => tot[sp])) {
        const mx2 = Math.max(...SPECIES.map((sp) => tot[sp] || 0), 1);
        h += `<div class="loads">${SPECIES.map((sp) => `<div class="lrow"><span class="ln">${sp}</span>
          <span class="lbar miss"><i style="width:${(tot[sp] || 0) / mx2 * 100}%"></i></span><span class="lv">${tot[sp] || 0}마리</span></div>`).join('')}</div>`;
      }
    }

    /* 직원별 */
    const by = {};
    span(30).forEach((k) => Object.values(S.days[k].inst).forEach((r) => {
      if (r.s === 'done' && r.by) by[r.by] = (by[r.by] || 0) + 1;
    }));
    const bl = Object.entries(by).sort((a, b) => b[1] - a[1]);
    if (bl.length) {
      const mx = Math.max(...bl.map((x) => x[1]));
      h += `<div class="hd sub2"><h3>직원별 완료 (30일)</h3></div><div class="loads">
        ${bl.map(([n, c]) => `<div class="lrow"><span class="ln">${esc(n)}</span>
          <span class="lbar"><i style="width:${c / mx * 100}%"></i></span><span class="lv">${c}</span></div>`).join('')}</div>`;
    }

    h += `<div class="hd sub2"><h3>날짜별</h3></div><div class="daylist">
      ${keys.slice(-30).reverse().map((k) => {
        const ins = Object.values(S.days[k].inst);
        const dn = ins.filter((r) => r.s === 'done').length;
        const p = ins.length ? Math.round(dn / ins.length * 100) : 0;
        const d = new Date(k + 'T00:00:00');
        return `<button class="dl" data-act="jumpDate" data-k="${k}"><span class="dk">${k.slice(5)} ${WD[d.getDay()]}</span>
          <span class="lbar"><i style="width:${p}%"></i></span><span class="lv">${dn}/${ins.length}</span></button>`;
      }).join('')}</div>`;
    return h;
  }

  /* ── 설정 ────────────────────────────────────────────────── */
  function vSettings() {
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permTxt = { granted: '허용됨', denied: '차단됨 — 브라우저 주소창 옆 자물쇠에서 허용으로 바꿔주세요', default: '아직 허용 안 함', unsupported: '이 브라우저는 알림을 지원하지 않습니다' }[perm];

    let h = `<div class="hd"><div><h2>설정</h2></div></div>`;

    const mt = Store.meta;
    const tab = staffTab || (mt ? mt.current : 'ansan');
    const isCur = !mt || tab === mt.current;
    const tabName = mt ? (mt.stores.find((x) => x.id === tab) || {}).name : '';

    h += `<div class="hd sub2"><h3>직원</h3></div>
      <div class="notice"><b>직원 명단과 근로계약서는 왼쪽 메뉴 <b>직원</b>으로 옮겼습니다.</b>
        <div class="rowbtns"><button class="btn sm" data-act="view" data-v="staff">직원 명단 열기</button>
        <button class="btn sm" data-act="view" data-v="contracts">근로계약서 열기</button></div></div>`;

    const bz = bizOf();
    h += `<div class="hd sub2"><h3>사업장 정보 — ${esc(storeName())}</h3></div>
      <p class="hint">근로계약서의 <b>사업주</b> 칸에 그대로 들어갑니다. 매장마다 따로 적습니다.</p>
      <div class="setrow"><span>사업체명</span><input class="num wide2" data-act="biz" data-f="name" value="${esc(bz.name)}"></div>
      <div class="setrow"><span>대표자</span><input class="num wide" data-act="biz" data-f="rep" value="${esc(bz.rep)}"></div>
      <div class="setrow"><span>사업자등록번호</span><input class="num wide" data-act="biz" data-f="reg" value="${esc(bz.reg)}" placeholder="000-00-00000"></div>
      <div class="setrow"><span>사업장 주소</span><input class="num wide2" data-act="biz" data-f="addr" value="${esc(bz.addr)}"></div>
      <div class="setrow"><span>전화</span><input class="num wide" data-act="biz" data-f="phone" value="${esc(bz.phone)}"></div>
      <div class="setrow"><span>대표자 도장<div class="hint">등록해 두면 근로자가 서명하는 순간 계약서에 자동으로 날인됩니다. 도장을 흰 종이에 찍어 사진으로 올리면 됩니다.</div></span>
        <span class="v">${sealRef() ? `<img class="sealPrev" src="${blobUrl(sealRef())}" alt="도장">` : '미등록'}
          <button class="btn sm" data-act="sealUpload">${sealRef() ? '바꾸기' : '도장 등록'}</button>${sealRef() ? '<button class="btn sm ghost danger" data-act="sealDel">삭제</button>' : ''}</span></div>
      <div class="setrow"><span>최저시급 기준<div class="hint">계약서 임금이 이보다 낮으면 경고합니다. 해마다 바뀌면 여기서 고치세요.</div></span>
        <input type="number" class="num wide" data-act="minWage" value="${minWage()}" min="0" step="10">
        <span class="hint" style="margin:0">원 · ${MIN_WAGE.year}년 고시 ${MIN_WAGE.hour.toLocaleString('ko-KR')}원</span></div>`;

    h += `<div class="hd sub2"><h3>인원 기준 — ${esc(storeName())}</h3></div>
      <div class="setrow"><span>기본 인원<div class="hint">근무 편성이 있는 날은 편성 인원을 따라갑니다. 편성 전에만 이 값이 쓰입니다.</div></span>
        <span class="v">
          <button class="btn sm${S.settings.crew === 2 ? ' on' : ''}" data-act="crew" data-n="2">2인 (관리자가 홀 겸직)</button>
          <button class="btn sm${S.settings.crew === 3 ? ' on' : ''}" data-act="crew" data-n="3">3인 (관리자·홀·주방)</button>
        </span></div>
      <div class="setrow"><span>오후 조 시작 시각 <span class="hint" style="margin:0">이 시각 전 구간이 오전 조, 이후가 오후 조</span></span>
        <span class="v"><input type="time" class="num wide" value="${esc(S.settings.pmStart || '17:00')}" data-act="pmStart">
        </span></div>
      <div class="setrow"><span>2인일 때 주방이 맡는 홀 업무</span>
        <span class="v hint">${S.templates.filter((t) => t.role2 && !t.rest).map((t) => t.time).join(' · ') || '없음'}</span></div>

      <div class="hd sub2"><h3>알림</h3></div>
      <div class="setrow"><span>브라우저 알림 권한</span><span class="v">${permTxt}
        ${perm === 'default' ? '<button class="btn sm" data-act="askPerm">허용하기</button>' : ''}</span></div>
      <div class="setrow"><span>소리</span><button class="btn sm${S.settings.sound ? ' on' : ''}" data-act="toggleSound">${S.settings.sound ? '켜짐' : '꺼짐'}</button></div>
      <div class="setrow"><span>하루 알림 예산</span><input type="number" class="num" min="1" max="12" value="${S.settings.budget}" data-act="budget"></div>
      <div class="setrow"><span>알림 테스트</span><button class="btn sm" data-act="testAlarm">보내보기</button></div>

      <div class="hd sub2"><h3>마감 리포트</h3></div>
      <div class="setrow"><span>리포트 알림</span>
        <button class="btn sm${S.settings.reportOff ? '' : ' on'}" data-act="toggleReport">${S.settings.reportOff ? '꺼짐' : '켜짐'}</button></div>
      <div class="setrow"><span>띄우는 시각</span>
        <input type="time" class="num wide" value="${S.settings.reportAt || '22:30'}" data-act="reportAt"></div>
      <div class="rowbtns"><button class="btn" data-act="showReport">지금 리포트 보기</button></div>

      <div class="setrow"><span>텔레그램 봇 토큰</span>
        <input type="text" class="num wide2" value="${esc(S.settings.tgToken || '')}" data-act="tgToken" placeholder="123456:ABC-DEF..." autocomplete="off"></div>
      <div class="setrow"><span>보낼 대화방</span>
        <span class="v">${S.settings.tgChat ? 'ID ' + esc(S.settings.tgChat) : '미설정'}
          <button class="btn sm" data-act="tgFind">대화방 찾기</button></span></div>
      <div class="setrow"><span>대화방 ID 직접 입력 <span class="hint" style="margin:0">찾기가 안 될 때만</span></span>
        <input type="text" class="num wide" value="${esc(S.settings.tgChat || '')}" data-act="tgChat" placeholder="-100… 또는 숫자" autocomplete="off"></div>
      <div class="rowbtns"><button class="btn" data-act="tgTest">연결 테스트 (지금 보내보기)</button></div>

      <details class="notice"><summary><b>텔레그램 처음 설정하기 (약 5분, 한 번만)</b></summary>
        <ol class="std">
          <li>사장님·직원 모두 휴대폰에 <b>텔레그램</b> 앱을 설치합니다.</li>
          <li>텔레그램에서 <b>@BotFather</b> 를 검색해 대화를 열고 <b>/newbot</b> 을 보냅니다.</li>
          <li>봇 이름을 정하면 (예: 해모닉알림봇) <b>토큰</b>이 나옵니다. 그 토큰을 위 칸에 붙여넣습니다.</li>
          <li>사장님과 직원이 있는 <b>단체방을 만들고 봇을 초대</b>한 뒤, 그 방에 아무 메시지나 하나 올립니다.</li>
          <li>위의 <b>대화방 찾기</b> → 그 단체방 선택 → <b>연결 테스트</b>. 휴대폰에 메시지가 오면 끝입니다.</li>
        </ol>
        <div class="hint">토큰은 이 PC에만 저장되고 어디에도 전송되지 않습니다 (텔레그램 서버 제외).</div>
      </details>

      <div class="setrow"><span>사장님 폰 즉시 알림 <span class="hint" style="margin:0">중요 업무 완료·지연 때 한 줄</span></span>
        <button class="btn sm${S.settings.tgInstant === false ? '' : ' on'}" data-act="toggleTgInstant">${S.settings.tgInstant === false ? '꺼짐' : '켜짐'}</button></div>
      <p class="hint">${serverSends()
        ? '서버에 로그인되어 있어 <b>알림은 서버가 보냅니다</b> — 마감 리포트는 매일 <b>21:30</b>(서버 고정), 매장 PC가 꺼져 있어도 갑니다. 실패하면 1분마다 3회 다시 보냅니다. 서버 설치는 <code>서버/supabase_alerts.sql</code>.'
        : (S.settings.tgToken && S.settings.tgChat)
          ? `매일 <b>${esc(S.settings.reportAt || '21:30')}</b> 에 텔레그램으로 <b>자동 전송</b>됩니다. 실패하면 30초마다 재시도하고, 화면에도 알려드립니다. 전송 시각에 앱(브라우저 탭)이 열려 있고 인터넷이 연결되어 있어야 합니다.`
          : '텔레그램을 설정하면 그 시각에 자동으로 전송됩니다. 설정 전에는 문구만 만들어져 직접 복사해 보내시면 됩니다.'}
        리포트 시점 이후에 할 업무(마감 정산·문잠금)는 '이후 예정'으로 따로 표시되고 완료율에서 빠집니다.</p>

      <div class="hd sub2"><h3>할 일 순서 잠금</h3></div>
      <div class="setrow"><span>순서 바꾸기 PIN <span class="hint" style="margin:0">사장님만 아는 숫자 4~6자리</span></span>
        <span class="v">${pinOk(S.settings.orderPin) ? '설정됨' : '미설정'} <button class="btn sm" data-act="orderPinSet">${pinOk(S.settings.orderPin) ? 'PIN 바꾸기' : 'PIN 만들기'}</button></span></div>
      <p class="hint">할 일 화면의 순서는 기본으로 잠겨 있어 직원이 실수로 바꿀 수 없습니다. 할 일 화면 › <b>순서 바꾸기</b>에서 PIN 을 넣으면 10분 동안 손잡이(⠿)를 끌어 순서를 바꿀 수 있고, 새로고침하거나 10분이 지나면 다시 잠깁니다. 바꾼 순서는 매일 · 모든 기기에 같이 적용됩니다.</p>

      <div class="hd sub2"><h3>완료자 기록</h3></div>
      <div class="setrow"><span>완료할 때마다 누가 했는지 묻기</span>
        <button class="btn sm${S.settings.askWho ? ' on' : ''}" data-act="toggleAskWho">${S.settings.askWho ? '켜짐' : '꺼짐'}</button></div>
      <p class="hint">${S.settings.askWho
        ? '체크할 때마다 이름을 고릅니다. 한 대의 PC를 여럿이 나눠 쓸 때 기록이 정확해집니다. 증빙이 없는 항목은 이름만 누르면 바로 완료됩니다.'
        : '상단에서 한 번 고른 이름으로 계속 기록됩니다. 빠르지만, 다른 사람이 체크해도 그 이름으로 남습니다.'}
        완료된 항목의 <b>⋯</b> 를 누르면 완료자를 나중에 바꿀 수도 있습니다.</p>
      <p class="hint">알림은 이 앱 탭이 열려 있을 때 동작합니다. 영업 중에는 탭을 닫지 마세요.</p>`;

    const _T = tanksOf(), _c = _T.cycle;
    h += `    <div class="hd sub2"><h3>수조 관리 — ${esc(storeName())}</h3></div>
    <div class="setrow"><span>수조 개수</span><span class="grow"></span>
      <button class="btn sm" data-act="tankCount" data-d="-1">−</button><b class="tkNum">${_T.count}</b><button class="btn sm" data-act="tankCount" data-d="1">+</button></div>
    <div class="setrow"><span>해수 교체 주기 (일)</span><span class="grow"></span>
      <input type="number" class="tkIn" data-act="tankCycle" data-k="water" data-f="every" value="${_c.water.every}" min="1"> <span class="hint" style="margin:0">빨강</span>
      <input type="number" class="tkIn" data-act="tankCycle" data-k="water" data-f="late" value="${_c.water.late}" min="1"></div>
    <div class="setrow"><span>수조 청소 주기 (일)</span><span class="grow"></span>
      <input type="number" class="tkIn" data-act="tankCycle" data-k="clean" data-f="every" value="${_c.clean.every}" min="1"> <span class="hint" style="margin:0">빨강</span>
      <input type="number" class="tkIn" data-act="tankCycle" data-k="clean" data-f="late" value="${_c.clean.late}" min="1"></div>`;

    h += acctSettings();
    h += serverSettings();
    h += `<div class="hd sub2"><h3>백업</h3></div>
      <div class="setrow"><span>마지막 백업</span><span class="v">${S.settings.lastBackup || '없음'}</span></div>
      <div class="rowbtns">
        <button class="btn" data-act="export">파일로 내보내기</button>
        <button class="btn ghost" data-act="import">가져오기</button>
      </div>
      <p class="hint">저장 위치: ${Store.label} · 브라우저 데이터를 지우면 전부 사라집니다. 주 1회 내보내기를 습관으로 만드세요. 파일 하나면 새 PC에서도 그대로 복원됩니다.</p>`;

    h += `<div class="hd sub2"><h3>초기화</h3></div>
      <div class="rowbtns"><button class="btn danger" data-act="reset">전체 데이터 삭제</button></div>`;
    return h;
  }

  /* ── 회계 ─────────────────────────────────────────────────
     S.sales{ 'YYYY-MM-DD': {orders, store, deliv, take, total, crab, king, lob, liquor, by, at, src} }
       src: 'task'(마감 루틴 완료 창) | 'input'(매출 입력 화면) | 'csv'(가져오기)
     S.settings.fixedCosts[{id,name,amount,from:'YYYY-MM'}] · insRate(%) · weeklyPay
     S.payroll{ 'YYYY-MM': {at, by, sig, rows[], total} } — 사장님이 확정한 순간의 숫자 (그 뒤 근무표가 바뀌어도 그대로)
     staff.pay{type:'hour'|'month', amount} · staff.email */
  const SALES_F = [
    ['orders', '총주문', '건', 1], ['store', '매장 매출', '원', 100], ['deliv', '배달 매출', '원', 100], ['take', '포장 매출', '원', 100],
    ['total', '총매출', '원', 100], ['crab', '대게', 'kg', 0.1], ['king', '킹크랩', 'kg', 0.1], ['lob', '랍스터', 'kg', 0.1], ['liquor', '주류 매출', '원', 100],
  ];
  const salesTotal = (r) => { if (!r) return 0; if (r.total != null && !isNaN(r.total)) return Number(r.total) || 0; return (Number(r.store) || 0) + (Number(r.deliv) || 0) + (Number(r.take) || 0); };
  const salesKg = (r) => (Number(r.crab) || 0) + (Number(r.king) || 0) + (Number(r.lob) || 0);
  const salesOf = (k) => (S.sales || {})[k] || null;
  const salesDates = () => Object.keys(S.sales || {}).sort();
  const curMonth = () => dateKey().slice(0, 7);
  const whoNow = () => (S.ui.whoDate === dateKey() ? S.ui.who : '') || '';

  /* 한 달 매출 — 매출 입력이 우선, 없는 날은 마감 루틴 완료 창에 적은 금액(ev)으로 보충 */
  function monthSales(m) {
    let sum = 0; const seen = new Set();
    salesDates().forEach((k) => { if (k.slice(0, 7) === m) { sum += salesTotal(S.sales[k]); seen.add(k); } });
    const mt = S.templates.find((t) => t.ev === 'money');
    if (mt) Object.entries(S.days).forEach(([k, d]) => {
      if (k.slice(0, 7) !== m || seen.has(k)) return;
      const r = d.inst && d.inst[mt.id];
      if (r && r.s === 'done' && r.ev != null) sum += Number(r.ev) || 0;
    });
    return sum;
  }

  function salesFields(r) {
    r = r || {};
    const inp = ([k, n, u, st]) => `<label>${n} <small class="opt">${u}</small><input type="number" class="sfIn" data-k="${k}" min="0" step="${st}" value="${r[k] ?? ''}" inputmode="decimal"></label>`;
    return `<div class="frow">${inp(SALES_F[0])}${inp(SALES_F[4])}</div>
      <div class="frow3">${inp(SALES_F[1])}${inp(SALES_F[2])}${inp(SALES_F[3])}</div>
      <div class="frow3">${inp(SALES_F[5])}${inp(SALES_F[6])}${inp(SALES_F[7])}</div>
      ${inp(SALES_F[8])}
      <p class="hint">빈칸은 0이 아니라 "미입력"으로 남습니다. 총매출을 비우면 매장·배달·포장의 합으로 채웁니다.</p>`;
  }
  /* 입력값 읽기 — 음수·글자는 붉게 표시하고 null 반환(저장 안 함) */
  function readSalesFields() {
    const out = {}; let bad = false;
    document.querySelectorAll('.sfIn').forEach((el) => {
      const v = el.value.trim(); el.classList.remove('bad');
      if (v === '') { out[el.dataset.k] = null; return; }
      const n = Number(v);
      if (isNaN(n) || n < 0) { el.classList.add('bad'); bad = true; return; }
      out[el.dataset.k] = n;
    });
    if (bad) { alert('음수나 글자는 넣을 수 없습니다. 붉게 표시된 칸을 확인하세요.'); return null; }
    if (out.total == null && (out.store != null || out.deliv != null || out.take != null)) out.total = (out.store || 0) + (out.deliv || 0) + (out.take || 0);
    if (SALES_F.every(([k]) => out[k] == null)) { alert('숫자를 하나도 넣지 않았습니다.'); return null; }
    return out;
  }
  function saveSales(k, vals, src) {
    if (!S.sales) S.sales = {};
    const old = S.sales[k] || {};
    S.sales[k] = { ...vals, by: whoNow() || old.by || '', at: stamp(), src: src || old.src || 'input' };
    // 마감 루틴의 매출 금액도 같이 맞춘다 (기록 탭·리포트가 그걸 본다)
    const mt = S.templates.find((t) => t.ev === 'money');
    const d = S.days[k]; const r = mt && d && d.inst && d.inst[mt.id];
    if (r && r.s === 'done') r.ev = salesTotal(S.sales[k]);
  }
  function salesForm(k) {
    const cur = k ? salesOf(k) : null;
    modal(cur ? `${kdate(k)} 매출 수정` : '매출 입력', `
      <label>날짜<input type="date" id="sfD" value="${esc(k || dateKey())}" max="${dateKey()}"></label>
      ${salesFields(cur)}
      ${cur ? `<div class="rowbtns"><button class="btn danger sm" data-act="salesDel" data-k="${k}">이 날 매출 삭제</button></div>` : ''}
    `, () => {
      const d = $('#sfD').value;
      if (!d || d > dateKey()) { alert('오늘까지의 날짜만 넣을 수 있습니다.'); return false; }
      const vals = readSalesFields(); if (!vals) return false;
      if ((!cur || d !== k) && salesOf(d)) { if (!confirm(`${kdate(d)} 매출이 이미 있습니다. 덮어쓸까요?`)) return false; }
      if (cur && d !== k) delete S.sales[k];
      saveSales(d, vals, 'input');
      S.ui.smonth = d.slice(0, 7);
      save(); render();
    }, '저장');
  }

  function vSalesIn() {
    const m = S.ui.smonth || curMonth();
    const dates = monthDates(m).filter((k) => k <= dateKey());
    const filled = dates.filter((k) => salesOf(k));
    let h = `<div class="hd"><div><h2>매출 입력</h2><div class="sub">마감 때 "포스 마감·매출 정산" 루틴을 완료하면 여기에 자동으로 쌓입니다. 빠진 날은 줄을 눌러 채우세요.</div></div>
      <div class="mnav"><button class="dnav" data-act="smonthNav" data-d="-1" aria-label="이전 달">‹</button><span class="mtitle">${monthLabel(m)}</span><button class="dnav" data-act="smonthNav" data-d="1" aria-label="다음 달">›</button>
        <button class="btn" data-act="salesCsv">CSV 가져오기</button><button class="btn primary" data-act="salesAdd">+ 매출 입력</button></div></div>`;
    h += `<div class="cards m4">
      <div class="card"><div class="cl">이달 매출</div><div class="cv sm2">${fmtWon(monthSales(m))}</div></div>
      <div class="card"><div class="cl">입력한 날</div><div class="cv">${filled.length}<small>일</small></div></div>
      <div class="card${dates.length - filled.length ? ' warn' : ''}"><div class="cl">미입력</div><div class="cv">${dates.length - filled.length}<small>일</small></div><div class="cs">오늘까지 기준</div></div>
      <div class="card"><div class="cl">총 kg</div><div class="cv sm2">${fmtKg(filled.reduce((a, k) => a + salesKg(S.sales[k]), 0)) || '–'}</div></div></div>`;
    if (!dates.length) return h + `<div class="notice"><b>아직 오지 않은 달입니다.</b></div>`;
    const cell = (v, u) => (v == null ? '<span class="dim">–</span>' : (u === 'kg' ? fmtKg(v) : Number(v).toLocaleString('ko-KR')));
    h += `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>날짜</th><th class="r">총주문</th><th class="r">매장</th><th class="r">배달</th><th class="r">포장</th><th class="r">총매출</th><th class="r">대게</th><th class="r">킹크랩</th><th class="r">랍스터</th><th class="r">주류</th><th>입력자</th></tr></thead><tbody>`;
    dates.slice().reverse().forEach((k) => {
      const r = salesOf(k), d = new Date(k + 'T00:00:00'), lb = `${k.slice(5)} ${WD[d.getDay()]}`;
      h += r ? `<tr class="rowbtn" data-act="salesEdit" data-k="${k}"><td>${lb}</td><td class="r">${cell(r.orders)}</td><td class="r">${cell(r.store)}</td><td class="r">${cell(r.deliv)}</td><td class="r">${cell(r.take)}</td><td class="r"><b>${fmtWon(salesTotal(r))}</b></td><td class="r">${cell(r.crab, 'kg')}</td><td class="r">${cell(r.king, 'kg')}</td><td class="r">${cell(r.lob, 'kg')}</td><td class="r">${cell(r.liquor)}</td><td>${esc(r.by || '')}${r.src === 'csv' ? ' <span class="chip missed">CSV</span>' : ''}</td></tr>`
        : `<tr class="rowbtn empty" data-act="salesEdit" data-k="${k}"><td>${lb}</td><td colspan="10" style="text-align:left"><span class="chip missed">미입력</span> <small>눌러서 입력</small></td></tr>`;
    });
    h += `</tbody></table></div>`;
    return h;
  }

  /* CSV 가져오기 — modules/a_sales/convert.py 가 만드는 sales_daily.csv 열 이름 기준 */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
    if (!lines.length) return { head: [], rows: [] };
    return { head: split(lines[0]), rows: lines.slice(1).map(split) };
  }
  const CSV_MAP = { '날짜': 'date', '매장': 'storeName', '총주문': 'orders', '매장매출': 'store', '배달매출': 'deliv', '포장매출': 'take', '총매출': 'total', '대게kg': 'crab', '킹크랩kg': 'king', '랍스타kg': 'lob', '랍스터kg': 'lob', '주류매출': 'liquor' };
  function salesCsvImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const { head, rows } = parseCSV(rd.result);
        const hk = head.map((x) => x.replace(/\s+/g, ''));
        const need = ['날짜', '총매출'].filter((c) => !hk.includes(c));
        if (need.length) { alert(`${need.join(', ')} 열이 없어요. 열 이름을 확인하세요.\n\n필요한 열: 날짜, 총매출\n있으면 같이 들어가는 열: 총주문 · 매장매출 · 배달매출 · 포장매출 · 대게kg · 킹크랩kg · 랍스타kg · 주류매출`); return; }
        const idx = {}; hk.forEach((c, i) => { if (CSV_MAP[c]) idx[CSV_MAP[c]] = i; });
        const recs = [], otherStore = new Set(); let skipped = 0;
        rows.forEach((r) => {
          const d = (r[idx.date] || '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > dateKey()) { skipped++; return; }
          const v = {};
          ['orders', 'store', 'deliv', 'take', 'total', 'crab', 'king', 'lob', 'liquor'].forEach((k) => {
            if (idx[k] == null) return;
            const x = r[idx[k]]; v[k] = (x === '' || x == null) ? null : Number(x); if (isNaN(v[k]) || v[k] < 0) v[k] = null;
          });
          if (!v.total && v.orders == null && v.store == null) { skipped++; return; }   // 아무 숫자도 없는 날(휴무·빈 줄)
          if (idx.storeName != null && r[idx.storeName] && r[idx.storeName] !== storeName()) otherStore.add(r[idx.storeName]);
          recs.push({ d, v });
        });
        recs.sort((a, b) => a.d.localeCompare(b.d));
        if (!recs.length) { alert('가져올 줄이 없습니다. 날짜는 2026-09-14 처럼 적혀 있어야 합니다.'); return; }
        const over = recs.filter((x) => salesOf(x.d)).length;
        modal('CSV 가져오기', `<p><b>${recs.length}일치</b> 매출을 <b>${esc(storeName())}</b>에 가져옵니다.</p>
          <ul class="hintlist"><li>새로 들어가는 날 ${recs.length - over}일 · 이미 있어 덮어쓰는 날 ${over}일</li>
          <li>기간 ${recs[0].d} ~ ${recs[recs.length - 1].d}</li>
          ${skipped ? `<li>날짜가 이상하거나 숫자가 없는 ${skipped}줄은 건너뜁니다</li>` : ''}
          ${otherStore.size ? `<li class="warnTxt">⚠️ 파일의 매장 이름(${esc([...otherStore].join(', '))})이 지금 보는 매장과 다릅니다. 그래도 지금 매장에 들어갑니다.</li>` : ''}</ul>`, () => {
          recs.forEach((x) => saveSales(x.d, x.v, 'csv'));
          save(); render(); alert(`${recs.length}일치를 가져왔습니다.`);
        }, '가져오기');
      };
      rd.readAsText(f, 'utf-8');
    };
    inp.click();
  }

  /* ── 매출 분석 ── */
  function statRange() {
    const p = S.ui.sper || 'month', t = dateKey(), m = curMonth();
    if (p === 'month') return { from: m + '-01', to: t };
    if (p === 'prev') { const ds = monthDates(monthShiftKey(m, -1)); return { from: ds[0], to: ds[ds.length - 1] }; }
    if (p === '90') return { from: shift(t, -89), to: t };
    return { from: S.ui.sfrom || shift(t, -29), to: S.ui.sto || t };
  }
  function vSalesStat() {
    const { from, to } = statRange(), p = S.ui.sper || 'month';
    const all = []; for (let k = from; k <= to && all.length < 400; k = shift(k, 1)) all.push(k);
    const recs = all.map((k) => ({ k, r: salesOf(k) })).filter((x) => x.r);
    const tot = recs.reduce((a, x) => a + salesTotal(x.r), 0);
    const ordDays = recs.filter((x) => x.r.orders);
    const orders = ordDays.reduce((a, x) => a + Number(x.r.orders), 0), ordSales = ordDays.reduce((a, x) => a + salesTotal(x.r), 0);
    const kg = recs.reduce((a, x) => a + salesKg(x.r), 0);
    const chip = (v, n) => `<button class="fl${p === v ? ' on' : ''}" data-act="sper" data-p="${v}">${n}</button>`;
    let h = `<div class="hd"><div><h2>매출 분석</h2><div class="sub">${from} ~ ${to} · 입력한 ${recs.length}일 기준</div></div></div>
      <div class="filters">${chip('month', '이번 달')}${chip('prev', '지난 달')}${chip('90', '최근 90일')}${chip('custom', '직접 지정')}</div>
      ${p === 'custom' ? `<div class="setrow"><span>기간</span><input type="date" class="num wide" data-act="sfrom" value="${from}" max="${dateKey()}"> <span>~</span> <input type="date" class="num wide" data-act="sto" value="${to}" max="${dateKey()}" style="margin-left:0"></div>` : ''}`;
    if (!recs.length) return h + `<div class="notice"><b>이 기간에 입력한 매출이 없습니다.</b><div class="hint">회계 › 매출 입력에서 채우거나 CSV를 가져오세요. <button class="btn sm" data-act="view" data-v="salesIn">매출 입력 열기</button></div></div>`;
    h += `<div class="cards m4">
      <div class="card"><div class="cl">총매출</div><div class="cv sm2">${fmtWon(tot)}</div></div>
      <div class="card"><div class="cl">일평균</div><div class="cv sm2">${fmtWon(Math.round(tot / recs.length))}</div><div class="cs">입력한 날 기준</div></div>
      <div class="card"><div class="cl">객단가</div><div class="cv sm2">${orders ? fmtWon(Math.round(ordSales / orders)) : '–'}</div><div class="cs">${orders ? `주문 ${orders.toLocaleString('ko-KR')}건` : '총주문 미입력'}</div></div>
      <div class="card"><div class="cl">총 kg</div><div class="cv sm2">${fmtKg(kg) || '–'}</div></div></div>`;
    const mx = Math.max(...recs.map((x) => salesTotal(x.r)), 1);
    h += `<div class="hd sub2"><h3>일별 매출</h3></div><div class="spark sales">${all.map((k) => {
      const r = salesOf(k), v = r ? salesTotal(r) : 0, d = new Date(k + 'T00:00:00');
      return `<span class="sb${r ? '' : ' none'}" title="${k} ${WD[d.getDay()]} · ${r ? fmtWon(v) : '미입력'}"><i style="height:${r ? Math.max(2, v / mx * 100) : 0}%"></i></span>`;
    }).join('')}</div>
      <p class="hint">최대 ${fmtWon(mx)}. 막대에 마우스를 올리면 날짜와 금액이 보입니다. 빈 자리는 미입력.</p>`;
    const wd = WD.map(() => ({ s: 0, n: 0 }));
    recs.forEach((x) => { const i = new Date(x.k + 'T00:00:00').getDay(); wd[i].s += salesTotal(x.r); wd[i].n++; });
    const wAvg = wd.map((w) => (w.n ? w.s / w.n : 0)), wmx = Math.max(...wAvg, 1);
    h += `<div class="hd sub2"><h3>요일별 평균</h3></div><div class="loads">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<div class="lrow"><span class="ln">${WD[i]}</span><span class="lbar"><i style="width:${wAvg[i] / wmx * 100}%"></i></span><span class="lv">${wd[i].n ? fmtWon(Math.round(wAvg[i])) + ` <small>(${wd[i].n}일)</small>` : '–'}</span></div>`).join('')}</div>`;
    const ch = { store: 0, deliv: 0, take: 0 };
    recs.forEach((x) => { ch.store += Number(x.r.store) || 0; ch.deliv += Number(x.r.deliv) || 0; ch.take += Number(x.r.take) || 0; });
    const chSum = ch.store + ch.deliv + ch.take;
    if (chSum) h += `<div class="hd sub2"><h3>매장 · 배달 · 포장 비중</h3></div><div class="loads">${[['매장', ch.store], ['배달', ch.deliv], ['포장', ch.take]].map(([n, v]) => `<div class="lrow"><span class="ln">${n}</span><span class="lbar"><i style="width:${v / chSum * 100}%"></i></span><span class="lv">${Math.round(v / chSum * 100)}% <small>${fmtWon(v)}</small></span></div>`).join('')}</div>`;
    const sp = { '대게': 0, '킹크랩': 0, '랍스터': 0 };
    recs.forEach((x) => { sp['대게'] += Number(x.r.crab) || 0; sp['킹크랩'] += Number(x.r.king) || 0; sp['랍스터'] += Number(x.r.lob) || 0; });
    const spmx = Math.max(...Object.values(sp), 1);
    if (kg) h += `<div class="hd sub2"><h3>품종별 kg</h3></div><div class="loads">${Object.entries(sp).map(([n, v]) => `<div class="lrow"><span class="ln">${n}</span><span class="lbar"><i style="width:${v / spmx * 100}%"></i></span><span class="lv">${fmtKg(v)}</span></div>`).join('')}</div>`;
    const lq = recs.reduce((a, x) => a + (Number(x.r.liquor) || 0), 0);
    if (lq) h += `<p class="hint">주류 매출 ${fmtWon(lq)} — 총매출의 ${tot ? Math.round(lq / tot * 100) : 0}%</p>`;
    return h;
  }

  /* ── 고정비 · 월 손익 ── */
  const fixedList = () => (S.settings.fixedCosts = S.settings.fixedCosts || []);
  /* 그 달에 적용되는 고정비 — 항목별로 적용 시작 월이 그 달 이하인 것 중 가장 최근 값 */
  function fixedFor(m) {
    const by = {};
    fixedList().forEach((f) => { if (f.from && f.from > m) return; if (!by[f.name] || (f.from || '') > (by[f.name].from || '')) by[f.name] = f; });
    const items = Object.values(by);
    return { items, total: items.reduce((a, f) => a + (Number(f.amount) || 0), 0) };
  }
  function fixedForm(x) {
    const isNew = !x; x = x || { name: '', amount: '', from: curMonth() };
    modal(isNew ? '고정비 추가' : '고정비 수정', `
      <label>항목<input id="fcN" value="${esc(x.name)}" placeholder="예: 임대료 · 공과금 · 보험 · 카드 수수료" list="fcList"><datalist id="fcList">${['임대료', '공과금', '보험', '통신비', '기타'].map((n) => `<option value="${n}">`).join('')}</datalist></label>
      <div class="frow"><label>월 금액 (원)<input type="number" id="fcA" min="0" step="1000" value="${x.amount}" inputmode="numeric" placeholder="예: 2500000"></label>
      <label>적용 시작 월<input type="month" id="fcF" value="${esc(x.from)}"></label></div>
      <p class="hint">같은 항목을 새 금액으로 다시 넣으면 그 달부터 새 값이 쓰이고, 이전 달은 옛 값 그대로입니다.</p>
      ${isNew ? '' : `<div class="rowbtns"><button class="btn danger sm" data-act="fixedDel" data-id="${x.id}">이 고정비 삭제</button></div>`}`, () => {
      const name = $('#fcN').value.trim(), amount = Number($('#fcA').value), from = $('#fcF').value;
      if (!name) { alert('항목 이름을 넣으세요.'); return false; }
      if (isNaN(amount) || amount < 0) { alert('금액은 0 이상 숫자여야 합니다.'); return false; }
      if (!/^\d{4}-\d{2}$/.test(from)) { alert('적용 시작 월을 고르세요.'); return false; }
      const rec = { id: x.id || newId('fc'), name, amount, from };
      if (x.id) S.settings.fixedCosts = fixedList().map((f) => (f.id === x.id ? rec : f)); else fixedList().push(rec);
      save(); render();
    }, '저장');
  }
  function pnlOf(m) {
    const sales = monthSales(m);
    const cost = (S.purchases || []).filter((x) => (x.date || '').slice(0, 7) === m).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const L = laborFor(m), F = fixedFor(m);
    const labor = L.anySched ? L.total : 0;
    return { sales, cost, labor, laborEst: L.est, hasSched: L.anySched, fixed: F.total, fixedItems: F.items, profit: sales - cost - labor - F.total, hasSales: sales > 0 };
  }
  function vPnl() {
    const m = S.ui.pmonth || curMonth(), P = pnlOf(m), Q = pnlOf(monthShiftKey(m, -1));
    const pct = (v) => (P.sales ? Math.round(v / P.sales * 100) : null);
    const cr = pct(P.cost), lr = P.hasSched ? pct(P.labor) : null;
    let h = `<div class="hd"><div><h2>월 손익</h2><div class="sub">매출 − 원가(매입) − 인건비 − 고정비 = 이달 남는 돈</div></div>
      <div class="mnav"><button class="dnav" data-act="pmonthNav" data-d="-1" aria-label="이전 달">‹</button><span class="mtitle">${monthLabel(m)}</span><button class="dnav" data-act="pmonthNav" data-d="1" aria-label="다음 달">›</button></div></div>`;
    const warn = [];
    if (!P.hasSales) warn.push(`매출이 없습니다. <button class="btn sm" data-act="view" data-v="salesIn">매출 입력</button>`);
    if (!P.hasSched) warn.push(`근무표가 없어 인건비를 뺄 수 없습니다. 0원으로 계산하지 않고 비워 둡니다. <button class="btn sm" data-act="view" data-v="month">월간 근무표</button>`);
    else if (P.laborEst) warn.push(`인건비는 아직 <b>예상</b>입니다. <button class="btn sm" data-act="view" data-v="labor">인건비 확정하기</button>`);
    if (!P.fixedItems.length) warn.push(`고정비가 설정되지 않았습니다. <button class="btn sm" data-act="view" data-v="settings">설정 › 고정비</button>`);
    if (warn.length) h += `<div class="notice warn"><ul class="hintlist">${warn.map((w) => `<li>${w}</li>`).join('')}</ul></div>`;
    h += `<div class="cards m4">
      <div class="card"><div class="cl">매출</div><div class="cv sm2">${fmtWon(P.sales)}</div></div>
      <div class="card${cr != null && cr > 45 ? ' warn' : ''}"><div class="cl">원가 (매입)</div><div class="cv sm2">${fmtWon(P.cost)}</div><div class="cs">원가율 ${cr != null ? cr + '%' : '–'} · 기준 45%</div></div>
      <div class="card${lr != null && lr > 30 ? ' warn' : ''}"><div class="cl">인건비 ${P.hasSched ? (P.laborEst ? '<span class="chip missed">예상</span>' : '<span class="chip today">확정</span>') : ''}</div><div class="cv sm2">${P.hasSched ? fmtWon(P.labor) : '근무표 없음'}</div><div class="cs">인건비율 ${lr != null ? lr + '%' : '–'} · 기준 30%</div></div>
      <div class="card"><div class="cl">고정비</div><div class="cv sm2">${P.fixedItems.length ? fmtWon(P.fixed) : '미설정'}</div><div class="cs">${P.fixedItems.map((f) => esc(f.name)).join(' · ') || '설정에서 추가'}</div></div></div>`;
    h += `<div class="card pnlBig${P.profit < 0 ? ' neg' : ''}"><div class="cl">이달 남는 돈</div><div class="cv">${fmtWon(P.profit)}</div>
      <div class="cs">${fmtWon(P.sales)} − ${fmtWon(P.cost)} − ${P.hasSched ? fmtWon(P.labor) : '(인건비 없음)'} − ${fmtWon(P.fixed)}${Q.sales ? ` · 지난달 남는 돈 ${fmtWon(Q.profit)} (${P.profit - Q.profit >= 0 ? '+' : '−'}${fmtWon(Math.abs(P.profit - Q.profit))})` : ''}</div></div>`;
    if (P.sales) {
      h += `<div class="hd sub2"><h3>매출 대비</h3></div><div class="loads">${[['원가', P.cost], ['인건비', P.labor], ['고정비', P.fixed], ['남는 돈', Math.max(0, P.profit)]].map(([n, v]) => `<div class="lrow"><span class="ln">${n}</span><span class="lbar"><i style="width:${Math.min(100, v / P.sales * 100)}%"></i></span><span class="lv">${Math.round(v / P.sales * 100)}% <small>${fmtWon(v)}</small></span></div>`).join('')}</div>`;
    }
    if (P.fixedItems.length) h += `<div class="hd sub2"><h3>고정비 내역</h3></div><div class="loads">${P.fixedItems.map((f) => `<div class="lrow"><span class="ln">${esc(f.name)}</span><span class="lbar"><i style="width:${P.fixed ? f.amount / P.fixed * 100 : 0}%"></i></span><span class="lv">${fmtWon(f.amount)} <small>${f.from}부터</small></span></div>`).join('')}</div>`;
    if (Q.sales) h += `<div class="hd sub2"><h3>지난달과 비교</h3></div><div class="loads">${[['매출', P.sales, Q.sales], ['원가', P.cost, Q.cost], ['인건비', P.labor, Q.labor], ['남는 돈', P.profit, Q.profit]].map(([n, a, b]) => `<div class="lrow"><span class="ln">${n}</span><span class="lv" style="margin-left:auto">${fmtWon(b)} → <b>${fmtWon(a)}</b> <small>(${a - b >= 0 ? '+' : '−'}${fmtWon(Math.abs(a - b))})</small></span></div>`).join('')}</div>`;
    return h;
  }

  /* ── 인건비 ── */
  function segMinutes(time) {
    const mm = String(time || '').match(/(\d{1,2}):(\d{2})\s*[–\-~]\s*(\d{1,2}):(\d{2})/);
    if (!mm) return 0;
    let a = Number(mm[1]) * 60 + Number(mm[2]), b = Number(mm[3]) * 60 + Number(mm[4]);
    if (b < a) b += 24 * 60;
    return b - a;
  }
  const mondayOf = (k) => { const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateKey(d); };
  const payOf = (st) => (st && st.pay && st.pay.type && Number(st.pay.amount) > 0 ? st.pay : null);
  function laborSig(m) {
    let s = 0;
    monthDates(m).forEach((k) => dayRows(k).forEach((row) => row.active.forEach((w) => { const str = k + row.seg.key + w.name + row.seg.time; for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0; })));
    return s;
  }
  /* 근무표에서 사람별 근무 시간을 더한다 — 구간 시간표 기준, 휴게 시간은 빼지 않는다(어림) */
  function laborCalc(m) {
    const mins = {}, weeks = {}, days = {};
    let anySched = false;
    monthDates(m).forEach((k) => {
      dayRows(k).forEach((row) => {
        const mi = segMinutes(row.seg.time);
        row.active.forEach((w) => {
          anySched = true;
          mins[w.name] = (mins[w.name] || 0) + mi;
          const wk = mondayOf(k); weeks[w.name] = weeks[w.name] || {}; weeks[w.name][wk] = (weeks[w.name][wk] || 0) + mi;
          days[w.name] = days[w.name] || new Set(); days[w.name].add(k);
        });
      });
    });
    const names = [...new Set([...S.staff.filter((s) => s.active).map((s) => s.name), ...Object.keys(mins)])];
    const rate = Number(S.settings.insRate) || 0, weekly = S.settings.weeklyPay !== false, mw = minWage();
    const rows = names.map((name) => {
      const st = S.staff.find((s) => s.name === name), pay = payOf(st);
      const hours = Math.round((mins[name] || 0) / 60 * 10) / 10;
      const r = { name, staffId: st ? st.id : null, hours, days: days[name] ? days[name].size : 0, payType: pay ? pay.type : '', rate: pay ? Number(pay.amount) : 0, base: 0, weekly: 0, ins: 0, total: 0, flags: [] };
      if (!pay) r.flags.push('급여 기준 없음');
      else if (pay.type === 'month') r.base = r.rate;
      else {
        r.base = Math.round(hours * r.rate);
        if (weekly) Object.values(weeks[name] || {}).forEach((wm) => { const wh = wm / 60; if (wh >= 15) r.weekly += Math.round(Math.min(wh, 40) / 40 * 8 * r.rate); });
        if (r.rate < mw) r.flags.push(`최저임금 ${mw.toLocaleString('ko-KR')}원 미만`);
      }
      r.ins = Math.round((r.base + r.weekly) * rate / 100);
      r.total = r.base + r.weekly + r.ins;
      return r;
    }).filter((r) => r.hours > 0 || r.payType === 'month');
    return { rows, total: rows.reduce((a, r) => a + r.total, 0), anySched, sig: laborSig(m), est: true };
  }
  const payrollOf = (m) => (S.payroll || {})[m] || null;
  /* 손익에 쓰는 인건비 — 확정본이 있으면 그것, 없으면 예상 */
  function laborFor(m) { const p = payrollOf(m); if (p) return { total: p.total, est: false, anySched: true, rows: p.rows }; return laborCalc(m); }

  function vLabor() {
    const m = S.ui.lmonth || curMonth();
    const p = payrollOf(m), L = p ? { rows: p.rows, total: p.total, anySched: true } : laborCalc(m);
    const changed = p && laborSig(m) !== p.sig;
    let h = `<div class="hd"><div><h2>인건비</h2><div class="sub">근무표의 구간 시간 × 시급으로 계산한 <b>예상</b>입니다. 확정은 사장님이 직접 누릅니다.</div></div>
      <div class="mnav"><button class="dnav" data-act="lmonthNav" data-d="-1" aria-label="이전 달">‹</button><span class="mtitle">${monthLabel(m)}</span><button class="dnav" data-act="lmonthNav" data-d="1" aria-label="다음 달">›</button>
      ${p ? `<button class="btn ghost" data-act="laborUnconfirm">확정 풀기</button>` : `<button class="btn primary" data-act="laborConfirm"${L.rows.length ? '' : ' disabled'}>이달 급여 확정</button>`}</div></div>`;
    if (p) h += `<div class="notice ok"><b>확정됨</b> · ${esc(p.at)}${p.by ? ' · ' + esc(p.by) : ''} — 이 숫자가 월 손익에 들어갑니다.${changed ? `<div class="hint warnTxt">⚠️ 확정 후 근무표가 바뀌었습니다. 다시 계산하려면 "확정 풀기"를 누른 뒤 다시 확정하세요.</div>` : ''}</div>`;
    /* 급여 기준 — 직원별 시급/월급 (직원 명단에서 이곳으로 옮김) */
    const sid = Store.meta ? Store.meta.current : 'ansan';
    h += `<details class="notice" ${(L.rows.some((r) => !r.payType) || !L.anySched) ? 'open' : ''}><summary><b>급여 기준 — 직원별 시급 · 월급</b> <small class="mut">인건비 계산에 씁니다. 최저시급 ${fmtNum(minWage())}원</small></summary>
      <div class="tkLogWrap"><table class="tkLog"><thead><tr><th>직원</th><th>급여 형태</th><th class="r">금액 (원)</th><th></th></tr></thead><tbody>
      ${S.staff.filter((s) => s.active).map((s2) => `<tr><td><b>${esc(s2.name)}</b></td>
        <td><select class="tkIn wide" data-act="staffPayType" data-store="${sid}" data-id="${s2.id}"><option value=""${!(s2.pay && s2.pay.type) ? ' selected' : ''}>없음</option><option value="hour"${s2.pay && s2.pay.type === 'hour' ? ' selected' : ''}>시급</option><option value="month"${s2.pay && s2.pay.type === 'month' ? ' selected' : ''}>월급</option></select></td>
        <td class="r"><input type="number" class="tkIn wide" data-act="staffPayAmt" data-store="${sid}" data-id="${s2.id}" value="${s2.pay && s2.pay.amount ? s2.pay.amount : ''}" min="0" step="10" inputmode="numeric" placeholder="예: ${minWage()}"></td>
        <td>${s2.pay && s2.pay.type === 'hour' && Number(s2.pay.amount) > 0 && Number(s2.pay.amount) < minWage() ? '<span class="chip crit">최저임금 미만</span>' : ''}</td></tr>`).join('')}
      ${S.staff.filter((s) => s.active).length ? '' : '<tr><td colspan="4">재직 직원이 없습니다.</td></tr>'}</tbody></table></div></details>`;
    if (!L.anySched) return h + `<div class="notice warn"><b>${monthLabel(m)} 근무표가 없습니다.</b><div class="hint">근무표를 짜면 여기에 사람별 시간과 예상 급여가 나옵니다. 손익에는 0원이 아니라 "근무표 없음"으로 표시됩니다. <button class="btn sm" data-act="view" data-v="month">월간 근무표 열기</button></div></div>`;
    const noPay = L.rows.filter((r) => !r.payType);
    if (noPay.length) h += `<div class="notice warn"><b>급여 기준이 없는 사람 ${noPay.length}명</b> — ${noPay.map((r) => esc(r.name)).join(' · ')}<div class="hint">아래 급여 기준 표에서 시급/월급과 금액을 넣으면 계산됩니다.</div></div>`;

    h += `<div class="cards m4">
      <div class="card"><div class="cl">${p ? '확정 인건비' : '예상 인건비'}</div><div class="cv sm2">${fmtWon(L.total)}</div></div>
      <div class="card"><div class="cl">근무 시간 합계</div><div class="cv">${(Math.round(L.rows.reduce((a, r) => a + r.hours, 0) * 10) / 10).toLocaleString('ko-KR')}<small>시간</small></div></div>
      <div class="card"><div class="cl">주휴수당 합계</div><div class="cv sm2">${fmtWon(L.rows.reduce((a, r) => a + r.weekly, 0))}</div></div>
      <div class="card"><div class="cl">4대보험 (사업주, 어림)</div><div class="cv sm2">${fmtWon(L.rows.reduce((a, r) => a + r.ins, 0))}</div><div class="cs">${Number(S.settings.insRate) || 0}% 기준</div></div></div>`;
    h += `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>이름</th><th>급여 기준</th><th class="r">근무일</th><th class="r">시간</th><th class="r">기본급</th><th class="r">주휴수당</th><th class="r">4대보험</th><th class="r">합계</th><th>비고</th></tr></thead><tbody>
      ${L.rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${r.payType === 'month' ? '월급 ' + fmtWon(r.rate) : r.payType === 'hour' ? '시급 ' + fmtWon(r.rate) : '<span class="chip missed">없음</span>'}</td><td class="r">${r.days}일</td><td class="r">${r.hours}h</td><td class="r">${fmtWon(r.base)}</td><td class="r">${fmtWon(r.weekly)}</td><td class="r">${fmtWon(r.ins)}</td><td class="r"><b>${fmtWon(r.total)}</b></td><td>${(r.flags || []).map((f) => `<span class="chip crit">${esc(f)}</span>`).join(' ')}</td></tr>`).join('')}
      <tr class="sum"><td colspan="7">합계 ${L.rows.length}명</td><td class="r"><b>${fmtWon(L.total)}</b></td><td></td></tr></tbody></table></div>
      <p class="hint">계산 방식 — 시간은 근무표 구간 시간표(예: 점심 11:30–15:00)를 더한 것이며 휴게 시간은 빼지 않았습니다. 주휴수당은 한 주(월~일) 15시간 이상이면 <i>(주 시간 ÷ 40) × 8 × 시급</i>, 40시간을 넘으면 40시간으로 봅니다. 4대보험은 설정의 비율로 어림한 사업주 부담입니다. 실제 지급액은 세무사 확인 후 확정하세요.</p>`;
    return h;
  }
  function laborConfirm() {
    const m = S.ui.lmonth || curMonth(), L = laborCalc(m);
    modal(`${monthLabel(m)} 급여 확정`, `<p>예상 인건비 <b>${fmtWon(L.total)}</b> (${L.rows.length}명)을 확정합니다.</p>
      <p class="hint">확정하면 이 숫자가 고정되어 월 손익에 들어갑니다. 급여를 지급하기 전에 실제 금액과 한 번 더 맞춰 보세요. 근무표를 고치면 "확정 풀기" 후 다시 확정할 수 있습니다.</p>`, () => {
      if (!S.payroll) S.payroll = {};
      S.payroll[m] = { at: stamp(), by: whoNow(), sig: L.sig, rows: L.rows, total: L.total };
      save(); render();
    }, '확정');
  }

  /* 설정 › 서버 연결 (Supabase 실시간 동기화) */
  function serverSettings() {
    const sp = Store.supa;
    const state = !sp.libLoaded ? '<span class="chip missed">연결 도구를 못 불러옴 — 인터넷 확인</span>' : sp.signedIn ? `<span class="chip today">연결됨</span> <small class="mut">${esc(sp.email || '')}</small>` : sp.configured ? '<span class="chip crit">로그인 필요</span>' : '<span class="chip missed">미연결 — 이 기기에만 저장 중</span>';
    return `<div class="hd sub2"><h3>서버 연결 — 실시간 동기화</h3></div>
      <p class="hint">Supabase 서버에 연결하면 매장 아이패드 · 사장님 폰 · PC가 같은 기록을 실시간으로 봅니다. 설정 순서는 <code>서버/README.md</code>. 열쇠는 이 기기에만 저장됩니다.</p>
      <div class="setrow"><span>상태</span><span class="v">${state}</span></div>
      <div class="setrow"><span>Project URL</span><input class="num wide2" data-act="supaUrl" value="${esc(sp.url || '')}" placeholder="https://xxxx.supabase.co" autocomplete="off"${sp.signedIn ? ' disabled' : ''}></div>
      <div class="setrow"><span>anon 키 <div class="hint">공개용 키. service_role 키는 넣지 마세요.</div></span><input type="password" class="num wide2" data-act="supaKey" value="${esc((JSON.parse(localStorage.getItem('hm.supa') || 'null') || {}).key || '')}" placeholder="eyJ…" autocomplete="off"${sp.signedIn ? ' disabled' : ''}></div>
      <div class="rowbtns">${sp.signedIn ? `<button class="btn" data-act="supaLogout">로그아웃</button><button class="btn ghost danger" data-act="supaClear">연결 해제</button>` : `<button class="btn primary" data-act="supaLogin"${sp.configured ? '' : ' disabled'}>로그인</button>${sp.configured ? '<button class="btn ghost danger" data-act="supaClear">설정 지우기</button>' : ''}</div>`}
      <p class="hint">${sp.signedIn ? '이 기기의 변경은 곧바로 서버에 올라가고, 다른 기기의 변경은 1~2초 안에 이 화면에 나타납니다.' : '주소와 키를 넣으면 로그인 버튼이 켜집니다. 처음 연결하는 기기의 기록이 서버에 올라가니, 기록이 있는 기기부터 연결하세요.'}</p>`;
  }
  function supaLoginModal() {
    modal('서버 로그인 — 매장 공용 계정', `<label>이메일<input id="suE" type="email" autocomplete="username" placeholder="store@example.com"></label>
      <label>비밀번호<input id="suP" type="password" autocomplete="current-password"></label>
      <p class="hint">Supabase › Authentication › Users 에서 만든 계정입니다. 기기마다 한 번만 로그인하면 계속 유지됩니다.</p>`, () => {
      const e = $('#suE').value.trim(), pw = $('#suP').value;
      if (!e || !pw) { alert('이메일과 비밀번호를 넣어 주세요.'); return false; }
      const btn = $('#modal [data-act="mOk"]'); if (btn) { btn.disabled = true; btn.textContent = '연결 중…'; }
      Store.flush().then(() => Store.supaSignIn(e, pw)).then(() => { closeModal(); banner('서버에 연결했습니다', '앱을 다시 불러옵니다.'); setTimeout(() => location.reload(), 600); })
        .catch((err) => { if (btn) { btn.disabled = false; btn.textContent = '로그인'; } alert('로그인 실패: ' + (err && err.message ? err.message : err)); });
      return false;
    }, '로그인');
  }
  /* 설정 화면의 고정비 · 급여 기준 칸 */
  function acctSettings() {
    const fc = fixedList();
    return `<div class="hd sub2"><h3>고정비 — ${esc(storeName())}</h3></div>
      <p class="hint">매달 나가는 돈을 한 번 적어두면 월 손익에 자동으로 들어갑니다. 금액이 바뀌면 같은 항목을 새 적용 시작 월로 다시 추가하세요.</p>
      ${fc.length ? `<div class="plist">${fc.slice().sort((a, b) => a.name.localeCompare(b.name) || (b.from || '').localeCompare(a.from || '')).map((f) => `<button class="prow" data-act="fixedEdit" data-id="${f.id}"><span class="pnm">${esc(f.name)}</span><span class="pby">${f.from}부터</span><span class="pamt">${fmtWon(f.amount)}</span></button>`).join('')}</div>` : `<div class="notice"><span class="hint" style="margin:0">아직 고정비가 없습니다. 임대료 · 공과금 · 보험부터 넣어 보세요.</span></div>`}
      <div class="rowbtns"><button class="btn" data-act="fixedAdd">+ 고정비 추가</button></div>
      <div class="hd sub2"><h3>급여 기준</h3></div>
      <div class="setrow"><span>4대보험 사업주 부담 비율<div class="hint">기본급+주휴수당에 이 비율을 곱해 어림합니다. 세무사 확인 후 조정하세요.</div></span>
        <input type="number" class="num" data-act="insRate" value="${Number(S.settings.insRate) || 0}" min="0" max="30" step="0.1"><span class="hint" style="margin:0">%</span></div>
      <div class="setrow"><span>주휴수당 자동 계산<div class="hint">한 주 15시간 이상 일한 시급 직원에게 자동으로 더합니다.</div></span>
        <button class="btn sm${S.settings.weeklyPay !== false ? ' on' : ''}" data-act="weeklyPay">${S.settings.weeklyPay !== false ? '켜짐' : '꺼짐'}</button></div>
      <div class="setrow"><span>급여명세서 — 근로자 부담 4대보험 요율 (%)<div class="hint">국민연금 · 건강보험 · 장기요양(건강보험의 %) · 고용보험. 기본값은 2026년 기준 예시이며 고시가 바뀌면 여기서 고칩니다.</div></span>
        <span class="v">${[['np', '국민연금'], ['hi', '건강'], ['ltc', '장기요양'], ['ei', '고용']].map(([k, n]) => `<label class="dedIn">${n}<input type="number" class="tkIn" data-act="dedRate" data-k="${k}" value="${dedRates()[k]}" min="0" max="30" step="0.001"></label>`).join('')}</span></div>
      <div class="setrow"><span>임금 지급일 (명세서용)<div class="hint">근로계약서에 지급일이 있으면 그 값을 먼저 씁니다.</div></span><input class="num wide" data-act="payDayText" value="${esc(S.settings.payDayText || '매월 10일')}"></div>`;
  }

  /* ── 트러블시트 (두 매장 공용) ───────────────────────────
     SH.issues[] 는 매장 문서가 아니라 공용 문서 'shared:issues' 에 산다. 이슈마다 store(매장 이름).
     예전 매장별 이슈 노트(S.issues)는 처음 열 때 한 번만 옮겨 온다. */
  let SH = { issues: [] }, issueStore = 'all';
  const issuesAll = () => (SH.issues = SH.issues || []);
  function saveShared() { Store.saveShared('issues', SH); }
  async function loadSharedIssues() {
    const doc = await Store.loadShared('issues');
    SH = doc && Array.isArray(doc.issues) ? doc : { issues: [] };
    const mt = Store.meta; let moved = 0;
    for (const st of (mt ? mt.stores : [])) {
      const doc2 = st.id === mt.current ? S : await Store.loadStore(st.id);
      if (!doc2 || !Array.isArray(doc2.issues) || doc2.issuesMoved) continue;
      doc2.issues.forEach((x) => { if (!SH.issues.some((y) => y.id === x.id)) { SH.issues.push({ ...x, store: x.store || st.name }); moved++; } });
      doc2.issuesMoved = true;
      if (st.id === mt.current) save(); else await Store.saveStore(st.id, doc2);
    }
    if (moved) saveShared();
    Store.watchShared('issues');
    if (view === 'issues') render();
  }

  /* ── 보건증 · 위생교육 ────────────────────────────────────
     staff.health{issued, memo} · S.settings.healthMonths(기본 12)
     S.hygiene{ owner{done, every, org, memo}, staff{ staffId: {done, memo} } } */
  const healthMonths = () => Number(S.settings.healthMonths) || 12;
  function addMonths(k, n) { const d = new Date(k + 'T00:00:00'); d.setMonth(d.getMonth() + n); return dateKey(d); }
  function dueStatus(done, months) {
    if (!done) return { level: 'none', label: '미등록', left: null, due: null };
    const due = addMonths(done, months), left = diffDays(dateKey(), due);
    const level = left < 0 ? 'expired' : left <= 7 ? 'urgent' : left <= 30 ? 'soon' : 'ok';
    const label = level === 'expired' ? `만료 ${-left}일 지남` : level === 'ok' ? `${left}일 남음` : `${left}일 남음 · 곧 만료`;
    return { level, label, left, due };
  }
  /* 보건증 목록 — 직원 명단과 별개로 이름을 직접 적는다. S.health[{id, name, issued, memo}]
     예전 staff.health 기록과 재직 직원 이름은 처음 열 때 한 번 옮겨 넣는다 */
  function healthList() {
    if (!Array.isArray(S.health)) {
      S.health = [];
      S.staff.filter((s) => s.active).forEach((s) => S.health.push({ id: newId('h'), name: s.name, issued: (s.health && s.health.issued) || '', memo: (s.health && s.health.memo) || '' }));
    }
    return S.health;
  }
  const healthEntry = (name) => healthList().find((x) => x.name === name);
  const healthOf = (st) => { const e = st && healthEntry(st.name); return dueStatus(e && e.issued, healthMonths()); };
  function hygieneOf() {
    if (!S.hygiene) S.hygiene = {};
    if (!S.hygiene.owner) S.hygiene.owner = { done: '', every: 12, org: '', memo: '' };
    if (!S.hygiene.staff) S.hygiene.staff = {};
    return S.hygiene;
  }
  const ownerHygiene = () => { const o = hygieneOf().owner; return dueStatus(o.done, Number(o.every) || 12); };
  const dueBad = (st) => st.level === 'expired' || st.level === 'urgent' || st.level === 'soon';
  /* 할 일 화면 맨 위 알림 */
  function staffAlerts() {
    const out = [];
    healthList().forEach((e) => { const h = dueStatus(e.issued, healthMonths()); if (e.name && dueBad(h)) out.push({ v: 'health', text: `${e.name} 보건증 ${h.label}` }); });
    const o = ownerHygiene(); if (dueBad(o)) out.push({ v: 'hygiene', text: `영업자 위생교육 ${o.label}` });
    const hs = hygieneOf().staff;
    S.staff.filter((s) => s.active && hs[s.id] && hs[s.id].done).forEach((s) => { const st = dueStatus(hs[s.id].done, 12); if (dueBad(st)) out.push({ v: 'hygiene', text: `${s.name} 위생교육 ${st.label}` }); });
    return out;
  }
  const lvlChip = (st) => `<span class="chip ${st.level === 'ok' ? 'today' : st.level === 'none' ? 'missed' : 'crit'}">${st.label}</span>`;

  function vHealth() {
    const list = healthList();
    const stat = (e) => dueStatus(e.issued, healthMonths());
    const bad = list.filter((e) => dueBad(stat(e))), none = list.filter((e) => stat(e).level === 'none');
    let h = `<div class="hd"><div><h2>보건증 관리</h2><div class="sub">식품을 다루는 사람은 건강진단(보건증)을 받아야 합니다. 이름과 발급일만 적어 두면 만료 30일·7일 전에 할 일 화면에 알림이 뜹니다.</div></div>
      <div class="mnav"><span class="hint" style="margin:0">유효기간</span><input type="number" class="tkIn" data-act="healthMonths" value="${healthMonths()}" min="1" max="36"><span class="hint" style="margin:0">개월</span>
        <button class="btn primary" data-act="healthAdd">+ 사람 추가</button></div></div>`;
    h += `<div class="cards m4">
      <div class="card"><div class="cl">등록 인원</div><div class="cv">${list.length}<small>명</small></div></div>
      <div class="card${bad.length ? ' warn' : ''}"><div class="cl">만료 · 임박</div><div class="cv">${bad.length}<small>명</small></div><div class="cs">30일 이내</div></div>
      <div class="card${none.length ? ' warn' : ''}"><div class="cl">발급일 미입력</div><div class="cv">${none.length}<small>명</small></div></div>
      <div class="card"><div class="cl">정상</div><div class="cv">${list.length - bad.length - none.length}<small>명</small></div></div></div>`;
    h += `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>이름</th><th>발급일</th><th>만료일</th><th>상태</th><th>메모</th><th></th></tr></thead><tbody>
      ${list.map((e) => { const st = stat(e); return `<tr><td><input class="tkIn wide" data-act="healthName" data-id="${e.id}" value="${esc(e.name || '')}" placeholder="이름"></td>
        <td><input type="date" class="tkIn wide" data-act="healthDate" data-id="${e.id}" value="${esc(e.issued || '')}" max="${dateKey()}"></td>
        <td class="mut">${st.due || '—'}</td><td>${lvlChip(st)}</td>
        <td><input class="tkIn wide2" data-act="healthMemo" data-id="${e.id}" value="${esc(e.memo || '')}" placeholder="보건소 · 검진기관 등"></td>
        <td><button class="btn sm ghost danger" data-act="healthDel" data-id="${e.id}">삭제</button></td></tr>`; }).join('')}
      ${list.length ? '' : '<tr><td colspan="6">아직 등록한 사람이 없습니다. <b>+ 사람 추가</b>로 시작하세요.</td></tr>'}</tbody></table></div>
      <p class="hint">기준 — 식품위생법 제40조: 식품 조리·판매 종사자는 건강진단을 받아야 하며 유효기간은 통상 1년으로 봅니다(관할 보건소 기준 확인). 여기 적은 이름이 직원 명단의 이름과 같으면, 만료된 사람을 근무표에 배치할 때 배치 창에 경고가 보입니다.</p>`;
    return h;
  }
  function vHygiene() {
    const hy = hygieneOf(), o = hy.owner, os = ownerHygiene(), act = S.staff.filter((s) => s.active);
    let h = `<div class="hd"><div><h2>위생교육 일정관리</h2><div class="sub">영업자는 매년 식품위생교육(3시간)을 받아야 합니다. 이수일을 적어 두면 다음 기한 30일·7일 전에 알림이 뜹니다.</div></div></div>`;
    h += `<div class="hd sub2"><h3>영업자 위생교육 — ${esc(storeName())}</h3></div>
      <div class="setrow"><span>최근 이수일</span><input type="date" class="num wide" data-act="hyOwner" data-f="done" value="${esc(o.done || '')}" max="${dateKey()}"></div>
      <div class="setrow"><span>주기 (개월)</span><input type="number" class="num" data-act="hyOwner" data-f="every" value="${Number(o.every) || 12}" min="1" max="36"></div>
      <div class="setrow"><span>교육기관 · 메모<div class="hint">예: 한국외식업중앙회 온라인 교육</div></span><input class="num wide2" data-act="hyOwner" data-f="org" value="${esc(o.org || '')}"></div>
      <div class="setrow"><span>다음 기한</span><span class="v">${os.due || '—'} ${lvlChip(os)}</span></div>`;
    h += `<div class="hd sub2"><h3>직원 위생교육 <small>(선택)</small></h3></div>
      <p class="hint">신규 직원 위생교육이나 매장 자체 교육을 한 날을 적어 두면 1년 뒤 알림이 뜹니다.</p>
      <div class="tkLogWrap"><table class="tkLog"><thead><tr><th>직원</th><th>이수일</th><th>다음 기한</th><th>상태</th><th>메모</th></tr></thead><tbody>
      ${act.map((s) => { const r = hy.staff[s.id] || {}, st = dueStatus(r.done, 12); return `<tr><td><b>${esc(s.name)}</b></td>
        <td><input type="date" class="tkIn wide" data-act="hyStaff" data-id="${s.id}" data-f="done" value="${esc(r.done || '')}" max="${dateKey()}"></td>
        <td class="mut">${st.due || '—'}</td><td>${r.done ? lvlChip(st) : '<span class="chip missed">없음</span>'}</td>
        <td><input class="tkIn wide2" data-act="hyStaff" data-id="${s.id}" data-f="memo" value="${esc(r.memo || '')}"></td></tr>`; }).join('')}
      ${act.length ? '' : '<tr><td colspan="5">재직 직원이 없습니다.</td></tr>'}</tbody></table></div>
      <p class="hint">기준 — 식품위생법 제41조: 식품접객업 영업자는 매년 식품위생교육을 받아야 합니다(기존 영업자 3시간, 온라인 가능). 이수증은 영업신고 서류와 함께 보관하세요.</p>`;
    return h;
  }

  /* ── 급여명세서 ───────────────────────────────────────────
     확정한 인건비(S.payroll[m])로 만든다. S.payroll[m].slips{ name: { tax, sent[{at,how}] } }
     이메일 자동 발송은 서버가 있어야 해서 다음 버전. 지금은 메일 앱을 열어 주고 발송 기록을 남긴다. */
  const DED_DEFAULT = { np: 4.75, hi: 3.595, ltc: 13.14, ei: 0.9 };   // 근로자 부담 % — 2026년 기준 예시값. 설정에서 고친다
  function dedRates() { if (!S.settings.ded) S.settings.ded = { ...DED_DEFAULT }; return S.settings.ded; }
  function slipOf(m, r) {
    const p = payrollOf(m), d = dedRates(), st = S.staff.find((s) => s.name === r.name) || {};
    const gross = r.base + r.weekly;
    const np = Math.round(gross * d.np / 100), hi = Math.round(gross * d.hi / 100), ltc = Math.round(hi * d.ltc / 100), ei = Math.round(gross * d.ei / 100);
    const sl = (p && p.slips && p.slips[r.name]) || {};
    const tax = Number(sl.tax) || 0, ltax = Math.round(tax / 10);
    const ded = np + hi + ltc + ei + tax + ltax;
    return { gross, np, hi, ltc, ei, tax, ltax, ded, net: gross - ded, email: st.email || '', sent: sl.sent || [] };
  }
  function slipMeta(r) {
    const c = (S.contracts || []).filter((x) => x.staffName === r.name || (r.staffId && x.staffId === r.staffId)).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))[0];
    const birth = c && c.f && c.f.worker && c.f.worker.rrn ? c.f.worker.rrn.slice(0, 6) : '';
    return { biz: bizOf(), payDay: (c && c.f && payDayText(c.f)) || S.settings.payDayText || '매월 10일', birth };
  }
  function slipPaper(m, r) {
    const s = slipOf(m, r), mt = slipMeta(r), d = dedRates(), [y, mo] = m.split('-').map(Number);
    const row = (n, v, note) => `<tr><td>${esc(n)}</td><td class="r">${fmtWon(v)}</td><td class="mut">${note || ''}</td></tr>`;
    return `<div class="paper slip"><h1>임금명세서</h1>
      <table class="slipHead"><tr><th>사업장</th><td>${esc(mt.biz.name)} (대표 ${esc(mt.biz.rep)})</td><th>근로자</th><td>${esc(r.name)}${mt.birth ? ` · 생년월일 ${mt.birth.slice(0, 2)}.${mt.birth.slice(2, 4)}.${mt.birth.slice(4, 6)}` : ''}</td></tr>
      <tr><th>임금 귀속 기간</th><td>${y}년 ${mo}월 1일 ~ 말일</td><th>임금 지급일</th><td>${esc(mt.payDay)}</td></tr>
      <tr><th>근무</th><td>${r.days}일 · ${r.hours}시간</td><th>급여 기준</th><td>${r.payType === 'month' ? '월급 ' + fmtWon(r.rate) : '시급 ' + fmtWon(r.rate)}</td></tr></table>
      <h4>지급 항목</h4><table class="slipT"><thead><tr><th>항목</th><th class="r">금액</th><th>계산 방법</th></tr></thead><tbody>
        ${row('기본급', r.base, r.payType === 'month' ? '월급' : `${r.hours}시간 × ${fmtWon(r.rate)}`)}
        ${r.weekly ? row('주휴수당', r.weekly, '주 15시간 이상 근무한 주 × (주 시간 ÷ 40) × 8 × 시급') : ''}
        <tr class="sum"><td>지급 총액</td><td class="r">${fmtWon(s.gross)}</td><td></td></tr></tbody></table>
      <h4>공제 항목</h4><table class="slipT"><thead><tr><th>항목</th><th class="r">금액</th><th>계산 방법</th></tr></thead><tbody>
        ${row('국민연금', s.np, `지급 총액 × ${d.np}%`)}${row('건강보험', s.hi, `지급 총액 × ${d.hi}%`)}${row('장기요양보험', s.ltc, `건강보험 × ${d.ltc}%`)}${row('고용보험', s.ei, `지급 총액 × ${d.ei}%`)}
        ${row('소득세', s.tax, '간이세액표')}${row('지방소득세', s.ltax, '소득세 × 10%')}
        <tr class="sum"><td>공제 총액</td><td class="r">${fmtWon(s.ded)}</td><td></td></tr></tbody></table>
      <div class="slipNet">실지급액 <b>${fmtWon(s.net)}</b></div>
      <p class="pNote">근로기준법 제48조 제2항에 따라 교부하는 임금명세서입니다. 4대보험 요율은 사업장 설정값이며 실제 고지액과 차이가 있을 수 있습니다.${mt.biz.phone ? ' 문의 ' + esc(mt.biz.phone) : ''}</p>
      <div class="pHash">발행 ${stamp()} · ${esc(storeName())}</div></div>`;
  }
  function slipText(m, r) {
    const s = slipOf(m, r), mt = slipMeta(r), d = dedRates(), [y, mo] = m.split('-').map(Number);
    return [`[${mt.biz.name}] ${y}년 ${mo}월 임금명세서 — ${r.name}`, '',
      `임금 귀속 기간: ${y}년 ${mo}월 1일 ~ 말일`, `임금 지급일: ${mt.payDay}`,
      `근무: ${r.days}일 · ${r.hours}시간 (${r.payType === 'month' ? '월급 ' + fmtWon(r.rate) : '시급 ' + fmtWon(r.rate)})`, '',
      '[지급 항목]', `기본급 ${fmtWon(r.base)}${r.payType === 'month' ? '' : ` (${r.hours}시간 × ${fmtWon(r.rate)})`}`,
      ...(r.weekly ? [`주휴수당 ${fmtWon(r.weekly)}`] : []), `지급 총액 ${fmtWon(s.gross)}`, '',
      '[공제 항목]', `국민연금 ${fmtWon(s.np)} (${d.np}%)`, `건강보험 ${fmtWon(s.hi)} (${d.hi}%)`, `장기요양보험 ${fmtWon(s.ltc)}`, `고용보험 ${fmtWon(s.ei)} (${d.ei}%)`,
      `소득세 ${fmtWon(s.tax)} · 지방소득세 ${fmtWon(s.ltax)}`, `공제 총액 ${fmtWon(s.ded)}`, '',
      `실지급액 ${fmtWon(s.net)}`, '', `근로기준법 제48조 제2항에 따라 교부합니다.${mt.biz.phone ? ' 문의 ' + mt.biz.phone : ''}`].join('\n');
  }
  function vPayslip() {
    const m = S.ui.lmonth || curMonth(), p = payrollOf(m);
    let h = `<div class="hd"><div><h2>급여명세서</h2><div class="sub">확정한 인건비로 직원별 명세서를 만듭니다. "이메일로 보내기"를 누르면 메일 앱이 열리고, 보낸 기록이 남습니다.</div></div>
      <div class="mnav"><button class="dnav" data-act="lmonthNav" data-d="-1" aria-label="이전 달">‹</button><span class="mtitle">${monthLabel(m)}</span><button class="dnav" data-act="lmonthNav" data-d="1" aria-label="다음 달">›</button>
      ${p ? `<button class="btn" data-act="slipPrintAll">전체 인쇄</button>` : ''}</div></div>`;
    h += `<div class="notice"><b>자동 발송은 다음 버전(서버)에서 붙습니다.</b> 지금은 직원 주소 · 제목 · 명세서 본문이 채워진 메일 창이 열리고, 사장님이 보내기만 누르면 됩니다.</div>`;
    if (!p) return h + `<div class="notice warn"><b>${monthLabel(m)} 급여가 아직 확정되지 않았습니다.</b><div class="hint">인건비 화면에서 "이달 급여 확정"을 누르면 명세서를 만들 수 있습니다. <button class="btn sm" data-act="view" data-v="labor">인건비 열기</button></div></div>`;
    const rows = p.rows.filter((r) => r.payType);
    h += `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>직원</th><th class="r">지급 총액</th><th class="r">공제</th><th class="r">실지급</th><th class="r">소득세</th><th>이메일</th><th>발송</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const s = slipOf(m, r), last = s.sent[s.sent.length - 1]; return `<tr><td><b>${esc(r.name)}</b></td><td class="r">${fmtWon(s.gross)}</td><td class="r">${fmtWon(s.ded)}</td><td class="r"><b>${fmtWon(s.net)}</b></td>
        <td class="r"><input type="number" class="tkIn" data-act="slipTax" data-n="${esc(r.name)}" value="${s.tax || ''}" min="0" step="10" placeholder="0"></td>
        <td>${s.email ? esc(s.email) : '<span class="chip missed">이메일 없음</span>'}</td>
        <td>${last ? `<span class="chip today">✓ ${esc(last.at.slice(5))}</span> <small class="mut">${esc(last.how)}</small>` : '<span class="chip missed">미발송</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-act="slipView" data-n="${esc(r.name)}">보기 · 인쇄</button> ${s.email ? `<button class="btn sm primary" data-act="slipMail" data-n="${esc(r.name)}">이메일로 보내기</button>` : ''} <button class="btn sm ghost" data-act="slipSent" data-n="${esc(r.name)}">발송 완료 표시</button></td></tr>`; }).join('')}
      ${rows.length ? '' : '<tr><td colspan="8">급여 기준(시급/월급)이 있는 직원이 없습니다.</td></tr>'}</tbody></table></div>
      <p class="hint">소득세는 간이세액표 금액을 직접 넣습니다(모르면 0 · 세무사 확인). 4대보험 근로자 부담 요율은 설정 › 급여 기준에서 고칩니다. 이메일이 없는 직원은 직원 명단에 이메일을 넣으세요.</p>`;
    return h;
  }
  function slipRow(m, name) { const p = payrollOf(m); return p ? p.rows.find((r) => r.name === name) : null; }
  function slipMark(m, name, how) {
    const p = payrollOf(m); if (!p) return;
    p.slips = p.slips || {}; p.slips[name] = p.slips[name] || {}; p.slips[name].sent = p.slips[name].sent || [];
    p.slips[name].sent.push({ at: stamp(), how }); save(); render();
  }
  function printHtml(html) {
    let box = $('#printBox'); if (!box) { box = document.createElement('div'); box.id = 'printBox'; document.body.appendChild(box); }
    box.innerHTML = html; document.body.classList.add('printMode');
    const done = () => { document.body.classList.remove('printMode'); window.removeEventListener('afterprint', done); box.innerHTML = ''; };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { alert('이 화면에서는 인쇄가 막혀 있습니다.'); } setTimeout(done, 1500); }, 50);
  }

  /* ── 갑각류 매입 인사이트 ────────────────────────────────
     원가 관리의 매입 기록(S.purchases, 분류 대게·킹크랩·랍스터, 단위 kg) 으로 kg당 단가 흐름을 읽고,
     수요 일정(설·추석·가정의달·연말) 앞에서 단가가 어떻게 움직였는지 과거 패턴을 뽑아 다음 일정의 매입 시점을 권한다.
     활 갑각류라 "쌀 때 대량 매입"은 수조 보관 가능 일수(S.settings.crabHold, 기본 28일 — 사장님 기준 3~4주) 안에서만 계산한다. */
  const CRAB_SPECIES = ['대게', '킹크랩', '랍스터'];
  const BUY_EVENTS_BASE = [
    { name: '설', dates: ['2024-02-10', '2025-01-29', '2026-02-17', '2027-02-07', '2028-01-27'] },
    { name: '추석', dates: ['2024-09-17', '2025-10-06', '2026-09-25', '2027-09-15', '2028-10-03'] },
    { name: '가정의달', dates: ['2024-05-08', '2025-05-08', '2026-05-08', '2027-05-08', '2028-05-08'] },
    { name: '연말', dates: ['2024-12-24', '2025-12-24', '2026-12-24', '2027-12-24', '2028-12-24'] },
  ];
  function buyEvents() {
    const out = [];
    BUY_EVENTS_BASE.forEach((e) => e.dates.forEach((d) => out.push({ name: e.name, date: d })));
    (S.settings.buyEvents || []).forEach((e) => { if (e.name && e.date) out.push({ name: e.name, date: e.date, custom: true }); });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const crabHold = (sp) => { const h = S.settings.crabHold || {}; return Number(h[sp]) || 28; };   // 사장님 답: 활 갑각류 3~4주 보관 가능 → 기본 28일
  const crabBuys = (sp) => (S.purchases || []).filter((x) => x.cat === sp && (x.unit || 'kg') === 'kg' && Number(x.qty) > 0 && Number(x.amount) > 0 && x.date).map((x) => ({ date: x.date, kg: Number(x.qty), amt: Number(x.amount), name: x.name || '' }));
  /* 매장 간 시세 참조 — 매입 기록이 없는 매장(안양점)은 다른 매장(안산점) 매입 단가를 시세 참고로 빌린다.
     marketCache: 매장 id → 그 매장 매입 [{date, kg, amt, name, cat}]. 현재 매장은 캐시하지 않고 항상 S.purchases 를 직접 쓴다. */
  let marketCache = {};
  const purchaseRows = (list) => (Array.isArray(list) ? list : []).filter((x) => x && x.cat && (x.unit || 'kg') === 'kg' && Number(x.qty) > 0 && Number(x.amount) > 0 && x.date).map((x) => ({ date: x.date, kg: Number(x.qty), amt: Number(x.amount), name: x.name || '', cat: x.cat })).sort((a, b) => a.date.localeCompare(b.date));
  async function loadMarketCache() {
    try {
      const mt = Store.meta; if (!mt || !Array.isArray(mt.stores)) return;
      const cur = mt.current, next = {};
      for (const st of mt.stores) {
        if (st.id === cur) continue;
        try { const doc = await Store.loadStore(st.id); next[st.id] = purchaseRows(doc && doc.purchases); } catch (e) { next[st.id] = []; }
      }
      if (Store.meta && Store.meta.current !== cur) return;   // 읽는 동안 매장이 바뀌었으면 버린다 (바뀐 쪽에서 다시 부른다)
      marketCache = next;
      if (view === 'buyInsight') render();
    } catch (e) { /* 시세 참조는 없어도 앱은 돌아야 한다 */ }
  }
  /* 단가 흐름에 쓸 매입 — 이 매장 기록이 있으면 그것, 없으면 캐시의 다른 매장 매입을 빌린다 */
  function priceBuys(sp) {
    const own = crabBuys(sp); if (own.length) return { buys: own, source: storeName(), borrowed: false, from: '' };
    const mt = Store.meta;
    for (const st of (mt && Array.isArray(mt.stores) ? mt.stores : [])) {
      if (st.id === mt.current) continue;
      const rows = (marketCache[st.id] || []).filter((x) => x.cat === sp);
      if (rows.length) return { buys: rows, source: `${st.name} (참조)`, borrowed: true, from: st.name };
    }
    return { buys: [], source: '', borrowed: false, from: '' };
  }
  const wavg = (list) => { const kg = list.reduce((a, x) => a + x.kg, 0); return kg ? Math.round(list.reduce((a, x) => a + x.amt, 0) / kg) : null; };
  const inRange = (list, a, b) => list.filter((x) => x.date >= a && x.date <= b);
  const pctDiff = (a, b) => (a && b ? Math.round((a - b) / b * 100) : null);
  const signOf = (p) => (p == null ? '' : (p > 0 ? '+' : '') + p + '%');
  /* 일정 앞 8주 패턴 — 주 w(−8..0) 는 [E+7w−6, E+7w] 구간. 여러 해를 평균한다 */
  function eventPattern(sp, evName, buys) {
    const occ = buyEvents().filter((e) => e.name === evName && e.date <= dateKey());
    const offs = {}; let n = 0;
    occ.forEach((e) => {
      let any = false;
      for (let w = -8; w <= 0; w++) {
        const b = shift(e.date, 7 * w), a = shift(b, -6), p = wavg(inRange(buys, a, b));
        if (p == null) continue; any = true;
        (offs[w] = offs[w] || []).push(p);
      }
      if (any) n++;
    });
    const avg = {}; Object.entries(offs).forEach(([w, arr]) => { avg[w] = Math.round(arr.reduce((a, x) => a + x, 0) / arr.length); });
    const baseArr = [-8, -7, -6, -5].map((w) => avg[w]).filter(Boolean);
    const base = baseArr.length ? Math.round(baseArr.reduce((a, x) => a + x, 0) / baseArr.length) : null;
    const ws = Object.keys(avg).map(Number).sort((a, b) => a - b);
    const minW = ws.length ? ws.reduce((m, w) => (avg[w] < avg[m] ? w : m), ws[0]) : null;
    const peakW = ws.length ? ws.reduce((m, w) => (avg[w] > avg[m] ? w : m), ws[0]) : null;
    return { n, avg, base, minW, peakW, ws };
  }
  /* 다음 일정에 대한 권장 — 보관 일수 안에서 가장 싼 주를 고른다 */
  function eventAdvice(sp, ev, buys) {
    const pat = eventPattern(sp, ev.name, buys), hold = crabHold(sp), maxBack = Math.max(1, Math.ceil(hold / 7));
    const today = dateKey();
    const all = pat.ws.filter((w) => w >= -maxBack && w <= 0);
    let cand = all.filter((w) => shift(ev.date, 7 * w) >= today), late = false;   // 이미 지난 주는 권할 수 없다
    if (!cand.length) { cand = all; late = true; }
    if (!pat.n || !cand.length) return { pat, hold, ok: false };
    const cheapest = cand.reduce((m, w) => (pat.avg[w] < pat.avg[m] ? w : m), cand[0]);
    // 가장 싼 주와 3% 안이면 더 늦은(신선한) 주를 고른다
    const pick = cand.filter((w) => pat.avg[w] <= pat.avg[cheapest] * 1.03).sort((a, b) => b - a)[0];
    const atEvent = pat.avg[0] != null ? pat.avg[0] : pat.avg[pat.peakW];
    const from = shift(ev.date, 7 * pick - 6), to = shift(ev.date, 7 * pick);
    // 보관 일수 밖에서 더 쌌던 주 — 보관을 늘릴 수 있으면 참고
    const earlier = pat.ws.filter((w) => w < -maxBack && pat.avg[w] < pat.avg[pick] * 0.95).sort((a, b) => pat.avg[a] - pat.avg[b])[0];
    return { pat, hold, ok: true, pick, from, to, late, price: pat.avg[pick], atEvent, saveRate: pctDiff(pat.avg[pick], atEvent), earlier: earlier != null ? { w: earlier, price: pat.avg[earlier], rate: pctDiff(pat.avg[earlier], pat.avg[pick]) } : null };
  }
  /* ── 필요량은 판매 기록으로 ──
     매출 입력의 품종 kg(crab/king/lob) 이 있는 날은 그대로, kg 을 안 적은 날(빈칸)은 그날 총매출 × 만원당 kg 으로 추정한다.
     0kg 은 기록으로 센다 — 빈칸(null/undefined/'')만 추정한다. */
  const SP_KEY = { '대게': 'crab', '킹크랩': 'king', '랍스터': 'lob' };
  const hasNum = (v) => v != null && v !== '' && !isNaN(v);
  /* 일정 주간 — 설·추석은 연휴가 뒤로도 이어져 [E−4, E+2], 그 외는 일정 당일로 끝나는 7일 [E−6, E] */
  const demandWin = (ev) => (ev.name === '설' || ev.name === '추석') ? [shift(ev.date, -4), shift(ev.date, 2)] : [shift(ev.date, -6), ev.date];
  /* 이 매장에서 품종 kg 과 총매출을 둘 다 적은 날(최근 400일)의 "그날 kg ÷ 그날 매출" 중간값 (원당 kg).
     합계 비율이 아니라 중간값을 쓰는 이유 — kg 칸에 가격 같은 엉뚱한 숫자가 하루라도 들어가면 합계가 통째로 틀어진다.
     하루 300kg 넘는 기록은 입력 실수로 보고 뺀다. */
  const DAY_KG_MAX = 300;
  function kgPerWon(sp) {
    const key = SP_KEY[sp]; if (!key) return 0;
    const from = shift(dateKey(), -400), ratios = [];
    salesDates().forEach((k) => { if (k < from) return; const r = S.sales[k]; if (!r || !hasNum(r[key])) return; const kg = Number(r[key]), t = salesTotal(r); if (t > 0 && kg >= 0 && kg <= DAY_KG_MAX) ratios.push(kg / t); });
    if (!ratios.length) return 0;
    ratios.sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)];
  }
  /* 평소 하루 매출 — 최근 365일 매출을 적은 날 평균 */
  function usualDaySales() {
    const from = shift(dateKey(), -365); let sum = 0, n = 0;
    salesDates().forEach((k) => { if (k < from) return; const t = salesTotal(S.sales[k]); if (t > 0) { sum += t; n++; } });
    return n ? sum / n : 0;
  }
  /* 지난 같은 일정 중 판매 기록이 있는 것(최근 2회)으로 필요량 → { kg, recorded, estimated, sales, days, how, uplift, n, year, win } 또는 null */
  function demandKg(sp, ev) {
    const key = SP_KEY[sp]; if (!key) return null;
    const today = dateKey(), rate = kgPerWon(sp), usual = usualDaySales();
    const occ = buyEvents().filter((e) => e.name === ev.name && e.date < ev.date && e.date <= today).reverse();
    const hits = [];
    occ.forEach((e) => {
      if (hits.length >= 2) return;
      const [a, b] = demandWin(e); let rec = 0, est = 0, sales = 0, days = 0, recDays = 0, missing = 0, noRate = 0;
      for (let k = a; k <= b; k = shift(k, 1)) {
        const r = salesOf(k); if (!r) continue;
        const t = salesTotal(r);
        if (hasNum(r[key]) && Number(r[key]) <= DAY_KG_MAX) { rec += Number(r[key]); recDays++; if (t > 0) { sales += t; days++; } }
        else if (t > 0) { days++; sales += t; if (rate > 0) { est += t * rate; missing++; } else noRate++; }
      }
      if (!recDays && !missing) return;   // kg 기록도 없고 추정도 못 하면 건너뛴다 (→ 매입 kg 으로 대체). 0kg 기록은 기록으로 센다
      hits.push({ year: e.date.slice(0, 4), a, b, rec, est, sales, days, recDays, missing, noRate });
    });
    if (!hits.length) return null;
    const n = hits.length, avg = (f) => hits.reduce((s, x) => s + f(x), 0) / n;
    const recorded = Math.round(avg((x) => x.rec) * 10) / 10, estimated = Math.round(avg((x) => x.est) * 10) / 10;
    const dayAvg = avg((x) => (x.days ? x.sales / x.days : 0));
    const uplift = usual > 0 ? Math.round((dayAvg / usual - 1) * 100) : null;
    const how = hits.map((x) => `${x.year}년 ${ev.name} 주간(${x.a.slice(5)}~${x.b.slice(5)}) 판매 ${sp} ${Math.round(x.rec)}kg 기록${x.missing ? ` + 매출로 추정 ${Math.round(x.est)}kg (kg 빠진 ${x.missing}일)` : ''}${x.noRate ? ` (kg 빠진 ${x.noRate}일은 추정 못 함)` : ''}`).join(' · ') + (n > 1 ? ` → ${n}회 평균` : '');
    return { kg: Math.round((recorded + estimated) * 10) / 10, recorded, estimated, sales: Math.round(avg((x) => x.sales)), days: Math.round(avg((x) => x.days)), how, uplift, n, year: hits[0].year, win: [hits[0].a, hits[0].b] };
  }
  /* 대체 — 판매 기록이 없을 때 지난 같은 일정 전 1주 매입 kg (여러 해면 평균) */
  function eventNeedKgBuys(sp, ev) {
    const buys = crabBuys(sp), occ = buyEvents().filter((e) => e.name === ev.name && e.date < ev.date && e.date <= dateKey());
    const got = occ.map((e) => inRange(buys, shift(e.date, -7), e.date).reduce((s, x) => s + x.kg, 0)).filter((k) => k > 0);
    if (!got.length) return null;
    return { kg: Math.round(got.reduce((a, x) => a + x, 0) / got.length * 10) / 10, how: `판매 기록 없음 → ${ev.name} 전 1주 매입 kg 기준${got.length > 1 ? ` (${got.length}회 평균)` : ''}`, est: false, basis: 'buys', demand: null };
  }
  /* 일정 주간에 얼마나 팔렸나 — 판매 기록(demandKg) 우선, 없으면 매입 kg 으로 대체 */
  function eventNeedKg(sp, ev) {
    const d = demandKg(sp, ev);
    if (d) return { kg: d.kg, how: d.how, est: d.estimated > 0, basis: 'sales', demand: d };
    return eventNeedKgBuys(sp, ev);
  }

  /* ── 매입 인사이트: 그래프(SVG) · 수조 용량 매입 계획 ── */
  const doy = (k) => { const d = new Date(k + 'T00:00:00'); return Math.round((d - new Date(d.getFullYear(), 0, 1)) / 86400000); };
  const YEAR_STYLE = ['#8a9aa0', '#c9a55c', '#59b9b2', '#e58a6e'];   // 오래된 해 → 최근 해
  const tankMaxKg = () => Number(S.settings.tankMaxKg) || 700;
  /* 수조 관리표 입고 kg 합계 — 품종별 현재 재고 */
  function tankStockKg(sp) {
    const T = S.tanks; if (!T || !T.items) return 0;
    let kg = 0; T.items.forEach((it) => ['top', 'bottom'].forEach((pos) => { const c = it[pos]; if (c && c.species === sp && Number(c.kg) > 0) kg += Number(c.kg); }));
    return Math.round(kg * 10) / 10;
  }
  /* 연간 단가 선 그래프 — 해마다 한 줄, x는 1~12월(날짜), y는 kg당 단가. 추석·설 위치 표시 */
  function priceLineChart(sp, buys) {
    const years = [...new Set(buys.map((x) => x.date.slice(0, 4)))].sort();
    if (!years.length) return '';
    const W = 760, H = 260, L = 58, R = 16, T = 26, B = 34, iw = W - L - R, ih = H - T - B;
    const pts = {}; let ymax = 0;
    years.forEach((y) => { pts[y] = []; for (let k = `${y}-01-01`; k.slice(0, 4) === y; k = shift(k, 7)) { const p = wavg(inRange(buys, k, shift(k, 6))); if (p != null) { pts[y].push({ x: doy(k) + 3, y: p, k }); ymax = Math.max(ymax, p); } } });
    ymax = Math.ceil(ymax * 1.08 / 10000) * 10000 || 10000;
    const X = (d) => L + d / 365 * iw, Y = (v) => T + ih - v / ymax * ih;
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${sp} 연간 kg당 단가">`;
    for (let i = 0; i <= 4; i++) { const v = ymax / 4 * i; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ty">${Math.round(v / 1000)}천</text>`; }
    for (let m = 0; m < 12; m++) { const d = doy(`2025-${pad(m + 1)}-01`); g += `<line x1="${X(d)}" x2="${X(d)}" y1="${T}" y2="${T + ih}" class="grid v"/><text x="${X(d) + 3}" y="${H - 14}" class="tx">${m + 1}월</text>`; }
    // 명절 표시 — 해마다 위치가 달라 해 색으로
    years.forEach((y, i) => buyEvents().filter((e) => e.date.startsWith(y) && (e.name === '추석' || e.name === '설')).forEach((e) => {
      const x = X(doy(e.date)); g += `<line x1="${x}" x2="${x}" y1="${T}" y2="${T + ih}" class="ev" style="stroke:${YEAR_STYLE[i % 4]}"/><text x="${x + 3}" y="${T + 11 + i * 12}" class="te" style="fill:${YEAR_STYLE[i % 4]}">${e.name} ${y.slice(2)}</text>`;
    }));
    years.forEach((y, i) => { const c = YEAR_STYLE[i % 4], p = pts[y]; if (!p.length) return;
      // 4주 넘게 비면 선을 끊는다
      let d = ''; p.forEach((q, j) => { d += (j === 0 || q.x - p[j - 1].x > 28 ? 'M' : 'L') + X(q.x).toFixed(1) + ' ' + Y(q.y).toFixed(1) + ' '; });
      g += `<path d="${d}" class="ln" style="stroke:${c}"/>` + p.map((q) => `<circle cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="3" style="fill:${c}"><title>${q.k} 주 · ${fmtWon(q.y)}/kg</title></circle>`).join('');
    });
    g += years.map((y, i) => `<rect x="${L + i * 70}" y="4" width="12" height="4" style="fill:${YEAR_STYLE[i % 4]}"/><text x="${L + i * 70 + 16}" y="9" class="tl">${y}년</text>`).join('');
    return g + `</svg>`;
  }
  /* 월별 매입 kg 막대 — 해별 나란히 */
  function kgBarChart(sp, buys) {
    const years = [...new Set(buys.map((x) => x.date.slice(0, 4)))].sort(); if (!years.length) return '';
    const W = 760, H = 180, L = 50, R = 12, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
    const v = {}; let mx = 0; years.forEach((y) => { v[y] = []; for (let m = 1; m <= 12; m++) { const kg = buys.filter((x) => x.date.slice(0, 7) === `${y}-${pad(m)}`).reduce((a, x) => a + x.kg, 0); v[y].push(kg); mx = Math.max(mx, kg); } });
    mx = Math.ceil(mx / 100) * 100 || 100;
    const gw = iw / 12, bw = Math.max(3, (gw - 8) / years.length);
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${sp} 월별 매입 kg">`;
    for (let i = 0; i <= 2; i++) { const yy = T + ih - ih / 2 * i; g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="ty">${Math.round(mx / 2 * i)}</text>`; }
    for (let m = 0; m < 12; m++) { g += `<text x="${L + gw * m + gw / 2}" y="${H - 10}" class="tx mid">${m + 1}월</text>`; years.forEach((y, i) => { const kg = v[y][m]; if (!kg) return; const h = kg / mx * ih; g += `<rect x="${(L + gw * m + 4 + i * bw).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" style="fill:${YEAR_STYLE[i % 4]}"><title>${y}년 ${m + 1}월 · ${fmtKg(kg)}</title></rect>`; }); }
    return g + `</svg>`;
  }
  /* 지난 같은 일정 중 앞 21일~뒤 7일에 판매 기록이 하나라도 있는 가장 최근 것 */
  function demandRef(ev) {
    const today = dateKey(), keys = salesDates();
    const occ = buyEvents().filter((e) => e.name === ev.name && e.date < ev.date && e.date <= today).reverse();
    return occ.find((e) => { const a = shift(e.date, -21), b = shift(e.date, 7); return keys.some((k) => k >= a && k <= b); }) || null;
  }
  /* 판매 수요 그래프 — 지난 같은 일정 앞 21일~뒤 7일의 일별 총매출 막대(왼쪽 축) + 품종 판매 kg 점(오른쪽 축). 기록이 없으면 빈 문자열 */
  function demandChart(sp, ev) {
    const key = SP_KEY[sp]; if (!key) return '';
    const past = demandRef(ev); if (!past) return '';
    const a = shift(past.date, -21), b = shift(past.date, 7), days = [];
    for (let k = a; k <= b; k = shift(k, 1)) { const r = salesOf(k), t = r ? salesTotal(r) : 0; days.push({ k, t: t > 0 ? t : 0, kg: r && hasNum(r[key]) ? Number(r[key]) : null, has: !!r }); }
    if (!days.some((d) => d.has)) return '';
    const W = 760, H = 200, L = 58, R = 48, T = 20, B = 30, iw = W - L - R, ih = H - T - B;
    const tmax = Math.ceil(Math.max(...days.map((d) => d.t), 1) / 500000) * 500000 || 500000;
    const kmax = Math.ceil(Math.max(...days.map((d) => d.kg || 0), 1) / 10) * 10 || 10;
    const gw = iw / days.length, bw = Math.max(4, gw - 4);
    const Y = (v) => T + ih - v / tmax * ih, YK = (v) => T + ih - v / kmax * ih, X = (i) => L + gw * i + (gw - bw) / 2;
    const [wa, wb] = demandWin(past), wi = Math.max(0, diffDays(a, wa)), wj = Math.min(days.length - 1, diffDays(a, wb));
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="지난 ${esc(ev.name)} 앞뒤 일별 매출과 ${esc(sp)} 판매 kg">`;
    g += `<rect x="${(L + gw * wi).toFixed(1)}" y="${T}" width="${(gw * (wj - wi + 1)).toFixed(1)}" height="${ih}" class="dWin"><title>${esc(ev.name)} 주간 ${wa} ~ ${wb} — 필요량을 세는 기간</title></rect>`;
    for (let i = 0; i <= 2; i++) { const v = tmax / 2 * i, yy = Y(v).toFixed(1); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" class="ty">${Math.round(v / 10000)}만</text><text x="${W - R + 6}" y="${(Y(v) + 4).toFixed(1)}" class="tx">${Math.round(kmax / 2 * i)}kg</text>`; }
    days.forEach((d, i) => {
      const x = X(i), wd = WD[new Date(d.k + 'T00:00:00').getDay()];
      if (d.t > 0) { const hh = d.t / tmax * ih; g += `<rect x="${x.toFixed(1)}" y="${(T + ih - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" class="dBar"><title>${d.k} (${wd}) 매출 ${fmtWon(d.t)}${d.kg != null ? ` · ${esc(sp)} ${fmtKg(d.kg)}` : ' · kg 기록 없음 → 추정'}</title></rect>`; }
      if (d.kg != null) g += `<circle cx="${(x + bw / 2).toFixed(1)}" cy="${YK(d.kg).toFixed(1)}" r="3" class="dDot"><title>${d.k} (${wd}) ${esc(sp)} ${fmtKg(d.kg)}</title></circle>`;
      if (i % 7 === 0 || i === days.length - 1) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" class="tx mid">${d.k.slice(5)}</text>`;
    });
    const ex = (X(diffDays(a, past.date)) + bw / 2).toFixed(1);
    g += `<line x1="${ex}" x2="${ex}" y1="${T}" y2="${T + ih}" class="ev" style="stroke:var(--crit)"/><text x="${Number(ex) + 4}" y="${T - 7}" class="te" style="fill:var(--crit)">${esc(ev.name)} ${past.date.slice(5)}</text>`;
    return g + `</svg>`;
  }
  /* 일정 매입 계획 — 품종별 필요량(판매 기록)과 수조 남은 자리로 권장 kg. 단가는 이 매장 매입, 없으면 다른 매장 매입을 시세 참고로 */
  function eventPlan(ev) {
    const cap = tankMaxKg(), rows = []; let borrowed = '';
    CRAB_SPECIES.forEach((sp) => {
      const pb = priceBuys(sp), need = eventNeedKg(sp, ev);
      if (!pb.buys.length && !need) return;
      if (pb.borrowed) borrowed = pb.from;
      const ad = eventAdvice(sp, ev, pb.buys);
      rows.push({ sp, ad, need: need ? Math.max(0, Math.round(need.kg * 10) / 10) : 0, needHow: need ? need.how : '', needEst: !!(need && need.est), needBasis: need ? need.basis : '', stock: tankStockKg(sp) });
    });
    const stock = rows.reduce((a, r) => a + r.stock, 0), free = Math.max(0, cap - stock);
    const wantTotal = rows.reduce((a, r) => a + Math.max(0, r.need - r.stock), 0);
    rows.forEach((r) => { const want = Math.max(0, r.need - r.stock); r.buy = wantTotal ? Math.round(Math.min(want, free * want / wantTotal)) : 0; r.save = r.ad.ok && r.ad.saveRate != null && r.ad.saveRate < 0 ? Math.round(r.buy * (r.ad.atEvent - r.ad.price)) : 0; });
    // 반올림 때문에 합계가 남는 자리를 넘으면 제일 큰 행에서 깎는다
    let over = rows.reduce((a, r) => a + r.buy, 0) - free;
    if (over > 0) { const big = rows.slice().sort((x, y) => y.buy - x.buy)[0]; if (big) { big.buy = Math.max(0, big.buy - Math.ceil(over)); big.save = big.ad.ok && big.ad.saveRate != null && big.ad.saveRate < 0 ? Math.round(big.buy * (big.ad.atEvent - big.ad.price)) : 0; } }
    return { cap, stock, free, rows, buyTotal: rows.reduce((a, r) => a + r.buy, 0), saveTotal: rows.reduce((a, r) => a + r.save, 0), short: wantTotal > free, borrowed };
  }
  function planTable(ev) {
    const P = eventPlan(ev); if (!P.rows.length) return '';
    const needCell = (r) => { if (!r.need) return '–'; const basis = r.needBasis === 'buys' ? '매입 kg 기준' : r.needEst ? '판매 기준 · 일부 추정' : '판매 기준'; return `<span title="${esc(r.needHow)}">${r.needEst ? '≈ ' : ''}${fmtKg(r.need)}</span><small class="mut" title="${esc(r.needHow)}">${basis}</small>`; };
    const sumNeed = P.rows.reduce((a, r) => a + r.need, 0), sumEst = P.rows.some((r) => r.needEst);
    return `<div class="tkLogWrap"><table class="tkLog"><thead><tr><th>품종</th><th>권장 매입 시기</th><th class="r">그때 단가</th><th class="r">일정 주간 단가</th><th class="r">필요량</th><th class="r">수조 재고</th><th class="r"><b>권장 매입</b></th><th class="r">절감</th></tr></thead><tbody>
      ${P.rows.map((r) => `<tr><td><b>${r.sp}</b></td><td>${r.ad.ok ? (r.ad.late ? '지금 바로 <small class="mut">(권장 구간 지남)</small>' : `${r.ad.from.slice(5)} ~ ${r.ad.to.slice(5)} <small class="mut">(${-r.ad.pick === 0 ? '일정 주간' : -r.ad.pick + '주 전'})</small>`) : '<span class="mut">패턴 없음</span>'}</td>
        <td class="r">${r.ad.ok ? fmtWon(r.ad.price) : '–'}</td><td class="r">${r.ad.ok ? fmtWon(r.ad.atEvent) : '–'}</td><td class="r">${needCell(r)}</td><td class="r">${fmtKg(r.stock)}</td><td class="r"><b>${fmtKg(r.buy)}</b></td><td class="r">${r.save ? fmtWon(r.save) : '–'}</td></tr>`).join('')}
      <tr class="sum"><td colspan="4">수조 ${fmtKg(P.cap)} · 재고 ${fmtKg(P.stock)} · 남는 자리 ${fmtKg(P.free)}</td><td class="r">${sumEst ? '≈ ' : ''}${fmtKg(sumNeed)}</td><td class="r">${fmtKg(P.stock)}</td><td class="r"><b>${fmtKg(P.buyTotal)}</b></td><td class="r"><b>${P.saveTotal ? fmtWon(P.saveTotal) : '–'}</b></td></tr></tbody></table></div>
      ${P.short ? `<p class="hint warnTxt">필요량이 수조 남는 자리보다 많아 비율대로 줄였습니다. 일정에 가까워지며 팔린 만큼 추가 매입하세요.</p>` : ''}`;
  }

  /* ── 판단: 지금이 매입 시기인가 ─────────────────────────── */
  const mdKo = (k) => `${Number(k.slice(5, 7))}월 ${Number(k.slice(8, 10))}일`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function timingVerdict(sp, ev) {
    const today = dateKey(), hold = crabHold(sp), { buys, source, borrowed } = priceBuys(sp);
    const ad = buys.length ? eventAdvice(sp, ev, buys) : { ok: false };
    const dday = diffDays(today, ev.date);
    let state, headline;
    if (!ad.ok) { state = 'no-data'; headline = '단가 기록이 없어 판단할 수 없습니다'; }
    else if (ad.late) { state = 'late'; headline = '권장 구간이 지났습니다 — 더 오르기 전에 지금 사세요'; }
    else if (dday > hold + 21) { state = 'far'; headline = `아직 멀었습니다 — ${mdKo(ad.from)}쯤부터 보세요`; }
    else if (today >= ad.from && today <= ad.to) { state = 'now'; headline = '지금이 매입 구간입니다'; }
    else if (today < ad.from) { state = 'wait'; headline = `아직 기다리세요 — ${mdKo(ad.from)}부터 (${diffDays(today, ad.from)}일 뒤)`; }
    else { state = 'now'; headline = '지금 사세요 — 일정이 코앞입니다'; }
    const last30 = buys.length ? wavg(inRange(buys, shift(today, -30), today)) : null, avg12 = buys.length ? wavg(inRange(buys, shift(today, -365), today)) : null;
    const vs12 = pctDiff(last30, avg12);
    const priceNote = last30 == null ? '최근 30일 매입이 없어 지금 단가를 모릅니다'
      : vs12 != null && vs12 <= -10 ? `지금 단가 ${fmtWon(last30)}/kg — 12개월 평균보다 ${-vs12}% 쌉니다 (저가 구간)`
      : vs12 != null && vs12 >= 10 ? `지금 단가 ${fmtWon(last30)}/kg — 12개월 평균보다 ${vs12}% 비쌉니다`
      : `지금 단가 ${fmtWon(last30)}/kg — 평소 수준입니다`;
    const patternNote = !ad.ok ? '이 일정 앞 매입 기록이 없습니다'
      : ad.pick === 0 ? `과거 ${ad.pat.n}회 ${ev.name}: 일정 주간 ${fmtWon(ad.price)}/kg (그 전 주 기록 없음)`
      : `과거 ${ad.pat.n}회 ${ev.name} 앞: ${-ad.pick}주 전 ${fmtWon(ad.price)}/kg → 일정 주간 ${fmtWon(ad.atEvent)}/kg (${signOf(ad.saveRate)})`;
    const need = eventNeedKg(sp, ev);
    const P = eventPlan(ev), row = P.rows.find((r) => r.sp === sp);
    const needNote = need ? `필요량 ${need.est ? '≈' : '약'} ${fmtKg(need.kg)} (${need.how})` : '필요량을 잡을 판매·매입 기록이 없습니다';
    return { state, headline, priceNote, patternNote, needNote, need, buyKg: row ? row.buy : 0, save: row ? row.save : 0, stock: tankStockKg(sp), ad, from: ad.ok ? ad.from : null, to: ad.ok ? ad.to : null, source, borrowed, dday, hold, free: P.free };
  }
  function timelineHtml(v, ev) {
    const today = dateKey(), span = Math.max(1, v.dday);
    let band = '';
    if (v.state === 'late') band = `<i class="band past" style="left:0;width:6%"></i><span class="lbl" style="left:0">권장 구간 지남</span>`;
    else if (v.from) {
      const left = clamp(diffDays(today, v.from) / span * 100, 0, 100), width = clamp((diffDays(v.from, v.to) + 1) / span * 100, 2, 100 - left);
      band = `<i class="band" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></i><span class="lbl" style="left:${left.toFixed(1)}%">${v.from.slice(5)}~${v.to.slice(5)}</span>`;
    }
    return `<div class="tl">${band}<b class="now">오늘</b><b class="ev">${esc(ev.name)} D-${v.dday}</b></div>`;
  }
  const STATE_CHIP = { now: ['ok', '지금 매입'], late: ['crit', '지금 바로'], wait: ['warn', '기다리기'], far: ['missed', '아직 멀음'], 'no-data': ['missed', '기록 없음'] };
  function verdictCard(sp, ev) {
    const v = timingVerdict(sp, ev), [cc, ct] = STATE_CHIP[v.state];
    const buy = v.buyKg > 0 ? `권장 매입 <b>${fmtKg(v.buyKg)}</b>${v.save > 0 ? ` · 예상 절감 ${fmtWon(v.save)}` : ''}${v.stock > 0 ? ` · 수조 재고 ${fmtKg(v.stock)} 반영` : ''}`
      : v.need ? (v.free <= 0 ? '수조가 가득 차 있어 추가 매입 없음' : `추가 매입 없음 (재고 ${fmtKg(v.stock)} ≥ 필요량)`) : '필요량 미정 — 판매 kg이 쌓이면 자동으로 잡힙니다';
    return `<div class="vcard ${v.state}"><div class="vhead">${esc(sp)} <span class="chip ${cc}">${ct}</span><small class="mut">보관 ${v.hold}일 기준</small></div>
      <div class="vline">${esc(v.headline)}</div>
      ${v.state === 'no-data' ? '' : timelineHtml(v, ev)}
      <ol class="why"><li>${esc(v.patternNote)}</li><li>${esc(v.priceNote)}</li><li>${esc(v.needNote)}</li></ol>
      <div class="buyLine">${buy}</div>
      ${v.borrowed ? `<small class="mut">단가: ${esc(v.source)} 매입 기준</small>` : ''}</div>`;
  }

  /* 샘플 자료 — 외부 주소(Vercel)에서 자료 없이 열었을 때 화면을 보여주기 위해. 실제 자료 대신 가짜 숫자 */
  async function loadSampleData() {
    const get = async (p) => { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(p); return parseCSV(await r.text()); };
    try {
      const pu = await get('샘플/매입_샘플.csv'), sa = await get('샘플/매출_샘플.csv');
      const ix = (head) => { const m = {}; head.forEach((c, i) => { m[c.replace(/\s+/g, '')] = i; }); return m; };
      const pi = ix(pu.head), si = ix(sa.head);
      S.purchases = (S.purchases || []).filter((x) => x.src !== 'sample');
      pu.rows.forEach((r) => { const d = r[pi['날짜']], kg = Number(r[pi['kg']]), amt = Number(r[pi['금액']]); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(amt > 0)) return;
        const cat = PURCHASE_CATS.includes(r[pi['품종']]) ? r[pi['품종']] : guessCat(r[pi['품목']] || '');
        S.purchases.push({ id: newId('p'), date: d, cat, name: r[pi['품목']] || cat, qty: kg > 0 ? kg : null, unit: 'kg', amount: amt, vendor: r[pi['거래처']] || '샘플', memo: '', by: '샘플', createdAt: Date.now(), src: 'sample' }); });
      if (!S.sales) S.sales = {};
      Object.keys(S.sales).forEach((k) => { if (S.sales[k].src === 'sample') delete S.sales[k]; });
      const num = (v) => (v === '' || v == null ? null : Number(v));
      sa.rows.forEach((r) => { const d = r[si['날짜']]; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > dateKey() || S.sales[d]) return; const total = num(r[si['총매출']]); if (!total) return;
        S.sales[d] = { orders: num(r[si['총주문']]), store: num(r[si['매장매출']]), deliv: num(r[si['배달매출']]), take: num(r[si['포장매출']]), total, crab: num(r[si['대게kg']]), king: num(r[si['킹크랩kg']]), lob: num(r[si['랍스타kg']]), liquor: num(r[si['주류매출']]), by: '샘플', at: stamp(), src: 'sample' }; });
      save(); render(); banner('샘플 자료를 넣었습니다', '전부 가짜 숫자입니다. 화면 아래 "샘플 자료 지우기"로 되돌릴 수 있습니다.');
    } catch (e) { alert('샘플 자료를 불러오지 못했습니다. 인터넷 주소(https://…)로 열었을 때만 됩니다.'); }
  }
  const hasSample = () => (S.purchases || []).some((x) => x.src === 'sample') || Object.values(S.sales || {}).some((x) => x && x.src === 'sample');
  function clearSampleData() {
    S.purchases = (S.purchases || []).filter((x) => x.src !== 'sample');
    Object.keys(S.sales || {}).forEach((k) => { if (S.sales[k].src === 'sample') delete S.sales[k]; });
    save(); render();
  }

  function vBuyInsight() {
    const own = CRAB_SPECIES.filter((sp) => crabBuys(sp).length);
    const have = CRAB_SPECIES.filter((sp) => priceBuys(sp).buys.length);
    const sp = have.includes(S.ui.biSp) ? S.ui.biSp : (have[0] || '대게');
    const { buys, source, borrowed, from } = priceBuys(sp), today = dateKey();
    let h = `<div class="hd"><div><h2>갑각류 매입 인사이트</h2><div class="sub">과거 매입 단가와 판매 기록으로 <b>지금이 매입 시기인지</b>를 봅니다.</div></div>
      <div class="mnav"><span class="hint" style="margin:0">보관 가능</span><input type="number" class="tkIn" data-act="crabHold" data-sp="${sp}" value="${crabHold(sp)}" min="1" max="60"><span class="hint" style="margin:0">일</span>
        <span class="hint" style="margin:0 0 0 10px">수조 최대</span><input type="number" class="tkIn" data-act="tankMaxKg" value="${tankMaxKg()}" min="10" step="10"><span class="hint" style="margin:0">kg</span></div></div>`;
    if (!have.length) {
      return h + `<div class="notice"><b>매입 기록이 없어 아직 판단할 수 없습니다.</b>
        <div class="hint">원가 관리에서 거래처 원장을 CSV로 가져오거나 매입을 kg 단위로 적으면 여기에 "지금 사야 하나"가 나옵니다. 자료 없이 화면만 보려면 샘플(가짜 숫자)을 넣어 보세요.</div>
        <div class="rowbtns"><button class="btn" data-act="view" data-v="costs">원가 관리 열기</button><button class="btn primary" data-act="sampleLoad">샘플 자료로 보기</button></div></div>`;
    }
    /* 다음 일정 고르기 */
    const nexts = buyEvents().filter((e) => e.date >= today).slice(0, 3);
    const ev = nexts.find((e) => e.date === S.ui.biEv) || nexts[0];
    if (!ev) return h + `<div class="notice">앞으로의 수요 일정이 없습니다. 아래에서 일정을 추가하세요.</div>`;
    h += `<div class="filters">${nexts.map((e) => `<button class="fl${e === ev ? ' on' : ''}" data-act="biEv" data-d="${e.date}">${esc(e.name)} <small>${e.date.slice(5)} · D-${diffDays(today, e.date)}</small></button>`).join('')}</div>`;
    if (borrowed) h += `<div class="notice">이 매장에는 매입 기록이 없어 <b>${esc(from)}</b> 매입 단가를 시세 참고로 씁니다. 필요량은 이 매장 판매 기록으로 계산합니다.</div>`;
    if (hasSample()) h += `<div class="notice warn"><b>샘플(가짜) 자료를 보는 중입니다.</b> <button class="btn sm" data-act="sampleClear">샘플 자료 지우기</button></div>`;

    /* 판단 카드 — 자료가 있는 품종마다 */
    const show = CRAB_SPECIES.filter((s2) => priceBuys(s2).buys.length || eventNeedKg(s2, ev));
    h += `<div class="verdicts">${show.map((s2) => verdictCard(s2, ev)).join('')}</div>`;
    const P = eventPlan(ev);
    const line = show.map((s2) => { const v = timingVerdict(s2, ev); const when = v.state === 'now' ? `지금 매입 구간(~${v.to.slice(5)})` : v.state === 'late' ? '권장 구간 지남 → 지금 바로' : v.state === 'wait' ? `${mdKo(v.from)}부터` : v.state === 'far' ? '아직 멀음' : '기록 없음'; return `<b>${esc(s2)}</b>: ${when}${v.buyKg > 0 ? ` ${fmtKg(v.buyKg)}` : ''}`; }).join(' · ');
    h += `<div class="notice">${line} · 수조 남는 자리 ${fmtKg(P.free)}${P.buyTotal ? ` · 권장 합계 <b>${fmtKg(P.buyTotal)}</b>` : ''}${P.saveTotal ? ` · 예상 절감 ${fmtWon(P.saveTotal)}` : ''}</div>`;

    /* 매입 계획표 */
    h += `<div class="hd sub2"><h3>${esc(ev.name)} (${ev.date}, D-${diffDays(today, ev.date)}) 매입 계획 — 수조 ${fmtKg(tankMaxKg())} 기준</h3><span class="hint" style="margin:0">가장 쌌던 주에 얼마나 사둘지 · 필요량은 지난 같은 일정 주간 판매 kg · 재고는 수조 관리표 입고 kg</span></div>` + planTable(ev);

    /* ── 근거 자세히 보기 (접힘) ── */
    const chips = `<div class="filters" style="margin:6px 0 10px">${CRAB_SPECIES.map((s2) => `<button class="fl${s2 === sp ? ' on' : ''}" data-act="biSp" data-sp="${s2}">${s2}${own.includes(s2) ? '' : have.includes(s2) ? ' <small>(참조)</small>' : ' <small>(기록 없음)</small>'}</button>`).join('')}</div>`;
    const ref = demandRef(ev), dc = ref ? demandChart(sp, ev) : '', dm = demandKg(sp, ev);
    h += `<details class="notice bi-more"><summary><b>근거 1 · 지난 ${esc(ev.name)} 판매 흐름${ref ? ` — ${ref.date.slice(0, 4)}년` : ''}</b></summary>${chips}
      ${dc ? `<p class="hint">막대는 그날 총매출 · 점은 ${esc(sp)} 판매 kg (적은 날만) · 색칠한 곳이 필요량을 세는 주간</p><div class="chartBox">${dc}</div>` : `<p class="hint">지난 ${esc(ev.name)} 앞뒤 판매 기록이 없습니다.</p>`}
      ${dm ? `<p class="hint">${esc(ev.name)} 주간 매출은 평소보다 <b>${dm.uplift != null ? signOf(dm.uplift) : '–'}</b> · ${esc(sp)} 필요량 ≈ <b>${fmtKg(dm.kg)}</b> (기록 ${fmtKg(dm.recorded)} + 추정 ${fmtKg(dm.estimated)})${dm.n > 1 ? ` · ${dm.n}회 평균` : ''}</p>` : ''}</details>`;

    if (buys.length) {
      const last30 = wavg(inRange(buys, shift(today, -30), today)), avg12 = wavg(inRange(buys, shift(today, -365), today));
      const ly = wavg(inRange(buys, shift(today, -380), shift(today, -350)));
      const vs12 = pctDiff(last30, avg12), vsLy = pctDiff(last30, ly);
      const sig = last30 == null ? { c: 'missed', t: '최근 30일 매입 없음' } : vs12 <= -10 ? { c: 'today', t: '저가 구간' } : vs12 >= 10 ? { c: 'crit', t: '고가 구간' } : { c: 'missed', t: '보통' };
      const sortedP = buys.map((x) => x.amt / x.kg).sort((a, b) => a - b), median = sortedP[Math.floor(sortedP.length / 2)] || 1;
      h += `<details class="notice bi-more"><summary><b>근거 2 · ${esc(sp)} 단가 흐름 — 연간 그래프 · 월별 kg · 지금 단가</b></summary>${chips}
        <div class="cards m4">
        <div class="card"><div class="cl">최근 30일 평균 단가</div><div class="cv sm2">${last30 != null ? fmtWon(last30) + '/kg' : '–'}</div><div class="cs"><span class="chip ${sig.c}">${sig.t}</span></div></div>
        <div class="card${vs12 != null && vs12 >= 10 ? ' warn' : ''}"><div class="cl">12개월 평균 대비</div><div class="cv sm2">${vs12 != null ? signOf(vs12) : '–'}</div><div class="cs">12개월 평균 ${avg12 != null ? fmtWon(avg12) : '–'}</div></div>
        <div class="card${vsLy != null && vsLy >= 10 ? ' warn' : ''}"><div class="cl">작년 같은 시기 대비</div><div class="cv sm2">${vsLy != null ? signOf(vsLy) : '–'}</div><div class="cs">작년 이맘때 ${ly != null ? fmtWon(ly) : '기록 없음'}</div></div>
        <div class="card"><div class="cl">기록${borrowed ? ' <small class="mut">(참조)</small>' : ''}</div><div class="cv sm2">${buys.length}건 · ${fmtKg(buys.reduce((a, x) => a + x.kg, 0))}</div><div class="cs">${buys[0].date} ~ ${buys[buys.length - 1].date}${borrowed ? ` · ${esc(source)}` : ''}</div></div></div>
        <p class="hint">주 단위 평균 · 점에 마우스를 올리면 단가 · 세로 점선은 그해 추석·설</p><div class="chartBox">${priceLineChart(sp, buys)}</div>
        <p class="hint">월별 매입 kg</p><div class="chartBox">${kgBarChart(sp, buys)}</div></details>`;

      const evNames = [...new Set(buyEvents().map((e) => e.name))];
      h += `<details class="notice bi-more"><summary><b>근거 3 · 일정 앞 8주 단가 패턴 (과거 평균, kg당)</b></summary>${chips}<p class="hint">8~5주 전 평균을 기준(0%)으로 몇 % 움직였나</p>
        <div class="tkLogWrap"><table class="tkLog biPat"><thead><tr><th>일정</th><th>해</th>${[-8, -7, -6, -5, -4, -3, -2, -1, 0].map((w) => `<th class="r">${w === 0 ? '당주' : -w + '주 전'}</th>`).join('')}<th>가장 쌈</th><th>정점</th></tr></thead><tbody>
        ${evNames.map((n) => { const p = eventPattern(sp, n, buys); if (!p.n) return `<tr><td>${esc(n)}</td><td class="mut">기록 없음</td><td colspan="11"></td></tr>`;
          return `<tr><td><b>${esc(n)}</b></td><td class="mut">${p.n}회</td>${[-8, -7, -6, -5, -4, -3, -2, -1, 0].map((w) => { const v = p.avg[w]; const r = v != null && p.base ? Math.round((v - p.base) / p.base * 100) : null; return `<td class="r ${r == null ? '' : r <= -5 ? 'cheap' : r >= 10 ? 'dear' : ''}">${v != null ? `${fmtNum(v)}<small>${r != null ? ' ' + signOf(r) : ''}</small>` : '–'}</td>`; }).join('')}
          <td>${p.minW != null ? (p.minW === 0 ? '당주' : -p.minW + '주 전') : '–'}</td><td>${p.peakW != null ? (p.peakW === 0 ? '당주' : -p.peakW + '주 전') : '–'}</td></tr>`; }).join('')}
        </tbody></table></div></details>`;

      const years = [...new Set(buys.map((x) => x.date.slice(0, 4)))].sort();
      const cell = (y, m) => { const mm = `${y}-${pad(m)}`, l = buys.filter((x) => x.date.slice(0, 7) === mm); const p = wavg(l); if (p == null) return '<td class="mut">–</td>'; const r = p / median; return `<td class="r ${r <= 0.85 ? 'cheap' : r >= 1.15 ? 'dear' : ''}">${fmtNum(p)}<small>${fmtKg(l.reduce((a, x) => a + x.kg, 0))}</small></td>`; };
      const weeks = []; for (let k = mondayOf(shift(today, -730)); k <= today; k = shift(k, 7)) weeks.push(k);
      const wp = weeks.map((k) => ({ k, p: wavg(inRange(buys, k, shift(k, 6))) })), wmx = Math.max(...wp.map((x) => x.p || 0), 1);
      const byName = {}; buys.forEach((x) => { const o = byName[x.name] = byName[x.name] || { kg: 0, amt: 0, last: null, lastP: null }; o.kg += x.kg; o.amt += x.amt; if (!o.last || x.date > o.last) { o.last = x.date; o.lastP = Math.round(x.amt / x.kg); } });
      h += `<details class="notice bi-more"><summary><b>근거 4 · 월별 단가 표 · 주간 막대 · 품목별</b></summary>${chips}
        <p class="hint">월별 평균 단가(kg당) · 매입 kg — 중간값 ${fmtWon(median)} 기준, 초록 15% 이상 쌈 · 빨강 15% 이상 비쌈</p>
        <div class="tkLogWrap"><table class="tkLog biMon"><thead><tr><th>월</th>${years.map((y) => `<th class="r">${y}</th>`).join('')}</tr></thead><tbody>
        ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<tr><td><b>${m}월</b></td>${years.map((y) => cell(y, m)).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="hint">주간 단가 흐름 (최근 2년) — 최고 ${fmtWon(wmx)}/kg</p><div class="spark sales bi">${wp.map((x) => `<span class="sb${x.p == null ? ' none' : ''}" title="${x.k} 주 · ${x.p != null ? fmtWon(x.p) + '/kg' : '매입 없음'}"><i style="height:${x.p != null ? Math.max(2, x.p / wmx * 100) : 0}%"></i></span>`).join('')}</div>
        <p class="hint">품목별</p><div class="tkLogWrap"><table class="tkLog"><thead><tr><th>품목</th><th class="r">총 kg</th><th class="r">평균 단가</th><th class="r">최근 단가</th><th>최근 매입일</th></tr></thead><tbody>
        ${Object.entries(byName).sort((a, b) => b[1].kg - a[1].kg).map(([n, o]) => `<tr><td><b>${esc(n)}</b></td><td class="r">${fmtKg(o.kg)}</td><td class="r">${fmtWon(Math.round(o.amt / o.kg))}</td><td class="r">${fmtWon(o.lastP)}</td><td class="mut">${o.last}</td></tr>`).join('')}</tbody></table></div></details>`;
    }
    if (nexts[1]) h += `<details class="notice bi-more"><summary><b>${esc(nexts[1].name)} (${nexts[1].date}) 계획도 보기</b></summary>${planTable(nexts[1])}</details>`;
    h += `<details class="notice bi-more"><summary><b>수요 일정 관리</b></summary><p class="hint">설·추석·가정의달·연말은 기본. 지역 축제·단체 예약 같은 우리 가게 일정을 더할 수 있습니다.</p>
      <div class="loads">${buyEvents().filter((e) => e.date >= shift(today, -400)).map((e) => `<div class="lrow"><span class="ln">${esc(e.name)}</span><span class="lv" style="margin-left:auto">${e.date}${e.date >= today ? ` <small>D-${diffDays(today, e.date)}</small>` : ' <small>지남</small>'}${e.custom ? ` <button class="btn sm ghost danger" data-act="buyEvDel" data-d="${e.date}" data-n="${esc(e.name)}">삭제</button>` : ''}</span></div>`).join('')}</div>
      <div class="rowbtns"><button class="btn" data-act="buyEvAdd">+ 일정 추가</button>${hasSample() ? '' : '<button class="btn ghost" data-act="sampleLoad">샘플 자료로 보기</button>'}</div></details>`;
    h += `<p class="hint">판단은 예측이 아니라 과거 2년 평균 패턴입니다. 시세와 수조 상태를 보고 결정하세요. 계산 방식 — 단가는 매입 금액 ÷ kg 의 가중 평균. 일정 패턴은 각 일정 앞 8주를 주 단위로 묶어 여러 해를 평균. 권장 매입 시기는 보관 가능 일수 안의 주 중 가장 싼 주(3% 안이면 더 늦은 주). 필요량은 지난 같은 일정 주간(설·추석은 당일 앞 4일~뒤 2일, 그 외는 앞 6일~당일)의 판매 kg — kg을 안 적은 날은 그날 매출 × 만원당 평균 kg(이 매장에서 kg과 매출을 둘 다 적은 날 기준)으로 추정하고, 판매 기록이 아예 없으면 그 일정 전 1주 매입 kg으로 대신합니다. 권장 kg은 수조 최대 kg에서 수조 관리표 재고를 뺀 자리 안에서 필요량을 나눈 값. 매입 기록이 없는 매장은 다른 매장 매입 단가를 시세 참고로 씁니다.</p>`;
    return h;
  }
  function buyEvForm() {
    modal('수요 일정 추가', `<label>이름<input id="beN" placeholder="예: 안산 거리극 축제, 단체 예약"></label><label>날짜<input type="date" id="beD" value="${dateKey()}"></label>`, () => {
      const n = $('#beN').value.trim(), d = $('#beD').value; if (!n || !d) { alert('이름과 날짜를 넣어 주세요.'); return false; }
      S.settings.buyEvents = (S.settings.buyEvents || []).concat({ name: n, date: d }); save(); render();
    }, '추가');
  }

  /* 원가 관리 — 매입 CSV 가져오기 (거래처 원장 변환본 data/standard/purchases.csv 형식) */
  const PCSV_MAP = { '날짜': 'date', '매장': 'store', '품목': 'name', '품종': 'cat', 'kg': 'qty', '수량': 'qty', '단가': 'price', '금액': 'amount', '공급가': 'amount', '거래처': 'vendor' };
  const guessCat = (name) => (/킹크랩|킹/.test(name) ? '킹크랩' : /대게/.test(name) ? '대게' : /랍스터|랍스타/.test(name) ? '랍스터' : '수산물');
  function purchaseCsvImport() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const { head, rows } = parseCSV(rd.result);
        const hk = head.map((x) => x.replace(/\s+/g, ''));
        const need = ['날짜', '품목', '금액'].filter((c) => !hk.includes(c) && !(c === '금액' && hk.includes('공급가')));
        if (need.length) { alert(`${need.join(', ')} 열이 없어요.\n\n필요한 열: 날짜, 품목, 금액(또는 공급가)\n있으면 같이: 품종 · kg(수량) · 단가 · 거래처`); return; }
        const idx = {}; hk.forEach((c, i) => { if (PCSV_MAP[c] && idx[PCSV_MAP[c]] == null) idx[PCSV_MAP[c]] = i; });
        const recs = []; let skipped = 0, dup = 0;
        const existing = new Set((S.purchases || []).map((p) => `${p.date}|${p.name}|${p.qty}|${p.amount}`));
        rows.forEach((r) => {
          const d = (r[idx.date] || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { skipped++; return; }
          const name = (r[idx.name] || '').trim(), amount = Number(r[idx.amount]); if (!name || !(amount > 0)) { skipped++; return; }
          const qty = idx.qty != null && r[idx.qty] !== '' ? Number(r[idx.qty]) : null;
          let cat = idx.cat != null ? (r[idx.cat] || '').trim() : ''; if (!PURCHASE_CATS.includes(cat)) cat = guessCat(name); if (!PURCHASE_CATS.includes(cat)) cat = '기타';
          const key = `${d}|${name}|${qty}|${amount}`; if (existing.has(key)) { dup++; return; }
          existing.add(key);
          recs.push({ id: newId('p'), date: d, cat, name, qty: qty != null && !isNaN(qty) ? qty : null, unit: 'kg', amount, vendor: idx.vendor != null ? (r[idx.vendor] || '').trim() : '', memo: '', by: 'CSV', createdAt: Date.now(), src: 'csv' });
        });
        if (!recs.length) { alert(`새로 들어갈 줄이 없습니다. (이미 있는 줄 ${dup} · 건너뜀 ${skipped})`); return; }
        const kg = recs.reduce((a, x) => a + (x.qty || 0), 0), amt = recs.reduce((a, x) => a + x.amount, 0);
        modal('매입 CSV 가져오기', `<p><b>${recs.length}건</b>을 <b>${esc(storeName())}</b> 원가 관리에 가져옵니다.</p>
          <ul class="hintlist"><li>기간 ${recs[0].date} ~ ${recs[recs.length - 1].date}</li><li>합계 ${fmtKg(kg)} · ${fmtWon(amt)}</li>
          ${dup ? `<li>이미 있는 ${dup}건은 건너뜁니다</li>` : ''}${skipped ? `<li>날짜·금액이 없는 ${skipped}줄은 건너뜁니다</li>` : ''}</ul>`, () => {
          S.purchases = (S.purchases || []).concat(recs); save(); render(); alert(`${recs.length}건을 가져왔습니다. 운영 › 갑각류 매입 인사이트에서 단가 흐름을 보세요.`);
        }, '가져오기');
      };
      rd.readAsText(f, 'utf-8');
    };
    inp.click();
  }

  /* ── 서비스 교육 › 교육 자료 ─────────────────────────────
     S.training[{id, cat, title, url, memo, by, createdAt, pin}] — 사장님이 유튜브·교육 사이트 주소를 넣고, 직원이 카드에서 바로 연다 */
  const TRAIN_CATS = ['서비스', '위생', '관계·소통', '조리', '안전', '기타'];
  let trainCat = 'all';
  /* 추천 영상 — 2026-09-18 확인한 공식·전문 채널 영상. 처음 열 때 넣고, "추천 영상 넣기"로 다시 넣을 수 있다 */
  const TRAIN_SEED = [
    { cat: '위생', title: '조리종사자 식중독 예방 교육 (식약처)', url: 'https://www.youtube.com/watch?v=Xq7kBre2YpQ', memo: '주방·홀 모두 필수. 식중독 이해와 조리종사자 위생관리 요령', pin: true },
    { cat: '위생', title: '손씻기 6단계 수칙 (질병관리청)', url: 'https://www.youtube.com/watch?v=wd6XR9Q1IM8', memo: '출근 직후 · 화장실 후 · 생물 만진 뒤 30초', pin: true },
    { cat: '위생', title: '식품 위생 관리 방안과 사례 (식약처)', url: 'https://www.youtube.com/watch?v=ELIrOXSHS-Q', memo: '제조·가공업소 대상 영상이지만 교차오염·보관 원칙은 같음' },
    { cat: '위생', title: 'HACCP 교육 동영상 — 음식점편 (식약처 홈페이지)', url: 'https://www.mfds.go.kr/brd/m_232/view.do?seq=517', memo: '손씻기 · 위생복장 · 교차오염 예방 세 가지' },
    { cat: '위생', title: '기존 영업자 온라인 위생교육 수강 방법 (한국외식업중앙회)', url: 'https://www.youtube.com/watch?v=O5uMAWiJJHk', memo: '사장님용 · 매년 받는 위생교육(3시간) 온라인 수강 절차' },
    { cat: '위생', title: '신규 영업자 집합 위생교육 수강 방법 (한국외식업중앙회)', url: 'https://www.youtube.com/watch?v=HWJG_KbzwTE', memo: '새 매장 열 때' },
    { cat: '서비스', title: '고객 응대 시 직원의 금기행동 5가지 (박강사TV)', url: 'https://www.youtube.com/watch?v=SYIaY9kL_Do', memo: '홀 신입 첫 주 필독', pin: true },
    { cat: '서비스', title: '클레임 대응 STAR 기법 — 불만 처리 절차와 응대 멘트 (박강사TV)', url: 'https://www.youtube.com/watch?v=IhyDt3K1B-w', memo: '컴플레인 났을 때 순서대로' },
    { cat: '서비스', title: '컴플레인과 클레임의 차이, 사례로 보는 응대 기법 (박강사TV)', url: 'https://www.youtube.com/watch?v=nBTmGw4p2eE', memo: '' },
    { cat: '서비스', title: '세대별 고객 소통 — MZ 고객 응대 기법 (박강사TV)', url: 'https://www.youtube.com/watch?v=eliBweBCONs', memo: '' },
    { cat: '서비스', title: '악성 고객 대응과 감정노동 직원 보호 교육 (박강사TV)', url: 'https://www.youtube.com/watch?v=Rpx3Ing7AvQ', memo: '무리한 요구·폭언 손님을 만났을 때. 혼자 버티지 말고 책임자에게 넘기기' },
    /* 관계·소통 — 함께 일하는 사람과의 관계 (2026-09-21 추가) */
    { cat: '관계·소통', title: '직장 내 괴롭힘 예방 교육 (고용노동부)', url: 'https://www.youtube.com/watch?v=YFnojqczG6E', memo: '무엇이 괴롭힘인지, 왜 금지하는지. 전 직원 필독 — 우리 룰 "상호 존중과 바른 언어"의 근거', pin: true },
    { cat: '관계·소통', title: '직장 내 성희롱 예방 교육 — 사업장 교육용 (고용노동부)', url: 'https://www.youtube.com/watch?v=qT3C4G9HCDE', memo: '법으로 매년 1회 해야 하는 교육(약 51분). 본 날짜를 적어 두세요', pin: true },
    { cat: '관계·소통', title: '말 그릇을 키우는 비법 — 김윤나 (세바시)', url: 'https://www.youtube.com/watch?v=IQJzVFUbGU4', memo: '15분. 같은 말도 상대가 받아들이게 하는 법' },
    { cat: '관계·소통', title: '나의 마음을 어떻게 말할 것인가 — 김윤나 (세바시 대학)', url: 'https://www.youtube.com/watch?v=WdxVQcQ9DOI', memo: '서운함·화를 상처 주지 않고 말하기' },
    { cat: '관계·소통', title: '행복이 꽃피는 대화법 모아보기 — 김창옥 · 정혜신 외 (세바시)', url: 'https://www.youtube.com/watch?v=E57fs5f7mB4', memo: '긴 영상. 쉬는 시간에 나눠 보기' },
    { cat: '관계·소통', title: '직장 동료 때문에 힘들다면 (박상미라디오 · 1분)', url: 'https://www.youtube.com/shorts/KKTiUJW7F4w', memo: '짧게 보는 영상' },
    { cat: '관계·소통', title: '직장 내 괴롭힘 예방·조치 교육자료 — 사용자용·근로자용 (고용노동부 자료실)', url: 'https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20240102075', memo: '인쇄해서 게시할 수 있는 PPT/PDF' },
    { cat: '안전', title: '안전보건공단 공식 채널 — "음식업" "주방"으로 검색', url: 'https://www.youtube.com/@koshamovie', memo: '화상 · 베임 · 미끄러짐 예방 영상 모음' },
  ];
  function seedTraining(onlyNew) {
    const list = (S.training = S.training || []), seen = (S.trainSeen = S.trainSeen || []);
    let n = 0;
    TRAIN_SEED.forEach((t) => { if (list.some((x) => x.url === t.url)) { if (!seen.includes(t.url)) seen.push(t.url); return; }
      if (onlyNew && seen.includes(t.url)) return;
      seen.push(t.url); list.push({ id: newId('tr'), cat: t.cat, title: t.title, url: t.url, memo: t.memo || '', pin: !!t.pin, by: '추천', createdAt: Date.now() + n, seed: true }); n++; });
    return n;
  }
  const trainList = () => { if (!Array.isArray(S.training)) S.training = []; if ((S.trainSeen || []).length < TRAIN_SEED.length && seedTraining(true)) save(); return S.training; };
  function ytId(url) {
    try { const u = new URL(url); if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0]; if (/youtube\.com$/.test(u.hostname) || /youtube-nocookie\.com$/.test(u.hostname)) { if (u.searchParams.get('v')) return u.searchParams.get('v'); const m = u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/); if (m) return m[2]; } } catch (e) { /* 주소 아님 */ }
    return null;
  }
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  function vTraining() {
    let list = trainList().slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));
    if (trainCat !== 'all') list = list.filter((x) => x.cat === trainCat);
    let h = `<div class="hd"><div><h2>교육 자료</h2><div class="sub">서비스 · 위생 · 관계·소통 · 조리 · 안전 교육 영상이나 문서 주소를 넣어 두면 직원이 여기서 바로 봅니다. 유튜브는 앱 안에서 재생됩니다.</div></div>
      <div class="mnav"><button class="btn" data-act="trainSeed">추천 영상 넣기</button><button class="btn primary" data-act="trainAdd">+ 자료 추가</button></div></div>`;
    h += `<div class="filters">${['all', ...TRAIN_CATS].map((c) => `<button class="fl${trainCat === c ? ' on' : ''}" data-act="trainCat" data-c="${c}">${c === 'all' ? '전체' : c}</button>`).join('')}</div>`;
    if (!list.length) {
      h += `<div class="notice"><b>아직 등록한 교육 자료가 없습니다.</b>
        <div class="hint">예: 손 씻기 · 교차오염 예방(위생), 룸 안내와 주문 받기(서비스), 대게 찜 시간(조리). 유튜브 주소를 붙여 넣으면 화면에서 바로 재생됩니다.</div>
        <div class="hint">참고할 만한 곳 — 식품안전나라(foodsafetykorea.go.kr) 위생교육 자료, 한국외식업중앙회(foodservice.or.kr) 위생교육, 유튜브의 접객 서비스 교육 영상.</div></div>`;
    } else {
      h += `<div class="trainGrid">${list.map((x) => { const id = ytId(x.url); return `<div class="trCard${x.pin ? ' pin' : ''}">
        <div class="rcTop"><span class="chip cat">${esc(x.cat)}</span>${x.pin ? '<span class="chip crit">필독</span>' : ''}<span class="rcMeta" style="margin-left:auto">${esc(hostOf(x.url))}</span></div>
        <div class="rcName">${esc(x.title)}</div>
        ${x.memo ? `<div class="nbody">${esc(x.memo)}</div>` : ''}
        ${id ? `<div class="ytBox"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="${esc(x.title)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : ''}
        <div class="rowbtns"><a class="btn sm primary" href="${esc(x.url)}" target="_blank" rel="noopener">${id ? '유튜브에서 열기' : '열기'}</a>
          <button class="btn sm ghost" data-act="trainEdit" data-id="${x.id}">수정</button></div>
        <div class="rcMeta">${esc(x.by || '')}${x.createdAt ? ' · ' + new Date(x.createdAt).toLocaleDateString('ko-KR') : ''}</div></div>`; }).join('')}</div>`;
    }
    return h;
  }
  function trainForm(x) {
    const isNew = !x; x = x || { cat: TRAIN_CATS[0] };
    modal(isNew ? '교육 자료 추가' : '교육 자료 수정', `
      <div class="mlabel">분류</div>
      <div class="roles wrap" id="trCats">${TRAIN_CATS.map((c) => `<button type="button" class="rl${c === x.cat ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
      <label>제목<input id="trT" value="${esc(x.title || '')}" placeholder="예: 손 씻기와 교차오염 예방"></label>
      <label>주소 (URL)<input id="trU" value="${esc(x.url || '')}" placeholder="https://www.youtube.com/watch?v=… 또는 문서 주소" inputmode="url" autocomplete="off"></label>
      <label>메모 <span class="opt">선택</span><textarea id="trM" rows="2" placeholder="직원에게 한 줄 (예: 신입 첫 주에 꼭 보기)">${esc(x.memo || '')}</textarea></label>
      <label class="chk"><input type="checkbox" id="trP"${x.pin ? ' checked' : ''}> 필독 — 목록 맨 위에 고정</label>
      ${isNew ? '' : `<div class="rowbtns"><button class="btn danger sm" data-act="trainDel" data-id="${x.id}">이 자료 삭제</button></div>`}
    `, () => {
      const title = $('#trT').value.trim(), url = $('#trU').value.trim();
      if (!title) { alert('제목을 넣어 주세요.'); return false; }
      if (!/^https?:\/\/\S+$/i.test(url)) { alert('주소는 https:// 로 시작하는 인터넷 주소여야 합니다.'); return false; }
      const catSel = document.querySelector('#trCats .rl.on'), cat = catSel ? catSel.dataset.cat : TRAIN_CATS[0];
      const rec = { id: x.id || newId('tr'), cat, title, url, memo: $('#trM').value.trim(), pin: $('#trP').checked, by: x.by || whoNow() || '', createdAt: x.createdAt || Date.now() };
      if (x.id) S.training = trainList().map((t) => (t.id === x.id ? rec : t)); else trainList().push(rec);
      save(); render();
    }, '저장');
    $('#trCats').addEventListener('click', (e) => { const b = e.target.closest('.rl'); if (!b) return; $('#trCats').querySelectorAll('.rl').forEach((el) => el.classList.remove('on')); b.classList.add('on'); });
  }

  /* ── 모달 ────────────────────────────────────────────────── */
  function modal(title, bodyHTML, onOk, okLabel = '확인') {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3><div class="mbody">${bodyHTML}</div>
      <div class="mfoot"><button class="btn ghost" data-act="mClose">취소</button>
      <button class="btn primary" data-act="mOk">${esc(okLabel)}</button></div></div>`;
    m.hidden = false;
    m._ok = onOk;
    const f = m.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m._ok = null; m.innerHTML = ''; }

  /* 오늘 근무표에 있는 사람만 먼저 보여준다 — 없으면 전체 */
  function whoNames(all) {
    const act = S.staff.filter((s) => s.active).map((s) => s.name);
    if (all) return act;
    const r = rosterOf(dateKey()) || [];
    const on = r.map((e) => (S.staff.find((x) => x.id === e.staffId) || {}).name || e.name).filter(Boolean);
    return on.length ? on : act;
  }
  function pickWho(all) {
    const names = whoNames(all), partial = !all && names.length < S.staff.filter((s) => s.active).length;
    modal('지금 누구세요?', `<div class="pick">${names.map((n) =>
      `<button class="btn big" data-pick="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      ${partial ? `<p class="hint">오늘 근무표에 있는 사람만 보입니다. <button type="button" class="btn sm" data-act="pickWhoAll">다른 사람</button></p>` : ''}`, null);
  }

  /* 완료자 선택 줄. instant=true 면 이름만 누르면 바로 완료된다(증빙 없는 항목).
     한 대의 PC를 여럿이 쓰므로, 누가 했는지를 체크 시점에 고를 수 있어야 기록이 정확해진다. */
  function whoRow(tid, instant) {
    const cur = S.ui.whoDate === dateKey() ? S.ui.who : null;
    return `<div class="mlabel">누가 했나요?</div>
      <div class="whosel" data-tid="${tid}" data-instant="${instant ? 1 : 0}">
        ${whoNames(false).map((n) =>
          `<button type="button" class="btn who${!instant && n === cur ? ' on' : ''}" data-whosel="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>`;
  }

  function completeTask(tid) {
    const t = tpl(tid), key = viewKey();
    /* 담당자는 '지금 앱을 쓰는 사람'이다. 보고 있는 날짜가 아니라 실제 오늘에 묶는다.
       여기를 날짜에 묶으면 지난 날짜를 채워 넣을 때 이름 선택 창만 반복해서 뜬다. */
    const who = S.ui.whoDate === dateKey() ? S.ui.who : null;
    const ask = !!S.settings.askWho;
    if (!who && !ask) { pickWho(); return; }

    // 매번 묻기 + 증빙 없음 → 이름 한 번만 누르면 끝. 확인 버튼을 거치지 않는다.
    if (ask && !t.ev && !t.note) {
      modal(t.title, (t.memo ? `<p class="mmemo">${esc(t.memo)}</p>` : '') + whoRow(tid, true), null);
      return;
    }
    if (!ask && !t.ev && !t.note) { doComplete(tid, {}); return; }

    let b = '';
    if (t.memo) b += `<p class="mmemo">${esc(t.memo)}</p>`;
    if (ask) b += whoRow(tid, false);
    if (t.ev === 'number') b += `<label>${esc(t.evLabel || '숫자')}<input type="number" id="evNum" min="0" step="1" value="0" inputmode="numeric"></label>`;
    if (t.ev === 'deaths') b += `<div class="mlabel">폐사 마릿수 — 없으면 0 그대로 두세요</div>
      <div class="sprow">${SPECIES.map((sp, i) =>
        `<label class="sp">${esc(sp)}<input type="number" class="spNum" data-sp="${esc(sp)}" min="0" step="1" value="0" inputmode="numeric"></label>`).join('')}</div>`;
    if (t.ev === 'money') b += `<div class="mlabel">오늘 매출 — 포스 마감 화면을 보고 적으세요 (회계 › 매출 입력에 그대로 쌓입니다)</div>` + salesFields(salesOf(key));
    if (t.ev === 'kakao') b += `<label class="chk"><input type="checkbox" id="evKakao"> 카톡방에 사진을 보냈습니다</label>
      <p class="hint">사진은 앱이 아니라 카톡방에 남습니다. 이상이 있던 날은 아래에 한 줄 적어두면 나중에 앱에서 바로 찾을 수 있습니다.</p>`;
    if (t.note || t.ev === 'kakao') b += `<label>메모 <span class="opt">선택</span><textarea id="evNote" rows="2" placeholder="이상 있을 때만 적으세요"></textarea></label>`;

    modal(t.title, b, () => {
      const out = {};
      if (ask) {
        const sel = document.querySelector('.whosel .who.on');
        if (!sel) { alert('누가 했는지 골라 주세요.'); return false; }
        out.by = sel.dataset.whosel;
      }
      if (t.ev === 'money') {
        const vals = readSalesFields(); if (!vals) return false;
        saveSales(key, vals, 'task'); if (out.by) S.sales[key].by = out.by;
        out.ev = salesTotal(vals);
      }
      const num = $('#evNum'); if (num) out.ev = num.value === '' ? 0 : Number(num.value);
      const sps = document.querySelectorAll('.spNum');
      if (sps.length) {
        const ev = {};
        sps.forEach((el) => { ev[el.dataset.sp] = el.value === '' ? 0 : Math.max(0, Number(el.value) || 0); });
        out.ev = ev;
      }
      const kk = $('#evKakao');
      if (kk && !kk.checked) { alert('카톡방에 사진을 보냈는지 확인해 주세요.'); return false; }
      const nt = $('#evNote'); if (nt && nt.value.trim()) out.note = nt.value.trim();
      doComplete(tid, out);
    }, '완료');
  }

  function doComplete(tid, extra) {
    const key = viewKey(), rec = S.days[key].inst[tid];
    const d = new Date();
    Object.assign(rec, { s: 'done', by: S.ui.who, at: `${pad(d.getHours())}:${pad(d.getMinutes())}` }, extra);
    save(); render();
    instantAlert(tid, key, rec);
  }

  /* 사장님 폰 즉시 알림 — 중요 업무가 완료되면 한 줄. 설정에서 끌 수 있다. 오늘 기록만 보낸다 */
  function instantAlert(tid, key, rec) {
    const t = tpl(tid);
    if (!t || !t.crit || key !== dateKey() || S.settings.tgInstant === false) return;
    if (!(S.settings.tgToken || '').trim() || !(S.settings.tgChat || '').trim()) return;
    let ev = '';
    if (t.ev === 'deaths' && rec.ev && typeof rec.ev === 'object') {
      const parts = SPECIES.filter((sp) => Number(rec.ev[sp])).map((sp) => `${sp} ${rec.ev[sp]}`);
      ev = parts.length ? ' · 폐사 ' + parts.join(' · ') : ' · 폐사 없음';
    } else if (t.ev === 'money' && rec.ev != null) ev = ` · 매출 ${Number(rec.ev).toLocaleString('ko-KR')}원`;
    else if (t.ev === 'number' && rec.ev != null) ev = ` · ${t.evLabel || '수치'} ${rec.ev}`;
    sendTelegram(`[${storeName()}] ✅ ${t.title} — ${rec.by || '이름 없음'} ${rec.at || ''}${ev}`, 'done').catch(() => {});
  }

  function taskMenu(tid) {
    const key = viewKey(), rec = S.days[key].inst[tid], t = tpl(tid);
    modal(t.title, `<div class="pick">
      ${rec.s === 'done' ? `<div class="mlabel">완료자 바꾸기</div>
        <div class="roles big">${S.staff.filter((x) => x.active).map((x) =>
          `<button class="rl${rec.by === x.name ? ' on' : ''}" data-menu="by:${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      ${rec.s !== 'todo' ? `<button class="btn big" data-menu="undo">되돌리기 (미완료로)</button>` : ''}
      ${rec.s === 'todo' ? `<button class="btn big" data-menu="skip">오늘만 건너뛰기</button>` : ''}
      <div class="mlabel">오늘만 담당 바꾸기</div>
      <div class="roles big">${ROLE_OPTS.map((x) => `<button class="rl${roleOf(key, tid) === x ? ' on' : ''}" data-menu="role:${x}">${x}</button>`).join('')}</div>
      <button class="btn big" data-menu="memo">✏️ 메모 고치기 (매일 적용)</button>
    </div>`, null);
    $('#modal').dataset.tid = tid;
  }

  /* 메모 수정 — 루틴 자체를 고치므로 내일부터도 그대로 보인다.
     두 매장이 같은 루틴을 쓰므로 기본으로 다른 매장에도 같이 넣는다. */
  function editMemo(tid) {
    const t = tpl(tid);
    const other = (Store.meta.stores || []).find((x) => x.id !== Store.meta.current);
    modal(t.title, `
      <label>안내 메모<textarea id="eMemo" rows="4" placeholder="비우면 메모가 사라집니다">${esc(t.memo || '')}</textarea></label>
      ${other ? `<label class="chk"><input type="checkbox" id="eBoth" checked> ${esc(other.name)}에도 같은 메모를 넣습니다</label>` : ''}
    `, () => {
      const memo = $('#eMemo').value.trim() || undefined;
      t.memo = memo; t.edited = { ...(t.edited || {}), memo: true };
      save(); render();
      const both = $('#eBoth');
      if (other && both && both.checked) {
        Store.loadStore(other.id).then((doc) => {
          if (!doc || !doc.templates) return;
          const ot = doc.templates.find((x) => x.id === tid);
          if (!ot) return;
          ot.memo = memo; ot.edited = { ...(ot.edited || {}), memo: true };
          return Store.saveStore(other.id, doc);
        });
      }
    }, '저장');
    setTimeout(() => { const el = $('#eMemo'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 50);
  }

  /* ── 이벤트 ──────────────────────────────────────────────── */
  function bind() {
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-act="tankCycle"]'); if (!el) return;
      const v = Math.max(1, Number(el.value) || 1), T = tanksOf();
      T.cycle[el.dataset.k][el.dataset.f] = v;
      if (T.cycle[el.dataset.k].late < T.cycle[el.dataset.k].every) T.cycle[el.dataset.k].late = T.cycle[el.dataset.k].every;
      save(); render();
    });
    document.addEventListener('click', (e) => {
      const m = $('#modal');

      const pick = e.target.closest('[data-pick]');
      if (pick) { S.ui.who = pick.dataset.pick; S.ui.whoDate = dateKey(); save(); closeModal(); render(); return; }

      const nc = e.target.closest('[data-newc]');
      if (nc) { const st = staffById(nc.dataset.newc); if (!st) return; const rec = newContract(st); cOpen = rec.id; cMode = 'edit'; save(); closeModal(); render(); window.scrollTo(0, 0); return; }

      const tg = e.target.closest('[data-tgchat]');
      if (tg) { S.settings.tgChat = tg.dataset.tgchat; save(); closeModal(); render(); return; }

      const ws = e.target.closest('[data-whosel]');
      if (ws) {
        const box = ws.closest('.whosel');
        box.querySelectorAll('[data-whosel]').forEach((x) => x.classList.remove('on'));
        ws.classList.add('on');
        if (box.dataset.instant === '1') { doComplete(box.dataset.tid, { by: ws.dataset.whosel }); closeModal(); }
        return;
      }

      const mm = e.target.closest('[data-menu]');
      if (mm) {
        const tid = m.dataset.tid, key = viewKey(), rec = S.days[key].inst[tid], v = mm.dataset.menu;
        if (v === 'undo') { S.days[key].inst[tid] = { s: 'todo', role: rec.role }; }
        else if (v === 'skip') {
          const why = prompt('건너뛰는 이유를 적어주세요.\n(예: 재료 미입고)');
          if (why === null) return;
          Object.assign(rec, { s: 'skip', reason: why.trim() || '사유 없음', by: S.ui.who });
        } else if (v === 'memo') { closeModal(); editMemo(tid); return; }
        else if (v.startsWith('role:')) { rec.role = v.slice(5); }
        else if (v.startsWith('by:')) { rec.by = v.slice(3); }
        save(); closeModal(); render(); return;
      }

      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target === m) closeModal(); return; }
      const a = b.dataset.act, id = b.dataset.id;
      const key = view === 'month' ? mdateKey() : viewKey();   // 편성 동작은 근무표에서 선택한 날짜 기준

      switch (a) {
        case 'view': view = b.dataset.v; if (view !== 'contracts') { cOpen = null; cMode = null; } render(); window.scrollTo(0, 0); break;
        case 'navGroup': {   // PC 사이드바: 접기/펼치기만 (화면 이동 없음)
          toggleGroup(b.dataset.g);
          const sub = b.nextElementSibling;
          if (sub && sub.classList.contains('ssub')) { sub.hidden = !navOpen.has(b.dataset.g); b.classList.toggle('open', !sub.hidden); b.setAttribute('aria-expanded', String(!sub.hidden)); }
          else render();
          break;
        }
        case 'navGroupM': {  // 모바일 상단: 대카테고리를 누르면 첫 하위 화면으로 이동 → 2줄에 하위 메뉴가 뜬다
          const m = MENU.find((x) => x.id === b.dataset.g);
          if (m) { view = m.items[0][0]; render(); window.scrollTo(0, 0); }
          break;
        }
        case 'dateGo': {
          const n = shift(key, Number(b.dataset.d));
          if (n < minKey() || n > maxKey()) return;
          S.ui.date = n; save(); render(); break;
        }
        case 'dateToday': S.ui.date = dateKey(); S.ui.slot = null; save(); render(); break;
        case 'monthNav': S.ui.month = monthShiftKey(monthKey(), Number(b.dataset.d)); save(); render(); break;
        case 'monthToday': S.ui.month = dateKey().slice(0, 7); S.ui.mdate = dateKey(); save(); render(); break;
        case 'mpick': S.ui.mdate = b.dataset.k; save(); render(); break;
        case 'storeSwitch': switchStore(b.dataset.id); break;
        case 'cmonthNav': S.ui.cmonth = monthShiftKey(S.ui.cmonth || dateKey().slice(0, 7), Number(b.dataset.d)); save(); render(); break;
        case 'nmonthNav': S.ui.nmonth = monthShiftKey(S.ui.nmonth || dateKey().slice(0, 7), Number(b.dataset.d)); save(); render(); break;
        case 'purchaseAdd': purchaseForm(null); break;
        case 'purchaseCsv': purchaseCsvImport(); break;
        case 'biSp': S.ui.biSp = b.dataset.sp; save(); render(); break;
        case 'buyEvAdd': buyEvForm(); break;
        case 'biEv': S.ui.biEv = b.dataset.d; save(); render(); break;
        case 'healthAdd': healthList().push({ id: newId('h'), name: '', issued: '', memo: '' }); save(); render(); setTimeout(() => { const el = document.querySelector('input[data-act="healthName"][value=""]'); if (el) el.focus(); }, 50); break;
        case 'healthDel': { const e = healthList().find((x) => x.id === id); if (!e) return; if (e.name && !confirm(`${e.name} 보건증 기록을 지울까요?`)) return; S.health = healthList().filter((x) => x.id !== id); save(); render(); break; }
        case 'sampleLoad': loadSampleData(); break;
        case 'sampleClear': if (!confirm('샘플 자료를 지울까요? 직접 넣은 기록은 그대로 남습니다.')) return; clearSampleData(); break;
        case 'buyEvDel': S.settings.buyEvents = (S.settings.buyEvents || []).filter((e) => !(e.date === b.dataset.d && e.name === b.dataset.n)); save(); render(); break;
        case 'purchaseEdit': purchaseForm((S.purchases || []).find((x) => x.id === id)); break;
        case 'purchaseDel': {
          if (!confirm('이 매입 내역을 삭제할까요?')) return;
          S.purchases = S.purchases.filter((x) => x.id !== id); save(); closeModal(); render(); break;
        }
        case 'smonthNav': S.ui.smonth = monthShiftKey(S.ui.smonth || curMonth(), Number(b.dataset.d)); save(); render(); break;
        case 'pmonthNav': S.ui.pmonth = monthShiftKey(S.ui.pmonth || curMonth(), Number(b.dataset.d)); save(); render(); break;
        case 'lmonthNav': S.ui.lmonth = monthShiftKey(S.ui.lmonth || curMonth(), Number(b.dataset.d)); save(); render(); break;
        case 'salesAdd': salesForm(null); break;
        case 'salesEdit': salesForm(b.dataset.k); break;
        case 'salesDel': {
          if (!confirm('이 날 매출을 삭제할까요?')) return;
          delete S.sales[b.dataset.k];
          // 마감 루틴 완료 기록에 남은 금액도 비운다 — 안 그러면 손익이 지운 매출을 계속 센다
          { const mt = S.templates.find((t) => t.ev === 'money'); const d = S.days[b.dataset.k]; const r = mt && d && d.inst && d.inst[mt.id]; if (r && r.ev != null) r.ev = null; }
          save(); closeModal(); render(); break;
        }
        case 'salesCsv': salesCsvImport(); break;
        case 'sper': S.ui.sper = b.dataset.p; save(); render(); break;
        case 'fixedAdd': fixedForm(null); break;
        case 'fixedEdit': fixedForm(fixedList().find((f) => f.id === id)); break;
        case 'fixedDel': {
          if (!confirm('이 고정비를 삭제할까요?')) return;
          S.settings.fixedCosts = fixedList().filter((f) => f.id !== id); save(); closeModal(); render(); break;
        }
        case 'weeklyPay': S.settings.weeklyPay = S.settings.weeklyPay === false; save(); render(); break;
        case 'laborConfirm': laborConfirm(); break;
        case 'slipView': { const m2 = S.ui.lmonth || curMonth(), r = slipRow(m2, b.dataset.n); if (!r) return;
          modal(`${monthLabel(m2)} 임금명세서 — ${r.name}`, `<div class="slipWrap">${slipPaper(m2, r)}</div><div class="rowbtns"><button class="btn" data-act="slipPrint" data-n="${esc(r.name)}">인쇄 · PDF 저장</button></div>`, null, '닫기'); break; }
        case 'slipPrint': { const m2 = S.ui.lmonth || curMonth(), r = slipRow(m2, b.dataset.n); if (!r) return; closeModal(); printHtml(slipPaper(m2, r)); slipMark(m2, r.name, '인쇄 · PDF'); break; }
        case 'slipPrintAll': { const m2 = S.ui.lmonth || curMonth(), p = payrollOf(m2); if (!p) return; printHtml(p.rows.filter((r) => r.payType).map((r) => slipPaper(m2, r)).join('<div class="pageBreak"></div>')); break; }
        case 'slipMail': { const m2 = S.ui.lmonth || curMonth(), r = slipRow(m2, b.dataset.n); if (!r) return;
          const s2 = slipOf(m2, r), [y2, mo2] = m2.split('-').map(Number);
          const subject = `[${bizOf().name}] ${y2}년 ${mo2}월 임금명세서 — ${r.name}`;
          location.href = `mailto:${encodeURIComponent(s2.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(slipText(m2, r))}`;
          slipMark(m2, r.name, '메일 앱 열림'); break; }
        case 'slipSent': { slipMark(S.ui.lmonth || curMonth(), b.dataset.n, '발송 완료'); break; }
        case 'laborUnconfirm': {
          const m2 = S.ui.lmonth || curMonth();
          if (!confirm(`${monthLabel(m2)} 급여 확정을 풀까요? 다시 예상 값으로 돌아갑니다.`)) return;
          delete S.payroll[m2]; save(); render(); break;
        }
        case 'noticeAdd': noticeForm(null); break;
        case 'noticeOpen': noticeShow(id); break;
        case 'noticeEdit': closeModal(); noticeForm((S.notices || []).find((x) => x.id === id)); break;
        case 'noticeDel': {
          if (!confirm('이 공지를 삭제할까요?')) return;
          S.notices = S.notices.filter((x) => x.id !== id); save(); closeModal(); render(); break;
        }
        case 'noticeSend': {
          const n = (S.notices || []).find((x) => x.id === id); if (!n) return;
          b.disabled = true;
          sendTelegram(`\u{1F4E2} [${storeName()} 공지] ${n.title}${n.body ? '\n' + n.body : ''}`).then((r) => {
            b.disabled = false;
            alert(r.ok ? '보냈습니다.' : '실패: ' + r.err);
          });
          break;
        }
        case 'issueAdd': issueForm(null); break;
        case 'issueOpen': issueShow(id); break;
        case 'issueEdit': closeModal(); issueForm(issuesAll().find((x) => x.id === id)); break;
        case 'issueFilter': issueFilter = b.dataset.f; render(); break;
        case 'issueStoreF': issueStore = b.dataset.s; render(); break;
        case 'issueCatF': issueCat = b.dataset.c; render(); break;
        case 'issueDel': {
          if (!confirm('이 기록을 삭제할까요? 덧글도 함께 사라집니다. 두 매장 모두에서 사라집니다.')) return;
          SH.issues = issuesAll().filter((x) => x.id !== id); saveShared(); closeModal(); render(); break;
        }
        case 'issueReply': {
          const t = $('#isR').value.trim();
          if (!t) { alert('내용을 입력하세요.'); return; }
          const x = issuesAll().find((i2) => i2.id === id); if (!x) return;
          x.replies = x.replies || [];
          x.replies.push({ text: t, by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '', store: storeName(), at: Date.now() });
          x.updatedAt = Date.now(); saveShared(); closeModal(); render(); issueShow(id); break;
        }
        case 'issueDone': {
          const t = $('#isR').value.trim();
          const x = issuesAll().find((i2) => i2.id === id); if (!x) return;
          x.replies = x.replies || [];
          // 어떻게 개선했는지가 남아야 다음 사람에게 코칭이 된다
          if (t) x.replies.push({ text: t, by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '', at: Date.now(), fix: true });
          else if (!x.replies.some((r) => r.fix)) { alert('어떻게 해결했는지 덧글 칸에 한 줄 적고 완료해 주세요.\n그게 남아야 다음 사람이 배웁니다.'); return; }
          x.status = 'done'; x.updatedAt = Date.now(); saveShared(); closeModal(); render(); issueShow(id); break;
        }
        case 'issueReopen': {
          const x = issuesAll().find((i2) => i2.id === id); if (!x) return;
          x.status = 'open'; x.updatedAt = Date.now(); saveShared(); closeModal(); render(); issueShow(id); break;
        }
        case 'issueSend': {
          const x = issuesAll().find((i2) => i2.id === id); if (!x) return;
          b.disabled = true;
          const fix = (x.replies || []).filter((r) => r.fix).map((r) => '\n✅ ' + r.text).join('');
          sendTelegram(`\u{1F4DD} [${x.store || storeName()} 트러블] ${x.cat} — ${x.title}${x.body ? '\n' + x.body : ''}${fix}`).then((r) => {
            b.disabled = false;
            alert(r.ok ? '보냈습니다.' : '실패: ' + r.err);
          });
          break;
        }
        case 'trainAdd': trainForm(null); break;
        case 'trainSeed': { const n = seedTraining(); save(); render(); banner(n ? `추천 영상 ${n}개를 넣었습니다` : '추천 영상이 이미 다 들어 있습니다', '식약처 · 질병관리청 · 고용노동부 · 한국외식업중앙회 · 세바시 · 박강사TV'); break; }
        case 'trainEdit': closeModal(); trainForm(trainList().find((t) => t.id === id)); break;
        case 'trainCat': trainCat = b.dataset.c; render(); break;
        case 'trainDel': { if (!confirm('이 교육 자료를 삭제할까요?')) return; S.training = trainList().filter((t) => t.id !== id); save(); closeModal(); render(); break; }
        case 'recipeAdd': recipeForm(null); break;
        case 'recipeOpen': recipeShow(id); break;
        case 'recipeEdit': closeModal(); recipeForm((S.recipes || []).find((x) => x.id === id)); break;
        case 'recipeDel': {
          const r = (S.recipes || []).find((x) => x.id === id);
          if (!confirm(`'${r ? r.name : ''}' 레시피를 삭제할까요? 되돌릴 수 없습니다.`)) return;
          S.recipes = S.recipes.filter((x) => x.id !== id); save(); closeModal(); render(); break;
        }
        case 'recipeCat': recipeCat = b.dataset.c; render(); { const el = $('#rq'); if (el) { el.value = recipeQ; } } break;
        case 'jumpDate': S.ui.date = b.dataset.k; view = 'today'; save(); render(); window.scrollTo(0, 0); break;
        case 'filter': S.ui.filter = b.dataset.r; save(); render(); break;
        case 'crew': S.settings.crew = Number(b.dataset.n) === 3 ? 3 : 2; save(); render(); break;
        case 'slotPick': S.ui.slot = b.dataset.s; save(); render(); break;
        case 'cardOpen': {
          const k2 = 'card:' + id;
          openState[k2] = !openState[k2];
          render(); break;
        }
        case 'pickWho': pickWho(); break;
        case 'pickWhoAll': pickWho(true); break;
        case 'tankDate': tankDateModal(Number(b.dataset.n), b.dataset.kind); break;
        case 'tankStock': tankStockModal(Number(b.dataset.n), b.dataset.pos); break;
        case 'tankCareDel': {
          if (!confirm('이 기록 한 줄을 지웁니다. 위 표의 칸은 그대로 둡니다.')) break;
          const T = tanksOf(); T.care = T.care.filter((x) => x.id !== id); save(); render(); break;
        }
        case 'tankLogDel': {
          if (!confirm('이 입고 기록 한 줄을 지웁니다. 위 표의 칸은 그대로 둡니다.')) break;
          const T = tanksOf(); T.log = T.log.filter((x) => x.id !== id); save(); render(); break;
        }
        case 'tankCount': { const T = tanksOf(); T.count = Math.min(12, Math.max(1, T.count + Number(b.dataset.d))); tanksOf(); save(); render(); break; }
        case 'closeBar': $('#alarmBar').hidden = true; break;
        case 'mClose': closeModal(); break;
        case 'mOk': { const fn = m._ok; if (fn) { if (fn() === false) return; } closeModal(); break; }

        case 'toggle': {
          const rec = S.days[key].inst[id];
          if (rec.s === 'todo') completeTask(id);
          else { S.days[key].inst[id] = { s: 'todo', role: rec.role }; save(); render(); }
          break;
        }
        case 'menu': taskMenu(id); break;

        case 'addExtra': {
          modal('오늘만 할 일', `<label>내용<input id="exTitle" placeholder="예: 배달 파트너 미팅"></label>`, () => {
            const v = $('#exTitle').value.trim(); if (!v) return false;
            S.days[key].extras.push({ id: 'x' + Date.now(), title: v, s: 'todo' });
            save(); render();
          }, '추가');
          break;
        }
        case 'ckExtra': {
          const x = S.days[key].extras.find((y) => y.id === id);
          if (x.s === 'done') { x.s = 'todo'; delete x.by; delete x.at; }
          else { const d = new Date(); Object.assign(x, { s: 'done', by: S.ui.who || '', at: `${pad(d.getHours())}:${pad(d.getMinutes())}` }); }
          save(); render(); break;
        }
        case 'delExtra': S.days[key].extras = S.days[key].extras.filter((y) => y.id !== id); save(); render(); break;

        /* 근무표 */
        case 'schedTab': schedTab = b.dataset.t; render(); break;
        case 'seOpen': schedEdit(b.dataset.k, b.dataset.seg || null); break;
        case 'seTab': schedEdit(b.dataset.k, b.dataset.seg); break;
        case 'seAdd': seAddFrom(b.dataset.k, b.dataset.seg); break;
        case 'seFlag': {
          const date = b.dataset.k, name = b.dataset.n, f = b.dataset.f;
          [seKey].forEach((k) => {
            const x = segCell(date, k, false); const w = x.workers.find((v) => v.name === name); if (!w) return;
            if (f === 'leave') { x.leave = x.leave.includes(name) ? x.leave.filter((n) => n !== name) : x.leave.concat(name); }
            else w[f] = !w[f];
          });
          syncRoster(date);
          logSched(`${mdLabel(date)} ${name} ${{ leader: '구간 책임자', special: '휴무일 출근', leave: '휴가·부재' }[f]} 표시 변경`);
          save(); render(); schedEdit(date, seKey); break;
        }
        case 'seNote': {
          const date = b.dataset.k, name = b.dataset.n;
          const x = segCell(date, seKey, false); const w = x.workers.find((v) => v.name === name); if (!w) break;
          const v = prompt('시간 메모 (예: 10시출근, 14시퇴근). 비우면 지웁니다.', w.note || '');
          if (v === null) break;
          const all = confirm('오늘 모든 구간의 ' + name + ' 메모에 같이 적을까요?\n(취소 = 이 구간만)');
          (all ? segList().map((q) => q.key) : [seKey]).forEach((k) => { const c2 = segCell(date, k, false); const w2 = c2.workers.find((v2) => v2.name === name); if (w2) w2.note = v.trim(); });
          save(); render(); schedEdit(date, seKey); break;
        }
        case 'seRemove': {
          const date = b.dataset.k, name = b.dataset.n;
          const all = confirm(name + ' — 오늘 모든 구간에서 뺄까요?\n(취소 = 이 구간만)');
          (all ? segList().map((q) => q.key) : [seKey]).forEach((k) => { const x = segCell(date, k, false); x.workers = x.workers.filter((v) => v.name !== name); x.leave = x.leave.filter((n) => n !== name); });
          syncRoster(date); logSched(`${mdLabel(date)} ${name} 배치 제외${all ? ' (하루 전체)' : ''}`);
          save(); render(); schedEdit(date, seKey); break;
        }
        case 'seCopyPrev': {
          const date = b.dataset.k, prev = shift(date, -1);
          if (!dayHasAny(prev)) { alert('전날 배치가 없습니다.'); break; }
          if (dayHasAny(date) && !confirm('이 날의 배치를 전날 것으로 덮어씁니다. 계속할까요?')) break;
          const sc = schedOf(); const src = sc.days[prev];
          sc.days[date] = { segs: Object.fromEntries(Object.entries(src.segs || {}).map(([k, x]) => [k, { workers: (x.workers || []).map((w) => ({ ...w, special: isOffDay(S.staff.find((q) => q.name === w.name), date), note: '' })), leave: [] }])) };
          syncRoster(date); logSched(`${mdLabel(date)} 전날 배치 복사`); save(); render(); break;
        }
        case 'seClearDay': {
          const date = b.dataset.k;
          if (!confirm(mdLabel(date) + ' 배치를 전부 비울까요?')) break;
          delete schedOf().days[date]; syncRoster(date); logSched(`${mdLabel(date)} 배치 비움`); save(); render(); break;
        }
        case 'seRules': schedRulesModal(); break;
        case 'seMonth': schedMonthModal(); break;
        case 'sePattern': patternModal(); break;
        case 'seShift': shiftDayModal(b.dataset.k); break;
        case 'patFill': case 'patFillNext': {
          readPattern();
          const m = a === 'patFill' ? monthKey() : monthShiftKey(monthKey(), 1);
          const over = !!($('#patOver') && $('#patOver').checked);
          const n = fillMonthFromPattern(m, over);
          logSched(`${monthLabel(m)} 오전·오후 조 패턴으로 ${n}일 채움${over ? ' (덮어쓰기)' : ''}`);
          save(); closeModal(); render();
          banner(`${monthLabel(m)} ${n}일을 패턴으로 채웠습니다`, n ? '달력에서 날짜를 눌러 예외를 고치세요.' : '패턴에 이름이 없거나 이미 배치된 날뿐입니다.');
          break;
        }
        case 'sePrint': printSchedule(); break;
        case 'hdAdd': { schedOf().holidays.push({ date: monthKey() + '-01', name: '', type: '임시공휴일' }); closeModal(); schedRulesModal(); break; }
        case 'hdDel': { const hds = schedOf().holidays.slice().sort((p2, q) => p2.date.localeCompare(q.date)); const t = hds[Number(b.dataset.i)]; schedOf().holidays = schedOf().holidays.filter((x) => x !== t); closeModal(); schedRulesModal(); break; }
        case 'cmPreview': { const src = $('#cmSrc').value; cmPrev = { src, dst: monthKey(), ...copyMonthPreview(src, monthKey()) }; closeModal(); schedMonthModal(); break; }
        case 'cmApply': {
          if (!cmPrev || cmPrev.dst !== monthKey()) break;
          const sc = schedOf();
          monthDates(monthKey()).forEach((k) => { delete sc.days[k]; });
          Object.assign(sc.days, JSON.parse(JSON.stringify(cmPrev.days)));
          monthDates(monthKey()).forEach(syncRoster);
          logSched(`${monthLabel(monthKey())} 근무표를 ${monthLabel(cmPrev.src)} 패턴으로 만듦 (${cmPrev.copiedDays}일)`);
          cmPrev = null; save(); closeModal(); render(); break;
        }
        case 'cmAuto': {
          const m = monthKey(), todayK = dateKey(), act = S.staff.filter((x) => x.active);
          if (!act.length) { alert('재직 직원이 없습니다.'); break; }
          const targets = monthDates(m).filter((k) => k >= todayK && !dayHasAny(k));
          if (!targets.length) { alert('채울 빈 날이 없습니다. (오늘 이전 날짜는 건드리지 않습니다)'); break; }
          if (!confirm(`빈 날 ${targets.length}일에 재직 직원 ${act.length}명을 고정 휴무일을 피해 배치합니다. 계속할까요?`)) break;
          targets.forEach((k) => act.forEach((st) => { if (isOffDay(st, k)) return; addWorker(k, st.segs && st.segs.length ? st.segs : segList().map((x) => x.key), { name: st.name, staffId: st.id, type: st.type || 'regular', leader: false, special: false, note: '' }); }));
          logSched(`${monthLabel(m)} 빈 날 ${targets.length}일 자동 채우기`); save(); closeModal(); render(); break;
        }
        case 'cmClear': {
          const m = monthKey();
          if (!confirm(monthLabel(m) + ' 배치를 전부 비웁니다. 되돌릴 수 없습니다. 계속할까요?')) break;
          const sc = schedOf(); monthDates(m).forEach((k) => { delete sc.days[k]; syncRoster(k); });
          logSched(`${monthLabel(m)} 배치 전부 비움`); cmPrev = null; save(); closeModal(); render(); break;
        }
        case 'staffType': break;
        case 'staffOff': {
          const c = staffCtx(b.dataset.store); if (!c.doc) return;
          const st = c.doc.staff.find((x) => x.id === id), d = Number(b.dataset.d);
          st.offDays = (st.offDays || []).includes(d) ? st.offDays.filter((x) => x !== d) : (st.offDays || []).concat(d);
          staffCommit(c); break;
        }
        case 'staffSeg': {
          const c = staffCtx(b.dataset.store); if (!c.doc) return;
          const st = c.doc.staff.find((x) => x.id === id), k = b.dataset.k;
          st.segs = (st.segs || []).includes(k) ? st.segs.filter((x) => x !== k) : (st.segs || []).concat(k);
          staffCommit(c); break;
        }

        /* 루틴 */
        case 'critToggle': { const t = tpl(id); t.crit = !t.crit; if (t.crit && !t.due && /^\d/.test(t.time)) { t.due = t.time; t.grace = 30; } save(); render(); break; }
        case 'editTpl': editTpl(id); break;

        /* 설정 */
        case 'cAdd': {
          const act = S.staff.filter((x) => x.active);
          if (!act.length) { alert('직원 명단이 비어 있습니다. 직원 → 직원 명단에서 먼저 추가하세요.'); break; }
          const pre = cFilter !== 'all' && staffById(cFilter) ? cFilter : act[0].id;
          modal('새 계약서 — 누구의 계약서인가요?', `<div class="pick">${act.map((x) => `<button class="btn big${x.id === pre ? ' on' : ''}" data-newc="${x.id}">${esc(x.name)} <span class="opt">${(x.roles || []).join('·')}</span></button>`).join('')}</div>
            <p class="hint">직원이 아직 명단에 없으면 직원 → 직원 명단에서 먼저 추가하세요.</p>`, null);
          break;
        }
        case 'cOpen': cOpen = id; cMode = null; render(); window.scrollTo(0, 0); break;
        case 'cBack': cOpen = null; cMode = null; render(); window.scrollTo(0, 0); break;
        case 'cSaveBack': { save(); cMode = null; render(); window.scrollTo(0, 0); banner('저장했습니다', '계약서는 목록에서 다시 열 수 있습니다.'); break; }
        case 'cFilter': cFilter = b.dataset.s; render(); break;
        case 'cEdit': { const c = cById(id); if (c && !isSigned(c)) { cOpen = c.id; cMode = 'edit'; render(); window.scrollTo(0, 0); } break; }
        case 'cSign': { const c = cById(id); if (c) signModal(c, b.dataset.who); break; }
        case 'cStamp': { const c = cById(id); if (c) stampSeal(c); break; }
        case 'cPrint': { const c = cById(id); if (c) printContract(c); break; }
        case 'cDown': { const c = cById(id); if (c) downloadContract(c); break; }
        case 'cDeliver': {
          const c = cById(id); if (!c) break;
          const how = prompt('어떻게 전달했나요? (예: 인쇄본 직접 전달 / 카카오톡 전송 / 이메일)', '인쇄본 직접 전달');
          if (how === null) break;
          markDelivered(c, how.trim() || '전달'); render(); break;
        }
        case 'cCopy': {
          const c = cById(id); if (!c) break;
          const st = staffById(c.staffId);
          const rec = { id: newId('k'), staffId: c.staffId, staffName: st ? st.name : c.staffName, f: JSON.parse(JSON.stringify(c.f)), status: 'draft', sig: {}, files: [], delivered: [],
            createdAt: Date.now(), by: (S.ui.whoDate === dateKey() ? S.ui.who : '') || '', copiedFrom: c.id };
          rec.f.start = dateKey(); rec.f.signDate = dateKey(); rec.f.acks = ACKS.map(() => false); rec.f.finalAgree = false; rec.f.worker.rrn = '';
          S.contracts.push(rec); cOpen = rec.id; cMode = 'edit'; save(); render(); window.scrollTo(0, 0); break;
        }
        case 'cVoid': {
          const c = cById(id); if (!c) break;
          const why = prompt('무효 처리 사유를 적어 주세요. (예: 조건 변경으로 재계약)');
          if (why === null) break;
          c.status = 'void'; c.voidAt = stamp(); c.voidWhy = why.trim(); save(); render(); break;
        }
        case 'cDel': {
          const c = cById(id); if (!c) break;
          if (!confirm(`${cName(c)} 계약서를 삭제할까요? 첨부 파일도 함께 사라집니다.`)) break;
          Object.values(c.sig || {}).forEach((sg) => { if (sg && !sg.seal) dropBlob(sg.img); });
          (c.files || []).forEach(dropBlob);
          S.contracts = S.contracts.filter((x) => x.id !== id); cOpen = null; cMode = null; save(); render(); break;
        }
        case 'cAttach': { const c = cById(id); if (c) attachFile(c); break; }
        case 'cFileOpen': { const c = cById(id); if (c) openFile(c, b.dataset.fid); break; }
        case 'cFileDel': {
          const c = cById(id); if (!c) break;
          if (!confirm('이 첨부를 지울까요?')) break;
          const fl = (c.files || []).find((x) => x.id === b.dataset.fid); dropBlob(fl);
          c.files = (c.files || []).filter((x) => x.id !== b.dataset.fid); save(); render(); break;
        }
        case 'sealUpload': uploadSeal(); break;
        case 'sealDel': { if (!confirm('등록된 도장을 지울까요? 이미 날인된 계약서는 그대로 남습니다.')) break; S.settings.seal = null; save(); render(); break; }
        case 'staffTab': {
          staffTab = b.dataset.id;
          const mt = Store.meta;
          if (mt && staffTab !== mt.current && (!otherDoc || otherDocId !== staffTab)) { otherDoc = null; loadOtherDoc(staffTab); }
          render(); break;
        }
        case 'staffAdd': {
          const c = staffCtx(b.dataset.store); if (!c.doc) return;
          c.doc.staff.push({ id: 's' + Date.now(), name: '새 직원', roles: [], active: true }); staffCommit(c); break;
        }
        case 'staffDel': {
          const c = staffCtx(b.dataset.store); if (!c.doc) return;
          if (c.doc.staff.length <= 1) { alert('최소 한 명은 있어야 합니다.'); return; }
          if (!confirm('삭제할까요? 지난 기록의 이름은 그대로 남습니다.')) return;
          c.doc.staff = c.doc.staff.filter((s) => s.id !== id); staffCommit(c); break;
        }
        case 'staffRole': {
          const c = staffCtx(b.dataset.store); if (!c.doc) return;
          const s = c.doc.staff.find((x) => x.id === id), r = b.dataset.r;
          s.roles = (s.roles || []).includes(r) ? s.roles.filter((x) => x !== r) : (s.roles || []).concat(r);
          staffCommit(c); break;
        }
        case 'askPerm': Notification.requestPermission().then(() => render()); break;
        case 'toggleSound': S.settings.sound = !S.settings.sound; save(); render(); break;
        case 'toggleAskWho': S.settings.askWho = !S.settings.askWho; save(); render(); break;
        case 'orderUnlock': orderUnlockModal(); break;
        case 'cardTime': if (orderUnlocked()) timeModal(id); break;
        case 'orderLock': orderUnlockedAt = 0; render(); break;
        case 'orderPinSet': orderPinModal(false); break;
        case 'orderReset': {
          if (!confirm('사장님이 정한 순서를 지우고 시각순으로 되돌릴까요? (모든 시간대 · 모든 기기)')) return;
          S.templates.forEach((t) => { delete t.ord; }); save(); render(); break;
        }
        case 'toggleReport': S.settings.reportOff = !S.settings.reportOff; save(); render(); break;
        case 'toggleTgInstant': S.settings.tgInstant = S.settings.tgInstant === false; save(); render(); break;
        case 'testAlarm': fire('알림 테스트', '이렇게 표시됩니다. 소리도 함께 납니다.'); break;
        case 'copyReport': {
          const ta = $('#repText');
          ta.select(); ta.setSelectionRange(0, 99999);
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          if (!ok && navigator.clipboard) { navigator.clipboard.writeText(ta.value); ok = true; }
          $('#copyMsg').textContent = ok
            ? '복사했습니다. 카카오톡 대화방에서 붙여넣기(Ctrl+V / Cmd+V) 하세요.'
            : '복사가 안 됩니다. 위 글상자를 직접 선택해 복사하세요.';
          break;
        }
        case 'sendReportNow': {
          const kk = m.dataset.repkey || viewKey();
          const rep = buildReport(kk);
          $('#copyMsg').textContent = '보내는 중...';
          sendTelegram(rep.text).then((r) => {
            const el = $('#copyMsg'); if (!el) return;
            if (r.ok) {
              el.textContent = '보냈습니다. 휴대폰을 확인하세요.';
              if (kk === dateKey()) { ensureDay(kk).notified['reportSent'] = Date.now(); save(); }
            } else el.textContent = '전송 실패: ' + r.err;
          });
          break;
        }
        case 'tgFind': findChats(); break;
        case 'tgTest': {
          b.disabled = true;
          sendTelegram('해모닉 체크리스트 연결 확인 ✅ 이 메시지가 보이면 설정 완료입니다.', 'test', true).then(async (r) => {
            b.disabled = false;
            if (!r.ok && serverSends() && /인터넷 연결/.test(r.err)) {
              await Store.flush();
              const r3 = await Store.supaEvent('test', '해모닉 서버 알림 확인 🛰️ (이 브라우저는 텔레그램에 직접 못 닿아 서버가 대신 보냈습니다)');
              alert(r3.ok ? '이 브라우저는 텔레그램에 직접 못 닿지만, 서버를 통해 보냈습니다. 휴대폰을 확인하세요. 실제 알림은 모두 서버가 보내므로 문제 없습니다.' : '실패: ' + r3.err);
              return;
            }
            if (!r.ok) { alert('실패: ' + r.err); return; }
            if (!serverSends()) { alert('보냈습니다! 휴대폰 텔레그램을 확인하세요.'); return; }
            const r2 = await Store.supaEvent('test', '해모닉 서버 알림 확인 🛰️ 이 메시지가 보이면 서버 알림(21:30 리포트 · 즉시 알림)도 준비된 것입니다.');
            alert(r2.ok ? '2통을 보냈습니다 — 1통은 이 기기에서, 1통은 서버에서. 휴대폰에 둘 다 오면 끝입니다.\n(서버 것이 안 오면 서버/supabase_alerts.sql 을 아직 설치하지 않은 것입니다)'
              : '이 기기에서는 보냈지만 서버 알림 표가 없습니다: ' + r2.err + '\n서버/supabase_alerts.sql 을 SQL Editor 에서 실행하세요.');
          });
          break;
        }
        case 'openKakao': {
          // 카카오톡 데스크톱 앱을 여는 링크. 안 열리면 직접 실행하시면 된다.
          const a = document.createElement('a');
          a.href = 'kakaotalk://'; a.click();
          $('#copyMsg').textContent = '카카오톡이 안 열리면 직접 실행한 뒤 붙여넣으세요.';
          break;
        }
        case 'showReport': showReport(b.dataset.k || viewKey()); break;
        case 'supaLogin': supaLoginModal(); break;
        case 'supaLogout': { if (!confirm('서버 로그아웃할까요? 이 기기 기록은 남고, 동기화만 멈춥니다.')) return; Store.flush().then(() => Store.supaSignOut()).then(() => location.reload()); break; }
        case 'supaClear': { if (!confirm('서버 주소와 열쇠를 이 기기에서 지울까요? 기록은 남습니다.')) return; Store.supaSignOut().then(() => { Store.supaSetConfig('', ''); location.reload(); }); break; }
        case 'export': doExport(); break;
        case 'import': doImport(); break;
        case 'reset': {
          if (!confirm('모든 기록이 사라집니다. 먼저 내보내기로 백업하셨나요?\n계속할까요?')) return;
          if (!confirm('정말 삭제합니다. 되돌릴 수 없습니다.')) return;
          S = freshState(); backfill(); save(); view = 'today'; render(); break;
        }
      }
    });

    document.addEventListener('change', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const key = viewKey();
      if (b.dataset.act === 'staffType') {
        const c = staffCtx(b.dataset.store); if (!c.doc) return;
        const st = c.doc.staff.find((x) => x.id === b.dataset.id); if (st) { st.type = b.value; staffCommit(c); }
      }
      if (b.dataset.act === 'staffName') {
        const c = staffCtx(b.dataset.store); if (!c.doc) return;
        const s = c.doc.staff.find((x) => x.id === b.dataset.id);
        s.name = b.value.trim() || '이름 없음';
        if (c.cur) save(); else Store.saveStore(c.id, c.doc);
      }
      if (b.dataset.act === 'datePick') {
        const v = b.value;
        if (v && v >= minKey() && v <= maxKey()) { S.ui.date = v; save(); render(); }
        else render();
      }
      if (b.dataset.act === 'staffPayType' || b.dataset.act === 'staffPayAmt' || b.dataset.act === 'staffEmail') {
        const c = staffCtx(b.dataset.store); if (!c.doc) return;
        const st = c.doc.staff.find((x) => x.id === b.dataset.id); if (!st) return;
        if (b.dataset.act === 'staffEmail') st.email = b.value.trim();
        else {
          st.pay = st.pay || { type: '', amount: 0 };
          if (b.dataset.act === 'staffPayType') st.pay.type = b.value; else st.pay.amount = Math.max(0, Number(b.value) || 0);
        }
        if (c.cur) save(); else Store.saveStore(c.id, c.doc);
        if (b.dataset.act !== 'staffEmail') render();
      }
      if (b.dataset.act === 'insRate') { S.settings.insRate = Math.max(0, Number(b.value) || 0); save(); render(); }
      if (b.dataset.act === 'dedRate') { dedRates()[b.dataset.k] = Math.max(0, Number(b.value) || 0); save(); }
      if (b.dataset.act === 'payDayText') { S.settings.payDayText = b.value.trim() || '매월 10일'; save(); }
      if (b.dataset.act === 'slipTax') { const p = payrollOf(S.ui.lmonth || curMonth()); if (p) { p.slips = p.slips || {}; p.slips[b.dataset.n] = p.slips[b.dataset.n] || {}; p.slips[b.dataset.n].tax = Math.max(0, Number(b.value) || 0); save(); render(); } }
      if (b.dataset.act === 'tankMaxKg') { S.settings.tankMaxKg = Math.max(10, Number(b.value) || 700); save(); render(); }
      if (b.dataset.act === 'crabHold') { S.settings.crabHold = S.settings.crabHold || {}; S.settings.crabHold[b.dataset.sp] = Math.max(1, Number(b.value) || 28); save(); render(); }
      if (b.dataset.act === 'healthMonths') { S.settings.healthMonths = Math.max(1, Number(b.value) || 12); save(); render(); }
      if (b.dataset.act === 'healthDate' || b.dataset.act === 'healthMemo' || b.dataset.act === 'healthName') {
        const e = healthList().find((x) => x.id === b.dataset.id); if (!e) return;
        if (b.dataset.act === 'healthDate') e.issued = b.value; else if (b.dataset.act === 'healthMemo') e.memo = b.value.trim(); else e.name = b.value.trim();
        save(); if (b.dataset.act === 'healthDate') render();
      }
      if (b.dataset.act === 'hyOwner') { const o = hygieneOf().owner; o[b.dataset.f] = b.dataset.f === 'every' ? Math.max(1, Number(b.value) || 12) : b.value.trim(); save(); if (b.dataset.f !== 'org') render(); }
      if (b.dataset.act === 'hyStaff') { const hs = hygieneOf().staff; hs[b.dataset.id] = hs[b.dataset.id] || {}; hs[b.dataset.id][b.dataset.f] = b.value.trim(); save(); if (b.dataset.f === 'done') render(); }
      if (b.dataset.act === 'sfrom' || b.dataset.act === 'sto') {
        const v = b.value; if (v && v <= dateKey()) S.ui[b.dataset.act] = v;
        if (S.ui.sfrom && S.ui.sto && S.ui.sfrom > S.ui.sto) S.ui.sto = S.ui.sfrom;
        save(); render();
      }
      if (b.dataset.act === 'supaUrl' || b.dataset.act === 'supaKey') {
        const u = (document.querySelector('[data-act="supaUrl"]') || {}).value || '', k = (document.querySelector('[data-act="supaKey"]') || {}).value || '';
        if (u.trim() && k.trim()) { Store.supaSetConfig(u, k); render(); }
      }
      if (b.dataset.act === 'biz') { bizOf()[b.dataset.f] = b.value.trim(); save(); }
      if (b.dataset.act === 'minWage') { S.settings.minWage = Math.max(0, Number(b.value) || 0) || MIN_WAGE.hour; save(); render(); }
      if (b.dataset.act === 'reportAt') { S.settings.reportAt = b.value || '21:30'; save(); render(); }
      if (b.dataset.act === 'tgToken') { S.settings.tgToken = b.value.trim(); save(); }
      if (b.dataset.act === 'pmStart') { if (/^\d{2}:\d{2}$/.test(b.value)) { S.settings.pmStart = b.value; save(); render(); } }
      if (b.dataset.act === 'tgChat') { S.settings.tgChat = b.value.trim(); save(); }
      if (b.dataset.act === 'budget') { S.settings.budget = Math.max(1, Number(b.value) || 6); save(); render(); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    });

    document.addEventListener('input', (e) => {
      if (e.target.id !== 'rq') return;
      recipeQ = e.target.value;
      const q = recipeQ.trim().toLowerCase();
      document.querySelectorAll('.rcRow').forEach((el) => {
        el.hidden = q ? !el.dataset.name.includes(q) : false;
      });
    });

    // toggle 이벤트는 버블링하지 않아 캡처 단계에서 받는다
    document.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.tagName === 'DETAILS' && d.dataset.k) openState[d.dataset.k] = d.open;
    }, true);
  }

  function editTpl(id) {
    const t = tpl(id);
    const rep = t.repeat || { t: 'daily' };
    modal(t.title, `
      <label>이름<input id="eTitle" value="${esc(t.title)}"></label>
      <div class="row2"><label>시각<input type="time" id="eTime" value="${esc(t.time || t.sort || '')}"></label>
        <label>시간대<select id="eSlot">${SLOTS.map((sl) => `<option value="${sl.key}"${sl.key === t.slot ? ' selected' : ''}>${sl.name}</option>`).join('')}</select></label></div>
      <label>안내 메모 <span class="opt">선택</span><textarea id="eMemo" rows="2">${esc(t.memo || '')}</textarea></label>
      <label>담당<select id="eRole">${ROLE_OPTS.map((r) => `<option${r === t.role ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>반복<select id="eRep">
        <option value="daily"${rep.t === 'daily' ? ' selected' : ''}>매일</option>
        <option value="weekly"${rep.t === 'weekly' ? ' selected' : ''}>요일 지정</option></select></label>
      <div id="eDays" class="roles wrap"${rep.t === 'weekly' ? '' : ' hidden'}>
        ${WD.map((n, i) => `<button type="button" class="rl day${(rep.days || []).includes(i) ? ' on' : ''}" data-d="${i}">${n}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="eActive"${t.active ? ' checked' : ''}> 사용함 (끄면 체크리스트에서 빠집니다)</label>
    `, () => {
      t.title = $('#eTitle').value.trim() || t.title;
      t.memo = $('#eMemo').value.trim() || undefined;
      t.role = $('#eRole').value;
      t.active = $('#eActive').checked;
      if ($('#eRep').value === 'weekly') {
        const days = [...document.querySelectorAll('#eDays .day.on')].map((x) => Number(x.dataset.d));
        t.repeat = { t: 'weekly', days: days.length ? days : [1] };
      } else t.repeat = { t: 'daily' };
      // 사장님이 직접 고친 값은 루틴 판이 올라가도 지키기 위해 표시해 둔다
      t.edited = { ...(t.edited || {}), title: true, memo: true, role: true, active: true, repeat: true };
      const nv = $('#eTime').value, ns = $('#eSlot').value;
      const slotChanged = ns !== t.slot, timeChanged = /^\d{2}:\d{2}$/.test(nv) && nv !== (t.time || t.sort);
      if (slotChanged) { t.slot = ns; t.edited.slot = true; }
      if (timeChanged) retime(t, nv);
      if (slotChanged || timeChanged) placeByTime(t);
      save(); render();
    }, '저장');

    $('#eRep').addEventListener('change', (e) => { $('#eDays').hidden = e.target.value !== 'weekly'; });
    $('#eDays').addEventListener('click', (e) => {
      const d = e.target.closest('.day'); if (d) d.classList.toggle('on');
    });
  }

  /* ── 백업 ────────────────────────────────────────────────── */
  async function doExport() {
    S.settings.lastBackup = dateKey();
    save(); await Store.flush();
    const all = await Store.dumpAll();          // 두 매장 + 매장 목록 전부
    const name = `해모닉-전체백업-${dateKey()}.json`;
    const json = JSON.stringify(all, null, 1);
    // claude.ai 안에서는 뷰어가 내려받기를 대신 묻는다 (바로 내려받는 링크는 막혀 있다)
    const dl = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null;
    if (dl) {
      try { await dl.save({ filename: name, data: json }); }
      catch (e) { if (e && e.code !== 'declined') alert('내려받기에 실패했습니다: ' + (e.message || e.code)); }
      render(); return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    render();
  }

  function doImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const v = JSON.parse(rd.result);
          if (v && v.v === 2 && v.states) {
            // 전체 백업(두 매장) 복원
            if (!confirm('모든 매장의 기록을 이 백업으로 덮어씁니다. 계속할까요?')) return;
            Store.restoreAll(v).then(() => { alert('복원했습니다. 앱을 다시 불러옵니다.'); location.reload(); });
            return;
          }
          if (!v || !v.templates || !v.days) throw new Error('형식이 맞지 않습니다');
          if (!confirm(`현재 매장(${storeName()})의 기록을 덮어씁니다. 계속할까요?`)) return;
          S = v; hydrate(); view = 'today'; render();
          alert('복원했습니다.');
        } catch (err) { alert('불러오지 못했습니다: ' + err.message); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  /* 불러온 상태를 쓸 수 있게 손본다 — 시작할 때와 매장을 바꿀 때 공통 */
  /* 역할 이름이 바뀌어도(점장 → 갑각류 관리자) 저장된 기록이 옛 이름으로 남아 있으면
     필터·근무표·담당 표시가 전부 어긋난다. 문서를 읽을 때마다 한 번 훑어 바꾼다. */
  function migrateRoles(doc) {
    const fix = (r) => LEGACY_ROLES[r] || r;
    (doc.staff || []).forEach((st) => { st.roles = (st.roles || []).map(fix); });
    Object.values(doc.roster || {}).forEach((rows) => (rows || []).forEach((e) => {
      if (Array.isArray(e)) { for (let i = 0; i < e.length; i++) e[i] = fix(e[i]); }
      else if (e && e.roles) e.roles = e.roles.map(fix);
    }));
    Object.values(doc.days || {}).forEach((day) => Object.values(day.inst || {}).forEach((rec) => {
      if (rec && rec.role) rec.role = fix(rec.role);
    }));
    return doc;
  }

  function hydrate() {
    if (!S.ui) S.ui = { who: null, whoDate: null, filter: 'all' };
    migrateRoles(S);

    /* 루틴 갱신 — 템플릿은 저장소에 복사되므로 data.js 를 고쳐도 여기서 갈아끼워야 한다.
       지난 체크 기록(days)은 그대로 두고 목록만 교체한다. */
    if ((S.routineVer || 1) < ROUTINE_VER) {
      const oldBy = {}; (S.templates || []).forEach((t) => { oldBy[t.id] = t; });
      S.templates = storeTemplates().map((t) => {
        const nt = { ...t, active: true, repeat: t.repeat || { t: 'daily' } };
        const old = oldBy[t.id];
        // 앱에서 직접 고친 제목·메모·담당 등은 새 판을 덮어쓰지 않는다
        if (old && old.edited) { Object.keys(old.edited).forEach((f) => { nt[f] = old[f]; }); nt.edited = old.edited; }
        if (old && old.ord != null) nt.ord = old.ord;   // 사장님이 끌어서 정한 순서는 새 판에서도 유지
        return nt;
      });
      const live = new Set(S.templates.map((t) => t.id));
      const tk = dateKey();
      Object.entries(S.days).forEach(([k, day]) => {
        // 없앤 업무는 어느 날짜에서도 빼둔다 — 남겨두면 화면에 못 그리면서
        // 완료율 분모만 늘려 "다 했는데 80%" 같은 숫자가 나온다
        Object.keys(day.inst).forEach((id) => { if (!live.has(id)) delete day.inst[id]; });
        // 새로 생긴 업무는 오늘 것만 채운다 (지난 날짜에 없던 일을 만들지 않는다)
        if (k === tk) {
          const d = new Date(k + 'T00:00:00');
          S.templates.forEach((t) => { if (runsOn(t, d) && !day.inst[t.id]) day.inst[t.id] = { s: 'todo' }; });
        }
      });
      // 5판부터: 체크할 때마다 누가 했는지 고른다 — 사장님 지시(2026-09-12)
      if ((S.routineVer || 1) < 5) {
        if (S.settings) S.settings.askWho = true;
        // 기본값으로 만들어졌던 '점장'이라는 직원 이름도 '매니저'로 — 역할 이름과 헷갈리지 않게
        (S.staff || []).forEach((st) => { if (st.name === '점장') st.name = '매니저'; });
      }
      // 9판: 수조·이끼 상태 확인은 월·수·금만 — 사장님 요청(2026-09-23). 앱에서 고친 적이 있어도 이 요일 규칙을 적용한다
      if ((S.routineVer || 1) < 9) {
        const t18 = S.templates.find((t) => t.id === 't18');
        if (t18) { t18.repeat = { t: 'weekly', days: [1, 3, 5] }; t18.edited = { ...(t18.edited || {}), repeat: true }; }
        // 오늘 해당하지 않게 된 항목은 (아직 안 했으면) 오늘 목록에서 뺀다
        const td = S.days[tk];
        if (td) { const d0 = new Date(tk + 'T00:00:00'); Object.keys(td.inst).forEach((id) => { const t = tpl(id); if (t && !runsOn(t, d0) && td.inst[id].s === 'todo') delete td.inst[id]; }); }
      }
      S.routineVer = ROUTINE_VER;
    }
    /* 앱을 새로 열면 항상 오늘·전체 보기로 시작한다.
       공용 PC라 역할 필터가 남아 있으면 다음 사람이 자기 항목을 못 보게 된다. */
    S.ui.date = dateKey();
    S.ui.filter = 'all';
    S.ui.slot = null;          // 앱을 열면 지금 시간대부터 보여준다
    S.ui.month = dateKey().slice(0, 7);
    S.ui.mdate = dateKey();
    if (!S.recipes) S.recipes = [];
    if (!S.purchases) S.purchases = [];
    if (!S.sales) S.sales = {};
    if (!S.payroll) S.payroll = {};
    S.ui.smonth = null; S.ui.pmonth = null; S.ui.lmonth = null;   // 회계 화면은 열 때마다 이번 달부터
    if (!S.notices) S.notices = [];
    if (!S.issues) S.issues = [];
    if (!S.contracts) S.contracts = [];
    if (!S.blobs) S.blobs = {};
    if (!S.settings) S.settings = { ...DEFAULT_SETTINGS };
    if (!S.settings.fixedCosts) S.settings.fixedCosts = [];
    if (S.settings.insRate == null) S.settings.insRate = 10;
    if (S.settings.weeklyPay == null) S.settings.weeklyPay = true;
    if (S.settings.crew == null) {
      const setup = STORE_SETUP[Store.meta && Store.meta.current];
      S.settings.crew = setup ? setup.crew : 2;
    }
    backfill(); save();
  }

  async function switchStore(id) {
    if (Store.meta && Store.meta.current === id) return;
    Store.save(S);
    S = (await Store.switchTo(id)) || freshState(id);
    staffTab = null; otherDoc = null; otherDocId = null; cOpen = null; cMode = null; cFilter = 'all';
    hydrate();
    view = 'today';
    render();
    try { loadMarketCache(); } catch (e) {}   // 다른 매장 매입 단가(시세 참조)를 새 매장 기준으로 다시 읽는다
  }

  async function start() {
    await Store.init();
    S = (await Store.load()) || freshState();
    hydrate();
    loadSharedIssues();
    try { loadMarketCache(); } catch (e) {}   // 매입 기록 없는 매장이 다른 매장 단가를 시세 참고로 쓰기 위해
    // 주소 뒤에 ?view=tanks 처럼 붙이면 그 화면으로 바로 연다 — 아이패드 홈 화면 바로가기용
    try {
      const want = new URLSearchParams(location.search).get('view');
      if (want && MENU.some((m) => m.items.some(([k]) => k === want))) view = want;
      const cid = new URLSearchParams(location.search).get('c');
      if (cid && cById(cid)) { view = 'contracts'; cOpen = cid; cMode = isSigned(cById(cid)) ? null : 'edit'; }
    } catch (e) {}
    document.head.insertAdjacentHTML('beforeend', '<style>' + PAPER_CSS + '</style>');
    bind(); render();
    checkAlarms();
    checkReport();

    let lastKey = dateKey(), lastSig = null;
    tickTimer = setInterval(() => {
      const k = dateKey();
      if (k !== lastKey) { lastKey = k; S.ui.date = k; S.ui.filter = 'all'; S.ui.slot = null; backfill(); save(); render(); }   // 자정 롤오버
      checkAlarms();
      // 지연 표시가 실제로 바뀔 때만 다시 그린다.
      // 30초마다 무조건 다시 그리면 누르는 순간 화면이 갈려 오조작이 난다.
      if (view === 'today' && viewKey() === k) {
        const sig = Object.keys(S.days[k].inst).filter((t) => isOverdue(k, t)).join(',');
        if (sig !== lastSig) { lastSig = sig; render(); }
      }
    }, 30000);

    window.addEventListener('beforeunload', () => Store.flush());
    window.addEventListener('pagehide', () => Store.flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
    // 다른 기기(휴대폰·매장 PC)에서 바뀐 게 도착하면 지금 보는 매장 것일 때만 갈아끼운다
    Store.onRemote((k, doc) => {
      if (k === 'shared:issues') { if (doc && Array.isArray(doc.issues)) { SH = doc; if (view === 'issues' && $('#modal').hidden) render(); } return; }
      if (k !== 'state:' + (Store.meta && Store.meta.current)) return;
      if (!$('#modal').hidden) return;      // 입력 중인 창을 날리지 않는다
      if (view === 'contracts' && cMode === 'edit') return;   // 계약서 작성 중 — 서명이 지워진다
      S = doc; hydrate(); render();
    });
    document.addEventListener('cloud-status', () => { if (view === 'today' || view === 'settings') render(); });
    // 쓰다가 저장이 깨지는 경우(용량 초과 등)도 즉시 화면에 드러낸다
    document.addEventListener('storage-broken', () => { view = 'today'; render(); });
  }

  return { start };
})();

document.addEventListener('DOMContentLoaded', App.start);
