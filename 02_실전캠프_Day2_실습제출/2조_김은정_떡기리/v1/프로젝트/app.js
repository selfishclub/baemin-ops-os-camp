/* 떡기리 신입직원 교육 온라인북 v1
 * - content.js 의 window.BOOK_MD (마크다운)를 읽어 화면으로 보여 준다.
 * - 체크 상태는 이 폰(localStorage)에만 남는다. 체크리스트는 날짜가 바뀌면 새로 시작.
 * - 빌드 도구 없음. index.html 을 열면 바로 동작.
 */
(function () {
  'use strict';

  // ---------- 저장 (실패해도 화면은 동작) ----------
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    keys: function (prefix) {
      var out = [];
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); } } catch (e) {}
      return out;
    }
  };
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- 마크다운 → 데이터 ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
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
        else {
          var n = m[1].match(/^(\d+)장\.\s*(.*)$/);
          cur.num = n ? parseInt(n[1], 10) : chapters.length + 1;
          cur.name = n ? n[2].trim() : m[1].trim();
          chapters.push(cur);
        }
        continue;
      }
      if (cur) cur.lines.push(l);
    }
    return { chapters: chapters, appendix: appendix };
  }

  function findAppendix(book, mark) {
    for (var i = 0; i < book.appendix.length; i++) if (book.appendix[i].title.indexOf(mark) === 0) return book.appendix[i];
    return null;
  }
  // 코드 블록 안의 "□ ..." 줄 → 체크 항목
  function checklistItems(sec) {
    var items = [], title = '';
    if (!sec) return { title: title, items: items };
    var inCode = false;
    sec.lines.forEach(function (l) {
      if (/^```/.test(l)) { inCode = !inCode; return; }
      if (!inCode) return;
      var m = l.match(/^\[(.+)\]\s*(.*)$/);
      if (m) { title = m[1] + (m[2] ? ' ' + m[2] : ''); return; }
      var c = l.match(/^□\s*(.+)$/);
      if (c) items.push(c[1].trim());
    });
    return { title: title, items: items };
  }
  // 12장 표 → 교육표
  function trainingRows(book) {
    var ch = book.chapters.filter(function (c) { return c.num === 12; })[0];
    var rows = [];
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
    book.chapters.forEach(function (c) {
      c.lines.forEach(function (l, idx) {
        if (l.indexOf('확인 필요') >= 0) out.push({ num: c.num, name: c.name, line: idx, text: plain(l) });
      });
    });
    return out;
  }

  // ---------- 블록 렌더 ----------
  function renderBlocks(lines, ctx) {
    var html = '', i = 0, l, j, buf, m;
    var dayKey = 'ch:' + ctx.num + ':' + today() + ':';
    function item(text, n) {
      var c = text.match(/^\[([ xX])\]\s*(.*)$/);
      if (c) {
        var key = dayKey + n, on = store.get(key) === '1';
        return '<li class="chk' + (on ? ' done' : '') + '" data-line="' + n + '"><label><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>' + inline(c[2]) + '</span></label></li>';
      }
      return '<li data-line="' + n + '">' + inline(text) + '</li>';
    }
    while (i < lines.length) {
      l = lines[i];
      if (/^```/.test(l)) {
        buf = []; j = i + 1;
        while (j < lines.length && !/^```/.test(lines[j])) { buf.push(lines[j]); j++; }
        html += '<pre data-line="' + i + '">' + esc(buf.join('\n')) + '</pre>'; i = j + 1; continue;
      }
      if (/^\|/.test(l)) {
        buf = []; j = i;
        while (j < lines.length && /^\|/.test(lines[j])) { buf.push({ t: lines[j], n: j }); j++; }
        html += '<table><tbody>';
        buf.forEach(function (row, idx) {
          if (/^\|\s*-+/.test(row.t)) return;
          var cells = row.t.split('|').slice(1, -1);
          var tag = idx === 0 ? 'th' : 'td';
          html += '<tr data-line="' + row.n + '">' + cells.map(function (c) { return '<' + tag + '>' + inline(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>';
        });
        html += '</tbody></table>'; i = j; continue;
      }
      if (/^[-*]\s+/.test(l)) {
        buf = []; j = i;
        while (j < lines.length && /^[-*]\s+/.test(lines[j])) { buf.push({ t: lines[j].replace(/^[-*]\s+/, ''), n: j }); j++; }
        html += '<ul>' + buf.map(function (b) { return item(b.t, b.n); }).join('') + '</ul>'; i = j; continue;
      }
      if (/^\d+\.\s+/.test(l)) {
        buf = []; j = i;
        while (j < lines.length && /^\d+\.\s+/.test(lines[j])) { buf.push({ t: lines[j].replace(/^\d+\.\s+/, ''), n: j }); j++; }
        html += '<ol>' + buf.map(function (b) { return '<li data-line="' + b.n + '">' + inline(b.t) + '</li>'; }).join('') + '</ol>'; i = j; continue;
      }
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
  var OPEN = checklistItems(findAppendix(book, '②'));
  var CLOSE = checklistItems(findAppendix(book, '③'));
  var TODOS = todoItems(book);
  var app = document.getElementById('app');

  function checkState(kind, count) {
    var done = 0;
    for (var i = 0; i < count; i++) if (store.get('check:' + kind + ':' + today() + ':' + i) === '1') done++;
    return done;
  }
  function chapterLink(num) {
    var c = book.chapters.filter(function (x) { return x.num === num; })[0];
    return c ? '#/ch/' + num : '#/';
  }

  function viewHome() {
    var o = checkState('open', OPEN.items.length), c = checkState('close', CLOSE.items.length);
    var h = '';
    h += '<h1>무엇을 찾으세요?</h1>';
    h += '<div class="grid2">';
    h += '<a class="big-btn" href="#/check/open">☀️ 오픈 체크리스트<small>' + o + '/' + OPEN.items.length + ' 완료</small></a>';
    h += '<a class="big-btn alt" href="#/check/close">🌙 마감 체크리스트<small>' + c + '/' + CLOSE.items.length + ' 완료</small></a>';
    h += '</div>';
    h += '<div class="grid2" style="margin-top:10px">';
    h += '<a class="big-btn soft" href="#/train">🎓 신입 교육표<small>1·3·7일차</small></a>';
    h += '<a class="big-btn soft" href="#/todo">📝 확인 필요<small>' + TODOS.length + '곳 · 사장님이 채울 것</small></a>';
    h += '</div>';
    h += '<p class="section-title">목차 — 장을 누르면 열려요</p><div class="toc">';
    book.chapters.forEach(function (ch) {
      var n = TODOS.filter(function (t) { return t.num === ch.num; }).length;
      h += '<a href="#/ch/' + ch.num + '"><span class="num">' + ch.num + '</span><span>' + esc(ch.name) + '</span>' + (n ? '<span class="badge">확인 필요 ' + n + '</span>' : '') + '</a>';
    });
    h += '</div>';
    app.innerHTML = h;
  }

  function viewChapter(num, hl) {
    var ch = book.chapters.filter(function (x) { return x.num === num; })[0];
    if (!ch) { app.innerHTML = empty('없는 장이에요.', '목차에서 다시 골라 주세요.'); return; }
    var idx = book.chapters.indexOf(ch);
    var prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
    var boxes = ch.lines.filter(function (l) { return /^[-*]\s+\[[ xX]\]/.test(l); }).length;
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › ' + ch.num + '장</div>';
    h += '<h1>' + ch.num + '장. ' + esc(ch.name) + '</h1>';
    if (boxes) {
      h += '<div class="chapter-tools"><span class="badge ok" id="ch-progress"></span><button class="btn danger" id="ch-reset">오늘 체크 지우기</button></div>';
    }
    h += '<div class="content" id="content">' + renderBlocks(ch.lines, { num: ch.num }) + '</div>';
    h += '<div class="grid2" style="margin-top:20px">';
    h += prev ? '<a class="big-btn soft" href="#/ch/' + prev.num + '">‹ ' + prev.num + '장 ' + esc(prev.name) + '</a>' : '<span></span>';
    h += next ? '<a class="big-btn soft" href="#/ch/' + next.num + '">' + next.num + '장 ' + esc(next.name) + ' ›</a>' : '<span></span>';
    h += '</div>';
    app.innerHTML = h;
    bindChapterChecks(ch.num);
    if (hl !== undefined) highlight(hl);
  }
  function bindChapterChecks(num) {
    var inputs = app.querySelectorAll('input[data-key]');
    function refresh() {
      var done = 0;
      inputs.forEach(function (inp) { if (inp.checked) done++; });
      var p = document.getElementById('ch-progress');
      if (p) p.textContent = '오늘 체크 ' + done + '/' + inputs.length;
    }
    inputs.forEach(function (inp) {
      inp.addEventListener('change', function () {
        store.set(inp.dataset.key, inp.checked ? '1' : '0');
        inp.closest('li').classList.toggle('done', inp.checked);
        refresh();
      });
    });
    var r = document.getElementById('ch-reset');
    if (r) r.addEventListener('click', function () {
      if (!confirm('오늘 이 장에서 체크한 것을 모두 지울까요?')) return;
      inputs.forEach(function (inp) { inp.checked = false; store.del(inp.dataset.key); inp.closest('li').classList.remove('done'); });
      refresh();
    });
    refresh();
  }
  function highlight(line) {
    var el = app.querySelector('[data-line="' + line + '"]');
    if (!el) return;
    el.classList.add('hl');
    setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  }

  function viewChecklist(kind) {
    var src = kind === 'open' ? OPEN : CLOSE;
    var title = kind === 'open' ? '☀️ 오픈 체크리스트' : '🌙 마감 체크리스트';
    var detail = kind === 'open' ? 4 : 10;
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 체크리스트</div>';
    h += '<h1>' + title + '</h1>';
    h += '<p class="muted">' + esc(src.title) + ' · ' + today() + ' · 자세한 순서는 <a href="' + chapterLink(detail) + '">' + detail + '장</a></p>';
    h += '<div class="done-msg" id="cl-done" hidden>👏 오늘 ' + (kind === 'open' ? '오픈' : '마감') + ' 항목을 모두 마쳤어요.</div>';
    h += '<div id="cl-progress" style="font-weight:700"></div><div class="progress-bar"><div id="cl-bar" style="width:0"></div></div>';
    h += '<ul class="checklist">';
    src.items.forEach(function (t, i) {
      var key = 'check:' + kind + ':' + today() + ':' + i, on = store.get(key) === '1';
      h += '<li class="' + (on ? 'done' : '') + '"><label><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>' + esc(t) + '</span></label></li>';
    });
    h += '</ul>';
    h += '<div class="chapter-tools"><button class="btn danger" id="cl-reset">오늘 체크 지우기</button><a class="btn" href="' + chapterLink(detail) + '">' + detail + '장 자세히 보기</a></div>';
    app.innerHTML = h;
    var inputs = app.querySelectorAll('input[data-key]');
    function refresh() {
      var done = 0; inputs.forEach(function (i) { if (i.checked) done++; });
      document.getElementById('cl-progress').textContent = done + '/' + inputs.length + ' 완료';
      document.getElementById('cl-bar').style.width = (inputs.length ? Math.round(done / inputs.length * 100) : 0) + '%';
      document.getElementById('cl-done').hidden = !(inputs.length && done === inputs.length);
    }
    inputs.forEach(function (inp) {
      inp.addEventListener('change', function () {
        store.set(inp.dataset.key, inp.checked ? '1' : '0');
        inp.closest('li').classList.toggle('done', inp.checked);
        refresh();
      });
    });
    document.getElementById('cl-reset').addEventListener('click', function () {
      if (!confirm('오늘 체크한 것을 모두 지울까요?')) return;
      inputs.forEach(function (inp) { inp.checked = false; store.del(inp.dataset.key); inp.closest('li').classList.remove('done'); });
      refresh();
    });
    refresh();
  }

  function viewTraining() {
    var rows = trainingRows(book);
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 신입 교육표</div>';
    h += '<h1>🎓 신입 교육표</h1><p class="muted">그날 읽을 장을 누르고, 다 읽으면 "읽었어요"에 체크하세요. 이 체크는 날짜가 바뀌어도 남습니다. 관리자 확인은 사수에게 말로 받으세요(v2에서 화면으로 만들 예정).</p>';
    if (!rows.length) h += empty('교육표가 없어요.', '12장에 표가 있는지 확인해 주세요.');
    rows.forEach(function (r, i) {
      var key = 'train:' + i, on = store.get(key) === '1';
      var links = '';
      var seen = {};
      r.content.replace(/(\d+)장/g, function (all, n) { if (!seen[n]) { seen[n] = 1; links += '<a href="' + chapterLink(parseInt(n, 10)) + '">' + n + '장</a>'; } return all; });
      h += '<div class="card train-row"><div class="day">' + esc(r.day) + '</div><div>' + inline(r.content) + '</div>';
      h += '<div class="links">' + links + '</div>';
      h += '<label class="read"><input type="checkbox" data-key="' + key + '"' + (on ? ' checked' : '') + '><span>읽었어요' + (on ? ' ✓' : '') + '</span></label>';
      h += '<div class="admin">' + esc(r.confirm) + '</div></div>';
    });
    app.innerHTML = h;
    app.querySelectorAll('input[data-key]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        store.set(inp.dataset.key, inp.checked ? '1' : '0');
        inp.nextElementSibling.textContent = '읽었어요' + (inp.checked ? ' ✓' : '');
      });
    });
  }

  function viewTodo() {
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 확인 필요</div>';
    h += '<h1>📝 확인 필요 ' + TODOS.length + '곳</h1><p class="muted">아직 매장 기준이 정해지지 않아 비워 둔 곳이에요. 직원은 사수나 사장님께 확인하고, 사장님은 <code>content.md</code>에서 채워 주세요.</p>';
    if (!TODOS.length) h += empty('확인 필요가 없어요.', '모든 항목이 채워졌습니다.');
    TODOS.forEach(function (t) {
      h += '<a class="card link result" href="#/ch/' + t.num + '?hl=' + t.line + '"><div class="where">' + t.num + '장 ' + esc(t.name) + '</div><div class="snip">' + inline(t.text) + '</div></a>';
    });
    app.innerHTML = h;
  }

  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
  function viewSearch(q) {
    q = (q || '').trim();
    var h = '<div class="crumb"><a href="#/">첫 화면</a> › 검색</div>';
    if (!q) { h += empty('검색어를 넣어 주세요.', '예: 라벨, 냉동, 마감, 알레르기'); app.innerHTML = h; return; }
    var nq = norm(q), results = [];
    book.chapters.forEach(function (c) {
      c.lines.forEach(function (l, idx) {
        var p = plain(l);
        if (p && norm(p).indexOf(nq) >= 0) results.push({ num: c.num, name: c.name, line: idx, text: p });
      });
    });
    h += '<h1>"' + esc(q) + '" 검색 결과 ' + results.length + '건</h1>';
    if (!results.length) {
      h += empty('찾는 내용이 없어요.', '사수나 사장님께 물어보세요. 다른 말로 다시 검색해 볼 수도 있어요.');
    }
    results.forEach(function (r) {
      var text = esc(r.text);
      var re = new RegExp(q.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'; }).join(''), 'i');
      text = text.replace(re, function (m0) { return '<mark>' + m0 + '</mark>'; });
      h += '<a class="card link result" href="#/ch/' + r.num + '?hl=' + r.line + '"><div class="where">' + r.num + '장 ' + esc(r.name) + '</div><div class="snip">' + text + '</div></a>';
    });
    app.innerHTML = h;
  }

  function empty(title, sub) { return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(sub) + '</div>'; }

  // ---------- 라우터 ----------
  function route() {
    var hash = location.hash || '#/';
    var path = hash.slice(1), query = '';
    var qi = path.indexOf('?');
    if (qi >= 0) { query = path.slice(qi + 1); path = path.slice(0, qi); }
    var params = {};
    query.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    var parts = path.split('/').filter(Boolean);
    var input = document.getElementById('search-input');
    if (parts[0] !== 'search' && input) input.value = '';
    window.scrollTo(0, 0);
    if (!parts.length) return viewHome();
    if (parts[0] === 'ch') return viewChapter(parseInt(parts[1], 10), params.hl !== undefined ? parseInt(params.hl, 10) : undefined);
    if (parts[0] === 'check') return viewChecklist(parts[1] === 'close' ? 'close' : 'open');
    if (parts[0] === 'train') return viewTraining();
    if (parts[0] === 'todo') return viewTodo();
    if (parts[0] === 'search') { if (input) input.value = params.q || ''; return viewSearch(params.q); }
    viewHome();
  }
  document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = document.getElementById('search-input').value.trim();
    location.hash = '#/search?q=' + encodeURIComponent(q);
  });
  window.addEventListener('hashchange', route);
  if (!book.chapters.length) {
    app.innerHTML = empty('내용을 불러오지 못했어요.', 'content.js 가 같은 폴더에 있는지 확인해 주세요.');
  } else {
    route();
  }
})();
