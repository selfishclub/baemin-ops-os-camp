/* 떡기리 신입직원 교육 온라인북 v3 (다점포)
 * v1 = 12장 매뉴얼·검색·체크리스트(폰 저장)·교육표·확인 필요
 * v2 = 체크리스트를 서버(Supabase)에 저장 + 사장 점검표
 * v3 = 지점 전용 링크(#/s/코드)로 들어와 이름만 고름. 앱은 표를 직접 읽지 않고 "지점 코드를 받는 서버 함수"만 부른다.
 *      매뉴얼 = 본사 공통(DB) + 우리 지점 추가사항(DB). 점주·본사 화면은 따로(3·4단계).
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
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
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
    function isHeading(l) { return /^\*\*[^*]+\*\*/.test(l) || /^#{1,6}\s/.test(l); }
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

  // 점주 화면 — 3단계에서 만든다. 지금은 안내만.
  function viewOwner() {
    var s = settingsCache || emptyBundle();
    app.innerHTML = '<div class="crumb"><a href="#/">첫 화면</a> › 점주</div><h1>📋 점주 화면</h1>' +
      '<div class="card"><div class="title">' + esc(singleStore(s) || '매장') + '</div><div class="sub">점주 화면(점검표·직원·우리 지점 추가사항·PIN)은 다음 단계에서 열려요. 지금은 기존 주소의 사장 점검표를 그대로 쓰시면 됩니다. 이 링크로 남긴 기록도 거기에 똑같이 보여요.</div></div>';
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
    if (parts[0] === 'owner') return viewOwner();
    if (parts[0] === 'train') return viewTraining();
    if (parts[0] === 'todo') return viewTodo();
    if (parts[0] === 'search') { if (input) input.value = params.q || ''; return viewSearch(params.q); }
    viewHome();
  }
  document.getElementById('search-form').addEventListener('submit', function (e) { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(document.getElementById('search-input').value.trim()); });
  function viewNoCode(msg) {
    app.innerHTML = '<h1>매장 링크로 들어와 주세요</h1><div class="card"><div class="sub">' + esc(msg || '이 온라인북은 매장마다 전용 링크(QR)가 있어요. 점주님이 보내 준 링크나 매장에 붙은 QR로 열면 바로 이름을 고를 수 있습니다.') + '</div></div>';
  }
  function init() {
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
  window.addEventListener('hashchange', function () { if (codeFromHash()) init(); else route(); });
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
