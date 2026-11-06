/* 떡기리 신입직원 교육 온라인북 v3 (다점포)
 * v1 = 12장 매뉴얼·검색·체크리스트(폰 저장)·교육표·확인 필요
 * v2 = 체크리스트를 서버(Supabase)에 저장 + 사장 점검표
 * v3 = 지점 전용 링크(#/s/코드)로 들어와 이름만 고름. 앱은 표를 직접 읽지 않고 "지점 코드를 받는 서버 함수"만 부른다.
 *      매뉴얼 = 본사 공통(DB) + 우리 지점 추가사항(DB). 점주 화면(#/owner) = 코드+PIN → 토큰 → 이 지점만. 본사 화면은 4단계.
 * - 서버 열쇠는 config.js (make-config.js 가 .env.local / 환경변수에서 만듦).
 * - 빌드 도구 없음.
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
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(); }
  function shiftDate(s, days) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2] + days); return dateStr(d); }
  function hhmm(iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function koDate(s) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return +p[1] + '/' + +p[2] + ' (' + '일월화수목금토'[d.getDay()] + ')'; }

  // ---------- 서버 (Supabase, 서버 함수만 호출) ----------
  var SB = window.SB || {};
  function sbOn() { return !!(SB.url && SB.anon); }
  function rpc(name, args) {
    var headers = { 'apikey': SB.anon, 'Authorization': 'Bearer ' + SB.anon, 'Content-Type': 'application/json' };
    return fetch(SB.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); }); return r.text().then(function (t) { return t ? JSON.parse(t) : null; }); });
  }
  // 지점 코드: 링크(#/s/코드)에서 한 번 받아 이 폰에 기억. 직원이 직접 입력하지 않는다.
  var CODE = (store.get('store_code') || '').toUpperCase();
  function codeFromHash() { var m = (location.hash || '').match(/^#\/s\/([A-Za-z0-9]{4,12})/); return m ? m[1].toUpperCase() : null; }
  var settingsCache = null;
  function emptyBundle() { return { store: null, stores: [], staff: [], staff_meta: {}, products: [], store_items: {}, notes: [], manual: [] }; }
  function shapeBundle(b) {
    if (!b || !b.store) return emptyBundle();
    var name = b.store.name || '', s = { store: b.store, stores: [name], staff: [], staff_meta: {}, products: (b.settings && b.settings.products) || [], store_items: {}, notes: b.notes || [], manual: b.manual || [], info: (b.settings && b.settings.info) || {} };
    (b.staff || []).forEach(function (x) { s.staff.push(x.name); s.staff_meta[x.name] = { hire_on: x.hire_on || '', store: name, id: x.id }; });
    s.store_items[name] = (b.settings && b.settings.extra_items) || { open: [], close: [] };
    return s;
  }
  // 이름은 v2 와 같게 두어 아래 화면 코드가 그대로 돈다. 내용 = 이 지점 것만.
  function loadSettings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    var cached = null; try { cached = JSON.parse(store.get('bundle:' + CODE) || 'null'); } catch (e) {}
    if (!sbOn() || !CODE) { settingsCache = cached || emptyBundle(); return Promise.resolve(settingsCache); }
    return rpc('staff_bundle', { p_code: CODE }).then(function (b) {
      var s = shapeBundle(b);
      if (!s.store) { store.del('bundle:' + CODE); settingsCache = s; return s; }
      settingsCache = s; store.set('bundle:' + CODE, JSON.stringify(s)); return s;
    }).catch(function () { settingsCache = cached || emptyBundle(); settingsCache.offline = true; return settingsCache; });
  }
  // 체크 항목 = 공통(본사 매뉴얼 요약본) + 지점 추가 항목(점주가 등록). 지점 항목은 공통 뒤에 이어 붙는다.
  // 주기 표시: 항목 끝에 "(매주 월)", "(매주 월·목)", "(매월 1일)", "(격주 월)" 처럼 쓰면 그날에만 보인다. 없으면 매일.
  var DOW = '일월화수목금토';
  function scheduledOn(text, dateS) {
    var m = text.match(/\((매주|격주|매월)\s*([^)]*)\)\s*$/);
    if (!m) return true;
    var p = dateS.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (m[1] === '매월') { var day = parseInt(m[2], 10); return !isNaN(day) && d.getDate() === day; }
    var days = m[2].replace(/요일/g, '').split(/[·,\s\/]+/).filter(Boolean).map(function (x) { return DOW.indexOf(x[0]); }).filter(function (i) { return i >= 0; });
    if (!days.length || days.indexOf(d.getDay()) < 0) return false;
    if (m[1] === '격주') { var week = Math.floor((Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000 + 4) / 7); return week % 2 === 0; }
    return true;
  }
  function itemsFor(s, storeName, kind, dateS) {
    var si = s.store_items || {}, entry = si[storeName || ''] || si[s.stores[0] || ''];
    var extra = ((entry && entry[kind]) || []).filter(function (t) { return scheduledOn(t, dateS || today()); });
    return { common: LISTS[kind].items, extra: extra, all: LISTS[kind].items.concat(extra) };
  }
  // ---------- 신입 교육 진도 (서버) ----------
  var STEPS = []; // trainingRows 로 채움
  function fetchTraining(staffName) {
    if (!sbOn()) { var v = store.get('train:' + staffName); try { return Promise.resolve(v ? JSON.parse(v) : []); } catch (e) { return Promise.resolve([]); } }
    return rpc('get_training', { p_code: CODE, p_staff: staffName }).then(function (rows) { return rows || []; }).catch(function () { return []; });
  }
  function saveTraining(row) {
    if (!sbOn()) {
      var k = 'train:' + row.staff, arr = []; try { arr = JSON.parse(store.get(k) || '[]'); } catch (e) {}
      arr = arr.filter(function (x) { return x.step !== row.step; }); arr.push(row); store.set(k, JSON.stringify(arr)); return Promise.resolve({ ok: true, local: true });
    }
    return rpc('save_training', { p_code: CODE, p_staff: row.staff, p_step: row.step, p_read_at: row.read_at, p_confirmed_at: row.confirmed_at || null }).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, error: e.message }; });
  }
  function daysSince(hireOn) { if (!hireOn) return null; var p = hireOn.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return Math.floor((new Date() - d) / 86400000) + 1; }
  function storeLabel(s) { return s ? s : '매장'; }
  // v3: 링크 하나 = 지점 하나. 매장 고르기는 없다.
  function singleStore(settings) { return settings.stores[0] || ''; }
  function runKey(date, storeName, kind) { return 'run:' + date + ':' + storeName + ':' + kind; }
  function localRun(date, storeName, kind) { var v = store.get(runKey(date, storeName, kind)); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  function saveLocalRun(run) { store.set(runKey(run.run_date, run.store, run.kind), JSON.stringify(run)); }
  function fetchRun(date, storeName, kind) {
    if (!sbOn()) return Promise.resolve(localRun(date, storeName, kind));
    return rpc('get_run', { p_code: CODE, p_date: date, p_kind: kind })
      .then(function (r) { if (r) saveLocalRun(r); return r; })
      .catch(function () { return localRun(date, storeName, kind); });
  }
  function fetchRunsForDate(date) {
    if (!sbOn()) {
      var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('run:' + date + ':') === 0) out.push(JSON.parse(localStorage.getItem(k))); } } catch (e) {}
      return Promise.resolve(out);
    }
    return rpc('runs_for_date', { p_code: CODE, p_date: date }).then(function (rows) { return rows || []; });
  }
  // 저장: 서버 먼저, 실패하면 폰에만 두고 알림
  function saveRun(run) {
    run.updated_at = new Date().toISOString();
    saveLocalRun(run);
    if (!sbOn()) return Promise.resolve({ ok: true, local: true });
    var args = { p_code: CODE, p_date: run.run_date, p_kind: run.kind, p_staff: run.staff, p_items: run.items, p_total: run.total, p_done: run.done_count, p_note: run.note || '', p_waste: run.waste || {}, p_first: run.first_completed_at || null, p_completed: run.completed_at || null };
    return rpc('save_run', args)
      .then(function (row) { if (row && row.id) { run.id = row.id; saveLocalRun(run); } return { ok: true }; })
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
      if (l.indexOf(NOTE_MARK) === 0) {
        var nd = null; try { nd = JSON.parse(l.slice(NOTE_MARK.length)); } catch (e) {}
        if (nd) html += '<div class="store-note"><div class="store-note-title">📍 우리 지점 추가사항</div>' + renderBlocks(nd.body.replace(/\r\n?/g, '\n').split('\n'), { num: ctx.num + 'n' + nd.k }) + '</div>';
        i++; continue;
      }
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

  var DEMO = false; // v3 에는 데모판 없음 (데모 사이트는 v2 코드)

  // ---------- 화면 ----------
  var book = { chapters: [], appendix: [] }, LISTS = { open: { items: [] }, close: { items: [] } }, TODOS = [];
  var KIND_LABEL = { open: '오픈', close: '마감' };
  var app = document.getElementById('app');
  // 본사 공통 매뉴얼(DB 조각들) → content.md 와 같은 마크다운으로 합쳐 v1 파서 재사용. DB가 비면 content.js 로.
  function buildBookMd(manual) {
    if (!manual || !manual.length) return window.BOOK_MD || '';
    var intro = manual.filter(function (p) { return p.section_kind === 'intro'; }).map(function (p) { return p.body_md; }).join('\n');
    var chapters = manual.filter(function (p) { return p.section_kind === 'chapter'; }).map(function (p) { return '## ' + p.title + '\n' + p.body_md; }).join('\n\n');
    var appendix = manual.filter(function (p) { return p.section_kind === 'appendix'; }).map(function (p) { return '## ' + p.title + '\n' + p.body_md; }).join('\n\n');
    return intro + '\n\n' + chapters + '\n\n# 별도 출력물\n\n' + appendix + '\n';
  }
  function setBook(s) {
    book = parseBook(buildBookMd(s && s.manual));
    LISTS = { open: checklistItems(findAppendix(book, '②')), close: checklistItems(findAppendix(book, '③')) };
    TODOS = todoItems(book);
    STEPS = trainingRows(book);
  }
  // 우리 지점 추가사항을 공통 본문의 "장 + 소제목" 아래에 끼워 넣는다. 소제목을 못 찾으면 장 맨 끝.
  var NOTE_MARK = '\u0001NOTE\u0001';
  function linesWithNotes(ch, s) {
    var notes = ((s && s.notes) || []).filter(function (n) { return n.chapter_no === ch.num; });
    if (!notes.length) return ch.lines;
    var out = ch.lines.slice(), tail = [];
    notes.forEach(function (n, k) {
      var mark = NOTE_MARK + JSON.stringify({ k: k, body: n.body_md || '' });
      var key = n.section_key ? plain(n.section_key) : '', idx = -1, i;
      if (key) for (i = 0; i < out.length; i++) { if (isHeading(out[i]) && plain(out[i]) === key) { idx = i; break; } }
      if (idx < 0) { tail.push(mark); return; }
      var j = idx + 1; while (j < out.length && !isHeading(out[j]) && !/^-{3,}\s*$/.test(out[j])) j++;
      while (j > idx + 1 && out[j - 1].trim() === '') j--;
      out.splice(j, 0, mark);
    });
    return out.concat(tail);
  }
  function empty(title, sub) { return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(sub) + '</div>'; }
  function chapterLink(num) { var c = book.chapters.filter(function (x) { return x.num === num; })[0]; return c ? '#/ch/' + num : '#/'; }
  function me() { var v = store.get('me'); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  function runStatus(run, total) {
    if (!run) return { cls: 'none', label: '미완료', done: 0, total: total };
    var done = Object.keys(run.items || {}).length;
    if (run.completed_at) return { cls: 'done', label: '완료', done: done, total: run.total || total };
    return { cls: 'partial', label: '진행 중', done: done, total: run.total || total };
  }
  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function viewHome() {
    var m = me(), h = '';
    h += '<h1>무엇을 찾으세요?</h1>';
    h += '<div id="home-status" class="card status-card">' + (m ? '<div class="sub">' + (m.store ? esc(m.store) + ' · ' : '') + esc(m.staff) + ' <a href="#/who">바꾸기</a></div>' : '<div class="sub">아직 이름을 고르지 않았어요.</div><a class="btn primary" href="#/who">이름 고르기</a>') + '<div id="home-today" class="muted small">오늘 상태 불러오는 중…</div></div>';
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
    h += '<p class="section-title">점주님용</p><a class="card link" href="#/owner"><div class="title">📋 점주 화면</div><div class="sub">오늘 오픈·마감 점검, 직원·추가사항 관리 (PIN)</div></a>';
    app.innerHTML = h;
    // 오늘 매장별 오픈·마감 상태 (이름을 안 골랐어도 보임)
    Promise.all([loadSettings(), fetchRunsForDate(today())]).then(function (r) {
      var s = r[0], runs = r[1] || [], el = document.getElementById('home-today'); if (!el) return;
      var stores = s.stores.slice(); runs.forEach(function (x) { var st = x.store || ''; if (stores.indexOf(st) < 0) stores.push(st); });
      if (!stores.length) stores = [''];
      function find(st, k) { return runs.filter(function (x) { return (x.store || '') === st && x.kind === k; })[0]; }
      var html = '<div class="today-title">오늘 ' + koDate(today()) + '</div>';
      stores.forEach(function (st) {
        var o = runStatus(find(st, 'open'), itemsFor(s, st, 'open').all.length), c = runStatus(find(st, 'close'), itemsFor(s, st, 'close').all.length);
        var ro = find(st, 'open'), rc = find(st, 'close');
        html += '<div class="today-row"><span class="today-store">' + esc(storeLabel(st)) + '</span>' +
          '<span class="pill ' + o.cls + '">오픈 ' + o.label + (ro && ro.completed_at ? ' ' + hhmm(ro.completed_at) : (o.done ? ' ' + o.done + '/' + o.total : '')) + '</span>' +
          '<span class="pill ' + c.cls + '">마감 ' + c.label + (rc && rc.completed_at ? ' ' + hhmm(rc.completed_at) : (c.done ? ' ' + c.done + '/' + c.total : '')) + '</span></div>';
      });
      if (!sbOn()) html += '<div class="muted small">서버 연결 없음 — 이 폰에만 저장돼요</div>';
      else if (s.offline) html += '<div class="muted small">서버에 연결되지 않아 마지막으로 받은 내용을 보여 줘요</div>';
      el.className = ''; el.innerHTML = html;
      if (m) {
        var mo = runStatus(find(m.store || '', 'open'), itemsFor(s, m.store, 'open').all.length), mc = runStatus(find(m.store || '', 'close'), itemsFor(s, m.store, 'close').all.length);
        var ho = document.getElementById('home-open'); if (ho) ho.textContent = mo.label + (mo.done ? ' ' + mo.done + '/' + mo.total : '');
        var hc = document.getElementById('home-close'); if (hc) hc.textContent = mc.label + (mc.done ? ' ' + mc.done + '/' + mc.total : '');
      }
    });
  }

  // 매장·이름 고르기
  function viewWho(next) {
    var cur = me() || {};
    app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 이름</div><h1>누구세요?</h1><p class="muted">한 번 고르면 이 폰이 기억해요. 체크 기록에 이름이 남습니다.</p><div class="muted">불러오는 중…</div>';
    loadSettings().then(function (s) {
      var single = singleStore(s), multi = single === null;
      var h = '<div class="crumb"><a href="#/">첫 화면</a> › 이름</div><h1>누구세요?</h1><p class="muted"><strong>' + esc(single) + '</strong> · 한 번 고르면 이 폰이 기억해요. 체크 기록에 이름이 남습니다.</p>';
      if (multi) h += '<p class="section-title">매장</p><div class="choice" id="pick-store">' + s.stores.map(function (x) { return '<button type="button" class="choice-btn' + (cur.store === x ? ' on' : '') + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
      h += '<p class="section-title">이름</p>';
      // 직원에게 소속 매장이 있으면 고른 매장의 직원만 보여 준다 (소속 없는 이름은 늘 보임)
      function staffFor(storeName) { return s.staff.filter(function (x) { var st = (s.staff_meta || {})[x] && s.staff_meta[x].store; return !st || !storeName || st === storeName; }); }
      function staffButtons(storeName, chosen) { return staffFor(storeName).map(function (x) { return '<button type="button" class="choice-btn' + (chosen === x ? ' on' : '') + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') || '<span class="muted small">이 매장에 등록된 이름이 없어요. 사장님께 말씀해 주세요.</span>'; }
      if (s.staff.length) {
        h += '<div class="choice" id="pick-staff">' + (multi && !cur.store ? '<span class="muted small">먼저 매장을 골라 주세요.</span>' : staffButtons(multi ? cur.store : single, cur.staff)) + '</div>';
        h += '<p class="muted small">내 이름이 없으면 점주님께 말씀해 주세요 (점주 화면 → 직원에서 추가합니다).</p>';
      } else {
        h += '<input type="text" id="staff-text" class="text-input" placeholder="이름 또는 별칭 (예: 알바 A)" value="' + esc(cur.staff || '') + '" maxlength="20">';
        h += '<p class="muted small">아직 등록된 이름이 없어요. 점주님이 점주 화면 → 직원에서 이름을 등록하면 고를 수 있어요.</p>';
      }
      h += '<button type="button" class="btn primary wide" id="who-ok">이대로 시작</button>';
      app.innerHTML = h;
      var pick = { store: multi ? cur.store : single, staff: cur.staff };
      function bindStaff() {
        app.querySelectorAll('#pick-staff .choice-btn').forEach(function (b) {
          b.addEventListener('click', function () { pick.staff = b.dataset.v; app.querySelectorAll('#pick-staff .choice-btn').forEach(function (x) { x.classList.toggle('on', x === b); }); });
        });
      }
      app.querySelectorAll('#pick-store .choice-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          pick.store = b.dataset.v; app.querySelectorAll('#pick-store .choice-btn').forEach(function (x) { x.classList.toggle('on', x === b); });
          if (s.staff.length) { var ps = document.getElementById('pick-staff'); if (staffFor(pick.store).indexOf(pick.staff) < 0) pick.staff = null; ps.innerHTML = staffButtons(pick.store, pick.staff); bindStaff(); }
        });
      });
      bindStaff();
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
    var m = me(), next = '#/who?next=' + encodeURIComponent('#/check/' + kind);
    if (!m) { location.hash = next; return; }
    app.innerHTML = '<div class="muted">확인 중…</div>';
    // 이름 목록이 등록돼 있으면 목록에 있는 이름만, 매장이 여러 개면 등록된 매장만 허용. 아니면 다시 고르게 한다.
    loadSettings().then(function (s) {
      var single = singleStore(s);
      var homeStore = (s.staff_meta || {})[m.staff] && s.staff_meta[m.staff].store;
      var staffOk = (s.staff.length ? s.staff.indexOf(m.staff) >= 0 : !!m.staff) && (!homeStore || single !== null || homeStore === m.store);
      var storeOk = single === null ? s.stores.indexOf(m.store) >= 0 : true;
      if (!staffOk || !storeOk) { store.del('me'); location.hash = next; return; }
      if (single !== null && m.store !== single) { m.store = single; store.set('me', JSON.stringify(m)); }
      renderChecklist(kind, m, s);
    });
  }
  function renderChecklist(kind, m, s) {
    var lists = itemsFor(s, m.store, kind), src = { items: lists.all }, label = KIND_LABEL[kind], detail = kind === 'open' ? 4 : 10, date = today();
    var products = (kind === 'close') ? (s.products || []) : [], wasteOn = kind === 'close';
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
      body += '<div class="progress-row"><div id="cl-progress" style="font-weight:700"></div><span id="cl-save-status" class="save-status">' + (run.id ? '✓ 저장됨' : '') + '</span></div><div class="progress-bar"><div id="cl-bar" style="width:0"></div></div>';
      body += '<div id="cl-note" class="save-note" hidden></div>';
      body += '<ul class="checklist">';
      src.items.forEach(function (t, i) {
        var on = !!run.items[String(i)];
        if (i === lists.common.length) body += '<li class="list-sep">🏪 ' + esc(storeLabel(m.store)) + ' 항목</li>';
        body += '<li class="' + (on ? 'done' : '') + '"><label><input type="checkbox" data-i="' + i + '"' + (on ? ' checked' : '') + '><span>' + esc(t) + '</span><em class="when">' + (on ? hhmm(run.items[String(i)]) : '') + '</em></label></li>';
      });
      body += '</ul>';
      if (wasteOn) {
        run.waste = run.waste || {};
        body += '<div class="card waste"><div class="title">🗑️ 오늘 폐기 <span id="waste-sum" class="muted small"></span></div>';
        body += '<p class="muted small">' + (products.length ? '폐기가 있었던 떡만 눌러서 개수를 적어 주세요. 하나도 없으면 "오늘 폐기 없음".' : '폐기한 떡 이름을 적고 "추가"를 누른 뒤 개수를 맞춰 주세요. 하나도 없으면 "오늘 폐기 없음".') + '</p>';
        if (products.length) body += '<div class="choice" id="waste-pick">' + products.map(function (p) { return '<button type="button" class="choice-btn' + (run.waste[p] > 0 ? ' on' : '') + '" data-p="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';
        body += '<div class="waste-add"><input type="text" id="waste-new" class="text-input" placeholder="' + (products.length ? '목록에 없는 떡 이름' : '떡 이름 (예: 인절미)') + '" maxlength="30"><button type="button" class="btn" id="waste-add">추가</button></div>';
        body += '<div id="waste-rows"></div>';
        body += '<button type="button" class="btn' + (run.waste._none ? ' primary' : '') + '" id="waste-none">' + (run.waste._none ? '✓ 오늘 폐기 없음' : '오늘 폐기 없음') + '</button>';
        if (!products.length) body += '<p class="muted small" style="margin-top:8px">사장님께: 점검표 → 목록에서 떡 종류를 등록하면 직원이 버튼으로 고를 수 있어요.</p>';
        body += '</div>';
      }
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
        saving(); noteTimer = setTimeout(function () { saveRun(run).then(note); }, 800);
      });
      var saveTimer = null;
      function saving() {
        var s = document.getElementById('cl-save-status'); if (!s) return;
        s.className = 'save-status'; s.textContent = '저장 중…';
      }
      function note(res) {
        var n = document.getElementById('cl-note'), s = document.getElementById('cl-save-status');
        if (res.ok && res.local && DEMO) { n.hidden = true; if (s) { s.className = 'save-status ok'; s.textContent = '✓ 저장됨 (데모)'; } return; }
        if (res.ok && !res.local) {
          n.hidden = true;
          if (s) { s.className = 'save-status ok'; s.textContent = '✓ 서버에 저장됨 ' + hhmm(new Date().toISOString()); clearTimeout(saveTimer); saveTimer = setTimeout(function () { s.textContent = '✓ 저장됨'; }, 3000); }
          return;
        }
        if (s) { s.className = 'save-status err'; s.textContent = res.local ? '이 폰에만 저장됨' : '❌ 저장 안 됨'; }
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
          saving(); saveRun(run).then(note);
        });
      });
      // 폐기 입력 (마감 때 항상. 떡 목록이 있으면 버튼으로, 없으면 이름을 직접 적어서)
      if (wasteOn) {
        var wasteTimer = null;
        function wasteSave() { saving(); clearTimeout(wasteTimer); wasteTimer = setTimeout(function () { run.staff = m.staff; saveRun(run).then(note); }, 500); }
        function wasteCount() { return Object.keys(run.waste).filter(function (k) { return k !== '_none' && run.waste[k] > 0; }); }
        function renderWaste() {
          var keys = wasteCount(), rows = document.getElementById('waste-rows'), sum = document.getElementById('waste-sum'), noneBtn = document.getElementById('waste-none');
          rows.innerHTML = keys.map(function (p) { return '<div class="waste-row"><span class="waste-name">' + esc(p) + '</span><button type="button" class="step" data-p="' + esc(p) + '" data-d="-1">−</button><strong class="waste-n">' + run.waste[p] + '</strong><button type="button" class="step" data-p="' + esc(p) + '" data-d="1">+</button></div>'; }).join('');
          var total = keys.reduce(function (a, p) { return a + run.waste[p]; }, 0);
          sum.textContent = keys.length ? '— ' + keys.length + '종 ' + total + '개' : (run.waste._none ? '— 없음' : '— 아직 입력 안 함');
          noneBtn.className = 'btn' + (run.waste._none ? ' primary' : ''); noneBtn.textContent = run.waste._none ? '✓ 오늘 폐기 없음' : '오늘 폐기 없음';
          app.querySelectorAll('#waste-pick .choice-btn').forEach(function (b) { b.classList.toggle('on', run.waste[b.dataset.p] > 0); });
          rows.querySelectorAll('.step').forEach(function (b) {
            b.addEventListener('click', function () { var p = b.dataset.p, v = (run.waste[p] || 0) + parseInt(b.dataset.d, 10); if (v <= 0) delete run.waste[p]; else run.waste[p] = v; delete run.waste._none; renderWaste(); wasteSave(); });
          });
        }
        app.querySelectorAll('#waste-pick .choice-btn').forEach(function (b) {
          b.addEventListener('click', function () { var p = b.dataset.p; if (run.waste[p] > 0) delete run.waste[p]; else run.waste[p] = 1; delete run.waste._none; renderWaste(); wasteSave(); });
        });
        function addTyped() {
          var inp = document.getElementById('waste-new'), p = inp.value.trim().replace(/\s+/g, ' ');
          if (!p) { inp.focus(); return; }
          if (p === '_none') return;
          run.waste[p] = (run.waste[p] || 0) + 1; delete run.waste._none; inp.value = ''; renderWaste(); wasteSave();
        }
        document.getElementById('waste-add').addEventListener('click', addTyped);
        document.getElementById('waste-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });
        document.getElementById('waste-none').addEventListener('click', function () {
          if (wasteCount().length && !confirm('적어 둔 폐기 개수를 지우고 "폐기 없음"으로 할까요?')) return;
          run.waste = { _none: true }; renderWaste(); wasteSave();
        });
        renderWaste();
      }
      document.getElementById('cl-complete').addEventListener('click', function () {
        var done = Object.keys(run.items).length;
        if (wasteOn) {
          var hasWaste = Object.keys(run.waste || {}).some(function (k) { return k === '_none' || run.waste[k] > 0; });
          if (!hasWaste) { alert('오늘 폐기 수량을 아직 적지 않았어요.\n폐기가 있으면 떡 이름과 개수를 적고, 없으면 "오늘 폐기 없음"을 눌러 주세요.'); document.querySelector('.waste').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        }
        if (done < run.total && !confirm((run.total - done) + '개가 아직 체크 안 됐어요. 그래도 ' + label + ' 완료로 저장할까요?')) return;
        var now = new Date().toISOString();
        if (!run.first_completed_at) run.first_completed_at = now;
        run.completed_at = now; run.staff = m.staff; run.note = document.getElementById('cl-note-text').value;
        refresh();
        saving(); saveRun(run).then(function (res) { note(res); if (res.ok) window.scrollTo(0, 0); });
      });
      document.getElementById('cl-reset').addEventListener('click', function () {
        if (!confirm('오늘 ' + storeLabel(run.store) + ' ' + label + ' 체크를 모두 지울까요? (완료 표시도 지워져요)')) return;
        run.items = {}; run.completed_at = null; run.first_completed_at = null; run.waste = {};
        inputs.forEach(function (inp) { inp.checked = false; inp.closest('li').classList.remove('done'); inp.closest('li').querySelector('.when').textContent = ''; });
        refresh(); saving(); saveRun(run).then(function (res) { note(res); if (wasteOn) renderChecklist(kind, m, s); });
      });
      refresh();
    });
  }

  // ---------- 점주 화면 (3단계) ----------
  // 로그인 = 지점 코드(링크에 든 것) + PIN → 서버가 준 토큰(12시간)을 이 브라우저 탭에만 보관.
  // 점주 함수는 전부 토큰으로 "이 지점" 것만 읽고 쓴다. 다른 지점 데이터는 화면 어디에도 오지 않는다.
  var OWNER_ERR = [
    ['wrong pin', '번호가 달라요.'], ['locked', '5번 틀려서 10분 동안 잠겼어요. 잠시 뒤 다시 해 주세요.'],
    ['session expired', '시간이 지나 번호를 다시 넣어야 해요.'], ['duplicate name', '같은 이름이 이미 있어요.'],
    ['name required', '이름을 적어 주세요.'], ['name too long', '이름이 너무 길어요 (20자까지).'], ['body required', '내용을 적어 주세요.'],
    ['pin must be 6 digits', '새 번호는 숫자 6자리여야 해요.'], ['name used by another store', '다른 지점에 같은 이름의 직원이 있어 교육 기록을 나눌 수 없어요. 본사에 알려 주세요.'],
    ['store not found', '이 링크의 매장을 찾지 못했어요.'], ['Failed to fetch', '인터넷 연결을 확인해 주세요.']
  ];
  function ownerMsg(e) { var m = (e && e.message) || String(e); for (var i = 0; i < OWNER_ERR.length; i++) if (m.indexOf(OWNER_ERR[i][0]) >= 0) return OWNER_ERR[i][1]; return '저장 안 됨 (' + m.slice(0, 80) + ')'; }
  function ownerToken() { return session.get('owner_token') || ''; }
  function ownerOut() { session.del('owner_token'); session.del('owner_store'); ownerCache = null; }
  function ownerRpc(name, args) {
    args = args || {}; args.p_token = ownerToken();
    return rpc(name, args).catch(function (e) { if (/session expired/.test(e.message || '')) ownerOut(); throw e; });
  }
  var ownerCache = null; // owner_bundle (이 지점: 직원·설정·추가사항·교육 진도)
  function loadOwner(force) {
    if (ownerCache && !force) return Promise.resolve(ownerCache);
    return ownerRpc('owner_bundle').then(function (b) { ownerCache = b; return b; });
  }
  // 점주가 무언가 바꾸면 직원 화면용 묶음도 다시 받게 한다
  function ownerChanged() { ownerCache = null; settingsCache = null; store.del('bundle:' + CODE); }
  function isHeading(l) { return /^\*\*[^*]+\*\*/.test(l) || /^#{1,6}\s/.test(l); }
  function sectionHeads(ch) { var out = []; (ch ? ch.lines : []).forEach(function (l) { if (isHeading(l)) { var p = plain(l); if (p && out.indexOf(p) < 0) out.push(p); } }); return out; }
  function copyText(t, btn) {
    function done() { var o = btn.textContent; btn.textContent = '✓ 복사됨'; setTimeout(function () { btn.textContent = o; }, 1500); }
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { alert('복사가 안 돼요. 글자를 길게 눌러 복사해 주세요.'); } document.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  }
  function staffLink() { return location.origin + location.pathname + '#/s/' + CODE; }
  var OWNER_TABS = [['', '📋 오늘 점검'], ['staff', '👥 직원관리'], ['notes', '📍 우리 지점 추가사항'], ['settings', '⚙️ 설정']];

  function viewOwner(sub, params) {
    sub = sub || ''; params = params || {};
    if (sub === 'items' || sub === 'link') sub = 'settings';
    var s = settingsCache || emptyBundle(), name = singleStore(s) || '매장';
    if (!ownerToken()) return viewOwnerLogin(name, sub, params);
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 점주</div><h1>' + esc(name) + ' <span class="muted" style="font-size:15px;font-weight:600">점주 화면</span></h1>';
    h += '<nav class="owner-tabs">' + OWNER_TABS.map(function (t) { return '<a href="#/owner' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === sub ? ' class="on"' : '') + '>' + t[1] + '</a>'; }).join('') + '</nav>';
    h += '<div id="owner-body" class="muted">불러오는 중…</div>';
    app.innerHTML = h;
    var body = document.getElementById('owner-body');
    function fail(e) { body.className = ''; body.innerHTML = '<div class="save-note">' + esc(ownerMsg(e)) + '</div>' + (!ownerToken() ? '<a class="btn primary" href="#/owner">다시 열기</a>' : ''); }
    try {
      if (sub === 'staff') ownerStaff(body).catch(fail);
      else if (sub === 'notes') ownerNotes(body).catch(fail);
      else if (sub === 'items' || sub === 'link') { location.hash = '#/owner/settings'; return; }
      else if (sub === 'settings') ownerSettings(body);
      else ownerChecklist(body, params.d || today()).catch(fail);
    } catch (e) { fail(e); }
  }
  function viewOwnerLogin(name, sub, params) {
    app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 점주</div><h1>📋 점주 화면</h1><p class="muted"><strong>' + esc(name) + '</strong> 점주님 번호(PIN)를 넣어 주세요.</p>' +
      '<form id="pin-form" class="pin-form"><input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="pin" autocomplete="off" aria-label="점주 번호"><button class="btn primary" type="submit" id="pin-go">열기</button></form><p id="pin-err" class="warn" hidden></p>' +
      '<p class="muted small">직원분은 첫 화면에서 이름만 고르면 돼요. 이 화면은 점주님만 씁니다. 번호를 잊으셨으면 본사에 말씀해 주세요.</p>';
    document.getElementById('pin').focus();
    document.getElementById('pin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = document.getElementById('pin').value.trim(), err = document.getElementById('pin-err'), btn = document.getElementById('pin-go');
      if (!/^\d{4,8}$/.test(pin)) { err.hidden = false; err.textContent = '숫자로 넣어 주세요.'; return; }
      btn.disabled = true; btn.textContent = '확인 중…'; err.hidden = true;
      rpc('owner_login', { p_code: CODE, p_pin: pin }).then(function (r) {
        session.set('owner_token', r.token); session.set('owner_store', JSON.stringify(r.store || {})); ownerCache = null;
        viewOwner(sub, params);
      }).catch(function (e) { btn.disabled = false; btn.textContent = '열기'; err.hidden = false; err.textContent = ownerMsg(e); document.getElementById('pin').value = ''; });
    });
  }

  // 점검표: 날짜별 오픈·마감 상태 · 담당자 · 완료시간 · 미완료 항목 · 특이사항 · 폐기
  function ownerChecklist(body, date) {
    var h = '<div class="date-nav"><a class="btn" href="#/owner?d=' + shiftDate(date, -1) + '">‹ 전날</a><strong>' + koDate(date) + (date === today() ? ' 오늘' : '') + '</strong>' + (date < today() ? '<a class="btn" href="#/owner?d=' + shiftDate(date, 1) + '">다음날 ›</a>' : '<a class="btn" href="#/owner">오늘</a>') + '</div><div id="oc-body" class="muted">불러오는 중…</div>';
    body.className = ''; body.innerHTML = h;
    return Promise.all([loadSettings(), fetchRunsForDate(date), loadOwner()]).then(function (r) {
      var s = r[0], runs = r[1] || [], st = singleStore(s) || '';
      function find(k) { return runs.filter(function (x) { return x.kind === k; })[0]; }
      var b = '<div class="owner-grid two"><div class="og-head">☀️ 오픈</div><div class="og-head">🌙 마감</div>';
      ['open', 'close'].forEach(function (k) {
        var run = find(k), stt = runStatus(run, itemsFor(s, st, k, date).all.length), miss = stt.total - stt.done;
        b += '<a class="og-cell ' + stt.cls + '" href="#d-' + k + '"><span class="og-label">' + stt.label + '</span>' +
          (run ? '<span class="og-meta">' + esc(run.staff) + '</span><span class="og-meta">' + (run.completed_at ? hhmm(run.completed_at) : '완료 안 누름') + (miss ? ' · 미완료 ' + miss : ' · ' + stt.done + '/' + stt.total) + (run.note ? ' · 📝' : '') + '</span>' : '<span class="og-meta">기록 없음</span>') + '</a>';
      });
      b += '</div>';
      var any = false;
      ['open', 'close'].forEach(function (k) { var run = find(k); if (run) { any = true; b += ownerDetail(run, k, st, s, date); } });
      if (!any) b += '<div class="empty"><strong>' + koDate(date) + ' 기록이 없어요.</strong>직원이 체크를 시작하면 여기에 바로 나타납니다.</div>';
      if (s.offline) b += '<div class="save-note">서버에 연결되지 않아 마지막으로 받은 내용을 보여 줘요.</div>';
      document.getElementById('oc-body').className = ''; document.getElementById('oc-body').innerHTML = b;
      body.querySelectorAll('.og-cell').forEach(function (cell) {
        cell.addEventListener('click', function (e) { e.preventDefault(); var el = document.getElementById(cell.getAttribute('href').slice(1)); if (el) { el.classList.add('hl'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      });
    });
  }
  function ownerDetail(run, k, st, s, dateS) {
    var items = itemsFor(s, st, k, dateS).all, stt = runStatus(run, items.length), missing = [];
    var wasteKeys = Object.keys(run.waste || {}).filter(function (x) { return x !== '_none' && run.waste[x] > 0; });
    var wasteHtml = k !== 'close' ? null : (wasteKeys.length ? '<ul class="miss-list waste-list">' + wasteKeys.map(function (p) { return '<li>' + esc(p) + ' <strong>' + run.waste[p] + '</strong>개</li>'; }).join('') + '</ul>' : (run.waste && run.waste._none ? '<span class="ok-text">없음 (폐기 없음으로 입력)</span>' : '<span class="warn">미입력</span>'));
    items.forEach(function (t, i) { if (!(run.items || {})[String(i)]) missing.push(t); });
    var d = '<div class="card detail" id="d-' + k + '">';
    d += '<div class="title">' + KIND_LABEL[k] + ' <span class="pill ' + stt.cls + '">' + stt.label + '</span></div>';
    d += '<table class="kv"><tr><th>담당자</th><td>' + esc(run.staff) + '</td></tr>';
    d += '<tr><th>완료시간</th><td>' + (run.completed_at ? hhmm(run.completed_at) + (run.first_completed_at && run.first_completed_at !== run.completed_at ? ' <span class="muted small">(처음 제출 ' + hhmm(run.first_completed_at) + ')</span>' : '') : '<span class="warn">완료 제출 안 함</span>') + '</td></tr>';
    d += '<tr><th>체크</th><td>' + stt.done + '/' + stt.total + (run.updated_at ? ' <span class="muted small">(마지막 ' + hhmm(run.updated_at) + ')</span>' : '') + '</td></tr>';
    d += '<tr><th>미완료 항목</th><td>' + (missing.length ? '<ul class="miss-list">' + missing.map(function (t) { return '<li>⬜ ' + esc(t) + '</li>'; }).join('') + '</ul>' : '<span class="ok-text">없음 — 모두 체크됨</span>') + '</td></tr>';
    if (wasteHtml !== null) d += '<tr><th>오늘 폐기</th><td>' + wasteHtml + '</td></tr>';
    d += '<tr><th>특이사항</th><td>' + (run.note ? esc(run.note).replace(/\n/g, '<br>') : '<span class="muted">없음</span>') + '</td></tr></table>';
    d += '<details class="times"><summary>항목별 체크 시각</summary><ul class="detail-list">';
    items.forEach(function (t, i) { var at = (run.items || {})[String(i)]; d += '<li class="' + (at ? 'ok' : 'miss') + '">' + (at ? '✅ ' + hhmm(at) : '⬜ 빠짐') + ' · ' + esc(t) + '</li>'; });
    d += '</ul></details></div>';
    return d;
  }

  // 직원: 추가 · 이름/입사일 수정 · 퇴사/복귀 · 교육 진도(사수 확인)
  function ownerStaff(body) {
    return loadOwner().then(function (o) {
      var active = o.staff.filter(function (x) { return x.active; }), gone = o.staff.filter(function (x) { return !x.active; });
      function rowsFor(sf) { return o.training.filter(function (t) { return t.staff_id === sf.id || (!t.staff_id && t.staff === sf.name); }); }
      var h = '<div class="card"><div class="title">직원 추가</div><div class="staff-add"><input type="text" id="st-new" class="text-input" placeholder="이름 (예: 김하나)" maxlength="20"><input type="date" id="st-new-date" class="text-input" aria-label="입사일"><button type="button" class="btn primary" id="st-add">추가</button></div><p class="muted small">추가하면 직원 화면의 이름 목록에 바로 나와요. 입사일을 적으면 "입사 N일째"와 7일 배지가 보입니다.</p><p id="st-add-note" class="muted small"></p></div>';
      var late = [];
      h += '<p class="section-title">근무 중 ' + active.length + '명</p>';
      if (!active.length) h += empty('등록된 직원이 없어요.', '위에서 이름을 추가해 주세요.');
      active.forEach(function (sf) {
        var days = daysSince(sf.hire_on), rows = rowsFor(sf), read = 0, confirmed = 0;
        var steps = STEPS.map(function (stp) {
          var p = rows.filter(function (x) { return x.step === stp.day; })[0], r = !!(p && p.read_at), c = !!(p && p.confirmed_at);
          if (r) read++; if (c) confirmed++;
          return '<div class="tr-step"><span class="tr-day">' + esc(stp.day) + '</span><span class="pill ' + (c ? 'done' : r ? 'partial' : 'none') + '">' + (c ? '사수 확인 ✓' : r ? '읽음 ' + koDate(p.read_at.slice(0, 10)) : '아직') + '</span>' + (!c ? '<button type="button" class="btn small-btn tr-confirm" data-id="' + sf.id + '" data-step="' + esc(stp.day) + '">사수 확인</button>' : '') + '</div>';
        }).join('');
        var isLate = days !== null && days > 7 && confirmed < STEPS.length, done = STEPS.length && confirmed === STEPS.length;
        if (isLate) late.push(sf.name);
        h += '<div class="card staff-card' + (isLate ? ' late' : '') + '" data-id="' + sf.id + '">';
        h += '<div class="staff-row"><input type="text" class="text-input st-name" value="' + esc(sf.name) + '" maxlength="20" aria-label="이름"><input type="date" class="text-input st-date" value="' + esc(sf.hire_on || '') + '" aria-label="입사일"></div>';
        h += '<div class="staff-meta"><span class="muted small">' + (days ? '입사 ' + days + '일째' : '입사일 미등록') + '</span>' + (done ? '<span class="pill done">교육 완료</span>' : isLate ? '<span class="pill none">7일 지남 · 미완료</span>' : '') + '<span class="staff-btns"><button type="button" class="btn small-btn st-save">저장</button><button type="button" class="btn small-btn danger st-off">퇴사</button></span></div>';
        h += '<details class="staff-train"><summary>🎓 교육 진도 · 읽음 ' + read + '/' + STEPS.length + ' · 사수 확인 ' + confirmed + '/' + STEPS.length + '</summary>' + steps + '</details>';
        h += '<p class="muted small st-note"></p></div>';
      });
      if (late.length) h = h.replace('<p class="section-title">근무 중', '<div class="save-note">⚠️ 입사 7일이 지났는데 교육을 못 끝낸 직원 <strong>' + late.length + '명</strong>: ' + late.map(esc).join(', ') + '</div><p class="section-title">근무 중');
      if (gone.length) {
        h += '<details class="gone"><summary class="section-title">퇴사·쉬는 직원 ' + gone.length + '명</summary>';
        gone.forEach(function (sf) { h += '<div class="card staff-card off" data-id="' + sf.id + '"><div class="staff-meta"><strong>' + esc(sf.name) + '</strong><span class="muted small">' + (sf.hire_on ? '입사 ' + esc(sf.hire_on) : '') + '</span><span class="staff-btns"><button type="button" class="btn small-btn st-on">복귀</button></span></div><p class="muted small st-note"></p></div>'; });
        h += '<p class="muted small">퇴사한 직원은 직원 화면 목록에서 빠지지만 과거 체크 기록은 그대로 남아요.</p></details>';
      }
      body.className = ''; body.innerHTML = h;
      function note(card, msg, ok) { var n = card.querySelector('.st-note'); n.textContent = msg; n.className = 'small st-note ' + (ok ? 'ok-text' : 'warn'); }
      function save(card, patch, okMsg) {
        var id = card.dataset.id, sf = o.staff.filter(function (x) { return x.id === id; })[0];
        var args = { p_id: id, p_name: patch.name !== undefined ? patch.name : sf.name, p_hire_on: patch.hire_on !== undefined ? (patch.hire_on || null) : (sf.hire_on || null), p_active: patch.active !== undefined ? patch.active : sf.active };
        card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        return ownerRpc('owner_staff_save', args).then(function () { ownerChanged(); return loadOwner(true); }).then(function () { if (okMsg) alert(okMsg); viewOwner('staff'); })
          .catch(function (e) { card.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); note(card, ownerMsg(e), false); });
      }
      document.getElementById('st-add').addEventListener('click', function () {
        var nm = document.getElementById('st-new').value.trim(), dt = document.getElementById('st-new-date').value, n = document.getElementById('st-add-note'), btn = this;
        if (!nm) { n.textContent = '이름을 적어 주세요.'; n.className = 'small warn'; return; }
        btn.disabled = true;
        ownerRpc('owner_staff_save', { p_id: null, p_name: nm, p_hire_on: dt || null, p_active: true }).then(function () { ownerChanged(); return loadOwner(true); }).then(function () { viewOwner('staff'); })
          .catch(function (e) { btn.disabled = false; n.textContent = ownerMsg(e); n.className = 'small warn'; });
      });
      body.querySelectorAll('.staff-card').forEach(function (card) {
        var sv = card.querySelector('.st-save'), off = card.querySelector('.st-off'), on = card.querySelector('.st-on');
        if (sv) sv.addEventListener('click', function () { save(card, { name: card.querySelector('.st-name').value.trim(), hire_on: card.querySelector('.st-date').value }); });
        if (off) off.addEventListener('click', function () { var nm = card.querySelector('.st-name').value.trim(); if (!confirm(nm + ' 님을 퇴사 처리할까요?\n직원 화면 목록에서 빠지고, 과거 기록은 그대로 남아요. 나중에 "복귀"로 되돌릴 수 있어요.')) return; save(card, { active: false }); });
        if (on) on.addEventListener('click', function () { save(card, { active: true }); });
        card.querySelectorAll('.tr-confirm').forEach(function (b) {
          b.addEventListener('click', function () {
            b.disabled = true; b.textContent = '저장 중…';
            ownerRpc('owner_confirm_training', { p_staff_id: b.dataset.id, p_step: b.dataset.step }).then(function () { return loadOwner(true); }).then(function () { viewOwner('staff'); })
              .catch(function (e) { b.disabled = false; b.textContent = '사수 확인'; note(card, ownerMsg(e), false); });
          });
        });
      });
    });
  }

  // 우리 지점 추가사항: 장 → 소제목 → 내용. 직원 화면에서 그 소제목 아래 📍 상자로 보인다.
  function ownerNotes(body) {
    return loadOwner().then(function (o) {
      var notes = o.notes || [], editing = null;
      var h = '<div class="card soft-card"><strong>공통 매뉴얼은 본사가 관리해요.</strong><div class="muted small">여기서는 우리 지점에서만 적용되는 내용을 덧붙입니다. 직원 화면에서는 고른 장의 소제목 바로 아래 <strong>📍 우리 지점 추가사항</strong> 상자로 이어서 보여요. 다른 지점에는 안 보입니다.</div></div>';
      h += '<div class="card" id="note-form"><div class="title" id="nf-title">추가사항 새로 쓰기</div>';
      h += '<label class="field">어느 장에<select id="nf-ch" class="text-input">' + book.chapters.map(function (c) { return '<option value="' + c.num + '">' + c.num + '장. ' + esc(c.name) + '</option>'; }).join('') + '</select></label>';
      h += '<label class="field">어느 소제목 아래에<select id="nf-sec" class="text-input"></select></label>';
      h += '<label class="field">내용 <span class="muted small">— 한 줄에 하나씩. 줄 앞에 "- "를 붙이면 목록, "- [ ] "를 붙이면 체크 칸</span><textarea id="nf-body" rows="5" placeholder="예:\n- 우리 지점은 테라스 의자를 먼저 펴요\n- [ ] 입간판은 입구 왼쪽에"></textarea></label>';
      h += '<div class="chapter-tools"><button type="button" class="btn" id="nf-preview">미리보기</button><button type="button" class="btn primary" id="nf-save">저장</button><button type="button" class="btn" id="nf-cancel" hidden>취소</button></div><div id="nf-prev"></div><p id="nf-note" class="small"></p></div>';
      h += '<p class="section-title">등록된 추가사항 ' + notes.length + '건</p>';
      if (!notes.length) h += empty('아직 추가사항이 없어요.', '위에서 장과 소제목을 고르고 내용을 적어 보세요.');
      notes.forEach(function (n) {
        var ch = book.chapters.filter(function (c) { return c.num === n.chapter_no; })[0];
        h += '<div class="card note-card' + (n.active ? '' : ' off') + '" data-id="' + n.id + '"><div class="where">' + n.chapter_no + '장 ' + esc(ch ? ch.name : '') + ' › ' + esc(n.section_key || '장 맨 끝') + (n.active ? '' : ' <span class="pill none">꺼짐</span>') + '</div>';
        h += '<div class="store-note"><div class="store-note-title">📍 우리 지점 추가사항</div>' + renderBlocks(String(n.body_md || '').replace(/\r\n?/g, '\n').split('\n'), { num: 'o' + n.id }) + '</div>';
        h += '<div class="chapter-tools"><button type="button" class="btn small-btn n-edit">수정</button><button type="button" class="btn small-btn n-toggle">' + (n.active ? '끄기' : '켜기') + '</button><button type="button" class="btn small-btn danger n-del">삭제</button></div><p class="small n-note"></p></div>';
      });
      body.className = ''; body.innerHTML = h;
      var chSel = document.getElementById('nf-ch'), secSel = document.getElementById('nf-sec'), bodyTa = document.getElementById('nf-body'), nfNote = document.getElementById('nf-note');
      function fillSec(num, chosen) {
        var ch = book.chapters.filter(function (c) { return c.num === num; })[0], heads = sectionHeads(ch);
        secSel.innerHTML = heads.map(function (x) { return '<option value="' + esc(x) + '"' + (chosen === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '<option value=""' + (chosen === '' || (chosen && heads.indexOf(chosen) < 0) ? ' selected' : '') + '>(장 맨 끝)</option>';
      }
      fillSec(parseInt(chSel.value, 10));
      chSel.addEventListener('change', function () { fillSec(parseInt(chSel.value, 10)); });
      function setForm(n) {
        editing = n; document.getElementById('nf-title').textContent = n ? '추가사항 수정' : '추가사항 새로 쓰기';
        document.getElementById('nf-cancel').hidden = !n; document.getElementById('nf-prev').innerHTML = ''; nfNote.textContent = '';
        if (n) { chSel.value = String(n.chapter_no); fillSec(n.chapter_no, n.section_key || ''); bodyTa.value = n.body_md || ''; document.getElementById('note-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else { bodyTa.value = ''; fillSec(parseInt(chSel.value, 10)); }
      }
      document.getElementById('nf-cancel').addEventListener('click', function () { setForm(null); });
      document.getElementById('nf-preview').addEventListener('click', function () {
        document.getElementById('nf-prev').innerHTML = bodyTa.value.trim() ? '<div class="store-note"><div class="store-note-title">📍 우리 지점 추가사항</div>' + renderBlocks(bodyTa.value.replace(/\r\n?/g, '\n').split('\n'), { num: 'prev' }) + '</div>' : '<p class="muted small">내용이 비어 있어요.</p>';
      });
      document.getElementById('nf-save').addEventListener('click', function () {
        var btn = this; if (!bodyTa.value.trim()) { nfNote.textContent = '내용을 적어 주세요.'; nfNote.className = 'small warn'; return; }
        btn.disabled = true;
        ownerRpc('owner_note_save', { p_id: editing ? editing.id : null, p_chapter_no: parseInt(chSel.value, 10), p_section_key: secSel.value || null, p_body_md: bodyTa.value, p_active: editing ? editing.active : true })
          .then(function () { ownerChanged(); return loadOwner(true); }).then(function () { viewOwner('notes'); })
          .catch(function (e) { btn.disabled = false; nfNote.textContent = ownerMsg(e); nfNote.className = 'small warn'; });
      });
      body.querySelectorAll('.note-card').forEach(function (card) {
        var n = notes.filter(function (x) { return x.id === card.dataset.id; })[0], nn = card.querySelector('.n-note');
        function after(p) { return p.then(function () { ownerChanged(); return loadOwner(true); }).then(function () { viewOwner('notes'); }).catch(function (e) { nn.textContent = ownerMsg(e); nn.className = 'small warn'; }); }
        card.querySelector('.n-edit').addEventListener('click', function () { setForm(n); });
        card.querySelector('.n-toggle').addEventListener('click', function () { after(ownerRpc('owner_note_save', { p_id: n.id, p_chapter_no: n.chapter_no, p_section_key: n.section_key || null, p_body_md: n.body_md, p_active: !n.active })); });
        card.querySelector('.n-del').addEventListener('click', function () { if (!confirm('이 추가사항을 지울까요? 되돌릴 수 없어요. (잠깐 숨기려면 "끄기")')) return; after(ownerRpc('owner_note_delete', { p_id: n.id })); });
      });
    });
  }

  // 체크 항목: 우리 지점 오픈·마감 추가 항목 + 떡 종류(폐기 입력용)
  function ownerItems(body) {
    return loadOwner().then(function (o) {
      var ss = o.settings || {}, xi = ss.extra_items || {}, products = ss.products || [];
      var h = '<div class="card soft-card"><strong>공통 항목(오픈 ' + LISTS.open.items.length + '·마감 ' + LISTS.close.items.length + ')은 본사 매뉴얼에서 와요.</strong><div class="muted small">아래 항목은 그 뒤에 "🏪 ' + esc(singleStore(settingsCache || emptyBundle()) || '매장') + ' 항목"으로 이어 붙어 우리 지점 직원에게만 보입니다. 한 줄에 하나.<br>매일이 아닌 항목은 끝에 주기를 적어요: <code>제빙기 내부 세척 (매주 월)</code> · <code>냉장고 전체 세척 (격주 월)</code> · <code>소화기 점검 (매월 1일)</code> — 그날에만 나옵니다.</div></div>';
      h += '<label class="field">☀️ 오픈 추가 항목<textarea id="xi-open" rows="4" placeholder="예: 테라스 의자 펴기">' + esc((xi.open || []).join('\n')) + '</textarea></label>';
      h += '<label class="field">🌙 마감 추가 항목<textarea id="xi-close" rows="4" placeholder="예: 테라스 의자 접고 묶기">' + esc((xi.close || []).join('\n')) + '</textarea></label>';
      h += '<label class="field">🗑️ 떡 종류 (폐기 입력용) <span class="muted small">— 마감 때 직원이 폐기 있는 떡을 골라 개수를 적어요. 비우면 직원이 이름을 직접 적습니다</span><textarea id="xi-products" rows="5" placeholder="예:\n인절미\n흑임자 인절미\n꿀떡">' + esc(products.join('\n')) + '</textarea></label>';
      h += '<button type="button" class="btn primary wide" id="xi-save">저장</button><p id="xi-note" class="small"></p>';
      body.className = ''; body.innerHTML = h;
      function linesNL(id) { var out = []; document.getElementById(id).value.split('\n').forEach(function (x) { x = x.trim(); if (x && out.indexOf(x) < 0) out.push(x); }); return out; }
      document.getElementById('xi-save').addEventListener('click', function () {
        var btn = this, n = document.getElementById('xi-note'); btn.disabled = true; n.textContent = '저장 중…'; n.className = 'small muted';
        ownerRpc('owner_settings_save', { p_extra_items: { open: linesNL('xi-open'), close: linesNL('xi-close') }, p_products: linesNL('xi-products') })
          .then(function () { ownerChanged(); return loadOwner(true); }).then(function () { btn.disabled = false; n.textContent = '✓ 저장됐어요. 직원 화면에 바로 반영됩니다.'; n.className = 'small ok-text'; })
          .catch(function (e) { btn.disabled = false; n.textContent = ownerMsg(e); n.className = 'small warn'; });
      });
    });
  }

  // 직원용 링크 · QR · 안내문 (설정 탭 안)
  function ownerLink(body) {
    var name = singleStore(settingsCache || emptyBundle()) || '매장', link = staffLink();
    body.className = ''; body.innerHTML = linkSectionHtml(name, link, 'lk');
    bindLinkSection(name, link, 'lk');
  }

  // 설정: PIN 바꾸기(6자리) · 로그아웃
  function ownerSettings(body) {
    var os = null; try { os = JSON.parse(session.get('owner_store') || 'null'); } catch (e) {}
    var name = singleStore(settingsCache || emptyBundle()) || (os && os.name) || '매장';
    var h = '<div class="card"><div class="title">🏪 ' + esc(name) + '</div><div class="muted small">지점 코드 <strong>' + esc((os && os.code) || CODE) + '</strong> · 이 코드는 직원용 링크 안에 들어 있어요. 직원에게 코드나 번호를 따로 알려 줄 필요는 없습니다. 지점 이름 변경은 본사에 요청해 주세요.</div></div>';
    h += '<div id="os-link"></div>';
    h += '<div class="card"><div class="title">🔐 점주 번호(PIN) 바꾸기</div><p class="muted small">점주 화면을 여는 숫자 <strong>6자리</strong>예요. 직원과 공유하지 마세요. 바꾸면 다른 기기에서 열어 둔 점주 화면은 닫혀요.</p>';
    h += '<label class="field">지금 번호<input type="password" inputmode="numeric" maxlength="8" id="pin0" class="text-input" autocomplete="current-password"></label>';
    h += '<label class="field">새 번호 (숫자 6자리)<input type="password" inputmode="numeric" maxlength="6" id="pin1" class="text-input" autocomplete="new-password"></label>';
    h += '<label class="field">새 번호 한 번 더<input type="password" inputmode="numeric" maxlength="6" id="pin2" class="text-input" autocomplete="new-password"></label>';
    h += '<button type="button" class="btn primary wide" id="pin-save">번호 바꾸기</button><p id="pin-note" class="small"></p></div>';
    h += '<details class="card"><summary class="title">✅ 지점 체크 항목 · 떡 종류 (선택)</summary><div id="os-items" class="muted">불러오는 중…</div></details>';
    h += '<div class="card"><div class="title">이 기기에서 닫기</div><p class="muted small">다른 사람이 쓰는 폰·PC라면 다 쓰고 닫아 주세요. 번호를 다시 넣어야 열려요.</p><button type="button" class="btn wide" id="owner-logout">점주 화면 닫기</button></div>';
    body.className = ''; body.innerHTML = h;
    ownerLink(document.getElementById('os-link'));
    ownerItems(document.getElementById('os-items')).catch(function (e) { document.getElementById('os-items').innerHTML = '<div class="save-note">' + esc(ownerMsg(e)) + '</div>'; });
    document.getElementById('pin-save').addEventListener('click', function () {
      var p0 = document.getElementById('pin0').value.trim(), p1 = document.getElementById('pin1').value.trim(), p2 = document.getElementById('pin2').value.trim(), n = document.getElementById('pin-note'), btn = this;
      if (!/^\d{6}$/.test(p1)) { n.textContent = '새 번호는 숫자 6자리로 넣어 주세요.'; n.className = 'small warn'; return; }
      if (p1 !== p2) { n.textContent = '두 번 넣은 새 번호가 달라요.'; n.className = 'small warn'; return; }
      btn.disabled = true;
      ownerRpc('owner_change_pin', { p_old_pin: p0, p_new_pin: p1 }).then(function () { btn.disabled = false; n.textContent = '✓ 바꿨어요. 다음부터 새 번호로 여세요.'; n.className = 'small ok-text'; ['pin0', 'pin1', 'pin2'].forEach(function (id) { document.getElementById(id).value = ''; }); })
        .catch(function (e) { btn.disabled = false; n.textContent = ownerMsg(e); n.className = 'small warn'; });
    });
    document.getElementById('owner-logout').addEventListener('click', function () { var t = ownerToken(); ownerOut(); if (t) rpc('owner_logout', { p_token: t }).catch(function () {}); location.hash = '#/'; });
  }

  // v1 화면들 (장 상세·검색·교육표·확인 필요)
  function viewChapter(num, hl) {
    var ch = book.chapters.filter(function (x) { return x.num === num; })[0];
    if (!ch) { app.innerHTML = empty('없는 장이에요.', '목차에서 다시 골라 주세요.'); return; }
    var idx = book.chapters.indexOf(ch), prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    var boxes = ch.lines.filter(function (l) { return /^[-*]\s+\[[ xX]\]/.test(l); }).length;
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › ' + ch.num + '장</div><h1>' + ch.num + '장. ' + esc(ch.name) + '</h1>';
    if (boxes) h += '<div class="chapter-tools"><span class="badge ok" id="ch-progress"></span><button class="btn danger" id="ch-reset">오늘 체크 지우기</button></div>';
    h += '<div class="content" id="content">' + renderBlocks(linesWithNotes(ch, settingsCache), { num: ch.num }) + '</div>';
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
  // 신입 교육표 — 이름별로 서버에 저장. 사수 확인은 사장 점검표에서.
  function viewTraining() {
    var m = me(), rows = STEPS;
    if (!m) { location.hash = '#/who?next=' + encodeURIComponent('#/train'); return; }
    app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 신입 교육표</div><h1>🎓 신입 교육표</h1><div class="muted">불러오는 중…</div>';
    Promise.all([loadSettings(), fetchTraining(m.staff)]).then(function (r) {
      var s = r[0], prog = r[1] || [], meta = (s.staff_meta || {})[m.staff] || {}, days = daysSince(meta.hire_on);
      function row(step) { return prog.filter(function (x) { return x.step === step; })[0]; }
      var readCount = rows.filter(function (x) { var p = row(x.day); return p && p.read_at; }).length;
      var h = '<div class="crumb"><a href="#/">첫 화면</a> › 신입 교육표</div><h1>🎓 신입 교육표</h1>';
      h += '<div class="card who-line"><span><strong>' + esc(m.staff) + '</strong>' + (days ? ' · 입사 ' + days + '일째' : '') + '</span><a href="#/who?next=' + encodeURIComponent('#/train') + '">바꾸기</a></div>';
      h += '<div class="progress-row"><div style="font-weight:700">교육 진행 ' + readCount + '/' + rows.length + '</div><span id="tr-save" class="save-status"></span></div><div class="progress-bar"><div style="width:' + (rows.length ? Math.round(readCount / rows.length * 100) : 0) + '%"></div></div>';
      h += '<p class="muted small">그날 읽을 장을 눌러 읽고, 다 읽으면 "읽었어요"를 누르세요. 사수가 확인하면 "사수 확인 ✓"로 바뀝니다.</p>';
      if (!rows.length) h += empty('교육표가 없어요.', '12장에 표가 있는지 확인해 주세요.');
      rows.forEach(function (r) {
        var p = row(r.day), on = !!(p && p.read_at), ok = !!(p && p.confirmed_at), links = '', seen = {};
        r.content.replace(/(\d+)장/g, function (all, n) { if (!seen[n]) { seen[n] = 1; links += '<a href="' + chapterLink(parseInt(n, 10)) + '">' + n + '장</a>'; } return all; });
        h += '<div class="card train-row' + (ok ? ' confirmed' : '') + '"><div class="day">' + esc(r.day) + (ok ? ' <span class="pill done">사수 확인 ✓ ' + hhmm(p.confirmed_at) + '</span>' : (on ? ' <span class="pill partial">읽음 · 사수 확인 대기</span>' : '')) + '</div><div>' + inline(r.content) + '</div><div class="links">' + links + '</div>';
        h += '<label class="read"><input type="checkbox" data-step="' + esc(r.day) + '"' + (on ? ' checked' : '') + (ok ? ' disabled' : '') + '><span>읽었어요' + (on ? ' ✓ ' + (p.read_at ? koDate(p.read_at.slice(0, 10)) : '') : '') + '</span></label></div>';
      });
      app.innerHTML = h;
      app.querySelectorAll('input[data-step]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var st = document.getElementById('tr-save'); st.className = 'save-status'; st.textContent = '저장 중…';
          var rowData = { staff: m.staff, store: m.store || '', step: inp.dataset.step, read_at: inp.checked ? new Date().toISOString() : null, confirmed_at: null, updated_at: new Date().toISOString() };
          saveTraining(rowData).then(function (res) {
            st.className = 'save-status ' + (res.ok ? 'ok' : 'err'); st.textContent = res.ok ? (res.local ? (DEMO ? '✓ 저장됨 (데모)' : '이 폰에만 저장됨') : '✓ 서버에 저장됨') : '❌ 저장 안 됨';
            setTimeout(function () { viewTraining(); }, 400);
          });
        });
      });
    });
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
    ((settingsCache && settingsCache.notes) || []).forEach(function (n) { String(n.body_md || '').split('\n').forEach(function (l) { var p = plain(l); if (p && norm(p).indexOf(nq) >= 0) results.push({ num: n.chapter_no, name: '우리 지점 추가사항', line: -1, text: p }); }); });
    h += '<h1>"' + esc(q) + '" 검색 결과 ' + results.length + '건</h1>';
    if (!results.length) h += empty('찾는 내용이 없어요.', '사수나 사장님께 물어보세요. 다른 말로 다시 검색해 볼 수도 있어요.');
    results.forEach(function (r) {
      var text = esc(r.text), re = new RegExp(q.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'; }).join(''), 'i');
      text = text.replace(re, function (m0) { return '<mark>' + m0 + '</mark>'; });
      h += '<a class="card link result" href="#/ch/' + r.num + (r.line >= 0 ? '?hl=' + r.line : '') + '"><div class="where">' + r.num + '장 ' + esc(r.name) + '</div><div class="snip">' + text + '</div></a>';
    });
    app.innerHTML = h;
  }

  // ---------- 링크·QR·안내문 (점주 설정 · 본사 지점 등록/상세에서 같이 씀) ----------
  function storeLink(code) { return location.origin + location.pathname + '#/s/' + code; }
  function staffGuideText(name, link) {
    return '[' + name + ' 직원 온라인북]\n이 링크는 우리 지점 직원교육 온라인북이에요.\n링크를 열고 본인 이름을 고른 뒤 오픈·마감 체크와 업무 매뉴얼을 확인해 주세요.\n' + link + '\n(번호나 코드는 없어요. 홈 화면에 추가해 두면 앱처럼 쓸 수 있어요)';
  }
  function ownerGuideText(name, link, pin) {
    return '[떡기리 직원 온라인북 · ' + name + ' 점주님 안내]\n\n' +
      '1) 우리 지점 직원용 링크\n' + link + '\n\n' +
      '2) 점주 화면 들어가기\n위 링크를 열고 → 맨 아래 "점주 화면" → 점주 번호(PIN) ' + (pin ? pin : '(본사에서 받은 6자리)') + ' 입력\n※ 처음 들어가면 설정 → "점주 번호 바꾸기"에서 번호를 꼭 바꿔 주세요 (숫자 6자리)\n\n' +
      '3) 직원 이름 등록\n점주 화면 → 직원관리 → 이름 적고 "추가" (입사일은 선택)\n\n' +
      '4) 직원에게 링크 보내기\n점주 화면 → 설정 → "직원용 안내문 복사" → 직원 단톡방에 붙여넣기 (QR 저장·인쇄도 가능)\n직원은 링크를 열고 본인 이름만 고르면 끝이에요. 번호·코드는 필요 없어요.\n\n' +
      '5) 오픈·마감 확인\n점주 화면 → 오늘 점검: 담당자 · 완료시간 · 빠진 항목 · 특이사항\n\n' +
      '6) 우리 지점만의 내용 덧붙이기\n점주 화면 → 우리 지점 추가사항 → 장과 소제목을 고르고 내용 저장. 직원 화면에 바로 보여요.\n\n' +
      '문제가 생기면: 본사(떡기리)에 연락 주세요. 번호를 잊으면 본사에서 새로 받을 수 있어요.';
  }
  function qrBuild(link) {
    if (typeof qrcode !== 'function') return null;
    var q = qrcode(0, 'M'); q.addData(link); q.make();
    var cnv = document.createElement('canvas'), mod = q.getModuleCount(), cell = 10, margin = 40; cnv.width = cnv.height = mod * cell + margin * 2;
    var cx = cnv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cnv.width, cnv.height); cx.fillStyle = '#000';
    for (var r = 0; r < mod; r++) for (var c = 0; c < mod; c++) if (q.isDark(r, c)) cx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
    return { img: q.createImgTag(6, 12), png: cnv.toDataURL('image/png') };
  }
  function linkSectionHtml(name, link, p) {
    var h = '<div class="card"><div class="title">🔗 직원용 링크</div><p class="muted small">이 링크 안에 우리 지점 코드가 들어 있어요. 직원은 열고 이름만 고르면 됩니다. 다른 지점 직원에게는 보내지 마세요.</p><div class="link-row"><input type="text" class="text-input" id="' + p + '-url" readonly value="' + esc(link) + '"><button type="button" class="btn primary" id="' + p + '-copy">복사</button></div></div>';
    h += '<div class="card qr-sheet" id="' + p + '-sheet"><div class="title">📱 직원용 QR</div><div class="qr-box" id="' + p + '-box"></div><div class="qr-caption"><strong>' + esc(name) + ' 직원 온라인북</strong><span class="muted small">카메라로 찍고 이름을 고르세요</span></div><div class="chapter-tools noprint"><a class="btn" id="' + p + '-save" download="' + esc(name) + '_직원QR.png" href="#">QR 이미지 저장</a><button type="button" class="btn" id="' + p + '-print">인쇄</button></div></div>';
    h += '<div class="card"><div class="title">💬 직원용 안내문 (단톡방에 그대로)</div><textarea id="' + p + '-guide" rows="6" class="guide-ta">' + esc(staffGuideText(name, link)) + '</textarea><button type="button" class="btn wide" id="' + p + '-guide-copy">직원용 안내문 복사</button></div>';
    return h;
  }
  function bindLinkSection(name, link, p) {
    var g = function (id) { return document.getElementById(p + '-' + id); };
    try {
      var q = qrBuild(link); if (!q) throw new Error('qr');
      g('box').innerHTML = q.img; var img = g('box').querySelector('img'); img.alt = name + ' 직원용 QR'; img.style.width = '220px'; img.style.height = '220px';
      g('save').href = q.png;
    } catch (e) { g('box').innerHTML = '<p class="muted small">QR을 만들지 못했어요. 링크를 복사해서 보내 주세요.</p>'; g('save').hidden = true; }
    g('copy').addEventListener('click', function () { copyText(link, this); });
    g('guide-copy').addEventListener('click', function () { copyText(g('guide').value, this); });
    g('print').addEventListener('click', function () { g('sheet').classList.add('print-target'); document.body.classList.add('print-qr'); window.print(); setTimeout(function () { document.body.classList.remove('print-qr'); g('sheet').classList.remove('print-target'); }, 800); });
  }

  // ---------- 본사 관리자 화면 (#/hq) ----------
  // 로그인 = 이메일 매직링크(Supabase Auth). 메일의 링크를 누르면 이 주소로 돌아오며 주소 뒤에 토큰이 붙는다 → 저장 → #/hq.
  // 본사 함수는 로그인 토큰으로만 호출되고, 서버가 그 이메일이 hq_admins 에 있는지 확인한다. 익명은 호출 자체가 막혀 있다.
  function hqSession() { try { return JSON.parse(store.get('hq_session') || 'null'); } catch (e) { return null; } }
  function hqOut() { store.del('hq_session'); }
  function hqKeep(at, rt, secs) { store.set('hq_session', JSON.stringify({ access_token: at, refresh_token: rt || '', expires_at: Date.now() + (secs || 3600) * 1000 })); }
  function hqAuthFromHash() {
    var h = location.hash || '';
    if (h.indexOf('#access_token=') !== 0 && h.indexOf('#error') !== 0) return false;
    var p = {}; h.slice(1).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    if (p.access_token) hqKeep(p.access_token, p.refresh_token, parseInt(p.expires_in, 10));
    else session.set('hq_err', p.error_description || p.error || '로그인 링크가 올바르지 않아요.');
    return true;
  }
  function authUrl(path) { return SB.url.replace(/\/$/, '') + '/auth/v1/' + path; }
  function hqRefresh() {
    var s = hqSession(); if (!s || !s.refresh_token) { hqOut(); return Promise.reject(new Error('not logged in')); }
    return fetch(authUrl('token?grant_type=refresh_token'), { method: 'POST', headers: { apikey: SB.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { if (!r.ok) throw new Error('refresh failed'); return r.json(); })
      .then(function (j) { hqKeep(j.access_token, j.refresh_token, j.expires_in); return j.access_token; })
      .catch(function () { hqOut(); throw new Error('not logged in'); });
  }
  function hqRpc(name, args, retried) {
    var s = hqSession(); if (!s) return Promise.reject(new Error('not logged in'));
    var pre = (!retried && s.expires_at && s.expires_at - Date.now() < 60000) ? hqRefresh() : Promise.resolve(s.access_token);
    return pre.then(function (tk) {
      return fetch(SB.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB.anon, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
        .then(function (r) {
          if (r.status === 401 && !retried) return hqRefresh().then(function () { return hqRpc(name, args, true); });
          if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); });
          return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
        });
    });
  }
  function hqSendLink(email) {
    var redirect = location.origin + location.pathname;
    return fetch(authUrl('otp?redirect_to=' + encodeURIComponent(redirect)), { method: 'POST', headers: { apikey: SB.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, create_user: true }) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); }); return true; });
  }
  function hqMsg(e) {
    var m = (e && e.message) || String(e);
    if (/not hq/.test(m)) return '이 이메일은 본사 관리자로 등록되지 않았어요.';
    if (/not logged in|refresh failed|^401/.test(m)) return '로그인이 풀렸어요. 다시 로그인해 주세요.';
    if (/duplicate store/.test(m)) return '같은 이름의 지점이 이미 있어요.';
    if (/name required/.test(m)) return '지점 이름을 적어 주세요.';
    if (/title required/.test(m)) return '제목을 적어 주세요.';
    if (/confirm name mismatch/.test(m)) return '지점 이름이 정확히 같지 않아요.';
    if (/has old records/.test(m)) return '기록이 쌓인 지점은 지울 수 없어요. 대신 "사용 중지"를 쓰세요.';
    if (/rate.?limit/i.test(m)) return '메일을 너무 자주 보냈어요. 잠시 뒤(약 1시간) 다시 해 주세요.';
    if (/Failed to fetch/.test(m)) return '인터넷 연결을 확인해 주세요.';
    return '안 됨 (' + m.slice(0, 120) + ')';
  }
  function koDT(iso) { return iso ? koDate(iso.slice(0, 10)) + ' ' + hhmm(iso) : ''; }
  function hqStatus(run) {
    if (!run) return { cls: 'none', label: '미완료' };
    if (run.completed_at) return { cls: 'done', label: '완료 ' + hhmm(run.completed_at) + ((run.total || 0) > (run.done_count || 0) ? ' (' + (run.total - run.done_count) + '개 빠짐)' : '') };
    return { cls: 'partial', label: '진행 중 ' + (run.done_count || 0) + '/' + (run.total || 0) };
  }
  var HQ_TABS = [['', '🏪 지점 현황'], ['manual', '📖 공통 매뉴얼'], ['new', '➕ 지점 등록']];
  function viewHq(sub, id, params) {
    sub = sub || ''; params = params || {};
    if (sub === 'logout') { hqOut(); location.hash = '#/hq'; return; }
    if (!hqSession()) return viewHqLogin();
    var h = '<div class="crumb">본사 관리자</div><h1>🏢 떡기리 본사</h1>';
    h += '<nav class="owner-tabs">' + HQ_TABS.map(function (t) { return '<a href="#/hq' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === sub || (sub === 'store' && !t[0]) ? ' class="on"' : '') + '>' + t[1] + '</a>'; }).join('') + '<a href="#/hq/logout" class="tab-right">나가기</a></nav>';
    h += '<div id="hq-body" class="muted">불러오는 중…</div>';
    app.innerHTML = h;
    var body = document.getElementById('hq-body');
    function fail(e) { body.className = ''; body.innerHTML = '<div class="save-note">' + esc(hqMsg(e)) + '</div>' + (!hqSession() ? '<a class="btn primary" href="#/hq">다시 로그인</a>' : ''); }
    try {
      if (sub === 'manual') (id ? hqManualPage(body, id) : hqManualList(body)).catch(fail);
      else if (sub === 'new') hqNewStore(body);
      else if (sub === 'store' && id) hqStore(body, id, params.d || today()).catch(fail);
      else hqOverview(body, params.d || today()).catch(fail);
    } catch (e) { fail(e); }
  }
  function viewHqLogin() {
    var err = session.get('hq_err'); session.del('hq_err');
    app.innerHTML = '<div class="crumb">본사 관리자</div><h1>🏢 본사 관리자 로그인</h1><p class="muted">본사 이메일을 넣으면 <strong>로그인 링크</strong>를 메일로 보내요. 메일의 링크를 누르면 바로 열립니다. 비밀번호는 없어요.</p>' +
      '<form id="hq-form"><input type="email" id="hq-email" class="text-input" placeholder="본사 이메일" autocomplete="email" required><button class="btn primary wide" type="submit" id="hq-go">로그인 링크 보내기</button></form><p id="hq-note" class="small' + (err ? ' warn">' + esc(err) : '">') + '</p>' +
      '<p class="muted small">메일이 안 보이면 스팸함을 확인해 주세요. 링크는 1시간 안에 눌러야 하고, 등록된 본사 이메일이 아니면 로그인해도 "권한 없음"이 나와요.</p>';
    document.getElementById('hq-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = document.getElementById('hq-email').value.trim().toLowerCase(), n = document.getElementById('hq-note'), btn = document.getElementById('hq-go');
      btn.disabled = true; n.className = 'small muted'; n.textContent = '보내는 중…';
      hqSendLink(em).then(function () { n.className = 'small ok-text'; n.textContent = '✓ 메일을 보냈어요. 메일함에서 "Log In" 또는 "Magic Link" 링크를 눌러 주세요. 이 창은 닫아도 돼요.'; })
        .catch(function (e2) { btn.disabled = false; n.className = 'small warn'; n.textContent = hqMsg(e2); });
    });
  }
  // 전 지점 현황: 지점마다 오늘 오픈·마감 · 담당자 · 완료시간 · 특이사항 · 교육 진행
  function hqOverview(body, date) {
    return hqRpc('hq_overview', { p_date: date }).then(function (o) {
      var stores = o.stores || [], stepsN = trainingRows(parseBook('## 12장. 교육\n' + (o.ch12 || ''))).length || 3;
      var openDone = stores.filter(function (s) { return s.open && s.open.completed_at; }).length, closeDone = stores.filter(function (s) { return s.close && s.close.completed_at; }).length;
      var h = '<div class="date-nav"><a class="btn" href="#/hq?d=' + shiftDate(date, -1) + '">‹ 전날</a><strong>' + koDate(date) + (date === today() ? ' 오늘' : '') + '</strong>' + (date < today() ? '<a class="btn" href="#/hq?d=' + shiftDate(date, 1) + '">다음날 ›</a>' : '<a class="btn" href="#/hq">오늘</a>') + '</div>';
      h += '<div class="card status-card"><div class="sub">지점 <strong>' + stores.length + '</strong>곳 · 오픈 완료 <strong>' + openDone + '</strong>/' + stores.length + ' · 마감 완료 <strong>' + closeDone + '</strong>/' + stores.length + '</div><div class="muted small">로그인: ' + esc(o.admin || '') + '</div></div>';
      if (!stores.length) h += empty('등록된 지점이 없어요.', '"지점 등록"에서 첫 지점을 만들어 주세요.');
      stores.forEach(function (s) {
        var so = hqStatus(s.open), sc = hqStatus(s.close), tr = s.training || [];
        var done = tr.filter(function (t) { return t.confirmed >= stepsN; }).length, late = tr.filter(function (t) { var d = daysSince(t.hire_on); return d !== null && d > 7 && t.confirmed < stepsN; }).length;
        h += '<a class="card link hq-store" href="#/hq/store/' + s.id + '?d=' + date + '"><div class="title">' + esc(s.name) + (s.status === 'paused' ? ' <span class="pill none">사용 중지</span>' : '') + ' <span class="muted small">' + esc(s.owner_name || '') + ' · 코드 ' + esc(s.code) + '</span></div>';
        h += '<div class="today-row"><span class="pill ' + so.cls + '">오픈 ' + so.label + '</span>' + (s.open ? '<span class="muted small">' + esc(s.open.staff) + '</span>' : '') + '</div>';
        h += '<div class="today-row"><span class="pill ' + sc.cls + '">마감 ' + sc.label + '</span>' + (s.close ? '<span class="muted small">' + esc(s.close.staff) + '</span>' : '') + '</div>';
        var notes = []; if (s.open && s.open.note) notes.push('오픈: ' + s.open.note); if (s.close && s.close.note) notes.push('마감: ' + s.close.note);
        if (notes.length) h += '<div class="hq-note">📝 ' + notes.map(esc).join('<br>📝 ') + '</div>';
        h += '<div class="muted small">👥 직원 ' + (s.staff_n || 0) + '명 · 🎓 교육 완료 ' + done + '/' + tr.length + (late ? ' · <span class="warn">7일 지남 ' + late + '명</span>' : '') + '</div></a>';
      });
      body.className = ''; body.innerHTML = h;
    });
  }
  // 지점 상세: 그날 기록(점주 화면과 같은 카드) · 최근 7일 특이사항 · 직원·교육 · 추가사항 · 링크/QR/안내문 · PIN 초기화 · 중지/재개 · 삭제
  function hqStore(body, id, date) {
    return hqRpc('hq_store', { p_store_id: id, p_date: date }).then(function (d) {
      var st = d.store, link = storeLink(st.code);
      return rpc('staff_bundle', { p_code: st.code }).catch(function () { return null; }).then(function (b) {
        var s = shapeBundle(b); if (!s.store) { s = emptyBundle(); s.stores = [st.name]; s.store_items = {}; s.store_items[st.name] = (d.settings && d.settings.extra_items) || { open: [], close: [] }; }
        if (s.manual && s.manual.length) setBook(s); else if (!book.chapters.length) setBook(null);
        var h = '<div class="crumb"><a href="#/hq?d=' + date + '">지점 현황</a> › ' + esc(st.name) + '</div>';
        h += '<div class="card"><div class="title">' + esc(st.name) + (st.status === 'paused' ? ' <span class="pill none">사용 중지</span>' : ' <span class="pill done">사용 중</span>') + '</div><div class="muted small">점주 ' + esc(st.owner_name || '-') + ' · ' + esc(st.owner_phone || '연락처 없음') + ' · 코드 ' + esc(st.code) + ' · 등록 ' + koDate(String(st.created_at).slice(0, 10)) + (st.locked_until && new Date(st.locked_until) > new Date() ? ' · <span class="warn">PIN 잠김(10분)</span>' : '') + '</div>';
        h += '<div class="chapter-tools"><button type="button" class="btn" id="hs-link">🔗 링크·QR·안내문</button><button type="button" class="btn" id="hs-pin">🔐 PIN 초기화</button><button type="button" class="btn" id="hs-status">' + (st.status === 'paused' ? '▶ 다시 사용' : '⏸ 사용 중지') + '</button><button type="button" class="btn danger" id="hs-del">지점 삭제</button></div><p id="hs-note" class="small"></p><div id="hs-extra"></div></div>';
        h += '<div class="date-nav"><a class="btn" href="#/hq/store/' + id + '?d=' + shiftDate(date, -1) + '">‹ 전날</a><strong>' + koDate(date) + (date === today() ? ' 오늘' : '') + '</strong>' + (date < today() ? '<a class="btn" href="#/hq/store/' + id + '?d=' + shiftDate(date, 1) + '">다음날 ›</a>' : '<a class="btn" href="#/hq/store/' + id + '">오늘</a>') + '</div>';
        var any = false;
        ['open', 'close'].forEach(function (k) { var run = (d.runs || []).filter(function (x) { return x.kind === k; })[0]; if (run) { any = true; h += ownerDetail(run, k, st.name, s, date); } });
        if (!any) h += '<div class="empty"><strong>' + koDate(date) + ' 기록이 없어요.</strong></div>';
        h += '<p class="section-title">📝 최근 7일 특이사항·폐기</p>';
        if (!(d.recent || []).length) h += '<div class="card"><div class="muted small">없음</div></div>';
        (d.recent || []).forEach(function (r) {
          var wk = Object.keys(r.waste || {}).filter(function (x) { return x !== '_none' && r.waste[x] > 0; });
          h += '<div class="card"><div class="muted small">' + koDate(r.run_date) + ' ' + KIND_LABEL[r.kind] + ' · ' + esc(r.staff) + '</div>' + (r.note ? '<div>' + esc(r.note).replace(/\n/g, '<br>') + '</div>' : '') + (wk.length ? '<div class="muted small">🗑️ ' + wk.map(function (p) { return esc(p) + ' ' + r.waste[p] + '개'; }).join(', ') + '</div>' : '') + '</div>';
        });
        h += '<p class="section-title">👥 직원 ' + d.staff.filter(function (x) { return x.active; }).length + '명 · 🎓 교육</p>';
        if (!d.staff.length) h += '<div class="card"><div class="muted small">아직 직원이 없어요. 점주가 점주 화면 → 직원관리에서 등록합니다.</div></div>';
        d.staff.forEach(function (f) {
          var days = daysSince(f.hire_on), conf = STEPS.map(function (stp) { var p = (f.steps || []).filter(function (x) { return x.step === stp.day; })[0]; return '<span class="pill ' + (p && p.confirmed_at ? 'done' : p && p.read_at ? 'partial' : 'none') + '">' + esc(stp.day) + '</span>'; }).join(' ');
          h += '<div class="card' + (f.active ? '' : ' staff-card off') + '"><div class="title">' + esc(f.name) + (f.active ? '' : ' <span class="pill none">퇴사</span>') + ' <span class="muted small">' + (days ? '입사 ' + days + '일째' : '입사일 미등록') + '</span></div><div class="choice">' + conf + '</div></div>';
        });
        h += '<p class="section-title">📍 이 지점 추가사항 ' + (d.notes || []).length + '건</p>';
        if (!(d.notes || []).length) h += '<div class="card"><div class="muted small">없음</div></div>';
        (d.notes || []).forEach(function (n) {
          var ch = book.chapters.filter(function (c) { return c.num === n.chapter_no; })[0];
          h += '<div class="card note-card' + (n.active ? '' : ' off') + '"><div class="where">' + n.chapter_no + '장 ' + esc(ch ? ch.name : '') + ' › ' + esc(n.section_key || '장 맨 끝') + (n.active ? '' : ' <span class="pill none">꺼짐</span>') + '</div><div class="store-note"><div class="store-note-title">📍 우리 지점 추가사항</div>' + renderBlocks(String(n.body_md || '').split('\n'), { num: 'h' + n.id }) + '</div></div>';
        });
        body.className = ''; body.innerHTML = h;
        var note = document.getElementById('hs-note'), extra = document.getElementById('hs-extra');
        function say(msg, ok) { note.textContent = msg; note.className = 'small ' + (ok ? 'ok-text' : 'warn'); }
        document.getElementById('hs-link').addEventListener('click', function () {
          if (extra.innerHTML) { extra.innerHTML = ''; return; }
          extra.innerHTML = linkSectionHtml(st.name, link, 'hl') + '<div class="card"><div class="title">📨 점주님께 보낼 안내문 (PIN 없이)</div><p class="muted small">PIN은 "PIN 초기화"를 누르면 새로 만들어져 그때 안내문에 함께 들어가요.</p><textarea id="hl-og" rows="10" class="guide-ta">' + esc(ownerGuideText(st.name, link, '')) + '</textarea><button type="button" class="btn wide" id="hl-og-copy">점주 안내문 복사</button></div>';
          bindLinkSection(st.name, link, 'hl');
          document.getElementById('hl-og-copy').addEventListener('click', function () { copyText(document.getElementById('hl-og').value, this); });
        });
        document.getElementById('hs-pin').addEventListener('click', function () {
          if (!confirm(st.name + ' 점주 번호(PIN)를 새로 만들까요?\n지금 번호는 더 이상 안 되고, 새 번호는 이 화면에 한 번만 보여요. 점주님께 꼭 전달해 주세요.')) return;
          hqRpc('hq_reset_pin', { p_store_id: id }).then(function (r) {
            extra.innerHTML = '<div class="card soft-card"><div class="title">🔐 새 점주 번호: <span class="pin-big">' + esc(r.pin) + '</span></div><div class="muted small">이 번호는 지금만 보여요. 아래 안내문에 들어 있으니 복사해서 점주님께 보내 주세요.</div></div><div class="card"><textarea id="hp-og" rows="10" class="guide-ta">' + esc(ownerGuideText(st.name, link, r.pin)) + '</textarea><button type="button" class="btn primary wide" id="hp-og-copy">점주 안내문 복사 (PIN 포함)</button></div>';
            document.getElementById('hp-og-copy').addEventListener('click', function () { copyText(document.getElementById('hp-og').value, this); });
            say('✓ 번호를 새로 만들었어요.', true);
          }).catch(function (e) { say(hqMsg(e), false); });
        });
        document.getElementById('hs-status').addEventListener('click', function () {
          var to = st.status === 'paused' ? 'active' : 'paused';
          if (!confirm(to === 'paused' ? st.name + ' 사용을 중지할까요?\n직원 링크와 점주 화면이 모두 닫혀요. 기록은 남고, 언제든 다시 켤 수 있어요.' : st.name + ' 사용을 다시 시작할까요?')) return;
          hqRpc('hq_update_store', { p_store_id: id, p_name: null, p_owner_name: null, p_owner_phone: null, p_status: to }).then(function () { viewHq('store', id, { d: date }); }).catch(function (e) { say(hqMsg(e), false); });
        });
        document.getElementById('hs-del').addEventListener('click', function () {
          var typed = prompt('정말 지우려면 지점 이름을 똑같이 적어 주세요.\n(직원·기록·추가사항이 모두 지워져요. 7일보다 오래된 기록이 있는 지점은 지워지지 않고, 대신 "사용 중지"를 쓰세요)');
          if (typed === null) return;
          hqRpc('hq_delete_store', { p_store_id: id, p_confirm_name: typed.trim() }).then(function (r) { alert(r.deleted + ' 지점을 지웠어요. (기록 ' + r.runs + ' · 직원 ' + r.staff + ' · 추가사항 ' + r.notes + ')'); location.hash = '#/hq'; }).catch(function (e) { say(hqMsg(e), false); });
        });
      });
    });
  }
  // 지점 등록: 이름·점주·연락처 → 코드 + 첫 PIN + 링크 + QR + 안내문이 한 번에
  function hqNewStore(body) {
    body.className = '';
    body.innerHTML = '<div class="card"><div class="title">➕ 새 지점 등록</div><p class="muted small">등록하면 지점 코드·직원용 링크·QR·첫 점주 번호(PIN)·점주 안내문이 한 번에 만들어져요. 점주가 직접 가입하는 방식은 없어요.</p>' +
      '<label class="field">지점 이름<input type="text" id="ns-name" class="text-input" placeholder="예: 떡기리 수원역점" maxlength="30"></label>' +
      '<label class="field">점주 이름 (선택)<input type="text" id="ns-owner" class="text-input" maxlength="20"></label>' +
      '<label class="field">점주 연락처 (선택)<input type="tel" id="ns-phone" class="text-input" maxlength="20"></label>' +
      '<button type="button" class="btn primary wide" id="ns-go">지점 등록</button><p id="ns-note" class="small"></p></div><div id="ns-result"></div>';
    document.getElementById('ns-go').addEventListener('click', function () {
      var nm = document.getElementById('ns-name').value.trim(), n = document.getElementById('ns-note'), btn = this;
      if (!nm) { n.textContent = '지점 이름을 적어 주세요.'; n.className = 'small warn'; return; }
      if (!confirm('"' + nm + '" 지점을 등록할까요?')) return;
      btn.disabled = true; n.textContent = '만드는 중…'; n.className = 'small muted';
      hqRpc('hq_create_store', { p_name: nm, p_owner_name: document.getElementById('ns-owner').value, p_owner_phone: document.getElementById('ns-phone').value }).then(function (r) {
        var link = storeLink(r.code);
        n.textContent = '✓ 등록됐어요.'; n.className = 'small ok-text';
        var h = '<div class="card soft-card"><div class="title">✅ ' + esc(r.name) + ' 등록 완료</div><table class="kv"><tr><th>지점 코드</th><td>' + esc(r.code) + '</td></tr><tr><th>첫 점주 번호</th><td><span class="pin-big">' + esc(r.pin) + '</span> <span class="muted small">— 지금만 보여요</span></td></tr><tr><th>직원용 링크</th><td style="word-break:break-all">' + esc(link) + '</td></tr></table></div>';
        h += '<div class="card"><div class="title">📨 점주님께 보낼 안내문 (링크 + PIN + 순서)</div><textarea id="ns-og" rows="12" class="guide-ta">' + esc(ownerGuideText(r.name, link, r.pin)) + '</textarea><button type="button" class="btn primary wide" id="ns-og-copy">점주 안내문 복사</button></div>';
        h += linkSectionHtml(r.name, link, 'nl');
        h += '<a class="btn wide" href="#/hq/store/' + r.id + '">이 지점 상세로</a>';
        document.getElementById('ns-result').innerHTML = h;
        bindLinkSection(r.name, link, 'nl');
        document.getElementById('ns-og-copy').addEventListener('click', function () { copyText(document.getElementById('ns-og').value, this); });
        document.getElementById('ns-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function (e) { btn.disabled = false; n.textContent = hqMsg(e); n.className = 'small warn'; });
    });
  }
  // 공통 매뉴얼: 목록 → 조각 편집(미리보기·저장) → 수정 이력(보기·되돌리기)
  function hqManualList(body) {
    return hqRpc('hq_manual_list').then(function (pages) {
      var h = '<div class="card soft-card"><strong>여기서 고치면 모든 지점에 바로 반영돼요.</strong><div class="muted small">저장할 때마다 이전 내용이 자동으로 남아, 각 조각의 "수정 이력"에서 언제든 되돌릴 수 있어요.</div></div>';
      function row(p) { return '<a class="card link" href="#/hq/manual/' + p.id + '"><div class="title">' + (p.section_kind === 'chapter' ? '' : '') + esc(p.title) + '</div><div class="sub">' + (p.group_name ? esc(p.group_name) + ' · ' : '') + p.len + '자 · 수정 ' + koDT(p.updated_at) + (p.updated_by ? ' (' + esc(p.updated_by) + ')' : '') + ' · 이력 ' + p.history_n + '</div></a>'; }
      var intro = pages.filter(function (p) { return p.section_kind === 'intro'; }), ch = pages.filter(function (p) { return p.section_kind === 'chapter'; }), ap = pages.filter(function (p) { return p.section_kind === 'appendix'; });
      if (intro.length) { h += '<p class="section-title">머리말</p>'; intro.forEach(function (p) { h += row(p); }); }
      h += '<p class="section-title">장 (' + ch.length + ')</p>'; ch.forEach(function (p) { h += row(p); });
      if (ap.length) { h += '<p class="section-title">별도 출력물 (체크리스트 원본 등)</p>'; ap.forEach(function (p) { h += row(p); }); }
      body.className = ''; body.innerHTML = h;
    });
  }
  function hqManualPage(body, id) {
    return hqRpc('hq_manual_page', { p_id: id }).then(function (p) {
      if (!p) throw new Error('page not found');
      var h = '<div class="crumb"><a href="#/hq/manual">공통 매뉴얼</a> › 편집</div>';
      h += '<label class="field">제목 <span class="muted small">' + (p.section_kind === 'chapter' ? '— "N장. 이름" 형식을 유지해 주세요' : p.section_kind === 'appendix' ? '— 맨 앞 기호(①②③…)는 체크리스트 연결에 쓰이니 유지' : '') + '</span><input type="text" id="mp-title" class="text-input" value="' + esc(p.title) + '"></label>';
      h += '<label class="field">본문 <span class="muted small">— 지금 매뉴얼과 같은 쓰기 방식: **굵은 소제목**, "- " 목록, "- [ ] " 체크 칸, "| 표 |"</span><textarea id="mp-body" rows="18" class="guide-ta mono">' + esc(p.body_md) + '</textarea></label>';
      h += '<label class="field">바꾼 이유 (선택, 이력에 남아요)<input type="text" id="mp-reason" class="text-input" placeholder="예: 포장 규격 변경" maxlength="60"></label>';
      h += '<div class="chapter-tools"><button type="button" class="btn" id="mp-preview">미리보기</button><button type="button" class="btn primary" id="mp-save">저장 (전 지점 반영)</button></div><p id="mp-note" class="small"></p><div id="mp-prev"></div>';
      h += '<p class="section-title">🕘 수정 이력 ' + p.history.length + '건 <span class="muted small">— 마지막 수정 ' + koDT(p.updated_at) + (p.updated_by ? ' (' + esc(p.updated_by) + ')' : '') + '</span></p>';
      if (!p.history.length) h += '<div class="card"><div class="muted small">아직 수정한 적이 없어요. 저장하면 지금 내용이 여기에 남습니다.</div></div>';
      p.history.forEach(function (x) {
        h += '<div class="card hist" data-id="' + x.id + '"><div class="title">' + koDT(x.saved_at) + ' <span class="muted small">' + esc(x.reason || '') + (x.saved_by ? ' · ' + esc(x.saved_by) : '') + ' · ' + x.len + '자</span></div><div class="chapter-tools"><button type="button" class="btn small-btn h-view">내용 보기</button><button type="button" class="btn small-btn h-restore">이 버전으로 되돌리기</button></div><div class="h-body"></div></div>';
      });
      body.className = ''; body.innerHTML = h;
      var note = document.getElementById('mp-note');
      function say(m, ok) { note.textContent = m; note.className = 'small ' + (ok ? 'ok-text' : 'warn'); }
      function prevHtml(title, md) { return '<div class="card"><div class="title">' + esc(title) + '</div><div class="content">' + renderBlocks(String(md || '').replace(/\r\n?/g, '\n').split('\n'), { num: 'hq' }) + '</div></div>'; }
      document.getElementById('mp-preview').addEventListener('click', function () { document.getElementById('mp-prev').innerHTML = prevHtml(document.getElementById('mp-title').value, document.getElementById('mp-body').value); });
      document.getElementById('mp-save').addEventListener('click', function () {
        var btn = this;
        if (!confirm('저장하면 모든 지점 직원 화면에 바로 반영돼요. 저장할까요?')) return;
        btn.disabled = true; say('저장 중…', true);
        hqRpc('hq_manual_save', { p_id: id, p_title: document.getElementById('mp-title').value, p_body_md: document.getElementById('mp-body').value, p_reason: document.getElementById('mp-reason').value })
          .then(function (r) { say(r.changed ? '✓ 저장했어요. 이전 내용은 수정 이력에 남았어요.' : '바뀐 내용이 없어요.', true); btn.disabled = false; if (r.changed) setTimeout(function () { viewHq('manual', id); }, 800); })
          .catch(function (e) { btn.disabled = false; say(hqMsg(e), false); });
      });
      body.querySelectorAll('.hist').forEach(function (card) {
        var hid = parseInt(card.dataset.id, 10);
        card.querySelector('.h-view').addEventListener('click', function () {
          var hb = card.querySelector('.h-body'); if (hb.innerHTML) { hb.innerHTML = ''; return; }
          hb.innerHTML = '<p class="muted small">불러오는 중…</p>';
          hqRpc('hq_manual_history_body', { p_history_id: hid }).then(function (x) { hb.innerHTML = prevHtml(x.title, x.body_md); }).catch(function (e) { hb.innerHTML = '<p class="warn small">' + esc(hqMsg(e)) + '</p>'; });
        });
        card.querySelector('.h-restore').addEventListener('click', function () {
          if (!confirm('이 버전으로 되돌릴까요? 지금 내용도 이력에 남으니 다시 되돌릴 수 있어요. 모든 지점에 바로 반영됩니다.')) return;
          hqRpc('hq_manual_restore', { p_history_id: hid }).then(function () { viewHq('manual', id); }).catch(function (e) { say(hqMsg(e), false); });
        });
      });
    });
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
    if (parts[0] === 'owner') return viewOwner(parts[1] || '', params);
    if (parts[0] === 'hq') return viewHq(parts[1] || '', parts[2], params);
    if (parts[0] === 'train') return viewTraining();
    if (parts[0] === 'todo') return viewTodo();
    if (parts[0] === 'search') { if (input) input.value = params.q || ''; return viewSearch(params.q); }
    viewHome();
  }
  document.getElementById('search-form').addEventListener('submit', function (e) { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(document.getElementById('search-input').value.trim()); });
  function viewNoCode(msg) {
    app.innerHTML = '<h1>매장 링크로 들어와 주세요</h1><div class="card"><div class="sub">' + esc(msg || '이 온라인북은 매장마다 전용 링크(QR)가 있어요. 점주님이 보내 준 링크나 매장에 붙은 QR로 열면 바로 이름을 고를 수 있습니다.') + '</div></div><p class="muted small" style="margin-top:30px"><a href="#/hq">본사 관리자</a></p>';
  }
  function isHqHash() { return /^#\/hq(\/|\?|$)/.test(location.hash || ''); }
  function init() {
    if (hqAuthFromHash()) history.replaceState(null, '', location.pathname + location.search + '#/hq');
    if (isHqHash()) { route(); return; }   // 본사 화면은 지점 코드 없이 연다
    var c = codeFromHash();
    if (c) {
      if (c !== CODE) { CODE = c; store.set('store_code', c); store.del('me'); }
      settingsCache = null;   // 링크로 다시 들어오면 목록·매뉴얼을 새로 받는다
      history.replaceState(null, '', location.pathname + location.search + '#/');
    }
    if (!CODE) { viewNoCode(); return; }
    app.innerHTML = '<div class="muted">불러오는 중…</div>';
    loadSettings().then(function (s) {
      if (!s.store) { store.del('store_code'); viewNoCode(s.offline ? '서버에 연결되지 않아요. 인터넷을 확인하고 링크를 다시 열어 주세요.' : '이 링크의 매장을 찾지 못했어요. 점주님께 새 링크를 받아 주세요.'); return; }
      setBook(s);
      if (!book.chapters.length) { app.innerHTML = empty('내용을 불러오지 못했어요.', '잠시 후 다시 열어 주세요.'); return; }
      route();
    });
  }
  window.addEventListener('hashchange', function () { if (codeFromHash() || /^#access_token=|^#error/.test(location.hash)) init(); else route(); });
  (function inAppBanner() {
    var ua = navigator.userAgent || '', isKakao = /KAKAOTALK/i.test(ua), isOther = /Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua);
    if (!isKakao && !isOther) return;
    var url = location.href.split('#')[0], bar = document.createElement('div');
    bar.className = 'inapp-banner';
    bar.innerHTML = '<span>앱 안 브라우저예요. 체크는 서버에 남지만 더 편하게 쓰려면</span>' + (isKakao ? '<a href="kakaotalk://web/openExternal?url=' + encodeURIComponent(url) + '">브라우저로 열기</a>' : '<span>메뉴에서 "브라우저로 열기"</span>');
    document.body.insertBefore(bar, document.body.firstChild);
  })();
  init();
})();
