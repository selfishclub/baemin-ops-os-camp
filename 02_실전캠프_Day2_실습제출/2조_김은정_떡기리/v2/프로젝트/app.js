/* 떡기리 신입직원 교육 온라인북 v2
 * v1 = 12장 매뉴얼·검색·체크리스트(폰 저장)·교육표·확인 필요
 * v2 = 체크리스트를 "매장·이름 → 체크 → 완료" 로 서버(Supabase)에 저장 + 사장 점검표(PIN)
 * - 서버 열쇠는 config.js (make-config.js 가 .env.local / 환경변수에서 만듦). config.js 가 없거나 비어 있으면 v1처럼 폰 저장만.
 * - 빌드 도구 없음. index.html 을 열면 바로 동작.
 */
(function () {
  'use strict';

  // ---------- 저장 (실패해도 화면은 동작) ----------
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var session = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(); }
  function shiftDate(s, days) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2] + days); return dateStr(d); }
  function hhmm(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function koDate(s) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return +p[1] + '/' + +p[2] + ' (' + '일월화수목금토'[d.getDay()] + ')'; }

  // ---------- 서버 (Supabase REST) ----------
  var SB = window.SB || {};
  // 매장·이름 목록은 사장이 점검표 화면에서 등록한다. 코드에 기본값(지점명 등)을 두지 않는다.
  var DEFAULT_STORES = [];
  var DEFAULT_STAFF = [];
  function sbOn() { return !!(SB.url && SB.anon); }
  function sbFetch(path, opts) {
    opts = opts || {};
    var headers = { 'apikey': SB.anon, 'Authorization': 'Bearer ' + SB.anon, 'Content-Type': 'application/json' };
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    return fetch(SB.url.replace(/\/$/, '') + '/rest/v1/' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); }); return r.text().then(function (t) { return t ? JSON.parse(t) : null; }); });
  }
  var settingsCache = null;
  function loadSettings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    var base = { stores: DEFAULT_STORES.slice(), staff: DEFAULT_STAFF.slice() };
    var cached = store.get('settings'); if (cached) { try { base = JSON.parse(cached); } catch (e) {} }
    if (!sbOn()) { settingsCache = base; return Promise.resolve(base); }
    return sbFetch('settings?select=key,value').then(function (rows) {
      (rows || []).forEach(function (r) {
        if ((r.key === 'stores' || r.key === 'staff') && Array.isArray(r.value)) base[r.key] = r.value;
        if (r.key === 'owner_pin_hash' && typeof r.value === 'string') base.owner_pin_hash = r.value;
      });
      settingsCache = base; store.set('settings', JSON.stringify(base)); return base;
    }).catch(function () { settingsCache = base; return base; });
  }
  // 매장이 0~1개면 매장 선택은 보이지 않는다. 1개면 그 이름을 쓰고, 0개면 빈 이름("매장"으로 표시).
  function storeLabel(s) { return s ? s : '매장'; }
  function singleStore(settings) { return settings.stores.length <= 1 ? (settings.stores[0] || '') : null; }
  function saveSetting(key, value) {
    settingsCache = null; store.del('settings');
    if (!sbOn()) { var b = JSON.parse(store.get('settings') || '{}'); b[key] = value; store.set('settings', JSON.stringify(b)); return Promise.resolve(); }
    return sbFetch('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: key, value: value, updated_at: new Date().toISOString() }] });
  }
  function runKey(date, storeName, kind) { return 'run:' + date + ':' + storeName + ':' + kind; }
  function localRun(date, storeName, kind) { var v = store.get(runKey(date, storeName, kind)); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  function saveLocalRun(run) { store.set(runKey(run.run_date, run.store, run.kind), JSON.stringify(run)); }
  function fetchRun(date, storeName, kind) {
    if (!sbOn()) return Promise.resolve(localRun(date, storeName, kind));
    return sbFetch('checklist_runs?select=*&run_date=eq.' + date + '&store=eq.' + encodeURIComponent(storeName) + '&kind=eq.' + kind)
      .then(function (rows) { var r = rows && rows[0] ? rows[0] : null; if (r) saveLocalRun(r); return r; })
      .catch(function () { return localRun(date, storeName, kind); });
  }
  function fetchRunsForDate(date) {
    if (!sbOn()) {
      var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('run:' + date + ':') === 0) out.push(JSON.parse(localStorage.getItem(k))); } } catch (e) {}
      return Promise.resolve(out);
    }
    return sbFetch('checklist_runs?select=*&run_date=eq.' + date);
  }
  // 저장: 서버 먼저, 실패하면 폰에만 두고 알림
  function saveRun(run) {
    run.updated_at = new Date().toISOString();
    saveLocalRun(run);
    if (!sbOn()) return Promise.resolve({ ok: true, local: true });
    var body = { run_date: run.run_date, store: run.store, kind: run.kind, staff: run.staff, items: run.items, total: run.total, done_count: run.done_count, note: run.note || '', first_completed_at: run.first_completed_at || null, completed_at: run.completed_at || null, updated_at: run.updated_at };
    return sbFetch('checklist_runs?on_conflict=run_date,store,kind', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: [body] })
      .then(function (rows) { if (rows && rows[0]) { run.id = rows[0].id; saveLocalRun(run); } return { ok: true }; })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }

  // ---------- 마크다운 → 데이터 (v1 그대로) ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function inline(s) {
    var h = esc(s);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    h = h.replace(/확인 필요/g, '<mark class="todo">확인 필요</mark>');
    return h;
  }
  function plain(s) {
    return String(s).replace(/^[-*]\s+\[[ xX]\]\s*/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')
      .replace(/^>\s*/, '').replace(/^#+\s*/, '').replace(/[*`|]/g, '').replace(/\s+/g, ' ').trim();
  }
  function parseBook(md) {
    var lines = md.replace(/\r\n?/g, '\n').split('\n');
    var chapters = [], appendix = [], cur = null, inAppendix = false, i, l, m;
    for (i = 0; i < lines.length; i++) {
      l = lines[i];
      if (/^# 별도 출력물/.test(l)) { inAppendix = true; cur = null; continue; }
      m = l.match(/^## (.+)$/);
      if (m) {
        cur = { title: m[1].trim(), lines: [] };
        if (inAppendix) { appendix.push(cur); }
        else { var n = m[1].match(/^(\d+)장\.\s*(.*)$/); cur.num = n ? parseInt(n[1], 10) : chapters.length + 1; cur.name = n ? n[2].trim() : m[1].trim(); chapters.push(cur); }
        continue;
      }
      if (cur) cur.lines.push(l);
    }
    return { chapters: chapters, appendix: appendix };
  }
  function findAppendix(book, mark) { for (var i = 0; i < book.appendix.length; i++) if (book.appendix[i].title.indexOf(mark) === 0) return book.appendix[i]; return null; }
  function checklistItems(sec) {
    var items = [], title = '';
    if (!sec) return { title: title, items: items };
    var inCode = false;
    sec.lines.forEach(function (l) {
      if (/^```/.test(l)) { inCode = !inCode; return; }
      if (!inCode) return;
      var m = l.match(/^\[(.+)\]\s*(.*)$/); if (m) { title = m[1] + (m[2] ? ' ' + m[2] : ''); return; }
      var c = l.match(/^□\s*(.+)$/); if (c) items.push(c[1].trim());
    });
    return { title: title, items: items };
  }
  function trainingRows(book) {
    var ch = book.chapters.filter(function (c) { return c.num === 12; })[0], rows = [];
    if (!ch) return rows;
    ch.lines.forEach(function (l) {
      if (!/^\|/.test(l) || /^\|\s*-+/.test(l) || /단계\s*\|/.test(l)) return;
      var cells = l.split('|').slice(1, -1).map(function (s) { return s.trim(); });
      if (cells.length >= 2) rows.push({ day: cells[0], content: cells[1], confirm: cells[2] || '' });
    });
    return rows;
  }
  function todoItems(book) {
    var out = [];
    book.chapters.forEach(function (c) { c.lines.forEach(function (l, idx) { if (l.indexOf('확인 필요') >= 0) out.push({ num: c.num, name: c.name, line: idx, text: plain(l) }); }); });
    return out;
  }
  function renderBlocks(lines, ctx) {
    var html = '', i = 0, l, j, buf, m;
    var dayKey = 'ch:' + ctx.num + ':' + today() + ':';
    function item(text, n) {
      var c = text.match(/^\[([ xX])\]\s*(.*)$/);
      if (c) { var key = dayKey + n, on = store.get(key) === '1'; return '<li class="chk' + (on ? ' done' : '') + '" data-line="' + n + '"><label><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>' + inline(c[2]) + '</span></label></li>'; }
      return '<li data-line="' + n + '">' + inline(text) + '</li>';
    }
    while (i < lines.length) {
      l = lines[i];
      if (/^```/.test(l)) { buf = []; j = i + 1; while (j < lines.length && !/^```/.test(lines[j])) { buf.push(lines[j]); j++; } html += '<pre data-line="' + i + '">' + esc(buf.join('\n')) + '</pre>'; i = j + 1; continue; }
      if (/^\|/.test(l)) {
        buf = []; j = i; while (j < lines.length && /^\|/.test(lines[j])) { buf.push({ t: lines[j], n: j }); j++; }
        html += '<table><tbody>';
        buf.forEach(function (row, idx) { if (/^\|\s*-+/.test(row.t)) return; var cells = row.t.split('|').slice(1, -1), tag = idx === 0 ? 'th' : 'td'; html += '<tr data-line="' + row.n + '">' + cells.map(function (c) { return '<' + tag + '>' + inline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>'; });
        html += '</tbody></table>'; i = j; continue;
      }
      if (/^[-*]\s+/.test(l)) { buf = []; j = i; while (j < lines.length && /^[-*]\s+/.test(lines[j])) { buf.push({ t: lines[j].replace(/^[-*]\s+/, ''), n: j }); j++; } html += '<ul>' + buf.map(function (b) { return item(b.t, b.n); }).join('') + '</ul>'; i = j; continue; }
      if (/^\d+\.\s+/.test(l)) { buf = []; j = i; while (j < lines.length && /^\d+\.\s+/.test(lines[j])) { buf.push({ t: lines[j].replace(/^\d+\.\s+/, ''), n: j }); j++; } html += '<ol>' + buf.map(function (b) { return '<li data-line="' + b.n + '">' + inline(b.t) + '</li>'; }).join('') + '</ol>'; i = j; continue; }
      if (/^>\s?/.test(l)) { html += '<blockquote data-line="' + i + '">' + inline(l.replace(/^>\s?/, '')) + '</blockquote>'; i++; continue; }
      if (/^-{3,}\s*$/.test(l)) { html += '<hr>'; i++; continue; }
      m = l.match(/^(#{1,6})\s+(.*)$/);
      if (m) { var lvl = Math.min(m[1].length + 1, 4); html += '<h' + lvl + ' data-line="' + i + '">' + inline(m[2]) + '</h' + lvl + '>'; i++; continue; }
      if (l.trim() === '') { i++; continue; }
      html += '<p data-line="' + i + '">' + inline(l) + '</p>'; i++;
    }
    return html;
  }

  // ---------- 화면 ----------
  var book = parseBook(window.BOOK_MD || '');
  var LISTS = { open: checklistItems(findAppendix(book, '②')), close: checklistItems(findAppendix(book, '③')) };
  var KIND_LABEL = { open: '오픈', close: '마감' };
  var TODOS = todoItems(book);
  var app = document.getElementById('app');
  function empty(title, sub) { return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(sub) + '</div>'; }
  function chapterLink(num) { var c = book.chapters.filter(function (x) { return x.num === num; })[0]; return c ? '#/ch/' + num : '#/'; }
  function me() { var v = store.get('me'); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  function runStatus(run, total) {
    if (!run) return { cls: 'none', label: '미완료', done: 0, total: total };
    var done = Object.keys(run.items || {}).length;
    if (run.completed_at) return { cls: 'done', label: '완료', done: done, total: run.total || total };
    return { cls: 'partial', label: '진행 중', done: done, total: run.total || total };
  }
  // PIN: 설정에 저장된 해시가 있으면 그것과 비교, 없으면 config.js(환경변수 OWNER_PIN)와 비교
  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function checkPin(input) {
    return loadSettings().then(function (s) {
      if (s.owner_pin_hash) return sha256(input).then(function (h) { return h === s.owner_pin_hash; });
      return String(input) === String(SB.ownerPin || '0000');
    });
  }

  function viewHome() {
    var m = me(), h = '';
    h += '<h1>무엇을 찾으세요?</h1>';
    h += '<div id="home-status" class="card status-card">' + (m ? '<div class="sub">' + esc(m.store) + ' · ' + esc(m.staff) + ' <a href="#/who">바꾸기</a></div><div class="muted">오늘 상태 불러오는 중…</div>' : '<div class="sub">아직 이름을 고르지 않았어요.</div><a class="btn primary" href="#/who">매장·이름 고르기</a>') + '</div>';
    h += '<div class="grid2">';
    h += '<a class="big-btn" href="#/check/open">☀️ 오픈 체크리스트<small id="home-open">' + LISTS.open.items.length + '항목</small></a>';
    h += '<a class="big-btn alt" href="#/check/close">🌙 마감 체크리스트<small id="home-close">' + LISTS.close.items.length + '항목</small></a>';
    h += '</div>';
    h += '<div class="grid2" style="margin-top:10px">';
    h += '<a class="big-btn soft" href="#/train">🎓 신입 교육표<small>1·3·7일차</small></a>';
    h += '<a class="big-btn soft" href="#/todo">📝 확인 필요<small>' + TODOS.length + '곳</small></a>';
    h += '</div>';
    h += '<p class="section-title">목차 — 장을 누르면 열려요</p><div class="toc">';
    book.chapters.forEach(function (ch) {
      var n = TODOS.filter(function (t) { return t.num === ch.num; }).length;
      h += '<a href="#/ch/' + ch.num + '"><span class="num">' + ch.num + '</span><span>' + esc(ch.name) + '</span>' + (n ? '<span class="badge">확인 필요 ' + n + '</span>' : '') + '</a>';
    });
    h += '</div>';
    h += '<p class="section-title">사장님용</p><a class="card link" href="#/owner"><div class="title">📋 사장 점검표</div><div class="sub">오늘 3매장 오픈·마감이 됐는지 한눈에 (PIN)</div></a>';
    app.innerHTML = h;
    if (m) {
      Promise.all([fetchRun(today(), m.store, 'open'), fetchRun(today(), m.store, 'close')]).then(function (rs) {
        var o = runStatus(rs[0], LISTS.open.items.length), c = runStatus(rs[1], LISTS.close.items.length);
        var el = document.getElementById('home-status'); if (!el) return;
        el.innerHTML = '<div class="sub">' + esc(m.store) + ' · ' + esc(m.staff) + ' <a href="#/who">바꾸기</a></div>' +
          '<div class="status-line"><span class="pill ' + o.cls + '">오픈 ' + o.label + (o.done ? ' ' + o.done + '/' + o.total : '') + '</span><span class="pill ' + c.cls + '">마감 ' + c.label + (c.done ? ' ' + c.done + '/' + c.total : '') + '</span></div>' +
          (sbOn() ? '' : '<div class="muted small">서버 연결 없음 — 이 폰에만 저장돼요</div>');
        var ho = document.getElementById('home-open'); if (ho) ho.textContent = o.label + (o.done ? ' ' + o.done + '/' + o.total : '');
        var hc = document.getElementById('home-close'); if (hc) hc.textContent = c.label + (c.done ? ' ' + c.done + '/' + c.total : '');
      });
    }
  }

  // 매장·이름 고르기
  function viewWho(next) {
    var cur = me() || {};
    app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 이름</div><h1>누구세요?</h1><p class="muted">한 번 고르면 이 폰이 기억해요. 체크 기록에 이름이 남습니다.</p><div class="muted">불러오는 중…</div>';
    loadSettings().then(function (s) {
      var single = singleStore(s), multi = single === null;
      var h = '<div class="crumb"><a href="#/">첫 화면</a> › ' + (multi ? '매장·' : '') + '이름</div><h1>누구세요?</h1><p class="muted">한 번 고르면 이 폰이 기억해요. 체크 기록에 ' + (multi ? '매장과 ' : '') + '이름이 남습니다.</p>';
      if (multi) h += '<p class="section-title">매장</p><div class="choice" id="pick-store">' + s.stores.map(function (x) { return '<button type="button" class="choice-btn' + (cur.store === x ? ' on' : '') + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
      h += '<p class="section-title">이름</p>';
      if (s.staff.length) {
        h += '<div class="choice" id="pick-staff">' + s.staff.map(function (x) { return '<button type="button" class="choice-btn' + (cur.staff === x ? ' on' : '') + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
        h += '<p class="muted small">내 이름이 없으면 사장님께 말씀해 주세요 (사장 점검표 → 목록에서 추가합니다).</p>';
      } else {
        h += '<input type="text" id="staff-text" class="text-input" placeholder="이름 또는 별칭 (예: 알바 A)" value="' + esc(cur.staff || '') + '" maxlength="20">';
        h += '<p class="muted small">아직 등록된 이름 목록이 없어 직접 적습니다. 사장님이 점검표 → 목록에서 이름을 등록하면 고르기로 바뀝니다.</p>';
      }
      h += '<button type="button" class="btn primary wide" id="who-ok">이대로 시작</button>';
      app.innerHTML = h;
      var pick = { store: multi ? cur.store : single, staff: cur.staff };
      ['store', 'staff'].forEach(function (k) {
        app.querySelectorAll('#pick-' + k + ' .choice-btn').forEach(function (b) {
          b.addEventListener('click', function () { pick[k] = b.dataset.v; app.querySelectorAll('#pick-' + k + ' .choice-btn').forEach(function (x) { x.classList.toggle('on', x === b); }); });
        });
      });
      document.getElementById('who-ok').addEventListener('click', function () {
        var t = document.getElementById('staff-text'); if (t) pick.staff = t.value.trim();
        if (multi && !pick.store) { alert('매장을 골라 주세요.'); return; }
        if (!pick.staff) { alert('이름을 ' + (s.staff.length ? '골라' : '적어') + ' 주세요.'); return; }
        if (!multi) pick.store = single;
        store.set('me', JSON.stringify(pick));
        location.hash = next || '#/';
      });
    });
  }

  // 체크리스트 (v2: 매장·이름 → 체크 → 완료 → 서버)
  function viewChecklist(kind) {
    var m = me();
    if (!m) { location.hash = '#/who?next=' + encodeURIComponent('#/check/' + kind); return; }
    var src = LISTS[kind], label = KIND_LABEL[kind], detail = kind === 'open' ? 4 : 10, date = today();
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 체크리스트</div>';
    h += '<h1>' + (kind === 'open' ? '☀️' : '🌙') + ' ' + label + ' 체크리스트</h1>';
    h += '<div class="card who-line"><span>' + (m.store ? '<strong>' + esc(m.store) + '</strong> · ' : '') + esc(m.staff) + ' · ' + koDate(date) + '</span><a href="#/who?next=' + encodeURIComponent('#/check/' + kind) + '">바꾸기</a></div>';
    h += '<div id="cl-body" class="muted">불러오는 중…</div>';
    app.innerHTML = h;
    fetchRun(date, m.store, kind).then(function (run) {
      if (!run) run = { run_date: date, store: m.store, kind: kind, staff: m.staff, items: {}, total: src.items.length, done_count: 0, first_completed_at: null, completed_at: null };
      run.total = src.items.length;
      var body = '';
      body += '<div class="done-msg" id="cl-done" hidden></div>';
      body += '<div id="cl-progress" style="font-weight:700"></div><div class="progress-bar"><div id="cl-bar" style="width:0"></div></div>';
      body += '<div id="cl-note" class="save-note" hidden></div>';
      body += '<ul class="checklist">';
      src.items.forEach(function (t, i) {
        var on = !!run.items[String(i)];
        body += '<li class="' + (on ? 'done' : '') + '"><label><input type="checkbox" data-i="' + i + '"' + (on ? ' checked' : '') + '><span>' + esc(t) + '</span><em class="when">' + (on ? hhmm(run.items[String(i)]) : '') + '</em></label></li>';
      });
      body += '</ul>';
      body += '<label class="field">특이사항 (선택) <span class="muted small">— 재고 부족, 기기 이상, 손님 특이사항 등. 사장님 화면에 함께 보입니다</span><textarea id="cl-note-text" rows="3" placeholder="예: 흑임자 재고 2팩 남음 / 제빙기 소리 이상">' + esc(run.note || '') + '</textarea></label>';
      body += '<button type="button" class="btn primary wide" id="cl-complete">' + label + ' 완료 제출</button>';
      body += '<div class="chapter-tools"><a class="btn" href="' + chapterLink(detail) + '">' + detail + '장 자세히 보기</a><button type="button" class="btn danger" id="cl-reset">오늘 체크 지우기</button></div>';
      document.getElementById('cl-body').innerHTML = body;
      var inputs = app.querySelectorAll('input[data-i]');
      function refresh() {
        var done = Object.keys(run.items).length;
        run.done_count = done;
        document.getElementById('cl-progress').textContent = done + '/' + run.total + ' 완료' + (run.completed_at ? ' · ' + label + ' 완료 ' + hhmm(run.completed_at) + ' (' + esc(run.staff) + ')' : '');
        document.getElementById('cl-bar').style.width = (run.total ? Math.round(done / run.total * 100) : 0) + '%';
        var dm = document.getElementById('cl-done');
        dm.hidden = !run.completed_at;
        if (run.completed_at) dm.innerHTML = '👏 오늘 ' + (run.store ? esc(run.store) + ' ' : '') + label + ' 완료 · ' + esc(run.staff) + ' · ' + hhmm(run.completed_at) + (done < run.total ? ' <span class="warn">(' + (run.total - done) + '개 빠짐)</span>' : '');
        var btn = document.getElementById('cl-complete');
        btn.textContent = run.completed_at ? label + ' 완료 제출됨 — 다시 제출' : label + ' 완료 제출' + (done < run.total ? ' (' + (run.total - done) + '개 남음)' : '');
      }
      var noteTimer = null;
      document.getElementById('cl-note-text').addEventListener('input', function (e) {
        run.note = e.target.value; run.staff = m.staff;
        clearTimeout(noteTimer);
        noteTimer = setTimeout(function () { saveRun(run).then(note); }, 800);
      });
      function note(res) {
        var n = document.getElementById('cl-note');
        if (res.ok && !res.local) { n.hidden = true; return; }
        n.hidden = false;
        n.textContent = res.local ? '서버 연결이 없어 이 폰에만 저장됐어요.' : '저장 안 됨 — 인터넷 연결 후 다시 눌러 주세요. (' + res.error + ')';
      }
      inputs.forEach(function (inp) {
        inp.addEventListener('change', function () {
          var i = String(inp.dataset.i);
          if (inp.checked) run.items[i] = new Date().toISOString(); else delete run.items[i];
          run.staff = m.staff;
          inp.closest('li').classList.toggle('done', inp.checked);
          inp.closest('li').querySelector('.when').textContent = inp.checked ? hhmm(run.items[i]) : '';
          refresh();
          saveRun(run).then(note);
        });
      });
      document.getElementById('cl-complete').addEventListener('click', function () {
        var done = Object.keys(run.items).length;
        if (done < run.total && !confirm((run.total - done) + '개가 아직 체크 안 됐어요. 그래도 ' + label + ' 완료로 저장할까요?')) return;
        var now = new Date().toISOString();
        if (!run.first_completed_at) run.first_completed_at = now;
        run.completed_at = now; run.staff = m.staff; run.note = document.getElementById('cl-note-text').value;
        refresh();
        saveRun(run).then(function (res) { note(res); if (res.ok) window.scrollTo(0, 0); });
      });
      document.getElementById('cl-reset').addEventListener('click', function () {
        if (!confirm('오늘 ' + storeLabel(run.store) + ' ' + label + ' 체크를 모두 지울까요? (완료 표시도 지워져요)')) return;
        run.items = {}; run.completed_at = null; run.first_completed_at = null;
        inputs.forEach(function (inp) { inp.checked = false; inp.closest('li').classList.remove('done'); inp.closest('li').querySelector('.when').textContent = ''; });
        refresh(); saveRun(run).then(note);
      });
      refresh();
    });
  }

  // 사장 점검표
  function ownerOk() { return session.get('owner_ok') === '1'; }
  function viewOwner(dateParam, detail) {
    if (!ownerOk()) {
      app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 사장 점검표</div><h1>📋 사장 점검표</h1><p class="muted">사장님 번호(PIN)를 넣어 주세요.</p><form id="pin-form" class="pin-form"><input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="pin" autocomplete="off"><button class="btn primary" type="submit">열기</button></form><p id="pin-err" class="warn" hidden>번호가 달라요.</p>';
      document.getElementById('pin-form').addEventListener('submit', function (e) {
        e.preventDefault();
        checkPin(document.getElementById('pin').value).then(function (ok) {
          if (ok) { session.set('owner_ok', '1'); viewOwner(dateParam, detail); }
          else document.getElementById('pin-err').hidden = false;
        });
      });
      return;
    }
    var date = dateParam || today();
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 사장 점검표</div><h1>📋 사장 점검표</h1>';
    h += '<div class="date-nav"><a class="btn" href="#/owner?d=' + shiftDate(date, -1) + '">‹ 전날</a><strong>' + koDate(date) + (date === today() ? ' 오늘' : '') + '</strong><a class="btn" href="#/owner?d=' + shiftDate(date, 1) + '">다음날 ›</a></div>';
    h += '<div id="owner-body" class="muted">불러오는 중…</div>';
    h += '<p class="section-title">설정</p><a class="card link" href="#/owner-lists"><div class="title">매장·이름 목록 고치기</div><div class="sub">직원이 고르는 목록입니다</div></a>';
    if (!sbOn()) h += '<div class="save-note">서버 연결이 없어 이 폰의 기록만 보여요. config.js(열쇠)를 확인해 주세요.</div>';
    app.innerHTML = h;
    Promise.all([loadSettings(), fetchRunsForDate(date)]).then(function (r) {
      var s = r[0], runs = r[1] || [];
      function find(st, k) { return runs.filter(function (x) { return (x.store || '') === st && x.kind === k; })[0]; }
      // 등록된 매장 + 그날 기록에 있는 매장(등록 전 기록이나 이름이 바뀐 매장도 빠지지 않게)
      var storesToShow = s.stores.slice();
      runs.forEach(function (x) { var st = x.store || ''; if (storesToShow.indexOf(st) < 0) storesToShow.push(st); });
      if (!storesToShow.length) storesToShow = [''];
      var b = '';
      if (!s.stores.length || !s.staff.length) b += '<div class="save-note soft">' + (!s.stores.length ? '매장 이름이 아직 없어요. ' : '') + (!s.staff.length ? '직원 이름 목록이 아직 없어요. ' : '') + '아래 "매장·이름 목록 고치기"에서 등록해 주세요. (매장이 하나면 매장 이름 하나만 적으면 되고, 직원 화면에는 매장 선택이 나오지 않아요)</div>';
      // 위: 한눈에 보는 표 (상태 · 담당자 · 완료시간 · 미완료 개수 · 특이사항 표시)
      b += '<div class="owner-grid"><div class="og-head"></div><div class="og-head">☀️ 오픈</div><div class="og-head">🌙 마감</div>';
      storesToShow.forEach(function (st) {
        b += '<div class="og-store">' + esc(storeLabel(st)) + '</div>';
        ['open', 'close'].forEach(function (k) {
          var run = find(st, k), stt = runStatus(run, LISTS[k].items.length), miss = stt.total - stt.done;
          b += '<a class="og-cell ' + stt.cls + '" href="#d-' + encodeURIComponent(st) + '-' + k + '">' +
            '<span class="og-label">' + stt.label + '</span>' +
            (run ? '<span class="og-meta">' + esc(run.staff) + '</span><span class="og-meta">' + (run.completed_at ? hhmm(run.completed_at) : '완료 안 누름') + (miss ? ' · 미완료 ' + miss : ' · ' + stt.done + '/' + stt.total) + (run.note ? ' · 📝' : '') + '</span>' : '<span class="og-meta">기록 없음</span>') + '</a>';
        });
      });
      b += '</div>';
      // 아래: 기록마다 담당자·완료시간·상태·미완료 항목·특이사항 카드
      var anyRun = false;
      storesToShow.forEach(function (st) { ['open', 'close'].forEach(function (k) { var run = find(st, k); if (run) { anyRun = true; b += detailFor(run, k, st); } }); });
      if (!anyRun) b += '<div class="empty"><strong>' + koDate(date) + ' 기록이 없어요.</strong>직원이 체크를 시작하면 여기에 바로 나타납니다.</div>';
      document.getElementById('owner-body').innerHTML = b;
      app.querySelectorAll('.og-cell').forEach(function (cell) {
        cell.addEventListener('click', function (e) { e.preventDefault(); var id = cell.getAttribute('href').slice(1); var el = document.getElementById(id); if (el) { el.classList.add('hl'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      });
    });
    function detailFor(run, k, st) {
      var items = LISTS[k].items, stt = runStatus(run, items.length), missing = [];
      items.forEach(function (t, i) { if (!run.items[String(i)]) missing.push(t); });
      var d = '<div class="card detail" id="d-' + encodeURIComponent(st) + '-' + k + '">';
      d += '<div class="title">' + esc(storeLabel(st)) + ' · ' + KIND_LABEL[k] + ' <span class="pill ' + stt.cls + '">' + stt.label + '</span></div>';
      d += '<table class="kv"><tr><th>담당자</th><td>' + esc(run.staff) + '</td></tr>';
      d += '<tr><th>완료시간</th><td>' + (run.completed_at ? hhmm(run.completed_at) + (run.first_completed_at && run.first_completed_at !== run.completed_at ? ' <span class="muted small">(처음 제출 ' + hhmm(run.first_completed_at) + ')</span>' : '') : '<span class="warn">완료 제출 안 함</span>') + '</td></tr>';
      d += '<tr><th>체크</th><td>' + stt.done + '/' + stt.total + (run.updated_at ? ' <span class="muted small">(마지막 ' + hhmm(run.updated_at) + ')</span>' : '') + '</td></tr>';
      d += '<tr><th>미완료 항목</th><td>' + (missing.length ? '<ul class="miss-list">' + missing.map(function (t) { return '<li>⬜ ' + esc(t) + '</li>'; }).join('') + '</ul>' : '<span class="ok-text">없음 — 모두 체크됨</span>') + '</td></tr>';
      d += '<tr><th>특이사항</th><td>' + (run.note ? esc(run.note).replace(/\n/g, '<br>') : '<span class="muted">없음</span>') + '</td></tr></table>';
      d += '<details class="times"><summary>항목별 체크 시각</summary><ul class="detail-list">';
      items.forEach(function (t, i) { var at = run.items[String(i)]; d += '<li class="' + (at ? 'ok' : 'miss') + '">' + (at ? '✅ ' + hhmm(at) : '⬜ 빠짐') + ' · ' + esc(t) + '</li>'; });
      d += '</ul></details></div>';
      return d;
    }
  }
  function viewOwnerLists() {
    if (!ownerOk()) { location.hash = '#/owner'; return; }
    app.innerHTML = '<div class="crumb"><a href="#/owner">사장 점검표</a> › 목록</div><h1>매장·이름 목록</h1><div class="muted">불러오는 중…</div>';
    loadSettings().then(function (s) {
      var h = '<div class="crumb"><a href="#/owner">사장 점검표</a> › 목록</div><h1>매장·이름 목록</h1><p class="muted">한 줄에 하나씩. 실명 대신 별칭(알바 A 등)을 써도 됩니다.</p>';
      h += '<label class="field">매장 (지점) <span class="muted small">— 하나뿐이면 하나만. 두 개 이상일 때만 직원 화면에 매장 선택이 나와요</span><textarea id="stores" rows="4" placeholder="예: 본점">' + esc(s.stores.join('\n')) + '</textarea></label>';
      h += '<label class="field">직원 이름 <span class="muted small">— 비워 두면 직원이 직접 이름을 적습니다</span><textarea id="staff" rows="6" placeholder="예: 알바 A">' + esc(s.staff.join('\n')) + '</textarea></label>';
      h += '<button type="button" class="btn primary wide" id="lists-save">저장</button><p id="lists-note" class="muted small"></p>';
      h += '<p class="section-title">사장님 번호(PIN) 바꾸기</p><div class="card"><p class="muted small">점검표를 여는 숫자예요. 처음 값은 ' + (s.owner_pin_hash ? '이미 바꿨습니다' : '설치할 때 정한 값(기본 0000)') + '. 바꾼 번호는 서버에 암호화(해시)해서 저장됩니다.</p>';
      h += '<label class="field">새 번호 (숫자 4~8자리)<input type="password" inputmode="numeric" maxlength="8" id="pin1" class="text-input" autocomplete="new-password"></label>';
      h += '<label class="field">한 번 더<input type="password" inputmode="numeric" maxlength="8" id="pin2" class="text-input" autocomplete="new-password"></label>';
      h += '<button type="button" class="btn wide" id="pin-save">번호 바꾸기</button><p id="pin-note" class="muted small"></p></div>';
      app.innerHTML = h;
      document.getElementById('pin-save').addEventListener('click', function () {
        var p1 = document.getElementById('pin1').value.trim(), p2 = document.getElementById('pin2').value.trim(), n = document.getElementById('pin-note');
        if (!/^\d{4,8}$/.test(p1)) { n.textContent = '숫자 4~8자리로 넣어 주세요.'; return; }
        if (p1 !== p2) { n.textContent = '두 번 넣은 번호가 달라요.'; return; }
        sha256(p1).then(function (hsh) {
          if (!hsh) { n.textContent = '이 브라우저에서는 바꿀 수 없어요 (https 주소에서 해 주세요).'; return; }
          return saveSetting('owner_pin_hash', hsh).then(function () { n.textContent = '바꿨어요. 다음부터 새 번호로 여세요.'; document.getElementById('pin1').value = ''; document.getElementById('pin2').value = ''; });
        }).catch(function (e) { n.textContent = '저장 안 됨: ' + e.message; });
      });
      document.getElementById('lists-save').addEventListener('click', function () {
        function lines(id) { return document.getElementById(id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
        var st = lines('stores'), sf = lines('staff');
        store.del('me');
        Promise.all([saveSetting('stores', st), saveSetting('staff', sf)]).then(function () { document.getElementById('lists-note').textContent = '저장했어요.'; }, function (e) { document.getElementById('lists-note').textContent = '저장 안 됨: ' + e.message; });
      });
    });
  }

  // v1 화면들 (장 상세·검색·교육표·확인 필요)
  function viewChapter(num, hl) {
    var ch = book.chapters.filter(function (x) { return x.num === num; })[0];
    if (!ch) { app.innerHTML = empty('없는 장이에요.', '목차에서 다시 골라 주세요.'); return; }
    var idx = book.chapters.indexOf(ch), prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    var boxes = ch.lines.filter(function (l) { return /^[-*]\s+\[[ xX]\]/.test(l); }).length;
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › ' + ch.num + '장</div><h1>' + ch.num + '장. ' + esc(ch.name) + '</h1>';
    if (boxes) h += '<div class="chapter-tools"><span class="badge ok" id="ch-progress"></span><button class="btn danger" id="ch-reset">오늘 체크 지우기</button></div>';
    h += '<div class="content" id="content">' + renderBlocks(ch.lines, { num: ch.num }) + '</div>';
    h += '<div class="grid2" style="margin-top:20px">' + (prev ? '<a class="big-btn soft" href="#/ch/' + prev.num + '">‹ ' + prev.num + '장 ' + esc(prev.name) + '</a>' : '<span></span>') + (next ? '<a class="big-btn soft" href="#/ch/' + next.num + '">' + next.num + '장 ' + esc(next.name) + ' ›</a>' : '<span></span>') + '</div>';
    app.innerHTML = h;
    var inputs = app.querySelectorAll('input[data-key]');
    function refresh() { var done = 0; inputs.forEach(function (inp) { if (inp.checked) done++; }); var p = document.getElementById('ch-progress'); if (p) p.textContent = '오늘 체크 ' + done + '/' + inputs.length; }
    inputs.forEach(function (inp) { inp.addEventListener('change', function () { store.set(inp.dataset.key, inp.checked ? '1' : '0'); inp.closest('li').classList.toggle('done', inp.checked); refresh(); }); });
    var r = document.getElementById('ch-reset');
    if (r) r.addEventListener('click', function () { if (!confirm('오늘 이 장에서 체크한 것을 모두 지울까요?')) return; inputs.forEach(function (inp) { inp.checked = false; store.del(inp.dataset.key); inp.closest('li').classList.remove('done'); }); refresh(); });
    refresh();
    if (hl !== undefined) { var el = app.querySelector('[data-line="' + hl + '"]'); if (el) { el.classList.add('hl'); setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); } }
  }
  function viewTraining() {
    var rows = trainingRows(book);
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 신입 교육표</div><h1>🎓 신입 교육표</h1><p class="muted">그날 읽을 장을 누르고, 다 읽으면 "읽었어요"에 체크하세요. 관리자 확인은 사수에게 말로 받으세요.</p>';
    if (!rows.length) h += empty('교육표가 없어요.', '12장에 표가 있는지 확인해 주세요.');
    rows.forEach(function (r, i) {
      var key = 'train:' + i, on = store.get(key) === '1', links = '', seen = {};
      r.content.replace(/(\d+)장/g, function (all, n) { if (!seen[n]) { seen[n] = 1; links += '<a href="' + chapterLink(parseInt(n, 10)) + '">' + n + '장</a>'; } return all; });
      h += '<div class="card train-row"><div class="day">' + esc(r.day) + '</div><div>' + inline(r.content) + '</div><div class="links">' + links + '</div><label class="read"><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>읽었어요' + (on ? ' ✓' : '') + '</span></label><div class="admin">' + esc(r.confirm) + '</div></div>';
    });
    app.innerHTML = h;
    app.querySelectorAll('input[data-key]').forEach(function (inp) { inp.addEventListener('change', function () { store.set(inp.dataset.key, inp.checked ? '1' : '0'); inp.nextElementSibling.textContent = '읽었어요' + (inp.checked ? ' ✓' : ''); }); });
  }
  function viewTodo() {
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 확인 필요</div><h1>📝 확인 필요 ' + TODOS.length + '곳</h1><p class="muted">아직 매장 기준이 정해지지 않아 비워 둔 곳이에요.</p>';
    if (!TODOS.length) h += empty('확인 필요가 없어요.', '모든 항목이 채워졌습니다.');
    TODOS.forEach(function (t) { h += '<a class="card link result" href="#/ch/' + t.num + '?hl=' + t.line + '"><div class="where">' + t.num + '장 ' + esc(t.name) + '</div><div class="snip">' + inline(t.text) + '</div></a>'; });
    app.innerHTML = h;
  }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
  function viewSearch(q) {
    q = (q || '').trim();
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 검색</div>';
    if (!q) { h += empty('검색어를 넣어 주세요.', '예: 라벨, 냉동, 마감, 알레르기'); app.innerHTML = h; return; }
    var nq = norm(q), results = [];
    book.chapters.forEach(function (c) { c.lines.forEach(function (l, idx) { var p = plain(l); if (p && norm(p).indexOf(nq) >= 0) results.push({ num: c.num, name: c.name, line: idx, text: p }); }); });
    h += '<h1>"' + esc(q) + '" 검색 결과 ' + results.length + '건</h1>';
    if (!results.length) h += empty('찾는 내용이 없어요.', '사수나 사장님께 물어보세요. 다른 말로 다시 검색해 볼 수도 있어요.');
    results.forEach(function (r) {
      var text = esc(r.text), re = new RegExp(q.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'; }).join(''), 'i');
      text = text.replace(re, function (m0) { return '<mark>' + m0 + '</mark>'; });
      h += '<a class="card link result" href="#/ch/' + r.num + '?hl=' + r.line + '"><div class="where">' + r.num + '장 ' + esc(r.name) + '</div><div class="snip">' + text + '</div></a>';
    });
    app.innerHTML = h;
  }

  // ---------- 라우터 ----------
  function route() {
    var hash = location.hash || '#/', path = hash.slice(1), query = '', qi = path.indexOf('?');
    if (qi >= 0) { query = path.slice(qi + 1); path = path.slice(0, qi); }
    var params = {};
    query.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    var parts = path.split('/').filter(Boolean), input = document.getElementById('search-input');
    if (parts[0] !== 'search' && input) input.value = '';
    window.scrollTo(0, 0);
    if (!parts.length) return viewHome();
    if (parts[0] === 'ch') return viewChapter(parseInt(parts[1], 10), params.hl !== undefined ? parseInt(params.hl, 10) : undefined);
    if (parts[0] === 'check') return viewChecklist(parts[1] === 'close' ? 'close' : 'open');
    if (parts[0] === 'who') return viewWho(params.next);
    if (parts[0] === 'owner') return viewOwner(params.d, params.x);
    if (parts[0] === 'owner-lists') return viewOwnerLists();
    if (parts[0] === 'train') return viewTraining();
    if (parts[0] === 'todo') return viewTodo();
    if (parts[0] === 'search') { if (input) input.value = params.q || ''; return viewSearch(params.q); }
    viewHome();
  }
  document.getElementById('search-form').addEventListener('submit', function (e) { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(document.getElementById('search-input').value.trim()); });
  window.addEventListener('hashchange', route);
  (function inAppBanner() {
    var ua = navigator.userAgent || '', isKakao = /KAKAOTALK/i.test(ua), isOther = /Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua);
    if (!isKakao && !isOther) return;
    var url = location.href.split('#')[0], bar = document.createElement('div');
    bar.className = 'inapp-banner';
    bar.innerHTML = '<span>앱 안 브라우저예요. 체크는 서버에 남지만 더 편하게 쓰려면</span>' + (isKakao ? '<a href="kakaotalk://web/openExternal?url=' + encodeURIComponent(url) + '">브라우저로 열기</a>' : '<span>메뉴에서 "브라우저로 열기"</span>');
    document.body.insertBefore(bar, document.body.firstChild);
  })();
  if (!book.chapters.length) app.innerHTML = empty('내용을 불러오지 못했어요.', 'content.js 가 같은 폴더에 있는지 확인해 주세요.');
  else route();
})();
